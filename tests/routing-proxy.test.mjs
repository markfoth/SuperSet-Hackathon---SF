import { test } from 'node:test';
import assert from 'node:assert/strict';
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
