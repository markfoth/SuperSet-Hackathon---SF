"""Continuous rendering terrain must not regress to a clipped analytical DEM."""
import json
from _common import PROCESSED_DIR, load_manifest

def test_continuous_terrarium_contract_and_normal_vertical_scale():
    meta=json.loads((PROCESSED_DIR/'regional_terrain.json').read_text(encoding='utf-8'))
    assert meta['encoding']=='terrarium' and meta['tileSize']==512
    assert meta['scheme']=='xyz' and meta['minzoom']==0 and meta['maxzoom']==12
    assert meta['exaggeration']==1
    assert meta['bounds'][0]<=-180 and meta['bounds'][2]>=180
    assert all('tiles.mapterhorn.com/' in tile for tile in meta['tiles'])
    assert 'USGS' in meta['attribution'] and meta['regional_sources']
    owning=load_manifest()['regional_terrain']
    assert owning['processed_path']==['data/sf/processed/regional_terrain.json']
    assert 'street' in owning['limitations']
