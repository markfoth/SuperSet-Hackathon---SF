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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...readDotEnv(join(ROOT, '.env')), ...process.env };
const APP_ID = env.TRAVELTIME_APP_ID || '';
const API_KEY = env.TRAVELTIME_API_KEY || '';
const PORT = Number(env.ROUTING_PROXY_PORT || 8787);
const DAILY_CAP = Number(env.ROUTING_DAILY_CAP || 300); // live calls/day; protects the free quota
const DRY_RUN = env.ROUTING_DRY_RUN === '1'; // return the request that WOULD be sent
const CACHE_FILE = join(ROOT, 'data', 'cache', 'isochrones.json'); // gitignored
const TRAVELTIME_URL = 'https://api.traveltimeapp.com/v4/time-map';
const MODES = { transit: 'public_transport', walk: 'walking', bike: 'cycling', drive: 'driving' };
// Study area (SF + northern Peninsula) with a margin; reject anything else.
const BOUNDS = { west: -122.62, south: 37.45, east: -122.25, north: 37.9 };

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
const inflight = new Map();
let liveToday = { day: today(), count: 0 };

function today() { return new Date().toISOString().slice(0, 10); }

function saveCache() {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
}

/** Next weekday at HH:MM in America/Los_Angeles, as ISO-8601 with the correct offset. */
export function nextWeekdayArrival(hhmm = '08:45', now = new Date()) {
  const tz = 'America/Los_Angeles';
  for (let add = 1; add <= 7; add += 1) {
    const d = new Date(now.getTime() + add * 86400000);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', timeZoneName: 'longOffset',
    }).formatToParts(d).map((p) => [p.type, p.value]));
    if (parts.weekday === 'Sat' || parts.weekday === 'Sun') continue;
    const offset = (parts.timeZoneName.replace('GMT', '') || '+00:00');
    return `${parts.year}-${parts.month}-${parts.day}T${hhmm}:00${offset}`;
  }
  throw new Error('unreachable');
}

export function buildRequest({ lat, lon, mode, minutes, arriveBy, arrivalTime }) {
  return {
    arrival_searches: [{
      id: 'commute',
      coords: { lat, lng: lon },
      arrival_time: arrivalTime || nextWeekdayArrival(arriveBy),
      travel_time: minutes * 60,
      transportation: { type: MODES[mode] },
    }],
  };
}

export function validate(body) {
  const lat = Number(body?.lat);
  const lon = Number(body?.lon);
  const minutes = Number(body?.minutes);
  const arriveBy = /^\d{2}:\d{2}$/.test(body?.arrive_by ?? '') ? body.arrive_by : '08:45';
  if (body?.direction != null && body.direction !== 'to_workplace') return { error: 'only inbound home-to-work routing is supported' };
  if (Number(arriveBy.slice(0, 2)) > 23 || Number(arriveBy.slice(3)) > 59) return { error: 'arrive_by must be a valid 24-hour HH:MM time' };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: 'lat/lon required' };
  if (lon < BOUNDS.west || lon > BOUNDS.east || lat < BOUNDS.south || lat > BOUNDS.north) return { error: 'location outside the study area' };
  if (!MODES[body?.mode]) return { error: `mode must be one of ${Object.keys(MODES).join(', ')}` };
  if (!(minutes >= 5 && minutes <= 120)) return { error: 'minutes must be 5–120' };
  // ~11 m rounding: shares cache entries between near-identical pins, below any meaningful routing difference.
  return { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, mode: body.mode, minutes, arriveBy, arrivalTime: nextWeekdayArrival(arriveBy) };
}

async function fetchIsochrone(q) {
  if (today() !== liveToday.day) liveToday = { day: today(), count: 0 };
  if (liveToday.count >= DAILY_CAP) throw Object.assign(new Error('daily live-request cap reached'), { status: 429 });
  liveToday.count += 1;
  const res = await fetch(TRAVELTIME_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json', 'X-Application-Id': APP_ID, 'X-Api-Key': API_KEY },
    body: JSON.stringify(buildRequest(q)),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    console.warn(`[proxy] TravelTime HTTP ${res.status}`); // never log credentials or bodies
    throw Object.assign(new Error(`routing provider error (HTTP ${res.status})`), { status: 502 });
  }
  const fc = await res.json();
  const geometry = fc?.features?.[0]?.geometry;
  if (!geometry || !['MultiPolygon', 'Polygon'].includes(geometry.type)) {
    throw Object.assign(new Error('routing provider returned no area'), { status: 502 });
  }
  return geometry;
}

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': env.ROUTING_ALLOW_ORIGIN || 'http://localhost:5173', 'Access-Control-Allow-Headers': 'Content-Type' });
  res.end(JSON.stringify(obj));
}

const server = createServer(async (req, res) => {
  const path = (req.url || '').replace(/^\/api/, '').split('?')[0];
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method === 'GET' && path === '/health') {
    return send(res, 200, { configured: Boolean(APP_ID && API_KEY), cached: Object.keys(cache).length, liveToday: liveToday.count, dailyCap: DAILY_CAP, dryRun: DRY_RUN });
  }
  if (req.method !== 'POST' || path !== '/isochrone') return send(res, 404, { error: 'not found' });

  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10000) return send(res, 413, { error: 'body too large' }); }
  let body;
  try { body = JSON.parse(raw); } catch { return send(res, 400, { error: 'invalid JSON' }); }
  const q = validate(body);
  if (q.error) return send(res, 400, q);
  if (DRY_RUN) return send(res, 200, { dryRun: true, request: buildRequest(q) });

  const key = `${q.lat},${q.lon},${q.mode},${q.minutes},${q.arrivalTime}`;
  const label = `TravelTime routing estimate · arrive by ${q.arriveBy} on ${q.arrivalTime.slice(0, 10)}`;
  const cached = cache[key];
  if (cached && Date.now() - Date.parse(cached.fetched) < 24 * 3600000) return send(res, 200, { geometry: cached.geometry, label, source: 'traveltime', cached: true });
  if (!APP_ID || !API_KEY) return send(res, 503, { error: 'routing not configured (set TRAVELTIME_APP_ID and TRAVELTIME_API_KEY in .env)' });

  try {
    if (!inflight.has(key)) inflight.set(key, fetchIsochrone(q).finally(() => inflight.delete(key)));
    const geometry = await inflight.get(key);
    cache[key] = { geometry, fetched: new Date().toISOString() };
    saveCache();
    return send(res, 200, { geometry, label, source: 'traveltime', cached: false });
  } catch (err) {
    return send(res, err.status || 502, { error: err.message });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  server.listen(PORT, () => {
    console.log(`[proxy] listening on http://localhost:${server.address().port} — TravelTime ${APP_ID && API_KEY ? 'configured' : 'NOT configured (fixtures only)'}${DRY_RUN ? ' [dry run]' : ''}`);
  });
}
