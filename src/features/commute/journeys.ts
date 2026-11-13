import type { Workplace } from '../../types';

export interface Journey {
  workplaceId: string;
  personId?: string;
  personName: string;
  name: string;
  officeDays: number;
  seconds: number | null;
  distanceMetres: number | null;
  status: 'ok' | 'unreachable' | 'unavailable';
  reason?: string;
}

export interface JourneyEvidence {
  fetchedAt: string;
  arrivalDate: string | null;
  journeys: Journey[];
  assumptions: string[];
}

export interface JourneySummary {
  complete: boolean;
  totalWeeklyMinutes: number | null;
  worstMinutes: number | null;
  balanceMinutes: number | null;
  people: { id: string; name: string; weeklyMinutes: number }[];
}

/** Only measured routes can form totals. A zero-day destination contributes no weekly time. */
export function journeySummary(evidence: JourneyEvidence): JourneySummary {
  const active = evidence.journeys.filter((journey) => journey.officeDays > 0);
  const complete = active.length > 0 && active.every((journey) => journey.status === 'ok' && journey.seconds != null && journey.seconds >= 0);
  if (!complete) return { complete: false, totalWeeklyMinutes: null, worstMinutes: null, balanceMinutes: null, people: [] };
  const people = new Map<string, { id: string; name: string; weeklyMinutes: number }>();
  for (const journey of active) {
    const id = journey.personId || journey.personName.trim().toLowerCase() || journey.workplaceId;
    const person = people.get(id) ?? { id, name: journey.personName, weeklyMinutes: 0 };
    // This is illustrative, not a measured return route.
    person.weeklyMinutes += journey.seconds! / 60 * journey.officeDays * 2;
    people.set(id, person);
  }
  const grouped = [...people.values()];
  const weekly = grouped.map((person) => person.weeklyMinutes);
  return { complete: true, totalWeeklyMinutes: weekly.reduce((a, b) => a + b, 0), worstMinutes: Math.max(...active.map((journey) => journey.seconds! / 60)),
    balanceMinutes: Math.max(...weekly) - Math.min(...weekly), people: grouped };
}

const inFlight = new Map<string, Promise<JourneyEvidence>>();

/** Explicit user action only. No isochrone-derived journey times, no credentials in the client. */
export function requestJourneyTimes(home: { lat: number; lon: number }, workplaces: Workplace[]): Promise<JourneyEvidence> {
  const destinations = workplaces.map((w) => ({ id: w.id, lat: w.lat, lon: w.lon, mode: w.mode, arrive_by: w.arrivalTime || '08:45' }));
  const key = JSON.stringify({ home, workplaces });
  const existing = inFlight.get(key);
  if (existing) return existing;
  const pending = (async (): Promise<JourneyEvidence> => {
    const missing = (reason: string): JourneyEvidence => ({ fetchedAt: new Date().toISOString(), arrivalDate: null,
      journeys: workplaces.map((w, i) => ({ workplaceId: w.id, personId: w.personId, personName: w.personName || `Person ${i + 1}`, name: w.name,
        officeDays: w.officeDays ?? 3, seconds: null, distanceMetres: null, status: 'unavailable', reason })),
      assumptions: ['Journey times were not measured. Commute limits are not journey durations.'] });
    if (!workplaces.length) return missing('Add a destination before checking journey times.');
    if (import.meta.env.VITE_COMMUTE_PROVIDER !== 'proxy') return missing('Exact journey times need configured live evaluation routing. Offline contours only establish approximate reachability.');
    try {
      const base = (import.meta.env.VITE_ROUTING_PROXY_URL || '/api').replace(/\/$/, '');
      const response = await fetch(`${base}/journeys`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home, destinations }), signal: AbortSignal.timeout(25000) });
      const body = await response.json() as { error?: string; fetchedAt?: string; arrivalDate?: string; journeys?: { workplaceId: string; seconds: number | null; distanceMetres: number | null; status: 'ok' | 'unreachable' }[] };
      if (!response.ok || !Array.isArray(body.journeys)) return missing(body.error || `Journey service unavailable (HTTP ${response.status}).`);
      const journeys = workplaces.map((w, i): Journey => {
        const measured = body.journeys!.find((journey) => journey.workplaceId === w.id);
        const valid = measured?.status === 'ok' && typeof measured.seconds === 'number' && Number.isFinite(measured.seconds) && measured.seconds >= 0;
        return { workplaceId: w.id, personId: w.personId, personName: w.personName || `Person ${i + 1}`, name: w.name,
          officeDays: w.officeDays ?? 3, seconds: valid ? measured.seconds : null,
          distanceMetres: valid && typeof measured.distanceMetres === 'number' && Number.isFinite(measured.distanceMetres) && measured.distanceMetres >= 0 ? measured.distanceMetres : null,
          status: valid ? 'ok' : measured?.status === 'unreachable' ? 'unreachable' : 'unavailable', reason: valid ? undefined : 'No measured route was returned for this destination.' };
      });
      return { fetchedAt: body.fetchedAt || new Date().toISOString(), arrivalDate: body.arrivalDate || null, journeys,
        assumptions: ['TravelTime estimates for home to destination, arriving on the next weekday in Pacific time.',
          'Illustrative weekly travel doubles the inbound time, assuming the same return journey and the entered office days.',
          'Multiple destinations for one person are counted as separate return trips. Avoid overlapping day allocations.'] };
    } catch { return missing('Journey service could not be reached. Your locations and commute constraints are unchanged.'); }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}
