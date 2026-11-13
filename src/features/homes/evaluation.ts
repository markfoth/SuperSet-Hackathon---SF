import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { AreaCellCollection, AreaCellProps, NeighbourhoodMetrics, PreferenceLevel, Workplace } from '../../types';
import type { CellCommute } from '../commute/eligibility';
import type { CommuteResult } from '../commute/provider';
import { evaluate, type Criterion, type MatchState } from '../filters/ranking';
import { PREFERENCES } from '../filters/preferences';
import type { Home } from '../scenarios/model';
export { createHome } from '../scenarios/model';

export interface HomeEvaluation {
  eligible: boolean;
  state: MatchState;
  commute: CellCommute;
  cell: AreaCellProps | null;
  neighbourhoodId: string | null;
  reasons: string[];
  unchecked: string[];
  warnings: string[];
  criteria: Criterion[];
}

/** Commutes use the home's actual pin; local measurements retain their source resolution. */
export function evaluateHome(home: Pick<Home, 'lat' | 'lon'>, workplaces: Workplace[], results: Record<string, CommuteResult | undefined>, cells: AreaCellCollection,
  metrics: Record<string, NeighbourhoodMetrics>, prefs: Record<string, PreferenceLevel>, priorityOrder: string[]): HomeEvaluation {
  const coordinate = point([home.lon, home.lat]);
  const byWorkplace = Object.fromEntries(workplaces.map((w) => {
    const route = results[w.id];
    let inside: boolean | null = null;
    if (route?.ok) { try { inside = booleanPointInPolygon(coordinate, route.area.geometry); } catch { /* unknown remains unknown */ } }
    return [w.id, inside];
  }));
  const values = Object.values(byWorkplace);
  const commute: CellCommute = { byWorkplace, all: !values.length || values.some((v) => v == null) ? null : values.every(Boolean) };
  const containing = cells.features.find((cell) => booleanPointInPolygon(coordinate, cell));
  if (!containing) {
    const reasons = workplaces.filter((w) => byWorkplace[w.id] === false).map((w) => `${w.name}: the home pin is outside the selected ${w.maxMinutes}-minute catchment.`);
    return { eligible: false, state: reasons.length ? 'excluded' : 'unknown', commute, cell: null, neighbourhoodId: null, reasons,
      unchecked: ['Local measurements are unavailable at this pin.', ...workplaces.filter((w) => byWorkplace[w.id] == null).map((w) => `${w.name}: commute unavailable.`)],
      warnings: ['Data coverage runs from San Francisco to the southern edge of SFO (37.60° N), over mapped land.'], criteria: [] };
  }
  const evaluated = evaluate({ cells: { type: 'FeatureCollection', features: [containing] }, metrics, commutes: { [containing.properties.h3]: commute }, prefs, priorityOrder })[0];
  return { eligible: evaluated.eligible, state: evaluated.state, commute, cell: containing.properties, neighbourhoodId: containing.properties.nhood_id,
    reasons: evaluated.reasons.map((reason) => reason.kind === 'commute'
      ? `${workplaces.find((w) => w.id === reason.workplaceId)?.name ?? 'Destination'}: the home pin is outside the selected catchment.`
      : reason.kind === 'mustHave' ? `${PREFERENCES.find((p) => p.id === reason.prefId)?.label ?? reason.prefId}: inherited local measurement does not meet this Must-have.`
        : reason.kind === 'nonResidential' ? 'The containing map cell has no confirmed residential use.' : 'Commute catchments do not overlap.'),
    unchecked: evaluated.unchecked.map((id) => id === 'commute' ? (workplaces.length ? 'One or more required commutes are pending or unavailable.' : 'Add a destination to check commutes.')
      : `${PREFERENCES.find((p) => p.id === id)?.label ?? id}: required local evidence is unavailable.`),
    warnings: [...evaluated.warnings, 'Commutes are checked at the actual pin. Lifestyle measurements are inherited from the containing map cell; incident, pollution and rent context retain their larger source geographies.'], criteria: evaluated.criteria };
}

export interface HomeMonthlyCost { rent: number | null; monthlyTransport: number | null; monthlyTotal: number | null; officeDaysPerWeek: number; assumptions: string[] }

export function homeMonthlyCost(home: Pick<Home, 'rent' | 'transportReturnFare' | 'monthlyTransportOther'>, workplaces: Workplace[]): HomeMonthlyCost {
  const officeDaysPerWeek = workplaces.reduce((sum, workplace) => sum + ((workplace as Workplace & { officeDays?: number }).officeDays ?? 3), 0);
  const monthlyTransport = officeDaysPerWeek === 0 ? home.monthlyTransportOther
    : home.transportReturnFare == null ? null : home.transportReturnFare * officeDaysPerWeek * 52 / 12 + home.monthlyTransportOther;
  return { rent: home.rent, monthlyTransport, monthlyTotal: home.rent == null || monthlyTransport == null ? null : home.rent + monthlyTransport, officeDaysPerWeek,
    assumptions: ['Uses the rent and return fare you enter, in US dollars. No fare is inferred from travel mode or distance.',
      `${officeDaysPerWeek} destination days per week × 52 ÷ 12 weeks per month. Each destination day is counted as one return journey; check that days at multiple destinations are not double-counted.`,
      'Add season tickets, parking and other transport costs manually. Excludes utilities, deposits and travel not entered here.'] };
}
