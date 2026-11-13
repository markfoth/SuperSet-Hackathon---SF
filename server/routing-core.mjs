// Shared TravelTime request validation; no environment-file or filesystem access.
const MODES = { transit: 'public_transport', walk: 'walking', bike: 'cycling', drive: 'driving' };
// Study area (SF + northern Peninsula) with a margin; reject anything else.
const BOUNDS = { west: -122.62, south: 37.60, east: -122.25, north: 37.9 };

export function isAreaGeometry(value) {
  if (!value || !['Polygon', 'MultiPolygon'].includes(value.type)) return false;
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  return Array.isArray(polygons) && polygons.length > 0 && polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0
    && polygon.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every((xy) => Array.isArray(xy) && xy.length >= 2
      && Number.isFinite(xy[0]) && Number.isFinite(xy[1]) && Math.abs(xy[0]) <= 180 && Math.abs(xy[1]) <= 90)
      && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]));
}

const numberField = (value) => value == null || typeof value === 'boolean' || String(value).trim() === '' ? NaN : Number(value);

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
  const lat = numberField(body?.lat);
  const lon = numberField(body?.lon);
  const minutes = numberField(body?.minutes);
  if (body?.arrive_by != null && !/^\d{2}:\d{2}$/.test(body.arrive_by)) return { error: 'arrive_by must be a valid 24-hour HH:MM time' };
  const arriveBy = body?.arrive_by || '08:45';
  if (body?.direction != null && body.direction !== 'to_workplace') return { error: 'only inbound home-to-work routing is supported' };
  if (Number(arriveBy.slice(0, 2)) > 23 || Number(arriveBy.slice(3)) > 59) return { error: 'arrive_by must be a valid 24-hour HH:MM time' };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { error: 'lat/lon required' };
  if (lon < BOUNDS.west || lon > BOUNDS.east || lat < BOUNDS.south || lat > BOUNDS.north) return { error: 'location outside the study area' };
  if (!MODES[body?.mode]) return { error: `mode must be one of ${Object.keys(MODES).join(', ')}` };
  if (!(Number.isInteger(minutes) && minutes >= 5 && minutes <= 120)) return { error: 'minutes must be a whole number from 5 to 120' };
  // ~11 m rounding: shares cache entries between near-identical pins, below any meaningful routing difference.
  return { lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4, mode: body.mode, minutes, arriveBy, arrivalTime: nextWeekdayArrival(arriveBy) };
}

