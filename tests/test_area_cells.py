"""Canonical fine geography contracts and road-aligned gradient checks."""
import json
import h3
from shapely.geometry import shape
from _common import PROCESSED_DIR


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
