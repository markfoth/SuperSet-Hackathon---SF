"""Explicit, bounded regional OSM/GTFS preparation. No runtime Overpass calls.
Run after build_region.py. Optional failures are recorded, never invented.
"""
from __future__ import annotations
import io
import json
import zipfile
from datetime import date
import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import Point, Polygon, LineString
from shapely import make_valid
from _common import METRIC_CRS, RAW_DIR, PROCESSED_DIR, today, rel, update_manifest, write_json
from build_region import ROOT, cached, write_frame, polygons
from poi_metadata import poi_metadata

AGENCIES = {
 'BART': ('https://www.bart.gov/dev/schedules/google_transit.zip','https://www.bart.gov/schedules/developers/gtfs'),
 'Caltrain': ('https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip','https://www.caltrain.com/developer-resources'),
 'SamTrans': ('https://www.samtrans.com/media/37770/download','https://www.samtrans.com/developer'),
 'AC Transit': ('https://api.actransit.org/transit/gtfs/current','https://www.actransit.org/data-api-resource-center'),
 'VTA': ('https://gtfs.vta.org/gtfs_vta.zip','https://s3-us-west-2.amazonaws.com/gis-open-data-portal/Open_Data_Policy.pdf'),
}

def overpass(name, selectors, *, geometry=False):
    path = ROOT / name
    if path.exists(): return json.loads(path.read_text(encoding='utf-8'))
    bbox='37.20,-122.55,37.92,-121.80'
    query='[out:json][timeout:100];('+''.join(f'{s}({bbox});' for s in selectors)+');out '+('geom' if geometry else 'center')+';'
    failure=None
    for host in ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']:
        try:
            response=requests.post(host,data={'data':query},timeout=115,stream=True)
            response.raise_for_status();chunks=[];size=0
            for chunk in response.iter_content(65536):
                size+=len(chunk)
                if size>25_000_000: raise ValueError('OSM download exceeds 25 MB bound')
                chunks.append(chunk)
            data=json.loads(b''.join(chunks))
            if data.get('remark'): raise ValueError('Overpass did not complete query')
            path.write_text(json.dumps(data),encoding='utf-8')
            print(f'{name}: {size:,} bytes',flush=True)
            return data
        except Exception as e: failure=type(e).__name__;print(f'{name}: {failure}; trying next public mirror',flush=True)
    raise RuntimeError(f'Bounded OSM query unavailable: {failure}')

def osm_context(land):
    summaries={}
    sets=[('amenities.json',['nwr[shop~"^(supermarket|grocery|convenience)$"]','nwr[amenity~"^(cafe|restaurant|bar|pub|nightclub)$"]'],False),
          ('parks.json',['way[leisure~"^(park|garden|nature_reserve)$"]'],True),
          ('cycling.json',['way[highway=cycleway]','way[cycleway~"^(lane|track)$"]','way["cycleway:left"~"^(lane|track)$"]','way["cycleway:right"~"^(lane|track)$"]'],True)]
    for name,selectors,geometry in sets:
        try: data=overpass(name,selectors,geometry=geometry)
        except Exception as e: summaries[name]={'status':'blocked','reason':str(e)};continue
        rows={}
        for element in data['elements']:
            tags=element.get('tags',{});key=f"{element['type']}/{element['id']}"
            if geometry:
                coords=[(p['lon'],p['lat']) for p in element.get('geometry',[]) if 'lon' in p and 'lat' in p]
                if len(coords)<2: continue
                if name=='parks.json':
                    if len(coords)<4 or coords[0]!=coords[-1]: continue
                    geom=make_valid(Polygon(coords))
                else: geom=LineString(coords)
            else:
                centre=element.get('center',element)
                if 'lon' not in centre or 'lat' not in centre: continue
                geom=Point(centre['lon'],centre['lat'])
            rows[key]={'osm_id':key,'name':tags.get('name','Unnamed mapped place'),'shop':tags.get('shop'),
                       'amenity':tags.get('amenity'),'cat':'path' if tags.get('highway')=='cycleway' else 'protected' if 'track' in str(tags) else 'lane',
                       'source':'OpenStreetMap','website':tags.get('website') or tags.get('contact:website'),'geometry':geom}
        if not rows: summaries[name]={'status':'blocked','reason':'No usable geometries'};continue
        frame=gpd.GeoDataFrame(list(rows.values()),crs=4326).to_crs(METRIC_CRS)
        frame=frame[frame.geometry.intersects(land)].copy()
        files = [('groceries.geojson',frame[frame.shop.notna()]),('cafes.geojson',frame[frame.amenity.eq('cafe')]),
                 ('restaurants.geojson',frame[frame.amenity.eq('restaurant')]),('nightlife_venues.geojson',frame[frame.amenity.isin(['bar','pub','nightclub'])])] if name=='amenities.json' else [('parks.geojson',frame)] if name=='parks.json' else [('cycling_network.geojson',frame)]
        for filename,features in files:
            old=gpd.read_file(PROCESSED_DIR/filename).to_crs(METRIC_CRS)
            # Keep existing richer records. Merge by mapped source identity.
            seen=set(old.osm_id.astype(str)) if 'osm_id' in old else set()
            features=features[~features.osm_id.isin(seen)].copy()
            if geometry: features['geometry']=features.geometry.intersection(land)
            if filename=='parks.geojson':
                features['acres']=features.area/4046.86
                features=features[features.area>=2023]
            write_frame(pd.concat([old,features],ignore_index=True),filename)
        summaries[name]={'status':'processed','retrieved':data.get('osm3s',{}).get('timestamp_osm_base'),'elements':len(frame)}
    return summaries

