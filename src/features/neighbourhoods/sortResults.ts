import type { NeighbourhoodMetrics } from '../../types';
import type { AreaResult } from '../filters/ranking';

export const RESULT_SORTS = ['recommended', 'rent-asc', 'rent-desc'] as const;
export type ResultSort = typeof RESULT_SORTS[number];

/** Rent changes display order only. Missing prices stay last in both directions. */
export function sortResults(ranked: AreaResult[], metrics: Record<string, NeighbourhoodMetrics>, sort: ResultSort): AreaResult[] {
  if (sort === 'recommended') return ranked;
  const rent = (r: AreaResult) => {
    const value = metrics[r.id]?.rents?.typical_rent_zip_weighted;
    return value != null && Number.isFinite(value) ? value : null;
  };
  return [...ranked].sort((a, b) => {
    const left = rent(a), right = rent(b);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return (sort === 'rent-asc' ? 1 : -1) * (left - right);
  });
}
