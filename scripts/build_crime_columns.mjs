// Stable geographic graphics, not viewport clusters or building geometry.
import { readFile, writeFile } from 'node:fs/promises';
import { cellToParent, cellToBoundary, cellToLatLng } from 'h3-js';
const root = 'data/sf/processed';
const data = JSON.parse(await readFile(`${root}/incident_details.json`, 'utf8'));
const cells = [...new Set(data.locations.map(p => p[2]))];
const features = [];
for (const resolution of [6, 7, 8]) {
  for (const h3 of [...new Set(cells.map(c => cellToParent(c, resolution)))].sort()) {
    const [lat, lon] = cellToLatLng(h3);
    const ring = cellToBoundary(h3).map(([y, x]) => [+(lon + (x - lon) * .48).toFixed(6), +(lat + (y - lat) * .48).toFixed(6)]);
    ring.push(ring[0]);
    features.push({ type: 'Feature', id: h3, geometry: { type: 'Polygon', coordinates: [ring] }, properties: { h3, resolution } });
  }
}
const parents = Object.fromEntries(cells.map(c => [c, [cellToParent(c, 6), cellToParent(c, 7)]]));
await writeFile(`${root}/incident_columns.json`, JSON.stringify({ type: 'FeatureCollection', features, parents,
  meta: { metric: 'unique reported incidents in selected months and category', source: data.meta.source_url,
    scales: { 6: .05, 7: .05, 8: .05 }, units: 'display metres per incident; data graphics, not real structures',
    geometry: 'narrow columns centred on stable H3 cells, not full-cell polygons or locations of offences' } }));
console.log(`${features.length} stable column geometries at H3 levels 6, 7 and 8`);
