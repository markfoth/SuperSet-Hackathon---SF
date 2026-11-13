import { useEffect, useMemo, useRef, useState } from 'react';
import { DataNotice } from './components/DataNotice';
import { CommutePanel } from './features/commute/CommutePanel';
import { cellCommutes, commonReachableGeometry } from './features/commute/eligibility';
import { DEFAULT_WORKPLACES, commuteRequestKey, getCommuteProvider, type CommuteResult } from './features/commute/provider';
import { PreferencePanel } from './features/filters/PreferencePanel';
import { TradeoffPanel } from './features/filters/TradeoffPanel';
import { evaluate, summarize, nearMisses, ranked as rankResults, type EvaluateInput } from './features/filters/ranking';
import { DEFAULT_PRIORITY } from './features/filters/preferences';
import { NeighbourhoodDetail } from './features/neighbourhoods/NeighbourhoodDetail';
import { ResultsList } from './features/neighbourhoods/ResultsList';
import { RESULT_SORTS, type ResultSort } from './features/neighbourhoods/sortResults';
import { ShortlistComparison } from './features/neighbourhoods/ShortlistComparison';
import { ScenarioPanel } from './features/scenarios/ScenarioPanel';
import { Dialog } from './features/scenarios/Dialog';
import { createHome, createBookmark, validateSnapshot, loadWorkspace, saveWorkspace, readSharedScenario, settingsFingerprint, type ScenarioSnapshot, type Home, type LocationBookmark } from './features/scenarios/model';
import { HomePanel } from './features/homes/HomePanel';
import { loadData } from './lib/data';
import { readStored, writeStored } from './lib/storage';
import { LayerPanel } from './map/controls/LayerPanel';
import { MapView } from './map/MapView';
import { DEFAULT_EVENT_FILTERS } from './map/layers/eventDetails';
import type { AreaCellCollection, AreaCellDisplayCollection, NeighbourhoodCollection, NeighbourhoodContent, NeighbourhoodMetrics, PreferenceLevel, Workplace, ZipRent } from './types';

interface AppData {
  neighbourhoods: NeighbourhoodCollection; metrics: Record<string, NeighbourhoodMetrics>;
  cells: AreaCellCollection; displayCells: AreaCellDisplayCollection;
  content: Record<string, NeighbourhoodContent>; rents: Record<string, ZipRent>;
}
const provider = getCommuteProvider();
function initialWorkspace() {
  try {
    const saved = loadWorkspace();
    if (saved.value || saved.error) return saved;
    return { value: validateSnapshot({ workplaces: readStored('cg:workplaces', [], 'session'), prefs: readStored('cg:prefs', {}), priorityOrder: readStored('cg:priority:v1', DEFAULT_PRIORITY), shortlist: readStored('cg:shortlist', []), homes: [], bookmarks: [] }), error: null };
  } catch { return { value: null, error: 'Saved settings could not be read. Start a new search or import an exported scenario.' }; }
}
function sharedWorkspace() {
  try { return { file: readSharedScenario(), error: null }; } catch (e) { return { file: null, error: e instanceof Error ? e.message : 'Could not read scenario link.' }; }
}

