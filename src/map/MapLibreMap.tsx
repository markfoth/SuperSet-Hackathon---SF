import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, StyleSpecification, LngLatBoundsLike } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { FeatureCollection } from 'geojson';
import type { MapProps } from './mapTypes';
import { commuteFeatures, geometryBounds, matchingFeatures, neighbourhoodFeatures, WORKPLACE_COLORS } from './mapData';
import { addContext, airColour, contextText, type LoadedContext } from './layers/mapLibreContext';
import { loadData } from '../lib/data';
import { installRightDragZoom } from './rightDragZoom';
import { createTransportAnimation } from './transportAnimation';
import { placePopup, expandPlaceCluster } from './layers/placeContext';
import { DEFAULT_EVENT_FILTERS, eventPopup, updateEventContext } from './layers/eventDetails';
import './map.css';

// MapLibre 6 resolves its default worker beside the library module. Vite moves
// that module during optimisation/build, so retain an explicit bundled worker URL.
maplibregl.setWorkerUrl(workerUrl);

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const BASE_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#dce8ea' } }] };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Keep all framing inside the currently unobscured map, including collapsed panels. */
function framePadding(map: maplibregl.Map, amount = 32) {
  const bounds = map.getContainer().getBoundingClientRect();
  const layout = map.getContainer().closest('.layout');
  const criteria = layout?.querySelector('.criteria-panel:not(.collapsed)')?.getBoundingClientRect();
  const matches = layout?.querySelector('.matches-panel:not(.collapsed)')?.getBoundingClientRect();
  if (criteria && window.innerWidth >= 1100) {
    const inset = (rect: DOMRect | undefined, side: 'left' | 'right') => !rect?.width || rect.bottom <= bounds.top || rect.top >= bounds.bottom ? 0 : Math.max(0, side === 'left' ? rect.right - bounds.left : bounds.right - rect.left);
    return { top: amount + 60, bottom: amount + 40, left: inset(criteria, 'left') + amount, right: inset(matches, 'right') + amount };
  }
  const decision = layout?.querySelector('.decision-panel:not([hidden])')?.getBoundingClientRect();
  if (decision && window.innerWidth > 700 && decision.top < bounds.bottom && decision.bottom > bounds.top) {
    return { top: amount + 48, bottom: amount + 40, left: Math.min(Math.max(0, decision.right - bounds.left) + amount, bounds.width * 0.45), right: amount };
  }
  const panelInset = (selector: string, side: 'left' | 'right') => {
    const rect = layout?.querySelector(selector)?.getBoundingClientRect();
    if (!rect?.width || rect.bottom <= bounds.top || rect.top >= bounds.bottom) return 0;
    if (window.innerWidth <= 700) return 0;
    return Math.max(0, side === 'left' ? rect.right - bounds.left : bounds.right - rect.left);
  };
  const left = panelInset('.sidebar', 'left') + amount;
  const right = panelInset('.resultsbar', 'right') + amount;
  // An intermediate viewport can have both panels. Retain at least a narrow view.
  return { top: amount + 48, bottom: amount + 40, left: Math.min(left, bounds.width * 0.36), right: Math.min(right, bounds.width * 0.36) };
}

