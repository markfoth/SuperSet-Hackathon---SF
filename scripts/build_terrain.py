"""Bounded XYZ Terrain RGB tiles from the cached, metre-valued USGS 3DEP DEM.

No downloads or network access. A normal frontend build only copies these outputs.
The alpha channel marks source coverage, although raster-dem clients may ignore it.
Outside the measured extract pixels are sea-level padding, never measured evidence.
"""
from __future__ import annotations

import math
import json

import numpy as np
from PIL import Image
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import reproject, Resampling

from _common import PROCESSED_DIR, RAW_DIR, STUDY_BBOX, rel, today, update_manifest, write_json

TILE_SIZE = 256
MIN_ZOOM, MAX_ZOOM = 8, 13
WORLD = 20037508.342789244


def tile_xy(lon: float, lat: float, zoom: int) -> tuple[int, int]:
    n = 2 ** zoom
    return int((lon + 180) / 360 * n), int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)


def encode(elevation: np.ndarray) -> np.ndarray:
    """Mapbox encoding: metres = -10000 + 0.1 * (R*65536 + G*256 + B)."""
    valid = np.isfinite(elevation)
    packed = np.round((np.where(valid, elevation, 0) + 10000) * 10).clip(0, 16777215).astype('uint32')
    return np.stack(((packed >> 16) & 255, (packed >> 8) & 255, packed & 255,
                     np.where(valid, 255, 0)), axis=-1).astype('uint8')


def build() -> dict:
    source_path = RAW_DIR / 'elevation_3dep_10m.tif'
    folder = PROCESSED_DIR / 'terrain'
    paths, total = [], 0
    w, s, e, n = STUDY_BBOX
    with rasterio.open(source_path) as source:
        band = source.read(1, masked=True).filled(np.nan)
        band[~np.isfinite(band) | (band < -500) | (band > 10000)] = np.nan
        for z in range(MIN_ZOOM, MAX_ZOOM + 1):
            x0, y0 = tile_xy(w, n, z)
            x1, y1 = tile_xy(e, s, z)
            span = 2 * WORLD / (2 ** z)
            for x in range(x0, x1 + 1):
                for y in range(y0, y1 + 1):
                    left, top = -WORLD + x * span, WORLD - y * span
                    grid = np.full((TILE_SIZE, TILE_SIZE), np.nan, dtype='float32')
                    transform = from_bounds(left, top - span, left + span, top, TILE_SIZE, TILE_SIZE)
                    reproject(band, grid, src_transform=source.transform, src_crs=source.crs,
                              src_nodata=np.nan, dst_transform=transform, dst_crs='EPSG:3857',
                              dst_nodata=np.nan, resampling=Resampling.bilinear)
                    path = folder / str(z) / str(x) / f'{y}.png'
                    path.parent.mkdir(parents=True, exist_ok=True)
                    Image.fromarray(encode(grid), 'RGBA').save(path, optimize=True)
                    paths.append(rel(path))
                    total += path.stat().st_size
    downloads = json.loads((RAW_DIR / '_downloads.json').read_text(encoding='utf-8'))
    source_date = downloads['elevation_3dep']['downloaded_at']
    metadata = {
        'source': 'USGS 3DEP bare-earth DEM', 'source_downloaded': source_date, 'processed': today(),
        'source_units': 'metres above vertical datum; source acquisition vintages vary',
        'bounds': list(STUDY_BBOX), 'minzoom': MIN_ZOOM, 'maxzoom': MAX_ZOOM, 'tileSize': TILE_SIZE,
        'encoding': 'mapbox', 'tiles': ['terrain/{z}/{x}/{y}.png'], 'tile_count': len(paths), 'bytes': total,
        'exaggeration': 1,
        'limitations': 'Bare earth, not building heights or surveyed street grades. Outside the measured extract is flat sea-level padding. Raster DEM clients may ignore transparency. Boundary artefacts and varying source vintage remain. No terrain-based ranking.',
    }
    metadata_path = PROCESSED_DIR / 'terrain.json'
    write_json(metadata_path, metadata)
    update_manifest('terrain', {
        'source': 'USGS 3DEP cached bare-earth elevation',
        'source_url': 'https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer',
        'licence': 'US public domain (USGS)', 'downloaded_at': source_date,
        'measurement_period': 'Composite DEM; source acquisition dates vary',
        'resolution': 'Approximately 10 m source, XYZ tiles at zoom 8 to 13; 256 pixels per tile',
        'feature_count': None, 'raw_path': rel(source_path),
        'processed_path': [rel(metadata_path)] + paths,
        'script': 'scripts/build_terrain.py', 'refresh': 'after source DEM changes',
        'limitations': metadata['limitations'], 'status': 'processed',
        'processed_at': today(), 'asset_bytes': total,
    })
    return metadata


if __name__ == '__main__':
    print(json.dumps(build(), indent=2))
