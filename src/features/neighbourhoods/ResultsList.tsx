import { NeighbourhoodPhoto } from '../../components/NeighbourhoodPhoto';
import { scoreColor } from '../../map/MapView';
import { usd } from '../../lib/format';
import type { AreaResult } from '../filters/ranking';
import type { NeighbourhoodContent, NeighbourhoodMetrics, Workplace } from '../../types';
import { reasonText } from './reasons';

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
}

export function ResultsList(p: Props) {
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
        <h2>{p.ranked.length} neighbourhood{p.ranked.length === 1 ? '' : 's'} fit</h2>
        <button className="btn link" onClick={p.onToggleExcluded}>
          {p.showExcluded ? 'Hide' : 'Show'} {p.excluded.length} excluded
        </button>
      </div>
      {p.ranked.length === 0 && (
        <div className="notice">No neighbourhood meets every requirement. Relax a “Must” or increase a commute time — the excluded list shows why each area was removed.</div>
      )}
      <ol className="cards">
        {p.ranked.map((r, i) => (
          <Card key={r.id} r={r} rank={i + 1} {...p} />
        ))}
      </ol>
      {p.showExcluded && p.excluded.length > 0 && (
        <>
          <h3 className="excluded-head">Excluded</h3>
          <ul className="cards excluded">
            {p.excluded.map((r) => (
              <li key={r.id} className="card compact" onClick={() => p.onSelect(r.id)}>
                <div className="card-title">{r.name}</div>
                <ul className="reasons">{r.reasons.map((x, j) => <li key={j}>{reasonText(x, p.workplaces)}</li>)}</ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Card({ r, rank, content, metrics, workplaces, onSelect, shortlist, onToggleShortlist }: Props & { r: AreaResult; rank: number }) {
  const c = content[r.id];
  const m = metrics[r.id];
  const photo = c?.photos[0];
  const saved = shortlist.includes(r.id);
  return (
    <li className="card" onClick={() => onSelect(r.id)}>
      <div className="card-photo">
        <NeighbourhoodPhoto photo={photo} />
        <span className="rank" style={{ background: scoreColor(r.score) }}>{rank}</span>
        <button
          className={`save ${saved ? 'on' : ''}`} aria-pressed={saved} aria-label={saved ? 'Remove from shortlist' : 'Save to shortlist'}
          onClick={(e) => { e.stopPropagation(); onToggleShortlist(r.id); }}
        >{saved ? '♥' : '♡'}</button>
      </div>
      <div className="card-body">
        <div className="card-title">{r.name}</div>
        <div className="tags">{c?.tags.slice(0, 3).map((t) => <span key={t} className="tag">{t}</span>)}</div>
        <div className="card-facts">
          {r.commute && workplaces.map((w) => (
            <span key={w.id}>{Math.round((r.commute!.byWorkplace[w.id] ?? 0) * 100)}% ≤ {w.maxMinutes} min to {w.name}</span>
          ))}
          {m.rents?.typical_rent_zip_weighted != null && <span>~{usd(m.rents.typical_rent_zip_weighted)}/mo asking (ZIP-level)</span>}
        </div>
        {r.active > 0 && r.assessed < r.active && <div className="card-warn">{r.assessed} of {r.active} preferences could be assessed here</div>}
        {r.unchecked.length > 0 && <div className="card-warn">Couldn’t check a must-have (no data)</div>}
      </div>
    </li>
  );
}
