"""Bounded, standard-library-only contact refresh for existing processed POIs.

This preserves geometries, inclusion rules and counts from the full spatial
pipeline. It can run on Windows even when Application Control blocks native H3.
Refresh raw snapshots with download_datasets.py --only osm_food_drink osm_groceries
osm_nightlife before rerunning the full spatial pipeline when adding/removing POIs.
"""
from __future__ import annotations

import json
from collections import defaultdict

from _common import PROCESSED_DIR, RAW_DIR, load_manifest, read_download_log, rel, update_manifest, write_json
from poi_metadata import poi_metadata


def enrich() -> dict:
    log, manifest = read_download_log(), load_manifest()
    counts = {}
    for filename, raw_name, manifest_id in [
        ("cafes", "osm_food_drink", "food_drink_pois"),
        ("restaurants", "osm_food_drink", "food_drink_pois"),
        ("bars", "osm_food_drink", "food_drink_pois"),
        ("groceries", "osm_groceries", "groceries"),
        ("nightlife_venues", "osm_nightlife", "nightlife"),
    ]:
        raw = json.loads((RAW_DIR / f"{raw_name}.json").read_text(encoding="utf-8"))
        by_id, by_location = {}, defaultdict(list)
        for element in raw["elements"]:
            tags = element.get("tags", {})
            location = element.get("center", element)
            if "lat" not in location or "lon" not in location:
                continue
            by_id[f"{element['type']}/{element['id']}"] = element
            kind = "coffee_shop" if tags.get("shop") == "coffee" else tags.get("amenity") or tags.get("shop")
            key = (tags.get("name"), kind, round(location["lon"], 5), round(location["lat"], 5))
            by_location[key].append(element)
        path = PROCESSED_DIR / f"{filename}.geojson"
        collection = json.loads(path.read_text(encoding="utf-8"))
        matched, official = 0, 0
        for feature in collection["features"]:
            props = feature["properties"]
            element = by_id.get(props.get("osm_id"))
            if element is None:
                lon, lat = feature["geometry"]["coordinates"]
                candidates = by_location.get((props.get("name"), props.get("kind") or props.get("shop"), lon, lat), [])
                # Ambiguous duplicate mappings are not sufficient evidence for a link.
                if len(candidates) == 1:
                    element = candidates[0]
            if element:
                props.update(poi_metadata(element, log.get(raw_name, {}).get("downloaded_at")))
                feature["id"] = props["osm_id"]
                matched += 1
                official += int(bool(props.get("official_website")))
        write_json(path, collection)
        counts[filename] = {"features": len(collection["features"]), "matched": matched, "official_websites_checked": official,
                            "bytes": path.stat().st_size}
        entry = manifest[manifest_id]
        entry["limitations"] = entry["limitations"].replace(
            " Source-supplied HTTP(S) website, contact, address, OSM identifiers and snapshot date are retained. Three manually checked venue/address links are identified separately; other links are not labelled official. Refresh metadata: scripts/enrich_place_context.py.", "")
        note = " Source-supplied HTTP(S) website, contact, address, OSM identifiers and snapshot date are retained. Manually checked venue/address links are identified separately; other links are not labelled official. Refresh metadata: scripts/enrich_place_context.py."
        if note not in entry["limitations"]:
            entry["limitations"] += note
        entry["contact_metadata_sources"] = ["data/sf/content/poi_verified_websites.json", "scripts/poi_metadata.py"]
        update_manifest(manifest_id, entry)
        # A later file in the same dataset must preserve the refreshed entry.
        manifest[manifest_id] = entry
    return counts


if __name__ == "__main__":
    print(json.dumps(enrich(), indent=2))
