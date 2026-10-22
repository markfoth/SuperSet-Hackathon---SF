import { expect, it } from 'vitest';
import type { NeighbourhoodMetrics } from '../../types';
import type { AreaResult } from '../filters/ranking';
import { sortResults } from './sortResults';

const results = ['unknown', 'expensive', 'cheap', 'same-price', 'invalid'].map((id) => ({ id }) as AreaResult);
const metrics = Object.fromEntries(Object.entries({ unknown: null, expensive: 4000, cheap: 2500, 'same-price': 2500, invalid: NaN })
  .map(([id, value]) => [id, { rents: { typical_rent_zip_weighted: value } }])) as Record<string, NeighbourhoodMetrics>;

it('low rent first keeps missing prices last and preserves match order for ties', () => {
  expect(sortResults(results, metrics, 'rent-asc').map((r) => r.id)).toEqual(['cheap', 'same-price', 'expensive', 'unknown', 'invalid']);
  expect(results.map((r) => r.id)).toEqual(['unknown', 'expensive', 'cheap', 'same-price', 'invalid']);
});

it('high rent first also keeps missing prices last', () => {
  expect(sortResults(results, metrics, 'rent-desc').map((r) => r.id)).toEqual(['expensive', 'cheap', 'same-price', 'unknown', 'invalid']);
});

it('best match restores the original priority ranking', () => {
  expect(sortResults(results, metrics, 'recommended')).toBe(results);
});
