import { useId, useState } from 'react';
import { isCoveredLocation, loadPlaceIndex, searchPlaces, type LocalPlace, type PlaceIndex } from './search';

interface Props {
  onSelect: (place: LocalPlace) => void;
  actionLabel?: string;
  placeholder?: string;
  ariaLabel?: string;
}

export function PlaceSearch({ onSelect, actionLabel = 'Search places', placeholder = 'Station, neighbourhood or mapped place', ariaLabel = 'Search local places' }: Props) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<PlaceIndex | null>(null);
  const [results, setResults] = useState<LocalPlace[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [coordinates, setCoordinates] = useState(false);
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const choose = (place: LocalPlace) => { onSelect(place); setResults(null); setQuery(''); setError(''); };

  return <div className="place-search">
    <form className="place-search-form" onSubmit={async (event) => {
      event.preventDefault();
      if (query.trim().length < 2) { setError('Enter at least two characters.'); return; }
      setError(''); setLoading(true);
      try {
        const loaded = index ?? await loadPlaceIndex();
        setIndex(loaded); setResults(searchPlaces(loaded.places, query));
      } catch { setError('The local place index could not load. Try a map pin or precise coordinates.'); }
      finally { setLoading(false); }
    }}>
      <label htmlFor={`${id}-query`} className="sr-only">{ariaLabel}</label>
      <div className="search-input-row">
        <input id={`${id}-query`} value={query} placeholder={placeholder} maxLength={100}
          autoComplete="off" onChange={(event) => { setQuery(event.target.value); setResults(null); }} />
        <button className="btn primary" type="submit" disabled={loading}>{loading ? 'Searching…' : actionLabel}</button>
      </div>
    </form>
    <p className="hint search-coverage">Local named places from SF to SFO. For an exact address, place or drag a pin.</p>
    {results && <div className="place-search-results" aria-live="polite">
      {results.length === 0 && <p className="hint">No named place found. Try a nearby station or use a precise map pin.</p>}
      {results.map((place) => <button className="place-search-result" type="button" key={place.id} onClick={() => choose(place)}>
        <span><b>{place.name}</b><small>{place.kind}</small></span><span aria-hidden="true">↗</span>
      </button>)}
      {!!index?.unavailableSources.length && <p className="status warn">Some local sources could not load. Results are incomplete.</p>}
    </div>}
    <button type="button" className="btn link coordinate-toggle" aria-expanded={coordinates} onClick={() => setCoordinates(!coordinates)}>{coordinates ? 'Hide coordinates' : 'Use precise coordinates'}</button>
    {coordinates && <form className="coordinate-form" onSubmit={(event) => {
      event.preventDefault();
      const y = lat.trim() ? Number(lat) : NaN, x = lon.trim() ? Number(lon) : NaN;
      if (!isCoveredLocation(y, x)) { setError('Use coordinates within SF to SFO: 37.60–37.90° N, 122.62–122.25° W.'); return; }
      choose({ id: `pin:${y},${x}`, name: 'Pinned location', lat: y, lon: x, kind: 'Exact coordinate', source: 'Your pin' });
    }}>
      <label>Latitude<input value={lat} onChange={(event) => setLat(event.target.value)} inputMode="decimal" placeholder="37.7946" aria-label="Latitude" /></label>
      <label>Longitude<input value={lon} onChange={(event) => setLon(event.target.value)} inputMode="decimal" placeholder="-122.3999" aria-label="Longitude" /></label>
      <button className="btn" type="submit">Use coordinate</button>
    </form>}
    {error && <p role="alert" className="status error">{error}</p>}
  </div>;
}
