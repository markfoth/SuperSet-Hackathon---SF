import { useEffect, useMemo, useState } from 'react';
import { DataNotice } from './components/DataNotice';
import { CommutePanel } from './features/commute/CommutePanel';
import { commuteCoverage } from './features/commute/eligibility';
import { DEFAULT_WORKPLACES, getCommuteProvider, type CommuteResult } from './features/commute/provider';
import { PreferencePanel } from './features/filters/PreferencePanel';
import { evaluate, ranked as rankResults, type EvaluateInput } from './features/filters/ranking';
import { NeighbourhoodDetail } from './features/neighbourhoods/NeighbourhoodDetail';
import { ResultsList } from './features/neighbourhoods/ResultsList';
import { loadData } from './lib/data';
import { readStored, writeStored } from './lib/storage';
import { LayerPanel } from './map/controls/LayerPanel';
import { MapView } from './map/MapView';
import type {
  NeighbourhoodCollection, NeighbourhoodContent, NeighbourhoodMetrics, PreferenceLevel, Workplace, ZipRent,
} from './types';

interface AppData {
  neighbourhoods: NeighbourhoodCollection;
  metrics: Record<string, NeighbourhoodMetrics>;
  samples: Record<string, [number, number][]>;
  content: Record<string, NeighbourhoodContent>;
  rents: Record<string, ZipRent>;
}

