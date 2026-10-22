import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { buildRequest, nextWeekdayArrival, validate } from '../server/routing-proxy.mjs';

test('routing is an arrival search from home to the workplace', () => {
  const request = buildRequest({ lat: 37.79, lon: -122.4, mode: 'transit', minutes: 45, arrivalTime: '2026-10-23T08:45:00-07:00' });
  assert.equal(request.departure_searches, undefined);
  assert.equal(request.arrival_searches[0].transportation.type, 'public_transport');
  assert.equal(request.arrival_searches[0].travel_time, 2700);
  assert.equal(request.arrival_searches[0].coords.lng, -122.4);
  assert.equal(request.arrival_searches[0].arrival_time, '2026-10-23T08:45:00-07:00');
});
test('next weekday arrival uses Pacific date, skips weekends and handles DST', () => {
  assert.equal(nextWeekdayArrival('08:45', new Date('2026-10-22T20:00:00Z')), '2026-10-23T08:45:00-07:00');
  assert.equal(nextWeekdayArrival('08:45', new Date('2026-10-23T20:00:00Z')), '2026-10-26T08:45:00-07:00');
  assert.equal(nextWeekdayArrival('08:45', new Date('2026-10-30T20:00:00Z')), '2026-11-02T08:45:00-08:00');
});
test('outbound, invalid hours and unsupported locations cannot reach a provider', () => {
  const base = { lat: 37.79, lon: -122.4, mode: 'transit', minutes: 45 };
  assert.match(validate({ ...base, direction: 'from_workplace' }).error, /inbound/);
  assert.match(validate({ ...base, arrive_by: '99:99' }).error, /valid/);
  assert.match(validate({ ...base, lon: 0 }).error, /outside/);
  assert.equal(validate(base).error, undefined);
});

test('HTTP proxy: missing credentials return 503; dry-run shows a genuine inbound payload', async () => {
  for (const dry of ['0', '1']) {
    const child = spawn(process.execPath, ['server/routing-proxy.mjs'], {
      env: { ...process.env, TRAVELTIME_APP_ID: '', TRAVELTIME_API_KEY: '', ROUTING_PROXY_PORT: '0', ROUTING_DRY_RUN: dry },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    try {
      const url = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('proxy startup timed out')), 10000);
        child.once('error', (e) => { clearTimeout(timer); reject(e); });
        child.stdout.on('data', (chunk) => {
          const match = String(chunk).match(/http:\/\/localhost:\d+/);
          if (match) { clearTimeout(timer); resolve(match[0]); }
        });
      });
      const health = await fetch(`${url}/health`).then((r) => r.json());
      assert.equal(health.configured, false);
      const response = await fetch(`${url}/isochrone`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 37.79, lon: -122.4, mode: 'transit', minutes: 45, direction: 'to_workplace' }) });
      assert.equal(response.status, dry === '1' ? 200 : 503);
      const body = await response.json();
      if (dry === '1') assert.equal(body.request.arrival_searches[0].transportation.type, 'public_transport');
      else assert.match(body.error, /not configured/);
    } finally { child.kill(); }
  }
});
