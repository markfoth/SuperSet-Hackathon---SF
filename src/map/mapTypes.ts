import type { CommuteArea } from '../features/commute/provider';
import type { AreaResult, CellResult } from '../features/filters/ranking';
import type { AreaCellDisplayCollection, AreaGeometry, NeighbourhoodCollection, Workplace } from '../types';
import type { EventKind, EventFilterState } from './layers/eventDetails';

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
  hoveredNeighbourhoodId?: string | null;
  onHoverNeighbourhood?: (id: string | null) => void;
  areas: CommuteArea[];
  workplaces: Workplace[];
  onMoveWorkplace: (id: string, lat: number, lon: number) => void;
  addingWorkplace: boolean;
  onMapPick: (lat: number, lon: number) => void;
  visibleLayers: Set<string>;
  focusWorkplaceId?: string | null;
  homes?: MapHome[];
  selectedHomeId?: string | null;
  onSelectHome?: (id: string) => void;
  onMoveHome?: (id: string, lat: number, lon: number) => void;
  pickingHome?: boolean;
  onHomePick?: (lat: number, lon: number) => void;
  transportAnimation?: boolean;
  eventFilters?: Record<EventKind, EventFilterState>;
  onInspectContext?: () => void;
  airScale?: 'local' | 'statewide';
  onViewportChange?: (bounds: number[]) => void;
  onAvailabilityChange?: (available: boolean) => void;
  onResultsFramed?: () => void;
}
