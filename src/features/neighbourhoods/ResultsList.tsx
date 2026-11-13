import { NeighbourhoodPhoto } from '../../components/NeighbourhoodPhoto';
import { MATCH_COLORS } from '../../map/MapView';
import { usd } from '../../lib/format';
import type { AreaResult, CellResult, nearMisses } from '../filters/ranking';
import { PREFERENCES } from '../filters/preferences';
import type { NeighbourhoodContent, NeighbourhoodMetrics, Workplace } from '../../types';
import { reasonText } from './reasons';
import { sortResults, type ResultSort } from './sortResults';

interface Props {
  ranked: AreaResult[];
  excluded: AreaResult[];
  content: Record<string, NeighbourhoodContent>;
  metrics: Record<string, NeighbourhoodMetrics>;
  workplaces: Workplace[];
  cellResults: Record<string, CellResult>;
  showExcluded: boolean;
  onToggleExcluded: () => void;
  onSelect: (id: string) => void;
  shortlist: string[];
  onToggleShortlist: (id: string) => void;
  blocked: string | null;
  pending: boolean;
  hasWorkplaces: boolean;
  nearMisses: ReturnType<typeof nearMisses>;
  onSelectCell: (id: string) => void;
  sort: ResultSort;
  onSortChange: (sort: ResultSort) => void;
}

