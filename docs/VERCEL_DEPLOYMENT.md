# Vercel deployment

Project: `common-ground-sf` in Mark's projects. Source: this repository's `main` branch.

Build with `npm run build` (includes the static data sync), output `dist`, install `npm ci`,
Vite preset, repository root, Node 24. `vercel.json` records these settings and gives the
Node function 30 seconds in `sfo1`.

`api/isochrone.js` exposes the existing `/api/isochrone` request shape as a Vercel Web handler.
It shares inbound validation, arrival-time logic and provider requests with the local proxy
through `server/routing-core.mjs`. It never reads `.env` or writes the deployed filesystem.
The Vercel runtime cache keeps results for 24 hours using hashed query keys and a project
namespace. Cache failures do not discard successful provider responses. The local proxy
retains its private on-disk cache. Per-instance daily caps supplement TravelTime account
limits; they are not a global distributed rate limiter.

Production/Preview configuration:

| Variable | Purpose |
|---|---|
| `VITE_COMMUTE_PROVIDER=proxy` | Live routing, with clearly labelled demo fixture fallback |
| `VITE_ROUTING_PROXY_URL=/api` | Same-origin function |
| `TRAVELTIME_APP_ID` | Private server credential; configure as a secret |
| `TRAVELTIME_API_KEY` | Private server credential; configure as a secret |
| `ROUTING_DRY_RUN=0` | Execute actual provider requests |
| `VITE_BASEMAP_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Public interactive OSM map for the demo |
| `VITE_BASEMAP_ATTRIBUTION` | Visible linked OpenStreetMap contributor credit |

Only the TravelTime credentials require secret storage; never prefix them with `VITE_`.
Do not upload private `.env` files or cached workplace queries with source deployments.
`API_511_KEY` is a data-rebuild input, not needed at runtime. Existing data, photos,
topography and nightlife assets are already committed and bundled.

The deployed demo uses the standard OSM background until a Stadia domain is authorised.
Browser requests honour normal HTTP caching and retain visible attribution/referrers;
there is no tile proxy or bulk/offline map downloader. See the
[OSM tile policy](https://operations.osmfoundation.org/policies/tiles/) and
[Stadia domain authentication](https://docs.stadiamaps.com/authentication/#domain-based-authentication).

Test before deploying: `npm run test:proxy`, `npm test`, `npm run build`.
Verify the public homepage, static assets, tile responses, a new workplace's inbound
isochrone, and browser selection/results after deployment. API responses are `no-store`;
provider details and credentials must never appear in errors or client bundles.
