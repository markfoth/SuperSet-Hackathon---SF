// Order-independent filtering and ranking.
//
//   1. Commute is the primary hard constraint (coverage >= ELIGIBLE_SHARE for every workplace).
//   2. Must-haves are hard constraints too, but each is tested independently against the
//      full set, so the result never depends on the order constraints were added. Every
//      failed constraint is reported, not just the first.
//   3. Nice-to-have / important preferences only change the ranking.
//   4. Missing data is neither a pass nor a fail: a must-have that cannot be checked keeps
//      the area and flags it; a soft preference with no data is left out of that area's score.
import { ELIGIBLE_SHARE, type CommuteCoverage } from '../commute/eligibility';
import { LEVEL_WEIGHT, PREFERENCES, type PreferenceDef } from './preferences';
import type { NeighbourhoodContent, NeighbourhoodMetrics, PreferenceLevel } from '../../types';

export type ExclusionReason =
  | { kind: 'commute'; workplaceId: string; coverage: number }
  | { kind: 'mustHave'; prefId: string; value: number }
  | { kind: 'nonResidential' };

export interface AreaResult {
  id: string;
  name: string;
  eligible: boolean;
  reasons: ExclusionReason[];
  /** Weighted mean of 0..1 preference scores; null if no active preference could be assessed. */
  score: number | null;
  assessed: number;
  active: number;
  /** Must-haves that could not be checked because the data is missing. */
  unchecked: string[];
  commute: CommuteCoverage | null;
}

export interface EvaluateInput {
  metrics: Record<string, NeighbourhoodMetrics>;
  content: Record<string, NeighbourhoodContent>;
  /** null = no workplace set, so no commute gate. */
  coverage: Record<string, CommuteCoverage> | null;
  prefs: Record<string, PreferenceLevel>;
  defs?: PreferenceDef[];
}

/** Rank each area's value among all areas with data: 1 = best, 0 = worst. */
function relativeScores(metrics: Record<string, NeighbourhoodMetrics>, def: PreferenceDef): Record<string, number | null> {
  const entries = Object.entries(metrics).map(([id, m]) => [id, def.value(m)] as const);
  const present = entries.filter(([, v]) => v != null) as [string, number][];
  const sorted = present.map(([, v]) => v).sort((a, b) => a - b);
  const out: Record<string, number | null> = {};
  for (const [id, v] of entries) {
    if (v == null || sorted.length < 2) {
      out[id] = v == null ? null : 0.5;
      continue;
    }
    // Mid-rank for ties keeps equal values equal.
    const lo = sorted.indexOf(v);
    const hi = sorted.lastIndexOf(v);
    const rank = (lo + hi) / 2 / (sorted.length - 1);
    out[id] = def.higherIsBetter ? rank : 1 - rank;
  }
  return out;
}

export function evaluate({ metrics, content, coverage, prefs, defs = PREFERENCES }: EvaluateInput): AreaResult[] {
  const active = defs.filter((d) => (prefs[d.id] ?? 'off') !== 'off');
  const scores = Object.fromEntries(active.map((d) => [d.id, relativeScores(metrics, d)]));

  return Object.entries(metrics).map(([id, m]) => {
    const reasons: ExclusionReason[] = [];
    const unchecked: string[] = [];
    if (content[id] && content[id].residential === false) reasons.push({ kind: 'nonResidential' });
    const cov = coverage?.[id] ?? null;
    if (cov) {
      for (const [wid, share] of Object.entries(cov.byWorkplace)) {
        if (share < ELIGIBLE_SHARE) reasons.push({ kind: 'commute', workplaceId: wid, coverage: share });
      }
    }
    let wsum = 0;
    let total = 0;
    let assessed = 0;
    for (const d of active) {
      const level = prefs[d.id];
      const v = d.value(m);
      if (level === 'must') {
        if (v == null) unchecked.push(d.id);
        else if (!d.mustHave.passes(v)) reasons.push({ kind: 'mustHave', prefId: d.id, value: v });
      }
      const s = scores[d.id][id];
      if (s != null) {
        wsum += LEVEL_WEIGHT[level];
        total += LEVEL_WEIGHT[level] * s;
        assessed += 1;
      }
    }
    return {
      id, name: m.name, eligible: reasons.length === 0, reasons,
      score: assessed ? total / wsum : null, assessed, active: active.length, unchecked, commute: cov,
    };
  });
}

/** Eligible areas, best first. Ties (and "no preferences set") fall back to commute coverage, then name. */
export function ranked(results: AreaResult[]): AreaResult[] {
  return results
    .filter((r) => r.eligible)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.commute?.all ?? 0) - (a.commute?.all ?? 0) || a.name.localeCompare(b.name));
}

/**
 * Exclusion preview: how many CURRENTLY eligible areas would making `prefId` a must-have remove?
 * Computed against the current state, independent of the order other constraints were added.
 */
export function previewMustHave(input: EvaluateInput, prefId: string): { excluded: number; eligibleNow: number; unchecked: number } {
  const now = evaluate(input).filter((r) => r.eligible);
  const next = evaluate({ ...input, prefs: { ...input.prefs, [prefId]: 'must' } });
  const nextById = new Map(next.map((r) => [r.id, r]));
  const excluded = now.filter((r) => !nextById.get(r.id)!.eligible).length;
  const unchecked = now.filter((r) => nextById.get(r.id)!.unchecked.includes(prefId)).length;
  return { excluded, eligibleNow: now.length, unchecked };
}
