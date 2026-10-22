"""The elevation overlay is georeferenced source data, not a street-slope picture."""
import json

import numpy as np
from PIL import Image
from pyproj import Transformer

from _common import PROCESSED_DIR, STUDY_BBOX


def test_elevation_overlay_has_real_relief_and_no_offshore_fill():
    meta = json.loads((PROCESSED_DIR / "topography.json").read_text(encoding="utf-8"))
    image = np.array(Image.open(PROCESSED_DIR / meta["image"]))
    assert image.shape == (meta["height"], meta["width"], 4)
    assert meta["bounds"] == [[STUDY_BBOX[1], STUDY_BBOX[0]], [STUDY_BBOX[3], STUDY_BBOX[2]]]
    assert meta["crs"] == "EPSG:3857"
    assert meta["observed_range_m"][1] > 300
    project = Transformer.from_crs(4326, 3857, always_xy=True).transform
    west, south = project(STUDY_BBOX[0], STUDY_BBOX[1])
    east, north = project(STUDY_BBOX[2], STUDY_BBOX[3])

    def pixel(lon, lat):
        x, y = project(lon, lat)
        return image[int((north-y)/(north-south)*meta["height"]), int((x-west)/(east-west)*meta["width"])]

    # Twin Peaks and downtown have different measured heights and colours; bay stays transparent.
    hill, low, bay = pixel(-122.4477, 37.7544), pixel(-122.3999, 37.7946), pixel(-122.36, 37.66)
    assert hill[3] == low[3] == 255
    assert not np.array_equal(hill[:3], low[:3])
    assert bay[3] == 0
    assert pixel(-122.496906, 37.727086)[3] == 0  # Verified interior of the county Lake Merced polygon.
    assert np.unique(image[image[..., 3] == 255, :3], axis=0).shape[0] > 100
