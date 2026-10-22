import { NeighbourhoodPhoto } from '../../components/NeighbourhoodPhoto';
import { num, pct, usd } from '../../lib/format';
import { PREFERENCES } from '../filters/preferences';
import type { AreaResult } from '../filters/ranking';
import type { NeighbourhoodContent, NeighbourhoodMetrics, Workplace, ZipRent } from '../../types';
import { reasonText, rentalSearchLinks } from './reasons';

interface Props {
  result: AreaResult;
  metrics: NeighbourhoodMetrics;
  content: NeighbourhoodContent | undefined;
  rents: Record<string, ZipRent>;
  workplaces: Workplace[];
  saved: boolean;
  onToggleShortlist: () => void;
  onClose: () => void;
}

export function NeighbourhoodDetail({ result, metrics: m, content: c, rents, workplaces, saved, onToggleShortlist, onClose }: Props) {
  const photo = c?.photos[0];
  const mainZip = m.rents?.zips[0];
  const zipRent = mainZip ? rents[mainZip.zip] : undefined;
  return (
    <div className="detail">
      <div className="detail-top">
        <button className="btn link" onClick={onClose}>← Results</button>
        <button className={`btn ${saved ? 'primary' : ''}`} onClick={onToggleShortlist}>{saved ? '♥ Saved' : '♡ Save'}</button>
      </div>
      {photo && (
        <figure className="detail-photo">
          <NeighbourhoodPhoto photo={photo} />
          <figcaption>
            Photo: {photo.credit} · <a href={photo.licence_url ?? photo.page} target="_blank" rel="noreferrer">{photo.licence}</a> ·{' '}
            <a href={photo.page} target="_blank" rel="noreferrer">Wikimedia Commons</a>
          </figcaption>
        </figure>
      )}
      <h2>{m.name}</h2>
      {c?.description && <p>{c.description}</p>}
      <div className="tags">{c?.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>

      {!result.eligible && (
        <div className="notice">
          <b>Excluded by your current settings:</b>
          <ul>{result.reasons.map((r, i) => <li key={i}>{reasonText(r, workplaces)}</li>)}</ul>
        </div>
      )}

      {result.commute && (
        <>
          <h3>Commute</h3>
          <ul className="facts">
            {workplaces.map((w) => (
              <li key={w.id}><span>{w.name}</span><b>{pct(result.commute!.byWorkplace[w.id])} of area ≤ {w.maxMinutes} min</b></li>
            ))}
          </ul>
        </>
      )}

      <h3>Practical indicators</h3>
      <ul className="facts">
        {PREFERENCES.map((p) => (
          <li key={p.id}><span>{p.label}</span><b>{p.format(p.value(m))}</b></li>
        ))}
        {m.population?.population != null && <li><span>Residents (ACS 2020–24)</span><b>{num(m.population.population)}</b></li>}
        {m.crime && <li><span>Reported incidents (12 mo)</span><b>{num(m.crime.total)} · violent {num(m.crime.violent)} · property {num(m.crime.property)}</b></li>}
        {m.crime?.per_1000_residents != null && <li><span>Incidents per 1,000 residents</span><b>{num(m.crime.per_1000_residents)}</b></li>}
        {m.transit && m.transit.rail_stations.length > 0 && <li><span>Stations inside</span><b>{m.transit.rail_stations.join(', ')}</b></li>}
        {m.collisions && <li><span>Injury crashes (3 yrs)</span><b>{num(m.collisions.injury_crashes)} · pedestrian {m.collisions.pedestrian} · cyclist {m.collisions.cyclist}</b></li>}
        {m.hills && <li><span>Elevation range</span><b>{m.hills.elev_min_m}–{m.hills.elev_max_m} m</b></li>}
      </ul>
      <p className="hint">Reported incidents are not a measure of safety. Per-km² and per-resident rates both read high where many people visit or commute but few live.</p>

      {m.environment && (
        <>
          <h3>Air & pollution</h3>
          <ul className="facts">
            <li><span>PM2.5</span><b>{pctlText(m.environment.pm_pctl)}</b></li>
            <li><span>Diesel particulates</span><b>{pctlText(m.environment.diesel_pctl)}</b></li>
            <li><span>Traffic density</span><b>{pctlText(m.environment.traffic_pctl)}</b></li>
            <li><span>Overall pollution burden</span><b>{pctlText(m.environment.pollution_burden_pctl)}</b></li>
          </ul>
          <p className="hint">CalEnviroScreen 5.0 statewide percentiles (100 = most burdened in California), averaged over this area’s census tracts. Pollution indicators only.</p>
        </>
      )}

      {m.food_drink && (
        <>
          <h3>Cafés, restaurants & bars</h3>
          <p>{num(m.food_drink.cafes)} cafés · {num(m.food_drink.restaurants)} restaurants · {num(m.food_drink.bars)} bars & pubs <span className="hint">(OpenStreetMap)</span></p>
        </>
      )}

      <h3>Rents</h3>
      {zipRent && mainZip ? (
        <>
          <p>
            <b>{usd(zipRent.latest)}/month</b> typical asking rent in ZIP {mainZip.zip} ({zipRent.latest_month})
            {zipRent.yoy_pct != null && <> · {zipRent.yoy_pct > 0 ? '+' : ''}{zipRent.yoy_pct}% vs a year earlier</>}
          </p>
          <RentSparkline series={zipRent.series} />
          <p className="hint">
            ZIP-level Zillow Observed Rent Index (asking rents for listed homes, all types). ZIP {mainZip.zip} covers {pct(mainZip.share)} of this
            neighbourhood{m.rents!.zips.length > 1 ? `; it also overlaps ${m.rents!.zips.slice(1).map((z) => z.zip).join(', ')}` : ''}. Not neighbourhood-specific.
          </p>
        </>
      ) : <p className="hint">No rent index available here.</p>}
      {m.population?.median_gross_rent_popweighted != null && (
        <p className="hint">Census median rent <b>paid</b> by current tenants (ACS 2020–24, all units incl. long-held leases): {usd(m.population.median_gross_rent_popweighted)}/month.</p>
      )}

      <h3>Search for homes here</h3>
      <div className="row">
        {rentalSearchLinks(m.name).map((l) => <a key={l.label} className="btn" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
      </div>
    </div>
  );
}

function RentSparkline({ series }: { series: Record<string, number> }) {
  const keys = Object.keys(series).sort();
  const vals = keys.map((k) => series[k]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const w = 320;
  const h = 64;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 8) - 4}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Asking rent from ${keys[0]} to ${keys[keys.length - 1]}: ${usd(min)} to ${usd(max)}`}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" />
      <text x="0" y={h - 1} className="spark-label">{keys[0].slice(0, 4)}</text>
      <text x={w} y={h - 1} textAnchor="end" className="spark-label">{keys[keys.length - 1].slice(0, 4)}</text>
    </svg>
  );
}

function pctlText(v: number | null) {
  return v == null ? 'No data' : `${Math.round(v)}th percentile`;
}
