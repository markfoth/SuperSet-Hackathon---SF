import { afterEach, expect, it, vi } from 'vitest';
import { journeySummary, requestJourneyTimes, type JourneyEvidence } from './journeys';
import { DEFAULT_WORKPLACES } from './provider';

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const evidence: JourneyEvidence = { fetchedAt: '2026-11-12T20:00:00Z', arrivalDate: '2026-11-13', assumptions: [], journeys: [
  { workplaceId: 'sfo', personId: 'alex', personName: 'Alex', name: 'Office', officeDays: 3, seconds: 2400, distanceMetres: null, status: 'ok' },
  { workplaceId: 'fidi', personId: 'sam', personName: 'Sam', name: 'Office', officeDays: 2, seconds: 1800, distanceMetres: null, status: 'ok' },
] };

it('computes transparent weekly return-trip illustrations and individual balance only from measured routes', () => {
  expect(journeySummary(evidence)).toMatchObject({ complete: true, totalWeeklyMinutes: 360, worstMinutes: 40, balanceMinutes: 120,
    people: [{ id: 'alex', weeklyMinutes: 240 }, { id: 'sam', weeklyMinutes: 120 }] });
  expect(journeySummary({ ...evidence, journeys: [evidence.journeys[0], { ...evidence.journeys[1], seconds: null, status: 'unavailable' }] }))
    .toMatchObject({ complete: false, totalWeeklyMinutes: null, worstMinutes: null, balanceMinutes: null });
});
it('groups multiple destinations under the same person and does not confuse zero office days with missing routes', () => {
  expect(journeySummary({ ...evidence, journeys: [evidence.journeys[0], { ...evidence.journeys[1], personId: 'alex' }] }).people).toHaveLength(1);
  expect(journeySummary({ ...evidence, journeys: [evidence.journeys[0], { ...evidence.journeys[1], officeDays: 0, seconds: null, status: 'unavailable' }] }))
    .toMatchObject({ complete: true, totalWeeklyMinutes: 240 });
  expect(journeySummary({ ...evidence, journeys: [] }).complete).toBe(false);
});
it('offline mode makes no route request and does not invent a time from the commute limit', async () => {
  vi.stubEnv('VITE_COMMUTE_PROVIDER', 'fixture');
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const result = await requestJourneyTimes({ lat: 37.76, lon: -122.42 }, DEFAULT_WORKPLACES);
  expect(fetch).not.toHaveBeenCalled();
  expect(result.journeys.every((journey) => journey.seconds === null && journey.status === 'unavailable')).toBe(true);
});
it('deduplicates explicit requests and preserves partial route failures as unknown', async () => {
  vi.stubEnv('VITE_COMMUTE_PROVIDER', 'proxy');
  vi.stubEnv('VITE_ROUTING_PROXY_URL', '/api');
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ fetchedAt: evidence.fetchedAt, arrivalDate: evidence.arrivalDate,
    journeys: [{ workplaceId: 'sfo', seconds: 2400, distanceMetres: 12000, status: 'ok' }, { workplaceId: 'fidi', seconds: null, distanceMetres: null, status: 'unreachable' }] }) });
  vi.stubGlobal('fetch', fetch);
  const home = { lat: 37.765, lon: -122.42 };
  const [a, b] = await Promise.all([requestJourneyTimes(home, DEFAULT_WORKPLACES), requestJourneyTimes(home, DEFAULT_WORKPLACES)]);
  expect(fetch).toHaveBeenCalledTimes(1); expect(a).toEqual(b);
  expect(a.journeys[1]).toMatchObject({ seconds: null, status: 'unreachable' });
  expect(journeySummary(a).totalWeeklyMinutes).toBeNull();
});
