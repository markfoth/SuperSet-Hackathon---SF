import { cellToBoundary } from 'h3-js';
import { cellCommutes, commonReachableGeometry } from '../commute/eligibility';
import { evaluate, summarize } from './ranking';
import type { CandidateIndex } from '../../lib/candidates';
import type { AreaCellCollection, AreaCellProps } from '../../types';

let cells: AreaCellCollection = { type: 'FeatureCollection', features: [] };
self.onmessage = event => {
  const { id, kind, data } = event.data;
  try {
    if (kind === 'expand') {
      const index = data as CandidateIndex;
      cells = { type: 'FeatureCollection', features: index.rows.map(row => {
        const properties = Object.fromEntries(index.columns.map((key, i) => [key, row[i]])) as unknown as AreaCellProps;
        const ring = cellToBoundary(properties.h3).map(([lat, lon]) => [lon, lat]); ring.push(ring[0]);
        return { type: 'Feature', properties, geometry: index.boundaries[properties.h3] ?? { type: 'Polygon', coordinates: [ring] } };
      }) };
      self.postMessage({ id, value: cells });
    } else if (kind === 'evaluate') {
      const commutes = cellCommutes(cells, data.workplaces, data.commute);
      const input = { cells, metrics: data.metrics, commutes, prefs: data.prefs, priorityOrder: data.priorityOrder };
      const results = evaluate(input);
      const contours = data.workplaces.flatMap((w: {id:string})=>data.commute[w.id]?.ok?[data.commute[w.id].area]:[]);
      const overlap = commonReachableGeometry(contours,data.workplaces.length);
      self.postMessage({ id, value: { commutes, results, areas: summarize(input, results), overlap } });
    }
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : 'Analysis failed' }); }
};
