import { Point, type Map as GLMap, type LngLat } from 'maplibre-gl';

/** One tuning point: upward movement is positive zoom, 125 px per zoom level. */
export const RIGHT_DRAG_ZOOM = { direction: -1, zoomPerPixel: 0.008 } as const;
export function dragZoom(start: number, deltaY: number, min: number, max: number) {
  return Math.max(min, Math.min(max, start + deltaY * RIGHT_DRAG_ZOOM.direction * RIGHT_DRAG_ZOOM.zoomPerPixel));
}

/** Uses MapLibre's supported terrain-aware anchored-camera solver, without animation. */
export function installDesktopNavigation(map: GLMap) {
  const canvas = map.getCanvas();
  let active: { id: number; button: number; x: number; y: number; zoom: number; bearing: number; pitch: number; anchor: LngLat; point: Point } | null = null;
  map.dragRotate.disable();
  map.touchPitch.disable();
  map.scrollZoom.setZoomRate(1 / 100);
  const stop = () => {
    if (!active) return;
    const id = active.id; active = null;
    if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    canvas.style.removeProperty('cursor');
    canvas.dataset.rightDrag = 'false';
    canvas.dataset.middleDrag = 'false';
  };
  const down = (event: PointerEvent) => {
    if (![1, 2].includes(event.button) || event.pointerType !== 'mouse') return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (active) return;
    map.stop();
    const bounds = canvas.getBoundingClientRect();
    const point = new Point(event.clientX - bounds.left, event.clientY - bounds.top);
    const anchor = map.unproject(point);
    const projected = map.project(anchor);
    // No arbitrary sea-level anchor when the terrain ray cannot be picked reliably.
    if (![anchor.lng, anchor.lat, projected.x, projected.y].every(Number.isFinite) || Math.abs(anchor.lat) > 85 || projected.dist(point) > 3) return;
    // Near the horizon a ground pick can be many kilometres away. Refuse it
    // rather than replacing it with a centre pick and making the camera jump.
    if (map.project(map.getCenter()).dist(point) > 4 * Math.max(bounds.width, bounds.height)) return;
    active = { id: event.pointerId, button: event.button, x: event.clientX, y: event.clientY, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), anchor, point };
    canvas.setPointerCapture(event.pointerId); canvas.style.cursor = event.button === 1 ? 'grabbing' : 'ns-resize';
    canvas.dataset.rightDrag = String(event.button === 2); canvas.dataset.middleDrag = String(event.button === 1);
  };
  const move = (event: PointerEvent) => {
    if (!active || event.pointerId !== active.id) return;
    if (!(event.buttons & (active.button === 1 ? 4 : 2))) { stop(); return; }
    event.preventDefault(); event.stopImmediatePropagation();
    const orbit = active.button === 1;
    const zoom = orbit ? active.zoom : dragZoom(active.zoom, event.clientY - active.y, map.getMinZoom(), map.getMaxZoom());
    const bearing = orbit ? active.bearing + (event.clientX - active.x) * 0.35 : active.bearing;
    const pitch = orbit ? Math.max(0, Math.min(map.getMaxPitch(), active.pitch - (event.clientY - active.y) * 0.25)) : active.pitch;
    // The solver uses the current orientation. Apply it synchronously, then
    // restore the original screen anchor before the browser renders a frame.
    if (orbit) map.jumpTo({ bearing, pitch });
    // DEM centre elevation can change after the first camera update. Re-solve against
    // the original geographical anchor rather than accumulating a new pointer pick.
    for (let pass = 0; pass < 3; pass++) {
      const camera = map.calculateAnchoredCameraOptions({ anchorLocation: active.anchor, anchorScreenPoint: active.point, zoom });
      if (!camera.center || !Number.isFinite(camera.zoom)) { stop(); return; }
      map.jumpTo({ ...camera, bearing, pitch });
      if (map.project(active.anchor).dist(active.point) < 0.25) break;
    }
  };
  const mouse = (event: MouseEvent) => { if ([1, 2].includes(event.button)) { event.preventDefault(); event.stopImmediatePropagation(); } };
  const menu = (event: MouseEvent) => event.preventDefault();
  const up = (event: PointerEvent) => { if (active && event.pointerId === active.id) stop(); };
  canvas.addEventListener('pointerdown', down, true);
  canvas.addEventListener('mousedown', mouse, true);
  canvas.addEventListener('auxclick', mouse, true);
  canvas.addEventListener('contextmenu', menu);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', up, true);
  window.addEventListener('blur', stop);
  canvas.addEventListener('lostpointercapture', stop);
  return () => {
    stop(); canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('mousedown', mouse, true); canvas.removeEventListener('auxclick', mouse, true);
    canvas.removeEventListener('contextmenu', menu); window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true);
    window.removeEventListener('blur', stop); canvas.removeEventListener('lostpointercapture', stop);
  };
}
