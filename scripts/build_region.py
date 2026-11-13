"""Bounded regional extension. Run explicitly, never during a frontend build.

Preserves all existing SF / northern Peninsula identifiers and measurements.
Adds urban parts of named Census places. Downloads are cached, individually
bounded and recorded. Missing indicators stay null, including police/crashes.
"""
from __future__ import annotations
import argparse
from datetime import datetime
import io
import json
import re
import zipfile
from pathlib import Path

import geopandas as gpd
import h3
import numpy as np
import pandas as pd
import requests
from shapely.geometry import Point, Polygon, shape, mapping, box
from shapely import make_valid, set_precision

from _common import METRIC_CRS, RAW_DIR, PROCESSED_DIR, rel, today, update_manifest, write_json, load_manifest

ROOT = RAW_DIR / 'region'
ROOT.mkdir(exist_ok=True)
PLACES = ['Millbrae', 'Burlingame', 'Hillsborough', 'San Mateo', 'Foster City', 'Belmont', 'San Carlos',
          'Redwood City', 'Atherton', 'Menlo Park', 'East Palo Alto', 'Palo Alto', 'Mountain View',
          'Los Altos', 'Los Altos Hills', 'Sunnyvale', 'Cupertino', 'Santa Clara', 'Berkeley',
          'Emeryville', 'Oakland', 'Alameda', 'San Leandro', 'San Lorenzo', 'Ashland', 'Cherryland',
          'Castro Valley', 'Hayward', 'Union City', 'Newark', 'Fremont']
EAST = set(PLACES[18:])
BBOX = (-122.55, 37.20, -121.80, 37.92)
SOURCE_LOG = json.loads((ROOT/'sources.json').read_text(encoding='utf-8')) if (ROOT/'sources.json').exists() else {}

def cached(name, url, *, params=None, cap=20_000_000):
    path = ROOT / name
    if not path.exists():
        response = requests.get(url, params=params, timeout=90, stream=True,
                                headers={'User-Agent': 'CommonGround-open-data-evaluation/1.0'})
        response.raise_for_status()
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > cap:
                raise ValueError(f'{name} exceeds bounded download: {cap}')
            chunks.append(chunk)
        raw = b''.join(chunks)
        if name.endswith('.json') or name.endswith('.geojson'):
            value = json.loads(raw)
            if 'error' in value: raise ValueError(f'{name}: source rejected query')
        path.write_bytes(raw)
    SOURCE_LOG[name] = {'url': url, 'bytes': path.stat().st_size, 'retrieved': SOURCE_LOG.get(name,{}).get('retrieved') or datetime.fromtimestamp(path.stat().st_mtime).date().isoformat(), 'verified': today()}
    print(f'{name}: {path.stat().st_size:,} bytes', flush=True)
    return path

def census(name, service, layer, where, geometry=None):
    params = {'f': 'geojson', 'where': where, 'outFields': '*', 'outSR': 4326,
              'returnGeometry': 'true', 'geometryPrecision': 5, 'maxAllowableOffset': .00002,
              'resultRecordCount': 5000}
    if geometry: params.update(geometry=','.join(map(str, geometry)), geometryType='esriGeometryEnvelope', inSR=4326, spatialRel='esriSpatialRelIntersects')
    return cached(name, f'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/{service}/MapServer/{layer}/query', params=params)

def fetch_sources():
    cached('places.zip', 'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_06_place_500k.zip')
    census('urban.geojson', 'Urban', 0, "NAME LIKE 'San Francisco%' OR NAME LIKE 'San Jose%'")
    census('tracts.geojson', 'Tracts_Blocks', 0, "STATE='06' AND COUNTY IN ('001','081','085')", BBOX)
    census('zcta.geojson', 'PUMA_TAD_TAZ_UGA_ZCTA', 1, '1=1', BBOX)
    for county in ['06001','06081','06085']:
        cached(f'water-{county}.zip',f'https://www2.census.gov/geo/tiger/TIGER2025/AREAWATER/tl_2025_{county}_areawater.zip')

def fc(frame):
    return json.loads(frame.to_crs(4326).to_json(drop_id=True))

def polygons(geom):
    geom = make_valid(geom)
    if geom.geom_type in ('Polygon', 'MultiPolygon'): return geom
    parts = [g for g in getattr(geom,'geoms',[]) if g.geom_type in ('Polygon', 'MultiPolygon')]
    from shapely.ops import unary_union
    return unary_union(parts)

