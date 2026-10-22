import { NeighbourhoodPhoto } from '../../components/NeighbourhoodPhoto';
import { MATCH_COLORS } from '../../map/MapView';
import { usd } from '../../lib/format';
import type { AreaResult, nearMisses } from '../filters/ranking';
import type { NeighbourhoodContent, NeighbourhoodMetrics, Workplace } from '../../types';
import { reasonText } from './reasons';
import { sortResults, type ResultSort } from './sortResults';

interface Props {
  ranked: AreaResult[];
  excluded: AreaResult[];
  content: Record<string, NeighbourhoodContent>;
  metrics: Record<string, NeighbourhoodMetrics>;
  workplaces: Workplace[];
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
  if (!p.hasWorkplaces) return <div className="results notice">Add at least one workplace to discover reachable areas.</div>;
  if (p.pending) return <div className="results" role="status">Calculating every workplace’s commute before showing matches…</div>;
  if (p.blocked) {
    return (
      <div className="results">
        <div className="notice error">
          <b>Commute can’t be calculated.</b> {p.blocked}
          <br />Remove or move the workplace back to a demo location — results won’t be shown without the commute you asked for.
        </div>
      </div>
    );
  }
  return (
    <div className="results">
      <div className="results-head">
        <h2>{p.ranked.length} area{p.ranked.length === 1 ? '' : 's'} with matches</h2>
        <button className="btn link" onClick={p.onToggleExcluded}>
          {p.showExcluded ? 'Hide' : 'Show'} other areas
        </button>
      </div>
      <label className="results-sort">Sort by
        <select aria-label="Sort by" value={p.sort} onChange={(e) => p.onSortChange(e.target.value as ResultSort)}>
          <option value="recommended">Best match</option>
          <option value="rent-asc">Rent: low to high</option>
          <option value="rent-desc">Rent: high to low</option>
        </select>
      </label>
      <p className="hint">Rent sorting uses ZIP-level asking estimates. Unavailable prices appear last.</p>
      {p.ranked.length === 0 && (
        <div className="notice">No area meets every requirement. Relax a “Must” or increase a commute time — the excluded list shows why each area was removed.</div>
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
              <li key={r.id} className="card compact" onClick={() => p.onSelect(r.id)}>
                <div className="card-title">{r.name}</div>
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

function Card({ r, rank, content, metrics, onSelect, shortlist, onToggleShortlist }: Props & { r: AreaResult; rank: number }) {
  const c = content[r.id];
  const m = metrics[r.id];
  const photo = c?.photos[0];
  const saved = shortlist.includes(r.id);
  return (
    <li className="card" data-area-id={r.id} onClick={() => onSelect(r.id)}>
      <div className="card-photo">
        <NeighbourhoodPhoto key={photo?.local ?? photo?.url} photo={photo} />
        {photo && <a className="card-photo-credit" href={photo.page} target="_blank" rel="noreferrer"
          title={`Photo: ${photo.credit} · ${photo.licence}`} onClick={(event) => event.stopPropagation()}>
          {photo.credit} · {photo.licence}
        </a>}
        <span className="rank" style={{ background: MATCH_COLORS[r.state] }}>{rank}</span>
        <button
          className={`save ${saved ? 'on' : ''}`} aria-pressed={saved} aria-label={saved ? 'Remove from shortlist' : 'Save to shortlist'}
          onClick={(e) => { e.stopPropagation(); onToggleShortlist(r.id); }}
        >{saved ? '♥' : '♡'}</button>
      </div>
      <div className="card-body">
        {photo?.caption && <p className="card-photo-caption">{photo.caption}</p>}
        <div className="card-title">{r.name}</div>
        <div className="suitability"><b>{r.eligibleCount} area{r.eligibleCount === 1 ? '' : 's'} found</b></div>
        <div className="tags">{c?.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}</div>
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
