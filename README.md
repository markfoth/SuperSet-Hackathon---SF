# Common Ground

A desktop workspace for finding a home together across San Francisco, the Peninsula through Santa Clara, and the East Bay through Berkeley. Every confirmed location must satisfy every required home-to-work commute and measured Must-have. Unknown evidence stays unknown.

## Run

Node 24 is required. Preserve existing private environment files.

```powershell
npm.cmd ci
npm.cmd run dev -- --host localhost --port 5196 --strictPort
```

Open <http://localhost:5196>. **Try the SF + SFO example** explicitly uses labelled historical offline estimates. Its transit fixture includes an expired Muni timetable. It is not a current journey planner.

For live evaluation, the existing private configuration uses `VITE_COMMUTE_PROVIDER=proxy`, `VITE_ROUTING_PROXY_URL=/api`, server-only `TRAVELTIME_APP_ID` and `TRAVELTIME_API_KEY`, and `ROUTING_DRY_RUN=0`. Start the proxy in another terminal:

```powershell
npm.cmd run proxy
```

Vite forwards `/api` to `ROUTING_PROXY_PORT` from the existing configuration, default 8787. `/api/health` exposes configuration booleans and actionable status without credentials. Do not prefix private credentials with `VITE_`. Live failures block matching; the offline example is a deliberate separate choice. TravelTime Basic is for research, development and evaluation; successful access does not grant commercial production rights. Persistent caching stays disabled unless storage rights are verified.

## Desktop map

- Left drag pans; the wheel zooms towards the pointer.
- Right drag up zooms in around the original geographical and screen anchor, preserving pitch and bearing.
- Middle drag up increases pitch; horizontal movement changes bearing around the original anchor. Pitch is clamped to 0-60 degrees. Autoscroll is suppressed inside the map.
- The compass reflects bearing and resets north. Arrows pan, + and - zoom, Shift + arrows tilt/rotate, and N resets north. The mouse hint is dismissible.
- The corner thumbnail selects Terrain or Satellite. Terrain includes continuous terrain at normal scale and available buildings by default. Satellite uses real attributed USGS/USDA aerial imagery; the service lists CONUS acquisition years 2017-2021, varying locally. It is not current imagery.
- Both side panels collapse independently. There is one map journey. Save places, then use **Compare saved places** to compare neighbourhoods, exact bookmarks and prospective homes.

Buildings need actual source tiles, not just a lower style zoom. OpenFreeMap provides usable height data from source zoom 14. They appear overhead and remain available when tilting. Data gaps and approximate inferred heights remain. No fabricated lower-zoom buildings are added.

If WebGL fails, a clear recovery state keeps coordinate search, matching, home checks and comparison available. Map layers, mouse pin placement and 3D navigation require WebGL. The duplicate Leaflet renderer has been removed after testing this experience.

## Verify

```powershell
npm.cmd test
npm.cmd run test:proxy
npm.cmd run build
npm.cmd run test:browser -- --project=desktop
.venv/Scripts/python.exe -X utf8 scripts/validate_datasets.py
.venv/Scripts/python.exe -X utf8 -m pytest
node scripts/verify_desktop.mjs
```

Browser tests use installed Chrome, one worker and fixture routing on isolated port 5187. `verify_desktop.mjs` uses the running application at port 5196, or `CG_BASE_URL`. Live verification is an explicit bounded evaluation: `node scripts/verify_live_routing.mjs`. Static `npm.cmd run preview` serves the build but does not execute Vercel API functions.

## Data and limitations

The housing boundary is an explicit polygon: named Census city/community urban areas, official area-water subtraction and the original detailed SF/northern Peninsula geography. Richmond is excluded. Basemap navigation and permitted commute destinations have wider coverage. The complete H3-9 candidate index drives region-wide matching independently of viewport tiles. Detailed cell and optional context geometry loads by viewport; expensive evaluation runs in a Web Worker.

Non-SF incidents and injury crashes remain unknown. Regional street gradients, frequent-service measurements and failed OSM extracts are not invented. ZIP-level rents and tract pollution retain their original resolution. Distances are straight-line mapped access, not walking routes. City/community groups are not neighbourhood subdivisions or verified residential parcels.

Canonical processed data is committed under `data/sf/processed/`. `predev` and `prebuild` copy only runtime assets to ignored `public/data/`; heavy preprocessing never runs during builds or requests. Source dates, licences, refresh commands and coverage are in the manifest and data guide.

- [Architecture and state](docs/ARCHITECTURE.md)
- [Data sources, regional coverage matrix and limitations](docs/DATA_SOURCES.md)
- [Deployment and promotion boundary](docs/DEPLOYMENT.md)
- [Verification, screenshots, navigation demonstration and measurements](docs/VERIFICATION.md)
- [Decision log](docs/DECISIONS.md)
- [Ranking method](docs/RANKING_METHOD.md) and [street-gradient method](docs/STREET_GRADIENT_METHOD.md)

`main` is the intended canonical branch. Production promotion is held until the verified consolidation is reviewed because a push to `main` deploys to Vercel. See the deployment guide for recorded branch tips and the promotion procedure.
