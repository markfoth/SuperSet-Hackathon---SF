import { Marker, type Map as GLMap } from 'maplibre-gl';
import type { FeatureCollection, Position } from 'geojson';
import { loadData } from '../lib/data';

const radians = Math.PI / 180;
export function segmentLength(a: Position, b: Position) {
  const lat = (a[1] + b[1]) / 2 * radians;
  return Math.hypot((b[0] - a[0]) * Math.cos(lat), b[1] - a[1]) * 111195;
}
/** Split disconnected geometry; never draw a straight connector across missing segments. */
export function continuousSegments(points: Position[], maxGapM = 1500): Position[][] {
  const output: Position[][] = []; let segment: Position[] = [];
  for (const point of points) {
    if (segment.length && segmentLength(segment[segment.length - 1], point) > maxGapM) { if (segment.length > 1) output.push(segment); segment = []; }
    segment.push(point);
  }
  if (segment.length > 1) output.push(segment);
  return output;
}
export function routePosition(points: Position[], distance: number) {
  let remaining = distance;
  for (let i = 1; i < points.length; i++) {
    const length = segmentLength(points[i - 1], points[i]);
    if (length > 0 && remaining <= length) {
      const a = points[i - 1], b = points[i], t = remaining / length;
      const bearing = Math.atan2((b[0] - a[0]) * Math.cos(a[1] * radians), b[1] - a[1]) / radians;
      return { position: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as [number, number], bearing };
    }
    remaining -= length;
  }
  return { position: points[points.length - 1].slice(0, 2) as [number, number], bearing: 0 };
}

export async function createTransportAnimation(map: GLMap, isCurrent: () => boolean) {
  const routes = await loadData<FeatureCollection>('transport_examples.geojson');
  if (!isCurrent()) return () => {};
  const vehicles: { marker: Marker; points: Position[]; length: number; distance: number; speed: number }[] = [];
  for (const kind of ['bus', 'rail']) {
    // Historic route geometry, including any rail tunnel sections; never live positions.
    const candidates = routes.features.filter(f => kind === 'bus' ? f.properties?.mode === 'bus' : f.properties?.mode === 'muni_metro');
    const feature = candidates.find(f => kind === 'bus' ? f.properties?.short_name === '22' : f.properties?.short_name === 'N') ?? candidates[0];
    if (!feature) continue;
    const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [];
    const points = lines.flatMap(line => continuousSegments(line)).sort((a,b) => b.length - a.length)[0];
    if (!points) continue;
    const node = document.createElement('div'); node.className = `example-vehicle ${kind}`;
    node.setAttribute('role', 'img'); node.setAttribute('aria-label', `Illustrative ${kind}: ${feature.properties?.short_name}. Not live.`);
    node.title = `${feature.properties?.agency} ${feature.properties?.short_name}: illustrative ${kind}, not live`;
    node.innerHTML = kind === 'bus'
      ? '<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M7 3h10l3 5v18H4V8z" fill="currentColor" stroke="white" stroke-width="2"/><path d="M7 9h10v8H7z" fill="white"/><path d="M6 25v5m12-5v5" stroke="currentColor" stroke-width="3"/><circle cx="7" cy="22" r="1" fill="white"/><circle cx="17" cy="22" r="1" fill="white"/></svg>'
      : '<svg viewBox="0 0 24 32" aria-hidden="true"><rect x="3" y="2" width="18" height="24" rx="5" fill="currentColor" stroke="white" stroke-width="2"/><path d="M6 9h12v8H6z" fill="white"/><path d="m7 26-3 5m13-5 3 5M7 5h10" stroke="currentColor" stroke-width="2"/><circle cx="7" cy="22" r="1.4" fill="white"/><circle cx="17" cy="22" r="1.4" fill="white"/></svg>';
    const length = points.reduce((sum,p,i) => sum + (i ? segmentLength(points[i-1],p) : 0), 0);
    if (!(length > 0)) continue;
    const marker = new Marker({ element: node, rotationAlignment: 'map', pitchAlignment: 'map' }).setLngLat(points[0].slice(0,2) as [number,number]).addTo(map);
    vehicles.push({ marker, points, length, distance: length * 0.35, speed: kind === 'bus' ? 35 : 50 });
  }
  let frame = 0, previous = 0, disposed = false;
  const tick = (now: number) => {
    if (disposed) return;
    const seconds = previous ? Math.min((now-previous)/1000,0.1) : 0; previous = now;
    for (const v of vehicles) {
      v.distance += seconds * v.speed;
      // Reverse at the end, rather than teleporting to the other end of a route.
      const phase = v.distance % (2*v.length), reverse = phase > v.length;
      const position = routePosition(v.points, reverse ? 2*v.length-phase : phase);
      v.marker.setLngLat(position.position).setRotation(position.bearing + (reverse ? 180 : 0));
    }
    frame = requestAnimationFrame(tick);
  };
  const visibility = () => { cancelAnimationFrame(frame); previous=0; if (!document.hidden && !disposed) frame=requestAnimationFrame(tick); };
  document.addEventListener('visibilitychange',visibility); visibility();
  return () => { disposed=true; cancelAnimationFrame(frame); document.removeEventListener('visibilitychange',visibility); vehicles.forEach(v=>v.marker.remove()); };
}
