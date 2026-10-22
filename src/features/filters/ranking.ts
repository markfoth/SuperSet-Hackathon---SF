// Pure cell feasibility and lexicographic measurement bands. No combined score.
import type { CellCommute, CommuteCoverage } from '../commute/eligibility';
import { orderedPreferences, measurementBand, PREFERENCES } from './preferences';
import type { AreaCellCollection, AreaCellProps, NeighbourhoodMetrics, PreferenceLevel } from '../../types';

export type MatchState = 'strong' | 'partial' | 'excluded' | 'unknown';
export type ExclusionReason =
  | { kind: 'commute'; workplaceId: string; coverage: number }
  | { kind: 'mustHave'; prefId: string; value: number }
  | { kind: 'nonResidential' }
  | { kind: 'noOverlap' };
export interface Criterion {
  prefId: string; level: PreferenceLevel; value: number | null; band: number | null;
  passes: boolean | null; comparison: 'above' | 'below' | 'similar' | null;
}
export interface CellResult {
  id: string; name: string; nhoodId: string; cell: AreaCellProps;
  eligible: boolean; state: MatchState; reasons: ExclusionReason[];
  unchecked: string[]; warnings: string[]; criteria: Criterion[];
  priorityVector: (number | null)[]; commute: CellCommute; active: number; assessed: number;
}
export interface AreaResult {
  id: string; name: string; eligible: boolean; state: MatchState; reasons: ExclusionReason[];
  unchecked: string[]; active: number; assessed: number; priorityVector: (number | null)[];
  commute: CommuteCoverage | null; cellCount: number; candidateCount: number;
  eligibleCount: number; unknownCount: number; eligibleShare: number; bestCellId: string | null;
}
export interface EvaluateInput {
  cells: AreaCellCollection; metrics: Record<string, NeighbourhoodMetrics>;
  commutes: Record<string, CellCommute>; prefs: Record<string, PreferenceLevel>; priorityOrder: string[];
}

export function evaluate(input: EvaluateInput): CellResult[] {
  const active = orderedPreferences(input.priorityOrder).filter((d) => (input.prefs[d.id] ?? 'off') !== 'off');
  const results = input.cells.features.map(({ properties: cell }): CellResult => {
    const reasons: ExclusionReason[] = [], unchecked: string[] = [], warnings: string[] = [];
    if (cell.residential === false) reasons.push({ kind: 'nonResidential' });
    if (cell.residential == null) warnings.push('Residential use uncertain; verify local streets and homes');
    const commute = input.commutes[cell.h3] ?? { all: null, byWorkplace: {} };
    for (const [workplaceId, inside] of Object.entries(commute.byWorkplace)) {
      if (inside === false) reasons.push({ kind: 'commute', workplaceId, coverage: 0 });
    }
    if (commute.all == null) unchecked.push('commute');
    const criteria: Criterion[] = active.map((d) => {
      const level = input.prefs[d.id], measured = d.value(cell);
      const value = measured != null && Number.isFinite(measured) ? measured : null;
      const passes = value == null ? null : d.mustHave.passes(value);
      if (level === 'must') {
        if (value == null) unchecked.push(d.id);
        else if (!passes) reasons.push({ kind: 'mustHave', prefId: d.id, value });
      }
      if (value == null && level !== 'must') warnings.push(`${d.label}: measurement unavailable`);
      return { prefId: d.id, level, value, passes, band: measurementBand(d, value, level), comparison: null };
    });
    const assessed = criteria.filter((c) => c.value != null).length;
    const state: MatchState = reasons.length ? 'excluded' : unchecked.length
      ? 'unknown' : criteria.some((c) => c.passes !== true) ? 'partial' : 'strong';
    return {
      id: cell.h3, name: input.metrics[cell.nhood_id]?.name ?? cell.nhood_id, nhoodId: cell.nhood_id, cell,
      eligible: state === 'strong' || state === 'partial', state, reasons, unchecked, warnings, criteria,
      priorityVector: criteria.map((c) => c.band), commute, active: active.length, assessed,
    };
  });
  for (const d of active) {
    const values = results.filter((r) => r.eligible).flatMap((r) => {
      const c = r.criteria.find((x) => x.prefId === d.id); return c?.value == null ? [] : [c.value];
    }).sort((a, b) => a - b);
    if (!values.length) continue;
    for (const r of results) {
      const c = r.criteria.find((x) => x.prefId === d.id)!;
      if (c.value != null) {
        const reference = measurementBand(d, values[Math.floor(values.length / 2)], c.level)!;
        c.comparison = c.band! > reference ? 'above' : c.band! < reference ? 'below' : 'similar';
      }
    }
  }
  return results;
}

