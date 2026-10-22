import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { CommuteArea } from '../features/commute/provider';
import type { AreaResult, CellResult, MatchState } from '../features/filters/ranking';
import type { AreaCellCollection, AreaGeometry, NeighbourhoodCollection, Workplace } from '../types';
import { reasonText } from '../features/neighbourhoods/reasons';
import { CONTEXT_LAYERS } from './layers/contextLayers';

// Stadia Maps "Alidade Smooth": keyless on localhost; production needs a free Stadia account with
// domain authentication (see docs/DECISIONS.md). Override with VITE_BASEMAP_URL.
const BASEMAP_URL = import.meta.env.VITE_BASEMAP_URL || 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png';
const BASEMAP_ATTRIBUTION = import.meta.env.VITE_BASEMAP_ATTRIBUTION
  || '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DATA_ATTRIBUTION = 'Data: DataSF, SFMTA, BART, Caltrain, USGS, Zillow, Wikimedia Commons — <a href="#about-data">sources</a>';

export const WORKPLACE_COLORS = ['#e8590c', '#7048e8', '#0c8599', '#c2255c'];

export const MATCH_COLORS: Record<MatchState, string> = { strong: '#27824d', partial: '#e4b63f', excluded: '#ba4e48', unknown: '#858e9b' };

interface Props {
  neighbourhoods: NeighbourhoodCollection;
  cells: AreaCellCollection;
  cellResults: Record<string, CellResult>;
  selectedCellId: string | null;
  onSelectCell: (id: string) => void;
  overlap: AreaGeometry | null;
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
  const cellLayer = useRef<L.GeoJSON | null>(null);
  const areaLayer = useRef<L.LayerGroup | null>(null);
  const wpLayer = useRef<L.LayerGroup | null>(null);
  const ctx = useRef(new Map<string, L.Layer>());
  const building = useRef(new Set<string>());
  const [layerErrors, setLayerErrors] = useState<Record<string, string>>({});
  const latest = useRef(props);
  latest.current = props;

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const m = L.map(el.current, { preferCanvas: true, zoomControl: false, zoomAnimation: !reducedMotion, fadeAnimation: !reducedMotion }).setView([37.715, -122.43], 11);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    L.tileLayer(BASEMAP_URL, { attribution: BASEMAP_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.attributionControl.addAttribution(DATA_ATTRIBUTION);
    // Pane order (bottom → top): context fills, neighbourhoods, commute areas, lines, points.
    ([['context-fill', 380], ['cells', 390], ['neighbourhoods', 400], ['commute', 410], ['context-lines', 420], ['context-points', 430]] as const)
      .forEach(([name, z]) => { m.createPane(name).style.zIndex = String(z); });
    m.on('click', (e) => { if (latest.current.addingWorkplace) latest.current.onMapPick(e.latlng.lat, e.latlng.lng); });
    areaLayer.current = L.layerGroup().addTo(m);
    wpLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => { m.remove(); map.current = null; ctx.current.clear(); building.current.clear(); };
  }, []);

  // Leaflet owns container classes. Updating React's className after a map pick
  // would remove leaflet-container and its clipping, making canvases cover tabs.
  useEffect(() => { el.current?.classList.toggle('picking', props.addingWorkplace); }, [props.addingWorkplace]);

