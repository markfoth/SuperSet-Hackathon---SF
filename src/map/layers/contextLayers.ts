// Independent context overlays. Each is lazily loaded the first time it is
// switched on, and any combination can be visible at once.
import L from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import { loadData } from '../../lib/data';
import { num } from '../../lib/format';

export interface LegendItem { color: string; label: string; dashed?: boolean }

export interface ContextLayerDef {
  id: string;
  label: string;
  note: string;
  legend: LegendItem[];
  build: (map: L.Map) => Promise<L.Layer>;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function step(value: number, breaks: number[], colors: string[]): string {
  const i = breaks.findIndex((b) => value < b);
  return colors[i === -1 ? colors.length - 1 : i];
}

const CRIME_BREAKS = [100, 300, 700, 1500];
const CRIME_COLORS = ['#fde7d9', '#f9b98f', '#ee8551', '#cf5226', '#8f2d10'];
const SLOPE_BREAKS = [5, 10, 15, 20];
const AIR_COLORS = ['#eef3fb', '#c6d6ef', '#93b2df', '#5b84c4', '#2b5797'];
const SLOPE_COLORS = ['#f4efe6', '#ddc9a3', '#bf9a5d', '#8f6a32', '#5a3f17'];

const BIKE_STYLE: Record<string, { color: string; weight: number; dashArray?: string; label: string }> = {
  protected: { color: '#0b6e3a', weight: 4, label: 'Protected bikeway (Class IV)' },
  path: { color: '#2fa35f', weight: 4, label: 'Off-street path (Class I)' },
  lane: { color: '#2c6fd1', weight: 3, label: 'Painted bike lane (Class II)' },
  neighborway: { color: '#8a4fd6', weight: 3, dashArray: '6 4', label: 'Neighborway' },
  route: { color: '#7c8796', weight: 2, dashArray: '4 4', label: 'Shared route / sharrows (Class III)' },
  other: { color: '#b6bcc6', weight: 2, label: 'Other' },
};

export const CONTEXT_LAYERS: ContextLayerDef[] = [
  {
    id: 'crime',
    label: 'Reported crime',
    note: 'SFPD reported incidents, last 12 months, per ~0.7 km² hexagon. Reported ≠ all crime; busy commercial areas score high.',
    legend: CRIME_COLORS.map((c, i) => ({
      color: c,
      label: i === 0 ? `< ${CRIME_BREAKS[0]} per km²` : i === CRIME_COLORS.length - 1 ? `${num(CRIME_BREAKS[i - 1])}+` : `${CRIME_BREAKS[i - 1]}–${CRIME_BREAKS[i]}`,
    })),
    build: async () => {
      const fc = await loadData<FeatureCollection>('crime_grid.geojson');
      return L.geoJSON(fc, {
        pane: 'context-fill',
        style: (f) => ({ fillColor: step(f!.properties!.per_km2, CRIME_BREAKS, CRIME_COLORS), fillOpacity: 0.55, weight: 0.5, color: '#fff' }),
        onEachFeature: (f, l) => {
          const p = f.properties!;
          l.bindPopup(`<b>${num(p.total)} reported incidents</b> in 12 months<br>Violent ${p.violent} · Property ${p.property} (vehicle break-ins ${p.vehicle_breakin})<br><small>H3 cell ≈ 0.74 km². Locations are anonymised by SFPD.</small>`);
        },
      });
    },
  },
  {
    id: 'hills',
    label: 'Hills & street gradients',
    note: 'Zoom to street level (14+) for 40 m gradients from USGS elevation and official streets. DEM estimates, not surveyed grades. Missing coverage stays blank.',
    legend: SLOPE_COLORS.map((c, i) => ({
      color: c,
      label: i === 0 ? `< ${SLOPE_BREAKS[0]}% slope` : i === SLOPE_COLORS.length - 1 ? `${SLOPE_BREAKS[i - 1]}%+` : `${SLOPE_BREAKS[i - 1]}–${SLOPE_BREAKS[i]}%`,
    })),
    build: async (map) => {
      const fc = await loadData<FeatureCollection>('street_gradients.geojson');
      const streets = L.geoJSON(fc, {
        pane: 'context-lines',
        filter: (f) => f.properties?.grade_pct != null,
        style: (f) => ({ color: step(f!.properties!.grade_pct, SLOPE_BREAKS, SLOPE_COLORS), weight: 3, opacity: 0.85 }),
        onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties!.street)} · ${f.properties!.grade_pct}% DEM-derived median street grade`),
      });
      const group = L.layerGroup();
      const syncZoom = () => {
        const show = map.getZoom() >= 14;
        if (show && !group.hasLayer(streets)) group.addLayer(streets);
        if (!show && group.hasLayer(streets)) group.removeLayer(streets);
      };
      group.on('add', () => { map.on('zoomend', syncZoom); syncZoom(); });
      group.on('remove', () => map.off('zoomend', syncZoom));
      return group;
    },
  },
  {
    id: 'cycling',
    label: 'Cycling network',
    note: 'SFMTA bike network. Protected, painted and shared routes are shown separately.',
    legend: ['protected', 'path', 'lane', 'neighborway', 'route'].map((k) => ({ color: BIKE_STYLE[k].color, label: BIKE_STYLE[k].label, dashed: !!BIKE_STYLE[k].dashArray })),
    build: async () => {
      const fc = await loadData<FeatureCollection>('cycling_network.geojson');
      return L.geoJSON(fc, {
        pane: 'context-lines',
        style: (f) => {
          const s = BIKE_STYLE[f!.properties!.cat] ?? BIKE_STYLE.other;
          return { color: s.color, weight: s.weight, dashArray: s.dashArray, opacity: 0.9 };
        },
        onEachFeature: (f, l) => {
          const p = f.properties!;
          l.bindPopup(`<b>${esc(p.street)}</b><br>${esc(p.from)} → ${esc(p.to)}<br>${esc(BIKE_STYLE[p.cat]?.label)}${p.buffered ? ' · buffered' : ''}${p.raised ? ' · raised' : ''}${p.grade_pct != null ? `<br>Steepest grade ≈ ${p.grade_pct}%` : ''}`);
        },
      });
    },
  },
  {
    id: 'transit',
    label: 'Public transport',
    note: 'BART, Muni and Caltrain routes and rail stations; bus stops appear when zoomed in. SamTrans not yet included.',
    legend: [
      { color: '#0099d8', label: 'BART' }, { color: '#c4122f', label: 'Caltrain' },
      { color: '#4e2a84', label: 'Muni Metro / streetcar' }, { color: '#8b94a3', label: 'Muni bus' },
    ],
    build: async (map) => {
      const [routes, stops] = await Promise.all([
        loadData<FeatureCollection>('transit_routes.geojson'),
        loadData<FeatureCollection>('transit_stops.geojson'),
      ]);
      const modeColor: Record<string, string> = { bart: '#0099d8', caltrain: '#c4122f', muni_metro: '#4e2a84', cable_car: '#a0522d', bus: '#8b94a3' };
      const rail = (f: Feature) => ['bart', 'caltrain', 'muni_metro', 'cable_car'].includes(f.properties!.mode);
      const routeLayer = L.geoJSON(routes, {
        pane: 'context-lines',
        style: (f) => ({ color: f!.properties!.mode === 'bus' ? modeColor.bus : f!.properties!.color ?? modeColor[f!.properties!.mode], weight: rail(f!) ? 4 : 1.5, opacity: rail(f!) ? 0.9 : 0.55 }),
        onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties!.agency)} ${esc(f.properties!.short_name)} — ${esc(f.properties!.long_name)}`, { sticky: true }),
      });
      const stopLayer = (railOnly: boolean) => L.geoJSON(stops, {
        pane: 'context-points',
        filter: (f) => f.properties!.rail === railOnly,
        pointToLayer: (_f, ll) => L.circleMarker(ll, railOnly
          ? { radius: 5, color: '#fff', weight: 2, fillColor: '#1d2433', fillOpacity: 1 }
          : { radius: 2.5, stroke: false, fillColor: '#5b6475', fillOpacity: 0.8 }),
        onEachFeature: (f, l) => {
          const p = f.properties!;
          l.bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.agency)}: ${esc(p.routes)}<br>${num(p.weekday_departures)} departures on a typical weekday`);
        },
      });
      const stations = stopLayer(true);
      const busStops = stopLayer(false);
      const group = L.layerGroup([routeLayer, stations]);
      const syncZoom = () => {
        const show = map.getZoom() >= 15;
        if (show && !group.hasLayer(busStops)) group.addLayer(busStops);
        if (!show && group.hasLayer(busStops)) group.removeLayer(busStops);
      };
      group.on('add', () => { map.on('zoomend', syncZoom); syncZoom(); });
      group.on('remove', () => map.off('zoomend', syncZoom));
      return group;
    },
  },
  {
    id: 'parks',
    label: 'Parks & open space',
    note: 'SF Rec & Park properties plus federal/state parks from OpenStreetMap (Presidio, Lands End, Fort Funston).',
    legend: [{ color: '#5aa469', label: 'Park or open space' }],
    build: async () => {
      const fc = await loadData<FeatureCollection>('parks.geojson');
      return L.geoJSON(fc, {
        pane: 'context-fill',
        style: { fillColor: '#5aa469', fillOpacity: 0.45, color: '#3d7a4b', weight: 1 },
        onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties!.name)}${f.properties!.acres ? ` · ${num(f.properties!.acres)} acres` : ''}`),
      });
    },
  },
  {
    id: 'groceries',
    label: 'Supermarkets',
    note: 'Supermarkets and greengrocers mapped in OpenStreetMap.',
    legend: [{ color: '#d97706', label: 'Supermarket' }, { color: '#65a30d', label: 'Greengrocer' }],
    build: async () => {
      const fc = await loadData<FeatureCollection>('groceries.geojson');
      return L.geoJSON(fc, {
        pane: 'context-points',
        pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 4, color: '#fff', weight: 1, fillColor: f.properties!.shop === 'supermarket' ? '#d97706' : '#65a30d', fillOpacity: 1 }),
        onEachFeature: (f, l) => l.bindTooltip(esc(f.properties!.name)),
      });
    },
  },
  {
    id: 'collisions',
    label: 'Injury crashes',
    note: 'Traffic crashes with injuries, last 3 years, per ~0.7 km² hexagon. Reflects traffic volume as well as danger.',
    legend: ['< 5 crashes', '5–20', '20–50', '50–100', '100+'].map((label, i) => ({ color: CRIME_COLORS[i], label })),
    build: async () => {
      const fc = await loadData<FeatureCollection>('collisions_grid.geojson');
      return L.geoJSON(fc, {
        pane: 'context-fill',
        style: (f) => ({ fillColor: step(f!.properties!.total, [5, 20, 50, 100], CRIME_COLORS), fillOpacity: 0.55, weight: 0.5, color: '#fff' }),
        onEachFeature: (f, l) => {
          const p = f.properties!;
          l.bindPopup(`<b>${p.total} injury crashes</b> (3 years)<br>Pedestrian ${p.pedestrian} · Cyclist ${p.cyclist} · Killed/severe ${p.killed_or_severe}`);
        },
      });
    },
  },
  {
    id: 'air',
    label: 'Air pollution (PM2.5)',
    note: 'CalEnviroScreen 5.0, per census tract: statewide PM2.5 percentile (100 = most burdened in California). Click a tract for diesel, traffic and other pollution indicators.',
    legend: ['< 20th percentile', '20–40th', '40–60th', '60–80th', '80th+'].map((label, i) => ({ color: AIR_COLORS[i], label })),
    build: async () => {
      const fc = await loadData<FeatureCollection>('census_tracts.geojson');
      return L.geoJSON(fc, {
        pane: 'context-fill',
        filter: (f) => f.properties?.ces_pm_pctl != null,
        style: (f) => ({ fillColor: step(f!.properties!.ces_pm_pctl, [20, 40, 60, 80], AIR_COLORS), fillOpacity: 0.5, weight: 0.6, color: '#fff' }),
        onEachFeature: (f, l) => {
          const p = f.properties!;
          const row = (label: string, k: string) => `${label}: ${p[`ces_${k}_pctl`] == null ? 'no data' : `${Math.round(p[`ces_${k}_pctl`])}th pct`}`;
          l.bindPopup(`<b>Census tract ${esc(p.geoid)}</b><br>${[row('PM2.5', 'pm'), row('Diesel PM', 'diesel'), row('Traffic', 'traffic'), row('Ozone', 'ozone'), row('Toxic releases', 'RSEIhaz'), row('Lead risk (housing)', 'lead')].join('<br>')}<br>Pollution burden: ${p.ces_pollution_burden_pctl == null ? 'no data' : `${Math.round(p.ces_pollution_burden_pctl)}th pct`}${p.population != null ? `<br><small>${num(p.population)} residents (ACS 2020–24)</small>` : ''}<br><small>Statewide percentiles, CalEnviroScreen 5.0 (OEHHA)</small>`);
        },
      });
    },
  },
  {
    id: 'food',
    label: 'Cafés, restaurants & bars',
    note: 'OpenStreetMap places, shown at street zoom (zoom in to see them). For exploring a neighbourhood — not used in ranking.',
    legend: [{ color: '#8b5a2b', label: 'Café / coffee' }, { color: '#e03131', label: 'Restaurant' }, { color: '#7048e8', label: 'Bar / pub' }],
    build: async (map) => {
      const [cafes, restaurants, bars] = await Promise.all([
        loadData<FeatureCollection>('cafes.geojson'), loadData<FeatureCollection>('restaurants.geojson'), loadData<FeatureCollection>('bars.geojson'),
      ]);
      const layer = (fc: FeatureCollection, color: string) => L.geoJSON(fc, {
        pane: 'context-points',
        pointToLayer: (_f, ll) => L.circleMarker(ll, { radius: 4, color: '#fff', weight: 1, fillColor: color, fillOpacity: 0.95 }),
        onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties!.name)}${f.properties!.cuisine ? ` · ${esc(f.properties!.cuisine)}` : ''}`),
      });
      const points = L.layerGroup([layer(cafes, '#8b5a2b'), layer(restaurants, '#e03131'), layer(bars, '#7048e8')]);
      const group = L.layerGroup();
      // Zoom-dependent display keeps ~3,000 markers from cluttering the city view.
      const sync = () => {
        const show = map.getZoom() >= 15;
        if (show && !group.hasLayer(points)) group.addLayer(points);
        if (!show && group.hasLayer(points)) group.removeLayer(points);
      };
      group.on('add', () => { map.on('zoomend', sync); sync(); });
      group.on('remove', () => map.off('zoomend', sync));
      return group;
    },
  },
];
