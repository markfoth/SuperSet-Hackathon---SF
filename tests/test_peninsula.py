"""Geographic extension contracts: actual coverage, coastal land and jurisdiction honesty."""
import json

from shapely.geometry import Point, shape

from _common import PROCESSED_DIR, STUDY_BBOX


def load(name):
    return json.loads((PROCESSED_DIR / name).read_text(encoding="utf-8"))


def test_city_centres_have_groupings_and_fine_cells_through_sfo():
    groups = load("neighbourhoods.geojson")["features"]
    cells = load("area_cells.geojson")["features"]
    known = {"south-san-francisco": (-122.4077, 37.6547), "san-bruno": (-122.4118, 37.6305),
             "daly-city": (-122.4702, 37.6879), "brisbane": (-122.3995, 37.6806),
             "colma": (-122.4557, 37.6769)}
    for name, xy in known.items():
        assert any(f["properties"]["id"] == name and shape(f["geometry"]).covers(Point(*xy)) for f in groups), name
        assert any(f["properties"]["nhood_id"] == name and shape(f["geometry"]).covers(Point(*xy)) for f in cells), name
    assert all(shape(f["geometry"]).bounds[1] >= STUDY_BBOX[1] - 1e-6 for f in cells)


def test_peninsula_coverage_is_local_and_absent_incidents_are_not_zero():
    cells = [f["properties"] for f in load("area_cells.geojson")["features"] if f["properties"]["region"] == "peninsula"]
    assert len(cells) > 800
    assert all(c["incidents_per_km2"] is None for c in cells)
    ssf = [c for c in cells if c["nhood_id"] == "south-san-francisco"]
    assert sum(c["street_grade_pct"] is not None for c in ssf) > len(ssf) / 2
    assert any(c["residential"] and c["park_distance_m"] < 400 and c["rail_distance_m"] < 800 for c in ssf)
    assert any(c["tract_id"].startswith("06081") and c["pm25_percentile"] is not None for c in ssf if c["tract_id"])
    assert any(c["rent_zip"] == "94080" and c["zip_asking_rent"] is not None for c in ssf)
    metrics = load("neighbourhood_metrics.json")["neighbourhoods"]
    for m in metrics.values():
        if m["region"] == "peninsula":
            assert m["crime"] is None and m["collisions"] is None
    assert all(c["residential"] is False for c in cells if c["nhood_id"] == "sfo-airport")


def test_bay_is_not_candidate_land_and_samtrans_is_included():
    # These points lie east of the Peninsula shoreline, inside offshore city jurisdictions.
    cells = load("area_cells.geojson")["features"]
    for point in [Point(-122.36, 37.66), Point(-122.36, 37.69)]:
        assert not any(shape(f["geometry"]).covers(point) for f in cells)
    stops = load("transit_stops.geojson")["features"]
    assert any(f["properties"]["agency"] == "SamTrans" and 37.62 < f["geometry"]["coordinates"][1] < 37.70 for f in stops)
    assert load("transit_stops.geojson")["meta"]["feeds"]["samtrans"]["covers_target"] is True
    streets = load("street_gradients_peninsula.geojson")["features"]
    assert len(streets) > 3000 and any(f["properties"]["grade_pct"] is not None for f in streets)
