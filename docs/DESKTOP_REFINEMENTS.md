# Desktop map refinements

Implemented on `feature/desktop-map-refinements`, based on the clean `f70b94e` regional-terrain branch. Review date: 13 November 2026, Pacific time. No production deployment or merge was performed. No paid service, key or runtime model call was added. No AGENTS.md was present in the checkout or inspected parent directories; CLAUDE.md was updated for the requested intersection detail and earlier POI visibility.

## Controls and visible behaviour

At desktop widths from 1100 CSS pixels, destinations and preferences stay on the left and matches/details stay on the right. Each panel scrolls and collapses separately. Focus on map hides both. Result count and sorting remain visible while results scroll. See [layout decisions and framing evidence](DESKTOP_LAYOUT.md).

Right-button drag captures one geographical anchor at pointer-down. Upward movement zooms in and downward movement zooms out, at 125 CSS pixels per zoom level. `RIGHT_DRAG_ZOOM` in `src/map/rightDragZoom.ts` is the single sensitivity/sign setting. The implementation uses MapLibre 6's supported [anchored-camera calculation](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#calculateanchoredcameraoptions), including terrain elevation, then re-solves against that same anchor when centre elevation changes. Bearing and pitch are preserved. There is no inertia or transition, including under reduced motion. Pointer capture, window release, cancellation and blur end the gesture. Context-menu suppression is scoped to the map canvas; normal context menus elsewhere are preserved. Default right-button rotation is disabled. Tilt, clockwise rotation and Reset north remain explicit controls. The navigation hint can be dismissed for the session.

Terrain picks must have finite coordinates and project back to within three pixels of the pointer. Unreliable near-horizon picks are declined without a camera move. This is a documented projection safeguard, not a claim of exact Google Earth behaviour. Terrain-only pitch remains bounded at 60 degrees; the building constraint below is narrower.

Public transport contains **Animate example vehicles** and **Pause animation**. Two small bus/train symbols follow actual Muni 22 and N geometries from the existing source snapshot. Their movement is explicitly illustrative, not live or a scheduled service estimate. Long gaps and separate geometry segments are split; the longest continuous segment is used, and vehicles reverse at its endpoints instead of teleporting. The animation is off initially, including for reduced motion, and only starts on deliberate request. Browser-hidden state cancels the frame loop. Turning the layer off or pausing cleans up its markers, frame and listener. Camera movement does not rerender React on each vehicle frame. Source timetable expiry warnings remain visible. The optional animation uses the primary MapLibre renderer; the 2D compatibility map retains static transport geometry.

## Building investigation and choice

[Raw source probe](audit/building-source-probe.json) fetches nine ordinary public tiles, three places (central SF, South SF and SFO) at zooms 12, 13 and 14. The TileJSON identifies the current OpenFreeMap tile release. The measured differences are:

| Source zoom | Observed building content | Consequence |
| --- | --- | --- |
| 12 | No building layer in all three sampled tiles | Lowering a style threshold cannot supply buildings |
| 13 | One generalised feature per sampled tile, no render-height attributes | Cannot safely extrude these footprints |
| 14 | 157 / 5 / 22 features with positive rendering heights in these particular tiles | Useful detailed source, not an estimate of city-wide coverage |

The source's geometry/generalisation and absent attributes explain why a style-only minzoom change is insufficient. At pitch, default mixed tile zooms can place heightless parent tiles beside detailed tiles, producing rectangular patches. Missing/rejected heights, genuine mapping gaps and delayed tiles remain separate limitations. No default building height is supplied by the application; source rendering dimensions are approximate, may originate from storeys or source defaults, and are not presented as surveyed measurements.

