# Architecture

```
 open data sources ──► scripts/download_datasets.py ──► data/sf/raw/          (gitignored, ~90 MB)
                                                              │
                        scripts/process_datasets.py  ◄────────┘
                        scripts/build_commute_fixtures.py
                        scripts/build_content.py  ◄── data/sf/content/neighbourhoods.yaml
                                   │
                                   ▼
                        data/sf/processed/  + data/sf/manifest.yaml           (committed, ~3.7 MB)
                                   │  scripts/sync_public_data.mjs (predev / prebuild)
                                   ▼
                        public/data/  ──► Vite static build ──► browser (React + Leaflet)
                                                                   │
                                     CommuteProvider ──► fixtures (offline) │ proxy → routing API (later)
```

No database and no permanent backend. Everything static is precomputed; the only per-user
runtime computation is client-side (commute coverage, ranking). A small proxy is needed only
when live routing is added, to keep keys server-side.

## Data pipeline (`scripts/`)

| Script | Does |
|---|---|
| `_common.py` | Paths, study box, metric CRS (EPSG:26943), manifest writer, `.env` reader |
| `download_datasets.py` | Source registry with verified endpoints; idempotent; validates each download (min counts, zip/TIFF checks) before replacing; parallel except Overpass; records url/date/sha256 in `raw/_downloads.json`; records blocked sources in the manifest |
| `process_datasets.py` | One `step_*` per dataset; each writes its own processed files and manifest entry; a failure in one step never stops the others; final merge writes `neighbourhood_metrics.json` |
| `build_commute_fixtures.py` | Commute polygons for the default workplaces (see below) |
| `build_content.py` | Editorial YAML + one freely-licensed Wikimedia Commons photo per neighbourhood (cached) |
| `validate_datasets.py` | Structural + semantic checks; also run by `pytest` |
| `rebuild_all.py` | Orchestrates the above in order; `--offline`, `--refresh`, `--from`, `--dataset` |

### The hybrid model

* **Fine layers for the map**: bike segments (with terrain grade), park polygons, stops and route
  shapes, census tracts (ACS population and rent paid, CalEnviroScreen pollution indicators), cafe /
  restaurant / bar points (zoom >= 15), H3 res-8 crime/collision cells (≈0.74 km² — deliberately coarse so anonymised SFPD
  points are never shown as addresses), H3 res-9 hill cells (≈0.1 km²).
* **Neighbourhood summaries for cards and ranking**: `neighbourhood_metrics.json` — one object per
  neighbourhood, one block per dataset, explicit `null` when not measured.

Access metrics ("share of the area within 400 m of a park") are computed over **H3 res-9 sample
points** inside each neighbourhood (1,117 points across 41 areas, `neighbourhood_samples.json`),
using straight-line distance. The same points are used in the browser for commute coverage.

## Commute model

`CommuteProvider.getArea(workplace)` returns *the area from which that workplace can be reached
within N minutes*. Two implementations:

* **Fixture** (default, offline): `commute_fixtures.geojson`, one polygon per
  workplace × mode × {15, 30, 45, 60} min, only for the two default workplaces (±50 m).
  * *Transit* — **approximate GTFS schedule model**: BART + Muni + Caltrain weekday AM peak
    (07:00–10:00); route-stop graph with median in-vehicle times, boarding wait = half headway
    (cap 10 min), walking transfers ≤ 400 m (+1 min), walk access/egress ≤ 1 km at 4.8 km/h ×1.25
    detour; solved by Dijkstra **backwards from the workplace** (home → work). SFO terminals are
    linked to SFO BART by an assumed 10-min AirTrain hop. Spot checks: 24th St Mission → SFO 39 min,
    Outer Sunset → FiDi 53 min, Millbrae → SFO 24 min.
  * *Walk / cycle / drive* — **synthetic** straight-line speed models, labelled "Synthetic" in the UI.
* **Proxy** (`VITE_COMMUTE_PROVIDER=proxy`, `VITE_ROUTING_PROXY_URL=/api`): POSTs
  `{lat, lon, mode, minutes, direction: "to_workplace", arrive_by}` to `server/routing-proxy.mjs`
  (`npm run proxy`, port 8787; Vite proxies `/api` to it). The proxy calls TravelTime
  `/v4/time-map` with `arrival_searches` and GeoJSON output, caches results on disk
  (`data/cache/isochrones.json`), dedupes in-flight requests, caps live calls per day and returns
  `503` when keys are missing. The client falls back to fixtures; if neither works for a custom
  workplace, results are blocked and both reasons are shown.

```
browser --/api/isochrone--> Vite dev proxy --> routing-proxy.mjs --> TravelTime (keys server-side)
   ^                                                 | cache hit / 503 / 4xx
   +-------------- fixture fallback <----------------+
```

Timetable coverage: every GTFS feed is checked against `TARGET_SERVICE_DATE` (2026-10-22). The
fixture model uses that day where the feed covers it; otherwise a weekday in the feed's own period,
and the feature label says "out-of-date timetable: <agency>".

Eligibility (`eligibility.ts`): a sample point counts only if it is inside **every** workplace's
area; a neighbourhood is eligible when ≥ 50 % of its points pass for each workplace.

## Frontend (`src/`)

```
App.tsx                       state: workplaces (sessionStorage), prefs/layers/shortlist (localStorage)
features/commute/             provider.ts (adapter), eligibility.ts, CommutePanel.tsx
features/filters/             preferences.ts (definitions), ranking.ts (+ test), PreferencePanel.tsx
features/neighbourhoods/      ResultsList.tsx, NeighbourhoodDetail.tsx, reasons.ts
map/MapView.tsx               Leaflet map; panes; neighbourhood styling; workplace pins; commute outlines
map/layers/contextLayers.ts   9 independent, lazily-loaded overlays (crime, hills, cycling, transit, parks,
                              supermarkets, crashes, air pollution, food & drink); each built exactly once
components/NeighbourhoodPhoto local image -> Commons thumbnail -> placeholder (never a broken image)
map/controls/LayerPanel.tsx   toggles + legends
components/DataNotice.tsx     sources + required SFMTA notice
lib/                          data loader (cached fetch), storage (guarded), formatting
```

### Ranking (`ranking.ts`)

1. Exclusion reasons are collected independently: non-residential (parkland), commute coverage per
   workplace, each failed Must. Order of interaction never matters; all reasons are shown.
2. Score = weighted mean (Nice 1, Important 3, Must 3) of each active preference's **rank among the
   41 neighbourhoods** (0 worst … 1 best, ties mid-ranked). Missing values are skipped and the card
   says "N of M preferences could be assessed".
3. `previewMustHave` re-evaluates with one extra Must and reports how many currently-eligible
   areas it would remove and how many can't be checked.

### Base map

Stadia Maps *Alidade Smooth* (keyless on localhost; production needs a free Stadia account with
domain authentication). Override with `VITE_BASEMAP_URL`. CARTO basemaps now return "API key
required" tiles and the public OSM tile server is not for production traffic.
