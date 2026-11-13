import type { Map as GLMap, AddLayerObject, ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, Feature } from 'geojson';
import { loadData } from '../../lib/data';

const CRIME_COLORS = ['#fde7d9', '#f9b98f', '#ee8551', '#cf5226', '#8f2d10'];
const AIR_COLORS = ['#eef3fb', '#c6d6ef', '#93b2df', '#5b84c4', '#2b5797'];
const step = (property: string, breaks: number[], colours: string[]): ExpressionSpecification =>
  ['step', ['get', property], colours[0], ...breaks.flatMap((b, i) => [b, colours[i + 1]])] as ExpressionSpecification;
const layerId = (id: string, suffix: string) => `context-${id}-${suffix}`;
type WithoutSource<T> = T extends unknown ? Omit<T, 'source' | 'id'> : never;

export interface LoadedContext { layers: string[]; sources: string[] }

/** Context sources are fetched only on first explicit toggle. Data keeps its source resolution. */
export async function addContext(map: GLMap, id: string): Promise<LoadedContext> {
  const added: LoadedContext = { layers: [], sources: [] };
  const addGeo = async (suffix: string, file: string, layers: WithoutSource<AddLayerObject>[], filter?: (f: Feature) => boolean) => {
    const fc = await loadData<FeatureCollection>(file);
    if (!map.getStyle()) return;
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
    case 'crime': await addGeo('incidents', 'crime_grid.geojson', fill(step('per_km2', [100, 300, 700, 1500], CRIME_COLORS))); break;
    case 'collisions': await addGeo('crashes', 'collisions_grid.geojson', fill(step('total', [5, 20, 50, 100], CRIME_COLORS))); break;
    case 'air': await addGeo('tracts', 'census_tracts.geojson', fill(step('ces_pm_pctl', [20, 40, 60, 80], AIR_COLORS)), (f) => f.properties?.ces_pm_pctl != null); break;
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
    case 'groceries': await addGeo('shops', 'groceries.geojson', [{ type: 'circle', paint: {
      'circle-radius': 5, 'circle-color': ['match', ['get', 'shop'], 'supermarket', '#c48232', '#65a30d'],
      'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff',
    } }]); break;
    case 'food':
      for (const [file, colour] of [['cafes', '#8b5a2b'], ['restaurants', '#d75d4d'], ['bars', '#8764ad']]) {
        await addGeo(file, `${file}.geojson`, [{ type: 'circle', minzoom: 15, paint: {
          'circle-radius': 4, 'circle-color': colour, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff',
        } }]);
      } break;
    case 'topography': case 'nightlife': {
      const meta = await loadData<{ image: string; bounds: [[number, number], [number, number]] }>(`${id}.json`);
      const [[south, west], [north, east]] = meta.bounds;
      const source = layerId(id, 'image');
      const url = `${import.meta.env.BASE_URL}data/${meta.image}`;
      // Decode explicitly so missing optional assets produce a recoverable layer message.
      const picture = new Image(); picture.src = url; await picture.decode();
      map.addSource(source, { type: 'image', url, coordinates: [[west, north], [east, north], [east, south], [west, south]] });
      const key = `${source}-raster`;
      map.addLayer({ id: key, type: 'raster', source, paint: { 'raster-opacity': id === 'topography' ? 0.8 : 0.85, 'raster-fade-duration': 0 } }, 'matching-fill');
      added.sources.push(source); added.layers.push(key); break;
    }
  } } catch (error) {
    // A multi-file layer can fail after its first source succeeds. Roll it back
    // so the explicit retry does not collide with orphaned layer/source ids.
    [...added.layers].reverse().forEach((key) => { if (map.getLayer(key)) map.removeLayer(key); });
    [...added.sources].reverse().forEach((key) => { if (map.getSource(key)) map.removeSource(key); });
    throw error;
  }
  return added;
}

export function contextText(id: string, p: Record<string, unknown>): string {
  const text = (v: unknown) => String(v ?? 'Unknown');
  if (id.startsWith('context-crime-')) return `${text(p.total)} reported incidents in 12 months. H3 resolution 8, approximately 0.74 km². Reporting is incomplete; this is not a safety score.`;
  if (id.startsWith('context-collisions-')) return `${text(p.total)} injury crashes over 3 years. Pedestrian: ${text(p.pedestrian)}. Cyclist: ${text(p.cyclist)}. Source cell approximately 0.74 km²; SF coverage only.`;
  if (id.startsWith('context-air-')) return `Census tract ${text(p.geoid)}. PM2.5: ${text(p.ces_pm_pctl)}th California percentile. Diesel: ${text(p.ces_diesel_pctl)}. Traffic: ${text(p.ces_traffic_pctl)}. CalEnviroScreen 5.0 pollution indicators; tract context.`;
  if (id.startsWith('context-cycling-')) return `${text(p.street)}: ${text(p.cat)} bikeway. ${text(p.from)} to ${text(p.to)}.`;
  if (id.startsWith('context-transit-routes')) return `${text(p.agency)} ${text(p.short_name)}: ${text(p.long_name)}. Muni timetable is out of date.`;
  if (id.startsWith('context-transit-stops')) return `${text(p.name)}. ${text(p.agency)}: ${text(p.routes)}. ${text(p.weekday_departures)} departures on the source weekday; verify current service.`;
  return `${text(p.name)}${p.cuisine ? ` · ${text(p.cuisine)}` : ''}`;
}
