import { useRef, useState } from 'react';
import { Dialog } from './Dialog';
import { loadScenarios, makeScenario, makeShareLink, parseScenarioFile, saveScenarios, scenarioFile, type SavedScenario, type ScenarioSnapshot } from './model';
import './scenarios.css';

function download(scenario: SavedScenario) {
  const text = JSON.stringify(scenarioFile(scenario), null, 2);
  // Never generate an export that this application would reject on re-import.
  parseScenarioFile(text);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = `common-ground-${scenario.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60) || 'scenario'}.json`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ScenarioPanel({ snapshot, onLoad, onClose }: { snapshot: ScenarioSnapshot; onLoad: (snapshot: ScenarioSnapshot) => void; onClose: () => void }) {
  const [initial] = useState(() => loadScenarios());
  const [scenarios, setScenarios] = useState(initial.value);
  const [name, setName] = useState('Our next chapter'), [notes, setNotes] = useState('');
  const [message, setMessage] = useState<string | null>(initial.error), [error, setError] = useState<string | null>(null);
  const [includePrecise, setIncludePrecise] = useState(false), [shareLink, setShareLink] = useState('');
  const [imported, setImported] = useState<SavedScenario | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = () => makeScenario(name, notes, snapshot);
  const persist = (next: SavedScenario[]) => {
    if (next.length > 50) throw new Error('This device already has 50 scenarios. Export and remove one before saving another.');
    const failure = saveScenarios(next);
    setScenarios(next); setError(failure); setMessage(failure ? null : 'Saved on this device. Export a copy for another browser.');
  };
  const perform = (action: () => void) => {
    try { setError(null); action(); } catch (e) { setError(e instanceof Error ? e.message : 'This action could not be completed.'); }
  };
  return <Dialog title="Your scenarios" onClose={onClose} className="scenario-dialog">
    <p className="decision-intro">Keep the possibilities, and the thinking behind them.</p>
    <p className="hint">Scenarios stay in this browser. A portable file or share link lets your household review a copy. Changes are not synchronised.</p>
    <form className="scenario-form" onSubmit={(event) => { event.preventDefault(); perform(() => { persist([current(), ...scenarios]); }); }}>
      <label>Scenario name<input value={name} onChange={(event) => { setName(event.target.value); setShareLink(''); }} required maxLength={160} placeholder="e.g. Three office days, near a park" /></label>
      <label>Household notes<textarea aria-label="Household notes" value={notes} onChange={(event) => { setNotes(event.target.value); setShareLink(''); }} maxLength={5000} rows={2} placeholder="What would make this work for everyone?" /></label>
      <div className="scenario-snapshot"><span>{snapshot.workplaces.length} destinations</span><span>{snapshot.shortlist.length} neighbourhoods</span><span>{snapshot.bookmarks.length} bookmarks</span><span>{snapshot.homes.length} homes</span></div>
      <div className="decision-actions"><button className="btn primary" type="submit">Save scenario</button><button className="btn" type="button" onClick={() => perform(() => download(current()))}>Export JSON</button><button className="btn" type="button" onClick={() => fileInput.current?.click()}>Import JSON</button></div>
      <p className="hint">Exported files include your destinations, homes and notes. Share them with people you trust.</p>
    </form>
    <input ref={fileInput} className="visually-hidden" tabIndex={-1} type="file" accept="application/json,.json" aria-label="Import scenario file" onChange={async (event) => {
      const file = event.target.files?.[0]; event.target.value = '';
      if (!file) return;
      try {
        if (file.size > 500_000) throw new Error('Scenario file is too large (maximum 500 KB).');
        const parsed = parseScenarioFile(await file.text()); setImported(parsed.scenario); setError(null);
        setMessage(parsed.includesPreciseLocations ? 'File checked. It contains precise locations. Review and choose whether to use it.' : 'File checked. Destinations and homes have been left out for privacy.');
      } catch (e) { setError(e instanceof Error ? e.message : 'Could not read this file.'); }
    }} />
    {imported && <div className="scenario-import"><b>{imported.name}</b><p>{imported.notes || 'No household notes.'}</p><div className="decision-actions"><button className="btn primary" onClick={() => { onLoad(imported.snapshot); onClose(); }}>Use imported scenario</button><button className="btn" onClick={() => perform(() => { persist([{ ...imported, id: crypto.randomUUID() }, ...scenarios]); setImported(null); })}>Save a copy</button><button className="btn link" onClick={() => setImported(null)}>Dismiss</button></div></div>}
    <section className="scenario-share" aria-label="Share scenario">
      <h3>Share a starting point</h3><p className="hint">By default, links include your preferences and shortlisted neighbourhoods. Destinations, homes and precise bookmarks are left out. Your scenario name and household notes are included, so check them before sharing.</p>
      <label className="check-label"><input type="checkbox" checked={includePrecise} onChange={(event) => { setIncludePrecise(event.target.checked); setShareLink(''); }} />Include precise destinations, homes and bookmarks</label>
      {includePrecise && <p className="card-warn">Anyone with the link can read these locations and notes. There is no sign-in or expiry.</p>}
      <button className="btn" type="button" onClick={() => perform(() => { setShareLink(makeShareLink(current(), includePrecise)); setMessage('Link ready. It opens a copy; later edits stay on your own device.'); })}>Create share link</button>
      {shareLink && <div className="share-link"><label>Scenario link<input readOnly value={shareLink} onFocus={(event) => event.currentTarget.select()} /></label><button className="btn" onClick={() => perform(() => { void navigator.clipboard?.writeText(shareLink).then(() => setMessage('Link copied.')).catch(() => setMessage('Select the link and copy it from the text field.')); if (!navigator.clipboard) setMessage('Select the link and copy it from the text field.'); })}>Copy link</button></div>}
    </section>
    {error && <p className="card-warn" role="alert">{error}</p>}{message && <p className="scenario-message" role="status">{message}</p>}
    <section className="scenario-library" aria-label="Saved scenarios"><div className="section-heading"><h3>Saved on this device</h3><span>{scenarios.length}/50</span></div>
      {!scenarios.length && <p className="hint">Save your first scenario above. Your current search will still be here when you close this panel.</p>}
      {scenarios.map((scenario) => <article className="scenario-row" key={scenario.id}>
        <div><h4>{scenario.name}</h4><small>{new Date(scenario.savedAt).toLocaleDateString('en-GB')} · {scenario.snapshot.workplaces.length} destinations · {scenario.snapshot.shortlist.length} neighbourhoods · {scenario.snapshot.homes.length} homes</small>{scenario.notes && <p>{scenario.notes}</p>}</div>
        <div className="decision-actions"><button className="btn primary" onClick={() => { onLoad(scenario.snapshot); onClose(); }}>Open</button><button className="btn" onClick={() => perform(() => download(scenario))}>Export</button>{confirmDelete === scenario.id ? <><button className="btn danger" onClick={() => { persist(scenarios.filter((s) => s.id !== scenario.id)); setConfirmDelete(null); }}>Confirm delete</button><button className="btn link" onClick={() => setConfirmDelete(null)}>Keep</button></> : <button className="btn link" onClick={() => setConfirmDelete(scenario.id)}>Delete</button>}</div>
      </article>)}
    </section>
  </Dialog>;
}
