# Common Ground — working instructions

Common Ground helps people decide **which San Francisco neighbourhood to live in** from their
commute(s) and priorities. It is an area-discovery tool, **not** a listings site: it ends by linking
out to rental platforms.

## Non-negotiable product rules

- **Commute is the primary hard gate.** A neighbourhood is eligible only if ≥ 50% of its sample
  points are inside *every* workplace's commute area (`ELIGIBLE_SHARE`). Commutes are **home → work**
  (inbound; arrive-by for transit).
- **A requested commute that can't be computed blocks results** with a visible, recoverable error.
  Never fall back to silently ungated results.
- **Preferences are order-independent.** Off / Nice / Important change ranking only; **Must** can
  exclude. Every failed constraint is listed. Before a Must is applied the UI says how many
  currently eligible areas it would remove (`previewMustHave`).
- **Missing data is never a pass or a fail.** `null` stays `null` end to end. A Must that can't be
  checked keeps the area and flags it; a soft preference with no data is left out of that score.
- **No universal liveability score.** Ranking is a transparent weighted mean of per-preference ranks.
- **Resolution honesty.** Crime is *reported incidents* (never "safe/unsafe"), shown on H3 res-8
  cells, not points. Rents are **ZIP-level asking rents** and must be labelled as such.
  Synthetic commute contours are labelled **Synthetic** in the UI.
- **Licences travel with data.** SFMTA's notice (in `DataNotice.tsx`) and OSM/Zillow/USGS/photo
  credits must stay visible.
- **Secrets never reach the browser or git.** Only `VITE_*` vars reach the client; routing keys
  belong to a server-side proxy. Real keys only in gitignored `.env`.
- **Timetables cover the demo day or say so** (`TARGET_SERVICE_DATE`, default 2026-10-22). An
  expired feed is labelled *out-of-date* in manifest, fixtures and UI; never presented as current.
- **CalEnviroScreen: pollution indicators only.** Never use the composite CES score or combine
  pollution with population vulnerability into a score.
- **POIs (cafes, restaurants, bars) are discovery context**, never ranking inputs; drawn at zoom >= 15.
- Routing: TravelTime **free Basic plan only** (approved for the hackathon; no paid plan) via
  `server/routing-proxy.mjs`. Keys never reach the browser. Offline fixtures must keep working.

## Architecture (see docs/ARCHITECTURE.md)

- Frontend: React 19 + TypeScript + Vite + Leaflet (imperative, no react-leaflet) + two Turf modules.
- No backend. Static files in `public/data/` are **copied** from `data/sf/processed/` by
  `scripts/sync_public_data.mjs` (runs on `predev`/`prebuild`). Edit/commit `data/sf/processed/` only.
- Data pipeline: Python (GeoPandas, Shapely, H3, rasterio) in `scripts/`.
- Commute areas go through the `CommuteProvider` adapter (`src/features/commute/provider.ts`):
  fixtures offline, proxy when configured.
- Ranking logic is pure and tested: `src/features/filters/ranking.ts`.

## Data rules

- Every dataset has an entry in `data/sf/manifest.yaml` (written by its builder via
  `update_manifest`). Never use a file without one. Blocked sources are recorded as `status: blocked`.
- Raw downloads live in `data/sf/raw/` (gitignored, ~90 MB). Processed outputs are committed.
- Neighbourhood `id` = slug of the DataSF name; ids are pinned in `tests/test_data.py`.
- Read every file with `encoding="utf-8"` (Windows defaults to cp1252). Run Python with `-X utf8`.

## Commands (Windows, from repo root; Git Bash or PowerShell)

```
npm install                                         # frontend deps
npm run dev                                         # http://localhost:5173
npm test                                            # vitest (ranking logic)
npm run build                                       # typecheck + production build
npm run proxy                                       # live routing on :8787 (needs TravelTime keys in .env)
.venv/Scripts/python.exe -m pip install -r requirements.txt
.venv/Scripts/python.exe scripts/rebuild_all.py     # download missing → process → fixtures → content → validate
.venv/Scripts/python.exe scripts/rebuild_all.py --offline --dataset crime   # one dataset from raw
.venv/Scripts/python.exe scripts/validate_datasets.py
.venv/Scripts/python.exe -m pytest                  # data contract tests
```

After any data change: rebuild → validate → `pytest` → `npm test`.

## Where things are

- `scripts/download_datasets.py` — sources registry (verified endpoints), idempotent downloads.
- `scripts/process_datasets.py` — one `step_*` per dataset + `neighbourhood_metrics.json` merge.
- `scripts/build_commute_fixtures.py` — GTFS schedule model + synthetic speed models.
- `scripts/build_content.py` + `data/sf/content/neighbourhoods.yaml` — editorial text + Commons photos
  (optimised copies committed in `public/images/neighbourhoods/`).
- `server/routing-proxy.mjs` — TravelTime proxy (inbound, arrive-by), cache in `data/cache/`.
- `docs/DECISIONS.md` — why things are the way they are (routing comparison included).
- `docs/HACKATHON_PLAN.md` — what's done / blocked / next.