def gtfs_context(land):
    all_stops=[];all_routes=[];reports={}
    context_land=land.buffer(800).simplify(10,preserve_topology=True)
    for agency,(url,licence) in AGENCIES.items():
        name='gtfs-'+agency.lower().replace(' ','-')+'.zip'
        try:
            path=cached(name,url,cap=25_000_000)
            archive=zipfile.ZipFile(path)
            def table(name): return pd.read_csv(archive.open(name),dtype=str).fillna('') if name in archive.namelist() else pd.DataFrame()
            stops,routes,trips,shapes=table('stops.txt'),table('routes.txt'),table('trips.txt'),table('shapes.txt')
            calendars,exceptions=table('calendar.txt'),table('calendar_dates.txt')
            starts=calendars.start_date.tolist() if len(calendars) else []
            ends=calendars.end_date.tolist() if len(calendars) else []
            if len(exceptions): starts+=exceptions.date.tolist();ends+=exceptions.date.tolist()
            start,end=min(starts),max(ends)
            status='current' if start<=today().replace('-','')<=end else 'out-of-date'
            points=gpd.GeoDataFrame(stops,geometry=gpd.points_from_xy(pd.to_numeric(stops.stop_lon),pd.to_numeric(stops.stop_lat)),crs=4326).to_crs(METRIC_CRS)
            points=points[points.geometry.intersects(context_land)]
            rail_stops=set()
            if agency=='VTA':
                rail_routes=set(routes[routes.route_type.isin(['0','1','2'])].route_id)
                rail_trips=set(trips[trips.route_id.isin(rail_routes)].trip_id)
                times=pd.read_csv(archive.open('stop_times.txt'),usecols=['trip_id','stop_id'],dtype=str)
                rail_stops=set(times[times.trip_id.isin(rail_trips)].stop_id)
            for _,row in points.iterrows():
                all_stops.append({'id':f'{agency}:{row.stop_id}','name':row.stop_name,'agency':agency,'rail':agency in ['BART','Caltrain'] or row.stop_id in rail_stops,
                                  'weekday_departures':None,'routes':'See agency timetable','timetable_status':status,'geometry':row.geometry})
            if len(shapes):
                # All published routes, simplified only for visual context.
                trip_routes=trips.drop_duplicates('shape_id').set_index('shape_id').route_id
                route_lookup=routes.set_index('route_id')
                for sid,group in shapes.groupby('shape_id',sort=False):
                    group=group.assign(order=pd.to_numeric(group.shape_pt_sequence)).sort_values('order')
                    coords=list(zip(pd.to_numeric(group.shape_pt_lon),pd.to_numeric(group.shape_pt_lat)))
                    if len(coords)<2:continue
                    geom=gpd.GeoSeries([LineString(coords)],crs=4326).to_crs(METRIC_CRS).iloc[0]
                    if not geom.intersects(context_land):continue
                    rid=trip_routes.get(sid)
                    r=route_lookup.loc[rid] if rid in route_lookup.index else {}
                    mode='bart' if agency=='BART' else 'caltrain' if agency=='Caltrain' else 'light_rail' if str(r.get('route_type')) in ['0','1','2'] else 'bus'
                    all_routes.append({'agency':agency,'id':f'{agency}:{sid}','short_name':r.get('route_short_name',''),'long_name':r.get('route_long_name',''),
                                       'mode':mode,'timetable_status':status,'geometry':geom.intersection(context_land).simplify(12)})
            reports[agency]={'status':status,'start':start,'end':end,'licence':licence,'url':url,'stops_in_region':len(points)}
        except Exception as e: reports[agency]={'status':'blocked','reason':type(e).__name__,'url':url,'licence':licence}
    old_stops=gpd.read_file(PROCESSED_DIR/'transit_stops.geojson').to_crs(METRIC_CRS)
    old_routes=gpd.read_file(PROCESSED_DIR/'transit_routes.geojson').to_crs(METRIC_CRS)
    # Retain Muni's published expired feed honestly. Updated feeds replace only
    # the agency whose complete parse succeeded.
    succeeded={a for a,r in reports.items() if r['status'] in ['current','out-of-date']}
    old_stops=old_stops[~old_stops.agency.isin(succeeded)]
    old_routes=old_routes[~old_routes.agency.isin(succeeded)]
    write_frame(pd.concat([old_stops,gpd.GeoDataFrame(all_stops,crs=METRIC_CRS)],ignore_index=True),'transit_stops.geojson')
    write_frame(pd.concat([old_routes,gpd.GeoDataFrame(all_routes,crs=METRIC_CRS)],ignore_index=True),'transit_routes.geojson')
    reports['Muni']={'status':'out-of-date','source':'Existing licensed SFMTA feed retained; see manifest transit entry for dates','licence':'https://www.sfmta.com/reports/gtfs-transit-data'}
    return reports

