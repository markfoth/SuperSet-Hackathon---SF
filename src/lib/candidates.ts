import type { AreaCellCollection, AreaGeometry, NeighbourhoodMetrics, PreferenceLevel, Workplace } from '../types';
import type { CommuteResult } from '../features/commute/provider';
import type { CellCommute } from '../features/commute/eligibility';
import type { AreaResult, CellResult } from '../features/filters/ranking';
import { loadData } from './data';

export interface Partition { id: string; bounds: [number, number, number, number]; count: number }
export interface CandidateIndex { version: 1; resolution: 9; columns: string[]; rows: unknown[][]; boundaries: Record<string, AreaGeometry>; partitions: Partition[] }
let worker: Worker | undefined, sequence = 0;
const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
function request<T>(kind: string, data: unknown): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('../features/filters/analysis.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      const operation = pending.get(event.data.id);
      if (!operation) return;
      pending.delete(event.data.id);
      if (event.data.error) operation.reject(new Error(event.data.error)); else operation.resolve(event.data.value);
    };
    worker.onerror = () => { pending.forEach(p => p.reject(new Error('Analysis worker could not start. Retry local data.'))); pending.clear(); worker?.terminate(); worker = undefined; expanded = undefined; };
  }
  return new Promise<T>((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve: value => resolve(value as T), reject }); worker!.postMessage({ id, kind, data }); });
}
let expanded: Promise<AreaCellCollection> | undefined;
if(import.meta.hot)import.meta.hot.dispose(()=>{worker?.terminate();pending.forEach(p=>p.reject(new Error('Analysis updated; retry if needed.')));pending.clear();worker=undefined;expanded=undefined;});
export function loadCandidates() {
  if (!expanded) expanded = loadData<CandidateIndex>('candidate_index.json').then(index => {
    if (index.version !== 1 || index.resolution !== 9 || !index.rows.length) throw new Error('Unsupported candidate index');
    return request<AreaCellCollection>('expand', index);
  }).catch(error => { expanded = undefined; throw error; });
  return expanded;
}
export interface RegionalEvaluation { commutes: Record<string, CellCommute>; results: CellResult[]; areas: AreaResult[]; overlap: AreaGeometry | null }
export async function evaluateRegion(data: { workplaces: Workplace[]; commute: Record<string, CommuteResult | undefined>; metrics: Record<string, NeighbourhoodMetrics>; prefs: Record<string, PreferenceLevel>; priorityOrder: string[] }) {
  await loadCandidates();
  return request<RegionalEvaluation>('evaluate', data);
}
export function partitionsForBounds(partitions: Partition[], bounds: number[]): Partition[] {
  const [west, south, east, north] = bounds;
  return partitions.filter(({ bounds: [w,s,e,n] }) => w <= east && e >= west && s <= north && n >= south);
}
