import type { Map as GLMap, GeoJSONSource, ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, Feature, Point } from 'geojson';
import type L from 'leaflet';
import { loadData } from '../../lib/data';

export type EventKind = 'crime' | 'collisions';
export interface EventFilterState {
  from: string;
  to: string;
  category: string;
  detail: boolean;
}
export const DEFAULT_EVENT_FILTERS: Record<EventKind, EventFilterState> = {
  crime: { from: '2025-10', to: '2026-09', category: 'all', detail: false },
  collisions: { from: '2023-10', to: '2026-09', category: 'all', detail: false },
};
export interface EventData {
  meta: { source_url: string; downloaded_at: string; window_start: string; window_end_exclusive: string; mapped_events: number; precision: string };
  locations: [number, number, string][];
  months: string[];
  categories: string[];
  cell_areas_km2?: Record<string, number>;
  records: [number, number, number[], number, number, number | null, number | null][];
}
const dataFiles = { crime: 'incident_details.json', collisions: 'crash_details.json' };
const masks: Record<string, number> = { violent: 1, property: 2, vehicle_breakin: 4, drug: 8, other: 16, pedestrian: 1, cyclist: 2, vehicle_only: 4, fatal_severe: 8 };
const names: Record<EventKind, string> = { crime: 'reported incidents', collisions: 'injury crashes' };
const monthName = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

interface Aggregate {
  total: number;
  injured: number;
  fatalities: number;
  missingInjured: boolean;
  missingFatalities: boolean;
  categories: Record<string, number>;
}
const emptyAggregate = (): Aggregate => ({ total: 0, injured: 0, fatalities: 0, missingInjured: false, missingFatalities: false, categories: {} });

/** Both views are derived from the exact same deduplicated monthly bundles. */
export function aggregateEvents(data: EventData, filters: EventFilterState) {
  const locations = new Map<number, Aggregate>();
  const cells = new Map<string, Aggregate>();
  const mask = masks[filters.category];
  const add = (a: Aggregate, cats: number[], count: number, injured: number | null, fatalities: number | null) => {
    a.total += count;
    if (injured === null) a.missingInjured = true; else a.injured += injured;
    if (fatalities === null) a.missingFatalities = true; else a.fatalities += fatalities;
    cats.forEach((cat) => { const name = data.categories[cat]; a.categories[name] = (a.categories[name] ?? 0) + count; });
  };
  for (const [point, month, cats, flags, count, injured, fatalities] of data.records) {
    const date = data.months[month];
    if (date < filters.from || date > filters.to || (mask !== undefined && !(flags & mask))) continue;
    const cell = data.locations[point][2];
    if (!locations.has(point)) locations.set(point, emptyAggregate());
    if (!cells.has(cell)) cells.set(cell, emptyAggregate());
    add(locations.get(point)!, cats, count, injured, fatalities);
    add(cells.get(cell)!, cats, count, injured, fatalities);
  }
  return { locations, cells, total: [...locations.values()].reduce((n, a) => n + a.total, 0) };
}

function properties(kind: EventKind, data: EventData, filters: EventFilterState, aggregate: Aggregate) {
  return { event_kind: kind, total: aggregate.total, injured: aggregate.missingInjured ? null : aggregate.injured,
    fatalities: aggregate.missingFatalities ? null : aggregate.fatalities,
    categories: JSON.stringify(aggregate.categories), period: `${monthName(filters.from)} to ${monthName(filters.to)} (inclusive)`,
    source_url: data.meta.source_url, downloaded_at: data.meta.downloaded_at, precision: data.meta.precision,
    category_filter: filters.category };
}

const dataCache = new Map<EventKind, EventData>();
const gridCache = new Map<EventKind, FeatureCollection>();

