import { num } from '../../lib/format';
import type { AreaCellProps, PreferenceLevel } from '../../types';

export interface PreferenceDef {
  id: string;
  label: string;
  value: (cell: AreaCellProps) => number | null;
  higherIsBetter: boolean;
  mustHave: { describe: string; threshold: number; passes: (v: number) => boolean };
  format: (v: number | null) => string;
  source: string;
  resolution: string;
  band: { nice: number; important: number };
  nearTolerance: number;
}

const metres = (v: number | null) => v == null ? 'Unavailable' : `${num(v)} m straight line`;
const distance = (id: string, label: string, key: keyof AreaCellProps, threshold: number, source: string): PreferenceDef => ({
  id, label, value: (p) => p[key] as number | null, higherIsBetter: false,
  mustHave: { describe: `within ${threshold} m straight line`, threshold, passes: (v) => v <= threshold },
  format: metres, source, resolution: 'distance from this cell’s representative location',
  band: { nice: 400, important: 200 }, nearTolerance: 100,
});

export const PREFERENCES: PreferenceDef[] = [
  {
    id: 'flat', label: 'Flatter streets', value: (p) => p.street_grade_pct, higherIsBetter: false,
    mustHave: { describe: 'median DEM-derived street grade under 8%', threshold: 8, passes: (v) => v < 8 },
    format: (v) => v == null ? 'Unavailable' : `${num(v, 1)}% median street grade`,
    source: 'USGS 3DEP + official SF / San Mateo County streets; DEM estimate, not surveyed', resolution: '40 m street windows aggregated within this H3-9 cell',
    band: { nice: 4, important: 2 }, nearTolerance: 2,
  },
  distance('frequent', 'Frequent buses & trains', 'frequent_distance_m', 400, 'GTFS stops with ≥120 weekday departures; Muni timetable out of date'),
  distance('parks', 'Parks nearby', 'park_distance_m', 400, 'SF Rec & Park + San Mateo County + OpenStreetMap polygons; entrance access unverified'),
  distance('rail', 'Rail station nearby', 'rail_distance_m', 800, 'BART, Muni and Caltrain station locations'),
  distance('groceries', 'Supermarket within walking distance', 'grocery_distance_m', 800, 'OpenStreetMap supermarkets; completeness unverified'),
  distance('cycling', 'Bike lanes', 'cycling_distance_m', 250, 'SFMTA + San Mateo County existing protected, painted lanes and off-street paths; proposed lanes omitted'),
  {
    id: 'lowCrime', label: 'Fewer reported incidents', value: (p) => p.incidents_per_km2, higherIsBetter: false,
    mustHave: { describe: 'fewer than 300 reported incidents per km² a year', threshold: 300, passes: (v) => v < 300 },
    format: (v) => v == null ? 'Unavailable' : `${num(v)} per km²/yr (H3-8)`,
    source: 'SFPD reports; anonymised and aggregated, not a safety measure', resolution: 'shared H3 resolution 8 (~0.74 km²), not this individual cell',
    band: { nice: 300, important: 150 }, nearTolerance: 60,
  },
];

export const DEFAULT_PRIORITY = PREFERENCES.map((p) => p.id);
export function orderedPreferences(order: string[] = []): PreferenceDef[] {
  return [...new Set([...order, ...DEFAULT_PRIORITY])].flatMap((id) => {
    const p = PREFERENCES.find((d) => d.id === id); return p ? [p] : [];
  });
}

export function measurementBand(def: PreferenceDef, value: number | null, level: PreferenceLevel): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const width = level === 'nice' ? def.band.nice : def.band.important;
  return (def.higherIsBetter ? 1 : -1) * Math.floor(value / width);
}
