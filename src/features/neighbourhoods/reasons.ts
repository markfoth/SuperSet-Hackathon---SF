import { PREFERENCES } from '../filters/preferences';
import type { ExclusionReason } from '../filters/ranking';
import type { Workplace } from '../../types';

export function reasonText(r: ExclusionReason, workplaces: Workplace[]): string {
  if (r.kind === 'nonResidential') return 'Mostly parkland — few or no homes';
  if (r.kind === 'commute') {
    const w = workplaces.find((x) => x.id === r.workplaceId);
    return `Only ${Math.round(r.coverage * 100)}% within ${w?.maxMinutes ?? '?'} min of ${w?.name ?? 'workplace'}`;
  }
  const p = PREFERENCES.find((x) => x.id === r.prefId)!;
  return `${p.label}: ${p.format(r.value)} (needs ${p.mustHave.describe})`;
}

export function rentalSearchLinks(name: string) {
  const q = encodeURIComponent(`${name}, San Francisco, CA`);
  return [
    { label: 'Zillow', url: `https://www.zillow.com/homes/for_rent/${q}_rb/` },
    { label: 'Craigslist', url: `https://sfbay.craigslist.org/search/sfc/apa?query=${encodeURIComponent(name)}` },
    { label: 'Apartments.com', url: `https://www.apartments.com/search/?q=${q}` },
  ];
}
