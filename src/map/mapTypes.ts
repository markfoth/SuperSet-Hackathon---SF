import type { CommuteArea } from '../features/commute/provider';
import type { AreaResult, CellResult } from '../features/filters/ranking';
import type { AreaCellDisplayCollection, AreaGeometry, NeighbourhoodCollection, Workplace } from '../types';

export interface MapHome { id: string; name: string; lat: number; lon: number }
export interface MapProps {
  neighbourhoods: NeighbourhoodCollection;
  cells: AreaCellDisplayCollection;
  matchingActive: boolean;
  cellResults: Record<string, CellResult>;
  selectedCellId: string | null;
  onSelectCell: (id: string) => void;
  overlap: AreaGeometry | null;
  results: Record<string, AreaResult>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  areas: CommuteArea[];
  workplaces: Workplace[];
  onMoveWorkplace: (id: string, lat: number, lon: number) => void;
  addingWorkplace: boolean;
  onMapPick: (lat: number, lon: number) => void;
  visibleLayers: Set<string>;
  mapMode?: 'find' | 'explore' | 'compare';
  focusWorkplaceId?: string | null;
  homes?: MapHome[];
  selectedHomeId?: string | null;
  onSelectHome?: (id: string) => void;
  onMoveHome?: (id: string, lat: number, lon: number) => void;
  pickingHome?: boolean;
  onHomePick?: (lat: number, lon: number) => void;
}