def write_frame(frame, name):
    out = frame.to_crs(4326).copy()
    for field in ['residential','rail','residential_evidence','buffered','raised']:
        if field in out:
            out[field] = pd.Series([None if pd.isna(v) else bool(v) for v in out[field]],index=out.index,dtype=object)
    out['geometry'] = out.geometry.apply(lambda g: polygons(g) if g.geom_type not in ('Point','LineString','MultiLineString') else g)
    out['geometry'] = out.geometry.make_valid().apply(lambda g: set_precision(g,.00001))
    out = out[~out.geometry.is_empty]
    value = json.loads(out.to_json(drop_id=True, default=str))
    previous_path = PROCESSED_DIR / name
    if previous_path.exists():
        previous = json.loads(previous_path.read_text(encoding='utf-8'))
        if previous.get('meta'):
            value['meta'] = {**previous['meta'], 'regional_extension': 'Legacy fields describe the original extract; see regional_coverage.json and manifest regional_study for extended source coverage and dates.'}
    # Metre-scale coordinates are sufficient for these inputs, not new precision.
    def rounded(item):
        if isinstance(item, float): return round(item, 5)
        if isinstance(item, list): return [rounded(v) for v in item]
        if isinstance(item, dict): return {k: rounded(v) for k, v in item.items()}
        return item
    write_json(PROCESSED_DIR / name, rounded(value))
    return len(out)

def build_boundaries():
    places = gpd.read_file(ROOT / 'places.zip').to_crs(METRIC_CRS)
    places = places[places.NAME.isin(PLACES)].copy()
    missing = set(PLACES) - set(places.NAME)
    if missing: raise ValueError(f'Missing named places: {missing}')
    urban = gpd.read_file(ROOT / 'urban.geojson').to_crs(METRIC_CRS).geometry.union_all()
    existing = gpd.read_file(PROCESSED_DIR / 'neighbourhoods.geojson').to_crs(METRIC_CRS)
    existing = existing[~existing['id'].str.startswith('census-')].copy()
    seen = existing.geometry.union_all()
    water = gpd.GeoDataFrame(pd.concat([gpd.read_file(ROOT/f'water-{county}.zip').to_crs(METRIC_CRS) for county in ['06001','06081','06085']],ignore_index=True),crs=METRIC_CRS)
    water['geometry']=water.geometry.make_valid()
    water_index=water.sindex
    rows = []
    for _, p in places.sort_values('GEOID').iterrows():
        land = polygons(p.geometry.intersection(urban).difference(seen))
        hits=water_index.query(land,predicate='intersects')
        if len(hits):land=polygons(land.difference(water.iloc[hits].geometry.union_all()))
        if land.is_empty or land.area < 1000: continue
        label = gpd.GeoSeries([land.representative_point()], crs=METRIC_CRS).to_crs(4326).iloc[0]
        rows.append({'id': 'census-' + str(p.GEOID), 'name': p.NAME,
                     'region': 'east_bay' if p.NAME in EAST else 'peninsula',
                     'boundary_kind': 'Census city/community urban grouping', 'area_km2': round(land.area / 1e6, 3),
                     'label_lat': round(label.y, 5), 'label_lon': round(label.x, 5), 'geometry': land})
    added = gpd.GeoDataFrame(rows, crs=METRIC_CRS)
    combined = pd.concat([existing, added], ignore_index=True)
    write_frame(combined, 'neighbourhoods.geojson')
    study = gpd.GeoDataFrame([{'id': 'bay-urban-v1', 'name': 'Common Ground housing study boundary',
                              'geometry': polygons(combined.geometry.union_all())}], crs=METRIC_CRS)
    write_frame(study, 'study_boundary.geojson')
    return combined, added

