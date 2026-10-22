import { useEffect, useMemo, useState } from 'react';
import { DataNotice } from './components/DataNotice';
import { CommutePanel } from './features/commute/CommutePanel';
import { cellCommutes, commonReachableGeometry } from './features/commute/eligibility';
import { DEFAULT_WORKPLACES, getCommuteProvider, type CommuteResult } from './features/commute/provider';
import { PreferencePanel } from './features/filters/PreferencePanel';
import { evaluate, summarize, nearMisses, ranked as rankResults, type EvaluateInput } from './features/filters/ranking';
import { DEFAULT_PRIORITY } from './features/filters/preferences';
import { NeighbourhoodDetail } from './features/neighbourhoods/NeighbourhoodDetail';
import { ResultsList } from './features/neighbourhoods/ResultsList';
import { RESULT_SORTS, type ResultSort } from './features/neighbourhoods/sortResults';
import { ShortlistComparison } from './features/neighbourhoods/ShortlistComparison';
import { loadData } from './lib/data';
import { readStored, writeStored } from './lib/storage';
import { LayerPanel } from './map/controls/LayerPanel';
import { MapView } from './map/MapView';
import type {
  AreaCellCollection, AreaCellDisplayCollection, NeighbourhoodCollection, NeighbourhoodContent, NeighbourhoodMetrics, PreferenceLevel, Workplace, ZipRent,
} from './types';

interface AppData {
  neighbourhoods: NeighbourhoodCollection;
  metrics: Record<string, NeighbourhoodMetrics>;
  cells: AreaCellCollection;
  displayCells: AreaCellDisplayCollection;
  content: Record<string, NeighbourhoodContent>;
  rents: Record<string, ZipRent>;
}

const provider = getCommuteProvider();
const wpKey = (w: Workplace) => `${w.lat.toFixed(5)},${w.lon.toFixed(5)},${w.mode},${w.maxMinutes}`;

