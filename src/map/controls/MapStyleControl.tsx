import { useEffect, useRef, useState } from 'react';
import type { MapStyle } from '../basemap';

export function MapStyleControl({ value, busy, error, onChange }: { value: MapStyle; busy: boolean; error: string; onChange: (style: MapStyle) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); root.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <div className="map-style-control" ref={root}>
    <button className={`map-style-thumbnail ${value}`} title="Choose terrain or satellite map" aria-label={`Map style: ${value}. Choose map style`} aria-expanded={open} aria-controls="map-style-options" onClick={() => setOpen(!open)}><span>{busy ? 'Loading…' : value === 'terrain' ? 'Terrain' : 'Satellite'}</span></button>
    {open && <div id="map-style-options" className="map-style-options" role="group" aria-label="Map style">
      {(['terrain', 'satellite'] as const).map(style => <button key={style} className={`map-style-thumbnail ${style}`} aria-pressed={value === style} onClick={() => onChange(style)}><span>{style === 'terrain' ? 'Terrain' : 'Satellite'}</span></button>)}
      <small>{value === 'satellite' ? 'USGS / USDA aerial imagery. Dates vary, 2017–2021. Overzoomed above level 16.' : 'Street map, real terrain at normal scale and available OSM buildings.'}</small>
    </div>}
    {error && <div className="imagery-error" role="alert">{error}<button onClick={() => onChange(value)}>Retry imagery</button><button onClick={() => onChange('terrain')}>Use terrain</button></div>}
  </div>;
}
