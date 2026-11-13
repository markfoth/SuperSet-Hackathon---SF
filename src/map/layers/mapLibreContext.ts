import type { Map as GLMap, AddLayerObject, ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';
import { loadData } from '../../lib/data';
import { addPlaceContext } from './placeContext';
import { addEventContext, type EventFilterState } from './eventDetails';

export const AIR_COLORS = ['#e5f5e7', '#abd8c5', '#65b8b6', '#32778e', '#143d63'];
export const AIR_STOPS = [5, 12, 20, 28, 35];
export const airColour = (scale: 'local' | 'statewide' = 'local'): ExpressionSpecification => ['case', ['==', ['get', 'ces_pm_pctl'], null], '#aab1b6',
  ['interpolate', ['linear'], ['get', 'ces_pm_pctl'], ...(scale === 'local' ? AIR_STOPS : [0,25,50,75,100]).flatMap((stop, i) => [stop, AIR_COLORS[i]])]];
const layerId = (id: string, suffix: string) => `context-${id}-${suffix}`;
type WithoutSource<T> = T extends unknown ? Omit<T, 'source' | 'id'> : never;

export interface LoadedContext { layers: string[]; sources: string[] }

/** Context sources are fetched only on first explicit toggle. Data keeps its source resolution. */
export async function addContext(map: GLMap, id: string, isCurrent = () => true, filters?: EventFilterState): Promise<LoadedContext> {
  if (id === 'crime' || id === 'collisions') return addEventContext(map, id, filters, isCurrent);
  if (id === 'food' || id === 'groceries' || id === 'character') return addPlaceContext(map, id, isCurrent);
  const added: LoadedContext = { layers: [], sources: [] };
  const addGeo = async (suffix: string, file: string, layers: WithoutSource<AddLayerObject>[], filter?: (f: Feature) => boolean) => {
    const fc = await loadData<FeatureCollection>(file);
    if (!isCurrent() || !map.getLayer('matching-fill')) return;
    const source = layerId(id, suffix);
    map.addSource(source, { type: 'geojson', data: filter ? { ...fc, features: fc.features.filter(filter) } : fc });
    added.sources.push(source);
    layers.forEach((layer, i) => {
      const key = `${source}-${i}`;
      const pointOrLine = layer.type === 'circle' || layer.type === 'line';
      map.addLayer({ ...layer, id: key, source } as AddLayerObject,
        pointOrLine ? 'selection-outline' : 'matching-fill');
      added.layers.push(key);
    });
  };
  const fill = (colour: string | ExpressionSpecification, opacity = 0.5) => [{ type: 'fill' as const,
    paint: { 'fill-color': colour, 'fill-opacity': opacity, 'fill-outline-color': '#ffffff' } }];
  try { switch (id) {
    case 'air': await addGeo('tracts', 'census_tracts.geojson', [{ type: 'fill', paint: {'fill-color': airColour(), 'fill-opacity': 0.64, 'fill-outline-color': '#597475'} }, { type: 'line', paint: {'line-color': '#5b727a', 'line-opacity': 0.6, 'line-width': 0.7} }]); break;
    case 'parks': await addGeo('parks', 'parks.geojson', fill('#6f9e74', 0.42)); break;
    case 'cycling': await addGeo('network', 'cycling_network.geojson', [{ type: 'line',
      paint: { 'line-color': ['match', ['get', 'cat'], 'protected', '#0b6e3a', 'path', '#2fa35f', 'lane', '#2c6fd1', 'neighborway', '#8a4fd6', '#7c8796'],
        'line-width': ['match', ['get', 'cat'], ['protected', 'path'], 3.5, 'lane', 2.5, 1.5], 'line-opacity': 0.9 } }]); break;
    case 'transit':
      await addGeo('routes', 'transit_routes.geojson', [{ type: 'line', paint: {
        'line-color': ['match', ['get', 'mode'], 'bart', '#0099d8', 'caltrain', '#c4122f', 'muni_metro', '#6d458c', 'cable_car', '#a0522d', '#8b94a3'],
        'line-width': ['match', ['get', 'mode'], 'bus', 1, 3], 'line-opacity': ['match', ['get', 'mode'], 'bus', 0.45, 0.9],
      } }]);
      await addGeo('stops', 'transit_stops.geojson', [
        { type: 'circle', filter: ['==', ['get', 'rail'], true], paint: { 'circle-radius': 4, 'circle-color': '#394c52', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } },
        { type: 'circle', minzoom: 15, filter: ['==', ['get', 'rail'], false], paint: { 'circle-radius': 2.5, 'circle-color': '#657378' } },
      ]); break;
    case 'topography': case 'nightlife': {
      const meta = await loadData<{ image: string; bounds: [[number, number], [number, number]] }>(`${id}.json`);
      const [[south, west], [north, east]] = meta.bounds;
      const source = layerId(id, 'image');
      const url = `${import.meta.env.BASE_URL}data/${meta.image}`;
      // Decode explicitly so missing optional assets produce a recoverable layer message.
      const picture = new Image(); picture.src = url; await picture.decode();
      if (!isCurrent() || !map.getLayer('matching-fill')) return added;
      map.addSource(source, { type: 'image', url, coordinates: [[west, north], [east, north], [east, south], [west, south]] });
      const key = `${source}-raster`;
      map.addLayer({ id: key, type: 'raster', source, paint: { 'raster-opacity': id === 'topography' ? 0.72 : 0.32, 'raster-fade-duration': 0 } }, 'matching-fill');
      added.sources.push(source); added.layers.push(key);
      if (id === 'nightlife') { const venues = await addPlaceContext(map, 'nightlife', isCurrent); added.sources.push(...venues.sources); added.layers.push(...venues.layers); }
      break;
    }
  } } catch (error) {
    if (!isCurrent()) return added;
    // A multi-file layer can fail after its first source succeeds. Roll it back
    // so the explicit retry does not collide with orphaned layer/source ids.
    [...added.layers].reverse().forEach((key) => { if (map.getLayer(key)) map.removeLayer(key); });
    [...added.sources].reverse().forEach((key) => { if (map.getSource(key)) map.removeSource(key); });
    throw error;
  }
  return added;
}

export function contextText(id: string, p: Record<string, unknown>, airScale: 'local' | 'statewide' = 'local'): string {
  const text = (v: unknown) => String(v ?? 'Unknown');
  if (id.startsWith('context-crime-')) return `${text(p.total)} reported incidents in 12 months. H3 resolution 8, approximately 0.74 km². Reporting is incomplete; this is not a safety score.`;
  if (id.startsWith('context-collisions-')) return `${text(p.total)} injury crashes over 3 years. Pedestrian: ${text(p.pedestrian)}. Cyclist: ${text(p.cyclist)}. Source cell approximately 0.74 km²; SF coverage only.`;
  if (id.startsWith('context-air-')) return `Census tract ${text(p.geoid)}. PM2.5: ${p.ces_pm_pctl == null ? 'no published value (grey)' : `${text(p.ces_pm_pctl)}th California percentile`}. ${airScale === 'local' ? "Local contrast uses a fixed 5–35 statewide percentile range for the study area, not California's full range." : 'Colour uses the full 0–100 California percentile scale.'} Diesel: ${text(p.ces_diesel_pctl)}. Traffic: ${text(p.ces_traffic_pctl)}. CalEnviroScreen 5.0 pollution indicators; tract context, not building-level measurement.`;
  if (id.startsWith('context-cycling-')) return `${text(p.street)}: ${text(p.cat)} bikeway. ${text(p.from)} to ${text(p.to)}.`;
  if (id.startsWith('context-transit-routes')) return `${text(p.agency)} ${text(p.short_name)}: ${text(p.long_name)}. Muni timetable is out of date.`;
  if (id.startsWith('context-transit-stops')) return `${text(p.name)}. ${text(p.agency)}: ${text(p.routes)}. ${text(p.weekday_departures)} departures on the source weekday; verify current service.`;
  return `${text(p.name)}${p.cuisine ? ` · ${text(p.cuisine)}` : ''}`;
}
