"""Build bounded, deduplicated event context; never downloads during app requests.

Rebuild from cached inputs: python -X utf8 scripts/build_event_details.py
Refresh the same recorded three-year crash window: add --refresh-crashes.
Police input is refreshed by download_datasets.py --only police_incidents.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timezone
import json
import math
import re

import subprocess

from _common import RAW_DIR, PROCESSED_DIR, REPO_ROOT, SF_BBOX, read_download_log, rel, update_manifest, write_json
from event_semantics import CRIME_GROUPS, crime_groups, crash_flags

CRASH_FILE = RAW_DIR / "regional" / "injury_crashes_detail.json"
POLICE_URL = "https://data.sf.gov/d/wg3w-h783"
CRASH_URL = "https://data.sf.gov/d/ubvf-ztfx"

def coordinate(row: dict, lat: str, lon: str):
    try:
        y, x = float(row[lat]), float(row[lon])
        w, s, e, n = SF_BBOX
        return (x, y) if math.isfinite(x) and math.isfinite(y) and w <= x <= e and s <= y <= n else None
    except (KeyError, TypeError, ValueError):
        return None


def casualty(value):
    try:
        n = float(value)
        return int(n) if n >= 0 and n.is_integer() else None
    except (ValueError, TypeError):
        return None


def build_police(rows: list[dict]):
    """One incident, one published coordinate; categories are a union across offence rows."""
    incidents = {}
    conflicts = set()
    missing_category_ids = set()
    for row in sorted(rows, key=lambda r: str(r.get("row_id", ""))):
        if row.get("report_type_code") in {"II", "VI"} and not isinstance(row.get("incident_category"), str):
            missing_category_ids.add(row.get("incident_id"))
        if row.get("report_type_code") not in {"II", "VI"} or not crime_groups(row.get("incident_category"), row.get("incident_subcategory")):
            continue
        key = row.get("incident_id")
        if not key:
            continue
        xy = coordinate(row, "latitude", "longitude")
        if key not in incidents:
            incidents[key] = {"xy": xy, "date": row.get("incident_datetime", "")[:7], "categories": set(), "flags": 0, "source_neighbourhood": row.get("analysis_neighborhood")}
        event = incidents[key]
        if event["xy"] is None and xy is not None:
            event["xy"] = xy
        elif xy is not None and event["xy"] != xy:
            conflicts.add(key)
        event["categories"].add(row["incident_category"])
        groups = crime_groups(row.get("incident_category"), row.get("incident_subcategory"))
        event["flags"] |= sum(1 << i for i, g in enumerate(["violent", "property", "vehicle_breakin", "drug", "other"]) if g in groups)
    return list(incidents.values()), {"unique_events": len(incidents), "conflicting_published_locations": len(conflicts), "missing_or_outside_coordinates": sum(x["xy"] is None for x in incidents.values()), "missing_category_only_incidents_excluded": len(missing_category_ids - incidents.keys())}


def build_crashes(rows: list[dict]):
    crashes = {}
    for row in sorted(rows, key=lambda r: str(r.get("unique_id", ""))):
        key = row.get("case_id_pkey")
        if not key:
            raise ValueError("Refresh crash input: a true case_id_pkey is required, not a joined party/victim row ID")
        if key in crashes:
            # A repeated crash row never multiplies casualty totals.
            continue
        crashes[key] = {"xy": coordinate(row, "tb_latitude", "tb_longitude"), "date": row.get("collision_datetime", "")[:7],
                        "categories": {row.get("dph_col_grp_description") or "Unknown/Not Stated"}, "flags": crash_flags(row),
                        "injured": casualty(row.get("number_injured")), "killed": casualty(row.get("number_killed"))}
    return list(crashes.values()), {"unique_events": len(crashes), "duplicate_rows_removed": len(rows) - len(crashes), "missing_or_outside_coordinates": sum(x["xy"] is None for x in crashes.values())}


def compact(events, meta):
    valid = [e for e in events if e["xy"] and len(e["date"]) == 7]
    points = sorted({e["xy"] for e in valid})
    indexed = subprocess.run(["node", str(REPO_ROOT / "scripts" / "event_h3.mjs")], input=json.dumps(points), text=True, encoding="utf-8", capture_output=True, check=True)
    h3_data = json.loads(indexed.stdout)
    locations = [[x, y, cell] for (x, y), cell in zip(points, h3_data["cells"])]
    point_index = {xy: i for i, xy in enumerate(points)}
    months = sorted({e["date"] for e in valid})
    month_index = {m: i for i, m in enumerate(months)}
    categories = sorted({c for e in valid for c in e["categories"]})
    category_index = {c: i for i, c in enumerate(categories)}
    groups = defaultdict(lambda: [0, 0, 0, False, False])
    for e in valid:
        key = (point_index[e["xy"]], month_index[e["date"]], tuple(sorted(category_index[c] for c in e["categories"])), e["flags"])
        g = groups[key]
        g[0] += 1
        for i, field in [(1, "injured"), (2, "killed")]:
            if e.get(field) is None:
                g[i + 2] = True
            else:
                g[i] += e[field]
    records = [[p, m, list(c), f, v[0], None if v[3] else v[1], None if v[4] else v[2]] for (p, m, c, f), v in sorted(groups.items())]
    return {"version": 1, "meta": meta | {"mapped_events": len(valid), "location_count": len(points), "record_fields": ["location", "month", "categories", "flags", "count", "people_injured_nonfatal", "fatalities"]},
            "locations": locations, "months": months, "categories": categories, "records": records, "cell_areas_km2": h3_data["areas"]}


def refresh_crashes(start, end):
    import requests
    fields = "unique_id,case_id_pkey,collision_datetime,collision_severity,dph_col_grp,dph_col_grp_description,number_killed,number_injured,tb_latitude,tb_longitude,geocode_location,primary_rd,secondary_rd"
    params = {"$select": fields, "$where": f"collision_datetime >= '{start}T00:00:00' AND collision_datetime < '{end}T00:00:00'", "$order": "unique_id", "$limit": 10000}
    response = requests.get("https://data.sf.gov/resource/ubvf-ztfx.json", params=params, timeout=90)
    response.raise_for_status()
    rows = response.json()
    if not 1000 <= len(rows) < 10000:
        raise ValueError("Expected a bounded three-year subset below 10,000 crashes; inspect pagination/window before refreshing")
    CRASH_FILE.parent.mkdir(parents=True, exist_ok=True)
    write_json(CRASH_FILE, rows)
    write_json(CRASH_FILE.with_suffix(".meta.json"), {"retrieved_at": datetime.now(timezone.utc).isoformat(), "url": response.url, "rows": len(rows)})


def rebuild_crash_overview(data, events):
    """Keep existing canonical collision context consistent, without a multiplying join."""
    from shapely.geometry import Point, shape
    grid_path = PROCESSED_DIR / "collisions_grid.geojson"
    previous = json.loads(grid_path.read_text(encoding="utf-8"))
    geometries = {f["properties"]["h3"]: f["geometry"] for f in previous["features"]}
    grouped = defaultdict(lambda: {"total": 0, "pedestrian": 0, "cyclist": 0, "vehicle_only": 0, "killed_or_severe": 0})
    for location, _month, _categories, flags, count, _injured, _killed in data["records"]:
        cell = data["locations"][location][2]
        g = grouped[cell]
        g["total"] += count
        for field, mask in [("pedestrian", 1), ("cyclist", 2), ("vehicle_only", 4), ("killed_or_severe", 8)]:
            if flags & mask:
                g[field] += count
    missing = sorted(set(grouped) - geometries.keys())
    if missing:
        indexed = subprocess.run(["node", str(REPO_ROOT / "scripts" / "event_h3.mjs")], input=json.dumps([xy[:2] for xy in data["locations"]]), text=True, encoding="utf-8", capture_output=True, check=True)
        for cell, ring in json.loads(indexed.stdout)["boundaries"].items():
            geometries.setdefault(cell, {"type": "Polygon", "coordinates": [ring]})
    features = [{"type": "Feature", "properties": {"h3": cell, **values}, "geometry": geometries[cell]} for cell, values in sorted(grouped.items())]
    write_json(grid_path, {"type": "FeatureCollection", "features": features, "meta": {"h3_resolution": 8, "window_start": data["meta"]["window_start"], "window_end_exclusive": data["meta"]["window_end_exclusive"], "unit": "Unique injury crashes, deduplicated by case_id_pkey; pedestrian and cyclist flags can overlap"}})
    nhoods = json.loads((PROCESSED_DIR / "neighbourhoods.geojson").read_text(encoding="utf-8"))
    summary = {}
    valid = [(Point(*e["xy"]), e) for e in events if e["xy"]]
    for feature in nhoods["features"]:
        p = feature["properties"]
        if p.get("region") != "sf":
            summary[p["id"]] = None
            continue
        geometry = shape(feature["geometry"])
        chosen = [e for point, e in valid if geometry.contains(point)]
        summary[p["id"]] = {"injury_crashes": len(chosen), "pedestrian": sum(bool(e["flags"] & 1) for e in chosen), "cyclist": sum(bool(e["flags"] & 2) for e in chosen),
                              "killed_or_severe": sum(bool(e["flags"] & 8) for e in chosen), "per_km2_per_year": round(len(chosen) / p["area_km2"] / 3, 1)}
    metrics_path = PROCESSED_DIR / "neighbourhood_metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    for key, values in metrics["neighbourhoods"].items():
        values["collisions"] = summary.get(key)
    write_json(metrics_path, metrics)
    sidecar_path = PROCESSED_DIR / "_metrics_parts.json"
    if sidecar_path.exists():
        parts = json.loads(sidecar_path.read_text(encoding="utf-8"))
        parts["collisions"] = summary
        write_json(sidecar_path, parts)
    update_manifest("injury_collisions", {"downloaded_at": data["meta"]["downloaded_at"], "raw_path": rel(CRASH_FILE), "feature_count": len(features),
                    "script": "scripts/process_datasets.py; scripts/build_event_details.py", "limitations": "SF published intersection/centreline locations only; highways excluded. Injury crashes only, not every bicycle fall or unreported crash. True crash IDs deduplicate reports; independent pedestrian/cyclist flags can overlap. Unknown groups are not vehicle-only. Number injured excludes fatalities. Recent reporting is incomplete."})


def rebuild_police_overview(data, events, rows):
    """Refresh every existing incident-derived field, retaining exact source H3 IDs."""
    from shapely.geometry import Point, shape
    from shapely.strtree import STRtree
    path = PROCESSED_DIR / "crime_grid.geojson"
    previous = json.loads(path.read_text(encoding="utf-8"))
    geometries = {f["properties"]["h3"]: f["geometry"] for f in previous["features"]}
    grouped = defaultdict(lambda: {"total": 0, "violent": 0, "property": 0, "vehicle_breakin": 0})
    for location, _month, _categories, flags, count, _injured, _killed in data["records"]:
        cell = data["locations"][location][2]
        g = grouped[cell]
        g["total"] += count
        for field, mask in [("violent", 1), ("property", 2), ("vehicle_breakin", 4)]:
            if flags & mask:
                g[field] += count
    if set(grouped) - geometries.keys():
        raise ValueError("A new H3 source cell needs geometry preparation; do not invent a polygon")
    features = [{"type": "Feature", "properties": {"h3": cell, **values, "per_km2": round(values["total"] / data["cell_areas_km2"][cell])}, "geometry": geometries[cell]}
                for cell, values in sorted(grouped.items())]
    write_json(path, {"type": "FeatureCollection", "features": features, "meta": {"h3_resolution": 8, "window_start": data["meta"]["window_start"], "window_end_exclusive": data["meta"]["window_end_exclusive"],
                    "unit": "Distinct counted initial criminal reports per cell; missing offence categories excluded", "missing_category_only_incidents_excluded": data["meta"]["diagnostics"]["missing_category_only_incidents_excluded"]}})

    nhoods = json.loads((PROCESSED_DIR / "neighbourhoods.geojson").read_text(encoding="utf-8"))["features"]
    sf = [feature for feature in nhoods if feature["properties"].get("region") == "sf"]
    tree = STRtree([shape(feature["geometry"]) for feature in sf])
    source_names = {feature["properties"]["name"]: feature["properties"]["id"] for feature in sf}
    members = defaultdict(list)
    unassigned = 0
    for event in events:
        key = None
        if event["xy"] is not None:
            matches = tree.query(Point(*event["xy"]), predicate="within")
            if len(matches):
                key = sf[int(min(matches))]["properties"]["id"]
        else:
            key = source_names.get(event.get("source_neighbourhood"))
        if key is None:
            unassigned += 1
        else:
            members[key].append(event)
    summary = {}
    for feature in nhoods:
        p = feature["properties"]
        if p.get("region") != "sf":
            summary[p["id"]] = None
            continue
        selected = members[p["id"]]
        counts = {group: sum(bool(e["flags"] & (1 << i)) for e in selected) for i, group in enumerate(CRIME_GROUPS)}
        categories = defaultdict(int)
        for event in selected:
            for category in event["categories"]:
                categories[category] += 1
        summary[p["id"]] = {"total": len(selected), "per_km2": round(len(selected) / p["area_km2"], 1), **counts,
            **{f"{group}_per_km2": round(counts[group] / p["area_km2"], 1) for group in ["violent", "property"]},
            "top_categories": dict(sorted(categories.items(), key=lambda item: (-item[1], item[0]))[:6])}
    for field in ["per_km2", "violent_per_km2", "property_per_km2"]:
        present = [(key, values[field]) for key, values in summary.items() if values is not None]
        values = sorted(value for _, value in present)
        for key, value in present:
            # Equivalent to pandas average ranks, scaled to zero through one.
            rank = 1 + sum(v < value for v in values) + (sum(v == value for v in values) - 1) / 2
            summary[key][f"{field}_pctile"] = round((rank - 1) / (len(values) - 1), 3) if len(values) > 1 else 0.5

    summary_path = PROCESSED_DIR / "crime_by_neighbourhood.json"
    old_summary = json.loads(summary_path.read_text(encoding="utf-8"))
    meta = old_summary["meta"]
    note = "Only counted initial criminal reports; records without an offence category are excluded."
    meta.update({"generated": data["meta"]["review_date"], "rows_downloaded": len(rows), "initial_report_rows": sum(row.get("report_type_code") in {"II", "VI"} for row in rows),
                 "incidents_counted": len(events), "incidents_without_neighbourhood": unassigned,
                 "incidents_without_coordinates": sum(event["xy"] is None for event in events),
                 "missing_category_only_incidents_excluded": data["meta"]["diagnostics"]["missing_category_only_incidents_excluded"],
                 "classification_note": note})
    meta["groups"]["other"] = "remaining known criminal categories except excluded; absent or non-string categories are unknown and excluded"
    meta["limitations"] = [text.replace("—", ";") for text in meta["limitations"] if "anonymises" not in text and "Only counted initial" not in text]
    meta["limitations"] += ["SFPD anonymises published locations to intersections; they are approximate and are not offence addresses.", note]
    write_json(summary_path, {"meta": meta, "neighbourhoods": summary})

    metrics_path = PROCESSED_DIR / "neighbourhood_metrics.json"
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    fields = ["total", "per_km2", "violent", "property", "vehicle_breakin", "violent_per_km2", "property_per_km2", "per_km2_pctile", "top_categories"]
    for key, values in metrics["neighbourhoods"].items():
        source = summary.get(key)
        if source is None:
            values["crime"] = None
            continue
        population = (values.get("population") or {}).get("population")
        values["crime"] = {field: source[field] for field in fields} | {"per_1000_residents": round(source["total"] / population * 1000, 1) if population and population >= 1000 else None}
    write_json(metrics_path, metrics)

    density = {feature["properties"]["h3"]: feature["properties"]["per_km2"] for feature in features}
    cell_updates = {}
    for filename in ["area_cells.geojson", "area_cell_display.geojson"]:
        cell_path = PROCESSED_DIR / filename
        cells = json.loads(cell_path.read_text(encoding="utf-8"))
        changed = 0
        for feature in cells["features"]:
            p = feature["properties"]
            if "incidents_per_km2" not in p:
                continue
            # An SF H3 cell can cross the county boundary; it supplies no
            # Peninsula observation. Retain the canonical coverage rule.
            next_value = None if p.get("region") == "peninsula" else density.get(p.get("crime_source_h3"))
            changed += p["incidents_per_km2"] != next_value
            p["incidents_per_km2"] = next_value
        write_json(cell_path, cells)
        cell_updates[filename] = changed
    update_manifest("police_incidents", {"feature_count": len(features), "incidents_counted": len(events), "script": "scripts/process_datasets.py; scripts/build_event_details.py",
                    "limitations": " ".join(meta["limitations"]) + f" {unassigned} incidents could not be placed in a neighbourhood.",
                    "missing_category_only_incidents_excluded": meta["missing_category_only_incidents_excluded"]})
    print(f"Canonical police: {len(events):,} unique counted reports; {data['meta']['mapped_events']:,} mapped. Updated density fields: {cell_updates}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-crashes", action="store_true")
    parser.add_argument("--no-manifest", action="store_true", help="Produce entry sidecars for coordinated manifest update")
    args = parser.parse_args()
    downloads = read_download_log()
    crash_dates = re.findall(r"\d{4}-\d{2}-\d{2}", downloads["injury_crashes"]["note"])
    if args.refresh_crashes:
        refresh_crashes(*crash_dates[:2])
    entries = {}
    for kind, filename, source, key, raw_file, builder in [
        ("crime", "incident_details.json", POLICE_URL, "police_incidents", RAW_DIR / "police_incidents_12m.json", build_police),
        ("collisions", "crash_details.json", CRASH_URL, "injury_crashes", CRASH_FILE, build_crashes),
    ]:
        rows = json.loads(raw_file.read_text(encoding="utf-8"))
        events, diagnostics = builder(rows)
        dates = re.findall(r"\d{4}-\d{2}-\d{2}", downloads[key]["note"])
        fresh = json.loads(CRASH_FILE.with_suffix(".meta.json").read_text(encoding="utf-8")) if kind == "collisions" else None
        pulled = fresh["retrieved_at"] if fresh else downloads[key]["downloaded_at"]
        precision = "Published SFPD location anonymised to an intersection; approximate, never an offence address" if kind == "crime" else "Published TransBASE intersection or street-centreline location; complex junctions share a point"
        meta = {"kind": kind, "source_url": source, "downloaded_at": pulled, "review_date": "2026-11-13", "window_start": dates[0], "window_end_exclusive": dates[1],
                "precision": precision, "diagnostics": diagnostics, "coverage": "San Francisco only; no compatible Peninsula data", "category_totals_overlap": kind == "crime",
                "flags": {"violent": 1, "property": 2, "vehicle_breakin": 4, "drug": 8, "other": 16} if kind == "crime" else {"pedestrian": 1, "cyclist": 2, "vehicle_only": 4, "fatal_severe": 8}}
        if kind == "crime":
            meta["classification_note"] = "Only counted initial criminal reports; records without an offence category are excluded."
        data = compact(events, meta)
        path = PROCESSED_DIR / filename
        size = write_json(path, data)
        if kind == "crime" and not args.no_manifest:
            rebuild_police_overview(data, events, rows)
        if kind == "collisions" and not args.no_manifest:
            rebuild_crash_overview(data, events)
        limitations = precision + ". SF only. Unreported events are absent. Counts reflect reporting and exposure. Monthly filters operate on a fixed recorded period; missing locations are omitted from both map views."
        if kind == "crime":
            limitations += " Only counted initial II/VI criminal reports; records without an offence category are excluded. Deduplicated by incident_id, offence categories unioned. Category totals may overlap. Conflicting coordinates use the first row_id with a valid published coordinate."
        else:
            limitations += " Deduplicated by case_id_pkey, no multiplying party/victim join. Pedestrian and cyclist flags overlap. Unknown groups are not motor-vehicle-only. number_injured excludes killed people. Highways and non-reported falls are not comprehensively covered."
        entry = {"source": "SFPD published intersection incidents" if kind == "crime" else "TransBASE.sfgov.org / SFDPH and SFPD injury crashes",
                 "source_url": source, "licence": "ODC Public Domain Dedication and License (PDDL)", "downloaded_at": pulled,
                 "measurement_period": f"{dates[0]} to {dates[1]} (exclusive)", "resolution": precision, "feature_count": data["meta"]["mapped_events"],
                 "raw_path": rel(raw_file), "processed_path": [rel(path)], "script": "scripts/build_event_details.py", "refresh": "Monthly incidents; quarterly crashes. Bounded windows only.",
                 "limitations": limitations, "status": "processed", "asset_bytes": size, "deduplication": diagnostics}
        entries["police_intersection_details" if kind == "crime" else "injury_crash_details"] = entry
        print(f"{filename}: {size:,} bytes, {data['meta']['mapped_events']:,} mapped events at {len(data['locations']):,} published locations")
    if args.no_manifest:
        write_json(PROCESSED_DIR / "event_manifest_entries.json", entries)
    else:
        for key, entry in entries.items():
            update_manifest(key, entry)


if __name__ == "__main__":
    main()
