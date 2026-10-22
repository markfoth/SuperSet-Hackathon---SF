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

Live TravelTime was verified with a custom workplace after configuring private `.env`.
Offline fixtures remain explicitly approximate/synthetic.
See `VERIFICATION.md` for final commands and results, `DATA_ACCURACY_AUDIT.md` for limitations.

## Northern Peninsula extension — requested 22 October

- [x] 2,408 matching cells through SFO; original 41 SF ids retained plus 17 county jurisdiction groups
- [x] County boundaries/water masks, streets/gradients, existing bikeways, parks and full-area OSM amenities
- [x] Official keyless SamTrans GTFS, valid on the demo date, added to routes/stops/frequency and offline fixtures
- [x] Census, pollution and actual-ZIP rents populated locally; seven additional licensed city photos
- [x] Live South San Francisco workplace verified; missing local police/crash data disclosed and kept null
- [x] 37 Python, 26 frontend, 4 proxy and 10 desktop/mobile browser tests; all validators and production build

See [Peninsula coverage](PENINSULA_COVERAGE.md) for source availability and the southern cutoff.

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

## External configuration

| Blocker | Unlocks | How |
|---|---|---|
| `TRAVELTIME_APP_ID`, `TRAVELTIME_API_KEY` | Configured and verified locally; required on other checkouts for arbitrary workplaces | https://account.traveltime.com/signup → private `.env` → live routing setup in README |
| `API_511_KEY` | Optional current Muni / alternative 511 feeds; SamTrans already works keylessly | https://511.org/open-data/token → `.env` → download and rebuild transit |
| Zillow terms review | Public deployment with ZORI | Read https://www.zillow.com/research/data/ terms |

After adding `API_511_KEY`:

```bash
.venv/Scripts/python.exe scripts/download_datasets.py --only gtfs_muni_511 gtfs_samtrans
.venv/Scripts/python.exe scripts/rebuild_all.py --offline --dataset transit
```

## Remaining external inputs

1. TravelTime keys are configured and verified locally. No paid plan.
2. Optionally provide a 511 token to refresh Muni; stale feed remains labelled. SamTrans is included.
3. Before any future public hosting, review unresolved data licences and configure basemap domain auth.

The user subsequently requested the Peninsula extension above. Still deferred: noise, fog/sun,
trees, flood/seismic and schools. Peninsula local police/crash measurements need a compatible source.

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
