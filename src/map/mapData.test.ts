import { describe, expect, it } from 'vitest';
import { evaluate } from '../features/filters/ranking';
import type { AreaCellCollection, AreaCellDisplayCollection, NeighbourhoodMetrics } from '../types';
import fixture from '../test/areaCells.fixture.json';
import { geometryBounds, matchingFeatures } from './mapData';

describe('renderer data contract', () => {
  it('never renders a known excluded cell, including when selected', () => {
    const cells = structuredClone(fixture) as AreaCellCollection;
    cells.features.forEach((f, i) => Object.assign(f.properties, { h3: String(i), residential: true }));
    const results = evaluate({ cells, metrics: { 'potrero-hill': { name: 'Potrero Hill' } as NeighbourhoodMetrics },
      commutes: { '0': { all: false, byWorkplace: { a: false } }, '1': { all: true, byWorkplace: { a: true } }, '2': { all: null, byWorkplace: { a: null } } },
      prefs: {}, priorityOrder: [],
    });
    const display: AreaCellDisplayCollection = { type: 'FeatureCollection', features: cells.features.map((f) => ({ ...f, properties: { h3: f.properties.h3 } })) };
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    const drawn = matchingFeatures(display, byId, true, 'potrero-hill', '0');
    expect(drawn.features.map((f) => f.id)).toEqual(['1', '2']);
    expect(drawn.features.find((f) => f.id === '1')?.properties?.selected).toBe(true);
    expect(drawn.features.find((f) => f.id === '2')?.properties?.selected).toBe(false);
    expect(matchingFeatures(display, byId, false, null, null).features).toEqual([]);
    // Rendering must not mutate the canonical measurement geometry or eligibility.
    expect(cells.features[0].properties.h3).toBe('0');
    expect(byId['0'].eligible).toBe(false);
  });
  it('frames MultiPolygon and GeometryCollection coordinates in longitude, latitude order', () => {
    expect(geometryBounds({ type: 'GeometryCollection', geometries: [
      { type: 'Polygon', coordinates: [[[-122.5, 37.7], [-122.4, 37.8], [-122.5, 37.7]]] },
      { type: 'Point', coordinates: [-122.3, 37.6] },
    ] })).toEqual([-122.5, 37.6, -122.3, 37.8]);
  });
});
