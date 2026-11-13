"""Verify Terrain RGB units, real relief and the bounded optional asset budget."""
import json
import math

import numpy as np
from PIL import Image

from _common import PROCESSED_DIR, STUDY_BBOX, load_manifest
from build_terrain import encode, tile_xy


def decode(pixel):
    red, green, blue = (int(v) for v in pixel[:3])
    return -10000 + (red * 65536 + green * 256 + blue) * 0.1


def test_encoding_round_trips_metres_and_preserves_missing_coverage():
    values = np.array([[-15.2, 0, 123.4, np.nan]])
    image = encode(values)
    assert [round(decode(p), 1) for p in image[0, :3]] == [-15.2, 0, 123.4]
    assert image[0, 3, 3] == 0
    assert all(p[3] == 255 for p in image[0, :3])


def test_tiles_have_measured_sf_relief_and_bounded_budget():
    meta = json.loads((PROCESSED_DIR / 'terrain.json').read_text(encoding='utf-8'))
    assert meta['bounds'] == list(STUDY_BBOX)
    assert meta['encoding'] == 'mapbox' and meta['exaggeration'] == 1
    tiles = list((PROCESSED_DIR / 'terrain').rglob('*.png'))
    assert len(tiles) == meta['tile_count']
    assert sum(p.stat().st_size for p in tiles) == meta['bytes'] < 10_000_000

    def elevation(lon, lat):
        zoom = meta['maxzoom']
        x, y = tile_xy(lon, lat, zoom)
        pix_x = int(((lon + 180) / 360 * (2 ** zoom) - x) * 256)
        pix_y = int(((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * (2 ** zoom) - y) * 256)
        image = np.array(Image.open(PROCESSED_DIR / 'terrain' / str(zoom) / str(x) / f'{y}.png'))
        assert image.shape == (256, 256, 4)
        assert image[pix_y, pix_x, 3] == 255
        return decode(image[pix_y, pix_x])

    # Independent geographic plausibility: Twin Peaks is high; downtown is low.
    assert 240 < elevation(-122.4477, 37.7544) < 290
    assert -5 < elevation(-122.3999, 37.7946) < 50
    manifest = load_manifest()['terrain']
    assert manifest['downloaded_at'] == meta['source_downloaded']
    assert manifest['processed_at'] == meta['processed']
    assert len(manifest['processed_path']) == len(tiles) + 1
