# Hackathon plan — 22 October 2026

## Fine-area implementation — 22 October

- [x] Clean `main` baseline inspected; feature branch `hack/fine-area-discovery`, sequential work
- [x] Baseline: 27 Python tests, 8 frontend tests, validators, production build
- [x] Canonical 1,226 H3-9 land cells, stable ids and one parent each; real local access indicators
- [x] Official street centrelines verified/downloaded; street-aligned 40 m DEM gradients replace terrain means
- [x] Coverage/null preservation; H3-8 reports, tract pollution and ZIP rents retain original precision
- [x] Same-cell AND commute gate; exact shared polygon overlay; disjoint-halves regression
- [x] User-approved priority-first bands, accessible ordering, explanations and exclusion previews
- [x] Green/yellow/red-hatched/grey cells, local detail, near misses, shortlist comparison
- [x] Desktop/mobile full-flow tests, context-layer checks and production build
- [x] Fixed mobile map picking removing Leaflet container classes and intercepting tabs
- [x] User selected **local demo/build only**; no push or public deployment

Live-provider validation remains pending credentials in local `.env`; offline fixtures are
explicitly approximate/synthetic. No live travel times have been claimed as verified.
See `VERIFICATION.md` for final commands and results, `DATA_ACCURACY_AUDIT.md` for limitations.

## Historical preparation (21 Oct)

- [x] Repo on GitHub (private), `main` pushed; clone → `npm install` → `npm run dev` verified
- [x] Data, all in `data/sf/manifest.yaml` and validated:
  - P0: 41 neighbourhoods, SFPD incidents (12 months), SFMTA bike network, parks (RPD + OSM),
    BART / Muni / Caltrain GTFS
  - P1: elevation/hills, supermarkets, injury crashes, Zillow ZORI, ACS 2020-24 population and rent
    paid (tract), CalEnviroScreen 5.0 pollution indicators (tract), cafés / restaurants / bars (OSM)
- [x] Timetables checked against 22 Oct: BART and Caltrain cover it; Muni is labelled out-of-date
- [x] 41/41 neighbourhood photos with credits, cached locally (no broken images in the demo)
- [x] Offline commute fixtures for SFO and FiDi; the default demo needs no routing API
- [x] TravelTime proxy (`npm run proxy`) built and tested without keys (503 → fixture fallback)
- [x] App: commute gate, preferences with must-have previews, 9 independent layers, detail panel
      (photo, indicators, per-resident crime, pollution percentiles, rents asking vs paid, food & drink)
- [x] Tests: 27 pytest data contracts, 8 vitest ranking tests, production build clean

## Blocked — each needs a free signup by you (5 minutes each)

| Blocker | Unlocks | How |
|---|---|---|
| `TRAVELTIME_APP_ID`, `TRAVELTIME_API_KEY` | Arbitrary workplace locations (live, arrive-by) | https://account.traveltime.com/signup → `.env` → `npm run proxy` + `VITE_COMMUTE_PROVIDER=proxy`, `VITE_ROUTING_PROXY_URL=/api` |
| `API_511_KEY` | Current Muni timetable + SamTrans (SFO buses) | https://511.org/open-data/token → `.env` → `rebuild_all.py --only`… see below |
| Zillow terms review | Public deployment with ZORI | Read https://www.zillow.com/research/data/ terms |

After adding `API_511_KEY`:

```bash
.venv/Scripts/python.exe scripts/download_datasets.py --only gtfs_muni_511 gtfs_samtrans
.venv/Scripts/python.exe scripts/rebuild_all.py --offline --dataset transit
```

## Remaining external inputs

1. Add TravelTime keys locally, run the proxy and verify a live inbound polygon. No paid plan.
2. Optionally provide a 511 token to refresh Muni and include SamTrans; stale feed remains labelled.
3. Before any future public hosting, review unresolved data licences and configure basemap domain auth.

Stop adding datasets (agreed). Deferred: noise, fog/sun, trees, flood/seismic, schools, Peninsula
neighbourhoods.

## Start-of-day commands

```bash
cd common-ground
git pull
npm install
npm run dev                                     # http://localhost:5173 (offline fixtures)
# with live routing, once keys are in .env (two terminals):
npm run proxy
VITE_COMMUTE_PROVIDER=proxy VITE_ROUTING_PROXY_URL=/api npm run dev
```
