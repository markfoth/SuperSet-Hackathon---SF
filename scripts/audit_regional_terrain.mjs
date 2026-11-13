import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const phase = process.env.CG_AUDIT_PHASE || 'baseline';
const folder = `docs/audit/${phase}-3d`;
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const requests = [], errors = [], responses = [];
page.on('request', r => { if (/terrain|mapterhorn/.test(r.url())) requests.push(r.url()); });
page.on('response', r => { if (/terrain|mapterhorn/.test(r.url())) responses.push({ url: r.url(), status: r.status(), type: r.headers()['content-type'] }); });
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(e.message));
await page.goto(process.env.CG_BASE_URL || 'http://localhost:5189/');
await page.locator('.map[data-vector-loaded="true"]').waitFor({ timeout: 30000 });
await page.evaluate(async () => {
  const handle = document.querySelector('.map').__commonGroundMap;
  if (handle) { window.__auditMap = handle; return; }
  const url = performance.getEntriesByType('resource').map(x => x.name).find(x => /\/maplibre-gl\.js\?/.test(x));
  if (!url) throw new Error('MapLibre development module was not found');
  const mod = await import(url);
  const MapClass = mod.Map || mod.default.Map;
  const original = MapClass.prototype.setTerrain;
  MapClass.prototype.setTerrain = function (...args) { window.__auditMap = this; return original.apply(this, args); };
});
if (process.env.CG_AUDIT_BUILDINGS === '1') await page.getByRole('button', { name: '3D buildings', exact: true }).click();
await page.getByRole('button', { name: 'Terrain', exact: true }).click();
await page.waitForFunction(() => Boolean(window.__auditMap));
const locations = [
  ['downtown', -122.3999, 37.7946], ['twin-peaks', -122.4477, 37.7544],
  ['sf-daly-boundary', -122.462, 37.708], ['colma', -122.458, 37.676],
  ['brisbane', -122.405, 37.681], ['south-sf', -122.411, 37.654],
  ['san-bruno', -122.411, 37.630], ['sfo', -122.379, 37.6213],
  ['pacifica', -122.487, 37.613], ['beyond-south', -122.411, 37.575],
  ['oakland', -122.271, 37.804], ['berkeley', -122.273, 37.872],
];
const results = [];
for (const [name, lon, lat] of locations) {
  const cameras = process.env.CG_AUDIT_MATRIX === '1' ? [[9, 0, 0], [12, 45, 90], [15, 60, 35], [17, 60, -45]] : [[15, 60, 35]];
  for (const [zoom, pitch, bearing] of cameras) {
  const before = requests.length;
  await page.evaluate(({ lon, lat, zoom, pitch, bearing }) => { window.__auditMap.jumpTo({ center: [lon, lat], zoom, pitch, bearing, padding: { top: 0, bottom: 0, left: 0, right: 0 } }); }, { lon, lat, zoom, pitch, bearing });
  await page.waitForTimeout(1800);
  const data = await page.evaluate(({ lon, lat }) => {
    const m = window.__auditMap, centre = m.getCenter();
    const samples = [-0.015, 0, 0.015].flatMap(dx => [-0.015, 0, 0.015].map(dy => ({ lon: lon + dx, lat: lat + dy, elevation: m.queryTerrainElevation({ lng: lon + dx, lat: lat + dy }) })));
    return { camera: { centre: centre.toArray(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing() }, terrain: m.getTerrain(), sources: Object.fromEntries(Object.entries(m.getStyle().sources).filter(([key]) => key.includes('terrain'))), samples };
  }, { lon, lat });
  results.push({ name, requested: [lon, lat], ...data, requests: requests.slice(before) });
  if (zoom === 15) await page.screenshot({ path: `${folder}/${name}.png` });
  }
}
await writeFile(`${folder}/diagnostics.json`, JSON.stringify({ results, requests, responses, errors }, null, 2));
console.log(JSON.stringify(results.map(r => ({ name: r.name, camera: r.camera, samples: r.samples, tileRequests: r.requests.length })), null, 2));
await browser.close();
