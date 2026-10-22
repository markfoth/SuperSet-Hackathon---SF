import { CONTEXT_LAYERS } from '../layers/contextLayers';

interface Props {
  visible: Set<string>;
  onToggle: (id: string) => void;
}

export function LayerPanel({ visible, onToggle }: Props) {
  const primary = new Set(['hills', 'transit', 'parks', 'crime']);
  const renderLayer = (l: typeof CONTEXT_LAYERS[number]) => (
    <div key={l.id} className="layer">
      <label><input type="checkbox" checked={visible.has(l.id)} onChange={() => onToggle(l.id)} /> {l.label}</label>
      {visible.has(l.id) && <div className="legend"><p className="hint">{l.note}</p>
        {l.legend.map((i) => <div className="legend-item" key={i.label}><span className={`swatch${i.dashed ? ' dashed' : ''}`} style={{ background: i.dashed ? 'transparent' : i.color, borderColor: i.color }} />{i.label}</div>)}
      </div>}
    </div>
  );
  return (
    <section className="panel-section">
      <h2>Map layers</h2>
      <p className="hint">Switch on any combination.</p>
      {CONTEXT_LAYERS.filter((l) => primary.has(l.id)).map(renderLayer)}
      <details className="advanced-layers"><summary>More context layers</summary>{CONTEXT_LAYERS.filter((l) => !primary.has(l.id)).map(renderLayer)}</details>
    </section>
  );
}
