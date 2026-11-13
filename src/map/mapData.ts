import type { FeatureCollection, Geometry } from 'geojson';
import type { AreaCellDisplayCollection, NeighbourhoodCollection, Workplace } from '../types';
import type { AreaResult, CellResult, MatchState } from '../features/filters/ranking';
import type { CommuteArea } from '../features/commute/provider';

export const WORKPLACE_COLORS = ['#cb643b', '#7d68ac', '#27838a', '#b45d81'];
export const MATCH_COLORS: Record<MatchState, string> = {
  strong: '#488c69', partial: '#d6b253', excluded: '#ba4e48', unknown: '#909aa3',
};

/** Only park-cut display geometry enters the renderer. Excluded cells never do. */
export function matchingFeatures(cells: AreaCellDisplayCollection, results: Record<string, CellResult>,
  active: boolean, selectedId: string | null, selectedCellId: string | null): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: active ? cells.features.flatMap((f) => {
      const r = results[f.properties.h3];
      if (!r || r.state === 'excluded') return [];
      return [{ ...f, id: r.id, properties: {
        h3: r.id, name: r.name, state: r.state, colour: MATCH_COLORS[r.state],
        selected: r.nhoodId === selectedId && r.eligible, focused: r.id === selectedCellId,
      } }];
    }) : [],
  };
}

export function neighbourhoodFeatures(data: NeighbourhoodCollection, results: Record<string, AreaResult>,
  active: boolean, selectedId: string | null): FeatureCollection {
  return { ...data, features: data.features.map((f) => ({ ...f, id: f.properties.id, properties: {
    ...f.properties, eligible: active && Boolean(results[f.properties.id]?.eligible), selected: f.properties.id === selectedId,
  } })) };
}

export function commuteFeatures(areas: CommuteArea[], workplaces: Workplace[]): FeatureCollection {
  return { type: 'FeatureCollection', features: areas.map((a) => ({ type: 'Feature', geometry: a.geometry,
    properties: { colour: workplaces.find((w) => w.id === a.workplaceId)?.colour ?? WORKPLACE_COLORS[Math.max(0, workplaces.findIndex((w) => w.id === a.workplaceId)) % WORKPLACE_COLORS.length],
      fixture: a.source === 'fixture', workplaceId: a.workplaceId },
  })) };
}

/** Walk coordinates without copying a potentially large nested geometry. */
export function geometryBounds(geometry: Geometry): [number, number, number, number] | null {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  const walk = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === 'number' && typeof value[1] === 'number') {
      west = Math.min(west, value[0]); east = Math.max(east, value[0]);
      south = Math.min(south, value[1]); north = Math.max(north, value[1]);
    } else value.forEach(walk);
  };
  if (geometry.type === 'GeometryCollection') geometry.geometries.forEach((g) => {
    const b = geometryBounds(g);
    if (b) { walk([b[0], b[1]]); walk([b[2], b[3]]); }
  });
  else walk(geometry.coordinates);
  return Number.isFinite(west) ? [west, south, east, north] : null;
}
