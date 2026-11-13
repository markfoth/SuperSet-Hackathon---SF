# Decision log

## 13 November 2026

- Preserve the latest desktop refinement history. main was six commits behind the desktop branch; all named feature tips were ancestors of the consolidation base. A production push is held for review because Vercel deploys main.
- Use one map journey and retain simultaneous criteria/results panels. Comparison is a counted action over saved places, not a map mode. Existing version-1 scenarios remain valid.
- Own the requested right/middle mouse gestures explicitly. Default handlers are not evidence of Google-style parity. Retain left pan, pointer-centred wheel zoom and keyboard alternatives.
- Use a single attributed USGS/USDA CONUS raster source for satellite presentation. Source metadata lists 2017-2021 acquisitions; the 2024 cache refresh is not an acquisition date. No paid provider or unauthorised Google imagery is used.
- Keep continuous Mapterhorn terrain at 1x. Usable building height tiles start at source zoom 14. Lowering minzoom cannot create missing buildings, so do not fabricate broad-scale extrusions.
- Extend housing with named Census urban city/community polygons and official area-water masks. Keep existing fine geography and stable IDs. Do not stretch SF incidents into another municipality. Missing regional sources remain null.
- Keep a complete compact H3-9 candidate index, worker evaluation and viewport-only display geometry. No analytical decision depends on visible tiles or zoom.
- Crime graphics count unique incidents in a chosen period. Stable geographic aggregation and fixed scales per level replace crime cluster bubbles. Nightlife keeps a separate density/venue progression.
- Remove Leaflet after verified WebGL-startup and actual-context-loss tests showed coordinate search, matching, homes and comparison remain available. A clear retry state is easier to maintain than a second renderer and duplicate context loaders.
- Keep current source manifests, reproducible builders, migrations and regression tests. Retire historical audit scripts, contradictory progress narratives, duplicate generated browser assets and obsolete screenshots. Git history preserves previous implementation narratives.

## Analytical contracts retained

Commute is the primary hard gate at H3-9 representative points. Every required destination participates. All independent failures remain listed. Unknown evidence never means zero, low crime, low pollution, a pass or a failure. Must-haves block confirmation when evidence is missing. Soft preferences use explicit lexicographic measurement bands and order, not a universal score. Street gradients use road-aligned measurement windows; rents and pollution retain their source geographies. See RANKING_METHOD.md and STREET_GRADIENT_METHOD.md.
