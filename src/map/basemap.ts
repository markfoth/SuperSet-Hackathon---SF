import type { Map, StyleSpecification } from 'maplibre-gl';

export type MapStyle = 'terrain' | 'satellite';
export const IMAGERY = {
  tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}'],
  attribution: '<a href="https://www.usgs.gov/programs/national-geospatial-program/supporting-themes">USDA NAIP / USGS The National Map</a> (imagery dates vary, CONUS 2017–2021)',
};
const originals = new WeakMap<Map, StyleSpecification['layers']>();
export function rememberBasemap(map: Map) { originals.set(map, map.getStyle().layers.slice()); }

/** Change only basemap presentation. All application sources and listeners survive. */
export function applyBasemap(map: Map, choice: MapStyle) {
  const layers = originals.get(map);
  if (!layers) return;
  if (!map.getSource('aerial')) {
    map.addSource('aerial', { type: 'raster', tiles: IMAGERY.tiles, tileSize: 256, minzoom: 0, maxzoom: 16,
      bounds: [-124.8, 24, -66.9, 49.5], attribution: IMAGERY.attribution });
    map.addLayer({ id: 'aerial-imagery', type: 'raster', source: 'aerial', layout: { visibility: 'none' },
      paint: { 'raster-fade-duration': 250 } }, layers.find(layer => layer.type !== 'background')?.id);
  }
  for (const layer of layers) {
    if (!map.getLayer(layer.id)) continue;
    const symbols = layer.type === 'symbol';
    map.setLayoutProperty(layer.id, 'visibility', choice === 'satellite' && !symbols && layer.type !== 'background' ? 'none' : layer.layout?.visibility ?? 'visible');
    if (symbols && layer.layout?.['text-field']) {
      map.setPaintProperty(layer.id, 'text-color', choice === 'satellite' ? '#ffffff' : layer.paint?.['text-color'] ?? '#33443d');
      map.setPaintProperty(layer.id, 'text-halo-color', choice === 'satellite' ? '#25352c' : layer.paint?.['text-halo-color'] ?? '#ffffff');
      map.setPaintProperty(layer.id, 'text-halo-width', choice === 'satellite' ? 1.5 : layer.paint?.['text-halo-width'] ?? 0);
    }
  }
  map.setLayoutProperty('aerial-imagery', 'visibility', choice === 'satellite' ? 'visible' : 'none');
}