/** Same routing behavior for localhost and Vercel, with storage supplied by the host. */
export function createRoutingService({ env = process.env, cache, fetchImpl = fetch } = {}) {
  const appId = env.TRAVELTIME_APP_ID || '';
  const apiKey = env.TRAVELTIME_API_KEY || '';
  const requestedCap = Number(env.ROUTING_DAILY_CAP ?? 300);
  const dailyCap = Number.isInteger(requestedCap) && requestedCap >= 0 ? requestedCap : 300;
  const dryRun = env.ROUTING_DRY_RUN === '1';
  // Basic-plan storage rights are not assumed. An operator must verify their rights first.
  const cacheAllowed = env.ROUTING_CACHE_ALLOWED === '1';
  const inflight = new Map();
  let liveToday = { day: new Date().toISOString().slice(0, 10), count: 0 };
  const health = () => ({ configured: Boolean(appId && apiKey), liveToday: liveToday.count,
    dailyCap, dryRun, cacheAllowed, capScope: 'per running instance; provider account limits still apply' });
  const reply = (status, body) => ({ status, body });

  async function requestProvider(endpoint, request, hits = 1) {
    const day = new Date().toISOString().slice(0, 10);
    if (day !== liveToday.day) liveToday = { day, count: 0 };
    if (liveToday.count + hits > dailyCap) throw Object.assign(new Error('daily live-request cap reached'), { status: 429 });
    liveToday.count += hits;
    const response = await fetchImpl(`https://api.traveltimeapp.com/v4/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: endpoint === 'routes' ? 'application/json' : 'application/geo+json',
        'X-Application-Id': appId, 'X-Api-Key': apiKey },
      body: JSON.stringify(request), signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      console.warn(`[routing] TravelTime HTTP ${response.status}`);
      throw Object.assign(new Error(`routing provider error (HTTP ${response.status})`), { status: 502 });
    }
    return response.json();
  }

  async function requestArea(q) {
    const fc = await requestProvider('time-map', buildRequest(q));
    const geometry = fc?.features?.[0]?.geometry;
    if (!isAreaGeometry(geometry)) {
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
      try { if (cacheAllowed) cached = await cache?.get(key); } catch { console.warn('[routing] cache read unavailable'); }
      const age = Date.now() - Date.parse(cached?.fetched);
      if (cached && age >= 0 && age < 86400000 && isAreaGeometry(cached.geometry)) {
        return reply(200, { geometry: cached.geometry, label, source: 'traveltime', cached: true, fetchedAt: cached.fetched, arrivalDate: q.arrivalTime.slice(0, 10) });
      }
      if (!inflight.has(key)) {
        inflight.set(key, (async () => {
          const geometry = await requestArea(q);
          const fetched = new Date().toISOString();
          try { if (cacheAllowed) await cache?.set(key, { geometry, fetched }); }
          catch { console.warn('[routing] cache write unavailable'); }
          return { geometry, fetched };
        })().finally(() => inflight.delete(key)));
      }
      const result = await inflight.get(key);
      return reply(200, { geometry: result.geometry, label, source: 'traveltime', cached: false, fetchedAt: result.fetched, arrivalDate: q.arrivalTime.slice(0, 10) });
    } catch (error) {
      // Do not return provider response bodies, arbitrary exception text or credentials.
      return reply(error.status || 502, { error: error.status ? error.message : 'routing request failed; try again' });
    }
  }
  async function runJourneys(body) {
    const home = { lat: numberField(body?.home?.lat), lon: numberField(body?.home?.lon) };
    if (!Number.isFinite(home.lat) || !Number.isFinite(home.lon) || home.lat < BOUNDS.south || home.lat > BOUNDS.north || home.lon < BOUNDS.west || home.lon > BOUNDS.east) {
      return reply(400, { error: 'home must be a valid coordinate inside SF to SFO coverage' });
    }
    if (!Array.isArray(body?.destinations) || !body.destinations.length || body.destinations.length > 8) return reply(400, { error: 'provide 1 to 8 destinations' });
    const ids = new Set();
    const destinations = [];
    for (const destination of body.destinations) {
      if (typeof destination?.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(destination.id) || ids.has(destination.id)) return reply(400, { error: 'destination ids must be unique simple identifiers' });
      ids.add(destination.id);
      const q = validate({ ...destination, minutes: 60, direction: 'to_workplace' });
      if (q.error) return reply(400, q);
      destinations.push({ ...q, id: destination.id });
    }
    if (dryRun) return reply(503, { error: 'journey measurements unavailable in dry-run mode' });
    if (!appId || !apiKey) return reply(503, { error: 'live journey routing is not configured on the server' });
    const request = {
      locations: [{ id: 'home', coords: { lat: home.lat, lng: home.lon } }, ...destinations.map((destination, index) => ({ id: `destination-${index}`, coords: { lat: destination.lat, lng: destination.lon } }))],
      arrival_searches: destinations.map((destination, index) => ({ id: destination.id, arrival_location_id: `destination-${index}`, departure_location_ids: ['home'],
        arrival_time: destination.arrivalTime, transportation: { type: MODES[destination.mode] }, properties: ['travel_time'] })),
    };
    const key = `journeys-v1:${JSON.stringify(request)}`;
    const arrivalDate = destinations[0].arrivalTime.slice(0, 10);
    try {
      if (cacheAllowed) {
        let cached;
        try { cached = await cache?.get(key); } catch { /* optional cache */ }
        const age = Date.now() - Date.parse(cached?.fetchedAt);
        if (cached && age >= 0 && age < 86400000 && Array.isArray(cached.journeys)) return reply(200, { ...cached, cached: true });
      }
      if (!inflight.has(key)) inflight.set(key, (async () => {
        const response = await requestProvider('routes', request, destinations.length);
        if (!Array.isArray(response?.results)) throw Object.assign(new Error('journey provider returned no route results'), { status: 502 });
        const journeys = destinations.map((destination) => {
          const result = response.results.find((item) => item?.search_id === destination.id);
          const properties = result?.locations?.find((location) => location?.id === 'home')?.properties?.[0];
          const seconds = properties?.travel_time;
          const measured = typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0;
          return { workplaceId: destination.id, seconds: measured ? seconds : null,
            // Transit distance is not a first-class provider measurement. No distance is requested.
            distanceMetres: null,
            status: measured ? 'ok' : result?.unreachable?.includes('home') ? 'unreachable' : 'unavailable' };
        });
        const result = { journeys, fetchedAt: new Date().toISOString(), arrivalDate, source: 'traveltime' };
        try { if (cacheAllowed) await cache?.set(key, result); } catch { /* optional cache */ }
        return result;
      })().finally(() => inflight.delete(key)));
      return reply(200, { ...await inflight.get(key), cached: false });
    } catch (error) { return reply(error.status || 502, { error: error.status ? error.message : 'journey request failed; try again' }); }
  }
  return { run, runJourneys, health };
}
