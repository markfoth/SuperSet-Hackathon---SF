# Common Ground

Find areas from San Francisco through South San Francisco to SFO that fit your commute(s) and priorities — before you start
looking at listings.

Add one or more workplaces, choose how you travel and your maximum commute, and the map shows
where the commutes overlap. Express what matters (parks, flatter streets, rail access, fewer
reported incidents…) as *nice to have*, *important* or *must have*, and Common Ground ranks the
local **H3 resolution 9 cells** (~0.105 km²), groups suitable cells into 41 SF neighbourhoods plus 17 Peninsula city/unincorporated areas,
explains exclusions and unknown measurements, and retains photos and ZIP-level rent trends.

Different parts of a neighbourhood can now match differently. Every candidate cell must satisfy
**all workplace commutes together** and every measured Must-have. Reorder priorities with the
up/down buttons; earlier measurement bands dominate later ones, with finer bands for Important
than Nice. No combined liveability score is used. Click a cell for local evidence, or save
neighbourhoods and click the saved count to compare them.

Map: **green** strong eligible matches, **yellow** partial soft-preference matches, **grey**
insufficient information. Excluded cells are always hidden, including when inspected from the
panel; exclusions remain explained in the results. Individual commute borders use 20% opacity,
and a solid bold green border shows their shared overlap. Matching checks a representative point per cell; it does
not guarantee an entire hexagon or every address is reachable.

Demo defaults: **SFO Airport** (transit, ≤ 60 min) and **Financial District** (transit, ≤ 45 min).

## Quick start (Windows; tested 2026-10-21 with Node 24, Python 3.11)

```bash
git clone https://github.com/markfoth/San-Francisco---House-Hunter---Joint-Project.git common-ground
cd common-ground
npm install
npm run dev          # → http://localhost:5173
```

The processed data is committed, so the app runs without the Python pipeline.

## Rebuilding the data

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r requirements.txt

.venv/Scripts/python.exe scripts/rebuild_all.py --dry-run     # show the plan
.venv/Scripts/python.exe scripts/rebuild_all.py               # download missing sources, process, validate (~1–3 min)
.venv/Scripts/python.exe scripts/rebuild_all.py --refresh     # re-download everything
.venv/Scripts/python.exe scripts/rebuild_all.py --offline --dataset crime parks   # rebuild some datasets from raw

.venv/Scripts/python.exe scripts/download_datasets.py --list  # every source and its priority
.venv/Scripts/python.exe scripts/process_datasets.py --list   # every processing step
```

(macOS/Linux: use `.venv/bin/python`.) Downloads go to `data/sf/raw/` (gitignored, ~135 MB);
browser-ready outputs go to `data/sf/processed/` (committed, ~9 MB; photos in
`public/images/neighbourhoods/`, ~3.8 MB) and are recorded in
[`data/sf/manifest.yaml`](data/sf/manifest.yaml).

SamTrans is included from its official public download with no additional key. Optional
`API_511_KEY` in private `.env` enables the current Muni feed and alternative 511 feeds.
Every GTFS feed is checked against the demo date (`CG_SERVICE_DATE`,
default 2026-10-22); a feed that doesn't cover it is labelled out-of-date, never shown as current.

## Live routing (optional)

The default demo (SFO + Financial District) runs offline from precomputed commute areas. For any
other workplace, use the TravelTime proxy (free Basic plan; keys stay server-side):

Copy `.env.example` to `.env` **only if `.env` does not already exist**. Put your real
`TRAVELTIME_APP_ID` and `TRAVELTIME_API_KEY` in `.env`; keep `.env.example` blank.
Also set these lines in `.env`:

```dotenv
VITE_COMMUTE_PROVIDER=proxy
VITE_ROUTING_PROXY_URL=/api
ROUTING_DRY_RUN=0
ROUTING_PROXY_PORT=8787
```

Start both processes from **this checkout** (PowerShell):

```powershell
npm.cmd run proxy                                      # terminal 1
npm.cmd run dev -- --host localhost --port 5188 --strictPort  # terminal 2
```

Open `http://localhost:5188`. Restart both processes after changing `.env`. If another proxy
already occupies 8787, choose a free `ROUTING_PROXY_PORT` (this local session uses **8789**);
Vite forwards `/api` to the same configured port. `http://localhost:5188/api/health` should report
`configured: true` and `dryRun: false`. This checks configuration; adding a workplace and seeing
the **TravelTime routing estimate** label checks a real API response.

