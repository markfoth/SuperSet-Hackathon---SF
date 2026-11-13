# Regional decision revision verification

Review started 12 November 2026 Pacific and continued on 13 November. Branch: `feature/regional-decision-redesign`, based on `efbfad1`. Production remains the older main release; nothing was merged or deployed to production. Previous-upgrade evidence is preserved separately in [historical verification](VERIFICATION_PREVIOUS_UPGRADE.md).

## Local commands and outcomes

| Check | Actual outcome |
| --- | --- |
| `npm.cmd test` | 63 passed across 11 files. Includes source calendars, recurring-cost unknowns, conditional travel comparisons, ties, exclusions and missing measurements. |
| `npm.cmd run test:proxy` | 12 passed. Inbound direction, Pacific date/DST, stale identities, provider failures, limits, exact-pin journeys, serverless origin/body checks and credential-free health. |
| `npm.cmd run typecheck` | Passed. |
| `$env:VITE_COMMUTE_PROVIDER='fixture'; npm.cmd run build` | Passed, including sync of 96 assets, 19.7 MB. No downloads/preprocessing run in frontend build. Existing large-chunk warning remains. |
| `npm.cmd run test:browser -- --reporter=line` | 68 passed, desktop and mobile, real Chrome/MapLibre/WebGL. Affected flows were checked again after final comparison extraction and undo cleanup. |
| `.venv/Scripts/python.exe -X utf8 -m pytest tests/test_decision_context.py tests/test_terrain.py` | 5 passed locally. |
| `.venv/Scripts/python.exe -X utf8 scripts/validate_datasets.py` | All nine validator groups pass, zero errors. |
| Full local `python -m pytest` | Collection blocked by Windows Application Control on the installed H3 DLL, in three inherited modules. Not recorded as a pass. Complete Linux CI is required separately. |

The new source builders were executed against actual public inputs, including a successful bounded expanded OSM query, actual official GTFS ZIP and complete paginated FEMA inventory. Cached rebuilds preserve source dates. The GTFS builder streams stop times and groups departures in one pass, avoiding quadratic per-stop scans. [Source records and refresh commands](DECISION_CONTEXT_DATA.md).

## Journey and accessibility evidence

| Evidence | What was exercised |
| --- | --- |
| [Original live comparison](audit/original-live/comparison.json) | Four sizes; opening, immediate pin placement, demo results. Original live release returns 14 area cards. Read-only inspection, no production mutation. |
| [Starting revision](audit/baseline/journeys.json) | Four sizes; opening, 494-location example, results, three-option comparison, both limits15 and empty state. |
| [Final journeys](audit/final/journeys.json) | Same four sizes/states; no page errors or horizontal overflow. |
| [Accessibility/recovery](audit/accessibility/checks.json) | Delayed required geometry holds matching pending; failed initial data has keyboard retry; mobile/tablet sheet sizes and panel scrolling retain map centre. |
| [200% desktop reflow](audit/accessibility/desktop-200-percent-reflow.png) | 720x450 CSS pixels at device scale2, equivalent layout space to 1440x900 at200%. Primary action and search exercised with keyboard; no page overflow. This is not browser-toolbar zoom automation. |

Sizes:1440x900 desktop,1280x800 laptop,768x1024 portrait tablet,390x844 mobile. Final images use an isolated browser and fixture production build. Loading/error PNGs are in `audit/accessibility/`; final opening/results/compare/empty PNGs are in `audit/final/`. Baseline opening captures may precede full background-tile settlement; final opening captures wait for vector source loading.

Browser coverage includes two searched destinations, priorities, three saved areas, comparison, actual home creation, reload/persistence, confirmed-label versus query semantics, invalid/outside inputs, required-route delays/failures, mode/days/removal, priority edit-history invariance, scenario switching/import, privacy defaults, Must preview/apply/undo, partial source failures and retry, missing GTFS calendars, context-layer recovery, actual missing DEM tiles, real WebGL context loss, 2D fallback and touch map dragging. Table comparisons scroll internally on mobile. Keyboard return from details restores the card focus and list position.

The tests do not claim a physical-device study, complete address geocoding, complete park accessibility or live property inventory. Installed headless Chrome uses genuine renderer/tile requests; source-independent fixture matching assertions are separate from external-source smoke checks. Upstream road-shield null-filter warnings remain non-fatal and are not suppressed.

