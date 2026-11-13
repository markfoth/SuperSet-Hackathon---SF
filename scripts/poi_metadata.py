"""Preserve bounded, source-supplied POI contact details without guessing businesses."""
from __future__ import annotations

from urllib.parse import urlsplit
from functools import lru_cache
from pathlib import Path
import json


@lru_cache(maxsize=1)
def verified_websites() -> dict:
    path = Path(__file__).resolve().parents[1] / "data" / "sf" / "content" / "poi_verified_websites.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def http_url(value: object) -> str | None:
    if not isinstance(value, str) or len(value) > 2048:
        return None
    value = value.strip()
    try:
        parsed = urlsplit(value)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
            return None
        if any(ord(c) < 32 for c in value):
            return None
        return value
    except ValueError:
        return None


def poi_metadata(element: dict, snapshot: str | None = None) -> dict:
    tags = element.get("tags", {})
    osm_id = f"{element['type']}/{element['id']}"
    street = " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")]))
    address = ", ".join(filter(None, [street, tags.get("addr:unit"), tags.get("addr:city"), tags.get("addr:postcode")]))
    website = http_url(tags.get("website")) or http_url(tags.get("contact:website"))
    verified = verified_websites().get(osm_id, {})
    if any(tags.get(tag) != verified.get(field) for tag, field in
           (("name", "name"), ("addr:street", "street"), ("addr:housenumber", "housenumber"))):
        verified = {}
    return {
        "osm_id": osm_id,
        "source_url": f"https://www.openstreetmap.org/{osm_id}",
        "website": website,
        "official_website": http_url(verified.get("url")),
        "website_verified_on": verified.get("verified_on"),
        "address": address or None,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "opening_hours": tags.get("opening_hours"),
        "wheelchair": tags.get("wheelchair"),
        "source_checked": tags.get("check_date") or tags.get("check_date:website"),
        "snapshot": snapshot,
    }