export function ResultsList(p: Props) {
  if (!p.hasWorkplaces) return <div className="results notice">Add a destination to discover matching locations.</div>;
  if (p.pending) return <div className="results" role="status">Calculating every workplace’s commute before showing matches…</div>;
  if (p.blocked) {
    return (
      <div className="results">
        <div className="notice error">
          <b>Commute can’t be calculated.</b> {p.blocked}
          <p>Retry from Your search, choose a supported example destination or remove the unavailable destination. Every required commute must be checked before a location can match.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="results">
      <div className="results-head">
        <h2>{p.ranked.length} neighbourhood{p.ranked.length === 1 ? '' : 's'} to explore</h2>
        <button className="btn link" onClick={p.onToggleExcluded}>
          {p.showExcluded ? 'Hide' : 'Show'} exclusions
        </button>
      </div>
      <label className="results-sort">Sort by
        <select aria-label="Sort by" value={p.sort} onChange={(e) => p.onSortChange(e.target.value as ResultSort)}>
          <option value="recommended">{p.ranked.some(r => r.active > 0) ? 'Best lifestyle match' : 'Commute matches'}</option>
          <option value="rent-asc">Rent: low to high</option>
          <option value="rent-desc">Rent: high to low</option>
        </select>
      </label>
      <p className="hint">{p.ranked.some(r => r.active > 0) ? 'Earlier priorities lead the order.' : 'No lifestyle priorities yet. This order reflects matching land, then name.'} Rent is ZIP-level context.</p>
      {p.ranked.length === 0 && (
        <div className="notice">No confirmed matches yet. Use Explore a compromise in Your search to preview a longer commute or relax a Must-have. Unknown measurements remain separate from failed requirements.</div>
      )}
      <ol className="cards">
        {sortResults(p.ranked, p.metrics, p.sort).map((r, i) => (
          <Card key={r.id} r={r} rank={i + 1} {...p} />
        ))}
      </ol>
      {p.nearMisses.length > 0 && <section className="near-misses">
        <h3>Near misses · {p.nearMisses.length} cells</h3>
        <p className="hint">Still excluded. Changing the indicated Must to Important would make these cells eligible.</p>
        {p.nearMisses.slice(0, 5).map((n) => <button className="near-miss" key={n.result.id} onClick={() => p.onSelectCell(n.result.id)}>
          <b>{n.result.name}</b><span>{n.pref.label}: {n.pref.format(n.value)}</span>
          <small>Needs {n.pref.mustHave.describe} · gap {n.gap.toFixed(1)} {n.pref.id === 'flat' ? 'percentage points' : n.pref.id === 'lowCrime' ? 'incidents/km²/yr' : 'm'}</small>
        </button>)}
      </section>}
      {p.showExcluded && p.excluded.length > 0 && (
        <>
          <h3 className="excluded-head">Excluded</h3>
          <ul className="cards excluded">
            {p.excluded.map((r) => (
              <li key={r.id} className="card compact">
                <button className="card-title" onClick={() => p.onSelect(r.id)}>{r.name}</button>
                <span className="hint">{r.state === 'unknown' ? 'Insufficient information' : 'No eligible candidate cells'}</span>
                <ul className="reasons">{r.reasons.map((x, j) => <li key={j}>{x.kind === 'mustHave' ? 'Example cell: ' : ''}{reasonText(x, p.workplaces)}</li>)}</ul>
                {r.unchecked.length > 0 && <p className="hint">Missing required information: {r.unchecked.join(', ')}</p>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Card({ r, rank, content, metrics, onSelect, shortlist, onToggleShortlist, cellResults, workplaces }: Props & { r: AreaResult; rank: number }) {
  const c = content[r.id];
  const m = metrics[r.id];
  const photo = c?.photos[0];
  const saved = shortlist.includes(r.id);
  const cell = r.bestCellId ? cellResults[r.bestCellId] : null;
  const strength = cell?.criteria.find(c => c.passes === true);
  const compromise = cell?.criteria.find(c => c.passes !== true);
  const description = (id: string, value: number | null) => {
    const def = PREFERENCES.find(p => p.id === id);
    return def ? `${def.label}: ${def.format(value)}` : '';
  };
  return (
    <li className="card" data-area-id={r.id} onClick={() => onSelect(r.id)}>
      <div className="card-photo">
        <NeighbourhoodPhoto key={photo?.local ?? photo?.url} photo={photo} />
        {photo && <a className="card-photo-credit" href={photo.page} target="_blank" rel="noreferrer"
          title={`Photo: ${photo.credit} · ${photo.licence}`} onClick={(event) => event.stopPropagation()}>
          {photo.credit} · {photo.licence}
        </a>}
        <span className="rank" style={{ background: MATCH_COLORS[r.state] }}>{r.active ? rank : '✓'}</span>
        <button
          className={`save ${saved ? 'on' : ''}`} aria-pressed={saved} aria-label={saved ? 'Remove from shortlist' : 'Save to shortlist'}
          onClick={(e) => { e.stopPropagation(); onToggleShortlist(r.id); }}
        >{saved ? '♥' : '♡'}</button>
      </div>
      <div className="card-body">
        {photo?.caption && <p className="card-photo-caption">{photo.caption}</p>}
        <button className="card-title" onClick={() => onSelect(r.id)}>{r.name} <span aria-hidden="true">↗</span></button>
        <div className="suitability"><b>{r.eligibleCount} matching location{r.eligibleCount === 1 ? '' : 's'}</b><span>{m.region === 'peninsula' ? 'Peninsula community' : 'San Francisco'}</span></div>
        <div className="card-commutes">{workplaces.map((w, i) => <span key={w.id}><i style={{ background: w.colour || ['#e8590c', '#7048e8', '#0c8599', '#c2255c'][i % 4] }} />{w.personName || w.name}: within {w.maxMinutes} min</span>)}</div>
        <p className="card-reason"><b>Why it fits</b> {strength ? description(strength.prefId, strength.value) : 'The leading cell meets every commute limit.'}</p>
        <p className="card-compromise"><b>{compromise ? 'The compromise' : 'Keep in mind'}</b> {compromise ? description(compromise.prefId, compromise.value) : 'Not every address in this neighbourhood matches.'}</p>
        <div className="card-facts">
          {m.rents?.typical_rent_zip_weighted != null
            ? <span className="asking-rent">~{usd(m.rents.typical_rent_zip_weighted)}/mo asking (ZIP-level)</span>
            : <span>ZIP-level asking rent unavailable</span>}
        </div>
        {r.active > 0 && r.assessed < r.active && <div className="card-warn">{r.assessed} of {r.active} preferences could be assessed here</div>}
        {r.unchecked.length > 0 && <div className="card-warn">Couldn’t check a must-have (no data)</div>}
      </div>
    </li>
  );
}