export async function addEventContext(map: GLMap, kind: EventKind, filters = DEFAULT_EVENT_FILTERS[kind], isCurrent: () => boolean = () => true) {
  const [data, grid] = await Promise.all([
    loadData<EventData>(dataFiles[kind]),
    loadData<FeatureCollection>(kind === 'crime' ? 'crime_grid.geojson' : 'collisions_grid.geojson'),
  ]);
  dataCache.set(kind, data); gridCache.set(kind, grid);
  if (!isCurrent() || !map.getLayer('matching-fill')) return { sources: [], layers: [] };
  const prefix = `context-${kind}`;
  const source = `${prefix}-overview`, detailSource = `${prefix}-details`;
  const layers = [`${prefix}-overview-fill`, `${prefix}-clusters`, `${prefix}-cluster-count`, `${prefix}-points`, `${prefix}-point-count`];
  const sources = [source, detailSource];
  try {
    map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addSource(detailSource, { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterMaxZoom: 14, clusterRadius: 38,
      clusterProperties: { total: ['+', ['get', 'total']], injured: ['+', ['coalesce', ['get', 'injured'], 0]], fatalities: ['+', ['coalesce', ['get', 'fatalities'], 0]] } });
    map.addLayer({ id: layers[0], source, type: 'fill', paint: {
      'fill-color': kind === 'crime'
        ? ['step', ['get', 'per_km2'], '#fde7d9', 100, '#f9b98f', 300, '#ee8551', 700, '#cf5226', 1500, '#8f2d10']
        : ['step', ['get', 'total'], '#fde7d9', 5, '#f9b98f', 20, '#ee8551', 50, '#cf5226', 100, '#8f2d10'],
      'fill-opacity': 0.5, 'fill-outline-color': '#fff',
    } }, 'matching-fill');
    map.addLayer({ id: layers[1], source: detailSource, type: 'circle', minzoom: 13.5, filter: ['has', 'point_count'], paint: {
      'circle-color': '#9d432c', 'circle-opacity': 0.82, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 1, 10, 15, 20, 50, 30],
    } }, 'selection-outline');
    map.addLayer({ id: layers[2], source: detailSource, type: 'symbol', minzoom: 13.5, filter: ['has', 'point_count'], layout: {
      'text-field': ['to-string', ['get', 'total']], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true,
    }, paint: { 'text-color': '#fff' } });
    map.addLayer({ id: layers[3], source: detailSource, type: 'circle', minzoom: 13.5, filter: ['!', ['has', 'point_count']], paint: {
      'circle-color': kind === 'crime' ? '#a64934' : '#b45b27', 'circle-opacity': 0.82, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2,
      'circle-radius': ['interpolate', ['linear'], ['sqrt', ['get', 'total']], 1, 5, 10, 16, 40, 27],
    } }, 'selection-outline');
    map.addLayer({ id: layers[4], source: detailSource, type: 'symbol', minzoom: 13.5, filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'total'], 4]], layout: {
      'text-field': ['to-string', ['get', 'total']], 'text-size': 10, 'text-font': ['Noto Sans Regular'],
    }, paint: { 'text-color': '#fff', 'text-halo-color': '#793f2e', 'text-halo-width': 0.5 } });
    updateEventContext(map, kind, filters);
  } catch (error) {
    [...layers].reverse().forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
    [...sources].reverse().forEach((id) => { if (map.getSource(id)) map.removeSource(id); });
    throw error;
  }
  return { sources, layers };
}

export function updateEventContext(map: GLMap, kind: EventKind, filters: EventFilterState) {
  const data = dataCache.get(kind), grid = gridCache.get(kind);
  if (!data || !grid) return;
  const aggregated = aggregateEvents(data, filters);
  const featureProperties = (a: Aggregate) => properties(kind, data, filters, a);
  const points: Feature<Point>[] = [...aggregated.locations].map(([index, a]) => ({ type: 'Feature', id: `${kind}:${data.locations[index][0]}:${data.locations[index][1]}`,
    geometry: { type: 'Point', coordinates: [data.locations[index][0], data.locations[index][1]] }, properties: featureProperties(a) }));
  const cells = grid.features.flatMap((feature) => {
    const a = aggregated.cells.get(String(feature.properties?.h3));
    const area = data.cell_areas_km2?.[String(feature.properties?.h3)] ?? 0.74;
    return a ? [{ ...feature, properties: { ...featureProperties(a), h3: feature.properties?.h3, per_km2: Math.round(a.total / area) } }] : [];
  });
  (map.getSource(`context-${kind}-overview`) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: cells });
  (map.getSource(`context-${kind}-details`) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: points });
  const opacity: number | ExpressionSpecification = filters.detail ? ['interpolate', ['linear'], ['zoom'], 13, 0.5, 14.5, 0.08] : 0.5;
  if (map.getLayer(`context-${kind}-overview-fill`)) map.setPaintProperty(`context-${kind}-overview-fill`, 'fill-opacity', opacity);
  for (const suffix of ['clusters', 'cluster-count', 'points', 'point-count']) {
    if (map.getLayer(`context-${kind}-${suffix}`)) map.setLayoutProperty(`context-${kind}-${suffix}`, 'visibility', filters.detail ? 'visible' : 'none');
  }
  return aggregated.total;
}