const provider = getCommuteProvider();
const wpKey = (w: Workplace) => `${w.lat.toFixed(5)},${w.lon.toFixed(5)},${w.mode},${w.maxMinutes}`;

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Workplaces are precise locations: session-scoped. Preferences/layers/shortlist are harmless UI state: local.
  const [workplaces, setWorkplaces] = useState<Workplace[]>(() => readStored('cg:workplaces', DEFAULT_WORKPLACES, 'session'));
  const [prefs, setPrefs] = useState<Record<string, PreferenceLevel>>(() => readStored('cg:prefs', {}));
  const [layers, setLayers] = useState<Set<string>>(() => new Set(readStored<string[]>('cg:layers', [])));
  const [shortlist, setShortlist] = useState<string[]>(() => readStored('cg:shortlist', []));
  const [commute, setCommute] = useState<Record<string, CommuteResult | undefined>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [about, setAbout] = useState(false);
  const [panel, setPanel] = useState<'search' | 'results'>('search');

  useEffect(() => {
    Promise.all([
      loadData<NeighbourhoodCollection>('neighbourhoods.geojson'),
      loadData<{ neighbourhoods: Record<string, NeighbourhoodMetrics> }>('neighbourhood_metrics.json'),
      loadData<{ neighbourhoods: Record<string, [number, number][]> }>('neighbourhood_samples.json'),
      loadData<{ neighbourhoods: Record<string, NeighbourhoodContent> }>('neighbourhood_content.json'),
      loadData<{ zips: Record<string, ZipRent> }>('rents_zori_zip.json'),
    ]).then(([neighbourhoods, metrics, samples, content, rents]) => setData({
      neighbourhoods, metrics: metrics.neighbourhoods, samples: samples.neighbourhoods,
      content: content.neighbourhoods, rents: rents.zips,
    })).catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => writeStored('cg:workplaces', workplaces, 'session'), [workplaces]);
  useEffect(() => writeStored('cg:prefs', prefs), [prefs]);
  useEffect(() => writeStored('cg:layers', [...layers]), [layers]);
  useEffect(() => writeStored('cg:shortlist', shortlist), [shortlist]);

  // Recompute a workplace's commute area only when its location, mode or time changes.
  const keys = workplaces.map((w) => `${w.id}|${wpKey(w)}`).join(';');
  useEffect(() => {
    let cancelled = false;
    setCommute({});
    workplaces.forEach((w) => {
      provider.getArea(w).then((res) => { if (!cancelled) setCommute((c) => ({ ...c, [w.id]: res })); });
    });
    return () => { cancelled = true; };
  }, [keys]); // keyed on what changes the area, not on object identity

  const areas = useMemo(() => workplaces.map((w) => commute[w.id]).flatMap((r) => (r?.ok ? [r.area] : [])), [commute, workplaces]);
  const pending = workplaces.some((w) => commute[w.id] === undefined);
  const failed = workplaces.map((w) => [w, commute[w.id]] as const).find(([, r]) => r && !r.ok);
  const blocked = failed ? `${failed[0].name}: ${(failed[1] as { reason: string }).reason}` : null;

  const coverage = useMemo(
    () => (data && workplaces.length && !pending && !blocked ? commuteCoverage(data.samples, areas) : null),
    [data, areas, workplaces.length, pending, blocked],
  );

  const input: EvaluateInput | null = data ? { metrics: data.metrics, content: data.content, coverage, prefs } : null;
  const results = useMemo(() => (input ? evaluate(input) : []), [data, coverage, prefs]);
  const byId = useMemo(() => Object.fromEntries(results.map((r) => [r.id, r])), [results]);
  const rankedList = useMemo(() => rankResults(results), [results]);
  const excluded = useMemo(() => results.filter((r) => !r.eligible).sort((a, b) => a.name.localeCompare(b.name)), [results]);

  if (loadError) return <div className="fatal">Could not load data: {loadError}. Run <code>npm run dev</code> (it syncs data first).</div>;
  if (!data || !input) return <div className="fatal">Loading Common Ground…</div>;

  const updateWorkplace = (id: string, patch: Partial<Workplace>) => setWorkplaces((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const toggleShortlist = (id: string) => setShortlist((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selected = selectedId ? byId[selectedId] : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">◐</span> Common Ground <span className="tagline">Find where to live in San Francisco</span></div>
        <div className="topbar-right">
          {shortlist.length > 0 && <span className="shortlist-count" title={shortlist.map((id) => data.metrics[id]?.name).join(', ')}>♥ {shortlist.length} saved</span>}
          <button className="btn link" onClick={() => setAbout(true)}>About the data</button>
        </div>
      </header>
      <div className="mobile-tabs">
        <button className={panel === 'search' ? 'on' : ''} onClick={() => setPanel('search')}>Commute & priorities</button>
        <button className={panel === 'results' ? 'on' : ''} onClick={() => setPanel('results')}>Results ({rankedList.length})</button>
      </div>
      <main className="layout">
        <aside className={`sidebar ${panel === 'search' ? 'show' : ''}`}>
          <CommutePanel
            workplaces={workplaces} results={commute} onChange={updateWorkplace} adding={adding}
            onRemove={(id) => setWorkplaces((ws) => ws.filter((w) => w.id !== id))}
            onAdd={() => setAdding((a) => !a)}
            onReset={() => { setWorkplaces(DEFAULT_WORKPLACES); setAdding(false); }}
          />
          <PreferencePanel input={input} onChange={(id, level) => setPrefs((p) => ({ ...p, [id]: level }))} />
          <LayerPanel visible={layers} onToggle={(id) => setLayers((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
        </aside>
        <section className="map-wrap">
          <MapView
            neighbourhoods={data.neighbourhoods} results={byId} showExcluded={showExcluded} selectedId={selectedId}
            onSelect={(id) => { setSelectedId(id); setPanel('results'); }}
            areas={areas} workplaces={workplaces} addingWorkplace={adding}
            onMoveWorkplace={(id, lat, lon) => updateWorkplace(id, { lat, lon })}
            onMapPick={(lat, lon) => {
              setWorkplaces((ws) => [...ws, { id: `wp-${Date.now()}`, name: `Workplace ${ws.length + 1}`, lat, lon, mode: 'transit', maxMinutes: 45 }]);
              setAdding(false);
            }}
            visibleLayers={layers}
          />
          {pending && workplaces.length > 0 && <div className="map-badge">Calculating commute areas…</div>}
        </section>
        <aside className={`resultsbar ${panel === 'results' ? 'show' : ''}`}>
          {selected ? (
            <NeighbourhoodDetail
              result={selected} metrics={data.metrics[selected.id]} content={data.content[selected.id]} rents={data.rents}
              workplaces={workplaces} saved={shortlist.includes(selected.id)}
              onToggleShortlist={() => toggleShortlist(selected.id)} onClose={() => setSelectedId(null)}
            />
          ) : (
            <ResultsList
              ranked={rankedList} excluded={excluded} content={data.content} metrics={data.metrics} workplaces={workplaces}
              showExcluded={showExcluded} onToggleExcluded={() => setShowExcluded((s) => !s)}
              onSelect={setSelectedId} shortlist={shortlist} onToggleShortlist={toggleShortlist} blocked={blocked}
            />
          )}
        </aside>
      </main>
      {about && <DataNotice onClose={() => setAbout(false)} />}
    </div>
  );
}