def extend_cells(added):
    old = gpd.read_file(PROCESSED_DIR / 'area_cells.geojson').to_crs(METRIC_CRS)
    old = old[~old.nhood_id.str.startswith('census-')].copy()
    claimed = set(old.h3)
    candidates = set()
    for geom in added.to_crs(4326).geometry:
        seeds = h3.geo_to_cells(mapping(geom), 9)
        candidates.update(c for seed in seeds for c in h3.grid_disk(seed, 1))
    candidates -= claimed
    land = added.geometry.union_all()
    rows = []
    nulls = {key: None for key in old.columns if key not in ['geometry','h3','nhood_id','region','center_lat','center_lon','check_lat','check_lon','area_m2','land_share','residential','residential_reason']}
    index = added.sindex
    for cell in sorted(candidates):
        full = gpd.GeoSeries([Polygon([(lon,lat) for lat,lon in h3.cell_to_boundary(cell)])], crs=4326).to_crs(METRIC_CRS).iloc[0]
        clipped = polygons(full.intersection(land))
        if clipped.is_empty or clipped.area < 1000: continue
        hits = index.query(clipped, predicate='intersects')
        parent = max((added.iloc[i] for i in hits), key=lambda r: r.geometry.intersection(clipped).area)
        lat, lon = h3.cell_to_latlng(cell)
        centre = gpd.GeoSeries([Point(lon,lat)], crs=4326).to_crs(METRIC_CRS).iloc[0]
        check = centre if clipped.covers(centre) else clipped.representative_point()
        check = gpd.GeoSeries([check], crs=METRIC_CRS).to_crs(4326).iloc[0]
        rows.append({**nulls, 'h3': cell, 'nhood_id': parent.id, 'region': parent.region,
                     'center_lat': round(lat,6), 'center_lon': round(lon,6), 'check_lat': round(check.y,6), 'check_lon': round(check.x,6),
                     'area_m2': round(clipped.area), 'land_share': round(clipped.area/full.area,3),
                     'residential': None, 'residential_reason': 'Census urban land; housing use and parcels unverified',
                     'crime_source_h3': None, 'geometry': clipped})
    new = gpd.GeoDataFrame(rows, crs=METRIC_CRS)
    return old, new

def indicator_context(new, added):
    points = gpd.GeoDataFrame(geometry=gpd.points_from_xy(new.check_lon,new.check_lat), crs=4326).to_crs(METRIC_CRS)
    # Existing statewide CES pollution indicators, never the composite index.
    tracts = gpd.read_file(ROOT / 'tracts.geojson').to_crs(METRIC_CRS)
    ces = pd.read_csv(RAW_DIR / 'calenviroscreen50_070126.csv', dtype={'tract':str})
    ces['tract'] = ces.tract.str.zfill(11)
    columns = {'pmP':'ces_pm_pctl', 'dieselP':'ces_diesel_pctl', 'trafficP':'ces_traffic_pctl', 'ozoneP':'ces_ozone_pctl'}
    for source, target in columns.items():
        values = tracts.GEOID.map(ces.set_index('tract')[source]).apply(pd.to_numeric, errors='coerce')
        tracts[target] = values.where(values.between(0,100))
    tracts['geoid'] = tracts.GEOID
    joined = gpd.sjoin(points, tracts[['geoid','ces_pm_pctl','geometry']], how='left', predicate='within')
    joined = joined[~joined.index.duplicated()].reindex(new.index)
    new['tract_id'], new['pm25_percentile'] = joined.geoid, joined.ces_pm_pctl
    old_tracts = gpd.read_file(PROCESSED_DIR/'census_tracts.geojson').to_crs(METRIC_CRS)
    tracts['geometry']=tracts.to_crs(4326).geometry.intersection(box(*BBOX)).to_crs(METRIC_CRS)
    merged = gpd.GeoDataFrame(pd.concat([old_tracts,tracts[['geoid',*columns.values(),'geometry']]],ignore_index=True),crs=METRIC_CRS)
    merged['geometry']=merged.geometry.make_valid()
    write_frame(merged.dissolve(by='geoid',aggfunc='first',as_index=False), 'census_tracts.geojson')
    # Reuse the existing licensed raw ZORI table, preserving historical dates.
    rents_file = json.loads((PROCESSED_DIR/'rents_zori_zip.json').read_text(encoding='utf-8'))
    rents = pd.read_csv(RAW_DIR/'zillow_zori_zip.csv', dtype={'RegionName':str})
    rents = rents[(rents.State=='CA') & rents.CountyName.isin(['San Francisco County','San Mateo County','Santa Clara County','Alameda County'])]
    dates = [c for c in rents.columns if re.match(r'^\d{4}-\d{2}-\d{2}$',c)]
    for _, row in rents.iterrows():
        valid = [(d,float(row[d])) for d in dates if pd.notna(row[d])]
        if not valid: continue
        month, value = valid[-1]
        rents_file['zips'][row.RegionName] = {'city':row.City, 'latest_month':month[:7], 'latest':round(value), 'yoy_pct':None, 'series':{d[:7]:round(v) for d,v in valid[-24:]}}
    write_json(PROCESSED_DIR/'rents_zori_zip.json', rents_file)
    zcta = gpd.read_file(ROOT/'zcta.geojson').to_crs(METRIC_CRS)
    key = next(c for c in ['ZCTA5','ZCTA5CE20','GEOID'] if c in zcta.columns)
    joined = gpd.sjoin(points,zcta[[key,'geometry']],how='left',predicate='within')
    joined = joined[~joined.index.duplicated()].reindex(new.index)
    new['rent_zip'] = joined[key]
    new['zip_asking_rent'] = new.rent_zip.map(lambda z:rents_file['zips'].get(z,{}).get('latest'))
    return new