export default function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Workplaces are precise locations: session-scoped. Preferences/layers/shortlist are harmless UI state: local.
  const [workplaces, setWorkplaces] = useState<Workplace[]>(() => readStored('cg:workplaces', [], 'session'));
  const [prefs, setPrefs] = useState<Record<string, PreferenceLevel>>(() => readStored('cg:prefs', {}));
  const [priorityOrder, setPriorityOrder] = useState<string[]>(() => readStored('cg:priority:v1', DEFAULT_PRIORITY));
  const [layers, setLayers] = useState<Set<string>>(() => new Set(readStored<string[]>('cg:layers', []).map((id) => id === 'hills' ? 'topography' : id)));
  const [shortlist, setShortlist] = useState<string[]>(() => readStored('cg:shortlist', []));
  const [commuteCache, setCommuteCache] = useState<Record<string, CommuteResult | undefined>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [resultsSort, setResultsSort] = useState<ResultSort>(() => {
    const saved = readStored<string>('cg:results-sort', 'recommended');
    return RESULT_SORTS.includes(saved as ResultSort) ? saved as ResultSort : 'recommended';
  });
  const [adding, setAdding] = useState(false);
  const [about, setAbout] = useState(false);
  const [compareSaved, setCompareSaved] = useState(false);
  const [panel, setPanel] = useState<'search' | 'results'>('search');

  useEffect(() => {
    Promise.all([
      loadData<NeighbourhoodCollection>('neighbourhoods.geojson'),
      loadData<{ neighbourhoods: Record<string, NeighbourhoodMetrics> }>('neighbourhood_metrics.json'),
      loadData<AreaCellCollection>('area_cells.geojson'),
      loadData<{ neighbourhoods: Record<string, NeighbourhoodContent> }>('neighbourhood_content.json'),
      loadData<{ zips: Record<string, ZipRent> }>('rents_zori_zip.json'),
      loadData<AreaCellDisplayCollection>('area_cell_display.geojson'),
    ]).then(([neighbourhoods, metrics, cells, content, rents, displayCells]) => {
      const nameFor = (id: string, fallback: string) => content.neighbourhoods[id]?.name ?? fallback;
      setData({
        neighbourhoods: { ...neighbourhoods, features: neighbourhoods.features.map((f) => ({ ...f,
          properties: { ...f.properties, name: nameFor(f.properties.id, f.properties.name) },
        })) },
        metrics: Object.fromEntries(Object.entries(metrics.neighbourhoods).map(([id, m]) => [id, { ...m, name: nameFor(id, m.name) }])),
        cells, content: content.neighbourhoods, rents: rents.zips, displayCells,
      });
    }).catch((e: Error) => setLoadError(e.message));
  }, []);

  useEffect(() => writeStored('cg:workplaces', workplaces, 'session'), [workplaces]);
  useEffect(() => writeStored('cg:results-sort', resultsSort), [resultsSort]);
  useEffect(() => writeStored('cg:prefs', prefs), [prefs]);
  useEffect(() => writeStored('cg:priority:v1', priorityOrder), [priorityOrder]);
  useEffect(() => writeStored('cg:layers', [...layers]), [layers]);
  useEffect(() => writeStored('cg:shortlist', shortlist), [shortlist]);

  // Recompute a workplace's commute area only when its location, mode or time changes.
  const keys = workplaces.map((w) => `${w.id}|${wpKey(w)}`).join(';');
  useEffect(() => {
    let cancelled = false;
    workplaces.forEach((w) => {
      const key = `${w.id}|${wpKey(w)}`;
      provider.getArea(w).catch((): CommuteResult => ({ ok: false, reason: 'Routing request failed. Retry or reset the demo.' }))
        .then((res) => { if (!cancelled) setCommuteCache((c) => ({ ...c, [key]: res })); });
    });
    return () => { cancelled = true; };
  }, [keys]); // keyed on what changes the area, not on object identity

  // Route identity includes location/mode/time: stale successes never gate new settings.
  const commute = useMemo(() => Object.fromEntries(workplaces.map((w) => [w.id, commuteCache[`${w.id}|${wpKey(w)}`]])), [keys, commuteCache]);

  const areas = useMemo(() => workplaces.map((w) => commute[w.id]).flatMap((r) => (r?.ok ? [r.area] : [])), [commute, workplaces]);
  const pending = workplaces.some((w) => commute[w.id] === undefined);
  const failed = workplaces.map((w) => [w, commute[w.id]] as const).find(([, r]) => r && !r.ok);
  const blocked = failed ? `${failed[0].name}: ${(failed[1] as { reason: string }).reason}` : null;

  // A fully park-covered cell has no displayable land and cannot be a suggested home area.
  // Keep the original indicators/representative points for every remaining cell.
  const candidateCells = useMemo(() => {
    if (!data) return null;
    const footprints = new Set(data.displayCells.features.map((f) => f.properties.h3));
    return { ...data.cells, features: data.cells.features.filter((f) => footprints.has(f.properties.h3)) };
  }, [data]);
  const cellCoverage = useMemo(() => candidateCells ? cellCommutes(candidateCells, workplaces, commute) : {}, [candidateCells, keys, commute]);
  const overlap = useMemo(() => !pending && !blocked ? commonReachableGeometry(areas, workplaces.length) : null, [areas, workplaces.length, pending, blocked]);
  const input: EvaluateInput | null = useMemo(() => data && candidateCells ? { cells: candidateCells, metrics: data.metrics, commutes: cellCoverage, prefs, priorityOrder } : null, [data, candidateCells, cellCoverage, prefs, priorityOrder]);
  const cellResults = useMemo(() => input ? evaluate(input) : [], [input]);
  const cellById = useMemo(() => Object.fromEntries(cellResults.map((r) => [r.id, r])), [cellResults]);
  const results = useMemo(() => input ? summarize(input, cellResults) : [], [input, cellResults]);
  const byId = useMemo(() => Object.fromEntries(results.map((r) => [r.id, r])), [results]);
  const rankedList = useMemo(() => rankResults(results), [results]);
  const excluded = useMemo(() => results.filter((r) => !r.eligible).sort((a, b) => a.name.localeCompare(b.name)), [results]);
  const misses = useMemo(() => nearMisses(cellResults), [cellResults]);

  if (loadError) return <div className="fatal">Could not load data: {loadError}. Run <code>npm run dev</code> (it syncs data first).</div>;
  if (!data || !input) return <div className="fatal">Loading Common Ground…</div>;

  const updateWorkplace = (id: string, patch: Partial<Workplace>) => setWorkplaces((ws) => ws.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  const toggleShortlist = (id: string) => setShortlist((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const selected = selectedId ? byId[selectedId] : null;
  const selectedCell = selectedCellId ? cellById[selectedCellId] : undefined;
  const selectCell = (id: string) => { const r = cellById[id]; if (r) { setSelectedCellId(id); setSelectedId(r.nhoodId); setPanel('results'); } };
  const selectNeighbourhood = (id: string) => { setSelectedId(id); setSelectedCellId(null); setPanel('results'); };
  const eligibleCells = cellResults.filter((r) => r.eligible).length;
  const matchingActive = workplaces.length > 0 || Object.values(prefs).some((level) => level !== 'off');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="logo">◐</span> Common Ground <span className="tagline">Find where to live from San Francisco to SFO</span></div>
        <div className="topbar-right">
          {shortlist.length > 0 && <button className="btn link shortlist-count" onClick={() => setCompareSaved(true)} title="Compare your saved areas">♥ {shortlist.length} saved</button>}
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
          <PreferencePanel input={input} onChange={(id, level) => setPrefs((p) => ({ ...p, [id]: level }))} onOrderChange={setPriorityOrder} />
          <LayerPanel visible={layers} onToggle={(id) => setLayers((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} />
        </aside>
        <section className="map-wrap">
          <MapView
            neighbourhoods={data.neighbourhoods} results={byId} selectedId={selectedId}
            cells={data.displayCells} cellResults={cellById} selectedCellId={selectedCellId} onSelectCell={selectCell}
            matchingActive={matchingActive}
            overlap={overlap} onSelect={selectNeighbourhood}
            areas={areas} workplaces={workplaces} addingWorkplace={adding}
            onMoveWorkplace={(id, lat, lon) => updateWorkplace(id, { lat, lon })}
            onMapPick={(lat, lon) => {
              setWorkplaces((ws) => [...ws, { id: `wp-${Date.now()}`, name: `Workplace ${ws.length + 1}`, lat, lon, mode: 'transit', maxMinutes: 45 }]);
              setAdding(false);
            }}
            visibleLayers={layers}
          />
          {pending && workplaces.length > 0 && <div className="map-badge">Calculating commute areas…</div>}
          {!pending && blocked && <div className="map-badge error">Commute unavailable · results blocked</div>}
          {matchingActive && <div className="match-legend" aria-label="Cell matching legend">
            <b>{eligibleCells} eligible cells · {rankedList.length} areas</b>
            <div><span className="match-dot strong" /> Strong <span className="match-dot partial" /> Partial <span className="match-dot unknown" /> Unknown</div>
            <small>~0.1 km² areas · representative-location matching<br />Bold green border: shared commute area{areas.some((a) => a.source === 'fixture') ? ' · approximate demo' : ''}</small>
            {selected?.eligible && <small>Gold outlines: matches in {selected.name}.<br />Mapped parks and open space are cut out.</small>}
          </div>}
        </section>
        <aside className={`resultsbar ${panel === 'results' ? 'show' : ''}`}>
          {selected ? (
            <NeighbourhoodDetail
              result={selected} metrics={data.metrics[selected.id]} content={data.content[selected.id]} rents={data.rents}
              cellResult={selectedCell} cellResults={cellResults.filter((r) => r.nhoodId === selected.id)} onSelectCell={selectCell}
              workplaces={workplaces} saved={shortlist.includes(selected.id)}
              onToggleShortlist={() => toggleShortlist(selected.id)} onClose={() => { setSelectedId(null); setSelectedCellId(null); }}
            />
          ) : (
            <ResultsList
              ranked={rankedList} excluded={excluded} content={data.content} metrics={data.metrics} workplaces={workplaces}
              showExcluded={showExcluded} onToggleExcluded={() => setShowExcluded((s) => !s)}
              onSelect={selectNeighbourhood} shortlist={shortlist} onToggleShortlist={toggleShortlist} blocked={blocked}
              pending={pending} hasWorkplaces={workplaces.length > 0} nearMisses={misses} onSelectCell={selectCell}
              sort={resultsSort} onSortChange={setResultsSort}
            />
          )}
        </aside>
      </main>
      {about && <DataNotice onClose={() => setAbout(false)} />}
      {compareSaved && <ShortlistComparison areas={results.filter((r) => shortlist.includes(r.id))} cells={cellById} metrics={data.metrics} priorityOrder={priorityOrder}
        onClose={() => setCompareSaved(false)} onSelect={(id) => { setCompareSaved(false); selectNeighbourhood(id); }} />}
    </div>
  );
}
