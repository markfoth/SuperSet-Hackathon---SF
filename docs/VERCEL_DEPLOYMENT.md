# Review and deployment checklist

No production deployment or infrastructure change is part of this upgrade.

## Verified source state

On 12 November 2026, Vercel project `common-ground-sf` reported ready production
deployment `dpl_BdGaTe13D3yBj7CiMHJoN2NkhXiD`, serving
<https://common-ground-sf.vercel.app/> from `markfoth/SuperSet-Hackathon---SF`,
branch `main`, commit `e2b6fccec2c430cd7c811768b83b8401c5d6f2ee`.
An authenticated `git ls-remote` check returned the same current main commit.
The isolated upgrade branch is `feature/common-ground-household-upgrade`.

## Vercel review

1. Review the draft PR, source terms, screenshots and verification report. Keep main and production unchanged until explicitly authorised.
2. Use Node 24, repository root, `npm ci`, `npm run build` and output `dist`. Build copies committed data and does not download or preprocess geospatial sources.
3. Keep `VITE_COMMUTE_PROVIDER=fixture` for an account-free offline review. MapLibre/OpenFreeMap needs no key or domain authentication. `VITE_BASEMAP_URL` and attribution only override the lazy raster fallback.
4. For a separately permitted live evaluation, use `VITE_COMMUTE_PROVIDER=proxy` and `VITE_ROUTING_PROXY_URL=/api`. Set private server-only TravelTime credentials and `ROUTING_DRY_RUN=0`. Never prefix credentials with `VITE_`.
5. Leave `ROUTING_CACHE_ALLOWED` blank until the provider account's caching rights are verified. An enabled cache expires after 24 hours. Arrival date/time and all routing inputs participate in identity; hosted keys are hashed.
6. Confirm the provider account's use rights. Basic is research/development/evaluation only, not commercial production. Do not introduce a paid plan to satisfy this checklist.
7. `vercel.json` retains `sfo1` and gives both isochrone and explicit journey functions 30 seconds. `/api/health` returns no secrets. API responses use `no-store`; origin, method, body, geometry, date and coordinate validation remain in force.
8. Check preview static assets, actual worker loading, basemap attribution, tile recovery, three viewport sizes, sharing and reload persistence. A static `vite preview` does not execute hosted API functions.
9. Verify `/data/terrain/...png` serves PNG bytes with configured `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`; other data has a one-hour cache. Local Vite headers differ. Version or invalidate paths if a future terrain refresh needs immediate rollout.
10. Only after a separate production instruction, deploy the reviewed commit and verify the actual production alias, commit, APIs and tiles. Do not interpret a branch preview as a production release.

Small XYZ tile requests are used rather than a PMTiles archive. Whole-tile GETs
are the normal transport, so HTTP Range is not needed to use terrain. Same-origin
terrain requires no cross-origin credentials or special CORS service. The
verification report records local static-serving evidence; production headers
remain a post-deployment check.

## Railway, when useful

No new Railway service or store is necessary. The complete local/portable household
workflow and Vercel functions already serve this release. There is no live
collaboration endpoint and no public write access.

If an existing, authorised Railway environment is later chosen for the routing
proxy:

1. Run `node server/routing-proxy.mjs` with Node 24. The server accepts Railway's `PORT`, then `ROUTING_PROXY_PORT`, then 8787.
2. Keep credentials and provider caps in server variables. Set `ROUTING_ALLOW_ORIGIN` to the exact frontend origin. Review instance count because request caps are per process.
3. Keep the frontend on Vercel. Configure `VITE_ROUTING_PROXY_URL` to the authorised proxy base URL, or route through a same-origin reverse proxy. Never embed provider credentials in the frontend.
4. Use `/health` for a small readiness check. Check failures and exact journey estimates from the browser before publishing configuration changes.
5. Keep persistent caching disabled unless storage rights are confirmed. A local cache is bounded and expires after 24 hours; Railway ephemeral storage is not a collaboration database. A volume is optional and must not be created without authorisation.
6. Do not create projects, paid resources or a database for this release. A future live household store needs explicit access control, expiry and a separate reviewed design.

## Environment and artefact handling

- `.env.example` has blank credentials and is the only environment example to commit. Preserve existing `.env` files.
- Do not publish `.env`, `data/cache`, raw sources, browser traces containing private user work or local credentials.
- Commit canonical processed outputs and licence manifest; `public/data/` is generated and ignored.
- Include the terrain directory and worker asset in the build. Optional data must stay lazy; never replace it with a city-wide startup download.
- Run build/data sync before browser checks, then keep source data fixed during the checks.