def build_assets(old, new, added):
    combined = pd.concat([old,new],ignore_index=True)
    combined['residential'] = pd.Series([None if pd.isna(v) else bool(v) for v in combined.residential],index=combined.index,dtype=object)
    write_frame(combined,'area_cells.geojson')
    metrics = json.loads((PROCESSED_DIR/'neighbourhood_metrics.json').read_text(encoding='utf-8'))
    content = json.loads((PROCESSED_DIR/'neighbourhood_content.json').read_text(encoding='utf-8'))
    samples = json.loads((PROCESSED_DIR/'neighbourhood_samples.json').read_text(encoding='utf-8'))
    crime = json.loads((PROCESSED_DIR/'crime_by_neighbourhood.json').read_text(encoding='utf-8'))
    for _, row in added.iterrows():
        cells = new[new.nhood_id.eq(row.id)]
        zipvalues = cells.dropna(subset=['zip_asking_rent','rent_zip'])
        entries = [{'zip':z,'share':round(len(g)/max(1,len(cells)),3),'latest':float(g.zip_asking_rent.iloc[0])} for z,g in zipvalues.groupby('rent_zip')]
        metrics['neighbourhoods'][row.id] = {'name':row['name'],'region':row.region,'boundary_kind':row.boundary_kind,'area_km2':row.area_km2,
            'crime':None,'collisions':None,'hills':None,'parks':None,'groceries':None,'transit':None,'cycling':None,'population':None,'food_drink':None,
            'environment':{'pm_pctl':None,'diesel_pctl':None,'traffic_pctl':None,'ozone_pctl':None,'pollution_burden_pctl':None},
            'rents':{'zips':entries,'typical_rent_zip_weighted':round(zipvalues.zip_asking_rent.mean()) if len(zipvalues) else None}}
        content['neighbourhoods'][row.id] = {'name':row['name'],'source_name':row['name'],'rental_search_name':row['name'],
            'description':'Census city/community urban grouping. Explore individual homes and verify local coverage; this is not a neighbourhood boundary.',
            'tags':[],'residential':True,'photos':[]}
        samples['neighbourhoods'][row.id] = cells[['check_lat','check_lon']].values.tolist()
        crime['neighbourhoods'][row.id] = None
    write_json(PROCESSED_DIR/'neighbourhood_metrics.json',metrics)
    write_json(PROCESSED_DIR/'neighbourhood_content.json',content)
    write_json(PROCESSED_DIR/'neighbourhood_samples.json',samples)
    write_json(PROCESSED_DIR/'crime_by_neighbourhood.json',crime)
    # Park-cut detailed footprints are requested by viewport partition. Existing
    # IDs and exact old footprints survive. New geometries use the same park mask.
    old_display = gpd.read_file(PROCESSED_DIR/'area_cell_display.geojson').to_crs(METRIC_CRS)
    old_display = old_display[old_display.h3.isin(old.h3)]
    parks = gpd.read_file(PROCESSED_DIR/'parks.geojson').to_crs(METRIC_CRS)[['geometry']]
    parks['geometry'] = parks.geometry.make_valid().apply(polygons)
    display = gpd.overlay(new[['h3','geometry']],parks,how='difference',keep_geom_type=True)
    display['geometry'] = display.geometry.apply(polygons)
    display = display[~display.geometry.is_empty]
    display = pd.concat([old_display,display],ignore_index=True)
    write_frame(display,'area_cell_display.geojson')
    display = gpd.read_file(PROCESSED_DIR/'area_cell_display.geojson').to_crs(METRIC_CRS)
    hidden = ~combined.h3.isin(set(display.h3))
    combined.loc[hidden,'residential'] = False
    combined.loc[hidden,'residential_reason'] = 'No displayable land after park masking and metre-scale geometry precision'
    write_frame(combined,'area_cells.geojson')
    tiles = PROCESSED_DIR/'cells'
    tiles.mkdir(exist_ok=True)
    partition = display.h3.map(lambda c:h3.cell_to_parent(c,5))
    catalogue = []
    for tile, frame in display.groupby(partition):
        bounds = frame.to_crs(4326).total_bounds.tolist()
        count = write_frame(frame,f'cells/{tile}.geojson')
        catalogue.append({'id':tile,'bounds':bounds,'count':count})
    canonical = json.loads((PROCESSED_DIR/'area_cells.geojson').read_text(encoding='utf-8'))
    properties = [f['properties'] for f in canonical['features']]
    columns = list(properties[0])
    # Only non-standard clipped boundary rings are stored in the compact index.
    # All other analytical H3 rings are regenerated once in the analysis worker.
    boundaries = {f['properties']['h3']:f['geometry'] for f in canonical['features'] if f['properties']['land_share'] < .999}
    write_json(PROCESSED_DIR/'candidate_index.json',{'version':1,'resolution':9,'columns':columns,'rows':[[r.get(c) for c in columns] for r in properties], 'boundaries':boundaries,'partitions':catalogue})
    print(f'Complete candidate index: {len(combined)} cells; {len(catalogue)} geometry partitions',flush=True)
    return len(combined),len(display),len(catalogue)

