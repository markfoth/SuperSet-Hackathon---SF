"""Contact association and editorial evidence contracts, without native spatial DLLs."""
import copy
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from _common import DATA_DIR, PROCESSED_DIR
from build_neighbourhood_character import validate
from poi_metadata import http_url, poi_metadata


def test_urls_reject_non_web_or_credential_links():
    for value in [None, "javascript:alert(1)", "//example.org", "data:text/html,x", "https://a:b@example.org", "https://example.org\n/path"]:
        assert http_url(value) is None
    assert http_url(" https://venue.example/branch?x=1 ") == "https://venue.example/branch?x=1"


def test_contacts_preserve_source_identity_and_do_not_guess_websites():
    metadata = poi_metadata({"type": "node", "id": 123, "tags": {"name": "Named venue", "addr:street": "Main Street",
        "addr:housenumber": "42", "contact:website": "https://venue.example/main", "phone": "555", "opening_hours": "Mo-Fr 09:00-17:00"}}, "2026-10-22")
    assert metadata["osm_id"] == "node/123"
    assert metadata["source_url"] == "https://www.openstreetmap.org/node/123"
    assert metadata["address"] == "42 Main Street"
    assert metadata["website"] == "https://venue.example/main"
    assert metadata["official_website"] is None
    assert metadata["snapshot"] == "2026-10-22"


def test_manual_official_link_requires_same_id_name_and_address():
    source = {"type": "node", "id": 331389010, "tags": {"name": "Caffe Trieste", "addr:street": "Vallejo Street", "addr:housenumber": "601"}}
    assert poi_metadata(source)["official_website"] == "https://caffetrieste.com/"
    changed = copy.deepcopy(source)
    changed["tags"]["addr:housenumber"] = "609"
    assert poi_metadata(changed)["official_website"] is None
    changed = copy.deepcopy(source)
    changed["tags"]["name"] = "Same-named business elsewhere"
    assert poi_metadata(changed)["official_website"] is None


def test_reviewed_character_has_independent_aspect_evidence_and_research_gaps():
    content = json.loads((DATA_DIR / "content/neighbourhood_character.json").read_text(encoding="utf-8"))
    assert validate(content) == []
    assert len(content["areas"]) >= 10
    assert {"food", "arts", "nightlife", "residential character", "parks and waterfront", "office and industrial activity"} <= {topic for area in content["areas"] for topic in area["topics"]}
    assert content["research_queue"]
    broken = copy.deepcopy(content)
    broken["areas"][0]["source_ids"] = ["sftravel_mission"]
    assert any("independent" in error for error in validate(broken))
    built = json.loads((PROCESSED_DIR / "neighbourhood_character.geojson").read_text(encoding="utf-8"))
    assert built["meta"]["ranking_input"] is False
    assert len({feature["id"] for feature in built["features"]}) == len(built["features"])
    assert {feature["properties"]["level"] for feature in built["features"]} == {"broad", "district"}


def test_enriched_pois_keep_geometry_counts_and_checked_link_scope():
    expected = {"cafes": 893, "restaurants": 2125, "bars": 532, "groceries": 200, "nightlife_venues": 570}
    for name, count in expected.items():
        data = json.loads((PROCESSED_DIR / f"{name}.geojson").read_text(encoding="utf-8"))
        assert len(data["features"]) == count
        assert all(feature["geometry"]["type"] == "Point" for feature in data["features"])
        for feature in data["features"]:
            props = feature["properties"]
            if props.get("official_website"):
                assert props["website_verified_on"] == "2026-11-13"
                assert props["osm_id"] in {"node/331389010", "node/302448629", "node/293632937", "node/61670779"}
        if name == "nightlife_venues":
            assert {feature["properties"]["kind"] for feature in data["features"]} == {"bar", "pub", "nightclub"}
