import { loadData } from '../../lib/data';
import type { NeighbourhoodCollection } from '../../types';

export interface LocalPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: string;
  source: string;
}

export interface PlaceIndex { places: LocalPlace[]; unavailableSources: string[] }

/** Bounded study-region envelope. Land / measurement coverage is checked separately. */
export function isCoveredLocation(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 37.1 && lat <= 38.1 && lon >= -123 && lon <= -121.5;
}

const normalise = (text: string) => text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function searchPlaces(places: LocalPlace[], query: string, limit = 8): LocalPlace[] {
  const q = normalise(query);
  if (q.length < 2) return [];
  const terms = q.split(' ');
  return places.filter((place) => terms.every((term) => normalise(`${place.name} ${place.kind}`).includes(term)))
    .sort((a, b) => {
      const an = normalise(a.name), bn = normalise(b.name);
      const score = (name: string) => name === q ? 0 : name.startsWith(q) ? 1 : 2;
      return score(an) - score(bn) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    }).slice(0, limit);
}

let index: Promise<PlaceIndex> | undefined;

/** Reuses committed, licensed sources; there is no address API or keystroke traffic. */
export function loadPlaceIndex(): Promise<PlaceIndex> {
  if (!index) index = (async () => {
    const places: LocalPlace[] = [
      { id: 'example-sfo', name: 'SFO Airport', lat: 37.6213, lon: -122.379, kind: 'Example destination', source: 'Offline commute fixture' },
      { id: 'example-fidi', name: 'Financial District', lat: 37.7946, lon: -122.3999, kind: 'Example destination', source: 'Offline commute fixture' },
    ];
    const unavailableSources: string[] = [];
    try {
      const compact = await loadData<PlaceIndex>('place_index.json'), seen = new Set<string>();
      for (const place of compact.places) {
        if (!isCoveredLocation(place.lat,place.lon)) continue;
        const key = `${normalise(place.name)}|${place.lat.toFixed(3)}|${place.lon.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key); places.push(place);
      }
      unavailableSources.push(...compact.unavailableSources);
    } catch { unavailableSources.push('Regional named places'); index = undefined; }
    try {
      const neighbourhoods = await loadData<NeighbourhoodCollection>('neighbourhoods.geojson');
      neighbourhoods.features.forEach(({ properties: p }) => {
        if (isCoveredLocation(p.label_lat, p.label_lon)) places.push({ id: `neighbourhood:${p.id}`, name: p.name,
          lat: p.label_lat, lon: p.label_lon, kind: p.id.startsWith('census-') ? 'City/community centre' : 'Neighbourhood centre', source: 'DataSF / San Mateo County / US Census' });
      });
    } catch { unavailableSources.push('Neighbourhood centres'); }
    return { places, unavailableSources };
  })();
  return index;
}
