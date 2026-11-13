import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingService, routingConfiguration } from '../server/routing-core.mjs';
import handler from '../api/isochrone.js';
import journeysHandler from '../api/journeys.js';
import healthHandler from '../api/health.js';

const input = { lat: 37.6547, lon: -122.4077, mode: 'transit', minutes: 45, direction: 'to_workplace' };
const geometry = { type: 'Polygon', coordinates: [[[-122.45,37.6],[-122.35,37.6],[-122.35,37.7],[-122.45,37.6]]] };
const configured = { TRAVELTIME_APP_ID: 'test-app', TRAVELTIME_API_KEY: 'test-private-key', ROUTING_CACHE_ALLOWED: '1' };

test('serverless service sends inbound requests, deduplicates requests and caches the result', async () => {
  let calls = 0;
  const saved = new Map();
  const service = createRoutingService({ env: configured, cache: { get: (key) => saved.get(key), set: (key, value) => saved.set(key, value) },
    fetchImpl: async (_url, options) => {
      calls++;
      assert.equal(options.headers['X-Api-Key'], configured.TRAVELTIME_API_KEY);
      const body = JSON.parse(options.body);
      assert.equal(body.arrival_searches[0].transportation.type, 'public_transport');
      assert.equal(body.arrival_searches[0].coords.lat, input.lat);
      assert.equal(body.departure_searches, undefined);
      return Response.json({ features: [{ geometry }] });
    },
  });
  const results = await Promise.all([service.run(input), service.run(input)]);
  assert.equal(calls, 1);
  assert.equal(results[0].status, 200);
  assert.deepEqual(results[0].body.geometry, geometry);
  assert.equal((await service.run(input)).body.cached, true);
  assert.equal(calls, 1);
  assert.equal(JSON.stringify(results).includes(configured.TRAVELTIME_API_KEY), false);
});

test('serverless cache failures do not discard a successful TravelTime result', async () => {
  const service = createRoutingService({ env: configured, cache: { get: () => { throw new Error('unavailable'); }, set: () => { throw new Error('unavailable'); } },
    fetchImpl: async () => Response.json({ features: [{ geometry }] }),
  });
  assert.equal((await service.run(input)).status, 200);
});

