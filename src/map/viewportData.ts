import type { GeoJSONSource, Map as GLMap } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { loadData } from '../lib/data';

interface ContextIndex { files: Record<string, { file: string; bounds: number[] }[]> }
const listeners = new WeakMap<GLMap, Map<string, () => void>>();
export async function viewportContext(map: GLMap, files: string[]): Promise<FeatureCollection> {
  if (!map.getBounds) { const collections = await Promise.all(files.map(file=>loadData<FeatureCollection>(file))); return {type:'FeatureCollection',features:collections.flatMap(fc=>fc.features)}; }
  const index = await loadData<ContextIndex>('context_index.json');
  const [west,south,east,north] = map.getBounds().toArray().flat();
  const paths = files.flatMap(file => index.files[file]?.filter(({bounds:[w,s,e,n]})=>w<=east&&e>=west&&s<=north&&n>=south).map(p=>p.file) ?? [file]);
  const data = await Promise.all(paths.map(file=>loadData<FeatureCollection>(file)));
  const seen = new Set<string>();
  return {type:'FeatureCollection',features:data.flatMap(fc=>fc.features).filter(feature=>{
    if (feature.geometry.type !== 'Point') return true;
    const id=String(feature.properties?.osm_id??feature.properties?.id??feature.id??feature.properties?.area_id??JSON.stringify(feature.geometry.coordinates));
    if(seen.has(id))return false;seen.add(id);return true;
  })};
}

/** One listener per source, removed on the next style load. Late viewport
 * responses cannot replace a newer view; inactive layers make no requests. */
export function followViewport(map: GLMap, source: string, files: string[], current: () => boolean, transform: (data: FeatureCollection)=>FeatureCollection = data=>data) {
  if (!map.on || !map.getBounds) return;
  if(!listeners.has(map))listeners.set(map,new Map());
  const registry=listeners.get(map)!;registry.get(source)?.();
  let generation=0;
  const update=async()=>{
    if(!current()||!map.getSource(source))return;
    const visible=map.getStyle().layers.some(layer=>'source' in layer&&layer.source===source&&map.getLayoutProperty(layer.id,'visibility')!=='none');
    if(!visible)return;
    const request=++generation;
    try {
      const data=await viewportContext(map,files);
      if(current()&&request===generation)(map.getSource(source) as GeoJSONSource|undefined)?.setData(transform(data));
    } catch { if(current()&&request===generation)map.fire('error',{error:new Error('Viewport context could not load'),sourceId:source}); }
  };
  map.on('moveend',update);
  const cleanup=()=>{generation++;map.off('moveend',update);map.off('style.load',cleanup);registry.delete(source);};
  registry.set(source,cleanup);map.once('style.load',cleanup);
}
