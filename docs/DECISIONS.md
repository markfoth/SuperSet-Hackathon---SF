# Decisions

Short records of decisions that shape the product and data. Newest first within each section.

## Product

**D1. Commute gates; everything else ranks unless explicitly a Must.** The commute is the only
default hard constraint (≥ 50 % of a neighbourhood's sample points within every workplace's area).
Soft preferences re-rank; Musts exclude, but each is evaluated independently and all failures are
listed, so adding an unimportant filter can never silently wipe out strong matches. *Why:* the core
complaint with filter-chain UIs. Borrowed from Optimal London Living's "commute gates, budget warns".

**D2. A requested commute that can't be computed blocks results.** Custom workplaces have no
offline fixture, so results show a recoverable error instead of an ungated list. *Why:* silently
dropping the user's most important constraint is worse than an error (OLL rule).

**D3. Missing data is explicit.** `null` in data, "No data" in UI, never a pass or fail.

**D4. Parkland isn't ranked as a place to live.** Golden Gate Park, Lincoln Park and McLaren Park
(`residential: false` in the content YAML) are excluded with a visible reason; the Presidio and
Treasure Island have housing and stay in.

**D5. No liveability score.** Scores are per-preference ranks among the 41 neighbourhoods,
weighted by importance. Transparent, explainable, no hidden weights.

**D6. Only SF's 41 Analysis Neighborhoods are ranked for now.** The study area extends to SFO for
commute geometry and transit, but Peninsula cities (Daly City, South SF, San Bruno, Millbrae) are
not yet scored. Adding them needs city/neighbourhood polygons plus non-SF crime/bike data.

## Data

**D7. Analysis Neighborhoods come from `j2bu-swwd`.** The requested `p5b7-5n3h` is a map
visualisation with no export; `j2bu-swwd` is its underlying table (41 polygons). Ids are slugs of
the name, pinned by a test.

**D8. Crime = distinct initial reports, 12 complete months, non-crime categories removed.**
Supplements (`IS`/`VS`) duplicate initial reports; administrative categories (Non-Criminal, Lost
Property, Warrant, Traffic Collision…) aren't crime. Counted per km² of land, **not per resident**
(ACS population is blocked on a Census key), so commercial areas read high — the UI says so.
Shown on H3 res-8 cells (≈ 0.74 km²); points are never drawn.

**D9. Parks = SF Rec & Park + OSM for everything else.** RPD omits the Presidio, GGNRA (Lands End,
Fort Funston, Fort Mason) and state parks. OSM parks ≥ 0.2 ha that are mostly outside RPD land are
added (59), with the RPD overlap subtracted. Non-park RPD property types are dropped.

**D10. Transit from agency GTFS; 511 only with our own token.** BART, Muni and Caltrain publish
public static feeds. SamTrans no longer has a developer page (samtrans.com returns 404) and is
published only via 511. 511 returns 401 without a token, and its terms forbid redistribution
without a developer agreement, so the Mobility Database's mirrored copy of the 511 SamTrans feed
was **not** used. `API_511_KEY` activates SamTrans and a current Muni feed (`gtfs_muni_511`)
automatically.

**D10a. Timetables must cover the demo day, or say they don't.** `TARGET_SERVICE_DATE`
(2026-10-22; env `CG_SERVICE_DATE`) is checked at download and processing time. BART (valid to
2027-01-10, 1,021 trips that day) and Caltrain (to 2027-01-31, 112 trips) cover it. SFMTA's public
"current" Muni feed (and every Mobility Database snapshot) ends 2026-08-28, so Muni uses a fallback
weekday in its own period and is labelled *out-of-date timetable* in the manifest, in the commute
fixtures and in the UI. Route geometry is unaffected. Superseded raw files are archived to
`data/sf/raw/archive/` on refresh.

**D11. Rents = Zillow ZORI by ZIP (asking) + ACS median gross rent (paid).** Neighbourhoods show
the dominant overlapping ZIP's ZORI series and its coverage share, plus the ACS 2020-24 median rent
*paid*, labelled as such (it includes long-held rent-controlled leases, so it is far lower).
**Zillow's terms for redistributing derived data must be reviewed before any public deployment.**

**D11a. ACS from the official bulk files, not the API.** The Census API now needs a key for every
data endpoint; the table-based summary files on www2.census.gov do not. Tract populations are
apportioned to neighbourhoods by land area (SF County tracts only; total 830,311 vs ACS 830,235).
This enables *incidents per 1,000 residents* (null under 1,000 residents) alongside per km2.

**D11b. CalEnviroScreen 5.0: pollution indicators only.** We use PM2.5, diesel PM, ozone, traffic,
toxic releases, housing lead risk and the pollution-burden percentile, per tract. The composite CES
score and population-characteristic/demographic fields are deliberately excluded, and pollution is
never merged with vulnerability into a "safety" score. Neighbourhood values are population-weighted
tract means, shown as statewide percentiles.

