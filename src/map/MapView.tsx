import { useState } from 'react';
import type { MapProps } from './mapTypes';
import { MapLibreMap } from './MapLibreMap';
export { MATCH_COLORS, WORKPLACE_COLORS } from './mapData';

export function MapView(props: MapProps) {
  const [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  if (failed) return <div className="map map-unavailable" data-renderer="unavailable" data-eligible-count={props.matchingActive ? Object.values(props.cellResults).filter(r=>r.eligible).length : 0}>
    <section role="status"><h2>Map display unavailable</h2><p>This browser could not run WebGL. Your destinations, results and saved places are kept.</p><p>Use named places or precise coordinates in Your search. Results, home checks and comparison still work. Mouse pin placement, map layers and 3D navigation need WebGL.</p><button className="btn" onClick={()=>{setAttempt(n=>n+1);setFailed(false);props.onAvailabilityChange?.(true);}}>Retry map display</button></section>
  </div>;
  return <MapLibreMap key={attempt} {...props} onWebGLFailure={() => {setFailed(true);props.onAvailabilityChange?.(false);}} />;
}
