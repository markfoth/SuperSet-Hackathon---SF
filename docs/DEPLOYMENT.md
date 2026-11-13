# Deployment and consolidation

## Current boundary

main is the intended canonical branch. The validated candidate is built on the latest desktop refinement history, not the older production implementation. A production push is held for final review because Vercel's Git integration deploys main.

Verified Vercel project: common-ground-sf, prj_QxzvTW1Jmy67t7DxULV3brat3Yei. The production alias is <https://common-ground-sf.vercel.app/>. The recorded production deployment is dpl_BdGaTe13D3yBj7CiMHJoN2NkhXiD from main at e2b6fccec2c430cd7c811768b83b8401c5d6f2ee. No production change is implied by a branch preview.

[Branch tips before consolidation](verification/branch-tips-before.txt) preserve local hashes. Remote heads were checked independently and matched their tracked tips. main was six commits behind feature/desktop-map-refinements. feature/common-ground-household-upgrade, feature/regional-decision-redesign and hack/fine-area-discovery were all ancestors of the chosen base. No unique work is discarded or force-pushed. The initial working tree was clean.

Only redundant branches whose tips are ancestors of a durably preserved candidate may be removed. Final branch/preview/commit status and the exact cleanup performed are recorded in VERIFICATION.md. Do not delete a branch with an unexplained unique commit.

## Vercel configuration

Node 24, repository root, npm ci, npm run build, output dist. vercel.json retains sfo1 and 30-second limits for isochrone and journey functions. Python preprocessing is not a build or request step. Processed data is committed; public/data is generated and ignored.

The authenticated project metadata confirmed these variables exist for both preview and production, with credential values left unread/unprinted:

| Variable | Verified role |
|---|---|
| TRAVELTIME_APP_ID | Sensitive server credential present |
| TRAVELTIME_API_KEY | Sensitive server credential present |
| VITE_COMMUTE_PROVIDER | Public build configuration: proxy |
| VITE_ROUTING_PROXY_URL | Public build configuration: /api |
| ROUTING_DRY_RUN | Server configuration: 0 |

No routing variable is missing in those hosted environments. Never prefix private values with VITE_. Preserve existing private local environment files. No key needs to be pasted into chat or committed. Keep ROUTING_CACHE_ALLOWED unset unless the account's storage rights are verified. Provider account quotas and licence restrictions still apply independently of the application's per-instance cap.

api/health.js returns configuration booleans, status, supported modes, direction, timezone and cap scope. api/isochrone.js and api/journeys.js share server/routing-core.mjs with the local proxy. Requests validate method, origin, body size, coordinates, modes and arrival time; errors never echo provider bodies or credential headers. Arrival searches represent home-to-work, next weekday in America/Los_Angeles, including the appropriate DST offset.

The old main deployment predates some current health/reporting improvements, so environment metadata is not a substitute for verifying the candidate's deployed API. A static vite preview cannot execute Vercel functions.

## Promotion after review

1. Review the exact candidate commit, passing checks, source limitations, screenshots and measurement report.
2. Verify the current remote main tip has not moved. Fast-forward main to the verified candidate without a reset or force-push.
3. A push to main starts the production deployment. Obtain the final promotion approval only after the concrete candidate is reviewable.
4. Verify the resulting production commit/alias, static worker and data assets, health booleans and one custom live evaluation route. A preview build is not evidence that production has changed.
5. Remove only remaining redundant, integrated branch references. Keep one development line named main, not master.

TravelTime free evaluation access is restricted to research/development/evaluation; the account's commercial rights are not established by these tests. This workflow does not upgrade a plan or assume commercial production rights from an HTTP 200 response. There is no new paid provider, card requirement, database or expiring trial.

## Portable Railway proxy

The existing Node proxy remains portable. If the user later selects an existing authorised Railway service, run node server/routing-proxy.mjs. It binds Railway's PORT before ROUTING_PROXY_PORT. Set the server-only credentials and exact ROUTING_ALLOW_ORIGIN; route the frontend through the correct proxy URL. Health is available at /health or /api/health. Caps are per running instance, not account-wide distributed enforcement.

No Railway service, volume, database or billing resource is needed for this iteration. No infrastructure was provisioned. The frontend can remain on Vercel with the existing serverless API.

## Assets and caching

Attribution follows vector, terrain and aerial sources. Optional context is lazy and viewport-partitioned. Full analytical source files and retired DEM/duplicate context copies are not deployed. /data assets retain explicit cache headers; changing source data requires the normal release/cache invalidation review. Do not publish private environment files, raw download caches, private browser traces or credentials. Curated screenshots use only the public example or public test destinations.
