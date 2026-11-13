import { useState } from 'react';
import type { PreferenceLevel, Workplace } from '../../types';
import { getCommuteProvider, type CommuteResult } from '../commute/provider';
import { ranked, type EvaluateInput } from './ranking';
import { evaluateRegion, type RegionalEvaluation } from '../../lib/candidates';
import { orderedPreferences } from './preferences';

interface Preview { title: string; prefs: EvaluateInput['prefs']; order: string[]; value: RegionalEvaluation; workplaces?: Workplace[]; }
export function TradeoffPanel({ input, current, busy, workplaces, commute, onApply, onUndo }: {
  input: EvaluateInput; workplaces: Workplace[]; commute: Record<string, CommuteResult | undefined>;
  current: RegionalEvaluation | null; busy: boolean;
  onUndo?: () => void;
  onApply: (prefs: Record<string, PreferenceLevel>, order: string[], workplaces?: Workplace[]) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const now = current?.results ?? [];
  const next = preview?.value.results ?? null;
  const currentlyEligible = new Set(now.filter(r=>r.eligible).map(r=>r.id));
  const changed = next?.filter(r => r.eligible && !currentlyEligible.has(r.id)).length ?? 0;
  const unknown = next?.filter(r => r.state === 'unknown').length ?? 0;
  const musts = orderedPreferences(input.priorityOrder).filter(p => input.prefs[p.id] === 'must');
  const noMatches = !now.some(result => result.eligible);
  const failures = workplaces.map(w => ({ label: `${w.personName || w.name}: ${w.maxMinutes}-minute limit`,
    count: now.filter(r => r.cell.residential !== false && r.commute.byWorkplace[w.id] === false).length }));
  const mustFailures = musts.map(p => ({ label: `${p.label} Must`, count: now.filter(r => r.cell.residential !== false && r.reasons.some(reason => reason.kind === 'mustHave' && reason.prefId === p.id)).length }));
  async function previewPreferences(title: string, prefs: EvaluateInput['prefs'], order: string[]) {
    setLoading(true); setError(''); setPreview(null);
    try {
      const value = await evaluateRegion({workplaces, commute, metrics:input.metrics, prefs, priorityOrder:order});
      setPreview({title,prefs,order,value});
    } catch { setError('Local analysis could not finish. Retry the preview.'); }
    finally { setLoading(false); }
  }
  async function previewCommute(w: Workplace, increment = 15) {
    setLoading(true); setError(''); setPreview(null);
    const replacement = { ...w, maxMinutes: Math.min(60, w.maxMinutes + increment) };
    try {
      const result = await getCommuteProvider().getArea(replacement);
      if (!result.ok) throw new Error(result.reason);
      const list = workplaces.map(x => x.id === w.id ? replacement : x);
      const value = await evaluateRegion({workplaces:list,commute:{...commute,[w.id]:result},metrics:input.metrics,prefs:input.prefs,priorityOrder:input.priorityOrder});
      setPreview({ title: `${w.personName || w.name}: allow ${replacement.maxMinutes} minutes`, workplaces: list,
        prefs:input.prefs,order:input.priorityOrder,value });
    } catch (e) { setError(e instanceof Error ? e.message : 'Preview unavailable. Your settings have not changed.'); }
    finally { setLoading(false); }
  }
  return <details className="tradeoff-panel panel-section" onToggle={event => {if(!event.currentTarget.open)setPreview(null);}}>
    <summary><span>Explore a compromise</span><span aria-hidden="true">↗</span></summary>
    <p className="hint">Preview a change before applying it to your search.</p>
    {busy && <p role="status">Checking your current settings before previewing a change.</p>}
    {!busy && noMatches && <div className="constraint-diagnosis"><p>Current checks across candidate residential land:</p><ul>{[...failures,...mustFailures].filter(f => f.count > 0).map(f => <li key={f.label}>{f.label}: {f.count} locations fail this condition.</li>)}</ul><p className="hint">{now.filter(r => r.unchecked.length > 0).length} locations have missing required evidence. Counts can overlap; one change may leave another condition unmet.</p></div>}
    {onUndo && <button className="btn" onClick={onUndo}>Undo last adjustment</button>}
    <div className="tradeoff-options">
      {musts.map(p => <button className="btn" disabled={loading || busy} key={p.id} onClick={() => void previewPreferences(`${p.label}: Must to Important`,{...input.prefs,[p.id]:'important'},input.priorityOrder)}>Relax {p.label}</button>)}
      {workplaces.filter(w => w.maxMinutes < 60).flatMap(w => (import.meta.env.VITE_COMMUTE_PROVIDER === 'proxy' ? [5,10] : [15]).filter(increment => w.maxMinutes + increment <= 60).map(increment => <button className="btn" disabled={loading || busy} key={w.id + increment} onClick={() => void previewCommute(w,increment)}>+{increment} min for {w.personName || w.name}</button>))}
      <button className="btn" disabled={loading || busy} onClick={() => {
        const order = orderedPreferences(input.priorityOrder).map(p => p.id);
        [order[0], order[1]] = [order[1], order[0]];
        void previewPreferences('Swap your first two priorities',input.prefs,order);
      }}>Swap top priorities</button>
    </div>
    {loading && <p role="status">Checking the revised commute. Your current settings are unchanged.</p>}
    {error && <p role="alert" className="status error">Preview unavailable: {error}</p>}
    {preview && next && <div className="tradeoff-preview" role="status">
      <b>{preview.title}</b>
      <p>{now.filter(r => r.eligible).length} → {next.filter(r => r.eligible).length} matching locations. {changed} newly available; {unknown} remain unknown.</p>
      <p className="hint">Leading areas: {ranked(preview.value.areas).slice(0, 3).map(r => r.name).join(', ') || 'none'}.</p>
      <p className="hint">{preview.workplaces ? 'A longer commute limit trades travel time for more choice. No exact journey times are implied.' : preview.title.includes('Must') ? 'This requirement becomes a preference. Newly available locations may fall short of it.' : 'Earlier measurement bands dominate later ones. Eligibility is unchanged.'}</p>
      <div className="row"><button className="btn primary" onClick={() => { onApply(preview.prefs, preview.order, preview.workplaces); setPreview(null); }}>Apply this change</button><button className="btn" onClick={() => setPreview(null)}>Discard preview</button></div>
    </div>}
  </details>;
}
