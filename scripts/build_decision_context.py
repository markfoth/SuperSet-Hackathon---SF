"""Bounded, cached public-source context. No runtime API or credentials.
Run with --refresh to replace cached inputs. Source failures stop publication.
"""
import argparse, csv, io, json, zipfile
from datetime import datetime, timezone
from pathlib import Path
import requests
from _common import PROCESSED_DIR, RAW_DIR, update_manifest, rel

BOUNDS = [-122.55, 37.60, -122.33, 37.84]
FOLDER = RAW_DIR / 'regional'
SOURCE_DATES = []
SESSION = requests.Session()
SESSION.headers['User-Agent'] = 'CommonGround-regional-context/1.0 (bounded open-data research)'

def cached(name, url, refresh, params=None):
    path = FOLDER / name
    if refresh or not path.exists():
        response = SESSION.get(url, params=params, timeout=120)
        response.raise_for_status()
        path.write_bytes(response.content)
    SOURCE_DATES.append(datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).date().isoformat())
    return path

def publish(name, value, source, url, licence, period, units, limitations):
    path = PROCESSED_DIR / f'{name}.json'
    stamp = min(SOURCE_DATES)
    count = len(value.get('places', value.get('stops', value.get('features', []))))
    value.update(source=source, source_url=url, licence=licence, downloaded_at=stamp,
                 observation_period=period, coverage=BOUNDS, units=units, limitations=limitations)
    path.write_text(json.dumps(value, separators=(',', ':'), ensure_ascii=False), encoding='utf-8')
    update_manifest(name, dict(source=source, source_url=url, licence=licence, downloaded_at=stamp,
        measurement_period=period, resolution=units, feature_count=count, raw_path=rel(FOLDER),
        processed_path=[rel(path)], script='scripts/build_decision_context.py', status='processed',
        refresh='python scripts/build_decision_context.py --refresh', limitations=limitations))
    print(name, count, path.stat().st_size)
    SOURCE_DATES.clear()

def amenities(refresh):
    url = 'https://overpass-api.de/api/interpreter'
    query = ('[out:json][timeout:90];way[leisure=park](37.60,-122.55,37.84,-122.33)->.parks;'
        '(nwr[amenity~"^(pharmacy|library|marketplace)$"](37.60,-122.55,37.84,-122.33);'
        'nwr[leisure=fitness_centre](37.60,-122.55,37.84,-122.33);'
        'nwr[shop~"^(supermarket|convenience|greengrocer)$"](37.60,-122.55,37.84,-122.33);'
        '.parks;node(w.parks)[entrance][access!=private][access!=no];);out body center;')
    path = cached('essentials_osm_v2.json', url, refresh, {'data':query})
    raw = json.loads(path.read_text(encoding='utf-8'))
    if raw.get('remark'): raise ValueError('Overpass incomplete response: '+raw['remark'])
    places = []
    parks_by_node = {node: e.get('tags', {}).get('name', 'Mapped park') for e in raw['elements']
                     if e.get('tags', {}).get('leisure') == 'park' for node in e.get('nodes', [])}
    for element in raw['elements']:
        tags = element.get('tags', {})
        # Building entrances are not labelled as park entrances without evidence.
        kind = tags.get('amenity') if tags.get('amenity') in ('pharmacy','library','marketplace') else ('groceries' if tags.get('shop') else 'gym' if tags.get('leisure') == 'fitness_centre' else 'park' if tags.get('leisure') == 'park' else 'park entrance')
        if kind == 'park entrance' and element['id'] not in parks_by_node: continue
        pos = element.get('center', element)
        if 'lat' not in pos: continue
        label = tags.get('name') or (parks_by_node.get(element['id'], 'Mapped park') + ' entrance' if kind == 'park entrance' else kind)
        # Merge duplicate named point/area representations within 30 m.
        if any(p['kind'] == kind and p['name'] == label and
               ((p['lat']-pos['lat'])**2+((p['lon']-pos['lon'])*0.79)**2)**0.5*111200 < 30 for p in places): continue
        places.append(dict(id=f"{element['type']}/{element['id']}",name=label,
            kind=kind, lat=pos['lat'], lon=pos['lon'], wheelchair=tags.get('wheelchair'), hours=tags.get('opening_hours')))
    publish('daily_essentials', dict(places=places), 'OpenStreetMap contributors', url,
        'ODbL 1.0; https://www.openstreetmap.org/copyright', raw['osm3s']['timestamp_osm_base'],
        'Mapped points or polygon centres, WGS84; distance in metres',
        'Volunteer mapping is incomplete. Park entrances are tagged nodes on mapped park boundaries, not surveyed accessible routes. Park points are polygon centres, not access points. Opening hours and accessibility may be missing. Proximity is not network walking time.')