def manifest(counts, added):
    files=['neighbourhoods.geojson','study_boundary.geojson','area_cells.geojson','area_cell_display.geojson','candidate_index.json','census_tracts.geojson','rents_zori_zip.json','neighbourhood_metrics.json','neighbourhood_content.json']
    entry={'source':'US Census cartographic places / urban areas / 2025 area water; original DataSF and SMC boundaries retained; CES 5.0 and historical ZORI',
           'source_url':'https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html',
           'licence':'US Census public domain; CES portal licence unresolved (OEHHA attribution retained); Zillow terms and inherited source licences retained',
           'downloaded_at':today(),'measurement_period':'2025 places; 2020 urban footprint and tracts; CES 5.0; historical ZORI dates per ZIP',
           'resolution':'H3-9 representative points; city/community groups; tract pollution; ZIP rent',
           'feature_count':counts[0],'raw_path':rel(ROOT),'processed_path':[rel(PROCESSED_DIR/f) for f in files]+[rel(p) for p in (PROCESSED_DIR/'cells').glob('*.geojson')],
           'script':'scripts/build_region.py','refresh':'Explicitly refresh cached regional inputs, then run build_region.py and build_regional_context.py; never in request/build',
           'limitations':'New groups use Census urban land clipped to shoreline-generalised places minus TIGER area hydrography, not residential parcels. Unmapped water can remain. Richmond excluded. Non-SF police and crashes unknown. Regional street gradients not measured. Original fine boundaries and IDs retained.',
           'status':'processed','geography':PLACES,'downloads':SOURCE_LOG,'counts':{'candidates':counts[0],'display_cells':len(json.loads((PROCESSED_DIR/'area_cell_display.geojson').read_text(encoding='utf-8'))['features']),'partitions':counts[2]}}
    update_manifest('regional_study',entry)
    # Existing owning entries retain licences and source dates, and acknowledge
    # which builder extends their outputs instead of claiming their old counts.
    for key,owning in load_manifest().items():
        paths=owning.get('processed_path') or []
        if not paths or not paths[0].endswith('.geojson') or key=='regional_study':continue
        path=PROCESSED_DIR/Path(paths[0]).name
        if not path.exists():continue
        value=json.loads(path.read_text(encoding='utf-8'))
        update_manifest(key,{'feature_count':len(value['features']),'regional_extension':'See regional_study; build_region.py and regional context builders extend coverage without extrapolating municipal measurements'})
    write_json(ROOT/'sources.json',SOURCE_LOG)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--download-only',action='store_true');args=parser.parse_args()
    fetch_sources()
    if not args.download_only:
        all_places,added=build_boundaries();old,new=extend_cells(added);new=indicator_context(new,added)
        counts=build_assets(old,new,added);manifest(counts,added)
        print({'new_groups':len(added),'candidates':counts[0]})
