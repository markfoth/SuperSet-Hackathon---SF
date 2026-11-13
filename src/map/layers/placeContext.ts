import type { AddLayerObject, GeoJSONSource, Map as GLMap, MapGeoJSONFeature } from 'maplibre-gl';
import { viewportContext, followViewport } from '../viewportData';

export interface PlaceLayers { layers: string[]; sources: string[] }
export type PlaceContextId = 'food' | 'nightlife' | 'groceries' | 'character';
type SourceLess<T> = T extends unknown ? Omit<T, 'id' | 'source'> : never;

export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

/** One clustered source per layer prevents counting a venue in both food categories. */
export async function addPlaceContext(map: GLMap, id: PlaceContextId, isCurrent: () => boolean = () => true): Promise<PlaceLayers> {
  const files = id === 'food' ? ['cafes.geojson', 'restaurants.geojson'] :
    id === 'nightlife' ? ['nightlife_venues.geojson'] : id === 'groceries' ? ['groceries.geojson'] : ['neighbourhood_character.geojson'];
  const data = [await viewportContext(map, files)];
  if (!isCurrent() || !map.getStyle() || !map.getLayer('matching-fill')) return { layers: [], sources: [] };
  const source = `context-${id}-places`;
  if (map.getSource(source)) throw new Error(`Context source already present: ${source}`);
  const seen = new Set<string>();
  const features = data.flatMap((fc) => fc.features).filter((feature) => {
    const key = String(feature.properties?.osm_id ?? feature.properties?.area_id ?? feature.id ?? JSON.stringify([feature.properties?.name, feature.properties?.kind, feature.geometry]));
    if (seen.has(key)) return false;
    seen.add(key); feature.id = key; return true;
  });
  map.addSource(source, { type: 'geojson', data: { type: 'FeatureCollection', features },
    ...(id === 'character' ? {} : { cluster: true, clusterRadius: 38, clusterMaxZoom: 12 }) });
  followViewport(map, source, files, isCurrent);
  const layers: string[] = [];
  const add = (suffix: string, layer: SourceLess<AddLayerObject>) => {
    const key = `${source}-${suffix}`;
    map.addLayer({ ...layer, id: key, source } as AddLayerObject, 'selection-outline');
    layers.push(key);
  };
  try {
    if (id === 'character') {
      for (const level of ['broad', 'district']) {
        add(level, { type: 'symbol', minzoom: level === 'broad' ? 10 : 13, ...(level === 'broad' ? { maxzoom: 13 } : {}),
          filter: ['==', ['get', 'level'], level],
          layout: { 'text-field': ['get', 'short_label'], 'text-font': ['Noto Sans Regular'],
            'text-size': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 15], 'text-max-width': 14,
            'text-padding': 14, 'text-allow-overlap': false, 'text-ignore-placement': false,
            'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport' },
          paint: { 'text-color': '#68546f', 'text-halo-color': '#fffdf8', 'text-halo-width': 2,
            'text-opacity': 0.96 } });
      }
    } else {
      const colour = id === 'nightlife' ? '#8c3f83' : id === 'groceries' ? '#60812e' : '#a15b3d';
      add('clusters', { type: 'circle', minzoom: 10, filter: ['has', 'point_count'], paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 11, 50, 17, 300, 23],
        'circle-color': colour, 'circle-opacity': 0.85, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5,
      } });
      add('counts', { type: 'symbol', minzoom: 10, filter: ['has', 'point_count'], layout: {
        'text-field': ['get', 'point_count_abbreviated'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
        'text-allow-overlap': true,
      }, paint: { 'text-color': '#fff' } });
      add('dots', { type: 'circle', minzoom: 10, filter: ['!', ['has', 'point_count']], paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 13, 3.8, 17, 5],
        'circle-color': id === 'food' ? ['match', ['get', 'kind'], ['cafe', 'coffee_shop'], '#8a623e', '#c1614b'] : colour,
        'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2,
      } });
      add('names', { type: 'symbol', minzoom: 14, filter: ['all', ['!', ['has', 'point_count']], ['has', 'name']], layout: {
        'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
        'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-max-width': 12,
        'text-padding': 3, 'text-allow-overlap': false,
      }, paint: { 'text-color': colour, 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
    }
  } catch (error) {
    layers.reverse().forEach((key) => { if (map.getLayer(key)) map.removeLayer(key); });
    if (map.getSource(source)) map.removeSource(source);
    throw error;
  }
  return { layers, sources: [source] };
}

