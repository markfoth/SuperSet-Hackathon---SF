import type { PreferenceLevel } from '../../types';
import { PREFERENCES } from './preferences';
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
}

export function PreferencePanel({ input, onChange }: Props) {
  return (
    <section className="panel-section">
      <h2>What matters to you?</h2>
      <p className="hint">“Nice” and “Important” change the ranking only. “Must” removes areas that fail — you’ll see how many first.</p>
      {PREFERENCES.map((p) => {
        const level = input.prefs[p.id] ?? 'off';
        const preview = level !== 'must' ? previewMustHave(input, p.id) : null;
        return (
          <div className="pref" key={p.id}>
            <div className="pref-label">{p.label}</div>
            <div className="segmented" role="radiogroup" aria-label={p.label}>
              {LEVELS.map((l) => (
                <button
                  key={l.id} role="radio" aria-checked={level === l.id}
                  className={level === l.id ? `on ${l.id}` : ''}
                  onClick={() => onChange(p.id, l.id)}
                  title={l.id === 'must' && preview ? mustText(p.mustHave.describe, preview) : undefined}
                >{l.label}</button>
              ))}
            </div>
            {level === 'must' && <p className="pref-note must">Must have: {p.mustHave.describe}.</p>}
            {level !== 'off' && level !== 'must' && preview && (
              <p className="pref-note">{mustText(p.mustHave.describe, preview)}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function mustText(describe: string, p: { excluded: number; eligibleNow: number; unchecked: number }) {
  const base = `Making this a must-have (${describe}) would exclude ${p.excluded} of the ${p.eligibleNow} currently eligible neighbourhoods.`;
  return p.unchecked ? `${base} ${p.unchecked} can’t be checked (no data) and would stay, flagged.` : base;
}
