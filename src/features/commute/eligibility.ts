// Which neighbourhoods are reachable? Each neighbourhood carries H3 res-9 sample
// points (neighbourhood_samples.json); a point counts only if it lies inside
// EVERY workplace's commute area. The share of points that pass is the
// neighbourhood's commute coverage.
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { CommuteArea } from './provider';
import type { CommuteResult } from './provider';
import type { AreaCellCollection, AreaGeometry, Workplace } from '../../types';
import intersect from '@turf/intersect';
import { feature, featureCollection } from '@turf/helpers';

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

export interface CellCommute {
  all: boolean | null;
  byWorkplace: Record<string, boolean | null>;
}

/** A missing, failed or pending REQUIRED route can never disappear from the gate. */
export function cellCommutes(cells: AreaCellCollection, workplaces: Workplace[], results: Record<string, CommuteResult | undefined>): Record<string, CellCommute> {
  const out: Record<string, CellCommute> = {};
  for (const { properties: p } of cells.features) {
    const home = point([p.check_lon, p.check_lat]);
    const byWorkplace = Object.fromEntries(workplaces.map((w) => {
      const r = results[w.id];
      let inside: boolean | null = null;
      if (r?.ok) {
        try { inside = booleanPointInPolygon(home, r.area.geometry); } catch { /* malformed routes remain unknown */ }
      }
      return [w.id, inside];
    }));
    const values = Object.values(byWorkplace);
    // Unknown takes precedence until every required route has been computed.
    const all = !values.length || values.some((v) => v == null) ? null : values.every(Boolean);
    out[p.h3] = { all, byWorkplace };
  }
  return out;
}

/** Exact polygon intersection for display; cells underneath use representative-point checks. */
export function commonReachableGeometry(areas: CommuteArea[], requiredCount: number): AreaGeometry | null {
  if (!requiredCount || areas.length !== requiredCount) return null;
  let shared: AreaGeometry | null = areas[0].geometry;
  try {
    for (const area of areas.slice(1)) {
      const overlap: ReturnType<typeof intersect> = intersect(featureCollection([feature(shared), feature(area.geometry)]));
      if (!overlap) return null;
      shared = overlap.geometry;
    }
    return shared;
  } catch { return null; }
}
