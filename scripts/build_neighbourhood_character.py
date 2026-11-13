"""Validate reviewed editorial evidence and emit a small lazy map overlay. No model/API calls.

Refresh: review source URLs and content JSON, then run this command. Anchors are
editorial label positions, never measured neighbourhood boundaries.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from _common import DATA_DIR, PROCESSED_DIR, rel, update_manifest, write_json
from poi_metadata import http_url

CONTENT = DATA_DIR / "content" / "neighbourhood_character.json"


def validate(content: dict) -> list[str]:
    errors, seen = [], set()
    sources = content["sources"]
    forbidden = re.compile(r"\b(dodgy|dangerous|safe|unsafe|hipster|wealthy|poor)\b", re.I)
    for area in content["areas"]:
        area_id = area["area_id"]
        if area_id in seen:
            errors.append(f"Duplicate area id {area_id}")
        seen.add(area_id)
        if not 3 <= len(area["short_label"].split()) <= 5:
            errors.append(f"{area_id}: label must contain 3 to 5 words")
        if forbidden.search(area["short_label"]):
            errors.append(f"{area_id}: unsuitable resident/safety label")
        if area["editorial_status"] != "reviewed" or not area["topics"] or not area["limitations"]:
            errors.append(f"{area_id}: incomplete editorial review")
        if not area["source_ids"] or any(key not in sources for key in area["source_ids"]):
            errors.append(f"{area_id}: missing evidence")
        if len({sources[key]["independent_group"] for key in area["source_ids"]}) < 2:
            errors.append(f"{area_id}: requires two independent source groups")
        lon, lat = area["anchor"]
        if not (-122.53 <= lon <= -122.35 and 37.60 <= lat <= 37.835):
            errors.append(f"{area_id}: anchor outside study area")
    for source_id, source in sources.items():
        if not http_url(source["url"]) or not source["review_date"] or not source["evidence_note"]:
            errors.append(f"{source_id}: incomplete source record")
    return errors


def build() -> dict:
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    errors = validate(content)
    if errors:
        raise ValueError("\n".join(errors))
    features = []
    for area in content["areas"]:
        props = {key: value for key, value in area.items() if key not in {"anchor", "source_ids", "broad_label"}}
        props["level"] = "district"
        props["sources"] = [content["sources"][key] for key in area["source_ids"]]
        features.append({"type": "Feature", "id": area["area_id"], "properties": props,
                         "geometry": {"type": "Point", "coordinates": area["anchor"]}})
        if area.get("broad_label"):
            features.append({"type": "Feature", "id": f"{area['area_id']}-broad",
                             "properties": {**props, "area_id": f"{area['area_id']}-broad", "level": "broad",
                                            "short_label": area["broad_label"]},
                             "geometry": {"type": "Point", "coordinates": area["anchor"]}})
    output = PROCESSED_DIR / "neighbourhood_character.geojson"
    size = write_json(output, {"type": "FeatureCollection", "features": features,
                              "meta": {"review_date": content["review_date"], "ranking_input": False,
                                       "method": content["method"], "research_queue": content["research_queue"]}})
    update_manifest("neighbourhood_character", {
        "source": "Original editorial aspect summaries with separately reviewed source evidence",
        "source_url": "See data/sf/content/neighbourhood_character.json source registry",
        "licence": "Original Common Ground summaries; source articles remain with their respective publishers. No copied map content.",
        "downloaded_at": content["review_date"], "measurement_period": "Source publication dates vary; reviewed " + content["review_date"],
        "resolution": "Editorial area/corridor label anchors, not measured boundaries or uniform street conditions",
        "feature_count": len(features), "raw_path": rel(CONTENT), "processed_path": [rel(output)],
        "script": "scripts/build_neighbourhood_character.py", "refresh": "Review sources and content JSON manually, then rebuild; six-month review suggested",
        "limitations": "Selective coverage only. Two independent source groups per label; some historical journalism corroborates enduring place features only. Promotional sources are identified. No sentiment score, safety inference, resident labels or ranking influence. Anchors do not assert boundaries; unsupported areas remain in research_queue.",
        "status": "processed",
    })
    return {"areas": len(content["areas"]), "labels": len(features), "bytes": size}


if __name__ == "__main__":
    print(build())
