// Independent context overlays. Each is lazily loaded the first time it is
// switched on, and any combination can be visible at once.
import type L from 'leaflet';
import type { Feature, FeatureCollection } from 'geojson';
import { loadData } from '../../lib/data';
import { num } from '../../lib/format';
import { buildLeafletPlaces } from './placeContext';

// LayerPanel imports metadata from this module. Defer the compatibility renderer
// until an actual Leaflet layer is requested so normal MapLibre sessions omit it.
const getLeaflet = () => import('leaflet').then((module) => module.default);

export interface LegendItem { color: string; label: string; dashed?: boolean }

export interface ContextLayerDef {
  id: string;
  label: string;
  note: string;
  warning?: string;
  legend: LegendItem[];
  build: (map: L.Map, options?: {airScale?:'local'|'statewide'}) => Promise<L.Layer>;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function step(value: number, breaks: number[], colors: string[]): string {
  const i = breaks.findIndex((b) => value < b);
  return colors[i === -1 ? colors.length - 1 : i];
}

const CRIME_BREAKS = [100, 300, 700, 1500];
const CRIME_COLORS = ['#fde7d9', '#f9b98f', '#ee8551', '#cf5226', '#8f2d10'];
const AIR_COLORS = ['#e5f5e7', '#abd8c5', '#65b8b6', '#32778e', '#143d63'];
function airColour(value: number | null, scale:'local'|'statewide'='local') {
  if (value == null) return '#aab1b6';
  const stops = scale==='local' ? [5, 12, 20, 28, 35] : [0,25,50,75,100];
  const high = Math.min(4, Math.max(1, stops.findIndex(x => x >= value) === -1 ? 4 : stops.findIndex(x => x >= value)));
  const t = Math.max(0, Math.min(1, (value-stops[high-1])/(stops[high]-stops[high-1])));
  const rgb = [0, 1, 2].map(i => Math.round(parseInt(AIR_COLORS[high-1].slice(1+i*2,3+i*2),16)*(1-t) + parseInt(AIR_COLORS[high].slice(1+i*2,3+i*2),16)*t));
  return `rgb(${rgb.join(',')})`;
}

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
    label: 'Reported incidents',
    warning: 'SF only · Peninsula measurements unavailable.',
    note: 'SF coverage only; Peninsula data unavailable. SFPD reported incidents, last 12 months, per ~0.7 km² hexagon. Reported ≠ all crime.',
    legend: CRIME_COLORS.map((c, i) => ({
      color: c,
      label: i === 0 ? `< ${CRIME_BREAKS[0]} per km²` : i === CRIME_COLORS.length - 1 ? `${num(CRIME_BREAKS[i - 1])}+` : `${CRIME_BREAKS[i - 1]}–${CRIME_BREAKS[i]}`,
    })),
    build: async () => {
      const L = await getLeaflet();
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
    id: 'topography',
    label: 'Topographic map',
    note: 'USGS land elevation above sea level, in metres. A fixed near-white to purple scale shows the study region, observed −7 to 397 m. This coloured USGS picture is separate from Mapterhorn terrain geometry and street-gradient measurements. Water and missing coverage are transparent.',
    legend: ['#f8f6fc', '#e7def2', '#cfc0e4', '#ad94cd', '#8865ad', '#613d8b'].map((color, i) => ({
      color, label: ['0 m · sea level', '50 m', '100 m', '200 m', '300 m', '400 m+'][i],
    })),
    build: async () => {
      const L = await getLeaflet();
      const data = await loadData<{ image: string; bounds: [[number, number], [number, number]] }>('topography.json');
      const url = `${import.meta.env.BASE_URL}data/${data.image}`;
      const image = new Image();
      image.src = url;
      await image.decode();
      return L.imageOverlay(url, data.bounds, { pane: 'context-fill', opacity: 0.72, interactive: false, className: 'topography-overlay' });
    },
  },
  {
    id: 'cycling',
    label: 'Cycling network',
    note: 'SFMTA and San Mateo County existing bikeways. Protected, painted and shared routes are shown separately; proposed lanes omitted.',
    legend: ['protected', 'path', 'lane', 'neighborway', 'route'].map((k) => ({ color: BIKE_STYLE[k].color, label: BIKE_STYLE[k].label, dashed: !!BIKE_STYLE[k].dashArray })),
    build: async () => {
      const L = await getLeaflet();
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
    warning: 'Muni timetable is out of date; see (i).',
    note: 'BART, Muni, Caltrain and SamTrans routes and rail stations; bus stops appear when zoomed in.',
    legend: [
      { color: '#0099d8', label: 'BART' }, { color: '#c4122f', label: 'Caltrain' },
      { color: '#4e2a84', label: 'Muni Metro / streetcar' }, { color: '#8b94a3', label: 'Muni / SamTrans bus' },
    ],
    build: async (map) => {
      const L = await getLeaflet();
      const [routes, stops] = await Promise.all([
        loadData<FeatureCollection>('transit_routes.geojson'),
        loadData<FeatureCollection>('transit_stops.geojson'),
      ]);
      const modeColor: Record<string, string> = { bart: '#0099d8', caltrain: '#c4122f', muni_metro: '#4e2a84', cable_car: '#a0522d', bus: '#8b94a3' };
      const rail = (f: Feature) => ['bart', 'caltrain', 'muni_metro', 'cable_car'].includes(f.properties!.mode);
      const routeLayer = L.geoJSON(routes, {
        pane: 'context-lines',
        style: (f) => ({ color: f!.properties!.mode === 'bus' ? modeColor.bus : f!.properties!.color ?? modeColor[f!.properties!.mode], weight: rail(f!) ? 4 : 1.5, opacity: rail(f!) ? 0.9 : 0.55 }),
        onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties!.agency)} ${esc(f.properties!.short_name)}; ${esc(f.properties!.long_name)}`, { sticky: true }),
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
    note: 'SF Rec & Park, San Mateo County mapped parks, and OpenStreetMap parks/open spaces. Entrance access unverified.',
    legend: [{ color: '#5aa469', label: 'Park or open space' }],
    build: async () => {
      const L = await getLeaflet();
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
    build: map => buildLeafletPlaces(map, 'groceries'),
  },
  {
    id: 'collisions',
    label: 'Injury crashes',
    note: 'SF coverage only; Peninsula data unavailable. Injury crashes over 3 years, per ~0.7 km² hexagon. Reflects traffic volume as well as danger.',
    legend: ['< 5 crashes', '5–20', '20–50', '50–100', '100+'].map((label, i) => ({ color: CRIME_COLORS[i], label })),
    build: async () => {
      const L = await getLeaflet();
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
    note: 'Choose local contrast (fixed 5–35) or the full California 0–100 percentile range. Local values span 7.6–34.2; the darkest local tract is not California’s worst. True statewide values remain in pop-ups. Tract geography, not building-level pollution. Grey means missing data.',
    legend: [...[5, 12, 20, 28, 35].map((value, i) => ({ color: AIR_COLORS[i], label: `${value}th California percentile · local contrast` })), {color:'#aab1b6', label:'No published PM2.5 value'}],
    build: async (_map, options) => {
      const L = await getLeaflet();
      const fc = await loadData<FeatureCollection>('census_tracts.geojson');
      return L.geoJSON(fc, {
        pane: 'context-fill',
        style: (f) => ({ fillColor: airColour(f!.properties!.ces_pm_pctl,options?.airScale), fillOpacity: 0.64, weight: 0.7, color: '#597475' }),
        onEachFeature: (f, l) => {
          const p = f.properties!;
          const row = (label: string, k: string) => `${label}: ${p[`ces_${k}_pctl`] == null ? 'no data' : `${Math.round(p[`ces_${k}_pctl`])}th pct`}`;
          l.bindPopup(`<b>Census tract ${esc(p.geoid)}</b><br>${[row('PM2.5', 'pm'), row('Diesel PM', 'diesel'), row('Traffic', 'traffic'), row('Ozone', 'ozone'), row('Toxic releases', 'RSEIhaz'), row('Lead risk (housing)', 'lead')].join('<br>')}<br>Pollution burden: ${p.ces_pollution_burden_pctl == null ? 'no data' : `${Math.round(p.ces_pollution_burden_pctl)}th pct`}${p.population != null ? `<br><small>${num(p.population)} residents (ACS 2020–24)</small>` : ''}<br><small>Statewide percentiles, CalEnviroScreen 5.0 (OEHHA)</small>`);
        },
      });
    },
  },
  {
    id: 'nightlife',
    label: 'Nightlife',
    note: 'OpenStreetMap bars, pubs and nightclubs, clustered at city zoom, individual dots from neighbourhood zoom and collision-aware names at street zoom. Subtle shading is mapped venues per km² with 300 m smoothing, not street activity, noise or opening hours. Context only; does not affect ranking.',
    legend: ['#fbcfe8', '#f9a8d4', '#f472b6', '#db2777', '#9d174d'].map((color, i) => ({
      color, label: ['2 · fewer mapped venues', '5', '10', '20', '40+ · more mapped venues'][i] + ' / km²',
    })),
    build: async (map) => {
      const L = await getLeaflet();
      const data = await loadData<{ image: string; bounds: [[number, number], [number, number]] }>('nightlife.json');
      const url = `${import.meta.env.BASE_URL}data/${data.image}`;
      const image = new Image(); image.src = url; await image.decode();
      return L.layerGroup([
        L.imageOverlay(url, data.bounds, { pane: 'context-fill', opacity: 0.32, interactive: false, className: 'nightlife-overlay' }),
        await buildLeafletPlaces(map, 'nightlife'),
      ]);
    },
  },
  {
    id: 'food',
    label: 'Food and coffee',
    note: 'OpenStreetMap cafés and restaurants. City clusters separate into individual venues from zoom 13; collision-aware names appear from zoom 14. Bars, pubs and nightclubs belong to Nightlife. Discovery context only.',
    legend: [{ color: '#8b5a2b', label: 'Cafés and restaurants' }],
    build: map => buildLeafletPlaces(map, 'food'),
  },
  {
    id: 'character',
    label: 'Neighbourhood character',
    note: 'Reviewed descriptions of amenities and place character, with sources and review dates. Broad labels give way to researched districts; unsupported areas remain in the research queue. Descriptive context never changes rankings.',
    legend: [{ color: '#68546f', label: 'Sourced editorial context · click a label' }],
    build: map => buildLeafletPlaces(map, 'character'),
  },
];