export async function expandPlaceCluster(map: GLMap, feature: MapGeoJSONFeature): Promise<boolean> {
  if (!feature.layer.id.includes('-places-') || !feature.properties?.cluster || feature.geometry.type !== 'Point') return false;
  const source = map.getSource(feature.source) as GeoJSONSource | undefined;
  if (!source) return true;
  const zoom = await source.getClusterExpansionZoom(Number(feature.properties.cluster_id));
  if (map.getSource(feature.source)) map.easeTo({ center: feature.geometry.coordinates as [number, number], zoom,
    duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350 });
  return true;
}

const paragraph = (root: HTMLElement, text: unknown, tag = 'p') => {
  if (text == null || text === '') return;
  const node = document.createElement(tag); node.textContent = String(text); root.append(node);
};
const link = (root: HTMLElement, label: string, value: unknown) => {
  const url = safeHttpUrl(value); if (!url) return;
  const row = document.createElement('p'), a = document.createElement('a');
  a.href = url; a.textContent = label; a.target = '_blank'; a.rel = 'noopener noreferrer';
  row.append(a); root.append(row);
};

/** Source text is always textContent. Only explicit HTTP(S) URLs become links. */
export function placePopup(feature: { properties: Record<string, unknown> | null; layer: { id: string } }): HTMLElement | null {
  if (!feature.layer.id.includes('-places-')) return null;
  const p = feature.properties ?? {};
  if (p.cluster) return null;
  const root = document.createElement('div'); root.className = 'place-popup';
  root.style.maxWidth = '260px'; root.style.maxHeight = 'min(390px, 60vh)'; root.style.overflowY = 'auto';
  if (feature.layer.id.startsWith('context-character-')) {
    paragraph(root, p.area_name, 'strong'); paragraph(root, p.short_label);
    paragraph(root, p.explanation); paragraph(root, `Reviewed ${p.review_date}. ${p.evidence_strength}.`, 'small');
    paragraph(root, p.limitations, 'small');
    let sources: { title: string; url: string }[] = [];
    try { sources = typeof p.sources === 'string' ? JSON.parse(p.sources) : p.sources as typeof sources; } catch { /* malformed optional source metadata */ }
    if (Array.isArray(sources)) sources.forEach((source) => link(root, source.title || 'Evidence source', source.url));
    paragraph(root, 'Editorial context, not a safety judgement or housing ranking input.', 'small');
    return root;
  }
  paragraph(root, p.name || 'Unnamed mapped venue', 'strong');
  const kind = String(p.kind ?? p.shop ?? 'Place').replaceAll('_', ' ');
  paragraph(root, `${kind}${p.cuisine ? ` · ${p.cuisine}` : ''}`);
  paragraph(root, p.address); paragraph(root, p.opening_hours ? `Mapped opening hours: ${p.opening_hours}` : null);
  paragraph(root, p.phone ? `Mapped telephone: ${p.phone}` : null);
  paragraph(root, p.wheelchair ? `Mapped wheelchair access: ${p.wheelchair}` : null);
  const official = safeHttpUrl(p.official_website), website = safeHttpUrl(p.website);
  if (official) {
    link(root, 'Official website', official);
    paragraph(root, `Venue and address checked ${p.website_verified_on}. Check current opening hours on the venue website.`, 'small');
  } else if (website) {
    link(root, 'Venue website (listed in OSM)', website);
    paragraph(root, 'Source-supplied link; current ownership and opening hours are not independently verified.', 'small');
  } else {
    paragraph(root, 'No venue website in this source.', 'small');
    link(root, 'Web search for this place', `https://www.google.com/search?q=${encodeURIComponent([p.name, p.address || 'San Francisco Bay Area'].join(' '))}`);
  }
  const source = safeHttpUrl(p.source_url) ?? (typeof p.osm_id === 'string' && /^(node|way|relation)\/\d+$/.test(p.osm_id) ? `https://www.openstreetmap.org/${p.osm_id}` : null);
  link(root, 'OpenStreetMap source page', source);
  paragraph(root, `© OpenStreetMap contributors · snapshot ${p.snapshot || 'date unavailable'}. Volunteer mapping may lag closures.`, 'small');
  if (p.source_checked) paragraph(root, `OSM contributor check date: ${p.source_checked}. This is not an independent review.`, 'small');
  return root;
}
