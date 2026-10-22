import type { CellResult } from '../filters/ranking';
import { PREFERENCES } from '../filters/preferences';
import { reasonText } from './reasons';
import type { Workplace } from '../../types';
import { num, pct, usd } from '../../lib/format';

const LABELS = { strong: 'Strong match', partial: 'Partial match', excluded: 'Excluded', unknown: 'Insufficient information' };

export function CellDetail({ result: r, workplaces }: { result: CellResult; workplaces: Workplace[] }) {
  const p = r.cell;
  return <section className={`cell-detail ${r.state}`} aria-label="Selected local cell">
    <div className="cell-heading"><b>{LABELS[r.state]}</b><span>H3 resolution 9 · {(p.area_m2 / 1e6).toFixed(3)} km²</span></div>
    <p className="hint">Cell {r.id}. Matching checks its representative location; conditions and route times can vary by address.</p>
    {r.reasons.length > 0 && <ul className="reasons">{r.reasons.map((x, i) => <li key={i}>{reasonText(x, workplaces)}</li>)}</ul>}
    {r.unchecked.length > 0 && <p className="card-warn">Required information unavailable: {r.unchecked.map((id) => PREFERENCES.find((x) => x.id === id)?.label ?? id).join(', ')}. This cell is not a confirmed match.</p>}
    <ul className="facts">
      {workplaces.map((w) => <li key={w.id}><span>{w.name} · ≤ {w.maxMinutes} min</span><b>{r.commute.byWorkplace[w.id] === true ? 'Inside catchment' : r.commute.byWorkplace[w.id] === false ? 'Outside catchment' : 'Not calculated'}</b></li>)}
    </ul>
    {r.eligible && <p className="cell-explanation">All commute requirements and measured Must-haves satisfied at this location.</p>}
    {r.criteria.length > 0 && <><h3>Your priorities, in order</h3><ol className="priority-explanations">
      {r.criteria.map((c) => {
        const def = PREFERENCES.find((d) => d.id === c.prefId)!;
        return <li key={c.prefId}><b>{def.label}</b> · {c.level === 'must' ? 'Must-have' : c.level === 'important' ? 'Important' : 'Nice to have'}<br />
          {def.format(c.value)}{c.value != null ? ` · ${c.passes ? 'meets' : 'below'} your target` : ''}
          {c.comparison && <small>{c.comparison === 'above' ? 'Stronger' : c.comparison === 'below' ? 'Weaker' : 'Similar'} measured preference band compared with the median eligible cell.</small>}
        </li>;
      })}
    </ol></>}
    <h3>Local measurements</h3>
    <ul className="facts">{PREFERENCES.map((d) => <li key={d.id}><span>{d.label}</span><b>{d.format(d.value(p))}</b></li>)}
      <li><span>Steeper street windows (over 10%)</span><b>{p.steep_street_share == null ? 'Unavailable' : pct(p.steep_street_share)}</b></li>
      <li><span>90th percentile street grade</span><b>{p.street_grade_p90_pct == null ? 'Unavailable' : `${num(p.street_grade_p90_pct, 1)}%`}</b></li>
      <li><span>Street measurement coverage</span><b>{p.grade_coverage == null ? 'Unavailable' : `${pct(p.grade_coverage)} · ${num(p.measured_street_m)} m measured`}</b></li>
    </ul>
    <p className="hint">Street gradients are DEM-derived estimates, not surveyed grades. Access is straight-line proximity, without an entrance or street-network model.</p>
    <p className="hint">Residential evidence: {p.residential_reason}.</p>
    {r.warnings.length > 0 && <ul className="reasons">{r.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    <details><summary>Sources & geographical precision</summary>
      <ul className="source-list">{PREFERENCES.map((d) => <li key={d.id}><b>{d.label}</b>: {d.source}. {d.resolution}.</li>)}</ul>
      <p className="hint">Reported incidents share source H3-8 cell {p.crime_source_h3}; the value was not measured separately here.</p>
      <p className="hint">PM2.5: {p.pm25_percentile == null ? 'unavailable' : `${p.pm25_percentile} statewide percentile`} · census tract {p.tract_id ?? 'unavailable'} (whole-tract value).</p>
      <p className="hint">ZIP {p.rent_zip ?? 'unavailable'} asking-rent index: {p.zip_asking_rent == null ? 'unavailable' : `${usd(p.zip_asking_rent)}/mo`}. Shared ZIP-level historical index, not this cell’s rent.</p>
      <p className="hint"><a href="https://data.sf.gov/d/3psu-pn9h" target="_blank" rel="noreferrer">Official streets</a> · <a href="https://www.usgs.gov/3d-elevation-program" target="_blank" rel="noreferrer">USGS elevation</a> · <a href="https://data.sf.gov/d/wg3w-h783" target="_blank" rel="noreferrer">Incident reports</a></p>
    </details>
  </section>;
}