/** DOM textContent avoids interpreting any external category/name as markup. */
export function eventPopup(kind: EventKind, p: Record<string, unknown>): HTMLElement {
  const node = document.createElement('div');
  node.className = 'event-popup';
  const line = (text: string, tag = 'p') => { const element = document.createElement(tag); element.textContent = text; node.append(element); return element; };
  if (p.cluster) {
    line(`${Number(p.total).toLocaleString('en-GB')} ${names[kind]} in this display cluster`, 'strong');
    line('Zoom in to separate the published locations. This circle groups nearby locations for display.');
    return node;
  }
  line(p.h3 ? (kind === 'crime' ? 'Reported incidents in this hexagon' : 'Injury crashes in this hexagon')
    : (kind === 'crime' ? 'Reported near this intersection' : 'Published injury-crash location'), 'strong');
  if(p.h3) line('H3 resolution 8, approximately 0.74 km². This is an aggregate area, not one intersection.');
  const count = Number(p.total);
  line(`${count.toLocaleString('en-GB')} unique ${count === 1 ? (kind === 'crime' ? 'reported incident' : 'injury crash') : names[kind]}`);
  line(String(p.period));
  if (kind === 'crime') {
    line(p.h3 ? 'Source locations are approximate and anonymised to intersections, not verified offence addresses.' : 'Published location is approximate. This is not a verified offence address.');
    line('Only counted initial criminal reports; records without an offence category are excluded.');
  }
  else {
    line(`${p.injured == null ? 'Unknown' : p.injured} ${p.injured === 1 ? 'person' : 'people'} injured (non-fatal) · ${p.fatalities == null ? 'Unknown' : p.fatalities} ${p.fatalities === 1 ? 'fatality' : 'fatalities'}`);
    line('Published intersection or street-centreline location. Nearby crashes can share a point.');
  }
  let categories: Record<string, number> = {};
  try { categories = typeof p.categories === 'string' ? JSON.parse(p.categories) : p.categories as Record<string, number>; } catch { /* malformed external field */ }
  const list = document.createElement('ul');
  Object.entries(categories ?? {}).sort((a, b) => b[1] - a[1]).forEach(([name, n]) => {
    const item = document.createElement('li'); item.textContent = `${name}: ${n.toLocaleString('en-GB')}`; list.append(item);
  });
  node.append(list);
  line(kind === 'crime' ? 'An incident can have several offence categories, so category totals can overlap. Reported incidents are incomplete and are not a safety score.' : 'Pedestrian and cyclist involvement can overlap. Unknown involvement is excluded from motor-vehicle-only. Not every fall or unreported crash is included; highways are excluded by the source.');
  line('SF coverage only. Missing Peninsula records do not mean zero.');
  line(`Source retrieved ${String(p.downloaded_at).slice(0, 10)}.`);
  const link = document.createElement('a');
  link.href = kind === 'crime' ? 'https://data.sf.gov/d/wg3w-h783' : 'https://data.sf.gov/d/ubvf-ztfx';
  link.textContent = kind === 'crime' ? 'SFPD source and precision' : 'TransBASE / SFDPH source and limitations';
  link.target = '_blank'; link.rel = 'noopener noreferrer'; node.append(link);
  return node;
}

/** Compatibility renderer shares deduplication, filters, periods and precision. */
export async function buildLeafletEvents(map: L.Map, kind: EventKind, filters = DEFAULT_EVENT_FILTERS[kind]): Promise<L.Layer> {
  const [{ default: leaflet }, data, grid] = await Promise.all([
    import('leaflet'), loadData<EventData>(dataFiles[kind]),
    loadData<FeatureCollection>(kind === 'crime' ? 'crime_grid.geojson' : 'collisions_grid.geojson'),
  ]);
  const aggregate = aggregateEvents(data, filters), renderer = leaflet.canvas({ padding: 0.3, pane: 'context-points' });
  const colours = ['#fde7d9', '#f9b98f', '#ee8551', '#cf5226', '#8f2d10'];
  const cells: FeatureCollection = { type: 'FeatureCollection', features: grid.features.flatMap((feature) => {
    const a = aggregate.cells.get(String(feature.properties?.h3));
    return a ? [{ ...feature, properties: { ...properties(kind, data, filters, a), h3: feature.properties?.h3,
      per_km2: a.total / (data.cell_areas_km2?.[String(feature.properties?.h3)] ?? 0.74) } }] : [];
  }) };
  const overview = leaflet.geoJSON(cells, { pane: 'context-fill',
    style: (feature) => {
      const value = Number(feature?.properties?.[kind === 'crime' ? 'per_km2' : 'total']);
      const breaks = kind === 'crime' ? [100, 300, 700, 1500] : [5, 20, 50, 100];
      return { fillColor: colours[breaks.filter((n) => value >= n).length], fillOpacity: 0.5, color: '#fff', weight: 0.5 };
    }, onEachFeature: (feature, layer) => layer.bindPopup(eventPopup(kind, feature.properties ?? {})),
  });
  const points = leaflet.layerGroup(), group = leaflet.layerGroup([overview, points]);
  const redraw = () => {
    const detailed = filters.detail && map.getZoom() >= 14;
    overview.setStyle({ fillOpacity: detailed ? 0.08 : 0.5 });
    points.clearLayers();
    if (!detailed) return;
    const bounds = map.getBounds().pad(0.1);
    aggregate.locations.forEach((a, index) => {
      const [lon, lat] = data.locations[index];
      if (!bounds.contains([lat, lon])) return;
      leaflet.circleMarker([lat, lon], { renderer, pane: 'context-points', radius: Math.min(22, 4 + Math.sqrt(a.total)),
        fillColor: '#a64934', fillOpacity: 0.82, color: '#fff', weight: 1.2,
      }).bindPopup(eventPopup(kind, properties(kind, data, filters, a)), { maxWidth: 290 }).addTo(points);
    });
  };
  group.on('add', () => { redraw(); map.on('zoomend moveend', redraw); });
  group.on('remove', () => { map.off('zoomend moveend', redraw); points.clearLayers(); });
  return group;
}
