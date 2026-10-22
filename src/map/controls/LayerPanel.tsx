import { CONTEXT_LAYERS } from '../layers/contextLayers';

interface Props {
  visible: Set<string>;
  onToggle: (id: string) => void;
}

export function LayerPanel({ visible, onToggle }: Props) {
  return (
    <section className="panel-section">
      <h2>Map layers</h2>
      <p className="hint">Switch on any combination.</p>
      {CONTEXT_LAYERS.map((l) => (
        <div key={l.id} className="layer">
          <label>
            <input type="checkbox" checked={visible.has(l.id)} onChange={() => onToggle(l.id)} /> {l.label}
          </label>
          {visible.has(l.id) && (
            <div className="legend">
              <p className="hint">{l.note}</p>
              {l.legend.map((i) => (
                <div className="legend-item" key={i.label}>
                  <span className={`swatch${i.dashed ? ' dashed' : ''}`} style={{ background: i.dashed ? 'transparent' : i.color, borderColor: i.color }} />
                  {i.label}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
