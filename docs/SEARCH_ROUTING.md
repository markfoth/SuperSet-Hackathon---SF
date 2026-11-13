# Place search and commute evidence

Verified against primary service documentation on 12 November 2026.

## Place search

Search runs locally over the committed, bounded named-place datasets: agency GTFS
stops, DataSF and San Mateo County neighbourhood label positions, and mapped OSM
cafés, restaurants and groceries. Search source files are requested only when the
user submits a search, then shared through the existing in-memory data loader.
It has no account, API key, credit card, request charge or external search quota.
Source dates and licences remain in `data/sf/manifest.yaml`; this is a derived
in-memory index, not another separately downloaded dataset.

This is **named-place search, not a complete address database**. A neighbourhood
result selects its labelled centre, not a building. A station selects its source
stop position. Search results state their type. The user can inspect the selected
place, coordinates and pin, then drag the pin or enter precise coordinates.
Editing a destination label never changes its selected place or coordinate.
Selecting a new result deliberately updates the coordinate.

The supported search envelope is 37.60–37.90° N and 122.62–122.25° W. The actual
matching geography is smaller and excludes water and unsupported land. Being
inside the envelope does not imply local measurements or route coverage exist.
Missing measurements remain unknown. Address strings outside the local index
return no result rather than an invented location.

The [OSMF Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/)
forbids public-API autocomplete and limits an entire application to one request
per second. It also requires identification, attribution, caching, a switchable
endpoint and an informed developer decision. A per-browser throttle would not
meet its aggregate limit on a horizontally scaled Vercel application. Common
Ground therefore makes **no Nominatim calls**, including while typing. The local
index can be replaced later by a bounded official SF address extract without
changing the selected-place semantics.

## Reachability

The original representative-point H3 commute intersection remains the eligibility
gate. Each active destination must return a valid polygon and contain the same
representative location. A failed, pending or stale route is not removed from the
gate. The browser request identity includes coordinates, travel mode, maximum
minutes and arrival time. Names, colours and office-day changes do not request a
new isochrone. A request response for old settings cannot satisfy new settings.

Live requests use TravelTime arrival searches, arriving at the destination on the
next weekday in America/Los_Angeles. The time is editable when live evaluation
routing is configured. The server validates time syntax and bounds, accounts for
Pacific daylight saving, limits the body and sanitises errors. It never sends
credentials to the browser. The server rejects malformed or empty polygons.

Offline examples remain explicitly approximate. Their transit model uses dated
agency timetables, including an expired Muni feed; other offline travel modes are
synthetic. Fixtures only support their original 08:45 arrival and two example
destinations. Changing a label preserves the location; moving a pin away from a
fixture produces an unavailable result. A proxy failure may use a matching
offline fixture with an explicit failure/fallback label, but never drops that
destination's constraint.

## Exact journey checks and fairness

An explicit **Check journey times** action on a home calls `POST /api/journeys`.
The existing routing proxy exposes the same endpoint locally. The request is
bounded to one precise home and at most eight destinations, sent as one
TravelTime Routes POST with separate arrival searches. There is no background
matrix over the matching cells. Both [the Routes reference](https://docs.traveltime.com/api/reference/routes)
and [Routes overview](https://docs.traveltime.com/api/overview/routes) confirm
inbound searches and measured `travel_time` values in seconds. Provider access
does not itself establish production-use rights.

The server requests only journey time and returns seconds when the corresponding
route property is present and finite. Transit distance is not a first-class
provider measurement and is neither requested nor used to estimate fares.
Unreachable and failed routes return null;
the client never substitutes zero or a commute limit. Exact checks supplement
the reachability evidence; they do not relax eligibility. No exact journey
request is made in offline fixture mode.

For a complete set of measured, active journeys, comparisons support:

- Total illustrative weekly travel: sum of inbound minutes × entered office
  days × two.
- Longest individual one-way journey: maximum measured inbound minutes.
- Balance of weekly burden: largest minus smallest weekly total, grouped by
  person ID, or normalised person label when no ID exists.

The factor of two assumes the same return journey; the return is not separately
measured. Multiple destinations for one person are treated as separate return
trips. Users must avoid overlapping allocations of office days. A zero-day
destination contributes no weekly total but remains an active reachability
constraint. If any positive-day journey is missing, the combined weekly total
and balance remain unavailable. Office days and assumptions are shown alongside
the evidence. Checks retain their retrieval time and arrival date, and are
invalidated when their home or relevant household settings change.

## Free-plan use, caching and reliability

[TravelTime pricing](https://traveltime.com/pricing) and its
[current introduction](https://docs.traveltime.com/api/overview/introduction)
describe Basic as free without a card or expiry, for research, development and
evaluation. Commercial use, including internal commercial processes, requires a
Production licence. Current [Basic limits](https://docs.traveltime.com/api/overview/usage-limits)
are 120 hits/minute. One route search is one hit, so a check of eight destinations
consumes eight hits even though it uses one HTTP request. The application adds
a configurable default cap of 300 hits/day per running server instance. It does
not claim that a Vercel per-instance counter is an account-wide quota.

TravelTime states that production caching, retention and reuse rights are
contractual. The application does not infer persistent storage rights for a
Basic key. Server cache reads and writes are disabled by default. Only set
`ROUTING_CACHE_ALLOWED=1` after verifying that the account's terms permit them.
When enabled, caches expire after 24 hours, include arrival date/time and routing
inputs, and never serve stale geometry. Vercel cache keys are hashed. Identical
in-flight requests are deduplicated regardless of persistent-cache settings.
Successful route evidence remains in component memory for the current review;
it is not exported as fresh scenario evidence.

Keys remain private `TRAVELTIME_APP_ID` and `TRAVELTIME_API_KEY` server variables.
`GET /api/health` exposes only configuration booleans and the usage restriction.
No service, subscription or paid resource is created by this upgrade. Live
evaluation is optional: the labelled offline example and the local search,
bookmarks, home entry, scenarios and sharing remain useful without it.

## Validation

`npm run test:proxy` covers inbound routing, Pacific dates/DST, request validation,
provider errors, daily caps, cache rights/expiry, request deduplication, exact
selected-home coordinates, partial journey evidence and secret-free HTTP health.
Focused Vitest coverage in `src/features/commute/` and `src/features/places/`
covers arrival-time identities, fixed-time fixtures, bounded accent-insensitive
local search, no fabricated addresses, household fairness maths and unavailable
journeys. Browser interaction checks are recorded in the upgrade progress and
verification documentation; a mocked route contract is not a live provider check.

A bounded live Routes check initially encountered sandbox networking limits and
an automatic review rejection for exporting location data. After the user
explicitly authorised one published-example request, that single request
succeeded: HTTP 200 in 416 ms, retrieved at `2026-11-13T05:54:09.990Z` (12 November
in Pacific time). It used the published Financial District example coordinate
as its origin and the SFO example as destination, arriving at 08:45 Pacific on
13 November. TravelTime returned 4,099 seconds, about 68.3 minutes. No private
prospective-home coordinate or credential was printed. This confirms the live
Routes protocol and parsing; it is not a journey guarantee or verification of
every address or transit timetable.
