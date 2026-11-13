# Common Ground

A location decision tool for people finding a home together from San Francisco to SFO. Start with **Where do you need to get to?**, add destinations and commute limits, then explore the locations that satisfy every required commute and Must-have.

The map is the workspace. Search, results and details share one collapsible panel. Find keeps matching legible in 2D; Explore adds optional neutral 3D buildings and real terrain; Compare brings saved neighbourhoods, precise bookmarks and prospective homes together. Mobile uses a map above one scrollable bottom panel, with an unrestricted Focus on map view.

## Run locally

Requires Node 24. Committed analysis data and photos are sufficient for the account-free offline example.

```powershell
npm.cmd ci
npm.cmd run dev -- --host localhost --port 5188 --strictPort
```

Open <http://localhost:5188>. Choose **Try the SF + SFO example**. It uses labelled, approximate offline commute data for SFO Airport and the Financial District. Other offline modes are synthetic and labelled as such. The transit fixture includes an expired Muni timetable; it is not a current journey planner.

The map needs public OpenFreeMap tiles for its street background. No account, card or key is needed. Local boundaries, matching cells and pins remain available during tile failures. WebGL failures open a lazy 2D Leaflet compatibility map.

For a production-build review:

```powershell
npm.cmd run build
npm.cmd run preview -- --host localhost --port 4173 --strictPort
```

The static preview does not execute Vercel API functions. Optional live evaluation routing uses the local proxy or the Vercel functions described below. Do not run a data rebuild while a browser suite is reading its outputs.

## What works

- Separate person and destination labels, confirmed selected places, coordinates and draggable map pins. Typing a label or search query never silently moves a location.
- Bounded local search over real named stations, neighbourhoods and mapped places. It is not a complete address geocoder. Use a precise pin or coordinates for an address.
- Multiple destinations per person, colours, office days, travel modes and commute limits. Live evaluation routing supports Pacific arrival times.
- Joint H3-9 representative-point commute gates, hard Must-haves, ordered measurement bands, source-aware missing values and deliberate trade-off previews.
- Compact, photographed neighbourhood results with reasons, compromises, per-person catchment evidence and explicitly ZIP-level rent context.
- Saved neighbourhoods and exact map-cell bookmarks, notes, re-evaluation after settings change, and comparison of three or more possibilities.
- Prospective homes with actual-coordinate commute checks, manual rent, bedrooms, listing links and notes. Cell, ZIP, tract and incident-grid measurements keep their original precision.
- Monthly rent plus transparent user-entered transport assumptions. Explicit route-time checks support illustrative weekly totals, longest one-way commute and balance when all relevant journeys are measured.
- Named local scenarios, reload persistence, validated JSON export/import and privacy-first share fragments. Precise destinations and homes are omitted from links unless explicitly included.

There is no synchronised household server. Shared scenarios are portable copies; later edits stay on each device. Anyone with a precise-location link can read it. Links have no sign-in, revocation or expiry.

## Matching and evidence

Every confirmed matching cell must satisfy **all** destination catchments and every measured Must-have at its representative point. Pending, failed and stale route requests never disappear from the gate. A home checks its actual pin against the same catchments, while lifestyle measurements remain inherited from its containing cell.

Earlier preference bands dominate later ones; Important uses finer bands than Nice. No universal liveability or safety score is used. Without lifestyle preferences, the interface describes commute feasibility rather than a definitive personalised ranking.

Coverage ends at SFO's southern edge, 37.60° N. Peninsula incident and injury-crash data are unavailable. Missing data is neither zero nor a failed measurement. ZIP rents are historical all-type asking indices, not property or bedroom-specific estimates. Distances are straight-line access measures. Park-cut display footprints are not a verified residential parcel inventory.

## Optional live evaluation routing

Keep existing private environment files intact. Use [.env.example](.env.example) as a blank reference. Only server variables receive `TRAVELTIME_APP_ID` and `TRAVELTIME_API_KEY`.

TravelTime Basic is free without a card or expiry, but is restricted to **research, development and evaluation**. Commercial production use needs a separate licence and is outside this upgrade. Successful API access does not grant production rights.

For a permitted local evaluation, set the private environment configuration:

```dotenv
VITE_COMMUTE_PROVIDER=proxy
VITE_ROUTING_PROXY_URL=/api
ROUTING_DRY_RUN=0
ROUTING_PROXY_PORT=8787
```

Start `npm.cmd run proxy` in a second terminal and restart Vite. `/api/health` reports configuration booleans without credentials. Persistent provider caching is disabled unless `ROUTING_CACHE_ALLOWED=1` is deliberately set after verifying storage rights. Identical in-flight requests are deduplicated. Server caps are per instance, not distributed account-wide quotas.

Exact journey times are requested for one home at a time, only after an explicit action. A weekly illustration doubles measured inbound duration and multiplies by entered office days, assuming equal return travel. Missing journeys keep the combined total unknown. Multiple destinations count separate return trips; avoid overlapping allocations.

## Verification

```powershell
npm.cmd test
npm.cmd run test:proxy
npm.cmd run build
npm.cmd run test:browser
.venv/Scripts/python.exe -X utf8 scripts/validate_datasets.py
.venv/Scripts/python.exe -X utf8 -m pytest
```

Browser tests use installed Google Chrome, one worker, fixture routing and an isolated port 5187. They include genuine MapLibre rendering and touch dragging, recovery from deliberate failures, stale routes, matching, data gaps, local persistence, scenarios, sharing and home comparisons. See [measured verification](docs/VERIFICATION.md) for actual results and host limitations, and [review screenshots](docs/REVIEW.md) for the three requested viewport sizes.

## Data and performance

Canonical processed data lives in `data/sf/processed/`; frontend builds copy it to ignored `public/data/`. Heavy preprocessing stays outside runtime and frontend builds. Dataset sources, licences, dates, resolution and limits are in [the manifest](data/sf/manifest.yaml).

Optional terrain uses **62 genuine USGS Terrain RGB tiles, 2,234,702 bytes** total, at actual scale. It is independent of the existing coloured topographic overlay. Buildings come from viewport vector tiles, with approximate OSM-derived metre heights, including storey inference. Building height never encodes suitability. No custom city-wide building GeoJSON, global extract or mesh is shipped.

```powershell
.venv/Scripts/python.exe -X utf8 scripts/rebuild_all.py --dry-run
.venv/Scripts/python.exe -X utf8 scripts/build_terrain.py
node scripts/measure_map.cjs
```

The complete data preparation, source decisions and HTTP/asset budgets are in [map documentation](docs/MAP_UPGRADE.md), [data accuracy](docs/DATA_ACCURACY_AUDIT.md) and [Peninsula coverage](docs/PENINSULA_COVERAGE.md).

## Review and deployment

- [Verification, measurements and limitations](docs/VERIFICATION.md)
- [Desktop, tablet and mobile screenshots](docs/REVIEW.md)
- [Vercel and Railway deployment checklist](docs/VERCEL_DEPLOYMENT.md)
- [Place search, routing, terms and fairness](docs/SEARCH_ROUTING.md)
- [Scenarios, sharing, homes and costs](docs/HOUSEHOLD_SCENARIOS.md)
- [Architecture](docs/ARCHITECTURE.md) and [ranking method](docs/RANKING_METHOD.md)
- [Implementation progress](docs/UPGRADE_PROGRESS.md)

The upgrade stays on its feature branch. Merging, production deployment, paid resources and infrastructure changes require a separate instruction.