## Regional 3D

[Detailed diagnosis](3D_RENDERING_FIX.md), [baseline samples](audit/baseline-3d/diagnostics.json), [48-state terrain matrix](audit/repaired-production-3d/diagnostics.json), [12 combined views](audit/combined-production-3d/diagnostics.json) and [lifecycle checks](audit/terrain-lifecycle.json) record the actual source, cameras, tiles and errors.

The repaired terrain-only matrix has432 finite elevation samples, range -1 to341.37 m, with no failed DEM responses or console/page errors. Combined building/terrain captures cover the same12 locations. Camera states are z9/p0/b0,z12/p45/b90,z15/p60/b35,z17/p60/b-45. Five toggling cycles and an actual style reset preserve source intent and independent controls. The formerly reproduced -10,000 m edge is absent in these samples. This is sampled navigation evidence, not an accuracy guarantee for every pixel/building.

## Production performance

`scripts/measure_map.cjs` uses installed headless Chrome,1440x900, reduced motion, fresh context and disabled browser cache. It records controls readiness, settled vector opening, first matching search, optional buildings/terrain, animation-frame intervals during a scripted pan and five garbage-collected heap samples after repeated pans. `CG_BASE_URL`, `CG_PERF_OUTPUT` and `CG_THROTTLE=1` configure it. Constrained mode is4x CPU,150 ms latency,200,000 B/s down,100,000 B/s up.

Baseline is an isolated `git archive efbfad1` production build, with the same Node/dependencies/static data and fixture mode. Optional new context files are not requested by the older UI. Final source is built separately; no browser/dev timings are substituted for production timings. Raw reports are under [performance](audit/performance/final/measurements.json). Opening transfer remains within the provisional20% budget; optional datasets load only for selected-location/home inspection. Final paired values are recorded below after the final capture pass.

Initial paired sample:837,007 bytes baseline versus841,606 bytes revision, about0.55% increase. Baseline main JS gzip427.94 KB; final main JS gzip432.24 KB. No new context dataset is part of opening transfer. Existing parse/source work and the large JS chunk remain material performance limits. Finite heap/pan samples cannot prove absence of a resource leak or guarantee phone frame rates.

## API and deployment boundaries

Vite preview serves static assets and cannot execute Vercel functions. Serverless APIs are tested separately by the12 routing contracts. No new Railway backend is used. A previously authorised single published-example TravelTime request is recorded in [routing verification](SEARCH_ROUTING.md); it is not repeated here or relabelled as private-home verification. Working credentials do not change evaluation-only account rights.

Mapterhorn TileJSON and a real WebP tile were fetched:200,image/webp, wildcard CORS, week cache. Source rights and mixed resolution are recorded in the terrain descriptor. Deployed application headers are a release-time check because production was unchanged.

## Remaining limitations

- Muni context is fresh for its feed period; other agencies, old isochrone fixtures and H3 frequent-service indicators retain their dates. No active calendar is unknown, not zero service.
- Nine mapped park entrances are incomplete and unverified for accessible routing. All proximity is straight-line, with barriers disclosed.
- FEMA geometry is contextual, simplified and panel-dated; a missing polygon is not no exposure. Sparse Peninsula incident/crash data remain unknown and cannot improve suitability.
- TravelTime Basic remains evaluation-only. Persistent caching requires verified account rights. No exact journey time or fairness ranking is inferred from contours.
- Rent indices retain ZIP/all-property resolution; user-entered home rent/bedrooms are separate. Other recurring costs remain unknown until entered. Sharing is portable copies, excluding precise locations by default.
- Existing CalEnviroScreen portal redistribution metadata remains unresolved. Review it before public release rather than asserting a licence not established here.
- Map terrain/buildings are best-effort geographic context with approximate heights, not surveys or photorealistic meshes. A source outage retains a reversible flat map.
- Full H3-dependent Python validation is blocked locally by Windows policy; Linux CI outcome is recorded separately when available.

## Local run

```powershell
npm.cmd ci
$env:VITE_COMMUTE_PROVIDER='fixture'
npm.cmd run dev -- --host localhost --port 5189
```

Open `http://localhost:5189`, then Add your destinations or Try the SF + SFO example. This shell override preserves the private local configuration and does not use live credentials. For a production preview, build with the same fixture override, then `npm.cmd run preview -- --host localhost --port 5192`.