function setGeo(map: maplibregl.Map, id: string, data: FeatureCollection) {
  (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
}

/** Place the whole popup inside the space between the two desktop panels. */
function showPopup(map: maplibregl.Map, event: maplibregl.MapMouseEvent, node: HTMLElement) {
  const padding=framePadding(map,12), rect=map.getContainer().getBoundingClientRect();
  const width=Math.min(300,Math.max(220,rect.width-padding.left-padding.right-32));
  const left=event.point.x<padding.left+width/2;
  const right=event.point.x>rect.width-padding.right-width/2;
  const top=event.point.y<(padding.top+rect.height-padding.bottom)/2;
  const anchor: maplibregl.PositionAnchor = top ? left?'top-left':right?'top-right':'top' : left?'bottom-left':right?'bottom-right':'bottom';
  node.style.maxHeight=`${Math.max(130,Math.min(390,top?rect.height-padding.bottom-event.point.y-30:event.point.y-padding.top-30))}px`;
  node.style.overflowY='auto';
  return new maplibregl.Popup({maxWidth:`${width}px`,anchor,offset:12}).setLngLat(event.lngLat).setDOMContent(node).addTo(map);
}

function initialiseSources(map: maplibregl.Map, props: MapProps) {
  const before = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
  // Boundaries stay available during a basemap outage, so selection remains useful.
  map.addSource('neighbourhoods', { type: 'geojson', data: neighbourhoodFeatures(props.neighbourhoods, props.results, props.matchingActive, props.selectedId), promoteId: 'id' });
  map.addLayer({ id: 'coverage-land', type: 'fill', source: 'neighbourhoods', paint: { 'fill-color': '#f4f2e9', 'fill-opacity': map.getSource('openmaptiles') ? 0 : 1 } }, before);
  map.addLayer({ id: 'coverage-boundary', type: 'line', source: 'neighbourhoods', paint: { 'line-color': '#7e9594', 'line-width': 0.7, 'line-opacity': 0.3 } }, before);
  map.addSource('matching', { type: 'geojson', data: EMPTY, promoteId: 'h3' });
  map.addLayer({ id: 'matching-fill', type: 'fill', source: 'matching', paint: {
    'fill-color': ['get', 'colour'], 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.8, 0.48],
  } }, before);
  map.addLayer({ id: 'matching-line', type: 'line', source: 'matching', paint: {
    'line-color': ['get', 'colour'], 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 2.5, 0.65], 'line-opacity': 0.8,
  } }, before);
  map.addSource('commutes', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'commute-lines', type: 'line', source: 'commutes', paint: { 'line-color': ['get', 'colour'], 'line-width': 2, 'line-opacity': 0.2 } }, before);
  map.addSource('overlap', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'overlap-fill', type: 'fill', source: 'overlap', paint: { 'fill-color': '#4c9875', 'fill-opacity': 0.055 } }, before);
  map.addLayer({ id: 'overlap-line', type: 'line', source: 'overlap', paint: { 'line-color': '#216a4b', 'line-opacity': 1, 'line-width': 3.5 } }, before);
  map.addLayer({ id: 'neighbourhood-outline', type: 'line', source: 'neighbourhoods', filter: ['==', ['get', 'eligible'], true], paint: {
    'line-color': ['case', ['==', ['get', 'selected'], true], '#394b43', '#6e7a77'],
    'line-width': ['case', ['==', ['get', 'selected'], true], 2.4, 0.6],
    'line-opacity': ['case', ['==', ['get', 'selected'], true], 1, 0.24],
  } }, before);
  map.addLayer({ id: 'neighbourhood-hover', type: 'line', source: 'neighbourhoods', paint: {
    'line-color': '#155e63', 'line-width': 3,
    'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0],
  } });
  map.addLayer({ id: 'selection-outline', type: 'line', source: 'matching', filter: ['==', ['get', 'selected'], true], paint: {
    'line-color': '#a9781f', 'line-width': ['case', ['==', ['get', 'focused'], true], 3.4, 2.3], 'line-opacity': 1,
  } });
  map.addLayer({ id: 'focused-outline', type: 'line', source: 'matching', filter: ['==', ['get', 'focused'], true], paint: {
    'line-color': '#213f36', 'line-width': 3.5,
  } });
  if (map.getSource('openmaptiles')) map.addLayer({ id: 'real-buildings', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
    layout: { visibility: 'none' }, filter: ['all', ['!=', ['get', 'hide_3d'], true], ['>', ['coalesce', ['get', 'render_height'], 0], 0], ['<=', ['coalesce', ['get', 'render_height'], 0], 1000]],
    paint: { 'fill-extrusion-color': '#d3d1c5', 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
      'fill-extrusion-base': ['min', ['max', 0, ['coalesce', ['get', 'render_min_height'], 0]], ['coalesce', ['get', 'render_height'], 0]], 'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 14.5, 0.88], 'fill-extrusion-vertical-gradient': true },
  }, before);
}