  // Neighbourhood polygons: created once, restyled on every result change.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    nhLayer.current?.remove();
    nhLayer.current = L.geoJSON(props.neighbourhoods, {
      pane: 'neighbourhoods',
      style: { fill: false, color: '#697586', weight: 0.7, opacity: 0.5 },
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
      const selected = f!.properties.id === props.selectedId;
      return { fill: false, color: selected ? '#1d2433' : '#697586', weight: selected ? 2.5 : 0.7, opacity: selected ? 1 : 0.5 };
    });
  }, [props.results, props.selectedId, props.showExcluded]);

  // 1,226 simple SVG cells: built once, restyled on preference changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    cellLayer.current?.remove();
    cellLayer.current = L.geoJSON(props.cells, {
      pane: 'cells', style: { renderer: L.svg({ pane: 'cells' }) ?? undefined },
      onEachFeature: (f, l) => {
        const id = f.properties.h3;
        l.bindTooltip(() => {
          const r = latest.current.cellResults[id];
          const text = document.createElement('div');
          text.textContent = r ? `${r.name} · ${r.state === 'strong' ? 'Strong match' : r.state === 'partial' ? 'Partial match' : r.state === 'unknown' ? 'Insufficient information' : 'Excluded'}${r.reasons.length ? ': ' + r.reasons.map((x) => reasonText(x, latest.current.workplaces)).join('; ') : ''}${r.unchecked.length ? ' · Missing: ' + r.unchecked.join(', ') : ''}` : 'Loading cell…';
          return text;
        }, { sticky: true });
        l.on('click', (e) => {
          if (latest.current.addingWorkplace) return;
          L.DomEvent.stopPropagation(e); latest.current.onSelectCell(id);
        });
      },
    }).addTo(m);
    // Accessible redundant pattern: excludes remain recognisable without colour.
    const svg = m.getPane('cells')?.querySelector('svg');
    if (svg) {
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      defs.innerHTML = '<pattern id="excluded-hatch" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#f6d3d0"/><path d="M-2 2L2-2M0 8L8 0M6 10L10 6" stroke="#a33b36" stroke-width="1.5"/></pattern>';
      svg.prepend(defs);
    }
    cellLayer.current.eachLayer((l) => {
      const path = (l as L.Path).getElement();
      if (!path) return;
      const id = (l as L.GeoJSON & { feature: { properties: { h3: string } } }).feature.properties.h3;
      path.setAttribute('tabindex', '0'); path.setAttribute('role', 'button');
      path.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') latest.current.onSelectCell(id); });
    });
  }, [props.cells]);

  useEffect(() => {
    const contextFill = ['crime', 'parks', 'collisions', 'air'].some((id) => props.visibleLayers.has(id));
    cellLayer.current?.eachLayer((l) => {
      const pathLayer = l as L.Path & { feature: { properties: { h3: string } } };
      const id = pathLayer.feature.properties.h3, r = props.cellResults[id];
      if (!r) return;
      const selected = id === props.selectedCellId;
      pathLayer.setStyle({ color: selected ? '#102a43' : MATCH_COLORS[r.state], weight: selected ? 3 : 0.6,
        fillColor: MATCH_COLORS[r.state], fillOpacity: contextFill ? 0.2 : r.state === 'excluded' ? (props.showExcluded ? 0.5 : 0.17) : 0.55,
        dashArray: r.state === 'excluded' ? '3 2' : r.state === 'unknown' ? '1 3' : undefined });
      const element = pathLayer.getElement();
      if (element) {
        element.setAttribute('fill', r.state === 'excluded' ? 'url(#excluded-hatch)' : MATCH_COLORS[r.state]);
        element.setAttribute('aria-label', `${r.name}, cell ${id}, ${r.state}. ${r.reasons.map((x) => reasonText(x, props.workplaces)).join('. ')}`);
      }
    });
  }, [props.cells, props.cellResults, props.selectedCellId, props.showExcluded, props.visibleLayers, props.workplaces]);

  // Commute areas, one outline per workplace.
  useEffect(() => {
    const g = areaLayer.current;
    if (!g) return;
    g.clearLayers();
    props.areas.forEach((a) => {
      const i = props.workplaces.findIndex((w) => w.id === a.workplaceId);
      const color = WORKPLACE_COLORS[i % WORKPLACE_COLORS.length];
      L.geoJSON(a.geometry, { pane: 'commute', interactive: false, style: { color, weight: 2, dashArray: a.source === 'fixture' ? '6 5' : undefined, fill: false } }).addTo(g);
    });
    if (props.overlap) L.geoJSON(props.overlap, { pane: 'commute', interactive: false,
      style: { color: '#006a68', weight: 4, dashArray: '10 4', fillColor: '#35a6a0', fillOpacity: 0.06 } }).addTo(g);
  }, [props.areas, props.workplaces, props.overlap]);

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
          if (map.current !== m) return;
          ctx.current.set(def.id, l);
          if (latest.current.visibleLayers.has(def.id)) l.addTo(m);
        }).catch(() => setLayerErrors((e) => ({ ...e, [def.id]: `${def.label} could not load. Reload to retry.` })))
          .finally(() => building.current.delete(def.id));
      }
    }
  }, [props.visibleLayers]);

  // Zoom to the selected neighbourhood (explicit navigation only).
  useEffect(() => {
    if (props.selectedCellId || !props.selectedId || !nhLayer.current || !map.current) return;
    const layer = nhLayer.current.getLayers().find((l) => (l as L.GeoJSON & { feature: { properties: { id: string } } }).feature.properties.id === props.selectedId) as L.Polygon | undefined;
    if (layer) map.current.flyToBounds(layer.getBounds(), { padding: [60, 60], maxZoom: 15, duration: 0.6, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  }, [props.selectedId]);

  useEffect(() => {
    if (!props.selectedCellId || !cellLayer.current || !map.current) return;
    const layer = cellLayer.current.getLayers().find((l) => (l as L.GeoJSON & { feature: { properties: { h3: string } } }).feature.properties.h3 === props.selectedCellId) as L.Polygon | undefined;
    if (layer) map.current.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 16, animate: false });
  }, [props.selectedCellId]);

  return <><div ref={el} className="map" aria-label="Map of San Francisco area cells" />
    {Object.entries(layerErrors).filter(([id]) => props.visibleLayers.has(id)).map(([id, message]) => <div key={id} className="map-layer-error" role="alert">{message}</div>)}
  </>;
}
