import { describe, expect, it } from 'vitest';
import { isCoveredLocation, searchPlaces, type LocalPlace } from './search';

const places: LocalPlace[] = [
  { id: '1', name: 'Café du Nord', lat: 37.76, lon: -122.43, kind: 'Café', source: 'OpenStreetMap' },
  { id: '2', name: 'North Beach', lat: 37.80, lon: -122.41, kind: 'Neighbourhood centre', source: 'DataSF' },
  { id: '3', name: 'Café', lat: 37.78, lon: -122.42, kind: 'Café', source: 'OpenStreetMap' },
];

describe('bounded local search', () => {
  it('matches accents and terms, prioritising exact names', () => {
    expect(searchPlaces(places, 'cafe').map((place) => place.id)).toEqual(['3', '1']);
    expect(searchPlaces(places, 'nord cafe').map((place) => place.id)).toEqual(['1']);
  });
  it('does not pretend arbitrary addresses exist or search empty queries', () => {
    expect(searchPlaces(places, '123 Imaginary Street')).toEqual([]);
    expect(searchPlaces(places, ' ')).toEqual([]);
    expect(searchPlaces(places, 'n')).toEqual([]);
  });
  it('rejects nonfinite and out-of-coverage coordinates', () => {
    expect(isCoveredLocation(37.6213, -122.379)).toBe(true);
    expect(isCoveredLocation(37.5, -122.4)).toBe(false);
    expect(isCoveredLocation(NaN, -122.4)).toBe(false);
    expect(isCoveredLocation(37.8, 122.4)).toBe(false);
  });
});
