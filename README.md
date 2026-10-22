# Common Ground

Find the San Francisco neighbourhoods that fit your commute(s) and priorities — before you start
looking at listings.

Add one or more workplaces, choose how you travel and your maximum commute, and the map shows
where the commutes overlap. Express what matters (parks, flatter streets, rail access, fewer
reported incidents…) as *nice to have*, *important* or *must have*, and Common Ground ranks the
41 SF neighbourhoods, explains every exclusion, and shows photos, practical indicators and
ZIP-level rent trends for each.

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
browser-ready outputs go to `data/sf/processed/` (committed, ~4.5 MB; photos in
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
.venv/Scripts/python.exe -m pytest             # data contracts (GeoJSON validity, ids, manifest, joins)
.venv/Scripts/python.exe scripts/validate_datasets.py
```

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — frontend, data pipeline, commute model, data flow
- [docs/DECISIONS.md](docs/DECISIONS.md) — key decisions, including the routing-provider comparison
- [docs/DATA_CATALOGUE.md](docs/DATA_CATALOGUE.md) — current and candidate datasets
- [docs/HACKATHON_PLAN.md](docs/HACKATHON_PLAN.md) — done / blocked / next
- [CLAUDE.md](CLAUDE.md) — rules for AI-assisted sessions

## Data credits

DataSF (PDDL) · SFMTA, BART, Caltrain GTFS · USGS 3DEP · US Census Bureau ACS · OEHHA
CalEnviroScreen 5.0 · © OpenStreetMap contributors (ODbL) · Zillow Observed Rent Index · Wikimedia
Commons photographers (credited per photo) · base map © Stadia Maps / OpenMapTiles. Muni data: *Reproduced with permission granted by the City and County
of San Francisco* (full notice in the app's "About the data").
