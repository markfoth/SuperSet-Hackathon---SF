// Shared TravelTime request validation; no environment-file or filesystem access.
const MODES = { transit: 'public_transport', walk: 'walking', bike: 'cycling', drive: 'driving' };
// Study area (SF + northern Peninsula) with a margin; reject anything else.
const BOUNDS = { west: -122.62, south: 37.45, east: -122.25, north: 37.9 };

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

/** Same routing behavior for localhost and Vercel, with storage supplied by the host. */
export function createRoutingService({ env = process.env, cache, fetchImpl = fetch } = {}) {
  const appId = env.TRAVELTIME_APP_ID || '';
  const apiKey = env.TRAVELTIME_API_KEY || '';
  const dailyCap = Number(env.ROUTING_DAILY_CAP || 300);
  const dryRun = env.ROUTING_DRY_RUN === '1';
  const inflight = new Map();
  let liveToday = { day: new Date().toISOString().slice(0, 10), count: 0 };
  const health = () => ({ configured: Boolean(appId && apiKey), liveToday: liveToday.count,
    dailyCap, dryRun, capScope: 'per running instance; provider account limits still apply' });
  const reply = (status, body) => ({ status, body });

  async function requestArea(q) {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== liveToday.day) liveToday = { day, count: 0 };
    if (liveToday.count >= dailyCap) throw Object.assign(new Error('daily live-request cap reached'), { status: 429 });
    liveToday.count++;
    const response = await fetchImpl('https://api.traveltimeapp.com/v4/time-map', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json',
        'X-Application-Id': appId, 'X-Api-Key': apiKey },
      body: JSON.stringify(buildRequest(q)), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.warn(`[routing] TravelTime HTTP ${response.status}`);
      throw Object.assign(new Error(`routing provider error (HTTP ${response.status})`), { status: 502 });
    }
    const fc = await response.json();
    const geometry = fc?.features?.[0]?.geometry;
    if (!geometry || !['MultiPolygon', 'Polygon'].includes(geometry.type) || !geometry.coordinates?.length) {
      throw Object.assign(new Error('routing provider returned no area'), { status: 502 });
    }
    return geometry;
  }

  async function run(body) {
    const q = validate(body);
    if (q.error) return reply(400, q);
    if (dryRun) return reply(200, { dryRun: true, request: buildRequest(q) });
    if (!appId || !apiKey) return reply(503, { error: 'routing not configured (set TRAVELTIME_APP_ID and TRAVELTIME_API_KEY on the server)' });
    const key = `inbound-v1:${q.lat},${q.lon},${q.mode},${q.minutes},${q.arrivalTime}`;
    const label = `TravelTime routing estimate · arrive by ${q.arriveBy} on ${q.arrivalTime.slice(0, 10)}`;
    try {
      let cached;
      try { cached = await cache?.get(key); } catch { console.warn('[routing] cache read unavailable'); }
      if (cached && Date.now() - Date.parse(cached.fetched) < 86400000) {
        return reply(200, { geometry: cached.geometry, label, source: 'traveltime', cached: true });
      }
      if (!inflight.has(key)) {
        inflight.set(key, (async () => {
          const geometry = await requestArea(q);
          try { await cache?.set(key, { geometry, fetched: new Date().toISOString() }); }
          catch { console.warn('[routing] cache write unavailable'); }
          return geometry;
        })().finally(() => inflight.delete(key)));
      }
      const geometry = await inflight.get(key);
      return reply(200, { geometry, label, source: 'traveltime', cached: false });
    } catch (error) {
      // Do not return provider response bodies, arbitrary exception text or credentials.
      return reply(error.status || 502, { error: error.status ? error.message : 'routing request failed; try again' });
    }
  }
  return { run, health };
}
