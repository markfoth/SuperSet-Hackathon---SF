import { describe, expect, it } from 'vitest';
import { aggregateEvents, type EventData, type EventFilterState } from './eventDetails';

const data: EventData = {
  meta: { source_url: 'https://data.sf.gov/d/ubvf-ztfx', downloaded_at: '2026-11-13', window_start: '2026-01-01', window_end_exclusive: '2026-03-01', mapped_events: 4, precision: 'Published location is approximate' },
  locations: [[-122.42, 37.77, 'one'], [-122.41, 37.78, 'one'], [-122.40, 37.78, 'two']],
  months: ['2026-01', '2026-02'], categories: ['Bicycle-Pedestrian', 'Vehicle(s) Only Involved', 'Unknown/Not Stated'],
  records: [[0, 0, [0], 3, 1, 2, 0], [1, 0, [1], 4, 1, 1, 0], [2, 1, [2], 0, 1, null, null], [0, 1, [0], 11, 1, 1, 1]],
};
const defaults: EventFilterState = { from: '2026-01', to: '2026-02', category: 'all', detail: true };

describe('event context filters', () => {
  it('uses the same count for shared locations and H3 overview', () => {
    const result = aggregateEvents(data, defaults);
    expect(result.total).toBe(4);
    expect([...result.locations.values()].reduce((n, a) => n + a.total, 0)).toBe(4);
    expect([...result.cells.values()].reduce((n, a) => n + a.total, 0)).toBe(4);
    expect(result.locations.get(0)?.total).toBe(2);
  });
  it('supports overlapping pedestrian/cyclist involvement and a distinct vehicle-only flag', () => {
    expect(aggregateEvents(data, { ...defaults, category: 'pedestrian' }).total).toBe(2);
    expect(aggregateEvents(data, { ...defaults, category: 'cyclist' }).total).toBe(2);
    expect(aggregateEvents(data, { ...defaults, category: 'vehicle_only' }).total).toBe(1);
    expect(aggregateEvents(data, { ...defaults, category: 'fatal_severe' }).total).toBe(1);
  });
  it('honours inclusive month bounds and keeps casualty counts distinct from crashes', () => {
    const result = aggregateEvents(data, { ...defaults, to: '2026-01' });
    expect(result.total).toBe(2);
    expect(result.cells.get('one')?.injured).toBe(3);
    expect(result.cells.get('one')?.fatalities).toBe(0);
  });
  it('preserves unknown casualty values and overlapping offence categories', () => {
    const fixture = { ...data, records: [[0, 0, [0, 1], 3, 1, 1, 0]] } as EventData;
    const a = aggregateEvents(fixture, defaults).locations.get(0)!;
    expect(a.total).toBe(1);
    expect(Object.values(a.categories).reduce((n, count) => n + count, 0)).toBe(2);
    expect(aggregateEvents(data, defaults).locations.get(2)?.missingInjured).toBe(true);
    expect(aggregateEvents(data, { ...defaults, from: '2026-03' }).total).toBe(0);
  });
});
