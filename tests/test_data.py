"""Data contract tests. Run: .venv/Scripts/python.exe -m pytest"""
from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import validate_datasets as v  # noqa: E402
from _common import PROCESSED_DIR, load_manifest  # noqa: E402
from download_datasets import twelve_month_window  # noqa: E402
from process_datasets import bike_category, crime_groups, percentile_ranks, slug  # noqa: E402

# Stable ids: other datasets, saved shortlists and URLs key on these. A change here is a breaking change.
EXPECTED_IDS = {
    "bayview-hunters-point", "bernal-heights", "castro-upper-market", "chinatown", "excelsior",
    "financial-district-south-beach", "glen-park", "golden-gate-park", "haight-ashbury", "hayes-valley",
    "inner-richmond", "inner-sunset", "japantown", "lakeshore", "lincoln-park", "lone-mountain-usf", "marina",
    "mclaren-park", "mission", "mission-bay", "nob-hill", "noe-valley", "north-beach",
    "oceanview-merced-ingleside", "outer-mission", "outer-richmond", "pacific-heights", "portola", "potrero-hill",
    "presidio", "presidio-heights", "russian-hill", "seacliff", "south-of-market", "sunset-parkside", "tenderloin",
    "treasure-island", "twin-peaks", "visitacion-valley", "west-of-twin-peaks", "western-addition",
}


def load(name):
    return json.loads((PROCESSED_DIR / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("check", v.CHECKS, ids=lambda c: c.__name__)
def test_validator_check(check):
    assert check() == []


def test_neighbourhood_ids_are_stable():
    ids = {f["properties"]["id"] for f in load("neighbourhoods.geojson")["features"] if f["properties"]["region"] == "sf"}
    assert ids == EXPECTED_IDS


def test_every_neighbourhood_has_sample_points():
    samples = load("neighbourhood_samples.json")["neighbourhoods"]
    assert all(len(pts) >= 1 for pts in samples.values())
    for pts in samples.values():
        for lat, lon in pts:
            assert 37.60 <= lat <= 37.84 and -122.53 <= lon <= -122.35


def test_crime_window_is_twelve_complete_months():
    meta = load("crime_by_neighbourhood.json")["meta"]
    start, end = date.fromisoformat(meta["window_start"]), date.fromisoformat(meta["window_end_exclusive"])
    assert start.day == 1 and end.day == 1
    assert (end.year - start.year) * 12 + end.month - start.month == 12


def test_crime_totals_are_plausible_and_consistent():
    data = load("crime_by_neighbourhood.json")
    total = sum(n["total"] for n in data["neighbourhoods"].values() if n is not None)
    assert 20_000 < total < 150_000
    assert total + data["meta"]["incidents_without_neighbourhood"] == data["meta"]["incidents_counted"]
    for n in data["neighbourhoods"].values():
        if n is None:
            continue
        assert n["vehicle_breakin"] <= n["property"]


def test_cycling_keeps_facility_distinctions():
    cats = {f["properties"]["cat"] for f in load("cycling_network.geojson")["features"]}
    assert {"protected", "lane", "route", "path"} <= cats


def test_transit_covers_bart_muni_caltrain_and_sfo():
    stops = load("transit_stops.geojson")["features"]
    agencies = {f["properties"]["agency"] for f in stops}
    assert {"BART", "Muni", "Caltrain"} <= agencies
    assert any("San Francisco International Airport" in f["properties"]["name"] for f in stops)


def test_commute_fixtures_are_labelled():
    for f in load("commute_fixtures.geojson")["features"]:
        p = f["properties"]
        assert p["synthetic"] == (p["mode"] != "transit")
        assert ("Synthetic" in p["label"]) == p["synthetic"]


def test_blocked_sources_are_recorded_not_faked():
    m = load_manifest()
    for key, entry in m.items():
        if entry["status"] == "blocked":
            assert entry["processed_path"] in ([], None)
            assert entry["feature_count"] is None


def test_rents_are_labelled_zip_level_asking_rents():
    meta = load("rents_zori_zip.json")["meta"]
    assert "ZIP" in meta["resolution"] and "ASKING" in meta["measures"]


# --- unit tests for classification helpers --------------------------------------------

def test_crime_groups():
    assert crime_groups("Assault", None) == ["violent"]
    assert crime_groups("Larceny Theft", "Larceny - From Vehicle") == ["property", "vehicle_breakin"]
    assert crime_groups("Non-Criminal", None) == []
    assert crime_groups(None, None) == []
    assert crime_groups("Fraud", None) == ["other"]


def test_bike_category():
    assert bike_category("CLASS IV", "SEPARATED BIKEWAY") == "protected"
    assert bike_category("CLASS I", "BIKE PATH") == "path"
    assert bike_category("CLASS II", "BIKE LANE") == "lane"
    assert bike_category("CLASS III", "NEIGHBORWAY") == "neighborway"
    assert bike_category("CLASS III", "BIKE ROUTE") == "route"
    assert bike_category(float("nan"), None) == "other"


def test_percentile_ranks_keep_missing_as_none():
    r = percentile_ranks({"a": 1.0, "b": 2.0, "c": None, "d": 3.0})
    assert r["c"] is None and r["a"] == 0.0 and r["d"] == 1.0


def test_twelve_month_window():
    assert twelve_month_window(date(2026, 10, 21)) == ("2025-10-01", "2026-10-01")
    assert twelve_month_window(date(2026, 1, 5)) == ("2025-01-01", "2026-01-01")


def test_slug():
    assert slug("Financial District/South Beach") == "financial-district-south-beach"
    assert slug("Castro/Upper Market") == "castro-upper-market"


def test_population_matches_county_total():
    m = load("neighbourhood_metrics.json")["neighbourhoods"]
    total = sum((v["population"] or {}).get("population") or 0 for v in m.values() if v["region"] == "sf")
    assert 800_000 < total < 870_000  # ACS 2020-24 SF County = 830,235


def test_environment_excludes_composite_and_demographic_fields():
    props = load("census_tracts.geojson")["features"][0]["properties"]
    assert not any(k in props for k in ("ces_CIscore", "ces_CIscoreP", "ces_pov", "ces_PopChar"))
    for v in load("neighbourhood_metrics.json")["neighbourhoods"].values():
        if v["environment"]:
            assert set(v["environment"]) == {"pm_pctl", "diesel_pctl", "traffic_pctl", "ozone_pctl", "pollution_burden_pctl"}


def test_per_resident_crime_is_null_for_low_population():
    m = load("neighbourhood_metrics.json")["neighbourhoods"]
    assert m["golden-gate-park"]["crime"]["per_1000_residents"] is None
    assert m["mission"]["crime"]["per_1000_residents"] > 0


def test_poi_files_are_points_with_categories():
    for name, kinds in {"cafes": {"cafe", "coffee_shop"}, "restaurants": {"restaurant"}, "bars": {"bar", "pub"}}.items():
        feats = load(f"{name}.geojson")["features"]
        assert len(feats) > 100
        assert {f["properties"]["kind"] for f in feats} <= kinds
        assert all(f["geometry"]["type"] == "Point" for f in feats)
