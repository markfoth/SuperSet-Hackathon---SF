# Common Ground verification

Verified on 13 November 2026 Pacific. Candidate: `consolidation/common-ground-regional`, descended from the latest desktop refinement `ecfd5ae`, including all earlier household/regional work. Production `main` remains at `e2b6fcc`. Main promotion is held for review because pushing it automatically deploys to Vercel.

## Implemented behaviour

Explicit left pan, pointer wheel zoom, anchored right zoom and anchored middle orbit/tilt; bearing-aware compass; dismissible controls hint and keyboard alternatives; corner Terrain/Satellite selector; one three-column map with independent panel collapse; counted saved-place comparison; real custom inbound routing; expanded regional housing analysis; worker evaluation and viewport geometry; geographic incident columns; default real buildings and continuous normal-scale terrain; purposeful WebGL recovery replacing Leaflet.

All 89 area groups and 11,782 H3-9 candidates participate in analytical evaluation. The original 2,408 candidates and stable area IDs are preserved. Richmond municipality is excluded, while SF Inner/Outer Richmond remain. Display has 11,415 park-cut cells in 17 partitions; display loading never gates matching.

## Completed checks

| Check | Result |
|---|---|
| Vitest | 74 passed |
| Proxy/serverless routing | 12 passed |
| Full Python contracts | 63 passed; two inherited Rasterio/Affine deprecation warnings |
| Dataset validator | Nine groups, zero errors |
| Full desktop browser suite | 52 passed in installed Chrome |
| Final affected crime/imagery browser checks | Six passed again after visual height-scale refinement |
| Final regional data checks | Three passed after scale metadata refresh |
| TypeScript and production build | Passed; existing large MapLibre chunk warning remains |
| Whitespace/security checks | Passed; no private env tracked or credential values in source/build |

The full desktop run covers saved scenarios/homes/imports, comparison, local-data recovery, missing evidence, stale requests, optional-layer failures, actual style reloads, keyboard navigation, failed WebGL startup and actual context loss. A separate Chrome/Edge audit verifies the real mouse gestures, cancellation, window blur, outside release, compass, style-state preservation and all three requested desktop sizes. Maximum measured anchor error was 0.202 pixels over flat and pitched terrain views. The final hint clears the result legend by 25 pixels.

Crime tests preserve 47,808 unique incidents at each H3 level, shared filters and published approximate detail. All levels now use the same fixed 0.05 display metres per incident: 100 incidents = 5 display metres. The largest H3-8 graphic is 259.1 display metres. Larger cells sum more locations; these are counts over different areas, not comparable municipal rates or buildings. No viewport-dependent scaling is used.

[Machine-readable checks](verification/check-results.json), [Chrome audit](verification/desktop-chrome.json), [Edge audit](verification/desktop-msedge.json), [credential scan](verification/security-checks.json), [building source probe](verification/building-source-probe.json).

## Review artefacts

| Desktop | Opening | Results |
|---|---|---|
| 1280x800 | [Chrome](verification/1280-opening-chrome.png) | [Chrome](verification/1280-results-chrome.png) |
| 1440x900 | [Chrome](verification/1440-opening-chrome.png) | [Chrome](verification/1440-results-chrome.png) |
| 1920x1080 | [Chrome](verification/1920-opening-chrome.png) | [Chrome](verification/1920-results-chrome.png) |

[Short navigation demonstration](verification/navigation-chrome.webm), [satellite](verification/satellite-chrome.png), [wide crime columns](verification/crime-level-6.png), [district columns](verification/crime-level-7.png), [local columns](verification/crime-level-8.png), [WebGL recovery](verification/webgl-unavailable.png). Matching Edge screenshots and original desktop screenshots are retained alongside these artefacts. The navigation recording is 16.6 seconds long.

## Live routing

Browser -> local `/api` -> TravelTime -> valid inbound MultiPolygon -> confirmed matching passed with a custom Berkeley destination that has no fixture. The request used public transport, 45 minutes and arrival at 08:45 Pacific on Monday 16 November 2026. Both server credential-presence booleans were true, dry run false and persistent cache permission false. No values, headers or provider response bodies were recorded.

Adding custom San Mateo at 45 minutes correctly produced no joint match. Explicitly increasing both limits to 120 minutes produced 3,617 joint matching cells in 76 groups. Counts and ordered result IDs stayed identical after visiting Santa Clara and Berkeley at street zoom. This verifies complete-region matching independently of loaded display tiles. [Safe routing evidence](verification/live-routing.json), [joint results](verification/live-regional-joint.png).

Authenticated Vercel metadata confirmed the existing server credentials and proxy configuration in preview and production, with no missing variable names. The deployed preview also passed the same complete browser-to-Vercel-to-TravelTime evaluation, with identical joint results. Hosted health now uses the same credential-free configuration as the local proxy and reports ready status, both presence flags, supported modes, direction, timezone and cap scope. See the hosted release record below. The existing provider licence remains separate from successful evaluation access; commercial production rights are not established. No plan, payment method or billing resource was added.

## Performance and asset measurements

Fresh production builds from the preserved original desktop commit and this candidate. Installed headless Chrome, 1440x900, reduced motion, unthrottled network/CPU, HTTP cache disabled. Same zoom-15, pitch-50 SF camera, left-drag path, terrain/buildings and incident/POI combination. Values are single-run observations, not cross-device guarantees. Initial conditions differ intentionally: terrain/buildings are enabled by default in the candidate. Both runs use the offline SF/SFO example; the original build selects fixture routing, while the candidate uses its proxy configuration with the explicitly marked offline example. The original incident presentation differs from the new columns. Five original full style reloads are compared with five actual Terrain/Satellite switches; their stress workloads differ.

