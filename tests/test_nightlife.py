"""Nightlife describes real mapped venue concentration, with a fixed ground-distance scale."""
import json

import numpy as np
from PIL import Image

from _common import PROCESSED_DIR, STUDY_BBOX
from build_nightlife import density_at


def test_density_uses_ground_metres_and_counts_every_venue_equally():
    xs, ys = np.array([0., 300., 1000.]), np.zeros(3)
    density = density_at(xs, ys, [(0,0)])
    assert np.isclose(density[0], 1/(2*np.pi*0.3**2))
    assert np.isclose(density[1], density[0]*np.exp(-0.5))
    assert density[2] == 0
    assert np.allclose(density_at(xs, ys, [(0,0),(0,0)]), 2*density)


def test_nightlife_overlay_has_all_types_real_density_and_transparent_water():
    meta = json.loads((PROCESSED_DIR/'nightlife.json').read_text(encoding='utf-8'))
    venues = json.loads((PROCESSED_DIR/'nightlife_venues.geojson').read_text(encoding='utf-8'))['features']
    assert meta['venue_count'] == len(venues) > 500
    assert {f['properties']['kind'] for f in venues} == {'bar','pub','nightclub'}
    assert meta['kinds']['nightclub'] > 0
    assert len({f['properties']['osm_id'] for f in venues}) == len(venues)
    assert any(f['geometry']['coordinates'][1] < 37.70 for f in venues)
    assert meta['sigma_m'] == 300 and meta['crs'] == 'EPSG:3857'
    assert meta['bounds'] == [[STUDY_BBOX[1],STUDY_BBOX[0]],[STUDY_BBOX[3],STUDY_BBOX[2]]]
    image = np.array(Image.open(PROCESSED_DIR/meta['image']))
    assert image.shape == (meta['height'],meta['width'],4)
    assert image[...,3].max() > 150
    assert (image[...,3] == 0).sum() > image.shape[0]*image.shape[1]/2
    assert meta['max_density'] > 40
    from pyproj import Transformer
    project = Transformer.from_crs(4326, 3857, always_xy=True).transform
    west, south = project(STUDY_BBOX[0], STUDY_BBOX[1])
    east, north = project(STUDY_BBOX[2], STUDY_BBOX[3])
    for lon, lat in [(-122.36,37.66),(-122.496906,37.727086)]:
        x,y = project(lon,lat)
        assert image[int((north-y)/(north-south)*meta['height']),int((x-west)/(east-west)*meta['width']),3] == 0


def test_residential_area_cards_have_local_credited_photos_and_names_keep_source_ids():
    from pathlib import Path
    content=json.loads((PROCESSED_DIR/'neighbourhood_content.json').read_text(encoding='utf-8'))['neighbourhoods']
    for value in content.values():
        if value['residential']:
            photo=value['photos'][0]
            assert photo['credit'] and photo['licence'] and photo['page']
            assert (Path(__file__).resolve().parents[1]/'public'/photo['local']).is_file()
    assert content['unincorporated-colma']['name'] == 'Colma station area'
    assert content['unincorporated-colma']['source_name'] == 'Unincorporated Colma'
    assert content['northern-peninsula-unincorporated-areas']['name'] == 'San Bruno hills & county land'
