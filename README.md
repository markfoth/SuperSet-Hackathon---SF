# Common Ground

Find the San Francisco neighbourhoods that fit your commute(s) and priorities — before you start
looking at listings.

Add one or more workplaces, choose how you travel and your maximum commute, and the map shows
where the commutes overlap. Express what matters (parks, flatter streets, rail access, fewer
reported incidents…) as *nice to have*, *important* or *must have*, and Common Ground ranks the
local **H3 resolution 9 cells** (~0.105 km²), groups suitable cells into the 41 SF neighbourhoods,
explains exclusions and unknown measurements, and retains photos and ZIP-level rent trends.

Different parts of a neighbourhood can now match differently. Every candidate cell must satisfy
**all workplace commutes together** and every measured Must-have. Reorder priorities with the
up/down buttons; earlier measurement bands dominate later ones, with finer bands for Important
than Nice. No combined liveability score is used. Click a cell for local evidence, or save
neighbourhoods and click the saved count to compare them.

Map: **green** strong eligible matches, **yellow** partial soft-preference matches, **red/hatching**
known exclusions, **grey** insufficient information. A teal dashed outline shows the actual
intersection of workplace catchments. Matching checks a representative point per cell; it does
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

Optional key in `.env` (copy `.env.example`): `API_511_KEY` unlocks SamTrans (SFO buses) and a
current Muni timetable. Every GTFS feed is checked against the demo date (`CG_SERVICE_DATE`,
default 2026-10-22); a feed that doesn't cover it is labelled out-of-date, never shown as current.

## Live routing (optional)

The default demo (SFO + Financial District) runs offline from precomputed commute areas. For any
other workplace, use the TravelTime proxy (free Basic plan; keys stay server-side):

```bash
cp .env.example .env            # then fill TRAVELTIME_APP_ID and TRAVELTIME_API_KEY
npm run proxy                   # terminal 1 — http://localhost:8787/health
VITE_COMMUTE_PROVIDER=proxy VITE_ROUTING_PROXY_URL=/api npm run dev   # terminal 2
```

(PowerShell: `$env:VITE_COMMUTE_PROVIDER='proxy'; $env:VITE_ROUTING_PROXY_URL='/api'; npm run dev`,
or put both lines in `.env`.) Without keys the proxy answers 503 and the app falls back to offline
data; a custom workplace then shows a clear "can't calculate" message instead of ungated results.
`ROUTING_DRY_RUN=1 npm run proxy` returns the exact TravelTime request instead of calling it.

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

`area_cells.geojson` is the canonical ~1.25 MB matching input (1,226 cells); raw street/raster
files never load in the browser. Street-gradient lines load only when requested and render at
zoom 14+, keeping the city view legible. Browser tests use an isolated port 5187 and installed
Google Chrome; if absent, install Chrome or change the Playwright channel. Screenshots/traces
are generated in gitignored `test-results/`.

Limitations: offline transit catchments remain approximate and use an expired Muni timetable;
other offline modes are synthetic. DEM grades are not surveyed and can be biased by bridges,
tunnels and retaining walls. Straight-line access does not model entrances, crossings or
barriers. Residential evidence is incomplete: uncertain cells are flagged, and only near-total
park cells without supporting residential street evidence are excluded. Incident rates remain
H3-8, pollution remains tract-level, and asking rents remain ZIP-level.

## Data credits

DataSF (PDDL) · SFMTA, BART, Caltrain GTFS · USGS 3DEP · US Census Bureau ACS · OEHHA
CalEnviroScreen 5.0 · © OpenStreetMap contributors (ODbL) · Zillow Observed Rent Index · Wikimedia
Commons photographers (credited per photo) · base map © Stadia Maps / OpenMapTiles. Muni data: *Reproduced with permission granted by the City and County
of San Francisco* (full notice in the app's "About the data").
