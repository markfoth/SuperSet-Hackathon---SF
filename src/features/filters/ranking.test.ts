import { describe, expect, it } from 'vitest';
import { comparePriority, evaluate, nearMisses, previewMustHave, ranked, summarize, type EvaluateInput } from './ranking';
import { measurementBand, orderedPreferences, PREFERENCES } from './preferences';
import fixture from '../../test/areaCells.fixture.json';
import type { AreaCellCollection, AreaCellProps, NeighbourhoodMetrics } from '../../types';

function input(overrides: Partial<AreaCellProps>[] = []): EvaluateInput {
  const cells = structuredClone(fixture) as AreaCellCollection;
  cells.features.forEach((f, i) => Object.assign(f.properties, {
    residential: true, h3: String(i), street_grade_pct: [3, 15, 6][i], park_distance_m: [900, 0, 200][i],
  }, overrides[i]));
  return { cells, metrics: { 'potrero-hill': { name: 'Potrero Hill' } as NeighbourhoodMetrics },
    commutes: Object.fromEntries(cells.features.map((f) => [f.properties.h3, { all: true, byWorkplace: { a: true, b: true } }])),
    prefs: {}, priorityOrder: ['flat', 'parks'] };
}

describe('fine-area feasibility and priorities', () => {
  it('soft preferences rank without excluding', () => {
    expect(evaluate({ ...input(), prefs: { flat: 'important', parks: 'nice' } }).every((r) => r.eligible)).toBe(true);
  });
  it('click sequence cannot affect results', () => {
    const a = evaluate({ ...input(), prefs: { flat: 'must', parks: 'important' } });
    const b = evaluate({ ...input(), prefs: { parks: 'important', flat: 'must' } });
    expect(a).toEqual(b);
  });
  it('reports every failed hard condition', () => {
    const r = evaluate({ ...input([{ street_grade_pct: 15 }]), prefs: { flat: 'must', parks: 'must' } })[0];
    expect(r.reasons).toHaveLength(2);
    expect(r.state).toBe('excluded');
  });
  it('missing must-have is unknown, never eligible or a failed measurement', () => {
    const r = evaluate({ ...input([{ street_grade_pct: null }]), prefs: { flat: 'must' } })[0];
    expect(r.state).toBe('unknown'); expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual([]); expect(r.unchecked).toEqual(['flat']);
    expect(r.priorityVector).toEqual([null]);
  });
  it('missing soft data stays null and is disclosed', () => {
    const r = evaluate({ ...input([{ street_grade_pct: null }]), prefs: { flat: 'important', parks: 'nice' } })[0];
    expect(r.eligible).toBe(true); expect(r.state).toBe('partial');
    expect(r.assessed).toBe(1); expect(r.priorityVector[0]).toBeNull(); expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('even entirely missing soft preferences never remove a commute-feasible cell', () => {
    const r = evaluate({ ...input([{ street_grade_pct: null }]), prefs: { flat: 'nice' } })[0];
    expect(r.eligible).toBe(true); expect(r.state).toBe('partial');
    expect(r.assessed).toBe(0); expect(r.priorityVector).toEqual([null]);
  });
  it('explicit priority changes the winner', () => {
    const base = { ...input(), prefs: { flat: 'important' as const, parks: 'important' as const } };
    expect(ranked(evaluate(base))[0].id).toBe('0');
    expect(ranked(evaluate({ ...base, priorityOrder: ['parks', 'flat'] }))[0].id).toBe('1');
  });
  it('tiny grade differences within a band yield to the next priority', () => {
    const base = input([{ street_grade_pct: 2.1 }, { street_grade_pct: 2.2 }]);
    expect(ranked(evaluate({ ...base, prefs: { flat: 'important', parks: 'important' } }))[0].id).toBe('1');
  });
  it('important distinguishes differences that nice treats as a tie', () => {
    const flat = PREFERENCES.find((p) => p.id === 'flat')!;
    expect(measurementBand(flat, 0.5, 'nice')).toBe(measurementBand(flat, 3, 'nice'));
    expect(measurementBand(flat, 0.5, 'important')).not.toBe(measurementBand(flat, 3, 'important'));
  });
  it('all workplaces gate each individual cell', () => {
    const base = input(); base.commutes['0'] = { all: false, byWorkplace: { a: true, b: false } };
    expect(evaluate(base)[0].reasons).toEqual([{ kind: 'commute', workplaceId: 'b', coverage: 0 }]);
  });
  it('missing routes block even when another route passes', () => {
    const base = input(); base.commutes['0'] = { all: null, byWorkplace: { a: true, b: null } };
    expect(evaluate(base)[0].state).toBe('unknown'); expect(evaluate(base)[0].eligible).toBe(false);
  });
  it('a partial neighbourhood stays discoverable without a majority threshold', () => {
    const base = input(); base.commutes['0'] = base.commutes['1'] = { all: false, byWorkplace: { a: false, b: true } };
    const r = summarize(base, evaluate(base))[0];
    expect(r.eligible).toBe(true); expect(r.eligibleCount).toBe(1); expect(r.eligibleShare).toBeLessThan(0.5);
  });
  it('nonresidential cells exclude, uncertain use is flagged without silent removal', () => {
    const r = evaluate(input([{ residential: false }, { residential: null }]));
    expect(r[0].state).toBe('excluded'); expect(r[1].eligible).toBe(true); expect(r[1].warnings.length).toBeGreaterThan(0);
  });
  it('preview distinguishes excluded and unknown cells', () => {
    const base = input([{ street_grade_pct: null }]);
    const p = previewMustHave(base, 'flat');
    expect(p).toMatchObject({ eligibleNow: 3, excluded: 1, unchecked: 1, neighbourhoodsLost: 0 });
  });
  it('near misses remain excluded, with measured threshold and gap', () => {
    const base = { ...input([{ street_grade_pct: 8.2 }]), prefs: { flat: 'must' as const } };
    const misses = nearMisses(evaluate(base));
    expect(misses).toHaveLength(1); expect(misses[0].value).toBe(8.2); expect(misses[0].threshold).toBe(8);
    expect(misses[0].result.eligible).toBe(false);
  });
  it('priority storage migration deduplicates and retains every preference', () => {
    const defs = orderedPreferences(['parks', 'parks', 'unknown']);
    expect(defs[0].id).toBe('parks'); expect(defs).toHaveLength(PREFERENCES.length);
  });
  it('comparator is deterministic and transitive with missing data', () => {
    const vectors = [[null, 0], [0, null], [-1, 2], [0, 1], [0, 2]].map((priorityVector) => ({ priorityVector }));
    for (const a of vectors) for (const b of vectors) for (const c of vectors) {
      if (comparePriority(a, b) <= 0 && comparePriority(b, c) <= 0) expect(comparePriority(a, c)).toBeLessThanOrEqual(0);
    }
  });
});
