import { describe, expect, it } from 'vitest';
import { cellCommutes, commonReachableGeometry } from './eligibility';
import { evaluate, summarize } from '../filters/ranking';
import type { AreaGeometry, AreaCellCollection, Workplace, NeighbourhoodMetrics } from '../../types';
import type { CommuteArea, CommuteResult } from './provider';
import fixture from '../../test/areaCells.fixture.json';

const box = (w: number, e: number): AreaGeometry => ({ type: 'Polygon', coordinates: [[[w, 0], [e, 0], [e, 2], [w, 2], [w, 0]]] });
const route = (id: string, geometry: AreaGeometry): CommuteArea => ({ workplaceId: id, geometry, mode: 'transit', minutes: 30, label: 'test', source: 'test', synthetic: false });
const workplaces = [{ id: 'a' }, { id: 'b' }] as Workplace[];
function cells(): AreaCellCollection {
  const fc = structuredClone(fixture) as AreaCellCollection;
  fc.features = fc.features.slice(0, 2);
  fc.features.forEach((f, i) => Object.assign(f.properties, { h3: String(i), nhood_id: 'same', check_lat: 1, check_lon: i ? 3 : 1, residential: true }));
  return fc;
}

describe('shared home-to-work reachability', () => {
  it('regression: disjoint halves of one neighbourhood never jointly qualify', () => {
    const fc = cells(), a = route('a', box(0, 2)), b = route('b', box(2.1, 4));
    const commutes = cellCommutes(fc, workplaces, { a: { ok: true, area: a }, b: { ok: true, area: b } });
    expect(Object.values(commutes).every((r) => r.all === false)).toBe(true);
    const input = { cells: fc, metrics: { same: { name: 'Same neighbourhood' } as NeighbourhoodMetrics }, commutes, prefs: {}, priorityOrder: [] };
    const summary = summarize(input, evaluate(input))[0];
    expect(summary.eligible).toBe(false); expect(summary.eligibleCount).toBe(0);
    expect(summary.commute!.byWorkplace.a).toBeGreaterThan(0); expect(summary.commute!.byWorkplace.b).toBeGreaterThan(0);
    expect(commonReachableGeometry([a, b], 2)).toBeNull();
  });
  it.each([undefined, { ok: false, reason: 'provider failed' } as CommuteResult])('never drops a pending or failed workplace', (b) => {
    const r = cellCommutes(cells(), workplaces, { a: { ok: true, area: route('a', box(0, 4)) }, b });
    expect(r['0'].all).toBeNull(); expect(r['0'].byWorkplace.b).toBeNull();
  });
  it('needs at least one workplace', () => expect(cellCommutes(cells(), [], {})['0'].all).toBeNull());
  it('intersects real polygons for a distinct common map overlay', () => {
    const a = route('a', box(0, 3)), b = route('b', box(2, 4));
    expect(commonReachableGeometry([a, b], 2)).not.toBeNull();
    expect(commonReachableGeometry([a], 2)).toBeNull();
  });
});
