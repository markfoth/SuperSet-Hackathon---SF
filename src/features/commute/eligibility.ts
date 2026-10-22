// Which neighbourhoods are reachable? Each neighbourhood carries H3 res-9 sample
// points (neighbourhood_samples.json); a point counts only if it lies inside
// EVERY workplace's commute area. The share of points that pass is the
// neighbourhood's commute coverage.
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { CommuteArea } from './provider';

/** A neighbourhood is commute-eligible when at least this share of it is within every commute. */
export const ELIGIBLE_SHARE = 0.5;

export interface CommuteCoverage {
  /** Share of sample points inside all commute areas (0..1). */
  all: number;
  /** Share per workplace id. */
  byWorkplace: Record<string, number>;
}

export function commuteCoverage(
  samples: Record<string, [number, number][]>,
  areas: CommuteArea[],
): Record<string, CommuteCoverage> {
  const out: Record<string, CommuteCoverage> = {};
  for (const [id, pts] of Object.entries(samples)) {
    const inside = areas.map((a) => pts.map(([lat, lon]) => booleanPointInPolygon(point([lon, lat]), a.geometry)));
    const n = pts.length || 1;
    const byWorkplace: Record<string, number> = {};
    areas.forEach((a, i) => {
      byWorkplace[a.workplaceId] = inside[i].filter(Boolean).length / n;
    });
    const all = pts.filter((_, j) => inside.every((row) => row[j])).length / n;
    out[id] = { all, byWorkplace };
  }
  return out;
}
