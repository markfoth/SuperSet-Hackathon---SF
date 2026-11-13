import type { Map as GLMap, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { loadData } from '../../lib/data';

export interface ColumnGeometry extends FeatureCollection { parents: Record<string, [string, string]> }
export const CRIME_SCALES: Record<number, number> = { 6: .05, 7: .05, 8: .05 };
export const crimeLevel = (zoom: number) => zoom < 10.5 ? 6 : zoom < 12.5 ? 7 : 8;
let geometry: ColumnGeometry | undefined;

export async function addCrimeColumns(map: GLMap, current: () => boolean) {
  geometry = await loadData<ColumnGeometry>('incident_columns.json');
  if (!current()) return { sources: [], layers: [] };
  const source = 'context-crime-columns';
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'h3' });
  const layers: string[] = [];
  for (const [level, minzoom, maxzoom] of [[6, 0, 10.5], [7, 10.5, 12.5], [8, 12.5, 15.2]]) {
    const id = `${source}-${level}`;
    map.addLayer({ id, source, type: 'fill-extrusion', minzoom, maxzoom, filter: ['==', ['get', 'resolution'], level],
      paint: { 'fill-extrusion-height': ['get', 'graphic_height_m'], 'fill-extrusion-base': 0,
        'fill-extrusion-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#efbd50', '#bf5734'],
        'fill-extrusion-opacity': level === 8 ? ['interpolate', ['linear'], ['zoom'], 14.2, .7, 15.2, 0] : .7,
        'fill-extrusion-vertical-gradient': false } });
    layers.push(id);
    const label = `${id}-count`;
    map.addLayer({ id: label, source, type: 'symbol', minzoom, maxzoom, filter: ['==', ['get', 'resolution'], level],
      layout: { 'text-field': ['to-string', ['get', 'total']], 'text-font': ['Noto Sans Regular'], 'text-size': 11 },
      paint: { 'text-color': '#782e1e', 'text-halo-color': '#fff9e8', 'text-halo-width': 1.5,
        'text-opacity': level === 8 ? ['interpolate', ['linear'], ['zoom'], 14.2, 1, 15.2, 0] : 1 } });
    layers.push(label);
  }
  map.addLayer({ id: `${source}-selected`, type: 'line', source, filter: ['==', ['get', 'h3'], ''],
    paint: { 'line-color': '#ffcf5b', 'line-width': 3 } });
  layers.push(`${source}-selected`);
  return { sources: [source], layers };
}

/** All levels share the same incident set. Never rescale against a viewport max. */
export function updateCrimeColumns(map: GLMap, cells: Map<string, { total: number; categories: Record<string, number> }>, properties: (aggregate: { total: number; categories: Record<string, number> }, h3: string, level: number) => Record<string, unknown>) {
  if (!geometry) return;
  map.removeFeatureState({source:'context-crime-columns'});
  const totals = new Map<string, { total: number; categories: Record<string, number> }>();
  for (const [h3, aggregate] of cells) {
    for (const id of [h3, ...(geometry.parents[h3] ?? [])]) {
      const entry = totals.get(id) ?? { total: 0, categories: {} };
      entry.total += aggregate.total;
      for (const [category, count] of Object.entries(aggregate.categories)) entry.categories[category] = (entry.categories[category] ?? 0) + count;
      totals.set(id, entry);
    }
  }
  const features = geometry.features.flatMap(f => {
    const id = String(f.properties?.h3), resolution = Number(f.properties?.resolution), total = totals.get(id);
    return total ? [{ ...f, properties: { ...properties(total, id, resolution), ...f.properties, total: total.total, graphic_height_m: total.total * CRIME_SCALES[resolution] } }] : [];
  });
  (map.getSource('context-crime-columns') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features });
  if (map.getLayer('context-crime-columns-selected')) map.setFilter('context-crime-columns-selected', ['==', ['get', 'h3'], '']);
}