**D11c. Food & drink POIs are discovery context, not ranking inputs.** OSM cafes/coffee shops,
restaurants and bars/pubs (3,245 named places in SF) are drawn only at street zoom (>= 15) and as
counts on the detail panel.

**D12. Terrain slope, not street grade.** USGS 3DEP 10 m DEM; cell mean slope within ~170 m, and
steepest 50 m grade per bike segment. A street cut across a hill can be flatter than the terrain.

**D13. Processed data committed once.** `data/sf/processed/` is the single committed copy;
`public/data/` is generated by `scripts/sync_public_data.mjs`. Raw data is gitignored.

**D14. Photos from Wikimedia Commons, free licences only, cached locally.** 41/41 (6 hand-picked
where the Wikipedia lead image was missing, generic, or came from a redirect to the neighbourhood
list). Optimised copies (<= 800 px, ~90 KB) live in `public/images/neighbourhoods/` so the demo does
not depend on Wikimedia; the UI falls back to the Commons thumbnail and then a placeholder. Credit,
licence and source page travel with each photo. Descriptions are editorial drafts with no
demographic claims.

## Platform

**D15. Static-first React + Vite + Leaflet; no backend yet.** Cheap to host (any static host /
CDN), nothing per-user on the server. Leaflet is driven imperatively (no react-leaflet) to keep
dependencies to React, Leaflet and two Turf modules.

**D16. Base map: Stadia Maps Alidade Smooth.** CARTO basemaps now return "API key required" tiles;
the public OSM tile server's usage policy forbids heavy production use. Stadia works keyless on
localhost and needs a free account + domain auth when deployed (free tier for non-commercial;
check limits). Override with `VITE_BASEMAP_URL` (e.g. MapTiler).

## Routing provider comparison (2026-10-21)

Verified from vendor pages tonight where noted; everything else needs confirming before purchase.

| | TravelTime | Geoapify | OpenRouteService | OpenTripPlanner (self-host) |
|---|---|---|---|---|
| Walk / cycle / drive | ✅ | ✅ | ✅ (OSM road network) | ✅ |
| Public transport | ✅ real GTFS timetables | ⚠ `approximated_transit` (not timetable-based) | ❌ | ✅ real GTFS (our feeds) |
| Arrive-by (home → work) | ✅ `arrival_time` on `/v4/time-map` | ❌ departure-style only | n/a | ✅ `arriveBy` in trip planning; OTP2 removed the v1 isochrone API (a sandbox travel-time API may exist — unverified) |
| Multi-workplace intersection | ✅ server-side intersections in one POST | client-side | client-side (≤ 5 locations/request) | client-side / custom |
| Free allowance | "Basic": free, 120 hits/min, **development & testing only, not commercial** | 3,000 credits/day free (attribution; limited commercial) | 500 isochrones/day, 20/min | Free software; you pay hosting |
| ~10,000 users | Production plan, annual fee by quote | Paid tiers from $59/mo (10k credits/day) — credit cost per isoline to confirm | Exceeds free quota → self-host ORS | One VM (~$40–80/mo) + ops time |
| Caching | Rights set per Production order | Their FAQ allows storing created data (isoline-specific terms unconfirmed) | Unconfirmed | Unrestricted (own server; GTFS licence terms apply) |
| Integration effort | Low (REST/SDK) | Low (used in OLL) | Low | High (graph build, hosting, isochrone from many trips) |
| SF/SFO transit quality | Best expected (BART/Muni/Caltrain/SamTrans) — verify with a test call | Poor for transit | n/a | Good, if SamTrans feed added |

**Recommendation.**
1. **Hackathon (approved 2026-10-21: TravelTime free Basic plan, no paid commitment).**
   `server/routing-proxy.mjs` (Node built-ins only) calls `POST /v4/time-map` with
   `arrival_searches` (arrive by 08:45 next weekday, America/Los_Angeles) and
   `Accept: application/geo+json`; caches by ~11 m-rounded coordinate in `data/cache/`
   (gitignored); caps live calls per day (`ROUTING_DAILY_CAP`, 300); validates study-area bounds;
   never logs keys. The client tries the proxy first and falls back to offline fixtures, so the
   default demo needs no routing API. **Credentials not yet provided**: `TRAVELTIME_APP_ID`,
   `TRAVELTIME_API_KEY`.
2. **Walk/cycle/drive** for custom workplaces: OpenRouteService free tier is fine for demo volume.
3. **Production:** TravelTime Production (quote) if budget allows; otherwise self-host OTP (or
   r5py/R5) on one VM using the same GTFS feeds and serve cached isochrones. Geoapify is not
   recommended for this product because its transit mode is approximated and has no arrive-by.

Sources: [TravelTime pricing](https://traveltime.com/analytics/api-pricing),
[TravelTime time-map](https://docs.traveltime.com/api/reference/time-map),
[Geoapify pricing](https://www.geoapify.com/pricing-details/),
[ORS restrictions](https://openrouteservice.org/restrictions/),
[OTP 2 docs](https://docs.opentripplanner.org/en/v2.8.0/).
