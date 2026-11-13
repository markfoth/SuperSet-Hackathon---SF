import json
from pathlib import Path
from shapely.geometry import shape

ROOT=Path(__file__).resolve().parents[1]/'data/sf/processed'

def test_actual_context_assets_have_source_metadata_and_nonempty_records():
    for name,key in [('daily_essentials','places'),('muni_service','stops'),('flood_context','features')]:
        data=json.loads((ROOT/f'{name}.json').read_text(encoding='utf-8'))
        assert len(data[key])>100
        for field in ['source','source_url','licence','downloaded_at','observation_period','coverage','units','limitations']:
            assert data[field]

def test_flood_geometries_are_valid_and_bounded_without_reclassifying_zones():
    data=json.loads((ROOT/'flood_context.json').read_text(encoding='utf-8'))
    for feature in data['features']:
        geometry=shape(feature['geometry'])
        assert geometry.is_valid and not geometry.is_empty
        assert geometry.geom_type in ('Polygon','MultiPolygon')
        w,s,e,n=geometry.bounds
        assert -122.551<=w<=e<=-122.329 and 37.599<=s<=n<=37.841
        assert feature['properties'].get('FLD_ZONE')

def test_transit_keeps_calendars_and_overnight_hours_instead_of_inventing_live_frequency():
    data=json.loads((ROOT/'muni_service.json').read_text(encoding='utf-8'))
    assert data['calendar'] and data['exceptions']
    assert any(c['end_date']>='20261112' for c in data['calendar'])
    assert any(hour>=24 for stop in data['stops'] for _,hour,_ in stop['departures'])
    for stop in data['stops']:
        for service,hour,count in stop['departures']:
            assert 0<=service<len(data['services']) and 0<=hour<48 and count>0
