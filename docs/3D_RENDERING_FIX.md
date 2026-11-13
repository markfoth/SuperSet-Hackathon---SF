# Regional 3D repair

The original local DEM reproduced the falling-away defect south of its clipped coverage. The replacement uses one continuous regional terrain source, keeps buildings and camera tilt independent, and leaves housing analysis limited to SF to SFO.

## Reproduction and cause

Evidence: [original browser diagnostics](audit/baseline-3d/diagnostics.json) and screenshots in `audit/baseline-3d/`. Chrome used real MapLibre rendering, real tiles and `queryTerrainElevation`, without a mocked WebGL renderer. At centre longitude -122.411, latitude 37.575, zoom 15, pitch 60 and bearing 35, the original source returned **-10,000 metres** at latitude 37.56 on three adjacent longitude samples. Nearby samples at latitude 37.575 returned plausible elevations of 158 to 284 metres. Oakland and Berkeley returned zero with no DEM requests.

The former raster pyramid covers a narrow rectangle and encodes missing source pixels with alpha zero. Transparent black decoded using the Mapbox RGB elevation formula is -10,000 metres. This explains the measured abyss at its clipped edge with high confidence; the audit did not separately instrument browser alpha premultiplication. Bounds alone do not repair missing pixels inside coarse parent tiles. The SF/Daly boundary itself did not reproduce a ten-kilometre drop in this sample, so that location is included as a regression case rather than claimed as a separately proven defect.

## Source decision

| Option | Benefits | Costs and risks | Decision |
| --- | --- | --- | --- |
| Buffered USGS 3DEP tiles | Public-domain US elevation, controlled hosting, detailed source grid | Requires a substantially larger buffered download, nodata-aware mosaicking and complete coarse parent coverage. A different small clipped rectangle would repeat the failure. | Keep the original analysis pipeline; do not use its clipped display DEM. |
| Mapterhorn complete 0 to 12 pyramid | One continuous global grid, Terrarium encoding, public XYZ access, no source handoff at SF borders | External best-effort service, mixed source resolution and dates, z12 overzoom limits close-up detail | Selected for visual terrain context. |

Verified primary sources: [Mapterhorn access documentation](https://mapterhorn.com/data-access/), [attribution requirements](https://mapterhorn.com/attribution/), [underlying source catalogue](https://download.mapterhorn.com/attribution.json), [live TileJSON](https://tiles.mapterhorn.com/tilejson.json), and [MapLibre raster DEM specification](https://maplibre.org/maplibre-style-spec/sources/). Verification fetched the TileJSON, attribution catalogue and one public WebP tile. The tile returned HTTP 200, image/webp, wildcard CORS and public cache max-age 604800. No account, API key, card or paid service was added.

`build_regional_terrain.py` records the descriptor, retrieval time, limitations and relevant underlying attribution entries. USGS 1 m and 10 m entries identify US government public-domain data; the global Copernicus fallback has its own Copernicus licence. The software licence is not used as a substitute for those data terms. Map attribution links to Mapterhorn and its source contributors. Source dates and vertical references vary; no exact acquisition date is asserted for an individual rendered pixel.

Runtime uses Terrarium, 512-pixel tiles, minimum zoom 0, maximum zoom 12, normal exaggeration 1 and the provider's global bounds. Detailed zoom levels overzoom this complete pyramid. The original USGS street-gradient calculations remain separate: display terrain is not a new slope analysis or a reason to extend matching into Oakland or Berkeley. There is no fabricated sea-level fill, interpolation across a nodata hole, source switching boundary or terrain disabling outside SF. Navigation bounds were removed so regional context remains reachable.

## Controls and recovery

Buildings, terrain and tilt now have independent controls. Enabling buildings or terrain offers a tilted view; disabling buildings leaves terrain intact, and overhead view leaves terrain intact. Rotation and fitting locations remain separate actions. Building extrusion excludes missing/nonpositive or implausible heights and clamps the base to the declared height; OSM storey-derived heights remain explicitly approximate.

Terrain loads only after the user enables it. A generation token prevents a late request from enabling it after cancellation or unmount. Style reload restores intended terrain. A terrain tile failure removes the broken DEM, displays a retry notice and retains the flat map and buildings, rather than supplying invented elevation. A provider outage is therefore still a visible limitation, not a solved availability guarantee.

## Browser regression evidence

[Production terrain matrix](audit/repaired-production-3d/diagnostics.json): 12 places by four camera states, 48 states and 432 finite elevation samples, with no recorded console/page errors or failed terrain responses. Configurations are zoom/pitch/bearing 9/0/0, 12/45/90, 15/60/35 and 17/60/-45. The sample range was -1 to 341.37 metres, including the former failure region. This matrix isolates terrain with buildings off.

[Combined buildings and terrain matrix](audit/combined-production-3d/diagnostics.json): the same 12 places at zoom 15, pitch 60, bearing 35. Screenshots are retained alongside both JSON reports. Colma and the former southern failure region were visually checked for continuous ground; buildings remain grounded in the combined Colma view. This is sampled regression evidence, not a survey of every building or viewpoint.

| Place | Four terrain cameras | Combined screenshot |
| --- | --- | --- |
| Downtown SF | Recorded | `downtown.png` |
| Twin Peaks | Recorded | `twin-peaks.png` |
| SF/Daly City boundary | Recorded | `sf-daly-boundary.png` |
| Colma | Recorded | `colma.png` |
| Brisbane | Recorded | `brisbane.png` |
| South San Francisco | Recorded | `south-sf.png` |
| San Bruno | Recorded | `san-bruno.png` |
| SFO | Recorded | `sfo.png` |
| Pacifica | Recorded | `pacifica.png` |
| Beyond the old southern edge | Recorded | `beyond-south.png` |
| Oakland | Recorded | `oakland.png` |
| Berkeley | Recorded | `berkeley.png` |

[Lifecycle report](audit/terrain-lifecycle.json): five enable/disable cycles retained a single terrain source; buildings stayed enabled when terrain was toggled, disabling buildings preserved terrain, overhead tilt preserved terrain, and resetting the actual style restored terrain. A final garbage-collected Chrome heap snapshot is included as a diagnostic only; one snapshot cannot establish absence of a memory leak. The repeatable probes are `scripts/audit_regional_terrain.mjs` and `scripts/audit_terrain_lifecycle.mjs`. The former accepts `CG_BASE_URL`, `CG_AUDIT_PHASE`, `CG_AUDIT_MATRIX=1` and `CG_AUDIT_BUILDINGS=1`.

A development-server run interrupted by hot reload was discarded and is not evidence. The reports cited above used an isolated production preview. Close-up terrain detail, source availability and absolute elevation accuracy remain bounded by the provider and source datasets.
