"""Build a keyless, georeferenced elevation-colour overlay from the existing USGS DEM.

This is elevation above sea level, separate from street gradients used in matching.
The image grid is Web Mercator so Leaflet's image bounds remain geographically aligned.
"""
from __future__ import annotations

import geopandas as gpd
import numpy as np
from PIL import Image
import rasterio
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling, transform_bounds

from _common import PROCESSED_DIR, RAW_DIR, STUDY_BBOX, rel, today, update_manifest, write_json

STOPS = [0, 50, 100, 200, 300, 450]
COLOURS = ["#c3e3df", "#dbe5ac", "#eee0a4", "#d8b379", "#ab825d", "#ede6de"]


def build() -> dict:
    image_path = PROCESSED_DIR / "topography.png"
    metadata_path = PROCESSED_DIR / "topography.json"
    projected_bounds = transform_bounds(4326, 3857, *STUDY_BBOX)
    west, south, east, north = projected_bounds
    width, height = int(np.ceil((east - west) / 30)), int(np.ceil((north - south) / 30))
    transform = from_bounds(*projected_bounds, width, height)
    elevation = np.full((height, width), np.nan, dtype="float32")
    source_path = RAW_DIR / "elevation_3dep_10m.tif"
    with rasterio.open(source_path) as source:
        band = source.read(1, masked=True).filled(np.nan)
        band[~np.isfinite(band) | (band < -500) | (band > 10000)] = np.nan
        reproject(band, elevation, src_transform=source.transform, src_crs=source.crs,
                  src_nodata=np.nan, dst_transform=transform, dst_crs="EPSG:3857",
                  dst_nodata=np.nan, resampling=Resampling.bilinear)
    land = gpd.read_file(PROCESSED_DIR / "neighbourhoods.geojson").to_crs(3857)
    water = gpd.GeoSeries([gpd.read_file(RAW_DIR / name).to_crs(3857).geometry.union_all()
                          for name in ["peninsula_water.geojson", "peninsula_lakes.geojson"]], crs=3857).union_all()
    land_mask = land.geometry.union_all().difference(water)
    inside = geometry_mask([land_mask], out_shape=elevation.shape, transform=transform, invert=True)
    valid = inside & np.isfinite(elevation)
    rgb = np.array([[int(colour[i:i + 2], 16) for i in (1, 3, 5)] for colour in COLOURS])
    rgba = np.zeros((*elevation.shape, 4), dtype="uint8")
    for channel in range(3):
        rgba[..., channel][valid] = np.interp(elevation[valid], STOPS, rgb[:, channel]).round().astype("uint8")
    rgba[..., 3][valid] = 255  # Water/outside study land and missing DEM are transparent.
    Image.fromarray(rgba).save(image_path, optimize=True)
    w, s, e, n = STUDY_BBOX
    metadata = {"generated": today(), "image": image_path.name, "bounds": [[s, w], [n, e]],
                "crs": "EPSG:3857", "display_pixel_m": 30, "source_pixel_m": 10,
                "width": width, "height": height,
                "observed_range_m": [round(float(elevation[valid].min()), 1), round(float(elevation[valid].max()), 1)],
                "colour_stops_m": STOPS, "colours": COLOURS,
                "method": "USGS bare-earth elevation, bilinear resampling; colour interpolated by elevation above sea level in metres. Not street slope. Missing/water/outside coverage transparent."}
    write_json(metadata_path, metadata)
    update_manifest("topography", {"source": "USGS 3DEP bare-earth elevation; study land from SF and San Mateo County boundaries",
        "source_url": "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
        "licence": "Elevation: US public domain (USGS); land mask inherits boundary sources",
        "downloaded_at": today(), "measurement_period": "DEM composite of source lidar acquisitions",
        "resolution": "Approximately 10 m source DEM, resampled to 30 m Web Mercator display pixels",
        "feature_count": None, "raw_path": rel(source_path) + "; peninsula_water.geojson; peninsula_lakes.geojson", "processed_path": [rel(metadata_path), rel(image_path)],
        "script": "scripts/build_topography.py via process_datasets.py --only topography", "refresh": "after DEM or study-area boundary changes",
        "limitations": "Bare-earth elevations, not surveyed road gradients or building heights. Colours express elevation above sea level, not slope. Shoreline and vertical accuracy inherit the source data; no coverage outside the study land.",
        "status": "processed"})
    return {"image": rel(image_path), "bytes": image_path.stat().st_size, "range_m": metadata["observed_range_m"]}


if __name__ == "__main__":
    print(build())