def measurements(osm, gtfs):
    cells=gpd.read_file(PROCESSED_DIR/'area_cells.geojson').to_crs(METRIC_CRS)
    new=cells.nhood_id.str.startswith('census-')
    points=gpd.GeoDataFrame(geometry=gpd.points_from_xy(cells.check_lon,cells.check_lat),crs=4326).to_crs(METRIC_CRS)
    for filename,field,filter_field,values in [('parks.geojson','park_distance_m',None,None),('groceries.geojson','grocery_distance_m','shop',['supermarket']),
      ('cycling_network.geojson','cycling_distance_m','cat',['lane','protected','path']),('transit_stops.geojson','rail_distance_m','rail',[True])]:
        source = 'parks.json' if filename=='parks.geojson' else 'amenities.json' if filename=='groceries.geojson' else 'cycling.json'
        if filename!='transit_stops.geojson' and osm.get(source,{}).get('status')!='processed':
            cells.loc[new,field]=None
            continue
        layer=gpd.read_file(PROCESSED_DIR/filename).to_crs(METRIC_CRS)
        if filter_field:layer=layer[layer[filter_field].isin(values)]
        if layer.empty:continue
        joined=gpd.sjoin_nearest(points[new],layer[['geometry']],how='left',distance_col='distance')
        distance=joined.groupby(level=0).distance.min()
        cells.loc[new,field]=distance.reindex(cells[new].index).round()
    # Frequent departures require an actual service-day calculation, not stop count.
    cells.loc[new,'frequent_distance_m']=None
    write_frame(cells,'area_cells.geojson')

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--measure-only',action='store_true');args=parser.parse_args()
    if args.measure_only:
        report=json.loads((PROCESSED_DIR/'regional_coverage.json').read_text(encoding='utf-8'))
        measurements(report['osm'],report['gtfs'])
        print('Refreshed representative-point access from existing context; no downloads')
        raise SystemExit(0)
    land=gpd.read_file(PROCESSED_DIR/'study_boundary.geojson').to_crs(METRIC_CRS).geometry.make_valid().union_all()
    osm=osm_context(land);gtfs=gtfs_context(land);measurements(osm,gtfs)
    report={'osm':osm,'gtfs':gtfs,'retrieved':today(),'limitations':'Mapped access is straight-line context. Regional frequent-service and street gradients unmeasured. Municipal police/crashes outside SF unknown.'}
    write_json(PROCESSED_DIR/'regional_coverage.json',report)
    update_manifest('regional_context',{'source':'OpenStreetMap and individual published agency GTFS','source_url':'https://www.openstreetmap.org/copyright',
      'licence':'OSM ODbL 1.0; GTFS agency licences linked individually in regional_coverage.json', 'downloaded_at':today(),
      'measurement_period':'OSM retrieval date and per-feed calendar dates in regional_coverage.json','resolution':'Mapped features and stops; straight-line representative-point access',
      'feature_count':None,'raw_path':rel(ROOT),'processed_path':[rel(PROCESSED_DIR/'regional_coverage.json')],
      'script':'scripts/build_regional_context.py','refresh':'Explicitly refresh cached OSM/GTFS files, run this script then pack_region.py',
      'limitations':report['limitations'],'status':'processed','source_status':report})
    print(json.dumps(report,indent=2))
