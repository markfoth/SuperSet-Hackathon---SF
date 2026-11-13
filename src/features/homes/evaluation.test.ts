import { describe, expect, it } from 'vitest';
import { evaluateHome, homeMonthlyCost } from './evaluation';
import { createHome } from '../scenarios/model';
import type { AreaCellCollection, AreaGeometry, NeighbourhoodMetrics, Workplace } from '../../types';
import type { CommuteResult } from '../commute/provider';
import fixture from '../../test/areaCells.fixture.json';

const box = (west: number, east: number): AreaGeometry => ({ type: 'Polygon', coordinates: [[[west, 0], [east, 0], [east, 2], [west, 2], [west, 0]]] });
const workplaces: Workplace[] = [{ id: 'a', name: 'Alex', lat: 1, lon: 1, mode: 'transit', maxMinutes: 30, officeDays: 3 }, { id: 'b', name: 'Sam', lat: 1, lon: 1, mode: 'transit', maxMinutes: 30, officeDays: 2 }];
const route = (id: string, west = 0, east = 2): CommuteResult => ({ ok: true, area: { workplaceId: id, mode: 'transit', minutes: 30, geometry: box(west, east), label: 'Test measured contour', source: 'test', synthetic: false } });
const metrics = { place: { name: 'A neighbourhood' } as NeighbourhoodMetrics };
const cells = (): AreaCellCollection => {
  const data = structuredClone(fixture) as AreaCellCollection; data.features = data.features.slice(0, 1);
  data.features[0].geometry = box(0, 4);
  Object.assign(data.features[0].properties, { h3: 'cell', nhood_id: 'place', residential: true, check_lat: 1, check_lon: 3, park_distance_m: 300 });
  return data;
};

describe('specific-home evidence', () => {
  it('checks the real home coordinate rather than the cell representative location', () => {
    const data = cells();
    const inside = evaluateHome({ lat: 1, lon: 1 }, workplaces, { a: route('a'), b: route('b') }, data, metrics, {}, []);
    const outside = evaluateHome({ lat: 1, lon: 3 }, workplaces, { a: route('a'), b: route('b') }, data, metrics, {}, []);
    expect(inside.eligible).toBe(true); expect(inside.commute.byWorkplace).toEqual({ a: true, b: true });
    expect(outside.state).toBe('excluded'); expect(outside.reasons).toHaveLength(2);
    expect(inside.cell?.check_lon).toBe(3);
    expect(inside.warnings.some((warning) => warning.includes('inherited'))).toBe(true);
  });
  it.each([undefined, { ok: false, reason: 'Request failed' } as CommuteResult])('never ignores a failed or pending required route', (missing) => {
    const result = evaluateHome({ lat: 1, lon: 1 }, workplaces, { a: route('a'), b: missing }, cells(), metrics, {}, []);
    expect(result.state).toBe('unknown'); expect(result.eligible).toBe(false); expect(result.commute.byWorkplace.b).toBeNull();
  });
  it('keeps missing Peninsula must-have measurements unknown', () => {
    const data = cells(); data.features[0].properties.incidents_per_km2 = null;
    const result = evaluateHome({ lat: 1, lon: 1 }, workplaces, { a: route('a'), b: route('b') }, data, metrics, { lowCrime: 'must' }, []);
    expect(result.state).toBe('unknown'); expect(result.reasons).toEqual([]); expect(result.unchecked[0]).toContain('unavailable');
  });
  it('does not turn unmeasured locations or missing destinations into confirmed matches', () => {
    expect(evaluateHome({ lat: 1, lon: 5 }, workplaces, { a: route('a', 0, 6), b: route('b', 0, 6) }, cells(), metrics, {}, []).eligible).toBe(false);
    expect(evaluateHome({ lat: 1, lon: 1 }, [], {}, cells(), metrics, {}, []).state).toBe('unknown');
  });
});

describe('transparent monthly costs', () => {
  it('uses entered rent, return fare and the entered office-day totals', () => {
    const home = { ...createHome(37.75, -122.41), rent: 3000, transportReturnFare: 6, monthlyTransportOther: 20 };
    const cost = homeMonthlyCost(home, workplaces);
    expect(cost.officeDaysPerWeek).toBe(5); expect(cost.monthlyTransport).toBeCloseTo(150); expect(cost.monthlyTotal).toBeCloseTo(3150);
    expect(cost.assumptions.join(' ')).toContain('double-counted');
  });
  it('keeps missing fare or rent unknown, rather than treating it as zero', () => {
    const home = createHome(37.75, -122.41);
    expect(homeMonthlyCost(home, workplaces).monthlyTransport).toBeNull();
    expect(homeMonthlyCost({ ...home, transportReturnFare: 0 }, workplaces).monthlyTotal).toBeNull();
  });
  it('zero office days need no per-trip fare but retain entered fixed costs', () => {
    const home = { ...createHome(37.75, -122.41), rent: 3000, monthlyTransportOther: 100 };
    expect(homeMonthlyCost(home, workplaces.map((w) => ({ ...w, officeDays: 0 }))).monthlyTotal).toBe(3100);
  });
  it('only includes other recurring costs when explicitly entered, including zero', () => {
    const home = { ...createHome(37.75, -122.41), rent: 3000, transportReturnFare: 6 };
    expect(homeMonthlyCost(home, workplaces).monthlyBudgetTotal).toBeNull();
    expect(homeMonthlyCost({ ...home, monthlyRecurringOther: 200 }, workplaces).monthlyBudgetTotal).toBe(3330);
    expect(homeMonthlyCost({ ...home, monthlyRecurringOther: 0 }, workplaces).monthlyBudgetTotal).toBe(3130);
  });
});
