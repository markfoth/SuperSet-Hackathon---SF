"""Bounded CPAD 2026a public-access park polygons, CC BY / GreenInfo Network."""
import json
import geopandas as gpd
import pandas as pd
from _common import METRIC_CRS, PROCESSED_DIR, rel, today, update_manifest, write_json
from build_region import ROOT, BBOX, cached, write_frame, polygons

URL='https://gis.cnra.ca.gov/arcgis/rest/services/Boundaries/CPAD_AccessType/MapServer/0/query'
if __name__=='__main__':
    params={'f':'json','where':"ACCESS_TYP='Open Access'",'geometry':','.join(map(str,BBOX)),
            'geometryType':'esriGeometryEnvelope','inSR':4326,'spatialRel':'esriSpatialRelIntersects','returnIdsOnly':'true'}
    ids=json.loads(cached('cpad-ids.json',URL,params=params).read_text(encoding='utf-8'))['objectIds']
    if len(ids)>10000:raise ValueError('CPAD query exceeds 10,000-feature bound')
    rows=[]
    for start in range(0,len(ids),100):
        path=cached(f'cpad-page-{start}.geojson',URL,params={'f':'geojson','objectIds':','.join(map(str,ids[start:start+100])),
            'outFields':'*','returnGeometry':'true','outSR':4326,'geometryPrecision':5,'maxAllowableOffset':.00002},cap=8_000_000)
        part=gpd.read_file(path);rows.append(part)
    parks=gpd.GeoDataFrame(pd.concat(rows,ignore_index=True),crs=4326).to_crs(METRIC_CRS)
    places=gpd.read_file(PROCESSED_DIR/'neighbourhoods.geojson').to_crs(METRIC_CRS)
    added=places[places.id.str.startswith('census-')][['geometry']].copy()
    added['geometry']=added.geometry.make_valid()
    parks['geometry']=parks.geometry.make_valid().apply(polygons)
    parks=parks[~parks.geometry.is_empty]
    access_parks=parks[['geometry']].copy()
    parks=gpd.overlay(parks,added,how='intersection',keep_geom_type=True)
    parks=parks[~parks.geometry.is_empty & (parks.area>=2023)].copy()
    name=next(c for c in ['UNIT_NAME','SITE_NAME','NAME'] if c in parks)
    parks['name']=parks[name];parks['source']='CPAD 2026a / GreenInfo Network';parks['acres']=parks.area/4046.86
    parks['cpad_id']='cpad:'+parks.index.astype(str)
    old=gpd.read_file(PROCESSED_DIR/'parks.geojson').to_crs(METRIC_CRS)
    if 'cpad_id' in old:old=old[old.cpad_id.isna()]
    write_frame(pd.concat([old,parks[['name','source','acres','cpad_id','geometry']]],ignore_index=True),'parks.geojson')
    cells=gpd.read_file(PROCESSED_DIR/'area_cells.geojson').to_crs(METRIC_CRS)
    cells['residential']=pd.Series([None if pd.isna(v) else bool(v) for v in cells.residential],index=cells.index,dtype=object)
    new=cells.nhood_id.str.startswith('census-')
    points=gpd.GeoDataFrame(geometry=gpd.points_from_xy(cells.loc[new,'check_lon'],cells.loc[new,'check_lat']),index=cells[new].index,crs=4326).to_crs(METRIC_CRS)
    joined=gpd.sjoin_nearest(points,access_parks,how='left',distance_col='distance')
    cells.loc[new,'park_distance_m']=joined.groupby(level=0).distance.min().reindex(cells[new].index).round()
    mask=parks.geometry.union_all()
    cells.loc[new,'park_land_share']=(cells[new].geometry.intersection(mask).area/cells[new].area).round(3)
    # Park-only cells cannot be promoted to housing recommendations. Mixed
    # edges stay uncertain, with the original representative location retained.
    park_only=new & (cells.park_land_share>=.95)
    cells.loc[park_only,'residential']=False
    cells.loc[park_only,'residential_reason']='At least 95% CPAD open-access park; housing use unverified'
    write_frame(cells,'area_cells.geojson')
    report=json.loads((PROCESSED_DIR/'regional_coverage.json').read_text(encoding='utf-8'))
    report['parks']={'status':'processed','source':'CPAD 2026a / GreenInfo Network','features':len(parks),'licence':'CC BY; no restrictions on public use','url':'https://data.ca.gov/@california-natural-resources-agency/california-protected-areas-database'}
    write_json(PROCESSED_DIR/'regional_coverage.json',report)
    update_manifest('regional_public_parks',{'source':'California Protected Areas Database 2026a / GreenInfo Network','source_url':report['parks']['url'],
      'licence':'Creative Commons Attribution; no restrictions on public use (CNRA catalogue)','downloaded_at':today(),'measurement_period':'CPAD 2026a; service copyright June 2026',
      'resolution':'Public-access park/open-space ownership polygons clipped to new urban study groups; 1 m coordinate rounding','feature_count':None,
      'raw_path':rel(ROOT),'processed_path':[rel(PROCESSED_DIR/'parks.geojson')],'script':'scripts/build_regional_parks.py',
      'refresh':'Semiannual CPAD release; refresh cached ID and page files, rebuild parks then pack_region.py and pack_context.py',
      'limitations':'Open Access only. Ownership does not establish an entrance, route, operating hours or barrier-free access. Excludes easements and private/restricted holdings.','status':'processed'})
    print({'regional_public_parks':len(parks),'park_only_cells':int(park_only.sum())})
