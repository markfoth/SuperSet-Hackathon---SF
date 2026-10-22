import { COMMUTE_MINUTES, TRAVEL_MODES, type TravelMode, type Workplace } from '../../types';
import { WORKPLACE_COLORS } from '../../map/MapView';
import type { CommuteResult } from './provider';

interface Props {
  workplaces: Workplace[];
  results: Record<string, CommuteResult | undefined>;
  onChange: (id: string, patch: Partial<Workplace>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  adding: boolean;
  onReset: () => void;
}

export function CommutePanel({ workplaces, results, onChange, onRemove, onAdd, adding, onReset }: Props) {
  return (
    <section className="panel-section">
      <h2>Where do you commute to?</h2>
      <p className="hint">Areas are only suggested if most of the neighbourhood is within every commute.</p>
      {workplaces.map((w, i) => {
        const res = results[w.id];
        return (
          <div className="workplace" key={w.id}>
            <div className="workplace-head">
              <span className="wp-dot" style={{ background: WORKPLACE_COLORS[i % WORKPLACE_COLORS.length] }}>{i + 1}</span>
              <input
                className="wp-name" value={w.name} aria-label="Workplace name" maxLength={40}
                onChange={(e) => onChange(w.id, { name: e.target.value })}
              />
              <button className="icon-btn" onClick={() => onRemove(w.id)} aria-label={`Remove ${w.name}`} title="Remove">×</button>
            </div>
            <div className="workplace-controls">
              <select value={w.mode} onChange={(e) => onChange(w.id, { mode: e.target.value as TravelMode })} aria-label="Travel mode">
                {TRAVEL_MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select value={w.maxMinutes} onChange={(e) => onChange(w.id, { maxMinutes: Number(e.target.value) })} aria-label="Maximum commute">
                {COMMUTE_MINUTES.map((m) => <option key={m} value={m}>Max {m} min</option>)}
              </select>
            </div>
            {res === undefined && <p className="status">Calculating…</p>}
            {res?.ok && (
              <p className={`status ${res.area.synthetic ? 'warn' : ''}`} title={res.area.label}>
                {res.area.synthetic ? '⚠ ' : ''}{res.area.label}
              </p>
            )}
            {res && !res.ok && <p className="status error">⚠ {res.reason}</p>}
          </div>
        );
      })}
      <div className="row">
        <button className="btn" onClick={onAdd} disabled={workplaces.length >= 4}>
          {adding ? 'Click the map to place it…' : '+ Add workplace'}
        </button>
        <button className="btn link" onClick={onReset}>Reset to demo</button>
      </div>
    </section>
  );
}
