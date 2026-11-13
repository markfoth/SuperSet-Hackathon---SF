import { useState } from 'react';
import type { PreferenceLevel, Workplace } from '../../types';
import { cellCommutes } from '../commute/eligibility';
import { getCommuteProvider, type CommuteResult } from '../commute/provider';
import { evaluate, ranked, summarize, type EvaluateInput } from './ranking';
import { orderedPreferences } from './preferences';

interface Preview { title: string; input: EvaluateInput; workplaces?: Workplace[]; }
export function TradeoffPanel({ input, workplaces, commute, onApply, onUndo }: {
  input: EvaluateInput; workplaces: Workplace[]; commute: Record<string, CommuteResult | undefined>;
  onUndo?: () => void;
  onApply: (prefs: Record<string, PreferenceLevel>, order: string[], workplaces?: Workplace[]) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const now = evaluate(input);
  const next = preview ? evaluate(preview.input) : null;
  const changed = next?.filter(r => r.eligible && !now.find(n => n.id === r.id)?.eligible).length ?? 0;
  const unknown = next?.filter(r => r.state === 'unknown').length ?? 0;
  const musts = orderedPreferences(input.priorityOrder).filter(p => input.prefs[p.id] === 'must');
  const noMatches = !now.some(result => result.eligible);
  const failures = workplaces.map(w => ({ label: `${w.personName || w.name}: ${w.maxMinutes}-minute limit`,
    count: now.filter(r => r.cell.residential !== false && r.commute.byWorkplace[w.id] === false).length }));
  const mustFailures = musts.map(p => ({ label: `${p.label} Must`, count: now.filter(r => r.cell.residential !== false && r.reasons.some(reason => reason.kind === 'mustHave' && reason.prefId === p.id)).length }));
  async function previewCommute(w: Workplace, increment = 15) {
    setLoading(true); setError(''); setPreview(null);
    const replacement = { ...w, maxMinutes: Math.min(60, w.maxMinutes + increment) };
    try {
      const result = await getCommuteProvider().getArea(replacement);
      if (!result.ok) throw new Error(result.reason);
      const list = workplaces.map(x => x.id === w.id ? replacement : x);
      setPreview({ title: `${w.personName || w.name}: allow ${replacement.maxMinutes} minutes`, workplaces: list,
        input: { ...input, commutes: cellCommutes(input.cells, list, { ...commute, [w.id]: result }) } });
    } catch (e) { setError(e instanceof Error ? e.message : 'Preview unavailable. Your settings have not changed.'); }
    finally { setLoading(false); }
  }
  return <details className="tradeoff-panel panel-section" onToggle={() => setPreview(null)}>
    <summary><span>Explore a compromise</span><span aria-hidden="true">↗</span></summary>
    <p className="hint">Preview a change before applying it to your search.</p>
    {noMatches && <div className="constraint-diagnosis"><p>Current checks across candidate residential land:</p><ul>{[...failures,...mustFailures].filter(f => f.count > 0).map(f => <li key={f.label}>{f.label}: {f.count} locations fail this condition.</li>)}</ul><p className="hint">{now.filter(r => r.state === 'unknown').length} locations have missing required evidence. Counts can overlap; one change may leave another condition unmet.</p></div>}
    {onUndo && <button className="btn" onClick={onUndo}>Undo last adjustment</button>}
    <div className="tradeoff-options">
      {musts.map(p => <button className="btn" disabled={loading} key={p.id} onClick={() => { setError(''); setPreview({ title: `${p.label}: Must to Important`, input: { ...input, prefs: { ...input.prefs, [p.id]: 'important' } } }); }}>Relax {p.label}</button>)}
      {workplaces.filter(w => w.maxMinutes < 60).flatMap(w => (import.meta.env.VITE_COMMUTE_PROVIDER === 'proxy' ? [5,10] : [15]).map(increment => <button className="btn" disabled={loading} key={w.id + increment} onClick={() => void previewCommute(w,increment)}>+{increment} min for {w.personName || w.name}</button>))}
      <button className="btn" disabled={loading} onClick={() => {
        const order = orderedPreferences(input.priorityOrder).map(p => p.id);
        [order[0], order[1]] = [order[1], order[0]];
        setError(''); setPreview({ title: 'Swap your first two priorities', input: { ...input, priorityOrder: order } });
      }}>Swap top priorities</button>
    </div>
    {loading && <p role="status">Checking the revised commute. Your current settings are unchanged.</p>}
    {error && <p role="alert" className="status error">Preview unavailable: {error}</p>}
    {preview && next && <div className="tradeoff-preview" role="status">
      <b>{preview.title}</b>
      <p>{now.filter(r => r.eligible).length} → {next.filter(r => r.eligible).length} matching locations. {changed} newly available; {unknown} remain unknown.</p>
      <p className="hint">Leading neighbourhoods: {ranked(summarize(preview.input, next)).slice(0, 3).map(r => r.name).join(', ') || 'none'}.</p>
      <p className="hint">{preview.workplaces ? 'A longer commute limit trades travel time for more choice. No exact journey times are implied.' : preview.title.includes('Must') ? 'This requirement becomes a preference. Newly available locations may fall short of it.' : 'Earlier measurement bands dominate later ones. Eligibility is unchanged.'}</p>
      <div className="row"><button className="btn primary" onClick={() => { onApply(preview.input.prefs, preview.input.priorityOrder, preview.workplaces); setPreview(null); }}>Apply this change</button><button className="btn" onClick={() => setPreview(null)}>Discard preview</button></div>
    </div>}
  </details>;
}