The final style fades extrusions in from zoom 14 to 14.5. When buildings are enabled, supported [source tile LOD controls](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/#setsourcetilelodparams) keep one tile zoom level on screen, with tile-count ratio capped at eight. Building pitch is limited to 50 degrees so the view does not extend to the horizon. Disabling buildings restores the normal mixed-detail tile policy and 60-degree limit, while preserving terrain. This is a deliberate, visible camera/detail constraint rather than fog concealing a seam. Nearby and distant geometry share the source level in this bounded view; no unsupported per-building screen-distance fade or fabricated distant geometry is claimed. No quality switch was justified by the measured normal-desktop run.

The existing [DataSF footprint review](MAP_UPGRADE.md#3d-buildings) remains relevant: the 2010 underlying model's NAVD88 elevations in feet/metres are not interchangeable with above-ground heights, and SF-only footprints do not provide Peninsula coverage. [Overture's current building schema](https://docs.overturemaps.org/schema/reference/buildings/building/) provides optional metre-valued heights; its [buildings guide](https://docs.overturemaps.org/guides/buildings/) describes the mixed OSM/authoritative/ML sources and ODbL licensing. A buffered extract would require auditing its optional-height coverage and building parts, removing overlaps and generating a reproducible tile pyramid. This task does not claim a new local completeness audit of Overture. The coherent z14 solution was implemented and visually checked before introducing a second, heavier building source. No custom city GeoJSON or tileset was shipped. Buildings at a zoom-13 city overview remain unavailable from this source, rather than receiving invented heights.

## Elevation and pollution

The refreshed USGS coloured picture retains its original genuine bare-earth DEM, bounds and land/water mask. Observed study-land elevations are −7.3 to 396.6 m; median 53.5 m, 90th percentile 172.4 m and 99th percentile 307.2 m. A fixed near-white/lavender/purple ramp at 0, 50, 100, 200, 300 and 400 m gives the higher hills a distinct colour without darkening all low land. The legend always uses metres above sea level. Normal-scale terrain geometry still comes from the separate global Mapterhorn Terrarium DEM, not the RGB display picture. Street preferences still use the independent USGS road-gradient pipeline. The regional repair is unchanged.

The MapLibre air source contains 305 published PM2.5 values, 7.6 to 34.2 statewide percentile, and three missing values. The old 20-point step bands hid much of that local variation. The new continuous teal ramp defaults to the clearly labelled **Local contrast** range 5 to 35, fixed across the whole study region. An **Air colour scale** selector also offers the full California 0 to 100 range. Both legends and popups reflect the selected scale and retain true California values, explaining that a local maximum is not California's worst. Tract boundaries remain visible; missing values are grey, rather than the pale colour for low published values. The Leaflet fallback shares the selector, ramp and missing-data treatment. Existing source/vintage and redistribution limitations remain in the catalogue.

## Place and event evidence

[Place context](PLACE_CONTEXT.md) records progressive POI detail, contact preprocessing, the four checked official branch links, safe source/search fallbacks and refresh commands. Food/coffee contains cafes and restaurants; nightlife contains bars/pubs/nightclubs and its subtler existing density picture. City clusters and venue dots are mutually exclusive. Names use collision-aware symbol placement from zoom 14. Popup text is inserted as DOM text, and links accept validated HTTP(S) URLs. Visible place/character symbols take click priority over event details, matching cells, buildings and neighbourhoods. Inspecting map context closes the layer drawer, and popup anchors/heights are chosen inside the space between the desktop panels.

[The character dataset](../data/sf/content/neighbourhood_character.json) contains 12 reviewed areas, 23 evidence records and six explicit research gaps. It compiles to 19 broad/district labels in a 35,407-byte lazy GeoJSON file. Each published area has two independently authored publisher groups, topics, known publication dates, review date, limitations, evidence strength and editorial status. This is manual aspect analysis and descriptive context; it never enters rankings. Unresearched areas remain blank. Source article copyright remains with each publisher; the shipped summaries are original editorial text.

[Event precision](EVENT_DETAIL_PRECISION.md) documents incident-ID/crash-ID deduplication, shared-coordinate count markers, inclusive monthly filters, overlapping categories and involvement, separate crash/casualty/fatality counts, privacy and source precision. Both event views derive from the exact same monthly bundles. SF-only data never fills Peninsula gaps. The old crash pipeline's mutually exclusive cyclist/pedestrian flags and unknown-as-vehicle-only fallback were corrected; canonical crash context and neighbourhood display summaries were rebuilt. Housing ranking rules and cell eligibility were preserved; crash counts are not ranking inputs.

## Verification and measurements

The baseline was captured before source changes, from the repaired branch, with real Chrome and actual vector tiles. [Before captures](audit/desktop-refinement-before/captures.json) include opening/results at 1280×800, 1440×900 and 1920×1080. Final captures use an isolated fixture-mode production preview. The fixture override avoids sending private destinations to a routing service.

The desktop browser suite checks household destinations, commute errors, preference ordering, saved homes, scenarios, comparison, renderer recovery, panel scrolling/framing, anchor zoom, marker dragging, POI links/detail, event counts/precision, rapid toggles and style reload. Dedicated checks cover air styling, reduced-motion default/off state, hidden-tab vehicle pause and delayed building tiles. Mobile enhancements and mobile-specific verification were outside scope.

| Check | Actual outcome |
| --- | --- |
| `npm.cmd run typecheck` and fixture `npm.cmd run build` | Passed. Existing large-chunk warning remains. |
| `npm.cmd test` | 73 passed across 14 files. |
| `npm.cmd run test:proxy` | 12 passed; no live credential use. |
| Desktop Playwright | [49 passed in the full run](audit/desktop-browser-final.txt), followed by [7 final affected-flow passes](audit/desktop-browser-event-context-final.txt), covering 50 unique desktop checks. |
| Python event/place/decision/terrain | 19 passed. |
| Python topography/Peninsula | 4 passed; the separate cell-display check hit the GDAL limitation below. |
| Dataset validation | All nine validator groups passed, zero errors. |
| Desktop panel matrix | [15 states](audit/desktop-panel-framing/checks.json), all pins visible after fit and controls reachable. |
| Regional terrain matrix | [48 cameras, 432 finite samples](audit/desktop-refinement-terrain-3d/diagnostics.json), −1 to 341.37 m; no recorded errors or DEM failures. |

Screenshots and the compact recording use real Chrome, public tiles and the isolated fixture production preview. Development recordings interrupted by source reloads were discarded. The [combined-layer measurements](audit/desktop-refinement/diagnostics.json) record the actual browser/GPU, requests, anchor errors and frame intervals. The [asset report](audit/desktop-refinement/asset-sizes.json) records raw/default-Node-gzip sizes; HTTP compression depends on the serving host. Performance runs are serial; finite results on this machine do not establish performance on every desktop. Public tile outages and inherited source warnings remain possible.

| Desktop size | Before results | After results |
| --- | --- | --- |
| 1280×800 | [Before](audit/desktop-refinement-before/1280-results.png) | [After](audit/desktop-refinement-after/1280-results.png) |
| 1440×900 | [Before](audit/desktop-refinement-before/1440-results.png) | [After](audit/desktop-refinement-after/1440-results.png) |
| 1920×1080 | [Before](audit/desktop-refinement-before/1920-results.png) | [After](audit/desktop-refinement-after/1920-results.png) |

Opening-state screenshots are alongside these results. Additional evidence: [anchored terrain navigation](audit/desktop-refinement/anchored-terrain.png), [buildings at zoom 14.5](audit/desktop-refinement/buildings-z14.5.png), [hill colouring](audit/desktop-refinement/hill-colouring.png), [local air contrast](audit/desktop-refinement/air-local.png), [California air scale](audit/desktop-refinement/air-statewide.png), [character/POI checks](../tests/browser/place-context.spec.ts), and [event aggregate/detail precision](../tests/browser/event-detail.spec.ts). The [short navigation and vehicle recording](audit/desktop-refinement/navigation-transport.webm) shows both implemented interactions.

The full native Python suite cannot collect three existing modules because Windows Application Control blocks the installed H3 extension. The existing cell-display test also cannot open GeoJSON through this environment's unavailable GDAL/Fiona driver. These are recorded environment limits, not passing tests. Nineteen event/place/decision/terrain tests pass, and the existing topography and Peninsula checks add four passes. The bounded event builder uses exact build-only `h3-js` indexing; the topography builder reads GeoJSON through standard JSON plus GeoPandas geometry construction. Neither bypasses the Windows control.

### Actual production performance

Machine: Windows 11 build 10.0.26300, Snapdragon X Plus X1P42100 / Oryon CPU, 8 logical processors, approximately 32 GiB RAM. Browser: installed headless Chrome **157.0.8103.51**. GPU: ANGLE / Qualcomm Adreno X1-45 through Direct3D11. Viewport: 1440×900, reduced-motion preference, fresh browser context. No other browser audit ran during the final sample.

The combined sample used normal-scale terrain, coherent buildings, food/nightlife POIs, public transport routes and two moving vehicle symbols together at zoom 15, pitch 50, bearing 35. The 120 animation-frame intervals during scripted panning averaged **16.67 ms**, with **18.5 ms p95** and **22.7 ms maximum**. No long task overlapped that short pan window. This measures a settled view, not every loading transition.

The complete loading/zooming sequence recorded **20 main-thread long tasks**, the largest **5,439 ms**, even with screenshot capture disabled. The earlier screenshot-enabled report is retained separately in [diagnostics-with-screenshots.json](audit/desktop-refinement/diagnostics-with-screenshots.json). The long stalls therefore cannot be dismissed as screenshot overhead. Their detailed attribution was not established by this probe. Cold detailed-map transitions remain a performance limitation requiring further profiling; this is not evidence of uniformly smooth low-end or cold navigation. Buildings, terrain and vehicle animation remain off on a fresh visit, and no silent quality oscillation was introduced.

The maximum sampled right-drag anchor error was **0.247 CSS pixels** across flat/terrain zooms 13.8–17, pitches 0/35/50/60 and several bearings. Upward and downward movement preserved bearing/pitch; outside release ended the gesture. The terrain regression retained all 432 finite samples with no −10,000 m cliff. The building captures showed coherent extrusions at zoom 14.5 (1,217 queried rendered features in this particular view), while zoom 13 correctly had none. Features can contain multipart geometry, so this is not an individual-building count.

Main-page CDP observed **854,238 bytes** over 18 completed opening resources and **no POI, character or event-detail dataset request** on opening. This excludes vector tile transfer performed by the worker and is a lower bound, not total opening traffic. Worker Resource Timing recorded **168 vector tile fetches** over the complete multi-camera sequence, but the provider does not expose their byte counts through cross-origin timing; zero encoded-size fields mean unknown bytes here. Main-page observed terrain transfer across the same whole sequence was **770,399 bytes**. The raw per-resource records remain in the diagnostics.

The production build contains **23,175,787 bytes** of static data, including existing assets. The main application chunk is **1,549,978 bytes**, reported by Vite as **442.88 kB gzip**; the diagnostic Node-default gzip measurement is 439,068 bytes and uses a different compression configuration. The existing large-chunk warning remains. Optional payloads before HTTP compression are incident detail **1,381,497 B**, crash detail **552,673 B**, character **35,407 B**, cafes **434,235 B**, restaurants **1,083,982 B**, nightlife **275,124 B** and groceries **101,472 B**. Custom building tileset payload remains **zero**. These sizes establish practical bounded assets, not a promise of identical transfer compression on every host.

The recording is **21.56 seconds**, **8,762,820 bytes**, 1440×900 VP9/WebM. A [decoded frame](audit/desktop-refinement/video-check.png) was inspected to confirm the bus and train symbols are present and readable. All reported frame/transfer values above come from the screenshot-free production run. Reproduce it with `CG_BASE_URL=http://localhost:5196/`, `CG_SCREENSHOTS=0` and `node scripts/audit_desktop_refinement.mjs`; run `scripts/measure_refinement_assets.mjs` after building for asset measurements.

## Refresh and remaining limits

```powershell
# All expensive work is explicit and outside browser requests / frontend builds.
.venv/Scripts/python.exe -X utf8 scripts/build_topography.py
.venv/Scripts/python.exe -X utf8 scripts/build_event_details.py
.venv/Scripts/python.exe -X utf8 scripts/enrich_place_context.py
.venv/Scripts/python.exe -X utf8 scripts/build_neighbourhood_character.py
node scripts/sync_public_data.mjs
```

The referenced place/event documents give bounded source refresh commands. When advancing a source window, also review `DEFAULT_EVENT_FILTERS` and its matching month limits against the generated metadata; they deliberately describe the shipped historical windows. Do not relabel source snapshots as live/current service. Close-up Mapterhorn detail is limited by z12 overzoom, OSM building/POI coverage can be incomplete, and public services provide no availability guarantee. A surveyed/full city building mesh, live transport, complete character coverage and compatible Peninsula incident/crash data remain outside the implemented scope. The 2D compatibility renderer shares place/event evidence and filters; custom anchored right drag, 3D geometry and the optional vehicle animation belong to the primary renderer. No live routing credential was exercised or changed. Existing CalEnviroScreen redistribution uncertainty remains a separate release-time issue.
