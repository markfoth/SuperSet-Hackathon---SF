import { afterEach, expect, it, vi } from 'vitest';
import { DEFAULT_WORKPLACES, isAreaGeometry, proxyProvider } from './provider';

afterEach(() => vi.unstubAllGlobals());
it('validates geometry instead of accepting empty or malformed successful responses', () => {
  expect(isAreaGeometry({ type: 'Polygon', coordinates: [] })).toBe(false);
  expect(isAreaGeometry({ type: 'MultiPolygon', coordinates: [] })).toBe(false);
  expect(isAreaGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] })).toBe(true);
  expect(isAreaGeometry({ type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, Infinity], [0, 0]]] })).toBe(false);
});
it('sends inbound home-to-work requests through the server proxy', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] } }) });
  vi.stubGlobal('fetch', fetch);
  expect((await proxyProvider('/api').getArea(DEFAULT_WORKPLACES[0])).ok).toBe(true);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ direction: 'to_workplace', mode: 'transit', minutes: 60 });
});
it('provider failures and invalid payloads remain recoverable failures', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ dryRun: true }) }));
  expect((await proxyProvider('/api').getArea(DEFAULT_WORKPLACES[0])).ok).toBe(false);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect((await proxyProvider('/api').getArea(DEFAULT_WORKPLACES[0])).ok).toBe(false);
});
