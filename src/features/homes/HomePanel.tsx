import { useEffect, useMemo, useState } from 'react';
import type { AreaCellCollection, NeighbourhoodMetrics, PreferenceLevel, Workplace } from '../../types';
import type { CommuteResult } from '../commute/provider';
import { requestJourneyTimes, journeySummary, type JourneyEvidence } from '../commute/journeys';
import { PREFERENCES } from '../filters/preferences';
import { PlaceSearch } from '../places/PlaceSearch';
import { Dialog } from '../scenarios/Dialog';
import { createHome, validateHome, type Home } from '../scenarios/model';
import { evaluateHome, homeMonthlyCost } from './evaluation';
import { usd } from '../../lib/format';
import '../scenarios/scenarios.css';

export interface HomePanelProps {
  homes: Home[];
  onChange: (homes: Home[]) => void;
  workplaces: Workplace[];
  commute: Record<string, CommuteResult | undefined>;
  cells: AreaCellCollection;
  metrics: Record<string, NeighbourhoodMetrics>;
  prefs: Record<string, PreferenceLevel>;
  priorityOrder: string[];
  onPick: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

interface Draft { name: string; lat: string; lon: string; rent: string; bedrooms: string; listingUrl: string; notes: string; fare: string; other: string }
const toDraft = (home: Home): Draft => ({ name: home.name, lat: String(home.lat), lon: String(home.lon), rent: home.rent == null ? '' : String(home.rent), bedrooms: home.bedrooms == null ? '' : String(home.bedrooms), listingUrl: home.listingUrl, notes: home.notes, fare: home.transportReturnFare == null ? '' : String(home.transportReturnFare), other: String(home.monthlyTransportOther) });
const STATE_LABELS = { strong: 'Checks pass', partial: 'Passes with compromises', excluded: 'Does not meet current requirements', unknown: 'More evidence needed' };
const journeyKey = (home: Home, workplaces: Workplace[]) => JSON.stringify({ lat: home.lat, lon: home.lon,
  workplaces: workplaces.map((w) => ({ id: w.id, lat: w.lat, lon: w.lon, mode: w.mode, arrivalTime: w.arrivalTime, officeDays: w.officeDays, personId: w.personId, personName: w.personName })) });
const minutes = (value: number | null | undefined) => value == null ? 'Not measured' : `${Math.round(value)} min`;

export function HomePanel(props: HomePanelProps) {
  const { homes, onChange, workplaces, commute, cells, metrics, prefs, priorityOrder, onPick, selectedId, onSelect, onClose } = props;
  const selected = homes.find((home) => home.id === selectedId) ?? homes[0];
  const [draft, setDraft] = useState<Draft | null>(() => selected ? toDraft(selected) : null);
  const [error, setError] = useState<string | null>(null), [status, setStatus] = useState<string | null>(null), [confirmDelete, setConfirmDelete] = useState(false);
  const [addByCoordinates, setAddByCoordinates] = useState(false), [newLat, setNewLat] = useState(''), [newLon, setNewLon] = useState('');
  const [journeys, setJourneys] = useState<Record<string, { key: string; evidence: JourneyEvidence }>>({});
  useEffect(() => { setDraft(selected ? toDraft(selected) : null); setError(null); setStatus(null); setConfirmDelete(false); }, [selected?.id]);
  const evaluations = useMemo(() => Object.fromEntries(homes.map((home) => [home.id, evaluateHome(home, workplaces, commute, cells, metrics, prefs, priorityOrder)])), [homes, workplaces, commute, cells, metrics, prefs, priorityOrder]);
  const costs = useMemo(() => Object.fromEntries(homes.map((home) => [home.id, homeMonthlyCost(home, workplaces)])), [homes, workplaces]);
  const evaluation = selected ? evaluations[selected.id] : null;
  const summaries = Object.fromEntries(homes.map((home) => { const saved = journeys[home.id]; return [home.id, saved?.key === journeyKey(home, workplaces) ? journeySummary(saved.evidence) : null]; }));
  const patch = (key: keyof Draft, value: string) => setDraft((d) => d ? { ...d, [key]: value } : d);
  const add = (lat: number, lon: number, name?: string) => {
    try {
      if (homes.length >= 30) throw new Error('You can keep up to 30 homes in one scenario. Remove a home or start another scenario.');
      const home = createHome(lat, lon, name); onChange([...homes, home]); onSelect(home.id); setAddByCoordinates(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not add this home.'); }
  };
  return <Dialog title="Prospective homes" onClose={onClose} className="home-dialog">
    <p className="decision-intro">A few real possibilities. One clearer decision.</p>
    <p className="hint">Add a home yourself, without connecting a property site. Commutes use its exact pin; local context keeps its original geographical precision.</p>
    <div className="home-layout"><section className="home-list" aria-label="Saved homes">
      <PlaceSearch onSelect={(place) => add(place.lat, place.lon, place.name)} placeholder="Find a nearby named place" ariaLabel="Search for a place near a home" actionLabel="Find places" />
      <div className="decision-actions"><button className="btn primary" disabled={homes.length >= 30} onClick={onPick}>Place home on map</button><button className="btn link" onClick={() => setAddByCoordinates((show) => !show)}>Enter coordinates</button></div>
      {addByCoordinates && <form className="home-form" onSubmit={(event) => { event.preventDefault(); add(Number(newLat), Number(newLon)); }}><div className="home-fields"><label>Latitude<input type="number" required min={-90} max={90} step="any" value={newLat} onChange={(event) => setNewLat(event.target.value)} /></label><label>Longitude<input type="number" required min={-180} max={180} step="any" value={newLon} onChange={(event) => setNewLon(event.target.value)} /></label></div><button className="btn" type="submit">Add home pin</button></form>}
      <p className="hint">The search covers named places, not every street address. Place a pin precisely on your prospective home.</p>
      {!homes.length && <p className="hint">Your homes will appear here. Add at least two to compare costs and local evidence.</p>}
      {homes.map((home) => <article key={home.id} className={`home-list-item ${home.id === selected?.id ? 'selected' : ''}`}><button type="button" aria-pressed={home.id === selected?.id} onClick={() => onSelect(home.id)}><strong>{home.name}</strong><small>{home.rent == null ? 'Rent not entered' : `${usd(home.rent)}/month`} · {STATE_LABELS[evaluations[home.id].state]}</small></button></article>)}
    </section><section className="home-detail" aria-label="Selected home">
      {selected && draft ? <>
        <form className="home-form" onSubmit={(event) => {
          event.preventDefault();
          try {
            const next = validateHome({ ...selected, name: draft.name, lat: Number(draft.lat), lon: Number(draft.lon), rent: draft.rent === '' ? null : Number(draft.rent), bedrooms: draft.bedrooms === '' ? null : Number(draft.bedrooms), listingUrl: draft.listingUrl.trim(), notes: draft.notes, transportReturnFare: draft.fare === '' ? null : Number(draft.fare), monthlyTransportOther: draft.other === '' ? 0 : Number(draft.other) });
            onChange(homes.map((home) => home.id === selected.id ? next : home)); setError(null); setStatus('Home details updated.');
          } catch (e) { setError(e instanceof Error ? e.message : 'Check the home details and try again.'); }
        }}>
          <h3>Selected home</h3><label>Home label<input required value={draft.name} maxLength={160} onChange={(event) => patch('name', event.target.value)} placeholder="e.g. Sunny flat on 24th Street" /></label>
          <div className="home-fields"><label>Pin latitude<input type="number" required min={-90} max={90} step="any" value={draft.lat} onChange={(event) => patch('lat', event.target.value)} /></label><label>Pin longitude<input type="number" required min={-180} max={180} step="any" value={draft.lon} onChange={(event) => patch('lon', event.target.value)} /></label><label>Monthly rent · USD<input type="number" min={0} max={1000000} step="any" value={draft.rent} onChange={(event) => patch('rent', event.target.value)} placeholder="Enter the listing rent" /></label><label>Bedrooms · optional<input type="number" min={0} max={30} step={1} value={draft.bedrooms} onChange={(event) => patch('bedrooms', event.target.value)} placeholder="0 for studio" /></label><label className="full-width">Listing link · optional<input type="url" maxLength={2000} value={draft.listingUrl} onChange={(event) => patch('listingUrl', event.target.value)} placeholder="https://…" /></label><label className="full-width">Notes<textarea aria-label="Notes" rows={2} maxLength={5000} value={draft.notes} onChange={(event) => patch('notes', event.target.value)} placeholder="Viewing notes, concerns or a question for your household" /></label></div>
          <details><summary>Monthly transport assumptions</summary><p className="hint">Enter your expected out-of-pocket costs. These are your assumptions, not quoted fares.</p><div className="home-fields"><label>Return fare per destination day · USD<input type="number" min={0} max={10000} step="any" value={draft.fare} onChange={(event) => patch('fare', event.target.value)} placeholder="Leave blank if unknown" /></label><label>Other transport each month · USD<input type="number" min={0} max={1000000} step="any" value={draft.other} onChange={(event) => patch('other', event.target.value)} /></label></div><p className="hint">{costs[selected.id].assumptions.join(' ')}</p></details>
          <div className="decision-actions"><button className="btn primary" type="submit">Save home details</button>{selected.listingUrl && <a className="btn" href={selected.listingUrl} target="_blank" rel="noreferrer">Open listing ↗</a>}{confirmDelete ? <><button className="btn danger" type="button" onClick={() => { const next = homes.filter((home) => home.id !== selected.id); onChange(next); if (next[0]) onSelect(next[0].id); }}>Confirm remove</button><button className="btn link" type="button" onClick={() => setConfirmDelete(false)}>Keep</button></> : <button className="btn link" type="button" onClick={() => setConfirmDelete(true)}>Remove home</button>}</div>
        </form>
        {evaluation && <section className="home-evidence" aria-label="Home matching evidence"><h3>How this pin checks out</h3><span className={`home-state ${evaluation.state}`}>{STATE_LABELS[evaluation.state]}</span><p className="hint">{evaluation.neighbourhoodId ? metrics[evaluation.neighbourhoodId]?.name : 'Outside measured local coverage'}{evaluation.cell ? ` · local cell ${evaluation.cell.h3}` : ''}</p>
          <ul className="facts">{workplaces.map((workplace) => <li key={workplace.id}><span>{workplace.name} · ≤ {workplace.maxMinutes} min</span><b>{evaluation.commute.byWorkplace[workplace.id] === true ? 'Pin inside catchment' : evaluation.commute.byWorkplace[workplace.id] === false ? 'Pin outside catchment' : 'Not calculated'}</b></li>)}</ul>
          {[...evaluation.reasons, ...evaluation.unchecked].map((reason) => <p className="card-warn" key={reason}>{reason}</p>)}
          {evaluation.criteria.length > 0 && <ul className="facts">{evaluation.criteria.map((criterion) => { const def = PREFERENCES.find((p) => p.id === criterion.prefId)!; return <li key={criterion.prefId}><span>{def.label} · inherited</span><b>{def.format(criterion.value)}</b></li>; })}</ul>}
          <p className="hint">A catchment is a routing estimate for the entered arrival time, not a guaranteed journey. This check uses the actual home pin. Street gradients and proximity measures come from the containing cell; reported incidents remain H3-8, pollution tract-level and rent context ZIP-level.</p>
          <HomeJourneyCheck home={selected} workplaces={workplaces} onEvidence={(key, evidence) => setJourneys((current) => ({ ...current, [selected.id]: { key, evidence } }))} />
        </section>}
      </> : <div className="home-empty"><h3>Put a possibility on the map</h3><p className="hint">Start with a pin, then add the rent, a listing link and anything your household wants to remember.</p><button className="btn primary" disabled={homes.length >= 30} onClick={onPick}>Place home on map</button></div>}
    </section></div>
    {error && <p role="alert" className="card-warn">{error}</p>}{status && <p role="status" className="scenario-message">{status}</p>}
    {homes.length > 0 && <section className="home-comparison" aria-label="Compare home costs"><h3>Compare your homes</h3><p className="hint">Actual entered rents and transparent transport assumptions. Missing costs stay unknown. Check journey times for each home to compare travel burdens.</p><div className="home-comparison-scroll"><table><thead><tr><th scope="col">Current household settings</th>{homes.map((home) => <th scope="col" key={home.id}><button onClick={() => onSelect(home.id)}>{home.name}</button></th>)}</tr></thead><tbody><tr><th scope="row">Checks at home pin</th>{homes.map((home) => <td key={home.id}>{STATE_LABELS[evaluations[home.id].state]}<small>Local preferences inherited from containing cell</small></td>)}</tr><tr><th scope="row">Monthly rent</th>{homes.map((home) => <td key={home.id}>{home.rent == null ? 'Not entered' : usd(home.rent)}<small>User-entered listing rent</small></td>)}</tr><tr><th scope="row">Monthly transport</th>{homes.map((home) => <td key={home.id}>{costs[home.id].monthlyTransport == null ? 'Unknown' : usd(costs[home.id].monthlyTransport)}<small>{costs[home.id].officeDaysPerWeek} destination days/week</small></td>)}</tr><tr><th scope="row">Rent + transport / month</th>{homes.map((home) => <td key={home.id}><b>{costs[home.id].monthlyTotal == null ? 'Incomplete costs' : usd(costs[home.id].monthlyTotal)}</b></td>)}</tr><tr><th scope="row">Illustrative total weekly travel</th>{homes.map((home) => <td key={home.id}>{minutes(summaries[home.id]?.totalWeeklyMinutes)}<small>Inbound estimates doubled for return trips</small></td>)}</tr><tr><th scope="row">Longest individual one-way commute</th>{homes.map((home) => <td key={home.id}>{minutes(summaries[home.id]?.worstMinutes)}</td>)}</tr><tr><th scope="row">Gap in weekly travel burden</th>{homes.map((home) => <td key={home.id}>{minutes(summaries[home.id]?.balanceMinutes)}<small>Highest minus lowest person total; lower is more balanced</small></td>)}</tr><tr><th scope="row">ZIP-level rent context</th>{homes.map((home) => <td key={home.id}>{evaluations[home.id].cell?.zip_asking_rent == null ? 'Unavailable' : `${usd(evaluations[home.id].cell!.zip_asking_rent)}/month`}<small>Whole-ZIP index, not a bedroom-specific property estimate</small></td>)}</tr><tr><th scope="row">Notes</th>{homes.map((home) => <td className="home-notes" key={home.id}>{home.notes || 'No notes yet'}</td>)}</tr></tbody></table></div></section>}
  </Dialog>;
}

/** Kept separate so in-flight exact times cannot replace the matching gate. */
function HomeJourneyCheck({ home, workplaces, onEvidence }: { home: Home; workplaces: Workplace[]; onEvidence: (key: string, evidence: JourneyEvidence) => void }) {
  const [loadingKey, setLoadingKey] = useState<string | null>(null), [error, setError] = useState<{ key: string; message: string } | null>(null);
  const [result, setResult] = useState<{ key: string; evidence: JourneyEvidence } | null>(null);
  const key = journeyKey(home, workplaces), evidence = result?.key === key ? result.evidence : null;
  const summary = evidence ? journeySummary(evidence) : null;
  return <section className="home-evidence" aria-label="Exact journey estimates"><h3>Compare the commute burden</h3><p className="hint">Catchments say whether a pin is reachable. Exact journey estimates are requested only when you choose, using the configured routing service.</p><button className="btn" disabled={loadingKey === key || !workplaces.length} onClick={async () => {
    setLoadingKey(key); setError(null);
    try {
      const result = await requestJourneyTimes(home, workplaces);
      setResult({ key, evidence: result }); onEvidence(key, result);
    } catch (e) { setError({ key, message: e instanceof Error ? e.message : 'Journey estimates are unavailable.' }); }
    finally { setLoadingKey((current) => current === key ? null : current); }
  }}>{loadingKey === key ? 'Checking journey times…' : 'Check journey times'}</button>{error?.key === key && <p role="status" className="hint">{error.message}</p>}
    {evidence && <div aria-live="polite"><ul className="facts">{evidence.journeys.map((journey) => <li key={journey.workplaceId}><span>{journey.personName} · {journey.name}</span><b>{journey.status === 'ok' && journey.seconds != null ? `${Math.round(journey.seconds / 60)} min one way` : journey.status === 'unreachable' ? 'No route returned' : 'Not measured'}</b></li>)}</ul>{evidence.journeys.filter((journey) => journey.reason).map((journey) => <p className="hint" key={journey.workplaceId}>{journey.name}: {journey.reason}</p>)}
      {summary?.complete && <div className="journey-summary"><span><b>{minutes(summary.totalWeeklyMinutes)}</b>Illustrative household week</span><span><b>{minutes(summary.worstMinutes)}</b>Longest one-way commute</span><span><b>{minutes(summary.balanceMinutes)}</b>Gap between weekly person totals</span></div>}
      {summary?.people.map((person) => <p className="hint" key={person.id}>{person.name}: {minutes(person.weeklyMinutes)} illustrative weekly return travel.</p>)}
      <p className="hint">Checked {new Date(evidence.fetchedAt).toLocaleString('en-GB')}{evidence.arrivalDate ? ` · arrival date ${evidence.arrivalDate}` : ''}.</p>{evidence.assumptions.map((assumption) => <p className="hint" key={assumption}>{assumption}</p>)}
    </div>}
  </section>;
}
