import { CONTEXT_LAYERS } from '../layers/contextLayers';
import { SectionInfo } from '../../components/SectionInfo';
import { DATASET_SOURCES } from '../layers/datasetSources';

interface Props {
  visible: Set<string>;
  onToggle: (id: string) => void;
}

export function LayerPanel({ visible, onToggle }: Props) {
  const primary = new Set(['topography', 'transit', 'parks', 'crime', 'nightlife']);
  const renderLayer = (l: typeof CONTEXT_LAYERS[number]) => (
    <div key={l.id} className={`layer${visible.has(l.id) ? ' active' : ''}`}>
      <label><input type="checkbox" checked={visible.has(l.id)} onChange={() => onToggle(l.id)} /> {l.label}</label>
      {visible.has(l.id) && <div className="legend">
        {l.warning && <p className="hint layer-warning">{l.warning}</p>}
        {l.legend.map((i) => <div className="legend-item" key={i.label}><span className={`swatch${i.dashed ? ' dashed' : ''}`} style={{ background: i.dashed ? 'transparent' : i.color, borderColor: i.color }} />{i.label}</div>)}
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
