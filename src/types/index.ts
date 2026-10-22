import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';

export type TravelMode = 'transit' | 'walk' | 'bike' | 'drive';
export const TRAVEL_MODES: { id: TravelMode; label: string }[] = [
  { id: 'transit', label: 'Public transport' },
  { id: 'walk', label: 'Walk' },
  { id: 'bike', label: 'Cycle' },
  { id: 'drive', label: 'Drive' },
];
export const COMMUTE_MINUTES = [15, 30, 45, 60] as const;

export interface Workplace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  mode: TravelMode;
  maxMinutes: number;
}

export type PreferenceLevel = 'off' | 'nice' | 'important' | 'must';

/** One neighbourhood's row in neighbourhood_metrics.json. A null block = not measured. */
export interface NeighbourhoodMetrics {
  name: string;
  region?: 'sf' | 'peninsula';
  boundary_kind?: string;
  area_km2: number;
  crime: {
    total: number;
    per_km2: number;
    violent: number;
    property: number;
    vehicle_breakin: number;
    violent_per_km2: number;
    property_per_km2: number;
    per_km2_pctile: number;
    top_categories: Record<string, number>;
    per_1000_residents: number | null;
  } | null;
  parks: { share_within_400m: number | null; park_land_share: number } | null;
  cycling: { km: Record<string, number>; dedicated_km_per_km2: number; protected_km: number } | null;
  transit: {
    share_within_800m_rail: number | null;
    share_within_400m_frequent: number | null;
    rail_stations: string[];
    stops: number;
  } | null;
  hills: { median_slope_pct: number; share_steep: number; elev_min_m: number; elev_max_m: number } | null;
  groceries: { share_within_800m_supermarket: number | null } | null;
  collisions: {
    injury_crashes: number;
    pedestrian: number;
    cyclist: number;
    killed_or_severe: number;
    per_km2_per_year: number;
  } | null;
  rents: { zips: { zip: string; share: number; latest: number | null }[]; typical_rent_zip_weighted: number | null } | null;
  population: { population: number | null; median_gross_rent_popweighted: number | null } | null;
  environment: {
    pm_pctl: number | null;
    diesel_pctl: number | null;
    traffic_pctl: number | null;
    ozone_pctl: number | null;
    pollution_burden_pctl: number | null;
  } | null;
  food_drink: { cafes: number; restaurants: number; bars: number; per_km2: number } | null;
}

export interface Photo {
  url: string;
  local?: string;
  page: string;
  credit: string;
  licence: string;
  licence_url: string | null;
  title: string;
}

export interface NeighbourhoodContent {
  name: string;
  description: string | null;
  tags: string[];
  residential: boolean;
  photos: Photo[];
}

export interface ZipRent {
  city: string;
  latest_month: string;
  latest: number;
  yoy_pct: number | null;
  series: Record<string, number>;
}

export interface NeighbourhoodProps {
  id: string;
  name: string;
  region?: 'sf' | 'peninsula';
  boundary_kind?: string;
  area_km2: number;
  label_lat: number;
  label_lon: number;
}

export type NeighbourhoodCollection = FeatureCollection<Polygon | MultiPolygon, NeighbourhoodProps>;
export type AreaGeometry = Polygon | MultiPolygon;
export interface AreaCellProps {
  h3: string;
  nhood_id: string;
  area_m2: number;
  land_share: number;
  center_lat: number;
  center_lon: number;
  check_lat: number;
  check_lon: number;
  residential: boolean | null;
  residential_reason: string;
  street_m: number | null;
  measured_street_m: number | null;
  grade_coverage: number | null;
  street_grade_pct: number | null;
  street_grade_p90_pct: number | null;
  steep_street_share: number | null;
  park_land_share: number | null;
  park_distance_m: number | null;
  rail_distance_m: number | null;
  frequent_distance_m: number | null;
  cycling_distance_m: number | null;
  grocery_distance_m: number | null;
  crime_source_h3: string;
  incidents_per_km2: number | null;
  tract_id: string | null;
  pm25_percentile: number | null;
  rent_zip: string | null;
  zip_asking_rent: number | null;
}
export type AreaCellCollection = FeatureCollection<AreaGeometry, AreaCellProps>;
export type CommuteFixtureFeature = Feature<AreaGeometry, {
  workplace: string;
  mode: TravelMode;
  minutes: number;
  method: string;
  label: string;
  synthetic: boolean;
}>;
