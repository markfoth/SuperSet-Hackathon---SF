# Common Ground product upgrade

## Plan

1. Establish the baseline, verify the production source and inspect data and routing contracts.
2. Replace the primary renderer with MapLibre and a free vector basemap, preserve overlays and add optional real buildings and bounded terrain.
3. Redesign the opening journey, progressive preferences, map controls, results and mobile navigation.
4. Add household destinations, explicit place selection, trade-off previews and honest commute evidence.
5. Add specific homes, location bookmarks, named scenarios, portable sharing and comparisons.
6. Verify complete browser journeys at desktop, tablet and mobile sizes, measure assets and performance, document deployment and create a draft PR.

## Decisions

- Work is isolated on `feature/common-ground-household-upgrade`. Production must not be changed.
- Preserve the existing H3 representative-point hard commute gates and ordered measurement bands. Missing data remains unknown.
- MapLibre is the primary renderer, with OpenFreeMap vector tiles and lazy Leaflet fallback for unavailable WebGL.
- Prefer a bounded local index of real places over a public geocoder with restrictive autocomplete policies.
- Local persistence and portable scenario sharing are the complete collaboration path for this release. No paid resources or public writable store.
- Exact commute-time fairness cannot be inferred from isochrones. Office-day comparisons must use explicit bounds or assumptions, never invented journey times.
- Authored copy and documentation use UK English without em dashes.

## Baseline

- Clean working tree at `e2b6fcc` on `main`, before the feature branch was created.
- Existing React 19, TypeScript, Vite, Leaflet, H3 resolution 9, six initial analysis files and credited local photos verified.
- Existing local proxy and Vercel function share routing validation and caching logic.
- No AGENTS.md found in the repository or applicable parent directories. CLAUDE.md read.
- Baseline browser captures completed at 1440 × 900, 1024 × 768 and 390 × 844. The example produced 494 matching cells across 32 neighbourhoods, without page errors or horizontal overflow. Baseline local Stadia tiles were unavailable; the new renderer was separately verified against real OpenFreeMap tiles.
- Vercel production deployment and authenticated remote main both verified at `e2b6fccec2c430cd7c811768b83b8401c5d6f2ee` on 12 November 2026.

## Completed implementation

- MapLibre/OpenFreeMap, all useful context overlays, actual OSM-derived building dimensions, north/fit/2D/3D controls, source failures and lazy Leaflet compatibility.
- Genuine bounded USGS Terrain RGB: 62 tiles, 2,234,702 bytes. No city-wide building GeoJSON or additional custom footprints.
- Explicit bounded local place search, independent selected-place/label semantics, precise coordinates, draggable pins and keyboard placement.
- Household person labels/colours, multiple destinations, office days, supported arrival times and stale response isolation.
- New map-led visual system, progressive preferences, a single desktop decision panel and mobile bottom panel, compact explainable results and source-aware details.
- Deliberate commute/Must/priority trade-off previews. Unknown Peninsula evidence now has a distinct detail state rather than an exclusion claim.
- Local named scenarios, JSON import/export, default-private share fragments, recipient confirmation, same-tab hash handling and storage recovery.
- Specific homes, actual-pin commute checks, manual property costs, explicit exact-route requests and honest weekly illustrations.
- Three-or-more location comparisons, context-retaining neighbourhood/cell bookmarks and notes.
- Real mobile touch verification found and fixed a toolbar obstruction. Map worker path and tile/layer retry issues were fixed from browser evidence.
- Compatible dependency security updates applied; npm audit reported zero vulnerabilities.
- Read-only Linux data-contract CI added using a standard public-repository runner, no secrets or deployment permissions.

## Validation and remaining work

- The integrated suite passed 52 desktop/mobile browser checks after deferring the two large geometry files. A final targeted recovery/scenario rerun passed all 18 checks after the loading/privacy guards.
- 58 Vitest tests, 12 routing contracts, production build/typecheck and six terrain/topography/Peninsula tests passed. Dataset validation reported zero errors.
- Full local pytest collection is blocked by Windows application control for H3, and the existing GeoPandas file test cannot load GDAL. Do not describe those checks as passed. Linux CI will provide a separate full-suite result.
- One live public-example TravelTime Routes request was explicitly approved and passed, HTTP 200 in 416 ms. No private home coordinate was sent. Basic remains evaluation-only; persistent caching requires verified rights.
- Screenshots were captured and inspected at all three requested sizes, with actual vector tiles, zero page errors and no horizontal overflow. Review artefacts live in `docs/review/`.
- Initial performance evidence exposed an unnecessary 3.36 MB geometry load on the empty opening screen. It is now deferred. Final opening transfer is 0.84 MB, about 80% lower. On constrained 4G/4× CPU it opens in 8.6 seconds; the first uncached search still needs 18.8 seconds. Both costs are disclosed.
- Final tested DEM view transferred 480,938 bytes in 11 tiles. Drag intervals with real buildings, terrain and matches loaded: 16.8 ms p95 unthrottled, 33.3 ms constrained. Full deployed artefact about 23.45 MB. No console errors in either measurement.
- Final review captures and measurement/HTTP JSON are stored in `docs/review/`; the verification report distinguishes local preview headers from untested production cache headers.
- Core upgrade committed and pushed. Draft [PR #3](https://github.com/markfoth/SuperSet-Hackathon---SF/pull/3) is open. A final capture review moved the mobile legend clear of attribution. The new CI workflow's colon-containing install command was corrected to a YAML block and parsed locally; full Linux test result remains to be recorded.
- Production alias was rechecked after the feature push and still points to the original main deployment. No merge, production deployment or paid resource creation.