| Metric | Original desktop | Candidate |
|---|---:|---:|
| Main JS, raw / gzip | 1550.0 KB / 439.1 KB | 1504.2 KB / 423.0 KB |
| CSS, raw | 128.5 KB | 130.0 KB |
| Lazy analysis worker, raw | None | 258.6 KB |
| Optional Leaflet JS/CSS | 174.8 KB | Removed |
| Deployed data | 20.94 MB | 26.68 MB |
| Analytical candidate cells | 2,408 | 11,782 |
| Initial completed transfer | 0.85 MB | 2.39 MB |
| Visible controls | 304 ms | 308 ms |
| Initial ready observation | 1032 ms | 1550 ms |
| First search, completed transfer | 3.60 MB | 1.42 MB |
| First confirmed results | 205 ms | 638 ms |
| Optional incident + POI transfer | 371.5 KB, 4 requests | 384.6 KB, 8 requests |
| Terrain/buildings pan, mean / p95 frame | 16.7 / 16.8 ms | 16.4 / 17.0 ms |
| Combined layers pan, mean / p95 / maximum frame | 16.6 / 16.8 / 16.9 ms | 17.0 / 17.0 / 33.3 ms |
| Post-GC page JS heap, five stress cycles | 33.0-36.7 MB | 65.0-66.5 MB |

The main bundle and first-search transfer decrease. Startup transfer rises with default terrain, and regional analysis has higher latency/retained memory for 4.9 times as many candidates. The committed canonical processed outputs total 57.70 MB; runtime sync deploys 26.68 MB by excluding duplicate full geometries and pipeline-only inputs. Original clipped terrain copies are retired. Main-page heap excludes workers and GPU memory; five samples cannot prove absence of every leak. Source/layer counts remained constant across all five candidate cycles (11 sources, 81 layers, two crime sources); no page errors occurred.

[Asset byte counts](verification/asset-sizes.json), [before measurements](verification/baseline-combined/measurements.json), [after measurements](verification/performance/measurements.json). Gzip values in the asset report use the same Node compression settings for both builds. Reproduce with `scripts/report_assets.mjs` and `scripts/measure_desktop.mjs`; measure baseline/final serially without other browser load. Prepare the baseline by archiving ecfd5ae into ignored data/cache/baseline-checkout, running npm ci and a fixture-configured build there, then serving it at port 4181. Use CG_BASELINE=1 and CG_BASE_URL=http://localhost:4181/ for that measurement. For the candidate, unset CG_BASELINE, use the proxy-configured build and CG_BASE_URL=http://localhost:4179/. The initial inherited working-copy data total differs from a fresh baseline because the old Windows sync left stale/generated files.

## Coverage and remaining limits

[Coverage matrix and source/licence/refresh guide](DATA_SOURCES.md), [per-area measured-cell CSV](verification/coverage-matrix.csv). New regional sources include public Census boundaries/water, CPAD public parks, BART/Caltrain/SamTrans/VTA context, whole-tract pollution and ZIP rent. Context/service dates remain distinct from live routing.

Bounded regional OSM amenities/cycling requests failed; AC Transit's feed download failed. Those measurements remain unknown. Added-region measured street gradients and non-SF incidents/crashes are unknown. Must-have evidence gaps block confirmation. The original overview Muni/fixture timetable is dated and labelled. Census urban land/water is generalised, not parcel/residential verification, and may miss unmapped water. CES portal rights remain unresolved. Public map services are best-effort; aerial acquisition years are 2017-2021 and resolution is overzoomed above z16. Usable source building heights begin at z14; no lower-zoom buildings are invented.

## Cleanup and consolidation

Removed duplicate Leaflet rendering/context helpers and dependencies, obsolete mode state/CSS/buttons, clipped rendering DEM assets/builder, superseded capture/audit scripts, historical screenshots and repeated progress narratives. Current preprocessing, raw-source metadata/licences, stable IDs, migrations and regression tests remain. Source docs are README, CLAUDE and the architecture/data/deployment/decision/verification guides; the two analytical method references remain purposeful. [Retired path record](verification/retired-paths.json).

All earlier named branch tips were ancestors of the latest desktop base. After the candidate was durably pushed, four local feature/hack branches and three corresponding remote branches were removed with ancestry checks. Only production main and the single consolidation review branch remain. No unique work was discarded, no force-push/reset was used, and main was not promoted. [Original local tips](verification/branch-tips-before.txt), [original remote tips](verification/remote-tips-before.txt), [cleanup evidence](verification/branch-cleanup.json).

## Review and deployment boundary

[Draft PR #5](https://github.com/markfoth/SuperSet-Hackathon---SF/pull/5) contains the consolidated history. [Verified preview](https://common-ground-3052t1fbr-marks-projects-ebc07d95.vercel.app/) runs application commit ae0a636. The final follow-up records review evidence only. [Hosted verification](verification/hosted-verification.json) records successful custom browser routing and safe health, while [Linux data CI](https://github.com/markfoth/SuperSet-Hackathon---SF/actions/runs/43521500837) passes Python contracts and dataset validation. The initial CI omission of npm dependencies for the H3 helper was corrected with a pinned Node setup and dependency install.

Production was independently rechecked: main remains e2b6fcc at deployment dpl_BdGaTe13D3yBj7CiMHJoN2NkhXiD. Approving a fast-forward/push of main will start the production deployment. That is the remaining approval boundary from the task brief; no production change was made during this iteration.
