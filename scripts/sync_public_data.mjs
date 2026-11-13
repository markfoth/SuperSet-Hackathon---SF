// Copy browser-ready files from data/sf/processed/ (the single committed copy)
// into public/data/ (gitignored) so Vite serves and bundles them.
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = 'data/sf/processed';
const dest = 'public/data';
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
  if (f === 'terrain' && statSync(join(src, f)).isDirectory()) {
    const countTiles = (folder) => {
      for (const item of readdirSync(folder, { withFileTypes: true })) {
        if (item.isDirectory()) countTiles(join(folder, item.name));
        else {
          const source = join(folder, item.name);
          const target = source.replace(src, dest);
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
console.log(`synced ${n} data files (${(bytes / 1e6).toFixed(1)} MB) to ${dest}/`);
