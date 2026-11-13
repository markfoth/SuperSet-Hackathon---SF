"""Region-wide correctness independent of viewport geometry and missing sources."""
import json
from shapely.geometry import shape,Point
from _common import PROCESSED_DIR

def load(name):return json.loads((PROCESSED_DIR/name).read_text(encoding='utf-8'))

def test_explicit_urban_boundary_covers_requested_centres_and_excludes_richmond_and_water():
    boundary=shape(load('study_boundary.geojson')['features'][0]['geometry']).buffer(.000001)
    for name,xy in {'Santa Clara':(-121.9552,37.3541),'Palo Alto':(-122.143,37.4419),'San Mateo':(-122.3255,37.563),
                    'Fremont':(-121.9886,37.5485),'Hayward':(-122.0808,37.6688),'Oakland':(-122.2712,37.8044),
                    'Berkeley':(-122.273,37.8715)}.items():assert boundary.covers(Point(*xy)),name
    for xy in [(-122.3477,37.9358),(-122.30,37.70),(-118.54,34.39),(-122.255,37.804),(-122.26,37.555),(-121.96177,37.54842)]:assert not boundary.covers(Point(*xy))

def test_complete_index_preserves_boolean_unknown_and_all_canonical_ids():
    index=load('candidate_index.json');columns=index['columns'];items=[dict(zip(columns,row)) for row in index['rows']]
    cells=load('area_cells.geojson')['features'];ids={f['properties']['h3'] for f in cells}
    assert len(items)==len(ids)>10_000
    assert {row['h3'] for row in items}==ids
    assert all(row['residential'] is None or type(row['residential']) is bool for row in items)
    regional=[row for row in items if row['nhood_id'].startswith('census-')]
    assert all(row['incidents_per_km2'] is None and row['street_grade_pct'] is None for row in regional)
    assert any(row['park_distance_m'] is not None for row in regional)
    assert any(row['rent_zip'] and row['zip_asking_rent'] is not None for row in regional)
    assert any(row['tract_id'] and row['pm25_percentile'] is not None for row in regional)
    assert all(row['pm25_percentile'] is None or 0<=row['pm25_percentile']<=100 for row in items)
    all_display=set()
    for part in index['partitions']:
        path=PROCESSED_DIR/'cells'/f"{part['id']}.geojson"
        assert path.stat().st_size<1_500_000
        features=json.loads(path.read_text(encoding='utf-8'))['features']
        assert len(features)==part['count']
        current={f['properties']['h3'] for f in features};assert not all_display&current;all_display|=current
    assert all_display<ids

def test_crime_column_geometries_have_three_geographic_levels_and_fixed_scales():
    data=load('incident_columns.json')
    assert {f['properties']['resolution'] for f in data['features']}=={6,7,8}
    assert len({f['properties']['h3'] for f in data['features']})==len(data['features'])
    assert data['meta']['scales']=={'6':.05,'7':.05,'8':.05}
    source=load('incident_details.json')
    assert {point[2] for point in source['locations']}==set(data['parents'])
    assert all(len(parents)==2 for parents in data['parents'].values())
