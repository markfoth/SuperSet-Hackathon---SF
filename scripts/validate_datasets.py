#!/usr/bin/env python
"""Validate processed data against the manifest. Exit 1 on any error.

Checks: manifest completeness, processed files exist, GeoJSON structure,
plausible study-area coordinates, neighbourhood count and stable ids,
manifest feature counts, metric coverage (explicit nulls, never missing keys),
basic spatial joins and file sizes. Also used by tests/test_data.py.

Usage:
    .venv/Scripts/python.exe scripts/validate_datasets.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import PROCESSED_DIR, REPO_ROOT, REQUIRED_FIELDS, STUDY_BBOX, load_manifest  # noqa: E402

MAX_FILE_BYTES = 3_000_000
VALID_STATUS = {"processed", "downloaded", "blocked", "deferred"}
BBOX_TOLERANCE = 0.02  # degrees; route shapes are clipped to the box


def load(name: str) -> dict:
    return json.loads((PROCESSED_DIR / name).read_text(encoding="utf-8"))


def iter_coords(geom: dict):
    def walk(c):
        if isinstance(c[0], (int, float)):
            yield c
        else:
            for x in c:
                yield from walk(x)
    if geom and geom.get("coordinates"):
        yield from walk(geom["coordinates"])


def check_manifest() -> list[str]:
    errors = []
    manifest = load_manifest()
    if not manifest:
        return ["manifest.yaml missing or empty"]
    for key, entry in manifest.items():
        for field in REQUIRED_FIELDS:
            if field not in entry:
                errors.append(f"manifest[{key}] missing field {field}")
        if entry.get("status") not in VALID_STATUS:
            errors.append(f"manifest[{key}] invalid status {entry.get('status')!r}")
        if entry.get("status") == "processed":
            for p in entry.get("processed_path") or []:
                path = REPO_ROOT / p.split(" ")[0]
                if not path.exists():
                    errors.append(f"manifest[{key}] processed_path does not exist: {p}")
            if not entry.get("resolution"):
                errors.append(f"manifest[{key}] has no resolution")
    return errors


def check_geojson_files() -> list[str]:
    errors = []
    w, s, e, n = STUDY_BBOX
    t = BBOX_TOLERANCE
    for path in sorted(PROCESSED_DIR.glob("*.geojson")):
        if path.stat().st_size > MAX_FILE_BYTES:
            errors.append(f"{path.name} is {path.stat().st_size / 1e6:.1f} MB (> {MAX_FILE_BYTES / 1e6:.0f} MB)")
        fc = json.loads(path.read_text(encoding="utf-8"))
        if fc.get("type") != "FeatureCollection" or not isinstance(fc.get("features"), list):
            errors.append(f"{path.name} is not a FeatureCollection")
            continue
        if not fc["features"]:
            errors.append(f"{path.name} has no features")
        bad = 0
        for f in fc["features"]:
            g = f.get("geometry")
            if not g or g.get("type") not in {"Point", "LineString", "MultiLineString", "Polygon", "MultiPolygon",
                                              "GeometryCollection"}:
                errors.append(f"{path.name}: feature with missing/unknown geometry")
                break
            for lon, lat in iter_coords(g):
                if not (w - t <= lon <= e + t and s - t <= lat <= n + t):
                    bad += 1
                    break
        if bad:
            errors.append(f"{path.name}: {bad} features outside the study area (lat/lon swapped or wrong CRS?)")
    return errors


def check_feature_counts() -> list[str]:
    errors = []
    for key, entry in load_manifest().items():
        paths = entry.get("processed_path") or []
        if entry.get("status") != "processed" or not paths or entry.get("feature_count") is None:
            continue
        first = REPO_ROOT / paths[0]
        if first.suffix != ".geojson" or not first.exists():
            continue
        actual = len(json.loads(first.read_text(encoding="utf-8"))["features"])
        # Several entries list a summary file first; only compare where the geojson is the counted file.
        if key in {"neighbourhoods", "cycling_network", "parks", "hills", "elevation", "groceries", "transit",
                   "commute_fixtures", "acs_tracts", "calenviroscreen5", "area_cells", "street_gradients"} and actual != entry["feature_count"]:
            errors.append(f"manifest[{key}] feature_count {entry['feature_count']} != {actual} in {first.name}")
    return errors


def check_neighbourhoods() -> list[str]:
    errors = []
    nh = load("neighbourhoods.geojson")["features"]
    ids = [f["properties"]["id"] for f in nh]
    if len(nh) != 41:
        errors.append(f"expected 41 neighbourhoods, found {len(nh)}")
    if len(set(ids)) != len(ids):
        errors.append("duplicate neighbourhood ids")
    for f in nh:
        p = f["properties"]
        if not p.get("name") or not p.get("area_km2") or p["area_km2"] <= 0:
            errors.append(f"neighbourhood {p.get('id')} missing name/area")
    id_set = set(ids)
    for name, key in [("neighbourhood_metrics.json", "neighbourhoods"), ("neighbourhood_samples.json", "neighbourhoods"),
                      ("crime_by_neighbourhood.json", "neighbourhoods"), ("neighbourhood_content.json", "neighbourhoods")]:
        if not (PROCESSED_DIR / name).exists():
            errors.append(f"{name} missing")
            continue
        keys = set(load(name)[key])
        if keys != id_set:
            errors.append(f"{name} ids differ from neighbourhoods.geojson: missing {sorted(id_set - keys)[:5]}, "
                          f"extra {sorted(keys - id_set)[:5]}")
    return errors


def check_metrics() -> list[str]:
    errors = []
    m = load("neighbourhood_metrics.json")["neighbourhoods"]
    blocks = ("crime", "parks", "cycling", "transit", "hills", "groceries", "collisions", "rents")
    for nid, v in m.items():
        for b in blocks:
            if b not in v:
                errors.append(f"metrics[{nid}] has no '{b}' key (missing data must be an explicit null)")
        for share_path in (("parks", "share_within_400m"), ("transit", "share_within_800m_rail"),
                           ("groceries", "share_within_800m_supermarket")):
            block = v.get(share_path[0])
            if block and block.get(share_path[1]) is not None and not 0 <= block[share_path[1]] <= 1:
                errors.append(f"metrics[{nid}].{'.'.join(share_path)} outside 0..1")
        crime = v.get("crime")
        if crime and crime["total"] < 0:
            errors.append(f"metrics[{nid}] negative crime total")
    return errors


def check_spatial_joins() -> list[str]:
    """Known points must fall in the expected neighbourhood."""
    from shapely.geometry import Point, shape
    known = {
        "mission": (37.7524, -122.4184),                       # 24th St Mission BART
        "financial-district-south-beach": (37.7946, -122.3999),  # default FiDi workplace
        "twin-peaks": (37.7544, -122.4477),
        "outer-richmond": (37.7800, -122.4900),
    }
    nh = {f["properties"]["id"]: shape(f["geometry"]) for f in load("neighbourhoods.geojson")["features"]}
    errors = []
    for nid, (lat, lon) in known.items():
        hit = [k for k, g in nh.items() if g.contains(Point(lon, lat))]
        if hit != [nid]:
            errors.append(f"point {lat},{lon} expected in {nid}, found {hit}")
    return errors


def check_commute_fixtures() -> list[str]:
    from shapely.geometry import shape
    errors = []
    feats = load("commute_fixtures.geojson")["features"]
    groups: dict[tuple, dict[int, float]] = {}
    for f in feats:
        p = f["properties"]
        if "label" not in p or "synthetic" not in p:
            errors.append("commute fixture without label/synthetic flag")
        groups.setdefault((p["workplace"], p["mode"]), {})[p["minutes"]] = shape(f["geometry"]).area
    for k, areas in groups.items():
        mins = sorted(areas)
        if any(areas[a] > areas[b] * 1.001 for a, b in zip(mins, mins[1:])):
            errors.append(f"commute fixture {k} areas not increasing with minutes")
    if {w for w, _ in groups} != {"sfo", "fidi"}:
        errors.append("commute fixtures must cover both default workplaces")
    return errors


def check_photos() -> list[str]:
    """Every neighbourhood photo has a local optimised copy and credit/licence metadata."""
    errors = []
    content = load("neighbourhood_content.json")["neighbourhoods"]
    for nid, c in content.items():
        if not c["photos"]:
            continue
        ph = c["photos"][0]
        for field in ("url", "page", "credit", "licence"):
            if not ph.get(field):
                errors.append(f"photo for {nid} missing {field}")
        local = ph.get("local")
        if not local or not (REPO_ROOT / "public" / local).exists():
            errors.append(f"photo for {nid} has no local copy ({local})")
    pages = [c["photos"][0]["page"] for c in content.values() if c["photos"]]
    if len(pages) != len(set(pages)):
        errors.append("the same photo is used for more than one neighbourhood")
    return errors


def check_timetables() -> list[str]:
    """A timetable that doesn't cover the target date must say so — never presented as current."""
    errors = []
    for key, e in load_manifest().items():
        if key.startswith("gtfs_") and e.get("status") == "processed":
            if "covers_target_date" not in e:
                errors.append(f"manifest[{key}] has no covers_target_date")
            elif not e["covers_target_date"] and "EXPIRED" not in (e.get("measurement_period") or ""):
                errors.append(f"manifest[{key}] is out of date but not labelled EXPIRED")
    fx = load("commute_fixtures.geojson")
    expired = fx["meta"].get("expired_feeds", [])
    for f in fx["features"]:
        if f["properties"]["mode"] == "transit" and expired and "out-of-date" not in f["properties"]["label"]:
            errors.append("transit fixture label does not mention its out-of-date timetable")
            break
    return errors


CHECKS = [check_manifest, check_geojson_files, check_feature_counts, check_neighbourhoods, check_metrics,
          check_spatial_joins, check_commute_fixtures, check_photos, check_timetables]


def main() -> int:
    all_errors = []
    for check in CHECKS:
        errs = check()
        print(f"{'OK  ' if not errs else 'FAIL'} {check.__name__}")
        for e in errs:
            print(f"     - {e}")
        all_errors += errs
    print(f"\n{len(all_errors)} error(s)")
    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main())
