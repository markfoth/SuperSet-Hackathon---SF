import { PREFERENCES } from '../filters/preferences';
import type { ExclusionReason } from '../filters/ranking';
import type { Workplace } from '../../types';

export function reasonText(r: ExclusionReason, workplaces: Workplace[]): string {
  if (r.kind === 'nonResidential') return 'Mapped parkland without supporting residential street evidence';
  if (r.kind === 'noOverlap') return 'No candidate cell satisfies all workplaces together';
  if (r.kind === 'commute') {
    const w = workplaces.find((x) => x.id === r.workplaceId);
    return `Outside ${w?.maxMinutes ?? '?'} min home-to-work catchment for ${w?.name ?? 'workplace'}`;
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
