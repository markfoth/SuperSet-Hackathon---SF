import { DEFAULT_EVENT_FILTERS, type EventFilterState, type EventKind } from '../layers/eventDetails';
import './EventFilters.css';

interface Props { kind: EventKind; value: EventFilterState; onChange: (value: EventFilterState) => void }

export function EventFilters({ kind, value, onChange }: Props) {
  const defaults = DEFAULT_EVENT_FILTERS[kind];
  const label = kind === 'crime' ? 'Incident' : 'Injury crash';
  const options = kind === 'crime'
    ? [['all', 'All reported incidents'], ['violent', 'Violent offences'], ['property', 'Property offences'], ['vehicle_breakin', 'Vehicle break-ins'], ['drug', 'Drug offences'], ['other', 'Other counted offences']]
    : [['all', 'All injury crashes'], ['pedestrian', 'Pedestrian involvement'], ['cyclist', 'Cyclist involvement'], ['vehicle_only', 'Motor-vehicle-only crashes'], ['fatal_severe', 'Fatal or severe injuries']];
  return <div className="event-filters">
    <label>{label} category<select value={value.category} onChange={(event) => onChange({ ...value, category: event.target.value })}>
      {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
    </select></label>
    <div className="event-date-range">
      <label>From month<input aria-label={`${label} from month`} type="month" min={defaults.from} max={value.to} value={value.from}
        onChange={(event) => { if (event.target.value && event.target.value <= value.to) onChange({ ...value, from: event.target.value }); }} /></label>
      <label>To month<input aria-label={`${label} to month`} type="month" min={value.from} max={defaults.to} value={value.to}
        onChange={(event) => { if (event.target.value && event.target.value >= value.from) onChange({ ...value, to: event.target.value }); }} /></label>
    </div>
    {kind === 'collisions' && <label><input type="checkbox" checked={value.detail} onChange={(event) => onChange({ ...value, detail: event.target.checked })} />Show published crash-location detail</label>}
    <p className="hint">{kind === 'crime' ? 'Stable H3 columns use unique incident counts. Level 6 below zoom 10.5, level 7 to 12.5, then level 8. Fixed height scale. At zoom 14.2–15.2 columns fade into published approximate intersections. Larger cells sum more locations; compare counts within the same level.' : 'Detail appears at neighbourhood zoom. Hexagons and markers use the same unique crash counts and month filter.'}</p>
    <p className="hint">{kind === 'crime' ? 'Published location is approximate. Offence categories can overlap. Only counted initial criminal reports; records without an offence category are excluded.' : 'Pedestrian and cyclist involvement overlap. People injured and fatalities are separate from crash counts.'} SF only; Peninsula data unavailable.</p>
  </div>;
}
