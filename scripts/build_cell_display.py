"""Cut mapped parks/open space out of display cells without changing matching evidence."""
from __future__ import annotations

import json
import geopandas as gpd
from shapely import get_parts, make_valid
from shapely.geometry import MultiPolygon, box

from _common import METRIC_CRS, PROCESSED_DIR, STUDY_BBOX, rel, today, update_manifest, write_json
from process_datasets import round_geom


def polygon_parts(geometry):
    """Keep polygon components, including holes, after repairing source geometry."""
    parts = []
    for part in get_parts(make_valid(geometry)):
        if part.geom_type == "Polygon":
            parts.append(part)
        elif part.geom_type in ("MultiPolygon", "GeometryCollection"):
            parts.extend(get_parts(polygon_parts(part)))
    return MultiPolygon(parts)


def build() -> dict:
    cells = gpd.read_file(PROCESSED_DIR / "area_cells.geojson").to_crs(METRIC_CRS)
    parks = gpd.read_file(PROCESSED_DIR / "parks.geojson").to_crs(METRIC_CRS)
    mask = parks.geometry.make_valid().union_all()
    display = cells[["h3", "geometry"]].copy()
    display["geometry"] = display.geometry.difference(mask).apply(polygon_parts)
    display = display[~display.geometry.is_empty].to_crs(4326)
    # Clipping at the study edge and coordinate rounding can leave stray lines.
    # Leaflet cells must remain polygons, rather than GeometryCollection groups.
    display["geometry"] = display.geometry.intersection(box(*STUDY_BBOX)).apply(round_geom).apply(polygon_parts)
    display = display[~display.geometry.is_empty].copy()
    path, count = PROCESSED_DIR / "area_cell_display.geojson", len(display)
    data = json.loads(display.to_json(drop_id=True))
    data["meta"] = {
        "generated": today(), "matching_source": "area_cells.geojson",
        "mask_source": "parks.geojson",
        "method": "Display only: subtract mapped park and open-space polygons, retaining holes and disconnected land. Fully covered cells omitted. H3 ids and matching evidence stay in area_cells.geojson.",
        "limitations": "Mapped parks are not a parcel-level residential land-use inventory; boundaries and completeness inherit the source data.",
    }
    write_json(path, data)
    update_manifest("area_cell_display", {
        "source": "Canonical H3 cells minus SF / San Mateo County / OpenStreetMap mapped parks and open space",
        "source_url": "https://data.sf.gov/d/gtr9-ntp6", "licence": "Inherits area_cells and parks input licences; see those entries",
        "downloaded_at": today(), "measurement_period": "Per input dataset",
        "resolution": "H3 resolution 9 display footprints cut to mapped park boundaries",
        "feature_count": count, "raw_path": "Processed area_cells.geojson and parks.geojson",
        "processed_path": [rel(path)], "script": "scripts/build_cell_display.py",
        "refresh": "after area_cells or parks changes", "status": "processed",
        "limitations": "Display footprint only, not verified housing parcels. Does not alter representative-point matching or source-resolution indicators.",
    })
    return {"display_cells": count, "fully_masked_cells": len(cells) - count}


if __name__ == "__main__":
    print(build())
