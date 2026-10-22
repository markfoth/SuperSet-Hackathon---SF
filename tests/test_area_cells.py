"""Canonical fine geography contracts and road-aligned gradient checks."""
import json
import h3
from shapely.geometry import shape
from _common import PROCESSED_DIR
import numpy as np
from shapely.geometry import LineString
from street_gradients import road_windows, weighted_quantile


def test_area_cells_have_unique_h3_9_ids_and_valid_parents():
    cells = json.loads((PROCESSED_DIR / "area_cells.geojson").read_text(encoding="utf-8"))["features"]
    parents = {f["properties"]["id"] for f in json.loads((PROCESSED_DIR / "neighbourhoods.geojson").read_text(encoding="utf-8"))["features"]}
    ids = [f["properties"]["h3"] for f in cells]
    assert 1000 < len(ids) < 2500
    assert len(ids) == len(set(ids))
    assert {f["properties"]["nhood_id"] for f in cells} == parents
    for f in cells:
        p = f["properties"]
        assert h3.get_resolution(p["h3"]) == 9
        assert shape(f["geometry"]).is_valid
        assert p["area_m2"] >= 1000
        assert p["residential"] in (True, False, None)
        assert 37.7 < p["check_lat"] < 37.84
        assert -122.53 < p["check_lon"] < -122.35


def test_flat_road_across_a_hillside_is_flat():
    # Terrain rises northward by 20%; this east-west road has constant elevation.
    sampler = lambda x, y: y * 0.2
    windows = road_windows(LineString([(0, 100), (200, 100)]), sampler)
    assert all(w["grade_pct"] == 0 for w in windows)


def test_road_aligned_grade_uses_metres_and_sustained_windows():
    sampler = lambda x, y: x * 0.1
    windows = road_windows(LineString([(0, 0), (200, 0)]), sampler)
    assert all(abs(w["grade_pct"] - 10) < 1e-8 for w in windows)
    assert abs(sum(w["geometry"].length for w in windows) - 200) < 1e-8
    assert weighted_quantile([0, 20], [190, 10], 0.5) == 0  # length, not segment count


def test_missing_elevation_and_short_roads_stay_missing():
    assert road_windows(LineString([(0, 0), (30, 0)]), lambda x, y: x)[0]["grade_pct"] is None
    assert all(w["grade_pct"] is None for w in road_windows(LineString([(0, 0), (100, 0)]), lambda x, y: np.full(len(x), np.nan)))


def test_grade_coverage_and_local_variation_are_preserved():
    cells = json.loads((PROCESSED_DIR / "hills_grid.geojson").read_text(encoding="utf-8"))["features"]
    potrero = [f["properties"]["street_grade_pct"] for f in cells if f["properties"]["nhood_id"] == "potrero-hill" and f["properties"]["street_grade_pct"] is not None]
    assert max(potrero) - min(potrero) > 5
    for f in cells:
        p = f["properties"]
        if p["street_grade_pct"] is not None:
            assert p["grade_coverage"] >= 0.75
            assert p["measured_street_m"] >= 100
            assert 0 <= p["steep_street_share"] <= 1


def test_coarse_indicators_retain_their_source_resolution():
    fc = json.loads((PROCESSED_DIR / "area_cells.geojson").read_text(encoding="utf-8"))
    crimes = {f["properties"]["h3"]: f["properties"]["per_km2"] for f in json.loads((PROCESSED_DIR / "crime_grid.geojson").read_text(encoding="utf-8"))["features"]}
    assert fc["meta"]["sources"]["pm25_percentile"]["resolution"] == "census tract"
    for f in fc["features"]:
        p = f["properties"]
        assert h3.cell_to_parent(p["h3"], 8) == p["crime_source_h3"]
        assert p["incidents_per_km2"] == crimes.get(p["crime_source_h3"])
        if p["street_grade_pct"] is None:
            assert p["measured_street_m"] < 100 or (p["grade_coverage"] or 0) < 0.75
