// Commute-area adapter. The app only ever asks a CommuteProvider for "the area
// from which someone can reach this workplace within N minutes" (home -> work,
// inbound). Fixtures answer offline; a live provider sits behind a server-side
// proxy so API keys never reach the browser.
import type { FeatureCollection } from 'geojson';
import { loadData } from '../../lib/data';
import type { AreaGeometry, CommuteFixtureFeature, TravelMode, Workplace } from '../../types';

export interface CommuteArea {
  workplaceId: string;
  mode: TravelMode;
  minutes: number;
  geometry: AreaGeometry;
  label: string; // shown to the user verbatim, e.g. "Synthetic (straight-line speed model)"
  synthetic: boolean;
  source: string;
}

export type CommuteResult = { ok: true; area: CommuteArea } | { ok: false; reason: string };

/** Reject empty, nonfinite or malformed provider polygons before Leaflet sees them. */
export function isAreaGeometry(value: unknown): value is AreaGeometry {
  if (!value || typeof value !== 'object') return false;
  const g = value as { type?: string; coordinates?: unknown };
  if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return false;
  const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) return false;
  return polygons.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every((ring) =>
    Array.isArray(ring) && ring.length >= 4 && ring.every((xy) => Array.isArray(xy) && xy.length >= 2
      && Number.isFinite(xy[0]) && Number.isFinite(xy[1]) && Math.abs(xy[0]) <= 180 && Math.abs(xy[1]) <= 90)
    && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]));
}

export interface CommuteProvider {
  id: string;
  getArea(workplace: Workplace): Promise<CommuteResult>;
}

// Default workplaces have precomputed fixtures (scripts/build_commute_fixtures.py).
export const DEFAULT_WORKPLACES: Workplace[] = [
  { id: 'sfo', name: 'SFO Airport', lat: 37.6213, lon: -122.379, mode: 'transit', maxMinutes: 60 },
  { id: 'fidi', name: 'Financial District', lat: 37.7946, lon: -122.3999, mode: 'transit', maxMinutes: 45 },
];

function fixtureKey(wp: Workplace): string | null {
  // A workplace matches a fixture only if it is still at the default location (±50 m).
  const def = DEFAULT_WORKPLACES.find(
    (d) => Math.abs(d.lat - wp.lat) < 0.00045 && Math.abs(d.lon - wp.lon) < 0.0006,
  );
  return def ? def.id : null;
}

export const fixtureProvider: CommuteProvider = {
  id: 'fixture',
  async getArea(wp) {
    const key = fixtureKey(wp);
    if (!key) {
      return { ok: false, reason: 'No offline commute data for this location (offline data covers the two demo workplaces).' };
    }
    const fc = await loadData<FeatureCollection>('commute_fixtures.geojson');
    const f = (fc.features as CommuteFixtureFeature[]).find(
      (x) => x.properties.workplace === key && x.properties.mode === wp.mode && x.properties.minutes === wp.maxMinutes,
    );
    if (!f) return { ok: false, reason: `No fixture for ${wp.mode} within ${wp.maxMinutes} min.` };
    if (!isAreaGeometry(f.geometry)) return { ok: false, reason: 'Offline commute geometry is invalid.' };
    return {
      ok: true,
      area: {
        workplaceId: wp.id,
        mode: wp.mode,
        minutes: wp.maxMinutes,
        geometry: f.geometry,
        label: f.properties.label,
        synthetic: f.properties.synthetic,
        source: 'fixture',
      },
    };
  },
};

/** Live routing through server/routing-proxy.mjs (TravelTime; keys stay server-side). */
export function proxyProvider(baseUrl: string): CommuteProvider {
  return {
    id: 'proxy',
    async getArea(wp) {
      try {
        const r = await fetch(`${baseUrl.replace(/\/$/, '')}/isochrone`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: wp.lat, lon: wp.lon, mode: wp.mode, minutes: wp.maxMinutes,
            direction: 'to_workplace', arrive_by: '08:45',
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!r.ok) {
          const detail = await r.json().then((b: { error?: string }) => b.error).catch(() => undefined);
          return { ok: false, reason: `Live routing unavailable${detail ? `: ${detail}` : ` (HTTP ${r.status})`}.` };
        }
        const body = (await r.json()) as { geometry: AreaGeometry; label?: string; source?: string; dryRun?: boolean };
        if (body.dryRun) return { ok: false, reason: 'Live routing is in dry-run mode. Set ROUTING_DRY_RUN=0 in .env and restart the routing proxy.' };
        if (!isAreaGeometry(body.geometry)) return { ok: false, reason: 'Live routing returned no valid reachable area.' };
        return {
          ok: true,
          area: {
            workplaceId: wp.id, mode: wp.mode, minutes: wp.maxMinutes, geometry: body.geometry,
            label: body.label ?? 'Live routing', synthetic: false, source: body.source ?? 'proxy',
          },
        };
      } catch {
        return { ok: false, reason: 'Live routing service unreachable.' };
      }
    },
  };
}

/** Proxy first when configured; fixtures as the offline fallback. */
export function getCommuteProvider(): CommuteProvider {
  const kind = import.meta.env.VITE_COMMUTE_PROVIDER;
  const url = import.meta.env.VITE_ROUTING_PROXY_URL || '/api';
  if (kind === 'proxy') {
    const live = proxyProvider(url);
    return {
      id: 'proxy+fixture',
      async getArea(wp) {
        const res = await live.getArea(wp);
        if (res.ok) return res;
        const fallback = await fixtureProvider.getArea(wp);
        return fallback.ok ? { ok: true, area: { ...fallback.area, label: `Live routing unavailable · ${fallback.area.label}` } }
          : { ok: false, reason: `${res.reason} ${fallback.reason}` };
      },
    };
  }
  return fixtureProvider;
}
