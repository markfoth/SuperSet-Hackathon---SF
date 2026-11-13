import { CONTEXT_LAYERS } from '../layers/contextLayers';
import { SectionInfo } from '../../components/SectionInfo';
import { DATASET_SOURCES } from '../layers/datasetSources';
import { EventFilters } from './EventFilters';
import { DEFAULT_EVENT_FILTERS, type EventKind, type EventFilterState } from '../layers/eventDetails';

interface Props {
  visible: Set<string>;
  onToggle: (id: string) => void;
  transportAnimation?: boolean;
  onTransportAnimationChange?: (enabled: boolean) => void;
  eventFilters?: Record<EventKind, EventFilterState>;
  onEventFiltersChange?: (kind: EventKind, value: EventFilterState) => void;
  airScale?: 'local' | 'statewide';
  onAirScaleChange?: (scale:'local'|'statewide') => void;
}

export function LayerPanel({ visible, onToggle, transportAnimation, onTransportAnimationChange, eventFilters = DEFAULT_EVENT_FILTERS, onEventFiltersChange, airScale='local', onAirScaleChange }: Props) {
  const primary = new Set(['topography', 'transit', 'parks', 'crime', 'nightlife']);
  const renderLayer = (l: typeof CONTEXT_LAYERS[number]) => (
    <div key={l.id} className={`layer${visible.has(l.id) ? ' active' : ''}`}>
      <label><input type="checkbox" checked={visible.has(l.id)} onChange={() => onToggle(l.id)} /> {l.label}</label>
      {visible.has(l.id) && <div className="legend">
        {l.warning && <p className="hint layer-warning">{l.warning}</p>}
        {(l.id==='air' && airScale==='statewide' ? l.legend.map((item,index)=>index<5?{...item,label:`${[0,25,50,75,100][index]}th California percentile`}:item) : l.legend).map((i) => <div className="legend-item" key={i.label}><span className={`swatch${i.dashed ? ' dashed' : ''}`} style={{ background: i.dashed ? 'transparent' : i.color, borderColor: i.color }} />{i.label}</div>)}
        {l.id==='air' && <label className="air-scale-control">Air colour scale<select aria-label="Air colour scale" value={airScale} onChange={e=>onAirScaleChange?.(e.target.value as 'local'|'statewide')}><option value="local">Local contrast · fixed 5–35 range</option><option value="statewide">California · full 0–100 range</option></select></label>}
        {l.id === 'transit' && <div className="transport-demo-control"><label><input type="checkbox" checked={Boolean(transportAnimation)} onChange={e => onTransportAnimationChange?.(e.target.checked)} /> Animate example vehicles</label><p className="hint">Illustrative animation, not live vehicle positions.</p><small>Source route geometry can include rail tunnels.</small>{transportAnimation && <button type="button" onClick={() => onTransportAnimationChange?.(false)}>Pause animation</button>}{!transportAnimation && <small>Paused by default, including for reduced motion. Play only when you choose.</small>}</div>}
        {(l.id === 'crime' || l.id === 'collisions') && <EventFilters kind={l.id} value={eventFilters[l.id]} onChange={value => onEventFiltersChange?.(l.id as EventKind, value)} />}
      </div>}
    </div>
  );
  return (
    <section className="panel-section">
      <div className="section-heading"><h2>Map layers</h2><SectionInfo title="Map layers">
        <p>Layers add context to the map. They do not change your commute limits or preference ranking. Selected-district matches keep their gold outlines above these layers.</p>
        {CONTEXT_LAYERS.map((layer) => <section key={layer.id} className="dataset-info"><h3>{layer.label}</h3><p>{layer.note}</p>
          <p>{(DATASET_SOURCES[layer.id] ?? []).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}</p>
        </section>)}
        <section className="dataset-info"><h3>Area boundaries and names</h3>
          <p>SF uses analysis neighbourhoods; Peninsula groups use city and county boundaries. A county community sits outside an incorporated city. Broadmoor and Country Club Park keep their local names; Colma station area is the county pocket around Colma BART. San Bruno hills &amp; county land combines watershed and county-facility land, not a single neighbourhood or verified housing area.</p>
          <p><a href="https://data.sf.gov/d/j2bu-swwd" target="_blank" rel="noreferrer">SF boundaries</a><a href="https://gis.smcgov.org/maps/rest/services/PLANNING/PLN_LAYERS_DMZ/MapServer/20" target="_blank" rel="noreferrer">County community map</a></p>
        </section>
      </SectionInfo></div>
      <p className="hint">Switch on any combination.</p>
      {CONTEXT_LAYERS.filter((l) => primary.has(l.id)).map(renderLayer)}
      <details className="advanced-layers"><summary>More context layers</summary>{CONTEXT_LAYERS.filter((l) => !primary.has(l.id)).map(renderLayer)}</details>
    </section>
  );
}
