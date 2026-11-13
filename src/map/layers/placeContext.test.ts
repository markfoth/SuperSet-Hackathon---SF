import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Map as GLMap } from 'maplibre-gl';
import { addPlaceContext, safeHttpUrl } from './placeContext';
import { loadData } from '../../lib/data';

vi.mock('../../lib/data', () => ({ loadData: vi.fn() }));
const fixture = (id: string, kind: string) => ({ type: 'Feature', properties: { osm_id: id, name: kind, kind },
  geometry: { type: 'Point', coordinates: [-122.42, 37.76] } });
const mapStub = () => ({ getStyle: vi.fn(() => ({})), getLayer: vi.fn(() => ({})), getSource: vi.fn(),
  addSource: vi.fn(), addLayer: vi.fn(), removeSource: vi.fn(), removeLayer: vi.fn() });

beforeEach(() => vi.mocked(loadData).mockReset());

describe('place data and interaction safety', () => {
  it('loads only cafes and restaurants for food, keeping distinct collocated venues', async () => {
    vi.mocked(loadData).mockImplementation(async (file) => ({ type: 'FeatureCollection', features:
      file === 'cafes.geojson' ? [fixture('node/1', 'cafe')] : [fixture('node/2', 'restaurant'), fixture('node/1', 'cafe')] }));
    const map = mapStub();
    const result = await addPlaceContext(map as unknown as GLMap, 'food');
    expect(vi.mocked(loadData).mock.calls.map(([file]) => file)).toEqual(['cafes.geojson', 'restaurants.geojson']);
    expect(map.addSource.mock.calls[0][1].data.features).toHaveLength(2);
    expect(map.addSource.mock.calls[0][1].clusterMaxZoom).toBe(12);
    expect(result.layers).toContain('context-food-places-names');
    expect(map.addLayer.mock.calls.find(([layer]) => layer.id.endsWith('-names'))?.[0].minzoom).toBe(14);
  });
  it('does not add sources after a style generation was cancelled', async () => {
    vi.mocked(loadData).mockResolvedValue({ type: 'FeatureCollection', features: [] });
    const map = mapStub();
    expect(await addPlaceContext(map as unknown as GLMap, 'character', () => false)).toEqual({ sources: [], layers: [] });
    expect(map.addSource).not.toHaveBeenCalled();
  });
  it('enables collision handling and viewport alignment for character text', async () => {
    vi.mocked(loadData).mockResolvedValue({ type: 'FeatureCollection', features: [] });
    const map = mapStub();
    await addPlaceContext(map as unknown as GLMap, 'character');
    const layers = map.addLayer.mock.calls.map(([layer]) => layer);
    expect(layers.map((layer) => [layer.minzoom, layer.maxzoom])).toEqual([[10, 13], [13, undefined]]);
    expect(layers.every((layer) => layer.layout['text-allow-overlap'] === false && layer.layout['text-pitch-alignment'] === 'viewport')).toBe(true);
  });
  it('allows web URLs and rejects active content, credentials and relative URLs', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,x', '//example.org', 'https://user:pass@example.org', 'https://x.org\n/a']) expect(safeHttpUrl(url)).toBeNull();
    expect(safeHttpUrl('https://example.org/branch')).toBe('https://example.org/branch');
  });
});
