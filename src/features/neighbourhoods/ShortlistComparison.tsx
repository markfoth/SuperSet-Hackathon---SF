import { Dialog } from '../scenarios/Dialog';
import { orderedPreferences } from '../filters/preferences';
import type { AreaResult, CellResult } from '../filters/ranking';
import type { AreaCellCollection, NeighbourhoodMetrics, PreferenceLevel, Workplace } from '../../types';
import type { CommuteResult } from '../commute/provider';
import type { Home, LocationBookmark } from '../scenarios/model';
import { evaluateHome, homeMonthlyCost } from '../homes/evaluation';
import { pct, usd } from '../../lib/format';

interface Props {
  areas: AreaResult[]; cells: Record<string, CellResult>; metrics: Record<string, NeighbourhoodMetrics>; priorityOrder: string[];
  homes: Home[]; workplaces: Workplace[]; commute: Record<string, CommuteResult | undefined>; analysisCells: AreaCellCollection;
  prefs: Record<string, PreferenceLevel>; bookmarks: LocationBookmark[]; fingerprint: string;
  onBookmarksChange: (bookmarks: LocationBookmark[]) => void;
  onClose: () => void; onSelect: (id: string) => void; onSelectCell: (id: string) => void; onHomes: (id?: string) => void;
}
export function ShortlistComparison(p: Props) {
  const allBookmarks = p.bookmarks;
  p = { ...p, bookmarks: p.bookmarks.filter(b => b.kind === 'cell') };
  const count = p.areas.length + p.homes.length + p.bookmarks.length;
  const homes = p.homes.map(home => ({ home, evaluation: evaluateHome(home, p.workplaces, p.commute, p.analysisCells, p.metrics, p.prefs, p.priorityOrder), cost: homeMonthlyCost(home, p.workplaces) }));
  return <Dialog title="Compare your shortlist" onClose={p.onClose} className="comparison">
    <p className="decision-intro">The right place is a shared decision.</p>
    <p className="hint">Compare neighbourhoods, precise bookmarks and prospective homes. Current settings are applied to every column. Neighbourhood measurements describe their leading eligible cell; homes use the actual pin for commute checks.</p>
    {!count && <div className="shortlist-empty"><h3>Keep a few possibilities open.</h3><p>Save neighbourhoods from your matches, bookmark a map cell, or add a home with its rent. You can compare three or more side by side.</p><button className="btn primary" onClick={p.onClose}>Explore matches</button><button className="btn" onClick={() => p.onHomes()}>Add a prospective home</button></div>}
    {count > 0 && <div className="comparison-scroll" tabIndex={0} aria-label="Scroll comparison table"><table>
      <thead><tr><th scope="col">{count} possibilities</th>{p.areas.map(r => <th scope="col" key={r.id}><span className="eyebrow">NEIGHBOURHOOD</span><button className="btn link" onClick={() => p.onSelect(r.id)}>{r.name} ↗</button></th>)}{homes.map(({ home }) => <th scope="col" key={home.id}><span className="eyebrow">SPECIFIC HOME</span><button className="btn link" onClick={() => p.onHomes(home.id)}>{home.name} ↗</button></th>)}{p.bookmarks.map(b => <th scope="col" key={b.id}><span className="eyebrow">BOOKMARKED LOCATION</span><button className="btn link" onClick={() => b.cellId ? p.onSelectCell(b.cellId) : p.onSelect(b.neighbourhoodId)}>{b.name} ↗</button></th>)}</tr></thead>
      <tbody>
        <tr><th scope="row">Matches now?</th>{p.areas.map(r => <td key={r.id}>{r.eligible ? `${r.eligibleCount} matching locations` : r.state === 'unknown' ? 'Required evidence unavailable' : 'No longer matches'}<small>{pct(r.eligibleShare)} of candidate land</small></td>)}{homes.map(({ home, evaluation: e }) => <td key={home.id}>{e.eligible ? 'Pin meets commute + cell constraints' : e.state === 'unknown' ? 'Required evidence unavailable' : 'Does not match'}<small>{e.unchecked.join(' ') || e.reasons.join(' ')}</small></td>)}{p.bookmarks.map(b => <td key={b.id}>{b.cellId && p.cells[b.cellId]?.eligible ? 'Matches current settings' : (!b.cellId || !p.cells[b.cellId] || p.cells[b.cellId]?.state === 'unknown') ? 'Required evidence unavailable' : 'Does not match current settings'}<small>{b.settingsFingerprint === p.fingerprint ? 'Settings unchanged since saved' : 'Settings changed since saved. Rechecked now.'}</small></td>)}</tr>
        {p.workplaces.map(w => <tr key={w.id}><th scope="row">{w.personName || w.name}<small>{w.name} · max {w.maxMinutes} min · {w.officeDays ?? 3} days/week</small></th>{p.areas.map(r => <td key={r.id}>{r.bestCellId && p.cells[r.bestCellId]?.commute.byWorkplace[w.id] === true ? 'Leading cell inside catchment' : 'Not confirmed'}<small>No exact time inferred</small></td>)}{homes.map(({ home, evaluation: e }) => <td key={home.id}>{e.commute.byWorkplace[w.id] === true ? 'Home pin inside catchment' : e.commute.byWorkplace[w.id] === false ? 'Home pin outside catchment' : 'Unknown'}<small>Use Homes for requested route times</small></td>)}{p.bookmarks.map(b => <td key={b.id}>{b.cellId && p.cells[b.cellId]?.commute.byWorkplace[w.id] === true ? 'Inside catchment' : 'Not confirmed'}</td>)}</tr>)}
        {orderedPreferences(p.priorityOrder).filter(pref => p.prefs[pref.id] && p.prefs[pref.id] !== 'off').map(pref => <tr key={pref.id}><th scope="row">{pref.label}<small>{p.prefs[pref.id]}</small></th>{p.areas.map(r => <td key={r.id}>{r.bestCellId ? pref.format(pref.value(p.cells[r.bestCellId].cell)) : 'No eligible cell'}</td>)}{homes.map(({ home, evaluation: e }) => <td key={home.id}>{e.cell ? pref.format(pref.value(e.cell)) : 'Unavailable'}<small>Inherited from map cell</small></td>)}{p.bookmarks.map(b => <td key={b.id}>{b.cellId && p.cells[b.cellId] ? pref.format(pref.value(p.cells[b.cellId].cell)) : 'Unavailable'}</td>)}</tr>)}
        <tr><th scope="row">Monthly rent</th>{p.areas.map(r => <td key={r.id}>{usd(p.metrics[r.id].rents?.typical_rent_zip_weighted)}<small>ZIP overlap asking-rent index, all types</small></td>)}{homes.map(({ home }) => <td key={home.id}>{home.rent == null ? 'Enter rent' : usd(home.rent)}<small>User-entered property rent</small></td>)}{p.bookmarks.map(b => <td key={b.id}>{usd(b.cellId ? p.cells[b.cellId]?.cell.zip_asking_rent : null)}<small>ZIP index, not a home estimate</small></td>)}</tr>
        <tr><th scope="row">Rent + monthly transport</th>{p.areas.map(r => <td key={r.id}>Property rent needed</td>)}{homes.map(({ home, cost }) => <td key={home.id}>{cost.monthlyTotal == null ? 'Enter rent and return fare' : usd(cost.monthlyTotal)}<small>User assumptions · {cost.officeDaysPerWeek} destination days/week · 52/12 weeks/month</small></td>)}{p.bookmarks.map(b => <td key={b.id}>Property rent needed</td>)}</tr>
      </tbody>
    </table></div>}
    {allBookmarks.length > 0 && <section className="bookmark-notes"><h3>Notes for your saved locations</h3>{allBookmarks.map(b => <label key={b.id}>{b.name}<textarea rows={2} maxLength={5000} value={b.notes} onChange={e => p.onBookmarksChange(allBookmarks.map(x => x.id === b.id ? { ...x, notes: e.target.value } : x))} placeholder="What would make this work?" /><button className="btn link" onClick={() => p.onBookmarksChange(allBookmarks.filter(x => x.id !== b.id))}>Remove bookmark</button></label>)}</section>}
    {!!count && <p className="hint">Exact route-time comparisons are available in Homes after an explicit request. Isochrones alone cannot establish the fastest, fairest or lowest weekly travel option.</p>}
  </Dialog>;
}
