// Copy browser-ready files from data/sf/processed/ (the single committed copy)
// into public/data/ (gitignored) so Vite serves and bundles them.
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join, resolve, sep, relative } from 'node:path';

const src = 'data/sf/processed';
const dest = resolve('public/data');
// Canonical full geometries are reproducible pipeline inputs, not browser assets.
// Remove stale generated copies, including the retired clipped DEM.
const pipelineOnly = new Set(['terrain', 'terrain.json', 'area_cells.geojson', 'area_cell_display.geojson', 'neighbourhood_samples.json', 'crime_by_neighbourhood.json',
  'parks.geojson','groceries.geojson','cafes.geojson','restaurants.geojson','nightlife_venues.geojson','cycling_network.geojson','transit_stops.geojson','transit_routes.geojson','census_tracts.geojson',
  'hills_grid.geojson','street_gradients.geojson','street_gradients_peninsula.geojson','street_gradient_validation.json','bars.geojson']);
mkdirSync(dest, { recursive: true });
let n = 0;
let bytes = 0;
// Avoid rewriting a file that an already-running Vite preview may be reading.
// Data generation remains outside frontend builds; unchanged copies are reused.
function syncFile(source, target) {
  if (existsSync(target) && statSync(source).size === statSync(target).size && readFileSync(source).equals(readFileSync(target))) return;
  cpSync(source, target);
}
for (const f of readdirSync(src)) {
  if (pipelineOnly.has(f)) continue;
  if (['cells','context'].includes(f) && statSync(join(src, f)).isDirectory()) {
    const countTiles = (folder) => {
      for (const item of readdirSync(folder, { withFileTypes: true })) {
        if (item.isDirectory()) countTiles(join(folder, item.name));
        else {
          const source = join(folder, item.name);
          const target = join(dest, relative(src, source));
          mkdirSync(join(target, '..'), { recursive: true });
          syncFile(source, target);
          n += 1; bytes += statSync(source).size;
        }
      }
    };
    countTiles(join(src, f));
    continue;
  }
  if (f.startsWith('_') || !/\.(?:(geo)?json|png)$/.test(f)) continue;
  syncFile(join(src, f), join(dest, f));
  bytes += statSync(join(src, f)).size;
  n += 1;
}
// Remove only specifically retired generated copies under the fixed output root.
for (const name of pipelineOnly) {
  const target = join(dest, name);
  if (!resolve(target).startsWith(dest + sep)) throw new Error('Refusing a path outside generated public data');
  if (existsSync(target)) rmSync(target, { recursive: true });
}
console.log(`synced ${n} data files (${(bytes / 1e6).toFixed(1)} MB) to ${dest}/`);
