# Architecture

React 19, TypeScript and Vite provide one desktop workspace. App.tsx owns destinations, preferences, saved places, homes, selection and independent panel collapse. MapLibre is the only map renderer. The WebGL failure state preserves the analytical workflow and offers a map retry.

## Analytical path

1. The opening page loads boundaries, lightweight area summaries, source-aware content and ZIP rent context. It does not load the complete candidate index or detailed context features.
2. The first search/home/comparison loads candidate_index.json. Its columnar rows contain every H3-9 candidate. Only clipped analytical boundary rings are stored; the worker reconstructs ordinary H3 rings. Source IDs, measured values, nulls and nullable residential booleans are preserved.
3. The shared analysis worker tests the same representative point against every required inbound catchment, evaluates all Must-haves, applies lexicographic measurement bands and summarises by area. Exact shared polygon intersection also runs there. Required route failures/pending states cannot disappear from the gate.
4. Every evaluation has a request revision. App.tsx presents only the response belonging to current inputs. Out-of-date responses cannot replace current results. Current-route result storage is bounded and in-flight provider calls are deduplicated server-side. Persistent provider caching is off by default.
5. Detailed park-cut cell geometry is partitioned by H3 parent 5. The map requests intersecting partitions. Those requests affect display only, never candidate eligibility, precision, counts or ranking. Geometry failures are separate recoverable display errors.
6. Optional parks, POIs, cycling, transit and pollution use context_index.json and viewport partitions. Responses from old viewports/styles are ignored. Spatial JSON caching is bounded to 48 entries. Listeners are deduplicated by source and cleaned up on style reload.

Area summaries use the leading eligible cell, not a neighbourhood majority. Homes check their actual coordinate against catchments and their containing analytical cell for contextual measurements. A neighbourhood can be shown when any candidate qualifies. No exact route duration is inferred from an isochrone.

## Map lifecycle

MapLibre loads OpenFreeMap vectors. Application sources are initialised once per style generation. Terrain uses continuous 512 px Terrarium tiles at normal vertical scale. Buildings use actual OpenMapTiles height fields at source zoom 14 and above, including approximate storey inference. Bounded tile level-of-detail settings avoid mixed parent/child tiles in pitched views.

Terrain/Satellite selection changes presentation of provider layers and one attributed raster source. It does not recreate the map or replace application sources. Labels use a suitable halo over imagery. Explicit loading/failure states and retry are provided. Full provider-style reloads still rebuild overlays with generation guards, retaining DOM pins and state.

rightDragZoom.ts owns both non-standard mouse gestures. It captures an initial geographical and screen anchor, disables conflicting rotation, suppresses map-only context menus/autoscroll, and uses MapLibre's terrain-aware anchored-camera solver. Middle drag changes orientation before re-solving the same anchor. Right drag preserves orientation. Pointer capture, outside release, cancellation, lost capture and window blur terminate gestures. Pitch is clamped to 0-60 degrees; invalid/unstable anchor picks are rejected. The compass follows rotate events, including animations, and has a keyboard-accessible north reset.

Initial results are framed once. Routine preference, layer, style and viewport updates do not refit a camera the user chose. Explicit selected-place/destination actions may focus that location. Panel changes adjust unobscured map padding without resetting zoom/bearing.

## Incident graphics

incident_details.json contains monthly/category bundles built from incidents deduplicated by source incident ID. The builder preserves official approximate coordinates. Both graphics and close-up points derive from exactly the same filtered bundles.

Stable H3 columns use levels 6 below zoom 10.5, 7 below 12.5 and 8 above that. All levels use 0.05 display metres per unique incident, keeping the strongest close-view column below 260 display metres for this extract. The legend names the current level and fixed scale. Larger cells sum more locations; counts across different aggregation areas are not comparable rates. No viewport maximum normalisation or screen-cluster crime rates are used. Narrow column footprints, translucency, counts, hover/click details and selection distinguish data graphics from real buildings. Columns fade into published intersection points from zoom 14.2 to 15.2. Crash and nightlife presentations retain their separate semantics.

## Routing and state

The browser selects the configured proxy for custom destinations. The explicit offline example marks its destinations as fixtures. Moving an example pin leaves fixture mode. Failed live routing never silently becomes an offline success.

The local Node proxy and Vercel functions share validation, home-to-work arrival searches, Pacific next-weekday dates, mode mapping, request deduplication, limits and sanitised errors. Health reports provider/configuration booleans. The routing destination envelope is wider than housing coverage. Weekly cost illustrations require requested measured journeys; return-time symmetry is explicitly an assumption.

Workspace/scenario version 1 remains readable. Old extra mode fields are ignored by validation; no destructive migration is needed. Homes and bookmarks retain coordinates and identifiers. Sharing uses validated portable fragments and omits precise locations unless explicitly included. Shared copies are not synchronised. There is no household database or new infrastructure.

## Build and data ownership

Canonical outputs and licences live under data/sf. Raw downloads and local tool caches are ignored. scripts/sync_public_data.mjs copies runtime assets only. Full analytical geometries, duplicate context extracts, street-analysis inputs and retired DEM tiles are not deployed. Frontend builds never download or preprocess source data. The Python pipeline is an explicit operator action. See DATA_SOURCES.md for refresh order and source gaps.