export function MapLibreMap(props: MapProps & { onWebGLFailure: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const activePopup = useRef<maplibregl.Popup | null>(null);
  const latest = useRef(props); latest.current = props;
  const markers = useRef<maplibregl.Marker[]>([]);
  const loaded = useRef(new Map<string, LoadedContext>());
  const loading = useRef(new Set<string>());
  const styleGeneration = useRef(0);
  const [ready, setReady] = useState(0);
  const [is3D, setIs3D] = useState(false);
  const [tilted, setTilted] = useState(false);
  const [terrain, setTerrain] = useState(false);
  const terrainWanted = useRef(false);
  const terrainGeneration = useRef(0);
  const [terrainBusy, setTerrainBusy] = useState(false);
  const [styleLoading, setStyleLoading] = useState(true);
  const [baseError, setBaseError] = useState('');
  const [layerErrors, setLayerErrors] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(11);
  const [layerAttempt, setLayerAttempt] = useState(0);
  const [navigationHint, setNavigationHint] = useState(() => { try { return sessionStorage.getItem('cg:navigation-hint') !== 'dismissed'; } catch { return true; } });
  const openPopup = (m:maplibregl.Map,event:maplibregl.MapMouseEvent,node:HTMLElement) => {
    activePopup.current?.remove(); activePopup.current=showPopup(m,event,node);
  };
  function changeTilt(next: boolean) {
    setTilted(next);
    map.current?.easeTo({ pitch: next ? (is3D ? 50 : 52) : 0, duration: reducedMotion() ? 0 : 600 });
  }

  const fit = () => {
    const m = map.current;
    if (!m) return;
    const p = latest.current;
    const bounds = new maplibregl.LngLatBounds();
    const suitable = p.cells.features.filter((f) => p.matchingActive && p.cellResults[f.properties.h3]?.eligible);
    const shapes = suitable.length ? suitable : p.neighbourhoods.features;
    shapes.forEach((f) => { const b = geometryBounds(f.geometry); if (b) { bounds.extend([b[0], b[1]]); bounds.extend([b[2], b[3]]); } });
    p.workplaces.forEach((w) => bounds.extend([w.lon, w.lat]));
    p.homes?.forEach((h) => bounds.extend([h.lon, h.lat]));
    // MapLibre 6 otherwise adds fit padding to padding retained by easeTo.
    // With two panels that can leave no fitting viewport after Show pin.
    if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: framePadding(m), absolutePadding: true, maxZoom: 15, duration: reducedMotion() ? 0 : 600 });
  };

  useEffect(() => {
    if (!el.current) return;
    let disposed = false;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({ container: el.current, style: BASE_STYLE, center: [-122.43, 37.725], zoom: 10.8,
        minZoom: 7, maxZoom: 19, maxPitch: 60,
        canvasContextAttributes: { antialias: true }, attributionControl: false, refreshExpiredTiles: true,
      });
    } catch { props.onWebGLFailure(); return; }
    map.current = m;
    const removeRightDrag = installRightDragZoom(m);
    // A scoped renderer handle lets browser audits exercise the real production
    // camera and query loaded elevation, without replacing or mocking WebGL.
    Object.defineProperty(el.current, '__commonGroundMap', { value: m, configurable: true });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Context: DataSF · San Mateo County · USGS · OSM' }), 'bottom-left');
    const onReady = () => {
      if (disposed || m.getSource('matching')) return;
      styleGeneration.current += 1;
      loaded.current.clear(); loading.current.clear();
      terrainGeneration.current += 1;
      setTerrainBusy(false);
      initialiseSources(m, latest.current);
      setTerrain(false);
      if (m.getSource('openmaptiles')) setStyleLoading(false);
      setReady((r) => r + 1);
      el.current?.setAttribute('data-map-ready', 'true');
    };
    m.on('style.load', onReady);
    m.on('load', () => { onReady(); fit(); });
    m.on('error', (event) => {
      if (disposed) return;
      const sourceId = (event as unknown as { sourceId?: string }).sourceId;
      if (sourceId === 'terrain') {
        m.setTerrain(null); setTerrain(false);
        if (m.getSource('terrain')) m.removeSource('terrain');
        if (el.current) el.current.dataset.terrainLoaded = 'false';
        terrainGeneration.current += 1;
        setTerrainBusy(false);
        setLayerErrors((errors) => ({ ...errors, terrain: 'Terrain is temporarily unavailable. The flat map and buildings remain available.' }));
      } else if (!sourceId?.startsWith('context-')) setBaseError('Some basemap tiles are unavailable. Your matching locations are still shown.');
    });
    m.on('webglcontextlost', () => { if (!disposed) latest.current.onWebGLFailure(); });
    m.on('moveend', () => {
      setZoom(m.getZoom());
      if (el.current) { el.current.dataset.zoom = m.getZoom().toFixed(2); el.current.dataset.pitch = m.getPitch().toFixed(0);
        el.current.dataset.centre = m.getCenter().toArray().map(n => n.toFixed(5)).join(','); el.current.dataset.bearing = m.getBearing().toFixed(0); }
    });
    m.on('sourcedata', (event) => {
      if (!el.current) return;
      if (event.sourceId === 'openmaptiles' && event.isSourceLoaded) el.current.dataset.vectorLoaded = 'true';
      if (event.sourceId === 'terrain' && event.isSourceLoaded) el.current.dataset.terrainLoaded = 'true';
    });
    m.on('idle', () => {
      if (el.current) el.current.dataset.buildingCount = String(m.getLayer('real-buildings') ? m.queryRenderedFeatures({ layers: ['real-buildings'] }).length : 0);
    });
    m.on('pitchend', () => setTilted(m.getPitch() > 5));
    const tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'cg-map-tooltip', offset: 14 });
    let hover: string | null = null;
    let hoveredNeighbourhood: string | null = null;
    m.on('mousemove', (event) => {
      if (!m.getLayer('matching-fill')) return;
      if (latest.current.addingWorkplace || latest.current.pickingHome) { tooltip.remove(); return; }
      const f = m.queryRenderedFeatures(event.point, { layers: ['matching-fill'] })[0];
      const id = f?.properties?.h3 as string | undefined;
      if (hover && hover !== id) m.setFeatureState({ source: 'matching', id: hover }, { hover: false });
      hover = id ?? null;
      const interactive=[...loaded.current.values()].flatMap(x=>x.layers).filter(key=>m.getLayer(key)&&['circle','symbol'].includes(m.getLayer(key)!.type));
      const hasPoint=interactive.length && m.queryRenderedFeatures(event.point,{layers:interactive}).length>0;
      m.getCanvas().style.cursor = id || hasPoint ? 'pointer' : '';
      if (!id) { tooltip.remove(); if (hoveredNeighbourhood) latest.current.onHoverNeighbourhood?.(null); hoveredNeighbourhood = null; return; }
      m.setFeatureState({ source: 'matching', id }, { hover: true });
      const r = latest.current.cellResults[id];
      if (r && hoveredNeighbourhood !== r.nhoodId) { hoveredNeighbourhood = r.nhoodId; latest.current.onHoverNeighbourhood?.(r.nhoodId); }
      if (r) { const node = document.createElement('div'); node.textContent = `${r.name} · ${r.eligible ? 'Matching location' : 'Required evidence unavailable'}`;
        tooltip.setLngLat(event.lngLat).setDOMContent(node).addTo(m); }
    });
    m.on('mouseout', () => { tooltip.remove(); hoveredNeighbourhood = null; latest.current.onHoverNeighbourhood?.(null); });
    m.on('click', (event) => {
      const p = latest.current;
      if (p.pickingHome) { p.onHomePick?.(event.lngLat.lat, event.lngLat.lng); return; }
      if (p.addingWorkplace) { p.onMapPick(event.lngLat.lat, event.lngLat.lng); return; }
      const contextLayers = [...loaded.current.values()].flatMap((x) => x.layers).filter(id => m.getLayer(id));
      const placeLayers = contextLayers.filter(id => id.includes('-places-'));
      const placeHits = placeLayers.length ? m.queryRenderedFeatures(event.point, {layers: placeLayers}) : [];
      // A neighbouring venue's label can cross a dot. Actual marker hits take
      // precedence, with nearest projected centre resolving overlapping circles.
      const dotHits=placeHits.filter(feature=>feature.layer.type==='circle'&&feature.geometry.type==='Point');
      dotHits.sort((a,b)=>{
        const distance=(feature:maplibregl.MapGeoJSONFeature)=>feature.geometry.type==='Point'?m.project(feature.geometry.coordinates.slice(0,2) as [number,number]).dist(event.point):Infinity;
        return distance(a)-distance(b);
      });
      const place = dotHits[0] ?? placeHits[0];
      if (place) {
        tooltip.remove();
        p.onInspectContext?.();
        if (place.properties.cluster) { void expandPlaceCluster(m, place); return; }
        const node = placePopup(place);
        if (node) { openPopup(m,event,node); return; }
      }
      const eventLayers = contextLayers.filter(id => /context-(crime|collisions)-(points|point-count|clusters|cluster-count)$/.test(id));
      const detail = eventLayers.length ? m.queryRenderedFeatures(event.point, {layers: eventLayers})[0] : undefined;
      if (detail) {
        tooltip.remove(); const kind = detail.layer.id.startsWith('context-crime-') ? 'crime' : 'collisions';
        p.onInspectContext?.(); openPopup(m,event,eventPopup(kind, detail.properties)); return;
      }
      const pointLayers = contextLayers.filter(id => ['circle', 'symbol', 'line'].includes(m.getLayer(id)?.type ?? '') && !id.includes('context-air-'));
      const point = pointLayers.length ? m.queryRenderedFeatures(event.point, { layers: pointLayers })[0] : undefined;
      if (point) {
        p.onInspectContext?.();
        const node = document.createElement('div'); node.textContent = contextText(point.layer.id, point.properties);
        openPopup(m,event,node); return;
      }
      const hit = m.getLayer('matching-fill') ? m.queryRenderedFeatures(event.point, { layers: ['matching-fill'] })[0] : undefined;
      if (hit?.properties?.h3) { p.onSelectCell(String(hit.properties.h3)); return; }
      const ctxLayers = [...loaded.current.values()].flatMap((x) => x.layers).filter((id) => m.getLayer(id)?.type === 'fill');
      const ctx = ctxLayers.length ? m.queryRenderedFeatures(event.point, { layers: ctxLayers })[0] : undefined;
      if (ctx) {
        p.onInspectContext?.();
        const isEvent = /^context-(crime|collisions)-/.test(ctx.layer.id);
        const node = isEvent ? eventPopup(ctx.layer.id.startsWith('context-crime-') ? 'crime' : 'collisions', ctx.properties) : document.createElement('div');
        if (!isEvent) node.textContent = contextText(ctx.layer.id, ctx.properties, latest.current.airScale);
        openPopup(m,event,node); return;
      }
      const building = m.getLayer('real-buildings') ? m.queryRenderedFeatures(event.point, { layers: ['real-buildings'] })[0] : undefined;
      if (building) {
        p.onInspectContext?.();
        const node = document.createElement('div'); node.textContent = `OSM building · approximate rendered height ${building.properties.render_height} m. May be inferred from storeys; not a surveyed height or a match rating.`;
        openPopup(m,event,node); return;
      }
      const neighbourhood = m.getLayer('coverage-land') ? m.queryRenderedFeatures(event.point, { layers: ['coverage-land'] })[0] : undefined;
      if (neighbourhood?.properties?.id && p.matchingActive) p.onSelect(String(neighbourhood.properties.id));
    });
    const onKey = (event: KeyboardEvent) => {
      const p = latest.current;
      if ((event.key === 'Enter' || event.key === ' ') && (p.addingWorkplace || p.pickingHome)) {
        event.preventDefault(); const centre = m.getCenter();
        if (p.pickingHome) p.onHomePick?.(centre.lat, centre.lng); else p.onMapPick(centre.lat, centre.lng);
      }
    };
    m.getCanvas().addEventListener('keydown', onKey);
    m.getCanvas().setAttribute('aria-label', 'Interactive map. Use arrow keys to move, plus and minus to zoom. When placing a pin, press Enter to choose the centre.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12000);
    fetch(STYLE_URL, { signal: controller.signal }).then((r) => { if (!r.ok) throw new Error('Basemap unavailable'); return r.json() as Promise<StyleSpecification>; })
      .then((style) => {
        // Positron shield refs can be absent. Preserve their original exclusion
        // while avoiding a numeric-comparison warning for a null ref length.
        for (const layer of style.layers) {
          if (layer.id !== 'highway-shield-us-interstate' && layer.id !== 'highway-shield-non-us') continue;
          if (!('filter' in layer) || !Array.isArray(layer.filter)) continue;
          const comparison = layer.filter[1];
          if (Array.isArray(comparison) && comparison[0] === '<=' && comparison[2] === 6
            && Array.isArray(comparison[1]) && comparison[1][0] === 'get' && comparison[1][1] === 'ref_length') {
            comparison[1] = ['coalesce', ['get', 'ref_length'], 999];
          }
        }
        if (!disposed) { setBaseError(''); m.setStyle(style); }
      })
      .catch(() => { if (!disposed) { setBaseError('Street tiles could not load. Matching locations and pins remain available.'); setStyleLoading(false); } })
      .finally(() => window.clearTimeout(timeout));
    const resize = new ResizeObserver(() => m.resize()); resize.observe(el.current);
    const app = el.current.closest('.app');
    const panelChange = new MutationObserver(() => {
      if (!m.getLayer('matching-fill') || window.innerWidth < 1100) return;
      const padding = framePadding(m);
      // Preserve the viewed location while shifting the vanishing point between
      // the two panel edges. No fit or zoom reset on a panel collapse.
      m.easeTo({center:m.getCenter(),padding,duration:0});
    });
    if (app) panelChange.observe(app, {attributes:true,attributeFilter:['class']});
    return () => { disposed = true; terrainGeneration.current += 1; controller.abort(); window.clearTimeout(timeout); resize.disconnect(); panelChange.disconnect(); removeRightDrag(); tooltip.remove(); activePopup.current?.remove(); markers.current.forEach((x) => x.remove()); markers.current = []; m.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m?.getSource('matching')) return;
    const features = matchingFeatures(props.cells, props.cellResults, props.matchingActive, props.selectedId, props.selectedCellId);
    setGeo(m, 'matching', features);
    setGeo(m, 'neighbourhoods', neighbourhoodFeatures(props.neighbourhoods, props.results, props.matchingActive, props.selectedId));
    const fillContext = ['topography', 'crime', 'parks', 'collisions', 'air', 'nightlife'].some((id) => props.visibleLayers.has(id));
    m.setPaintProperty('matching-fill', 'fill-opacity', ['case', ['boolean', ['feature-state', 'hover'], false], 0.8, fillContext ? 0.24 : 0.48]);
    if (el.current) { el.current.dataset.eligibleCount = String(features.features.filter((f) => f.properties?.state !== 'unknown').length);
      el.current.dataset.visibleCellCount = String(features.features.length);
      el.current.dataset.excludedVisible = String(features.features.filter((f) => f.properties?.state === 'excluded').length); }
  }, [ready, props.cells, props.cellResults, props.results, props.matchingActive, props.selectedId, props.selectedCellId, props.visibleLayers]);

  const previousHover = useRef<string | null>(null);
  useEffect(() => {
    const m = map.current; if (!m?.getSource('neighbourhoods')) return;
    if (previousHover.current) m.setFeatureState({ source: 'neighbourhoods', id: previousHover.current }, { hover: false });
    if (props.hoveredNeighbourhoodId) m.setFeatureState({ source: 'neighbourhoods', id: props.hoveredNeighbourhoodId }, { hover: true });
    previousHover.current = props.hoveredNeighbourhoodId ?? null;
  }, [ready, props.hoveredNeighbourhoodId]);

  useEffect(() => {
    const m = map.current; if (!m?.getSource('commutes')) return;
    setGeo(m, 'commutes', commuteFeatures(props.areas, props.workplaces));
    setGeo(m, 'overlap', { type: 'FeatureCollection', features: props.overlap ? [{ type: 'Feature', properties: {}, geometry: props.overlap }] : [] });
  }, [ready, props.areas, props.overlap, props.workplaces]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    markers.current.forEach((pin) => pin.remove()); markers.current = [];
    props.workplaces.forEach((w, i) => {
      const node = document.createElement('button'); node.type = 'button'; node.className = 'cg-destination-pin';
      node.style.setProperty('--pin-colour', w.colour ?? WORKPLACE_COLORS[i % WORKPLACE_COLORS.length]);
      node.textContent = String(i + 1); node.title = `${w.name}. Drag to move the destination.`;
      node.setAttribute('aria-label', `${w.name}, destination ${i + 1}. Drag to move.`);
      const marker = new maplibregl.Marker({ element: node, draggable: true }).setLngLat([w.lon, w.lat]).addTo(m);
      marker.on('dragend', () => { const ll = marker.getLngLat(); latest.current.onMoveWorkplace(w.id, ll.lat, ll.lng); });
      node.addEventListener('click', (e) => { e.stopPropagation(); m.easeTo({ center: [w.lon, w.lat], zoom: Math.max(14, m.getZoom()), duration: reducedMotion() ? 0 : 500 }); });
      markers.current.push(marker);
    });
    props.homes?.forEach((h) => {
      const node = document.createElement('button'); node.type = 'button'; node.className = `cg-home-pin${props.selectedHomeId === h.id ? ' selected' : ''}`;
      node.textContent = '⌂'; node.title = h.name; node.setAttribute('aria-label', `Home: ${h.name}`);
      node.addEventListener('click', (e) => { e.stopPropagation(); latest.current.onSelectHome?.(h.id); });
      const marker = new maplibregl.Marker({ element: node, draggable: Boolean(props.onMoveHome) }).setLngLat([h.lon, h.lat]).addTo(m);
      marker.on('dragend', () => { const ll = marker.getLngLat(); latest.current.onMoveHome?.(h.id, ll.lat, ll.lng); });
      markers.current.push(marker);
    });
  }, [props.workplaces, props.homes, props.selectedHomeId]);

  useEffect(() => {
    const m = map.current; if (!m?.getLayer('matching-fill')) return;
    for (const id of ['crime', 'topography', 'cycling', 'transit', 'parks', 'groceries', 'collisions', 'air', 'nightlife', 'food', 'character']) {
      const present = loaded.current.get(id);
      if (present) present.layers.forEach((key) => { if (m.getLayer(key)) m.setLayoutProperty(key, 'visibility', props.visibleLayers.has(id) ? 'visible' : 'none'); });
      else if (props.visibleLayers.has(id) && !loading.current.has(id) && !layerErrors[id]) {
        loading.current.add(id);
        const generation = styleGeneration.current;
        const current = () => map.current === m && styleGeneration.current === generation;
        const filters = id === 'crime' || id === 'collisions' ? (latest.current.eventFilters ?? DEFAULT_EVENT_FILTERS)[id] : undefined;
        addContext(m, id, current, filters).then((value) => {
          if (!current()) return;
          loaded.current.set(id, value);
          if (el.current) el.current.dataset.contextLoaded = [...loaded.current.keys()].join(',');
          value.layers.forEach((key) => { if (m.getLayer(key)) m.setLayoutProperty(key, 'visibility', latest.current.visibleLayers.has(id) ? 'visible' : 'none'); });
          if ((id === 'crime' || id === 'collisions') && latest.current.visibleLayers.has(id)) updateEventContext(m, id, (latest.current.eventFilters ?? DEFAULT_EVENT_FILTERS)[id]);
          if(id==='air' && m.getLayer('context-air-tracts-0')) m.setPaintProperty('context-air-tracts-0','fill-color',airColour(latest.current.airScale));
        }).catch(() => { if (current()) setLayerErrors((e) => ({ ...e, [id]: 'This context layer could not load.' })); })
          .finally(() => { if (current()) loading.current.delete(id); });
      }
    }
  }, [ready, props.visibleLayers, layerAttempt, layerErrors]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    activePopup.current?.remove(); activePopup.current=null;
    for (const kind of ['crime', 'collisions'] as const) if (props.visibleLayers.has(kind)) updateEventContext(m, kind, (props.eventFilters ?? DEFAULT_EVENT_FILTERS)[kind]);
  }, [ready, props.eventFilters, props.visibleLayers]);

  useEffect(()=>{
    const m=map.current;
    if(m?.getLayer('context-air-tracts-0'))m.setPaintProperty('context-air-tracts-0','fill-color',airColour(props.airScale));
    activePopup.current?.remove(); activePopup.current=null;
  },[props.airScale]);

  useEffect(() => {
    const m = map.current; if (!m) return;
    const enabled = props.mapMode === 'explore';
    if (props.mapMode) { setIs3D(enabled); changeTilt(enabled); }
  }, [props.mapMode]);

  useEffect(() => {
    const m = map.current; if (!m?.getStyle()) return;
    if (m.getLayer('real-buildings')) m.setLayoutProperty('real-buildings', 'visibility', is3D ? 'visible' : 'none');
    // One tile zoom across this bounded, non-horizon view prevents rectangular
    // heightless parent tiles. Normal-scale geometry; no fabricated z13 heights.
    if (m.getSource('openmaptiles')) m.setSourceTileLodParams(is3D ? 1 : 3, is3D ? 8 : 3, 'openmaptiles');
    m.setMaxPitch(is3D ? 50 : 60);
  }, [ready, is3D]);

  useEffect(() => {
    const m = map.current;
    if (!m || !props.transportAnimation || !props.visibleLayers.has('transit')) return;
    let current = true; let cleanup: (() => void) | undefined;
    void createTransportAnimation(m, () => current).then(stop => { if (current) cleanup = stop; else stop(); }).catch(() => { if (current) setLayerErrors(e => ({...e, transit: 'Example vehicles could not load. Retry the public transport layer.'})); });
    return () => { current = false; cleanup?.(); };
  }, [ready, props.transportAnimation, props.visibleLayers.has('transit')]);

  useEffect(() => {
    if (terrainWanted.current) void enableTerrain();
  }, [ready]);

  useEffect(() => {
    const m = map.current; if (!m || props.selectedCellId || !props.selectedId) return;
    const feature = props.neighbourhoods.features.find((f) => f.properties.id === props.selectedId);
    const bounds = feature && geometryBounds(feature.geometry);
    if (bounds) m.fitBounds(bounds as LngLatBoundsLike, { padding: framePadding(m, 48), absolutePadding: true, maxZoom: 15.3, duration: reducedMotion() ? 0 : 600 });
  }, [props.selectedId]);

  useEffect(() => {
    const m = map.current; if (!m || !props.selectedCellId) return;
    const feature = props.cells.features.find((f) => f.properties.h3 === props.selectedCellId);
    const bounds = feature && geometryBounds(feature.geometry);
    if (bounds) m.fitBounds(bounds as LngLatBoundsLike, { padding: framePadding(m, 40), absolutePadding: true, maxZoom: 16, duration: reducedMotion() ? 0 : 500 });
  }, [props.selectedCellId]);

  useEffect(() => {
    const m = map.current, w = props.workplaces.find((x) => x.id === props.focusWorkplaceId);
    if (m && w) m.easeTo({ center: [w.lon, w.lat], zoom: 15, padding: framePadding(m), duration: reducedMotion() ? 0 : 500 });
  }, [props.focusWorkplaceId]);

  useEffect(() => {
    const m = map.current, h = props.homes?.find((x) => x.id === props.selectedHomeId);
    if (m && h) m.easeTo({ center: [h.lon, h.lat], zoom: 16, padding: framePadding(m), duration: reducedMotion() ? 0 : 500 });
  }, [props.selectedHomeId]);

  async function enableTerrain() {
    const m = map.current; if (!m || !terrainWanted.current) return;
    const generation = ++terrainGeneration.current;
    setTerrainBusy(true);
    try {
      const meta = await loadData<{ bounds: [number, number, number, number]; minzoom: number; maxzoom: number; tiles: string[]; encoding: 'terrarium'; tileSize: number; attribution: string }>('regional_terrain.json');
      if (map.current !== m || !terrainWanted.current || generation !== terrainGeneration.current) return;
      if (meta.encoding !== 'terrarium' || meta.tileSize !== 512 || meta.minzoom !== 0 || meta.maxzoom !== 12) throw new Error('Unexpected terrain encoding');
      if (!m.getSource('terrain')) m.addSource('terrain', { type: 'raster-dem', tiles: meta.tiles,
        tileSize: meta.tileSize, minzoom: meta.minzoom, maxzoom: meta.maxzoom, bounds: meta.bounds, encoding: meta.encoding, attribution: meta.attribution });
      m.setTerrain({ source: 'terrain', exaggeration: 1 }); setTerrain(true);
      setLayerErrors((e) => { const copy = { ...e }; delete copy.terrain; return copy; });
    } catch { if (generation === terrainGeneration.current) setLayerErrors((e) => ({ ...e, terrain: 'Terrain could not load. Continue with the flat map or retry.' })); }
    finally { if (generation === terrainGeneration.current) setTerrainBusy(false); }
  }
  const toggleTerrain = () => {
    const m = map.current; if (!m) return;
    if (terrainWanted.current && (terrain || terrainBusy)) {
      terrainWanted.current = false; terrainGeneration.current += 1; m.setTerrain(null); setTerrain(false); setTerrainBusy(false);
      setLayerErrors(e => { const next = { ...e }; delete next.terrain; return next; });
    } else { terrainWanted.current = true; changeTilt(true); void enableTerrain(); }
  };

  const picking = props.addingWorkplace || props.pickingHome;
  return <>
    <div ref={el} className={`map${picking ? ' picking' : ''}`} aria-label="Map of San Francisco and northern Peninsula matching locations"
      data-renderer="maplibre" data-selection-id={props.selectedCellId ?? props.selectedId ?? props.selectedHomeId ?? ''} data-3d={is3D} data-terrain={terrain} data-tilted={tilted} />
    <div className="map-navigation" aria-label="Map view controls">
      <button className={is3D ? 'active' : ''} type="button" aria-label="3D buildings" title="Show approximate building heights" aria-pressed={is3D} onClick={() => { setIs3D(value => !value); if (!is3D) changeTilt(true); }}>3D</button>
      <button className={terrain ? 'active' : ''} type="button" aria-label="Terrain" title="Show regional terrain at normal scale" aria-pressed={terrain} disabled={styleLoading} onClick={toggleTerrain}>{terrainBusy ? '…' : '△'}</button>
      <button className={tilted ? 'active' : ''} type="button" aria-label="Map tilt" title="Toggle tilted or overhead view" aria-pressed={tilted} onClick={() => changeTilt(!tilted)}>Tilt</button>
      <button type="button" aria-label="Reset north" title="Reset north" onClick={() => map.current?.easeTo({ bearing: 0, duration: reducedMotion() ? 0 : 400 })}>N ↑</button>
      <button type="button" aria-label="Rotate map clockwise" title="Rotate clockwise by 30 degrees" onClick={() => { const m = map.current; if (m) m.easeTo({ bearing: m.getBearing() + 30, duration: reducedMotion() ? 0 : 400 }); }}>↻</button>
      <button type="button" aria-label="Fit locations" title="Fit all matching locations and destinations" onClick={fit}>⛶</button>
    </div>
    {navigationHint && <div className="map-navigation-hint"><span>Right-drag up to zoom in around your starting point. Tilt and ↻ rotate the view.</span><button type="button" aria-label="Dismiss navigation hint" onClick={() => { setNavigationHint(false); try { sessionStorage.setItem('cg:navigation-hint', 'dismissed'); } catch { /* session storage optional */ } }}>×</button></div>}
    {(is3D || terrain) && <div className="map-3d-note">{is3D && zoom < 14.5 ? 'Buildings fade in from zoom 14. ' : ''}{is3D ? 'Approximate OSM heights · tilt limited to 50° for coherent detail. ' : ''}{terrain ? 'Regional terrain at normal scale. ' : ''}Housing analysis remains SF to SFO.</div>}
    {baseError && <div className="map-service-warning" role="status">{baseError}<button type="button" onClick={() => { setBaseError(''); map.current?.setStyle(STYLE_URL); }}>Retry tiles</button></div>}
    {Object.entries(layerErrors).filter(([id]) => id === 'terrain' || props.visibleLayers.has(id)).map(([id, message]) => <div key={id} className="map-layer-error" role="alert">{message}<button type="button" onClick={() => { setLayerErrors((errors) => { const next = { ...errors }; delete next[id]; return next; }); setLayerAttempt((n) => n + 1); if (id === 'terrain') { terrainWanted.current = true; void enableTerrain(); } }}>Retry layer</button></div>)}
  </>;
}
