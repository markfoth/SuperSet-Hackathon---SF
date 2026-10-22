// Preference definitions. Each reads ONE measured value from neighbourhood_metrics.json.
// `value` returns null when the data is missing; null is never a pass or a fail.
import { num, pct } from '../../lib/format';
import type { NeighbourhoodMetrics } from '../../types';

export interface PreferenceDef {
  id: string;
  label: string;
  /** Measured value, or null if not measured for this neighbourhood. */
  value: (m: NeighbourhoodMetrics) => number | null;
  higherIsBetter: boolean;
  /** Must-have threshold, in the value's own units. */
  mustHave: { describe: string; passes: (v: number) => boolean };
  format: (v: number | null) => string;
  source: string;
}

export const PREFERENCES: PreferenceDef[] = [
  {
    id: 'lowCrime',
    label: 'Fewer reported incidents',
    value: (m) => m.crime?.per_km2 ?? null,
    higherIsBetter: false,
    mustHave: { describe: 'fewer than 300 reported incidents per km² a year', passes: (v) => v < 300 },
    format: (v) => (v == null ? 'No data' : `${num(v)} per km²/yr`),
    source: 'SFPD incident reports, last 12 months',
  },
  {
    id: 'parks',
    label: 'Parks nearby',
    value: (m) => m.parks?.share_within_400m ?? null,
    higherIsBetter: true,
    mustHave: { describe: '90%+ of the area within 400 m of a park', passes: (v) => v >= 0.9 },
    format: (v) => (v == null ? 'No data' : `${pct(v)} within 400 m`),
    source: 'SF Rec & Park + OpenStreetMap',
  },
  {
    id: 'flat',
    label: 'Flatter streets',
    value: (m) => m.hills?.median_slope_pct ?? null,
    higherIsBetter: false,
    mustHave: { describe: 'median terrain slope under 8%', passes: (v) => v < 8 },
    format: (v) => (v == null ? 'No data' : `${num(v, 1)}% median slope`),
    source: 'USGS 3DEP elevation',
  },
  {
    id: 'rail',
    label: 'Rail station nearby',
    value: (m) => m.transit?.share_within_800m_rail ?? null,
    higherIsBetter: true,
    mustHave: { describe: 'half the area within 800 m of BART, Caltrain or Muni Metro', passes: (v) => v >= 0.5 },
    format: (v) => (v == null ? 'No data' : `${pct(v)} within 800 m`),
    source: 'BART, Muni, Caltrain GTFS',
  },
  {
    id: 'frequent',
    label: 'Frequent buses & trains',
    value: (m) => m.transit?.share_within_400m_frequent ?? null,
    higherIsBetter: true,
    mustHave: { describe: '75%+ of the area within 400 m of a frequent stop', passes: (v) => v >= 0.75 },
    format: (v) => (v == null ? 'No data' : `${pct(v)} within 400 m`),
    source: 'GTFS weekday departures (>=120/day)',
  },
  {
    id: 'cycling',
    label: 'Bike lanes',
    value: (m) => m.cycling?.dedicated_km_per_km2 ?? null,
    higherIsBetter: true,
    mustHave: { describe: 'at least 3 km of bike lanes or paths per km²', passes: (v) => v >= 3 },
    format: (v) => (v == null ? 'No data' : `${num(v, 1)} km per km²`),
    source: 'SFMTA bike network',
  },
  {
    id: 'groceries',
    label: 'Supermarket within walking distance',
    value: (m) => m.groceries?.share_within_800m_supermarket ?? null,
    higherIsBetter: true,
    mustHave: { describe: '80%+ of the area within 800 m of a supermarket', passes: (v) => v >= 0.8 },
    format: (v) => (v == null ? 'No data' : `${pct(v)} within 800 m`),
    source: 'OpenStreetMap',
  },
];

export const LEVEL_WEIGHT = { off: 0, nice: 1, important: 3, must: 3 } as const;
