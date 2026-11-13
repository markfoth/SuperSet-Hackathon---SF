"""Partition optional display geometry; matching uses the complete candidate index."""
import json
import geopandas as gpd
import h3
from shapely.geometry import Polygon
from _common import PROCESSED_DIR, METRIC_CRS, write_json, update_manifest, today, rel
from build_region import write_frame

FILES=['parks.geojson','groceries.geojson','cafes.geojson','restaurants.geojson','nightlife_venues.geojson',
       'cycling_network.geojson','transit_stops.geojson','transit_routes.geojson','census_tracts.geojson']

if __name__=='__main__':
    candidates=json.loads((PROCESSED_DIR/'candidate_index.json').read_text(encoding='utf-8'))
    tiles=[p['id'] for p in candidates['partitions']]
    polygons=gpd.GeoDataFrame({'id':tiles},geometry=[Polygon([(lon,lat) for lat,lon in h3.cell_to_boundary(c)]) for c in tiles],crs=4326).to_crs(METRIC_CRS)
    folder=PROCESSED_DIR/'context';folder.mkdir(exist_ok=True)
    catalogue={};places=[]
    for filename in FILES:
        frame=gpd.read_file(PROCESSED_DIR/filename).to_crs(METRIC_CRS)
        if filename=='transit_routes.geojson':
            examples=[]
            for mode,name in [('bus','22'),('muni_metro','N')]:
                selected=frame[(frame['mode']==mode)&(frame['short_name']==name)]
                if len(selected):examples.append(selected.iloc[[0]])
            if examples:
                import pandas as pd
                write_frame(pd.concat(examples,ignore_index=True),'transport_examples.geojson')
        frame['geometry']=frame.geometry.make_valid()
        entries=[]
        for _,tile in polygons.iterrows():
            features=frame.iloc[frame.sindex.query(tile.geometry,predicate='intersects')].copy()
            if features.empty:continue
            if not features.geometry.geom_type.eq('Point').all():features['geometry']=features.geometry.intersection(tile.geometry)
            features=features[~features.geometry.is_empty]
            name=f"context/{filename[:-8]}/{tile.id}.geojson"
            (PROCESSED_DIR/name).parent.mkdir(parents=True,exist_ok=True)
            count=write_frame(features,name)
            entries.append({'id':tile.id,'file':name,'bounds':gpd.GeoSeries([tile.geometry],crs=METRIC_CRS).to_crs(4326).total_bounds.tolist(),'count':count})
        catalogue[filename]=entries
        if frame.geometry.geom_type.eq('Point').all():
            for _,p in frame.to_crs(4326).iterrows():
                if not isinstance(p.get('name'),str) or not p['name'].strip():continue
                places.append({'id':f"{filename}:{p.get('id') or p.get('osm_id') or p.name}",'name':p['name'],'lat':round(p.geometry.y,5),'lon':round(p.geometry.x,5),
                               'kind':f"{p.get('agency') or 'Mapped'} {'station' if p.get('rail') is True else 'place'}",'source':p.get('source') or p.get('agency') or 'OpenStreetMap / agency GTFS'})
    write_json(PROCESSED_DIR/'context_index.json',{'version':1,'files':catalogue})
    write_json(PROCESSED_DIR/'place_index.json',{'places':places,'unavailableSources':['Expanded-region OSM amenities extract unavailable']})
    paths=[rel(PROCESSED_DIR/'context_index.json'),rel(PROCESSED_DIR/'place_index.json'),rel(PROCESSED_DIR/'transport_examples.geojson')]+[rel(p) for p in folder.rglob('*.geojson')]
    update_manifest('viewport_context',{'source':'Processed OSM, agency GTFS and CES layers; licences and dates inherited from owning manifest entries',
      'source_url':'https://www.openstreetmap.org/copyright','licence':'Inherits each source; ODbL, agency developer terms; CES portal rights remain unresolved',
      'downloaded_at':today(),'measurement_period':'Per source; see regional_coverage.json and manifest','resolution':'H3-5 partitions for display only; original feature resolution and candidate precision unchanged',
      'feature_count':None,'raw_path':'Processed context layers','processed_path':paths,'script':'scripts/pack_context.py','refresh':'After any context source changes',
      'limitations':'Viewport geometry never gates matching. Shared polygon/line boundaries are clipped for display only. Named place search is not a complete address geocoder.','status':'processed'})
    print({'context_partitions':sum(map(len,catalogue.values())),'named_places':len(places)})
