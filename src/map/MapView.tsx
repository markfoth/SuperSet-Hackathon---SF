import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CommuteArea } from '../features/commute/provider';
import type { AreaResult } from '../features/filters/ranking';
import type { NeighbourhoodCollection, Workplace } from '../types';
import { CONTEXT_LAYERS } from './layers/contextLayers';

// Stadia Maps "Alidade Smooth": keyless on localhost; production needs a free Stadia account with
// domain authentication (see docs/DECISIONS.md). Override with VITE_BASEMAP_URL.
const BASEMAP_URL = import.meta.env.VITE_BASEMAP_URL || 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png';
const BASEMAP_ATTRIBUTION = import.meta.env.VITE_BASEMAP_ATTRIBUTION
  || '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DATA_ATTRIBUTION = 'Data: DataSF, SFMTA, BART, Caltrain, USGS, Zillow, Wikimedia Commons — <a href="#about-data">sources</a>';

export const WORKPLACE_COLORS = ['#e8590c', '#7048e8', '#0c8599', '#c2255c'];

/** 0..1 score → colour (better = deeper teal). */
export function scoreColor(score: number | null): string {
  if (score == null) return '#3aa6a0';
  const ramp = ['#d7efe9', '#a6dbd0', '#6cc2b4', '#33a193', '#0f766e'];
  return ramp[Math.min(ramp.length - 1, Math.floor(score * ramp.length))];
}

interface Props {
  neighbourhoods: NeighbourhoodCollection;
  results: Record<string, AreaResult>;
  showExcluded: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  areas: CommuteArea[];
  workplaces: Workplace[];
  onMoveWorkplace: (id: string, lat: number, lon: number) => void;
  addingWorkplace: boolean;
  onMapPick: (lat: number, lon: number) => void;
  visibleLayers: Set<string>;
}

export function MapView(props: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const nhLayer = useRef<L.GeoJSON | null>(null);
  const areaLayer = useRef<L.LayerGroup | null>(null);
  const wpLayer = useRef<L.LayerGroup | null>(null);
  const ctx = useRef(new Map<string, L.Layer>());
  const building = useRef(new Set<string>());
  const latest = useRef(props);
  latest.current = props;

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { preferCanvas: true, zoomControl: false }).setView([37.715, -122.43], 11);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer(BASEMAP_URL, { attribution: BASEMAP_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.attributionControl.addAttribution(DATA_ATTRIBUTION);
    // Pane order (bottom → top): context fills, neighbourhoods, commute areas, lines, points.
    ([['context-fill', 380], ['neighbourhoods', 400], ['commute', 410], ['context-lines', 420], ['context-points', 430]] as const)
      .forEach(([name, z]) => { m.createPane(name).style.zIndex = String(z); });
    m.on('click', (e) => { if (latest.current.addingWorkplace) latest.current.onMapPick(e.latlng.lat, e.latlng.lng); });
    areaLayer.current = L.layerGroup().addTo(m);
    wpLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; };
  }, []);

  // Neighbourhood polygons: created once, restyled on every result change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    nhLayer.current?.remove();
    nhLayer.current = L.geoJSON(props.neighbourhoods, {
      pane: 'neighbourhoods',
      onEachFeature: (f, l) => {
        l.bindTooltip(f.properties.name, { sticky: true, className: 'nh-tooltip' });
        l.on('click', (e) => {
          if (latest.current.addingWorkplace) return;
          L.DomEvent.stopPropagation(e);
          latest.current.onSelect(f.properties.id);
        });
      },
    }).addTo(m);
    // Frame the city plus every workplace (SFO sits south of the city line).
    const bounds = nhLayer.current.getBounds();
    latest.current.workplaces.forEach((w) => bounds.extend([w.lat, w.lon]));
    m.fitBounds(bounds, { padding: [20, 20] });
  }, [props.neighbourhoods]);

  useEffect(() => {
    nhLayer.current?.setStyle((f) => {
      const r = props.results[f!.properties.id];
      const selected = f!.properties.id === props.selectedId;
      if (!r) return {};
      if (!r.eligible) {
        return {
          color: selected ? '#1d2433' : '#9aa3b2', weight: selected ? 3 : 0.8, dashArray: '3 3',
          fillColor: '#c9ced8', fillOpacity: props.showExcluded ? 0.35 : 0.08,
        };
      }
      return { color: selected ? '#1d2433' : '#0f766e', weight: selected ? 3.5 : 1.2, dashArray: undefined, fillColor: scoreColor(r.score), fillOpacity: 0.45 };
    });
  }, [props.results, props.selectedId, props.showExcluded]);

  // Commute areas, one outline per workplace.
  useEffect(() => {
    const g = areaLayer.current;
    if (!g) return;
    g.clearLayers();
    props.areas.forEach((a) => {
      const i = props.workplaces.findIndex((w) => w.id === a.workplaceId);
      const color = WORKPLACE_COLORS[i % WORKPLACE_COLORS.length];
      L.geoJSON(a.geometry, { pane: 'commute', interactive: false, style: { color, weight: 2, dashArray: a.synthetic ? '6 5' : undefined, fillColor: color, fillOpacity: 0.06 } }).addTo(g);
    });
  }, [props.areas, props.workplaces]);

  // Workplace pins (draggable).
  useEffect(() => {
    const g = wpLayer.current;
    if (!g) return;
    g.clearLayers();
    props.workplaces.forEach((w, i) => {
      const color = WORKPLACE_COLORS[i % WORKPLACE_COLORS.length];
      const icon = L.divIcon({ className: 'wp-pin', html: `<span style="background:${color}">${i + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker([w.lat, w.lon], { icon, draggable: true, title: w.name, zIndexOffset: 1000 })
        .on('dragend', (e) => { const ll = (e.target as L.Marker).getLatLng(); latest.current.onMoveWorkplace(w.id, ll.lat, ll.lng); })
        .bindTooltip(w.name)
        .addTo(g);
    });
  }, [props.workplaces]);

  // Context layers: independent toggles, lazily built exactly once (a toggle during loading must not
  // start a second build, or the first copy would be orphaned on the map).
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    for (const def of CONTEXT_LAYERS) {
      const want = props.visibleLayers.has(def.id);
      const layer = ctx.current.get(def.id);
      if (layer) {
        if (want && !m.hasLayer(layer)) layer.addTo(m);
        if (!want && m.hasLayer(layer)) layer.remove();
      } else if (want && !building.current.has(def.id)) {
        building.current.add(def.id);
        def.build(m).then((l) => {
          ctx.current.set(def.id, l);
          if (latest.current.visibleLayers.has(def.id)) l.addTo(m);
        }).catch((err) => console.error(`[layers] ${def.id}:`, err))
          .finally(() => building.current.delete(def.id));
      }
    }
  }, [props.visibleLayers]);

  // Zoom to the selected neighbourhood (explicit navigation only).
  useEffect(() => {
    if (!props.selectedId || !nhLayer.current || !map.current) return;
    const layer = nhLayer.current.getLayers().find((l) => (l as L.GeoJSON & { feature: { properties: { id: string } } }).feature.properties.id === props.selectedId) as L.Polygon | undefined;
    if (layer) map.current.flyToBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 15, duration: 0.6 });
  }, [props.selectedId]);

  return <div ref={el} className={`map${props.addingWorkplace ? ' picking' : ''}`} aria-label="Map of San Francisco neighbourhoods" />;
}
