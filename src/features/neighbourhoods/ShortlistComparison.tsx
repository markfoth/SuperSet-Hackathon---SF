import { orderedPreferences } from '../filters/preferences';
import type { AreaResult, CellResult } from '../filters/ranking';
import type { NeighbourhoodMetrics } from '../../types';
import { pct, usd } from '../../lib/format';

export function ShortlistComparison({ areas, cells, metrics, priorityOrder, onClose, onSelect }: {
  areas: AreaResult[]; cells: Record<string, CellResult>; metrics: Record<string, NeighbourhoodMetrics>;
  priorityOrder: string[]; onClose: () => void; onSelect: (id: string) => void;
}) {
  return <div className="modal-backdrop" onClick={onClose}>
    <section className="modal comparison" role="dialog" aria-modal="true" aria-label="Compare shortlist" onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn close" onClick={onClose} aria-label="Close comparison">×</button>
      <h2>Compare your shortlist</h2>
      <p className="hint">Local measurements refer to each neighbourhood’s leading eligible cell under your current priorities. They can change when your settings change.</p>
      <div className="comparison-scroll"><table>
        <thead><tr><th scope="col">Current settings</th>{areas.map((r) => <th scope="col" key={r.id}><button className="btn link" onClick={() => onSelect(r.id)}>{r.name}</button></th>)}</tr></thead>
        <tbody>
          <tr><th scope="row">Suitable candidate land</th>{areas.map((r) => <td key={r.id}>{pct(r.eligibleShare)} · {r.eligibleCount} cells{!r.eligible && <b> · {r.state === 'unknown' ? 'Unknown' : 'Excluded'}</b>}</td>)}</tr>
          <tr><th scope="row">Shared commute coverage</th>{areas.map((r) => <td key={r.id}>{r.commute ? pct(r.commute.all) : 'Not calculated'}</td>)}</tr>
          {orderedPreferences(priorityOrder).map((p) => <tr key={p.id}><th scope="row">{p.label}</th>{areas.map((r) => {
            const cell = r.bestCellId ? cells[r.bestCellId] : null;
            return <td key={r.id}>{cell ? p.format(p.value(cell.cell)) : 'No eligible cell'}</td>;
          })}</tr>)}
          <tr><th scope="row">ZIP-level asking rent</th>{areas.map((r) => <td key={r.id}>{usd(metrics[r.id].rents?.typical_rent_zip_weighted)}/mo <small>(neighbourhood ZIP overlap estimate)</small></td>)}</tr>
        </tbody>
      </table></div>
    </section>
  </div>;
}
