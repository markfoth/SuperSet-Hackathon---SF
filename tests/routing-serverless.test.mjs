import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoutingService } from '../server/routing-core.mjs';
import handler from '../api/isochrone.js';

const input = { lat: 37.6547, lon: -122.4077, mode: 'transit', minutes: 45, direction: 'to_workplace' };
const geometry = { type: 'Polygon', coordinates: [[[-122.45,37.6],[-122.35,37.6],[-122.35,37.7],[-122.45,37.6]]] };
const configured = { TRAVELTIME_APP_ID: 'test-app', TRAVELTIME_API_KEY: 'test-private-key' };

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
