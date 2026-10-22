"""Mapped bars/pubs/nightclubs and a fixed-distance, geographically aligned density heatmap."""
from __future__ import annotations

import json
import geopandas as gpd
import numpy as np
from PIL import Image
from pyproj import Transformer
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.warp import transform_bounds
from shapely.geometry import Point

from _common import METRIC_CRS, PROCESSED_DIR, RAW_DIR, STUDY_BBOX, read_download_log, rel, today, update_manifest, write_json
from process_datasets import write_geojson

SIGMA_M = 300
STOPS = [0, 2, 5, 10, 20, 40]
COLOURS = ["#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#db2777", "#9d174d"]


def density_at(xs, ys, venues, sigma_m=SIGMA_M):
    """Gaussian KDE in ground metres, normalised to mapped venues per square kilometre."""
    density = np.zeros_like(xs, dtype="float64")
    for x, y in venues:
        distance2 = (xs - x) ** 2 + (ys - y) ** 2
        density += np.where(distance2 <= (3 * sigma_m) ** 2,
                            np.exp(-distance2 / (2 * sigma_m ** 2)), 0)
    return density / (2 * np.pi * (sigma_m / 1000) ** 2)


def build() -> dict:
    raw_path = RAW_DIR / "osm_nightlife.json"
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    rows = []
    seen = set()
    for element in raw["elements"]:
        tags = element.get("tags", {})
        kind = tags.get("amenity")
        location = element.get("center", element)
        osm_id = f"{element['type']}/{element['id']}"
        if kind not in {"bar", "pub", "nightclub"} or osm_id in seen or "lat" not in location:
            continue
        seen.add(osm_id)
        rows.append({"osm_id": osm_id, "name": tags.get("name"), "kind": kind,
                     "geometry": Point(location["lon"], location["lat"])})
    venues = gpd.GeoDataFrame(rows, crs=4326)
    land = gpd.read_file(PROCESSED_DIR / "neighbourhoods.geojson").to_crs(3857).geometry.union_all()
    for name in ("peninsula_water.geojson", "peninsula_lakes.geojson"):
        land = land.difference(gpd.read_file(RAW_DIR / name).to_crs(3857).geometry.union_all())
    venues = venues[venues.to_crs(3857).geometry.intersects(land)].copy()
    # Same named establishment sometimes has both a point and building outline in OSM.
    metric = venues.to_crs(METRIC_CRS)
    accepted, named = [], {}
    for index, row in metric.iterrows():
        name = str(row["name"] or "").strip().casefold()
        if name and any(row.geometry.distance(point) <= 25 for point in named.get(name, [])):
            continue
        accepted.append(index)
        if name:
            named.setdefault(name, []).append(row.geometry)
    venues = venues.loc[accepted]
    points_path, count = write_geojson(venues, "nightlife_venues.geojson")
    west, south, east, north = bounds = transform_bounds(4326, 3857, *STUDY_BBOX)
    width, height = int(np.ceil((east-west)/60)), int(np.ceil((north-south)/60))
    transform = from_bounds(*bounds, width, height)
    xx, yy = np.meshgrid(west + (np.arange(width)+0.5)*(east-west)/width,
                         north - (np.arange(height)+0.5)*(north-south)/height)
    xs, ys = Transformer.from_crs(3857, METRIC_CRS, always_xy=True).transform(xx, yy)
    metric = venues.to_crs(METRIC_CRS)
    density = density_at(xs, ys, zip(metric.geometry.x, metric.geometry.y))
    inside = geometry_mask([land], out_shape=density.shape, transform=transform, invert=True)
    rgb = np.array([[int(colour[i:i+2], 16) for i in (1, 3, 5)] for colour in COLOURS])
    rgba = np.zeros((*density.shape, 4), dtype="uint8")
    for channel in range(3):
        rgba[..., channel] = np.interp(density, STOPS, rgb[:, channel]).round().astype("uint8")
    visible = inside & (density >= 0.25)
    rgba[..., 3][visible] = np.clip(80 + density[visible]*8, 90, 215).astype("uint8")
    image_path, meta_path = PROCESSED_DIR / "nightlife.png", PROCESSED_DIR / "nightlife.json"
    Image.fromarray(rgba).save(image_path, optimize=True)
    kinds = venues["kind"].value_counts().to_dict()
    w, s, e, n = STUDY_BBOX
    meta = {"generated": today(), "image": image_path.name, "bounds": [[s,w],[n,e]], "crs": "EPSG:3857",
            "width": width, "height": height, "sigma_m": SIGMA_M, "display_pixel_m": 60,
            "venue_count": count, "kinds": kinds, "units": "mapped venues per km² (smoothed)",
            "colour_stops": STOPS, "colours": COLOURS, "max_density": round(float(density.max()), 2),
            "method": "Equal-weight Gaussian density, 300 m ground-distance bandwidth, cut at 900 m. Same named OSM places within 25 m deduplicated. Fixed scale at all zooms. Water/outside land and density below 0.25 transparent.",
            "limitations": "Mapped venue concentration, not opening hours, noise, reviews, attendance or a completeness guarantee. Low density may mean missing mapping. Display context only; never used to rank homes."}
    write_json(meta_path, meta)
    update_manifest("nightlife", {"source": "OpenStreetMap mapped bars, pubs and nightclubs via Overpass API",
        "source_url": "https://overpass-api.de/api/interpreter", "licence": "ODbL 1.0 — © OpenStreetMap contributors",
        "downloaded_at": read_download_log().get("osm_nightlife", {}).get("downloaded_at"),
        "measurement_period": "OSM snapshot at download date", "resolution": "Venue points/way centroids; 300 m ground-distance Gaussian density, ~60 m Mercator display pixels",
        "feature_count": count, "raw_path": rel(raw_path) + "; peninsula_water.geojson; peninsula_lakes.geojson", "processed_path": [rel(points_path),rel(meta_path),rel(image_path)],
        "script": "scripts/build_nightlife.py via process_datasets.py --only nightlife", "refresh": "after refreshing osm_nightlife",
        "limitations": meta["limitations"] + " " + meta["method"], "status": "processed"})
    return {"venues": count, "kinds": kinds, "max_density": meta["max_density"]}


if __name__ == "__main__":
    print(build())