The message **“No offline commute data for this location”** means offline fixtures were used.
With `VITE_COMMUTE_PROVIDER=fixture`, the API is never called, even if keys are present.
`ROUTING_DRY_RUN=1` only previews the request and returns no catchment. Without keys or a working
proxy, the app falls back to labelled offline data for the two demo workplaces; custom workplaces
show a clear “can't calculate” message and block results. Keys authenticate the server through
`X-Application-Id` and `X-Api-Key`, as described in the
[TravelTime authentication docs](https://docs.traveltime.com/api/start/auth).

## Tests

```bash
npm test                                       # ranking/filtering logic (vitest)
npm run build                                  # typecheck + production build
npm run test:proxy                             # inbound routing/date/validation contracts
npm run test:browser                           # installed Chrome: desktop + mobile full flow
.venv/Scripts/python.exe -m pytest             # data contracts (GeoJSON validity, ids, manifest, joins)
.venv/Scripts/python.exe scripts/validate_datasets.py
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — frontend, data pipeline, commute model, data flow
- [docs/DECISIONS.md](docs/DECISIONS.md) — key decisions, including the routing-provider comparison
- [docs/DATA_CATALOGUE.md](docs/DATA_CATALOGUE.md) — current and candidate datasets
- [docs/HACKATHON_PLAN.md](docs/HACKATHON_PLAN.md) — done / blocked / next
- [CLAUDE.md](CLAUDE.md) — rules for AI-assisted sessions
- [docs/DATA_ACCURACY_AUDIT.md](docs/DATA_ACCURACY_AUDIT.md) — measured, derived, approximate and synthetic inputs
- [docs/STREET_GRADIENT_METHOD.md](docs/STREET_GRADIENT_METHOD.md) — street alignment, coverage and geographical validation
- [docs/RANKING_METHOD.md](docs/RANKING_METHOD.md) — hard gates, priorities, bands and missing data

## Local demo and production artifact (no deployment)

On Windows PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`:

```powershell
npm.cmd ci
npm.cmd run dev                         # Vite prints the available local port
npm.cmd run build                       # produces dist/; syncs canonical data automatically
npm.cmd run preview -- --host localhost --port 4173
```

The production preview is at `http://localhost:4173`. The static `dist/` artifact is ready for
a future hosting decision. Nothing is pushed or publicly deployed. Live routing needs the
separate proxy; Vite's development `/api` proxy is not part of a static production build.

Rebuild the fine cells from cached sources:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/download_datasets.py --only streets_active
.venv/Scripts/python.exe -X utf8 scripts/rebuild_all.py --offline --dataset hills cycling
.venv/Scripts/python.exe -X utf8 -m pytest
.venv/Scripts/python.exe -X utf8 scripts/validate_datasets.py
```

`area_cells.geojson` is the canonical ~2.50 MB matching input (**2,408 cells**); raw street/raster
files never load in the browser. **Topographic map** replaces the street-line overlay: a local
USGS elevation colour gradient (~315 KB PNG), with metres above sea level in its legend. It needs
no key and covers SF through SFO; water and missing coverage are transparent. Street gradients
still drive the Flatter streets preference, independently of elevation. Browser tests use an isolated port 5187 and installed
Google Chrome; if absent, install Chrome or change the Playwright channel. Screenshots/traces
are generated in gitignored `test-results/`.

Limitations: offline transit catchments remain approximate and use an expired Muni timetable;
other offline modes are synthetic. DEM grades are not surveyed and can be biased by bridges,
tunnels and retaining walls. Straight-line access does not model entrances, crossings or
barriers. Residential evidence is incomplete: uncertain cells are flagged, and only near-total
park cells without supporting residential street evidence are excluded, along with dedicated
airport/golf/quarry jurisdictions. Incident rates remain H3-8, pollution remains tract-level,
and asking rents remain ZIP-level. SF police and injury-crash feeds do not cover the Peninsula;
those local values stay unavailable and a corresponding Must produces unknown cells.

The southern cutoff is **37.60° N**, at SFO’s southern edge. The extension includes South San
Francisco, Daly City, Colma, Brisbane, San Bruno, Broadmoor and the parts of Pacifica/Millbrae
inside that cutoff. County water polygons remove offshore city territory before matching.
See [Peninsula coverage and sources](docs/PENINSULA_COVERAGE.md) for source detail and gaps.

Result cards show **X areas found**. **Sort by** offers Best match, Rent: low to high and Rent:
high to low. Rent is a ZIP-level asking estimate, not a listing price; unavailable rents stay
last in both directions. Sorting never relaxes commute or Must-have constraints, and Best match
restores the priority ranking. The selected sort persists across detail navigation and reloads.

## Data credits

DataSF (PDDL) · SFMTA, BART, Caltrain GTFS · USGS 3DEP · US Census Bureau ACS · OEHHA
CalEnviroScreen 5.0 · © OpenStreetMap contributors (ODbL) · Zillow Observed Rent Index · Wikimedia
Commons photographers (credited per photo) · base map © Stadia Maps / OpenMapTiles. Muni data: *Reproduced with permission granted by the City and County
of San Francisco* (full notice in the app's "About the data").