def transit(refresh):
    meta = json.loads(cached('muni_metadata.json', 'https://data.sf.gov/api/views/dni7-qpv3.json', refresh).read_text(encoding='utf-8'))
    url = f"https://data.sf.gov/api/views/dni7-qpv3/files/{meta['blobId']}?download=true"
    path = cached('muni_current.zip', url, refresh)
    with zipfile.ZipFile(path) as archive:
        def table(name):
            if name not in archive.namelist(): return iter(())
            return csv.DictReader(io.TextIOWrapper(archive.open(name), encoding='utf-8-sig'))
        calendars, exceptions = list(table('calendar.txt')), list(table('calendar_dates.txt'))
        stops = {s['stop_id']:s for s in table('stops.txt') if BOUNDS[0] <= float(s.get('stop_lon') or 0) <= BOUNDS[2] and BOUNDS[1] <= float(s.get('stop_lat') or 0) <= BOUNDS[3]}
        trips = {t['trip_id']: t['service_id'] for t in table('trips.txt')}
        # Compact service/hour counts preserve calendars for day-specific selection.
        counts = {}
        for row in table('stop_times.txt'):
            if row['stop_id'] not in stops: continue
            service = trips.get(row['trip_id'])
            if not service: continue
            time = row.get('departure_time') or row.get('arrival_time')
            if not time: continue  # An unspecified stop time is not a midnight departure.
            hour = int(time.split(':')[0])
            if not 0 <= hour < 48: raise ValueError('Unsupported GTFS hour')
            key = (row['stop_id'],service,hour)
            counts[key] = counts.get(key,0)+1
        service_ids = sorted(set(trips.values()))
        index = {s:i for i,s in enumerate(service_ids)}
        departures = {sid:[] for sid in stops}
        for (sid,service,hour), count in counts.items():
            departures[sid].append([index[service],hour,count])
        output=[]
        for id, stop in stops.items():
            output.append(dict(id=id,name=stop['stop_name'],lat=float(stop['stop_lat']),lon=float(stop['stop_lon']),
                departures=departures[id]))
    publish('muni_service', dict(stops=output, services=service_ids, calendar=calendars, exceptions=exceptions, feed=meta['blobFilename']),
        'SFMTA official GTFS via DataSF', url, 'SFMTA Transit Data Licence; required notice retained in About the data',
        meta['blobFilename'], 'Scheduled departures per stop, service ID and GTFS hour (including 24+ hours)',
        'Muni only; not real-time or reliability. Other agencies remain in the existing dated context. Apply Pacific service date, calendar exceptions and prior-day overnight service. Old commute fixtures are not rebuilt by this context dataset.')

def flood(refresh):
    url='https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28'
    metadata=json.loads(cached('flood_metadata.json',url,refresh,{'f':'json'}).read_text(encoding='utf-8'))
    params=dict(f='json',where='1=1',geometry=','.join(map(str,BOUNDS)),geometryType='esriGeometryEnvelope',inSR=4326,spatialRel='esriSpatialRelIntersects',returnIdsOnly='true')
    ids=json.loads(cached('flood_ids.json',url+'/query',refresh,params).read_text(encoding='utf-8')).get('objectIds')
    if ids is None: raise ValueError('FEMA did not provide a complete ID inventory')
    if len(ids) != len(set(ids)): raise ValueError('Duplicate FEMA ID inventory')
    features=[]
    for offset in range(0,len(ids),100):
        batch=ids[offset:offset+100]
        data=json.loads(cached(f'flood_{offset}.json',url+'/query',refresh,dict(f='geojson',objectIds=','.join(map(str,batch)),outFields='FLD_ZONE,ZONE_SUBTY,SFHA_TF,DFIRM_ID',outSR=4326,returnGeometry='true',geometryPrecision=5)).read_text(encoding='utf-8'))
        if data.get('exceededTransferLimit') or len(data.get('features',[]))!=len(batch): raise ValueError('Truncated FEMA response')
        features.extend(data['features'])
    # Clip bounded polygons without changing source hazard categories.
    from shapely.geometry import shape, mapping, box
    from shapely import make_valid
    from shapely.ops import unary_union
    clipped=[]
    for f in features:
        geometry=make_valid(shape(f['geometry'])).intersection(box(*BOUNDS))
        if geometry.geom_type == 'GeometryCollection':
            geometry=unary_union([g for g in geometry.geoms if g.geom_type in ('Polygon','MultiPolygon')])
        if geometry.geom_type not in ('Polygon','MultiPolygon') or geometry.area == 0: continue
        if not geometry.is_empty: clipped.append(dict(type='Feature',properties=f['properties'],geometry=mapping(geometry.simplify(0.00003,preserve_topology=True))))
    publish('flood_context',dict(type='FeatureCollection',features=clipped,copyright=metadata.get('copyrightText')),
        'FEMA National Flood Hazard Layer',url,'US government works; publisher licence record https://catalog.data.gov/dataset/national-flood-hazard-layer points to https://www.usa.gov/government-works; attribute FEMA',
        'Effective FIRM polygons as served on download date; effective dates vary by panel',
        'FIRM zone polygons, simplified approximately 3 m; original categories retained',
        'Context only, not an address-level flood determination or insurance advice. Absence of a mapped zone does not mean no flood exposure. No hazard is a ranking input.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');parser.add_argument('--dataset',choices=['amenities','transit','flood'],nargs='+',default=['amenities','transit','flood']);args=parser.parse_args()
    FOLDER.mkdir(parents=True,exist_ok=True)
    for name in args.dataset: globals()[name](args.refresh)
