import { describe, expect, it } from 'vitest';
import { evaluate, previewMustHave, ranked, type EvaluateInput } from './ranking';
import type { PreferenceDef } from './preferences';
import type { NeighbourhoodContent, NeighbourhoodMetrics } from '../../types';

// Two tiny preferences over a fake metric so tests don't depend on real data.
const defs: PreferenceDef[] = [
  {
    id: 'flat', label: 'Flat', higherIsBetter: false, source: '', format: String,
    value: (m) => m.hills?.median_slope_pct ?? null,
    mustHave: { describe: '< 8%', passes: (v) => v < 8 },
  },
  {
    id: 'parks', label: 'Parks', higherIsBetter: true, source: '', format: String,
    value: (m) => m.parks?.share_within_400m ?? null,
    mustHave: { describe: '>= 0.9', passes: (v) => v >= 0.9 },
  },
];

function area(name: string, slope: number | null, parks: number | null): NeighbourhoodMetrics {
  return {
    name, area_km2: 1, crime: null, cycling: null, transit: null, groceries: null, collisions: null, rents: null,
    population: null, environment: null, food_drink: null,
    hills: slope == null ? null : { median_slope_pct: slope, share_steep: 0, elev_min_m: 0, elev_max_m: 0 },
    parks: parks == null ? null : { share_within_400m: parks, park_land_share: 0 },
  };
}

const metrics = {
  a: area('A', 3, 0.5),   // flat, few parks
  b: area('B', 15, 1.0),  // hilly, great parks
  c: area('C', 6, 0.95),  // flat-ish, great parks
  d: area('D', null, 0.92), // no elevation data
};
const content: Record<string, NeighbourhoodContent> = Object.fromEntries(
  Object.entries(metrics).map(([id, m]) => [id, { name: m.name, description: '', tags: [], residential: true, photos: [] }]),
);
const base: EvaluateInput = { metrics, content, coverage: null, prefs: {}, defs };

describe('evaluate', () => {
  it('soft preferences never exclude an area', () => {
    const r = evaluate({ ...base, prefs: { flat: 'important', parks: 'nice' } });
    expect(r.every((x) => x.eligible)).toBe(true);
  });

  it('is independent of the order preferences were set', () => {
    const one = evaluate({ ...base, prefs: { flat: 'must', parks: 'important' } });
    const two = evaluate({ ...base, prefs: { parks: 'important', flat: 'must' } });
    expect(one).toEqual(two);
  });

  it('reports every failed must-have, not just the first', () => {
    const r = evaluate({ ...base, prefs: { flat: 'must', parks: 'must' } });
    const a = r.find((x) => x.id === 'a')!;
    const b = r.find((x) => x.id === 'b')!;
    expect(a.reasons.map((x) => x.kind === 'mustHave' && x.prefId)).toEqual(['parks']);
    expect(b.reasons.map((x) => x.kind === 'mustHave' && x.prefId)).toEqual(['flat']);
    expect(ranked(r).map((x) => x.id)).toEqual(['c', 'd']);
  });

  it('missing data is never a pass or a fail', () => {
    const r = evaluate({ ...base, prefs: { flat: 'must' } });
    const d = r.find((x) => x.id === 'd')!;
    expect(d.eligible).toBe(true);
    expect(d.unchecked).toEqual(['flat']);
    expect(d.score).toBeNull(); // nothing could be assessed
    const soft = evaluate({ ...base, prefs: { flat: 'nice', parks: 'nice' } }).find((x) => x.id === 'd')!;
    expect(soft.assessed).toBe(1);
    expect(soft.active).toBe(2);
  });

  it('an important preference outweighs a nice-to-have', () => {
    const r = ranked(evaluate({ ...base, prefs: { flat: 'nice', parks: 'important' } }));
    expect(r[0].id).not.toBe('a');
    const r2 = ranked(evaluate({ ...base, prefs: { flat: 'important', parks: 'nice' } }));
    expect(r2[0].id).not.toBe('b');
  });

  it('gates on commute coverage for every workplace', () => {
    const coverage = {
      a: { all: 0.9, byWorkplace: { sfo: 0.9, fidi: 1 } },
      b: { all: 0.2, byWorkplace: { sfo: 0.2, fidi: 1 } },
      c: { all: 0, byWorkplace: { sfo: 0, fidi: 0 } },
      d: { all: 0.6, byWorkplace: { sfo: 0.6, fidi: 0.7 } },
    };
    const r = evaluate({ ...base, coverage });
    expect(ranked(r).map((x) => x.id)).toEqual(['a', 'd']);
    expect(r.find((x) => x.id === 'c')!.reasons).toHaveLength(2);
  });

  it('excludes non-residential areas with a visible reason', () => {
    const r = evaluate({ ...base, content: { ...content, b: { ...content.b, residential: false } } });
    expect(r.find((x) => x.id === 'b')!.reasons).toEqual([{ kind: 'nonResidential' }]);
  });
});

describe('previewMustHave', () => {
  it('counts exactly the areas that activating the must-have would remove', () => {
    const input = { ...base, prefs: { parks: 'must' as const } };
    const p = previewMustHave(input, 'flat');
    const after = ranked(evaluate({ ...input, prefs: { parks: 'must', flat: 'must' } }));
    expect(p.eligibleNow).toBe(3); // b, c, d pass parks
    expect(p.excluded).toBe(p.eligibleNow - after.length);
    expect(p.unchecked).toBe(1); // d has no elevation data
  });
});
