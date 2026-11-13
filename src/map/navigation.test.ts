import { describe, expect, it } from 'vitest';
import { dragZoom } from './rightDragZoom';
import { continuousSegments, routePosition } from './transportAnimation';

describe('desktop map navigation', () => {
  it('zooms in for upward drags and clamps both ends', () => {
    expect(dragZoom(15, -125, 7, 19)).toBe(16);
    expect(dragZoom(15, 125, 7, 19)).toBe(14);
    expect(dragZoom(18.8, -1000, 7, 19)).toBe(19);
    expect(dragZoom(8, 1000, 7, 19)).toBe(7);
  });
  it('keeps disconnected transit geometry separate and interpolates along actual segments', () => {
    const lines = continuousSegments([[-122.4,37.7],[-122.399,37.7],[-122.3,37.8],[-122.299,37.8]]);
    expect(lines).toHaveLength(2);
    const position = routePosition(lines[0], 40);
    expect(position.position[0]).toBeGreaterThan(-122.4);
    expect(position.position[0]).toBeLessThan(-122.399);
    expect(position.position[1]).toBe(37.7);
    expect(position.bearing).toBeCloseTo(90);
  });
});
