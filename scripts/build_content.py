#!/usr/bin/env python
"""Build data/sf/processed/neighbourhood_content.json from the editorial source
(data/sf/content/neighbourhoods.yaml) plus one freely licensed photo per
neighbourhood from Wikimedia Commons.

Photos: the lead image of the first candidate Wikipedia article whose image
is on Commons under a free licence (CC BY / CC BY-SA / CC0 / public domain)
and is not a map or locator. Credit, licence and source page are recorded per
photo. Images are hotlinked as Commons thumbnails, not copied into the repo.
Lookups are cached in data/sf/raw/_wikimedia_cache.json so reruns are offline.

Usage:
    .venv/Scripts/python.exe scripts/build_content.py [--refresh]
"""
from __future__ import annotations

import argparse
import io
import json
import re
import sys
import time
from html import unescape
from pathlib import Path

import requests
import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import DATA_DIR, PROCESSED_DIR, RAW_DIR, REPO_ROOT, USER_AGENT, get_logger, rel, today, update_manifest, write_json  # noqa: E402

log = get_logger("content")
API = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
CACHE = RAW_DIR / "_wikimedia_cache.json"
FREE = re.compile(r"^(CC BY(-SA)?( \d\.\d)?|CC0|Public domain|PD.*)", re.I)
NOT_PHOTO = re.compile(r"(map|locator|location|logo|seal|flag|\.svg$)", re.I)


def get(url: str, params: dict) -> dict:
    for attempt in range(3):
        try:
            r = requests.get(url, params=params | {"format": "json", "formatversion": 2},
                             headers={"User-Agent": USER_AGENT}, timeout=30)
            r.raise_for_status()
            return r.json()
        except requests.RequestException as exc:
            log.warning("%s (%s), retrying", url, exc)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"failed: {url}")


def strip_html(s: str | None) -> str | None:
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", "", s))).strip() if s else None


def lookup_photo(title: str) -> dict | None:
    """Lead image of a Wikipedia article, or a named Commons file when `title` starts with 'File:'."""
    if title.startswith("File:"):
        fname, via = title[5:], "Commons (hand-picked)"
    else:
        page = get(API, {"action": "query", "prop": "pageimages", "piprop": "name", "titles": title, "redirects": 1})
        pages = page.get("query", {}).get("pages", [])
        if not pages or "pageimage" not in pages[0]:
            return None
        if pages[0]["title"].startswith("List of"):
            return None  # the article redirected to a generic list page: its image isn't this neighbourhood
        fname, via = pages[0]["pageimage"], f"Wikipedia: {pages[0]['title']}"
        if NOT_PHOTO.search(fname):
            return None
    info = get(COMMONS, {"action": "query", "prop": "imageinfo", "titles": f"File:{fname}",
                         "iiprop": "url|extmetadata", "iiurlwidth": 960})
    ipages = info.get("query", {}).get("pages", [])
    if not ipages or "imageinfo" not in ipages[0]:
        return None  # not on Commons (e.g. a local non-free file)
    ii = ipages[0]["imageinfo"][0]
    md = ii.get("extmetadata", {})
    licence = (md.get("LicenseShortName") or {}).get("value", "")
    if not FREE.match(licence):
        return None
    return {
        "url": ii.get("thumburl") or ii["url"], "page": ii.get("descriptionurl"),
        "credit": strip_html((md.get("Artist") or {}).get("value")) or "Unknown author",
        "licence": licence, "licence_url": (md.get("LicenseUrl") or {}).get("value"),
        "title": strip_html((md.get("ObjectName") or {}).get("value")) or fname,
        "via": via,
    }


IMAGE_DIR = REPO_ROOT / "public" / "images" / "neighbourhoods"
MAX_WIDTH = 800


