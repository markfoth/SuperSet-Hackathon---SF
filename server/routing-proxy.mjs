// Common Ground routing proxy — keeps TravelTime credentials server-side.
//
//   node server/routing-proxy.mjs            (or: npm run proxy)
//
// POST /isochrone  {lat, lon, mode, minutes, arrive_by?}  -> {geometry, label, source, cached}
// GET  /health                                            -> {configured, cached, liveToday, dailyCap}
//
// Commutes are HOME -> WORK: TravelTime `arrival_searches` (arrive at the workplace by
// `arrive_by`, default 08:45, on the next weekday, America/Los_Angeles).
// Uses only Node built-ins (Node >= 18). Reads TRAVELTIME_APP_ID / TRAVELTIME_API_KEY from the
// environment or the repo's .env. Without them every request returns 503 and the app falls back
// to its offline fixtures. TravelTime's free Basic plan is for development/testing only.
import { createServer } from 'node:http';
import { createRoutingService } from './routing-core.mjs';
export { buildRequest, nextWeekdayArrival, validate } from './routing-core.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...readDotEnv(join(ROOT, '.env')), ...process.env };
const APP_ID = env.TRAVELTIME_APP_ID || '';
const API_KEY = env.TRAVELTIME_API_KEY || '';
const PORT = Number(env.ROUTING_PROXY_PORT || 8787);
const CACHE_FILE = join(ROOT, 'data', 'cache', 'isochrones.json');

function readDotEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && m[2]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};

function saveCache() {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

const routing = createRoutingService({ env, cache: {
  get: (key) => cache[key],
  set: (key, value) => { cache[key] = value; saveCache(); },
} });

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.ROUTING_ALLOW_ORIGIN || 'http://localhost:5173', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  const path = (req.url || '').replace(/^\/api/, '').split('?')[0];
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && path === '/health') {
    return send(res, 200, { ...routing.health(), cached: Object.keys(cache).length });
  }
  if (req.method !== 'POST' || path !== '/isochrone') return send(res, 404, { error: 'not found' });

  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10000) return send(res, 413, { error: 'body too large' }); }
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid JSON' }); }
  const result = await routing.run(body);
  return send(res, result.status, result.body);
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, () => {
    console.log(`[proxy] listening on http://localhost:${server.address().port} — TravelTime ${APP_ID && API_KEY ? 'configured' : 'NOT configured (fixtures only)'}${routing.health().dryRun ? ' [dry run]' : ''}`);
  });
}
