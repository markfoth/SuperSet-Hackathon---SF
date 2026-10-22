# Hackathon plan — 22 October 2026

## Ready (prepared 21 Oct)

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

## Tomorrow, in priority order

1. **Arbitrary workplaces** (needs TravelTime keys): add a workplace search box (geocoder), confirm
   live isochrones for transit/walk/cycle/drive, keep fixtures as the offline fallback.
2. **Demo script and rehearsal** on the default SFO + FiDi scenario: commute overlap → set "Parks:
   Must" (exclusion preview) → turn on crime + transit + air layers → open Mission / Noe Valley.
3. **Ranking explanations**: "why this rank" breakdown on cards; one-click "relax this must-have"
   on excluded areas.
4. **Comparison view** for 2–3 shortlisted neighbourhoods.
5. **Polish**: review editorial descriptions; check mobile layout; deploy the static build (needs
   Stadia domain auth for tiles).

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