test('missing credentials, invalid geometry, provider errors and daily caps fail closed', async () => {
  assert.equal((await createRoutingService({ env: {} }).run(input)).status, 503);
  assert.equal((await createRoutingService({ env: configured, fetchImpl: async () => Response.json({ features: [] }) }).run(input)).status, 502);
  const failed = await createRoutingService({ env: configured, fetchImpl: async () => new Response('private provider detail', { status: 429 }) }).run(input);
  assert.equal(failed.status, 502);
  assert.equal(JSON.stringify(failed).includes('private provider detail'), false);
  const limited = createRoutingService({ env: { ...configured, ROUTING_DAILY_CAP: '0' }, fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal((await limited.run(input)).status, 429);
});

test('Vercel endpoint rejects unsupported methods, foreign origins, oversized bodies and invalid JSON', async () => {
  const url = 'https://example.vercel.app/api/isochrone';
  assert.equal((await handler.fetch(new Request(url))).status, 405);
  assert.equal((await handler.fetch(new Request(url, { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }))).status, 403);
  assert.equal((await handler.fetch(new Request(url, { method: 'POST', body: 'x'.repeat(10001) }))).status, 413);
  assert.equal((await handler.fetch(new Request(url, { method: 'POST', body: 'invalid' }))).status, 400);
  const response = await handler.fetch(new Request(url, { method: 'POST', body: JSON.stringify({ ...input, lon: 0 }) }));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('persistent caching requires explicit verified-rights configuration and stale geometry is not reused', async () => {
  let reads = 0, writes = 0, calls = 0;
  const cache = { get: () => { reads++; return { geometry, fetched: new Date(Date.now() - 86400001).toISOString() }; }, set: () => { writes++; } };
  const fetchImpl = async () => { calls++; return Response.json({ features: [{ geometry }] }); };
  const withoutRights = createRoutingService({ env: { ...configured, ROUTING_CACHE_ALLOWED: '' }, cache, fetchImpl });
  assert.equal((await withoutRights.run(input)).status, 200);
  assert.equal(reads, 0); assert.equal(writes, 0);
  const stale = await createRoutingService({ env: configured, cache, fetchImpl }).run(input);
  assert.equal(stale.body.cached, false); assert.equal(calls, 2);
});

test('exact journey requests use selected home coordinate, per-person arrival times and measured seconds', async () => {
  let calls = 0;
  const service = createRoutingService({ env: configured, fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.traveltimeapp.com/v4/routes');
    assert.equal(options.headers.Accept, 'application/json');
    const request = JSON.parse(options.body);
    assert.deepEqual(request.locations[0], { id: 'home', coords: { lat: 37.765432, lng: -122.423456 } });
    assert.equal(request.arrival_searches.length, 2);
    assert.match(request.arrival_searches[0].arrival_time, /T09:30:00/);
    assert.deepEqual(request.arrival_searches[0].properties, ['travel_time']);
    return Response.json({ results: [{ search_id: 'sfo', locations: [{ id: 'home', properties: [{ travel_time: 2456, distance: 14300 }] }], unreachable: [] },
      { search_id: 'fidi', locations: [], unreachable: ['home'] }] });
  } });
  const body = { home: { lat: 37.765432, lon: -122.423456 }, destinations: [{ id: 'sfo', lat: input.lat, lon: input.lon, mode: 'transit', arrive_by: '09:30' },
    { id: 'fidi', lat: 37.7946, lon: -122.3999, mode: 'bike' }] };
  const [a, b] = await Promise.all([service.runJourneys(body), service.runJourneys(body)]);
  assert.equal(calls, 1); assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.deepEqual(a.body.journeys, [{ workplaceId: 'sfo', seconds: 2456, distanceMetres: null, status: 'ok' },
    { workplaceId: 'fidi', seconds: null, distanceMetres: null, status: 'unreachable' }]);
  assert.equal(service.health().liveToday, 2);
  assert.equal(JSON.stringify(a).includes(configured.TRAVELTIME_API_KEY), false);
});

test('journey failures, missing route properties, duplicate IDs and out-of-coverage homes never become zero-minute commutes', async () => {
  const body = { home: { lat: 37.76, lon: -122.42 }, destinations: [{ id: 'office', lat: input.lat, lon: input.lon, mode: 'transit' }] };
  const partial = createRoutingService({ env: configured, fetchImpl: async () => Response.json({ results: [] }) });
  assert.equal((await partial.runJourneys(body)).body.journeys[0].status, 'unavailable');
  assert.equal((await partial.runJourneys(body)).body.journeys[0].seconds, null);
  assert.equal((await partial.runJourneys({ ...body, home: { lat: 0, lon: 0 } })).status, 400);
  assert.equal((await partial.runJourneys({ ...body, destinations: [...body.destinations, ...body.destinations] })).status, 400);
  assert.equal((await partial.runJourneys({ ...body, destinations: Array.from({ length: 9 }, (_, i) => ({ ...body.destinations[0], id: `w${i}` })) })).status, 400);
  assert.equal((await createRoutingService({ env: {} }).runJourneys(body)).status, 503);
  const limited = createRoutingService({ env: { ...configured, ROUTING_DAILY_CAP: '0' }, fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal((await limited.runJourneys(body)).status, 429);
});

test('journey endpoint and health checks protect method, origin, body size and credentials', async () => {
  const url = 'https://example.vercel.app/api/journeys';
  assert.equal((await journeysHandler.fetch(new Request(url))).status, 405);
  assert.equal((await journeysHandler.fetch(new Request(url, { method: 'POST', headers: { Origin: 'https://other.example' }, body: '{}' }))).status, 403);
  assert.equal((await journeysHandler.fetch(new Request(url, { method: 'POST', body: 'x'.repeat(10001) }))).status, 413);
  assert.equal((await journeysHandler.fetch(new Request(url, { method: 'POST', body: '{' }))).status, 400);
  const health = await healthHandler.fetch(new Request('https://example.vercel.app/api/health'));
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  const healthBody = await health.json();
  assert.deepEqual(Object.keys(healthBody).sort(), ['apiKeyPresent','applicationIdPresent','cacheAllowed','capScope','configured','dailyCap','direction','dryRun','provider','service','status','supportedModes','timezone','usage'].sort());
  assert.equal(typeof healthBody.applicationIdPresent, 'boolean');
  assert.equal(typeof healthBody.apiKeyPresent, 'boolean');
  assert.equal(healthBody.direction, 'home-to-work');
  assert.equal(healthBody.timezone, 'America/Los_Angeles');
  assert.ok(healthBody.supportedModes.includes('transit'));
  assert.equal(routingConfiguration({}).status, 'missing server credentials');
  assert.equal(routingConfiguration(configured).status, 'ready for live evaluation');
  assert.equal(routingConfiguration({...configured,ROUTING_DRY_RUN:'1'}).status, 'dry run; live requests disabled');
  assert.equal(JSON.stringify(routingConfiguration(configured)).includes(configured.TRAVELTIME_API_KEY), false);
});
