import type { FeatureCollection, Point } from 'geojson';
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
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 37.60 && lat <= 37.90 && lon >= -122.62 && lon <= -122.25;
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
    const sources = [
      { file: 'transit_stops.geojson', kind: 'Transport stop', source: 'Agency GTFS' },
      { file: 'groceries.geojson', kind: 'Grocery shop', source: 'OpenStreetMap' },
      { file: 'cafes.geojson', kind: 'Café', source: 'OpenStreetMap' },
      { file: 'restaurants.geojson', kind: 'Restaurant', source: 'OpenStreetMap' },
    ];
    const loaded = await Promise.allSettled(sources.map((source) => loadData<FeatureCollection<Point>>(source.file)));
    const places: LocalPlace[] = [
      { id: 'example-sfo', name: 'SFO Airport', lat: 37.6213, lon: -122.379, kind: 'Example destination', source: 'Offline commute fixture' },
      { id: 'example-fidi', name: 'Financial District', lat: 37.7946, lon: -122.3999, kind: 'Example destination', source: 'Offline commute fixture' },
    ];
    const unavailableSources: string[] = [];
    loaded.forEach((result, sourceIndex) => {
      const source = sources[sourceIndex];
      if (result.status !== 'fulfilled') { unavailableSources.push(source.kind); return; }
      const seen = new Set<string>();
      result.value.features.forEach((feature, i) => {
        const name = feature.properties?.name;
        const [lon, lat] = feature.geometry?.coordinates ?? [];
        if (typeof name !== 'string' || !name.trim() || !isCoveredLocation(lat, lon)) return;
        // GTFS often has opposite-direction stops with the same name within metres.
        const key = `${normalise(name)}|${lat.toFixed(3)}|${lon.toFixed(3)}`;
        if (seen.has(key)) return;
        seen.add(key);
        const agency = feature.properties?.agency;
        const kind = sourceIndex === 0 && agency ? `${agency} ${feature.properties?.rail ? 'station' : 'stop'}` : source.kind;
        places.push({ id: `${source.file}:${feature.properties?.id ?? feature.properties?.osm_id ?? i}`, name, lat, lon, kind, source: source.source });
      });
    });
    try {
      const neighbourhoods = await loadData<NeighbourhoodCollection>('neighbourhoods.geojson');
      neighbourhoods.features.forEach(({ properties: p }) => {
        if (isCoveredLocation(p.label_lat, p.label_lon)) places.push({ id: `neighbourhood:${p.id}`, name: p.name,
          lat: p.label_lat, lon: p.label_lon, kind: 'Neighbourhood centre', source: 'DataSF / San Mateo County' });
      });
    } catch { unavailableSources.push('Neighbourhood centres'); }
    if (!loaded.some((result) => result.status === 'fulfilled')) index = undefined;
    return { places, unavailableSources };
  })();
  return index;
}
