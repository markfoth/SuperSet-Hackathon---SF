# Households, scenarios and prospective homes

Common Ground keeps the current household and named scenarios on the user's device. It has no account or live collaboration server. A scenario file or link opens a portable copy; subsequent edits are not synchronised.

## Persistence and privacy

- The current workspace uses `cg:household-workspace:v1` in local storage. Named scenarios use `cg:scenarios:v1`.
- Snapshots include confirmed destinations, travel modes and limits, person labels/colours, office days, supported arrival times, preferences and priority order, neighbourhood shortlist, specific-location bookmarks and prospective homes.
- Imports are validated before application. Unknown schema versions, invalid coordinates, unsupported preferences, duplicate identifiers and unsafe listing links are rejected. Limits are 500 KB per file, 20 destinations, 30 homes, 100 bookmarks and 50 named scenarios.
- Storage failures are exposed to the interface. The tab can remain useful in memory and users can export a JSON copy. The helpers never remove corrupted storage merely because reading it fails.
- JSON exports include precise locations. The export interface makes that explicit.
- Share links use a URL fragment, which is not sent in an ordinary HTTP request. Default links omit destinations, homes and precise bookmarks. Users must explicitly select the checkbox to include them.
- Fragments are portable text, not encrypted storage. Anyone with a precise-location link can read its contents. There is no sign-in, revocation or expiry. Links are limited to 32,000 encoded characters; larger scenarios must use files.
- The recipient sees a shared-scenario notice and must choose **Use shared scenario** before the current household is replaced.

Specific-location bookmarks can record the original settings and a stable comparison fingerprint. A changed label does not change location eligibility; a changed pin, mode, commute limit, supported arrival time, Must-have or priority order does. Current evaluation determines whether a saved item still matches. The fingerprint is a convenience identifier, not encryption.

## Specific homes

A home is a user-selected coordinate with an optional manual monthly rent, bedroom count, listing URL and notes. There is no listing scraping or inferred property rent. Users can choose a local named place, enter coordinates or place a pin, then refine it.

`evaluateHome` tests each required commute polygon at the actual selected coordinate. A pending, failed or malformed required route remains unknown and cannot become a confirmed match. Local lifestyle measurements are inherited from the containing canonical H3-9 cell. That inheritance is stated in the interface. Incident data retain their H3-8 source, pollution remains tract-level, and asking-rent context remains ZIP-level. A property outside the measured cells has unavailable local evidence, even if a commute polygon includes it.

A home passing inherited local requirements is an evidence check, not a building survey or a journey guarantee. Park access is still straight-line proximity; source completeness and residential-use uncertainty remain relevant.

## Costs and commute burden

The cost view uses entered rent, entered return fare per destination day and entered other monthly transport costs:

```text
monthly transport = return fare × sum(destination office days) × 52 ÷ 12 + other monthly transport
monthly total = entered rent + monthly transport
total entered monthly budget = monthly total + entered other recurring costs
```

Missing rent or a required fare remains unknown. An explicitly entered zero is valid. Office-day defaults are three days per destination. Each destination day is counted separately; households must avoid counting the same journey twice when one person has several destinations. Season tickets, parking and other costs should be entered in the fixed monthly amount, with a per-day fare of zero if appropriate. Utilities, deposits and unentered travel are excluded. A ZIP rent index is never treated as a bedroom-specific estimate.

The **Check journey times** action calls the configured routing adapter explicitly. Isochrone limits never become estimated journey durations. If the service cannot return measured routes, the view says **Not measured** and the original eligibility gate stays intact. When all active routes are measured, weekly return travel is illustrative: the measured inbound duration is doubled and multiplied by entered office days. The interface discloses that the return journey is assumed equal to the inbound one.

Comparisons show total illustrative weekly travel, the longest individual one-way commute and the difference between the highest and lowest weekly person totals. At least two currently eligible homes with complete, current measurements are needed to enable Shortest measured household travel and Most balanced measured commutes. Ties and non-dominated alternatives are disclosed; incomplete or excluded homes cannot win. Homes with stale coordinates or household settings do not reuse displayed evidence for a different request. The original adapter's request caching and server terms apply.

Other recurring costs, such as utilities, are optional user assumptions. A blank value is unknown, including on imported older scenarios. Zero must be entered explicitly. The rent-plus-transport subtotal stays separate from the total entered budget, which requires all three components. Deposits and unentered costs are excluded.

## Verification

- `npm exec vitest run src/features/scenarios/model.test.ts src/features/homes/evaluation.test.ts`
- `npm run test:browser -- tests/browser/scenarios-homes.spec.ts`

The unit contracts cover privacy defaults, explicit precise sharing, Unicode portable scenarios, malformed imports, storage denial, source precision, actual-coordinate commute checks, failed/pending constraints, Peninsula unknowns and monthly cost arithmetic. Browser coverage exercises saving and reloading, export/import, privacy-first sharing with recipient confirmation, specific-home editing/costs, unavailable exact route evidence, focus containment, Escape and focus restoration.

## Future collaboration extension

A small authenticated or unguessable-capability Railway store could provide shared household revision history, expiry and explicit invitations. It is deliberately absent from this account-free workflow. Do not describe local persistence or portable links as synchronised collaboration.