export default function App() {
  const [initial] = useState(initialWorkspace), [shared, setShared] = useState(sharedWorkspace);
  const [data, setData] = useState<AppData | null>(null), [loadError, setLoadError] = useState<string | null>(null);
  const [analysisReady, setAnalysisReady] = useState(false), [analysisError, setAnalysisError] = useState<string | null>(null), [analysisRetry, setAnalysisRetry] = useState(0);
  const [workplaces, setWorkplaces] = useState<Workplace[]>(() => initial.value?.workplaces ?? []);
  const [prefs, setPrefs] = useState<Record<string, PreferenceLevel>>(() => initial.value?.prefs ?? {});
  const [priorityOrder, setPriorityOrder] = useState<string[]>(() => initial.value?.priorityOrder ?? DEFAULT_PRIORITY);
  const [shortlist, setShortlist] = useState<string[]>(() => initial.value?.shortlist ?? []);
  const [homes, setHomes] = useState<Home[]>(() => initial.value?.homes ?? []), [bookmarks, setBookmarks] = useState<LocationBookmark[]>(() => initial.value?.bookmarks ?? []);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const [autosave, setAutosave] = useState(!initial.error);
  const [layers, setLayers] = useState<Set<string>>(() => new Set(readStored<string[]>('cg:layers', []).map(id => id === 'hills' ? 'topography' : id)));
  const [transportAnimation, setTransportAnimation] = useState(false);
  const [airScale, setAirScale] = useState<'local' | 'statewide'>('local');
  const [eventFilters, setEventFilters] = useState(DEFAULT_EVENT_FILTERS);
  const [commuteCache, setCommuteCache] = useState<Record<string, CommuteResult | undefined>>({}), [retry, setRetry] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null), [selectedCellId, setSelectedCellId] = useState<string | null>(null);
  const [selectedHomeId, setSelectedHomeId] = useState<string | null>(null), [focusedWorkplaceId, setFocusedWorkplaceId] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [resultsSort, setResultsSort] = useState<ResultSort>(() => { const saved = readStored<string>('cg:results-sort', 'recommended'); return RESULT_SORTS.includes(saved as ResultSort) ? saved as ResultSort : 'recommended'; });
  const [adding, setAdding] = useState(false), [pickingHome, setPickingHome] = useState(false);
  const [about, setAbout] = useState(false), [compareSaved, setCompareSaved] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false), [homesOpen, setHomesOpen] = useState(false);
  const [panel, setPanel] = useState<'search' | 'results'>('search');
  const [focusedMap, setFocusedMap] = useState(false), [layersOpen, setLayersOpen] = useState(false), [preferencesOpen, setPreferencesOpen] = useState(false);
  const [leftCollapsed, setLeftCollapsed] = useState(false), [rightCollapsed, setRightCollapsed] = useState(false);
  const resultsPanel=useRef<HTMLElement>(null), listScroll=useRef(0);
  const previousSelection=useRef<string|null>(null);
  const [hoveredId,setHoveredId]=useState<string|null>(null);
  useEffect(()=>{
    if(selectedId){previousSelection.current=selectedId;return;}
    const frame=requestAnimationFrame(()=>{
      if(resultsPanel.current){
        resultsPanel.current.scrollTop=listScroll.current;
        const card=Array.from(resultsPanel.current.querySelectorAll<HTMLElement>('.card[data-area-id]')).find(node=>node.dataset.areaId===previousSelection.current);
        card?.querySelector<HTMLButtonElement>('.card-title')?.focus({preventScroll:true});
      }
    });
    return()=>cancelAnimationFrame(frame);
  },[selectedId]);
  const [undoSettings, setUndoSettings] = useState<{prefs:Record<string,PreferenceLevel>; priorityOrder:string[]; workplaces:Workplace[]}|null>(null);
  const [sheet, setSheet] = useState<'compact'|'half'|'full'>('half');
  const [mapMode, setMapMode] = useState<'find' | 'explore' | 'compare'>('find');
  useEffect(() => { const update = () => setShared(sharedWorkspace()); window.addEventListener('hashchange', update); return () => window.removeEventListener('hashchange', update); }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadData<NeighbourhoodCollection>('neighbourhoods.geojson'), loadData<{ neighbourhoods: Record<string, NeighbourhoodMetrics> }>('neighbourhood_metrics.json'),
      loadData<{ neighbourhoods: Record<string, NeighbourhoodContent> }>('neighbourhood_content.json'), loadData<{ zips: Record<string, ZipRent> }>('rents_zori_zip.json'),
    ]).then(([neighbourhoods, metrics, content, rents]) => {
      if (cancelled) return;
      const nameFor = (id: string, fallback: string) => content.neighbourhoods[id]?.name ?? fallback;
      setData({ neighbourhoods: { ...neighbourhoods, features: neighbourhoods.features.map(f => ({ ...f, properties: { ...f.properties, name: nameFor(f.properties.id, f.properties.name) } })) },
        metrics: Object.fromEntries(Object.entries(metrics.neighbourhoods).map(([id, m]) => [id, { ...m, name: nameFor(id, m.name) }])), cells: { type: 'FeatureCollection', features: [] }, content: content.neighbourhoods, rents: rents.zips, displayCells: { type: 'FeatureCollection', features: [] } });
    }).catch((e: Error) => { if (!cancelled) setLoadError(e.message); });
    return () => { cancelled = true; };
  }, []);
  const analysisNeeded = workplaces.length > 0 || homes.length > 0 || homesOpen || compareSaved;
  const overviewReady = data !== null;
  // The opening map needs boundaries, not 3.36 MB of matching geometry.
  // Requests start on the first actual search or home/shortlist review. Missing
  // geometry keeps matching pending, and errors stay visible until an explicit retry.
  useEffect(() => {
    if (!overviewReady || !analysisNeeded || analysisReady) return;
    let cancelled = false;
    setAnalysisError(null);
    Promise.all([loadData<AreaCellCollection>('area_cells.geojson'), loadData<AreaCellDisplayCollection>('area_cell_display.geojson')])
      .then(([cells, displayCells]) => {
        if (cancelled) return;
        setData(previous => previous ? { ...previous, cells, displayCells } : previous);
        setAnalysisReady(true);
      }).catch((error: unknown) => { if (!cancelled) setAnalysisError(error instanceof Error ? error.message : 'Local measurements could not load.'); });
    return () => { cancelled = true; };
  }, [overviewReady, analysisNeeded, analysisReady, analysisRetry]);
  const snapshot = useMemo<ScenarioSnapshot>(() => ({ workplaces, prefs, priorityOrder, shortlist, homes, bookmarks }), [workplaces, prefs, priorityOrder, shortlist, homes, bookmarks]);
  useEffect(() => {
    if (!autosave) return;
    try { setStorageError(saveWorkspace(snapshot)); } catch { setStorageError('This browser cannot save changes. Export a scenario before leaving.'); }
    writeStored('cg:workplaces', workplaces, 'session');
  }, [snapshot, autosave]);
  useEffect(() => writeStored('cg:results-sort', resultsSort), [resultsSort]);
  useEffect(() => writeStored('cg:layers', [...layers]), [layers]);
  const keys = workplaces.map(w => `${w.id}|${commuteRequestKey(w)}`).join(';');
  useEffect(() => {
    let cancelled = false;
    workplaces.forEach(w => {
      const key = `${w.id}|${commuteRequestKey(w)}`;
      provider.getArea(w).catch((): CommuteResult => ({ ok: false, reason: 'Routing request failed. Retry or try the example.' }))
        .then(res => { if (!cancelled) setCommuteCache(c => ({ ...c, [key]: res })); });
    });
    return () => { cancelled = true; };
  }, [keys, retry]);
  const commute = useMemo(() => Object.fromEntries(workplaces.map(w => [w.id, commuteCache[`${w.id}|${commuteRequestKey(w)}`]])), [keys, commuteCache]);
  const areas = useMemo(() => workplaces.flatMap(w => { const r = commute[w.id]; return r?.ok ? [r.area] : []; }), [commute, workplaces]);
  const pending = workplaces.some(w => commute[w.id] === undefined) || (analysisNeeded && !analysisReady && !analysisError);
  const failed = workplaces.map(w => [w, commute[w.id]] as const).find(([, r]) => r && !r.ok);
  const blocked = analysisError || (failed ? `${failed[0].name}: ${(failed[1] as { reason: string }).reason}` : null);
  const candidateCells = useMemo(() => { if (!data) return null; const footprints = new Set(data.displayCells.features.map(f => f.properties.h3)); return { ...data.cells, features: data.cells.features.filter(f => footprints.has(f.properties.h3)) }; }, [data]);
  const cellCoverage = useMemo(() => candidateCells ? cellCommutes(candidateCells, workplaces, commute) : {}, [candidateCells, keys, commute]);
  const overlap = useMemo(() => !pending && !blocked ? commonReachableGeometry(areas, workplaces.length) : null, [areas, workplaces.length, pending, blocked]);
  const input = useMemo<EvaluateInput | null>(() => data && candidateCells ? { cells: candidateCells, metrics: data.metrics, commutes: cellCoverage, prefs, priorityOrder } : null, [data, candidateCells, cellCoverage, prefs, priorityOrder]);
  const cellResults = useMemo(() => input ? evaluate(input) : [], [input]);
  const cellById = useMemo(() => Object.fromEntries(cellResults.map(r => [r.id, r])), [cellResults]);
  const results = useMemo(() => input ? summarize(input, cellResults) : [], [input, cellResults]);
  const byId = useMemo(() => Object.fromEntries(results.map(r => [r.id, r])), [results]);
  const rankedList = useMemo(() => rankResults(results), [results]);
  const excluded = useMemo(() => results.filter(r => !r.eligible).sort((a, b) => a.name.localeCompare(b.name)), [results]);
  const misses = useMemo(() => nearMisses(cellResults), [cellResults]);

  if (loadError) return <main className="fatal"><h1>We couldn’t load the local data.</h1><p>{loadError}</p><button className="btn primary" onClick={() => window.location.reload()}>Try again</button></main>;
  if (!data || !input) return <main className="fatal" role="status"><span className="brand">Common Ground</span><p>Getting the lay of the land…</p></main>;
  const updateWorkplace = (id: string, patch: Partial<Workplace>) => { setUndoSettings(null); setAutosave(true); setWorkplaces(ws => ws.map(w => w.id === id ? { ...w, ...patch } : w)); };
  const toggleShortlist = (id: string) => {
    setAutosave(true);
    if (shortlist.includes(id)) { setShortlist(s => s.filter(x => x !== id)); setBookmarks(bs => bs.filter(b => b.kind !== 'neighbourhood' || b.neighbourhoodId !== id)); }
    else { setShortlist(s => [...s, id]); setBookmarks(bs => [...bs.filter(b => b.kind !== 'neighbourhood' || b.neighbourhoodId !== id), createBookmark({ id: crypto.randomUUID(), kind: 'neighbourhood', name: byId[id]?.name || id, neighbourhoodId: id }, snapshot)]); }
  };
  const selected = selectedId ? byId[selectedId] : null, selectedCell = selectedCellId ? cellById[selectedCellId] : undefined;
  const selectCell = (id: string) => { if(!selectedId)listScroll.current=resultsPanel.current?.scrollTop||0; const r = cellById[id]; if (r) { setSelectedCellId(id); setSelectedId(r.nhoodId); setPanel('results'); setRightCollapsed(false); setFocusedMap(false); } };
  const selectNeighbourhood = (id: string) => { if(!selectedId)listScroll.current=resultsPanel.current?.scrollTop||0; if (analysisReady) { setSelectedId(id); setSelectedCellId(null); } setPanel('results'); setRightCollapsed(false); setFocusedMap(false); };
  const matchingActive = workplaces.length > 0, eligibleCells = cellResults.filter(r => r.eligible).length;
  const preferenceCount = Object.values(prefs).filter(p => p !== 'off').length;
  const addDestination = (name: string, lat: number, lon: number) => {
    setUndoSettings(null); setAutosave(true);
    setWorkplaces(ws => [...ws, { id: crypto.randomUUID(), name, placeName: name, personName: `Person ${ws.length + 1}`, lat, lon, mode: 'transit', maxMinutes: 45, officeDays: 3 }]);
    setAdding(false); setFocusedMap(false); setLeftCollapsed(false); setPanel('search');
  };
  const loadSnapshot = (s: ScenarioSnapshot) => { setUndoSettings(null); setAutosave(true); setWorkplaces(s.workplaces); setPrefs(s.prefs); setPriorityOrder(s.priorityOrder); setShortlist(s.shortlist); setHomes(s.homes); setBookmarks(s.bookmarks); setSelectedId(null); setSelectedCellId(null); setSelectedHomeId(null); setCommuteCache({}); setRetry(n => n + 1); setPanel('search'); setFocusedMap(false); };
  const savedCell = selectedCell ? bookmarks.find(b => b.cellId === selectedCell.id) : null;
  const saveSelectedCell = () => {
    if (!selectedCell) return;
    if (savedCell) { setBookmarks(bs => bs.filter(b => b.id !== savedCell.id)); return; }
    setBookmarks(bs => [...bs, createBookmark({ id: crypto.randomUUID(), kind: 'cell', name: `Matching location in ${selectedCell.name}`, neighbourhoodId: selectedCell.nhoodId, cellId: selectedCell.id, lat: selectedCell.cell.check_lat, lon: selectedCell.cell.check_lon }, snapshot)]);
  };
  return <div className={`app ${focusedMap ? 'map-focused' : ''} ${leftCollapsed ? 'left-collapsed' : ''} ${rightCollapsed ? 'right-collapsed' : ''} ${matchingActive ? 'has-search' : 'is-opening'} sheet-${sheet}`}>
    <header className="topbar">
      <button className="brand" onClick={() => { setPanel('search'); setLeftCollapsed(false); setFocusedMap(false); }} aria-label="Common Ground home"><svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M4 25V11L16 4l12 7v14H4Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M16 4v21M4 18h24" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg><span>Common Ground<small>Find a place that works for everyone.</small></span></button>
      <nav className="topbar-right" aria-label="Your household">
        <button className="btn link homes-nav" onClick={() => setHomesOpen(true)}>Homes{homes.length ? ` (${homes.length})` : ''}</button>
        <button className="btn link shortlist-count" onClick={() => { setMapMode('compare'); setCompareSaved(true); }}>Shortlist <span className="count">{shortlist.length + bookmarks.filter(b => b.kind === 'cell').length + homes.length}</span></button>
        <button className="btn scenarios-nav" onClick={() => setScenariosOpen(true)}>Scenarios <span aria-hidden="true">↗</span></button>
        <button className="icon-btn about-nav" onClick={() => setAbout(true)} aria-label="About the data">i</button>
      </nav>
    </header>
    <main className="layout">
      <section className="map-wrap" aria-label="San Francisco and northern Peninsula map">
        <MapView neighbourhoods={data.neighbourhoods} results={byId} selectedId={selectedId} cells={data.displayCells} cellResults={cellById} selectedCellId={selectedCellId} onSelectCell={selectCell} matchingActive={matchingActive} overlap={overlap} onSelect={selectNeighbourhood}
          areas={areas} workplaces={workplaces} addingWorkplace={adding} onMoveWorkplace={(id, lat, lon) => updateWorkplace(id, { lat, lon, placeName: 'Pinned location' })} onMapPick={(lat, lon) => addDestination('Pinned location', lat, lon)} visibleLayers={layers} onInspectContext={() => setLayersOpen(false)} transportAnimation={transportAnimation} airScale={airScale} eventFilters={eventFilters} hoveredNeighbourhoodId={hoveredId} onHoverNeighbourhood={setHoveredId} mapMode={mapMode} focusWorkplaceId={focusedWorkplaceId}
          homes={homes} selectedHomeId={selectedHomeId} onSelectHome={id => { setSelectedHomeId(id); setHomesOpen(true); }} pickingHome={pickingHome} onHomePick={(lat, lon) => { const home = createHome(lat, lon); setHomes(hs => [...hs, home]); setSelectedHomeId(home.id); setPickingHome(false); setFocusedMap(false); setHomesOpen(true); }} onMoveHome={(id, lat, lon) => setHomes(hs => hs.map(h => h.id === id ? { ...h, lat, lon } : h))} />
        <div className="map-topline"><div className="map-modes" role="group" aria-label="Map mode">{(['find', 'explore', 'compare'] as const).map(mode => <button key={mode} aria-pressed={mapMode === mode} onClick={() => { setMapMode(mode); if (mode === 'compare') setCompareSaved(true); }}>{mode === 'find' ? 'Find' : mode === 'explore' ? 'Explore' : 'Compare'}</button>)}</div><button className="btn map-focus" onClick={() => setFocusedMap(v => !v)}>{focusedMap ? '← Back to search' : 'Focus on map'} <span aria-hidden="true">⛶</span></button></div>
        <div className="context-control"><button className="btn layers-toggle" aria-expanded={layersOpen} onClick={() => setLayersOpen(v => !v)}><span aria-hidden="true">▱</span> Map layers{layers.size ? ` · ${layers.size}` : ''}</button>{layersOpen && <div className="floating-layers"><LayerPanel visible={layers} airScale={airScale} onAirScaleChange={setAirScale} transportAnimation={transportAnimation} onTransportAnimationChange={setTransportAnimation} eventFilters={eventFilters} onEventFiltersChange={(kind, value) => setEventFilters(current => ({ ...current, [kind]: value }))} onToggle={id => setLayers(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} /><button className="btn link" onClick={() => setLayersOpen(false)}>Done</button></div>}</div>
        {(adding || pickingHome) && <div className="pick-instruction" role="status">{pickingHome ? 'Choose the home’s position on the map.' : 'Choose a destination on the map. Drag its pin to refine it.'}<button className="btn" onClick={() => { setAdding(false); setPickingHome(false); setFocusedMap(false); }}>Cancel</button></div>}
        {pending && matchingActive && <div className="map-badge" role="status">{analysisReady ? 'Checking every commute…' : 'Loading local measurements…'}</div>}
        {!pending && blocked && <div className="map-badge error" role="status">Commute unavailable · matching paused</div>}
        {matchingActive && <div className="match-legend" aria-label="Cell matching legend"><b>{eligibleCells} matching locations · {rankedList.length} neighbourhoods</b><div><span className="match-dot strong" />{preferenceCount ? 'Meets targets' : 'Commute match'}<span className="match-dot partial" />Compromise<span className="match-dot unknown" />Unknown</div><small>Representative points, not every address · ~0.1 km² cells<br />{areas.some(a => a.source === 'fixture') ? 'Approximate offline example · some timetables out of date' : 'Routing estimates, not journey guarantees'}</small>{selected?.eligible && <small>Gold outlines: matches in {selected.name}.</small>}</div>}
        <div className="coverage-caption"><span className="coverage-dot" /> San Francisco → SFO <span>Open local data · coverage varies</span></div>
      </section>
      <div className="decision-panel" hidden={focusedMap}>
        <div className="sheet-controls" role="group" aria-label="Panel size">{(['compact','half','full'] as const).map(size=><button key={size} aria-pressed={sheet===size} onClick={()=>setSheet(size)}>{size==='compact'?'More map':size==='half'?'Split view':'More list'}</button>)}</div>
        {matchingActive && <nav className="panel-tabs" aria-label="Search and results"><button className={panel === 'search' ? 'on' : ''} onClick={() => setPanel('search')}>Your search</button><button className={panel === 'results' ? 'on' : ''} onClick={() => setPanel('results')}>Matches <span>{pending ? '…' : rankedList.length}</span></button></nav>}
        <section className="criteria-panel desktop-panel" aria-label="Search settings panel">
        <div className="desktop-panel-heading"><button className="panel-title" onClick={() => setPanel('search')}>Your search</button><button className="icon-btn" aria-label="Collapse your search" aria-controls="criteria-content" onClick={() => setLeftCollapsed(true)}>‹</button></div>
        {matchingActive && <div className="persistent-summary"><span>{workplaces.length} destinations · {preferenceCount} priorities</span><button className="btn link" onClick={()=>setCompareSaved(true)}>Compare saved</button></div>}
        <aside id="criteria-content" className="sidebar" hidden={panel !== 'search'} aria-label="Your search">
          {!matchingActive && <div className="opening-intro"><span className="eyebrow">A PLACE FOR YOUR LIVES TO MEET.</span><p>San Francisco and the northern Peninsula.</p></div>}
          <CommutePanel workplaces={workplaces} results={commute} onChange={updateWorkplace} adding={adding} onRemove={id => { setAutosave(true); setUndoSettings(null); setWorkplaces(ws => ws.filter(w => w.id !== id)); }} onAdd={() => { setAdding(v => !v); setPickingHome(false); if (window.innerWidth <= 700) setFocusedMap(true); }} onAddPlace={place => addDestination(place.name, place.lat, place.lon)} onFocus={id => { setFocusedWorkplaceId(null); requestAnimationFrame(() => setFocusedWorkplaceId(id)); }} onRetry={() => { setCommuteCache({}); setRetry(n => n + 1); setAnalysisRetry(n => n + 1); }} onReset={() => { setUndoSettings(null); setAutosave(true); setWorkplaces(DEFAULT_WORKPLACES.map((w, i) => ({ ...w, personName: ['Alex', 'Sam'][i], officeDays: 3, placeName: w.name }))); setAdding(false); setFocusedMap(false); }} />
          {matchingActive && <><div className="preferences-reveal panel-section"><button className="preferences-toggle" aria-expanded={preferencesOpen} onClick={() => setPreferencesOpen(v => !v)}><span><b>Make it feel like home</b><small>{preferenceCount ? `${preferenceCount} priorities active` : 'Parks, flatter streets, everyday essentials'}</small></span><span aria-hidden="true">{preferencesOpen ? '−' : '+'}</span></button></div>{preferencesOpen && <PreferencePanel input={input} onChange={(id, level) => { setUndoSettings(null); setAutosave(true); setPrefs(p => ({ ...p, [id]: level })); }} onOrderChange={order => { setUndoSettings(null); setAutosave(true); setPriorityOrder(order); }} />}<TradeoffPanel key={String(pending) + blocked + areas.map(a => a.fetchedAt || a.label).join(';') + JSON.stringify(workplaces) + JSON.stringify(prefs) + priorityOrder.join(',')} input={input} workplaces={workplaces} commute={commute} onUndo={undoSettings ? () => { setPrefs(undoSettings.prefs); setPriorityOrder(undoSettings.priorityOrder); setWorkplaces(undoSettings.workplaces); setUndoSettings(null); } : undefined} onApply={(p, order, ws) => { setUndoSettings({prefs,priorityOrder,workplaces}); setPrefs(p); setPriorityOrder(order); if (ws) setWorkplaces(ws); }} /><div className="search-summary panel-section"><p>{blocked ? 'A required commute needs attention.' : pending ? 'Checking all destinations together.' : <><b>{rankedList.length} neighbourhoods</b> have matching locations.</>}</p><button className="btn primary wide" onClick={() => setPanel('results')}>{blocked ? 'Review matching status' : 'Explore your matches'} <span aria-hidden="true">→</span></button><p className="hint">{preferenceCount ? 'Your priorities guide the order. Must-haves stay required.' : 'Commute feasibility first. Add preferences to personalise the order.'}</p></div></>}
          <div className="search-footer">A home decision, made together.<button className="btn link" onClick={() => setAbout(true)}>Sources & confidence ↗</button></div>
        </aside>
        </section>
        <section className="matches-panel desktop-panel" aria-label="Results and selected place panel">
        <div className="desktop-panel-heading"><button className="panel-title" onClick={() => setPanel('results')}>Matches {matchingActive && <span className="count">{pending ? '…' : rankedList.length}</span>}</button><button className="icon-btn" aria-label="Collapse matches" aria-controls="matching-content" onClick={() => setRightCollapsed(true)}>›</button></div>
        <aside id="matching-content" ref={resultsPanel} className="resultsbar" hidden={panel !== 'results'} aria-label="Matching neighbourhoods">
          {selected ? <>{selectedCell && <div className="bookmark-action"><button className="btn" aria-pressed={!!savedCell} onClick={saveSelectedCell}>{savedCell ? '✓ Location bookmarked' : '+ Bookmark this location'}</button></div>}<NeighbourhoodDetail result={selected} metrics={data.metrics[selected.id]} content={data.content[selected.id]} rents={data.rents} cellResult={selectedCell} cellResults={cellResults.filter(r => r.nhoodId === selected.id)} onSelectCell={selectCell} workplaces={workplaces} saved={shortlist.includes(selected.id)} onToggleShortlist={() => toggleShortlist(selected.id)} onClose={() => { setSelectedId(null); setSelectedCellId(null); }} /></> : <ResultsList hoveredId={hoveredId} onHover={setHoveredId} ranked={rankedList} excluded={excluded} content={data.content} metrics={data.metrics} workplaces={workplaces} cellResults={cellById} showExcluded={showExcluded} onToggleExcluded={() => setShowExcluded(v => !v)} onSelect={selectNeighbourhood} shortlist={shortlist} onToggleShortlist={toggleShortlist} blocked={blocked} pending={pending} hasWorkplaces={matchingActive} nearMisses={misses} onSelectCell={selectCell} sort={resultsSort} onSortChange={setResultsSort} />}
        </aside>
        </section>
        {leftCollapsed && <button className="btn restore-panel restore-search" aria-label="Show your search" onClick={() => { setLeftCollapsed(false); setPanel('search'); }}><span aria-hidden="true">›</span> Your search</button>}
        {rightCollapsed && <button className="btn restore-panel restore-matches" aria-label="Show matches" onClick={() => { setRightCollapsed(false); setPanel('results'); }}>Matches <span aria-hidden="true">‹</span></button>}
      </div>
    </main>
    {(shared.file || shared.error) && <div className="shared-banner" role="status">{shared.error ?? `Shared scenario: ${shared.file!.scenario.name}. Opens a copy on this device.`}{shared.file && <button className="btn primary" onClick={() => { loadSnapshot(shared.file!.scenario.snapshot); setShared({ file: null, error: null }); history.replaceState(null, '', location.pathname + location.search); }}>Use shared scenario</button>}<button className="icon-btn" aria-label="Dismiss shared scenario" onClick={() => setShared({ file: null, error: null })}>×</button></div>}
    {storageError && <div className="storage-warning" role="alert">{storageError}<button className="btn link" onClick={() => setScenariosOpen(true)}>Export a copy</button></div>}
    {analysisError && <div className="storage-warning" role="alert">Local measurements could not load. Your settings are kept.<button className="btn" onClick={() => setAnalysisRetry(n => n + 1)}>Retry local data</button></div>}
    {(homesOpen || compareSaved) && !analysisReady && <Dialog title="Loading local evidence" onClose={() => { setHomesOpen(false); setCompareSaved(false); }}><p role="status">{analysisError || 'Loading the matching cells needed for this comparison...'}</p>{analysisError && <button className="btn primary" onClick={() => setAnalysisRetry(n => n + 1)}>Retry local data</button>}</Dialog>}
    {about && <DataNotice onClose={() => setAbout(false)} />}
    {scenariosOpen && <ScenarioPanel snapshot={snapshot} onLoad={loadSnapshot} onClose={() => setScenariosOpen(false)} />}
    {homesOpen && analysisReady && <HomePanel homes={homes} onChange={next => { setAutosave(true); setHomes(next); }} workplaces={workplaces} commute={commute} cells={data.cells} metrics={data.metrics} prefs={prefs} priorityOrder={priorityOrder} onPick={() => { setHomesOpen(false); setPickingHome(true); setAdding(false); setFocusedMap(true); }} selectedId={selectedHomeId} onSelect={setSelectedHomeId} onClose={() => setHomesOpen(false)} />}
    {compareSaved && analysisReady && <ShortlistComparison areas={results.filter(r => shortlist.includes(r.id))} cells={cellById} metrics={data.metrics} priorityOrder={priorityOrder} homes={homes} workplaces={workplaces} commute={commute} analysisCells={data.cells} prefs={prefs} bookmarks={bookmarks} onBookmarksChange={next => { setAutosave(true); const kept = new Set(next.map(b => b.id)); const removed = bookmarks.filter(b => b.kind === 'neighbourhood' && !kept.has(b.id)).map(b => b.neighbourhoodId); setShortlist(s => s.filter(id => !removed.includes(id))); setBookmarks(next); }} fingerprint={settingsFingerprint(snapshot)} onClose={() => setCompareSaved(false)} onSelect={id => { setCompareSaved(false); selectNeighbourhood(id); }} onSelectCell={id => { setCompareSaved(false); selectCell(id); }} onHomes={id => { if (id) setSelectedHomeId(id); setCompareSaved(false); setHomesOpen(true); }} />}
  </div>;
}
