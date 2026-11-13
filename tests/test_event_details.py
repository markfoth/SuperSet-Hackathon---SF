"""Pure event semantics; does not require the native Python H3 extension."""
import json
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from build_event_details import build_police, build_crashes, compact, casualty
from event_semantics import crash_flags, crime_groups


def police(row_id, incident_id, category, sub=None, **extra):
    return {"row_id": row_id, "incident_id": incident_id, "incident_category": category,
            "incident_subcategory": sub, "report_type_code": "II", "incident_datetime": "2026-01-04T10:00:00",
            "latitude": "37.77", "longitude": "-122.42", **extra}


def test_offence_rows_merge_by_incident_and_union_categories():
    events, diagnostics = build_police([
        police("2", "one", "Burglary"), police("1", "one", "Assault"),
        police("3", "one", "Assault"), police("4", "two", "Non-Criminal"),
        police("5", "three", "Robbery", report_type_code="IS"),
    ])
    assert len(events) == 1
    assert diagnostics["unique_events"] == 1
    assert events[0]["categories"] == {"Burglary", "Assault"}
    assert events[0]["flags"] & 1 and events[0]["flags"] & 2


def test_missing_non_string_and_pandas_nan_categories_are_unknown():
    for category in [None, "", float("nan"), 123, object()]:
        assert crime_groups(category, None) == []
    assert crime_groups("Fraud", None) == ["other"]


def test_missing_category_only_reports_are_excluded_without_dropping_known_rows():
    events, diagnostics = build_police([
        police("1", "unknown-only", None), police("2", "known", None), police("3", "known", "Assault"),
    ])
    assert len(events) == 1
    assert events[0]["categories"] == {"Assault"}
    assert diagnostics["missing_category_only_incidents_excluded"] == 1


def test_dedup_does_not_multiply_locations_or_reverse_anonymisation():
    events, diagnostics = build_police([
        police("1", "same", "Assault"), police("2", "same", "Robbery", latitude="37.78"),
    ])
    assert diagnostics["conflicting_published_locations"] == 1
    assert events[0]["xy"] == (-122.42, 37.77)


def test_crash_involvement_overlaps_and_unknown_is_not_vehicle_only():
    flags = crash_flags({"dph_col_grp_description": "Bicycle-Pedestrian", "collision_severity": "Injury (Severe)"})
    assert flags & 1 and flags & 2 and flags & 8
    assert not flags & 4
    assert not crash_flags({"dph_col_grp_description": "Unknown/Not Stated"}) & 4
    assert crash_flags({"dph_col_grp_description": "Vehicle(s) Only Involved"}) & 4


def test_crash_report_id_dedup_does_not_multiply_casualties():
    row = {"unique_id": "1", "case_id_pkey": "report", "collision_datetime": "2026-01-01T00:00:00",
           "tb_latitude": "37.77", "tb_longitude": "-122.42", "dph_col_grp_description": "Vehicle-Bicycle",
           "number_injured": "2", "number_killed": "1", "collision_severity": "Fatal"}
    events, diagnostics = build_crashes([row, row | {"unique_id": "2"}])
    assert len(events) == 1
    assert diagnostics["duplicate_rows_removed"] == 1
    assert events[0]["injured"] == 2 and events[0]["killed"] == 1
    assert casualty(None) is None and casualty("0") == 0


def test_compact_preserves_shared_location_and_unique_count():
    events, _ = build_police([police("1", "one", "Assault"), police("2", "two", "Assault")])
    data = compact(events, {})
    assert len(data["locations"]) == 1
    assert data["locations"][0][:2] == [-122.42, 37.77]
    assert sum(row[4] for row in data["records"]) == 2
    assert data["cell_areas_km2"][data["locations"][0][2]] > 0


def test_published_grid_and_detail_crash_totals_are_consistent():
    folder = Path(__file__).resolve().parents[1] / "data" / "sf" / "processed"
    detail = json.loads((folder / "crash_details.json").read_text(encoding="utf-8"))
    grid = json.loads((folder / "collisions_grid.geojson").read_text(encoding="utf-8"))
    assert sum(f["properties"]["total"] for f in grid["features"]) == sum(row[4] for row in detail["records"])
    assert sum(f["properties"]["cyclist"] for f in grid["features"]) == sum(row[4] for row in detail["records"] if row[3] & 2)


def test_canonical_police_densities_and_summary_match_detail_and_keep_unknowns():
    folder = Path(__file__).resolve().parents[1] / "data" / "sf" / "processed"
    detail = json.loads((folder / "incident_details.json").read_text(encoding="utf-8"))
    grid = json.loads((folder / "crime_grid.geojson").read_text(encoding="utf-8"))
    cells = json.loads((folder / "area_cells.geojson").read_text(encoding="utf-8"))
    summary = json.loads((folder / "crime_by_neighbourhood.json").read_text(encoding="utf-8"))
    assert sum(f["properties"]["total"] for f in grid["features"]) == sum(row[4] for row in detail["records"]) == 47808
    density = {f["properties"]["h3"]: f["properties"]["per_km2"] for f in grid["features"]}
    for feature in cells["features"]:
        p = feature["properties"]
        assert p["incidents_per_km2"] == (None if p["region"] == "peninsula" else density.get(p["crime_source_h3"]))
        if p["region"] == "peninsula":
            assert p["incidents_per_km2"] is None
    assert summary["meta"]["incidents_counted"] == 49311
    assert summary["meta"]["missing_category_only_incidents_excluded"] == 204
    assert sum(v["total"] for v in summary["neighbourhoods"].values() if v) + summary["meta"]["incidents_without_neighbourhood"] == 49311
