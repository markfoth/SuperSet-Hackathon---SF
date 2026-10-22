import type { PreferenceLevel } from '../../types';
import { orderedPreferences } from './preferences';
import { previewMustHave, type EvaluateInput } from './ranking';

const LEVELS: { id: PreferenceLevel; label: string }[] = [
  { id: 'off', label: 'Off' },
  { id: 'nice', label: 'Nice' },
  { id: 'important', label: 'Important' },
  { id: 'must', label: 'Must' },
];

interface Props {
  input: EvaluateInput;
  onChange: (id: string, level: PreferenceLevel) => void;
  onOrderChange: (ids: string[]) => void;
}

export function PreferencePanel({ input, onChange, onOrderChange }: Props) {
  const ordered = orderedPreferences(input.priorityOrder);
  const move = (index: number, delta: number) => {
    const ids = ordered.map((p) => p.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    onOrderChange(ids);
  };
  return (
    <section className="panel-section">
      <h2>What matters to you?</h2>
      <p className="hint">Top priorities first. “Nice” and “Important” rank eligible cells; “Must” is required. Use the arrows to change the order.</p>
      <details className="ranking-method"><summary>How priorities work</summary><p className="hint">Compare the first active preference in broad measurement bands, then the next. Important uses finer bands than Nice. Missing measurements are labelled unavailable and sorted after measured evidence. No combined liveability score.</p></details>
      {ordered.map((p, index) => {
        const level = input.prefs[p.id] ?? 'off';
        const preview = level !== 'must' ? previewMustHave(input, p.id) : null;
        return (
          <div className="pref" key={p.id}>
            <div className="pref-heading"><div className="pref-label"><span className="priority-number">{index + 1}</span> {p.label}</div>
              <div className="priority-controls">
                <button className="icon-btn" disabled={index === 0} aria-label={`Move ${p.label} up`} onClick={() => move(index, -1)}>↑</button>
                <button className="icon-btn" disabled={index === ordered.length - 1} aria-label={`Move ${p.label} down`} onClick={() => move(index, 1)}>↓</button>
              </div>
            </div>
            <div className="segmented" role="radiogroup" aria-label={p.label}>
              {LEVELS.map((l) => (
                <button
                  key={l.id} role="radio" aria-checked={level === l.id}
                  className={level === l.id ? `on ${l.id}` : ''}
                  onClick={() => onChange(p.id, l.id)}
                  title={l.id === 'must' && preview ? `${p.mustHave.describe}. ${mustText(preview)}` : undefined}
                >{l.label}</button>
              ))}
            </div>
            {level === 'must' && <p className="pref-note must">Must have: {p.mustHave.describe}.</p>}
            {level !== 'must' && preview && (
              <p className="pref-note">{mustText(preview)}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function mustText(p: { excluded: number; eligibleNow: number; unchecked: number; neighbourhoodsLost: number }) {
  const base = `Must: ${p.excluded}/${p.eligibleNow} eligible cells excluded · ${p.neighbourhoodsLost} neighbourhood${p.neighbourhoodsLost === 1 ? '' : 's'} lose all matches.`;
  return p.unchecked ? `${base} ${p.unchecked} cells become unknown (no measurement).` : base;
}
