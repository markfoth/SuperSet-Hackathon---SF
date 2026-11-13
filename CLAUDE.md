# Common Ground working instructions

Read README.md and docs/ARCHITECTURE.md. The user task and actual code take precedence over historical documents. Use UK English and no em dashes. Target desktop/laptop browsers; preserve the three-column layout.

## Product and accuracy

- One map journey. No Find/Explore/Compare mode state. Comparison is a counted saved-places action.
- H3-9 representative-point home-to-work catchments are hard gates. Every required destination participates, including pending/failed requests. Region-wide matching never depends on loaded viewport geometry or map zoom.
- Must-haves exclude only on known failure. Missing required evidence is unknown and cannot confirm a match. Missing soft evidence sorts after measured values. Never turn null into zero.
- Ranking is lexicographic measurement bands in explicit preference order. No universal liveability or safety score. Preserve all independent reasons and trade-off previews.
- Housing coverage is study_boundary.geojson, not a rectangle. Richmond is excluded; original SF and northern Peninsula IDs remain stable. New city/community groups are labelled as such.
- Never extrapolate SF incidents or crashes to other municipalities. SFPD locations are approximate anonymised intersections; deduplicate by incident ID. Crime columns count unique incidents in the chosen period and use fixed scales per H3 level, separate from building height. Nightlife remains venue density/context.
- Street gradients use measured street-aligned DEM windows. Visual terrain is independent. Do not substitute terrain averages for missing road gradients.
- Rents are ZIP-level asking indices; pollution is tract-level indicators only, never the CES composite. Access distances are straight-line, not route times.
- Preserve scenario/workspace version 1, homes, bookmarks, stable IDs and validated import/export. Extra obsolete mode fields are ignored, never a reason to delete saved data.

## Implementation

- MapLibre is the single renderer. Left pan, pointer wheel zoom, anchored right-drag zoom and anchored middle-drag orbit/tilt are explicit contracts. Prevent autoscroll and handle cancellation, capture loss and blur.
- Terrain is continuous Mapterhorn Terrarium, exaggeration 1. Buildings are default where source zoom/data supports them. No clipped DEM display source, fake heights or separate terrain/building toggles.
- Satellite is licensed public-domain CONUS USGS/USDA imagery. Preserve attribution, overlays, camera and preferences. No Google imagery endpoints or demo tokens.
- Only src/lib/candidates.ts creates the shared analysis worker. Ignore stale request revisions. Fetch optional geometry through viewportData.ts and bounded spatial caching. Reuse sources and listeners across style choices.
- Keep heavy downloads/preprocessing outside frontend builds and request handlers. Edit canonical processed files, never generated public/data. Every source/output needs manifest metadata and reproducible processing.
- Keep private environment files intact. Routing credentials stay server-side. Do not print credentials, headers, provider bodies or environment values. Health checks expose booleans only.
- Local and Vercel routing share server/routing-core.mjs. No paid plan, card requirement, expiring trial, or automatic licence upgrade. Persistent caching needs verified provider storage rights.

## Checks and release

Run the relevant Vitest, proxy, Python data and browser tests, then the production build. The current desktop audit covers 1280x800, 1440x900 and 1920x1080. Simulate failed WebGL and actual context loss when changing the failure experience. Screenshots from regression tests belong in ignored test-results; curated evidence belongs in docs/verification.

Inspect working trees, local/remote branch tips and unique commits before consolidation. Preserve uncommitted work. Do not force-push or delete unexplained unique commits. Pushing main deploys production; validate the temporary consolidation and explain that consequence before final promotion. Do not create paid infrastructure.
