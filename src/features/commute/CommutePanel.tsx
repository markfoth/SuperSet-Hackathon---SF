import { useState } from 'react';
import { COMMUTE_MINUTES, TRAVEL_MODES, type TravelMode, type Workplace } from '../../types';
import { PlaceSearch } from '../places/PlaceSearch';
import { DEFAULT_WORKPLACES, type CommuteResult } from './provider';

const COLOURS = ['#e8590c', '#7048e8', '#0c8599', '#c2255c'];

interface Props {
  workplaces: Workplace[];
  results: Record<string, CommuteResult | undefined>;
  onChange: (id: string, patch: Partial<Workplace>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  adding: boolean;
  onReset: () => void;
  onAddPlace?: (place: { name: string; lat: number; lon: number }) => void;
  onFocus?: (id: string) => void;
  onRetry?: (id: string) => void;
}

function selectedPlace(w: Workplace): string {
  if (w.placeName) return w.placeName;
  const example = DEFAULT_WORKPLACES.find((place) => Math.abs(place.lat - w.lat) < 0.00001 && Math.abs(place.lon - w.lon) < 0.00001);
  return example?.name ?? 'Pinned location';
}

export function CommutePanel({ workplaces, results, onChange, onRemove, onAdd, adding, onReset, onAddPlace, onFocus, onRetry }: Props) {
  const [editingPlace, setEditingPlace] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [started, setStarted] = useState(false);
  const liveEnabled = import.meta.env.VITE_COMMUTE_PROVIDER === 'proxy';

  return (
    <section className="panel-section commute-section">
      <p className="eyebrow">YOUR EVERYDAY JOURNEYS</p>
      {workplaces.length ? <h2>Your destinations</h2> : <h1>Where do you need to get to?</h1>}
      {!workplaces.length && <p className="intro-copy">Start with work, study or somewhere you go often. Find a home that works for you, or everyone you live with.</p>}
      {workplaces.map((w, i) => {
        const res = results[w.id];
        return <div className="workplace" key={w.id}>
          <div className="workplace-head">
            <span className="wp-dot" style={{ background: w.colour || COLOURS[i % COLOURS.length] }}>{i + 1}</span>
            <label className="wp-label"><span>Destination label</span><input
              className="wp-name" value={w.name} aria-label="Destination label" maxLength={60}
              onChange={(e) => onChange(w.id, { name: e.target.value })}
            /></label>
            <button className="icon-btn" onClick={() => onRemove(w.id)} aria-label={`Remove ${w.name}`} title="Remove destination">×</button>
          </div>
          <div className="selected-place">
            <div><span className="field-caption">SELECTED PLACE</span><b>{selectedPlace(w)}</b>
              <small>{w.lat.toFixed(5)}° N, {Math.abs(w.lon).toFixed(5)}° W</small></div>
            <div className="row"><button className="btn link" onClick={() => onFocus?.(w.id)} disabled={!onFocus}>Show pin</button>
              <button className="btn link" aria-expanded={editingPlace === w.id} onClick={() => setEditingPlace(editingPlace === w.id ? null : w.id)}>Change place</button></div>
          </div>
          {editingPlace === w.id && <div className="change-place-search"><PlaceSearch onSelect={(place) => {
            onChange(w.id, { lat: place.lat, lon: place.lon, placeName: place.name }); setEditingPlace(null);
          }} /><p className="hint">Selecting a result changes this pin. Editing a label leaves its location unchanged.</p></div>}
          <div className="workplace-controls">
            <label>Travel by<select value={w.mode} onChange={(e) => onChange(w.id, { mode: e.target.value as TravelMode })} aria-label="Travel mode">
              {TRAVEL_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select></label>
            <label>One-way limit<select value={w.maxMinutes} onChange={(e) => onChange(w.id, { maxMinutes: Number(e.target.value) })} aria-label="Maximum commute">
              {[...new Set([...COMMUTE_MINUTES,w.maxMinutes])].sort((a,b)=>a-b).map((m) => <option key={m} value={m}>Max {m} min</option>)}
            </select></label>
          </div>
          <details className="journey-settings"><summary>Person, days &amp; arrival time</summary>
          <div className="household-person-row">
            <label>Person<input value={w.personName ?? `Person ${i + 1}`} maxLength={40} aria-label="Person name"
              onChange={(e) => onChange(w.id, { personName: e.target.value, personId: e.target.value.trim().toLowerCase() || w.id })} /></label>
            <label>Colour<select aria-label="Person colour" value={w.colour || COLOURS[i % COLOURS.length]} onChange={(e) => onChange(w.id, { colour: e.target.value })}>
              <option value={COLOURS[0]}>Terracotta</option><option value={COLOURS[1]}>Violet</option><option value={COLOURS[2]}>Teal</option><option value={COLOURS[3]}>Rose</option>
            </select></label>
          </div><div className="workplace-controls">
            <label>Days per week<select aria-label="Office days per week" value={w.officeDays ?? 3} onChange={(e) => onChange(w.id, { officeDays: Number(e.target.value) })}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((days) => <option key={days} value={days}>{days} {days === 1 ? 'day' : 'days'}</option>)}
            </select></label>
            <label>Arrive by<input type="time" aria-label="Arrival time" value={w.arrivalTime ?? '08:45'} disabled={!liveEnabled}
              onChange={(e) => onChange(w.id, { arrivalTime: e.target.value || '08:45' })} /></label>
          </div><p className="hint">{liveEnabled ? 'Next weekday in Pacific time. Office days inform cost and journey comparisons, not eligibility.' : 'Offline examples use a fixed 08:45 arrival. Live evaluation routing supports other arrival times.'}</p></details>
          {res === undefined && <p className="status" role="status">Calculating this commute…</p>}
          {res?.ok && <p className={`status ${res.area.source === 'fixture' ? 'warn' : ''}`} title={res.area.label}>
            {res.area.synthetic && !res.area.label.toLowerCase().includes('synthetic') ? 'Synthetic example · ' : ''}{res.area.label}
          </p>}
          {res && !res.ok && <div className="status error" role="status"><p>{res.reason}</p>{onRetry && <button className="btn" onClick={() => onRetry(w.id)}>Retry commute</button>}</div>}
        </div>;
      })}
      {!workplaces.length && !started && <button className="btn primary wide" onClick={() => setStarted(true)}>Add your destinations</button>}
      {((!workplaces.length && started) || showAdd) && onAddPlace && workplaces.length < 8 && <PlaceSearch onSelect={(place) => { onAddPlace(place); setShowAdd(false); }} />}
      <div className="commute-add-actions" hidden={!workplaces.length && !started}>
        {!!workplaces.length && !showAdd && <button className="btn" onClick={() => setShowAdd(true)} disabled={workplaces.length >= 8}>+ Add destination</button>}
        <button className={`btn ${adding ? 'primary' : ''}`} onClick={onAdd} disabled={workplaces.length >= 8} aria-pressed={adding}>
          {adding ? 'Cancel pin placement' : 'Place a pin on the map'}
        </button>
      </div>
      {adding && <p className="status">Click the map to place a destination. You can drag it to adjust.</p>}
      {!workplaces.length && <div className="example-prompt"><span>Just exploring?</span><button className="btn link" onClick={onReset}>Try the SF + SFO example ↗</button><small>Labelled offline estimates. No account needed.</small></div>}
      {!!workplaces.length && <><p className="hint commute-rule">Each matching location must meet every destination limit. Results test one representative point per map cell.</p><button className="btn link" onClick={onReset}>Reset to demo</button></>}
      {liveEnabled && <p className="hint service-terms">TravelTime Basic is for research, development and evaluation. Commercial use requires a separate licence.</p>}
    </section>
  );
}
