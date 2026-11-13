import { lazy, Suspense, useState } from 'react';
import type { MapProps } from './mapTypes';
import { MapLibreMap } from './MapLibreMap';
export { MATCH_COLORS, WORKPLACE_COLORS } from './mapData';

const CompatibilityMap = lazy(() => import('./LeafletMap').then((module) => ({ default: module.MapView })));

export function MapView(props: MapProps) {
  const [fallback, setFallback] = useState(false);
  if (fallback) return <Suspense fallback={<div className="map" role="status">Opening the 2D map…</div>}>
    <CompatibilityMap {...props} />
    <div className="map-fallback-notice" role="status">Your browser could not start 3D. All matching and pin placement remain available on this 2D map.</div>
  </Suspense>;
  return <MapLibreMap {...props} onWebGLFailure={() => setFallback(true)} />;
}