def cache_image(nid: str, photo: dict, refresh: bool) -> dict:
    """Store a resized local copy (licences permit redistribution with attribution, which travels with it)."""
    from PIL import Image
    dest = IMAGE_DIR / f"{nid}.jpg"
    meta = {"local": f"images/neighbourhoods/{nid}.jpg",
            "local_note": f"resized to max {MAX_WIDTH} px wide and re-encoded as JPEG from the Commons original"}
    if dest.exists() and not refresh and photo.get("local_source") == photo["url"]:
        return meta | {"local_source": photo["url"], "local_bytes": dest.stat().st_size}
    for attempt in range(3):
        try:
            r = requests.get(photo["url"], headers={"User-Agent": USER_AGENT}, timeout=60)
            r.raise_for_status()
            break
        except requests.RequestException as exc:
            log.warning("%s: image download failed (%s)", nid, exc)
            time.sleep(10 * (attempt + 1))
    else:
        return {}
    img = Image.open(io.BytesIO(r.content)).convert("RGB")
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    img.save(dest, "JPEG", quality=74, optimize=True, progressive=True)
    time.sleep(1.0)
    return meta | {"local_source": photo["url"], "local_bytes": dest.stat().st_size, "width": img.width, "height": img.height}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--refresh", action="store_true", help="ignore the Wikimedia cache")
    args = ap.parse_args(argv)
    src = yaml.safe_load((DATA_DIR / "content" / "neighbourhoods.yaml").read_text(encoding="utf-8"))
    nh = json.loads((PROCESSED_DIR / "neighbourhoods.geojson").read_text(encoding="utf-8"))["features"]
    names = {f["properties"]["id"]: f["properties"]["name"] for f in nh}
    missing = set(names) - set(src)
    if missing:
        log.warning("no editorial content for: %s", sorted(missing))
    cache = {} if args.refresh or not CACHE.exists() else json.loads(CACHE.read_text(encoding="utf-8"))
    path = PROCESSED_DIR / "neighbourhood_content.json"
    previous_photos = {}
    if path.exists():
        for k, v in json.loads(path.read_text(encoding="utf-8"))["neighbourhoods"].items():
            if v.get("photos"):
                previous_photos[k] = v["photos"][0]
    out = {}
    for nid, name in sorted(names.items()):
        entry = src.get(nid, {})
        photo = None
        for title in ([entry["commons"]] if entry.get("commons") else []) + entry.get("wiki", []):
            if title not in cache:
                try:
                    cache[title] = lookup_photo(title)
                except RuntimeError as exc:
                    log.warning("%s: %s", title, exc)
                    continue
                time.sleep(1.5)
            if cache[title]:
                photo = dict(cache[title])
                break
        if photo:
            previous = previous_photos.get(nid, {})
            photo |= cache_image(nid, photo | {"local_source": previous.get("local_source")}, args.refresh)
        out[nid] = {
            "name": name, "description": entry.get("description"), "tags": entry.get("tags", []),
            "residential": entry.get("residential", True),
            "photos": [photo] if photo else [],
            "content_status": "draft" if entry else "missing",
        }
        log.info("%-32s photo: %s", nid, f"{photo['licence']} — {photo['credit'][:40]}" if photo else "none")
    CACHE.write_text(json.dumps(cache, indent=1), encoding="utf-8")
    write_json(path, {"meta": {"generated": today(),
                               "photos": "Wikimedia Commons, free licences only; credit and licence per photo must be shown. "
                                         "`local` is an optimised copy in public/images; `url` the Commons thumbnail fallback",
                               "descriptions": "Editorial drafts (character and built form only); review before publishing"},
                      "neighbourhoods": out})
    with_photo = sum(1 for v in out.values() if v["photos"])
    local = sum(1 for v in out.values() if v["photos"] and v["photos"][0].get("local"))
    local_kb = sum(v["photos"][0].get("local_bytes", 0) for v in out.values() if v["photos"]) / 1024
    update_manifest("neighbourhood_content", {
        "source": "Common Ground editorial drafts (data/sf/content/neighbourhoods.yaml) + Wikimedia Commons photos",
        "source_url": "https://commons.wikimedia.org", "licence": "Text: project's own. Photos: per-photo CC BY / CC BY-SA / CC0 / PD — attribution shown in UI",
        "downloaded_at": today(), "measurement_period": "n/a", "resolution": f"{len(out)} SF neighbourhood / Peninsula jurisdiction groups",
        "feature_count": len(out), "raw_path": "data/sf/content/neighbourhoods.yaml",
        "processed_path": [rel(path), "public/images/neighbourhoods/"], "script": "scripts/build_content.py",
        "refresh": "as needed",
        "limitations": f"{with_photo}/{len(out)} groups have a photo; {local} cached locally ({local_kb:.0f} KB, "
                       f"max {MAX_WIDTH} px). Descriptions are drafts and avoid demographic claims. Photos are mostly "
                       "Wikipedia lead images (3 hand-picked); some show a landmark rather than streets.",
        "status": "processed",
    })
    log.info("%d/%d neighbourhoods with a photo", with_photo, len(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
