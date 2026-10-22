import type { PreferenceLevel } from '../../types';
import { orderedPreferences } from './preferences';
import { previewMustHave, type EvaluateInput } from './ranking';
import { SectionInfo } from '../../components/SectionInfo';
import { preferenceSources } from '../../map/layers/datasetSources';

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
      <div className="section-heading"><h2>What matters to you?</h2><SectionInfo title="What matters to you?">
        <p>Nice and Important rank reachable cells. Must is required. Use the arrows to put your top priorities first.</p>
        <p>Earlier priorities are compared first, in broad measurement bands. Important uses finer bands than Nice. Missing values remain unavailable; a missing Must cannot become a confirmed match. There is no combined liveability score.</p>
        {ordered.map((p) => <section key={p.id} className="dataset-info"><h3>{p.label}</h3>
          <p>{p.source}. Measured as {p.resolution}. Must means {p.mustHave.describe}.</p>
          <p>{preferenceSources(p.id).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</p>
        </section>)}
        <p>Distances are straight-line estimates, not walking routes or verified entrances. Street grades are elevation-based estimates, not surveyed roads. Incident reports cover SF only and do not measure safety.</p>
      </SectionInfo></div>
      <p className="hint">Top priorities first. Must is required.</p>
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
            {level !== 'must' && preview && preview.eligibleNow > 0 && (
              <p className="pref-note">{mustText(preview)}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}

function mustText(p: { excluded: number; eligibleNow: number; unchecked: number; neighbourhoodsLost: number }) {
  const base = `Must: ${p.excluded}/${p.eligibleNow} eligible cells excluded · ${p.neighbourhoodsLost} area${p.neighbourhoodsLost === 1 ? '' : 's'} lose all matches.`;
  return p.unchecked ? `${base} ${p.unchecked} cells become unknown (no measurement).` : base;
}
