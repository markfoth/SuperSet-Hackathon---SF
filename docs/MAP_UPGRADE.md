# Map rendering, terrain and source decisions

Verified on 12 November 2026. The primary renderer is MapLibre GL JS, using the
OpenFreeMap Positron style. Find, Explore and Compare use the same matching,
destination, home and selection state. Renderer data is derived from the existing
park-cut display footprints; matching calculations still use canonical H3 cells.
MapLibre 6's worker is imported as a Vite URL asset and registered explicitly;
otherwise Vite's optimised module path makes the default adjacent worker URL 404.
The worker remains same-origin and is included in the production build.

## Free basemap and attribution

[OpenFreeMap](https://openfreemap.org/) currently provides its public service with
no registration, API key, credit card or request/view quota and explicitly permits
commercial use. Its [terms](https://openfreemap.org/tos/), updated 14 October 2026,
provide the service as available, without an SLA. The app makes ordinary viewport
requests and offers no offline tile downloader. The separate offline allowance is
up to 3,000 tiles or 50 MB, at most four parallel requests and an identifying
User-Agent; it does not authorise an unlimited bulk mirror.

MapLibre retains the source attribution: OpenFreeMap, OpenMapTiles and
OpenStreetMap contributors. MapLibre is BSD-3-Clause; the OpenMapTiles schema is
CC BY and its implementation is BSD. OpenStreetMap data is ODbL. No account or
server credential is required. Do not hide attribution when changing the layout.

When WebGL cannot initialise, a lazy Leaflet compatibility renderer retains the
matching overlays, destination movement, home pins and context layers in 2D.
It uses the [OSM standard raster service](https://operations.osmfoundation.org/policies/tiles/)
with visible OSM attribution, browser caching and the browser Referer. That service
is best effort, has no SLA, prohibits bulk download/prefetch and can withdraw access.
Its URL can be overridden with the existing `VITE_BASEMAP_URL` and matching
`VITE_BASEMAP_ATTRIBUTION`. A normal basemap failure leaves local boundaries,
matching locations and pins available with a retry message.

## 3D buildings

Explore and the 3D button enable neutral extrusions above zoom 15. The existing
`openmaptiles` basemap source supplies only the tiles in the current viewport;
there is no additional city-wide building GeoJSON download.

The [OpenMapTiles building schema](https://openmaptiles.org/docs/schema/#building)
describes `render_height` and `render_min_height` as approximate heights derived
from OSM height or storey tags. These are metre-valued rendering dimensions, not
sea-level elevations and not surveyed measurements. The interface says that
heights may be inferred from storeys. Missing/zero heights are not given an
invented default. `hide_3d` outlines are omitted to avoid duplicate extrusion of
building outlines and parts. Neutral building colour and height carry no match
quality meaning. Matching has its own flat green, amber and grey layer.

The [DataSF footprint source](https://data.sf.gov/Geographic-Locations-and-Boundaries/Building-Footprints/ynuv-fyni)
was inspected through its public dataset metadata and one record. Its footprints
originate from a 2010 Pictometry model, subsequently split/refined. `p2010_zminn88ft`
and `p2010_zmaxn88ft` are NAVD88 elevations in feet, not building heights.
`median_1st_m` and `peak_1st_m` are first-return NAVD88 elevations in metres.
`hgt_median_m` is the median height-surface statistic in metres; `gnd1st_delta`
is first-return median minus minimum ground and can overstate apparent height on
slopes. Portal load/update dates do not make the underlying 2010 acquisition new.
Adding that source without a coverage/vintage audit would not establish an
accuracy improvement, so no overlapping custom source is shipped.

[Overture buildings](https://docs.overturemaps.org/guides/buildings/) were also
considered for the Peninsula. The current guide describes OSM, authoritative and
ML-derived footprints, height inference and ODbL licensing. A future bounded
extract must audit height completeness, footprint validity and overlap against
the basemap before it replaces buildings inside an explicit boundary. It should
not be layered over duplicate OSM footprints. No global download or extra runtime
service was introduced for an unverified marginal benefit.

## Previous bounded terrain, superseded

The following documents the earlier pipeline. The current display source is continuous Mapterhorn Terrarium terrain. The clipped local source reproduced a -10,000 m edge defect and is no longer used for display. See [reproduction, replacement and camera evidence](3D_RENDERING_FIX.md). The original USGS analysis raster and derived street gradients are unchanged.

### Historical pipeline

The coloured `topography.png` remains a contextual elevation picture. It is never
passed to `raster-dem`. Terrain uses newly generated Terrain RGB tiles from the
existing genuine USGS 3DEP 10 m bare-earth DEM. The cached extract was downloaded
on 21 October 2026. [USGS specifications](https://pubs.usgs.gov/tm/11b9/tm11B9.pdf)
define continental US bare-earth elevations in metres relative to NAVD88; source
acquisition dates vary. The GeoTIFF horizontal CRS is EPSG:26943.

Rebuild from the bounded cached source, outside runtime requests and frontend builds:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/download_datasets.py --only elevation_3dep
.venv/Scripts/python.exe -X utf8 scripts/build_terrain.py
.venv/Scripts/python.exe -X utf8 -m pytest tests/test_terrain.py
node scripts/sync_public_data.mjs
```

The study bounds are west -122.53, south 37.60, east -122.35, north 37.835.
The builder reprojects genuine elevation into Web Mercator XYZ tiles at zooms 8
through 13, each 256 square pixels, using bilinear resampling. The encoding is:

`elevation metres = -10000 + 0.1 × (R × 65536 + G × 256 + B)`

The source is lazy: no DEM tile is requested until Terrain is explicitly enabled.
Terrain uses exaggeration 1.0, actual scale. Building extrusion bases remain
relative to the terrain surface; the application does not add sea-level ground
elevations to their heights. Inspect slopes at street zoom after upgrading MapLibre
or changing the DEM. Terrain is not a surveyed building-placement model.

Outside the measured extract pixels have alpha zero and sea-level RGB padding.
Raster DEM clients may ignore alpha, so the metadata explicitly discloses flat
padding and possible boundary artefacts. Source bounds prevent requests for
unprovided tiles. Keep the visible coverage note and do not use padding as
measurement evidence. Detailed street grades retain their independent pipeline.

The manifest records source and processing dates, licence, encoding, bounds and
every output path. USGS elevation is public domain. Tests decode known elevations,
check real relief at Twin Peaks versus downtown, preserve missing coverage and
enforce an asset budget.

## Previous local asset budgets and transport

The current build produces **62 tiles, 2,234,702 bytes** total, plus a small JSON
manifest. Custom building assets are **0 bytes**. The combined custom building and
terrain total is therefore about **2.23 MB**, comfortably below the provisional
150 MB and 500 MB targets. The sync script copies the nested tile directory; it
does not run Python or download data during frontend builds.

XYZ PNG tiles are a justified tiled format for this small bounded pyramid. Each
viewport requests whole small tiles, so archive byte-range reads are unnecessary.
PMTiles and a custom tile service would add code and infrastructure without saving
an appreciable bounded payload here. Ordinary static HTTP serving is sufficient
for Vercel or Railway. Keep normal caching on tile files and same-origin access;
no cross-origin credential or CORS workaround is needed for the local DEM.
Browser request/transfer evidence and deployment header checks belong in
`docs/VERIFICATION.md`, because they depend on the actual tested server.
The reproducible `node scripts/measure_map.cjs` browser probe records initial
encoded transfer, actual vector-tile requests, visible OSM extrusions, optional DEM
tile transfer, drag frame intervals and long tasks. It defaults to localhost:5188;
set `CG_BASE_URL` for a production-build preview. Set `CG_THROTTLE=1` to repeat with
four-times CPU slowdown, 150 ms latency and 200,000 bytes/second download throughput.
Its output goes to `test-results/map-performance/`. Run serially after Playwright,
because Playwright clears its output folder at the start of each suite.

## Controls and failure handling

- 3D buildings, Terrain, Reset north and Fit locations are independent labelled buttons.
- Camera movement honours reduced-motion preferences. Pitch is limited to 60°;
  useful zoom is bounded to 9 through 19.
- Destination markers drag; home markers select and can drag when a callback is supplied.
  Map pin placement supports arrow keys followed by Enter at the map centre.
- Context layers fetch on explicit toggle, retain their resolution and hide when
  switched off. Failed layers expose retry; failed terrain returns to the flat map.
- Excluded cells never enter the MapLibre source, even if previously selected.
  Unknown cells remain distinct. Gold selection outlines are above context layers.
- Cards provide the accessible named list of map locations. WebGL canvas features
  are supplemented by that list, native map keyboard navigation and labelled pins.

No aerial imagery, live custom tile service or new Railway resource is required.