export function comparePriority(a: { priorityVector: (number | null)[] }, b: { priorityVector: (number | null)[] }): number {
  for (let i = 0; i < Math.max(a.priorityVector.length, b.priorityVector.length); i++) {
    const av = a.priorityVector[i] ?? null, bv = b.priorityVector[i] ?? null;
    // Missing is a distinct evidence category, never zero or a failed measurement.
    if (av == null && bv != null) return 1;
    if (bv == null && av != null) return -1;
    if (av != null && bv != null && av !== bv) return bv - av;
  }
  return 0;
}
export function ranked<T extends { id: string; name: string; eligible: boolean; priorityVector: (number | null)[]; eligibleShare?: number }>(results: T[]): T[] {
  return results.filter((r) => r.eligible).sort((a, b) => comparePriority(a, b) || (b.eligibleShare ?? 0) - (a.eligibleShare ?? 0) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function summarize(input: EvaluateInput, cells: CellResult[]): AreaResult[] {
  return Object.entries(input.metrics).map(([id, m]) => {
    const all = cells.filter((r) => r.nhoodId === id), candidates = all.filter((r) => r.cell.residential !== false);
    const eligible = ranked(candidates), best = eligible[0];
    const area = candidates.reduce((s, r) => s + r.cell.area_m2, 0);
    const passingArea = eligible.reduce((s, r) => s + r.cell.area_m2, 0);
    const workplaceIds = [...new Set(candidates.flatMap((r) => Object.keys(r.commute.byWorkplace)))];
    const routesKnown = candidates.length > 0 && candidates.every((r) => r.commute.all != null);
    const commute = routesKnown ? {
      all: candidates.filter((r) => r.commute.all === true).reduce((s, r) => s + r.cell.area_m2, 0) / (area || 1),
      byWorkplace: Object.fromEntries(workplaceIds.map((wid) => [wid, candidates.filter((r) => r.commute.byWorkplace[wid] === true).reduce((s, r) => s + r.cell.area_m2, 0) / (area || 1)])),
    } : null;
    const reasons: ExclusionReason[] = best ? [] : !candidates.length ? [{ kind: 'nonResidential' }]
      : commute?.all === 0 ? [{ kind: 'noOverlap' }] : candidates.flatMap((r) => r.reasons).filter((r, i, rs) => rs.findIndex((x) =>
        x.kind === r.kind && (x.kind !== 'mustHave' || r.kind !== 'mustHave' || x.prefId === r.prefId)
        && (x.kind !== 'commute' || r.kind !== 'commute' || x.workplaceId === r.workplaceId)) === i);
    return {
      id, name: m.name, eligible: eligible.length > 0, state: best?.state ?? (candidates.some((r) => r.state === 'unknown') ? 'unknown' : 'excluded'),
      reasons, unchecked: best?.unchecked ?? [...new Set(candidates.flatMap((r) => r.unchecked))],
      active: best?.active ?? all[0]?.active ?? 0, assessed: best?.assessed ?? 0,
      priorityVector: best?.priorityVector ?? [], commute, cellCount: all.length, candidateCount: candidates.length,
      eligibleCount: eligible.length, unknownCount: candidates.filter((r) => r.state === 'unknown').length,
      eligibleShare: area ? passingArea / area : 0, bestCellId: best?.id ?? null,
    };
  });
}

export function previewMustHave(input: EvaluateInput, prefId: string) {
  const now = evaluate(input).filter((r) => r.eligible);
  const next = evaluate({ ...input, prefs: { ...input.prefs, [prefId]: 'must' } });
  const byId = new Map(next.map((r) => [r.id, r]));
  return {
    eligibleNow: now.length,
    excluded: now.filter((r) => byId.get(r.id)!.reasons.some((x) => x.kind === 'mustHave' && x.prefId === prefId)).length,
    unchecked: now.filter((r) => byId.get(r.id)!.unchecked.includes(prefId)).length,
    neighbourhoodsLost: new Set(now.map((r) => r.nhoodId)).size - new Set(next.filter((r) => r.eligible).map((r) => r.nhoodId)).size,
  };
}

export function nearMisses(results: CellResult[]) {
  return results.flatMap((r) => {
    if (r.reasons.length !== 1 || r.reasons[0].kind !== 'mustHave' || r.unchecked.length || r.commute.all !== true) return [];
    const reason = r.reasons[0], def = PREFERENCES.find((d) => d.id === reason.prefId)!;
    const gap = Math.abs(reason.value - def.mustHave.threshold);
    return gap <= def.nearTolerance ? [{ result: r, pref: def, value: reason.value, gap, threshold: def.mustHave.threshold }] : [];
  }).sort((a, b) => a.gap / a.pref.nearTolerance - b.gap / b.pref.nearTolerance || a.result.id.localeCompare(b.result.id));
}
