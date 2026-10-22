// Copy browser-ready files from data/sf/processed/ (the single committed copy)
// into public/data/ (gitignored) so Vite serves and bundles them.
// Runs automatically before `npm run dev` and `npm run build`.
import { cpSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const src = 'data/sf/processed';
const dest = 'public/data';
mkdirSync(dest, { recursive: true });
let n = 0;
let bytes = 0;
for (const f of readdirSync(src)) {
  if (f.startsWith('_') || !/\.(?:(geo)?json|png)$/.test(f)) continue;
  cpSync(join(src, f), join(dest, f));
  bytes += statSync(join(src, f)).size;
  n += 1;
}
console.log(`synced ${n} data files (${(bytes / 1e6).toFixed(1)} MB) to ${dest}/`);
