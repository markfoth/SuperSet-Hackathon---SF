# Product upgrade verification

Review date: 12 November 2026, America/Los_Angeles. Work remains on
`feature/common-ground-household-upgrade`. Production was not deployed or merged.

## Source and baseline

The initial tree was clean. Current remote main and Vercel production both
identified `e2b6fccec2c430cd7c811768b83b8401c5d6f2ee`. Production deployment ID:
`dpl_BdGaTe13D3yBj7CiMHJoN2NkhXiD`, with the `common-ground-sf.vercel.app` alias.
These were read from authenticated Git and Vercel metadata, not inferred from an
old screenshot or a local branch name.

The original app was exercised in Chrome at 1440 × 900, 1024 × 768 and 390 × 844.
Its explicit example produced 494 matching cells across 32 neighbourhoods, with
no page errors or horizontal overflow. Original local Stadia tiles did not load;
that was not treated as successful basemap verification.

## Automated results

| Check | Actual outcome |
|---|---|
| `npm test` | 58 tests pass across nine files |
| `npm run test:proxy` | 12 contracts pass |
| `npm run build` | TypeScript and Vite production build pass |
| Complete Chrome suite | 52 tests pass, desktop and mobile, one worker, 3.1 minutes |
| Final recovery/scenario rerun | 18 tests pass after final loading/privacy guards |
| Terrain, topography and Peninsula pytest subset | Six tests pass |
| Full Python suite on Linux CI | 44 tests pass, two warnings, 5.33 seconds |
| `scripts/validate_datasets.py` | All nine checks pass, zero errors |
| npm security audit | Zero vulnerabilities after compatible updates |
| Full local pytest | Not passed: host blocks the installed H3 native module; the existing GeoPandas display-file test also cannot load GDAL |

The full native Python suite passed in [Linux CI](https://github.com/markfoth/SuperSet-Hackathon---SF/actions/runs/43381380983)
on source commit `6cede3100c769c373654e29a7a79c0cdc7a4890f`: 44 passed, two
warnings, 5.33 seconds, followed by zero dataset validation errors. The read-only
workflow uses a standard runner only while the repository is public, no provider
secrets, no deployment permission and no cache/artifact storage. The original
workflow parse error was corrected and is not presented as a successful run.

The browser suite covers fresh/example sessions; progressive preferences;
label versus confirmed place semantics; searched places and bounded coordinates;
adding/removing destinations; mode, limit and office-day changes; multiple hard
commutes; pending, failed and stale responses; Must-have previews and recovery;
Peninsula missing evidence; real MapLibre, 2D/3D and genuine terrain; failed
basemaps, context layers and DEM requests; WebGL-disabled Leaflet fallback;
map/card/cell selection; real touch dragging; keyboard pin placement; three-item
comparisons; notes; reload persistence; export/import; default-private and
explicit-precise sharing; recipient confirmation and same-tab fragments;
malformed storage/import recovery; home costs; unavailable exact times; keyboard
focus containment, Escape and restoration. Reduced motion is enabled throughout.

Tests that deliberately abort requests are failure simulations. They are not
used as evidence that the public service loaded. Separate actual-network checks
confirmed vector tiles, hundreds of rendered building features and local DEM
responses. The final screenshot probe reported no page errors or horizontal
overflow at all three requested sizes. See [the visual review](REVIEW.md).

## Live routing evidence

After explicit user approval, one server-side request used the published
Financial District and SFO example coordinates. TravelTime Routes returned
HTTP 200 in 416 ms, with 4,099 seconds for the inbound journey to SFO, arriving
08:45 Pacific on 13 November. Retrieved `2026-11-13T05:54:09.990Z`, which was
12 November locally. No private prospective-home coordinate or credential was
printed. This verified the actual Routes protocol and parsing, not every home,
the complete transit timetable or commercial production rights.

All other route contracts use controlled responses, clearly separated from that
live check. Offline fixtures stay approximate; non-transit fixtures are synthetic.
Exact times are never derived from yes/no isochrones.

## Asset and transfer measurements

The production artefact is approximately **23.45 MB**, including **16.27 MB** of
processed data and **4.87 MB** of credited photos. Many data files are optional
context layers and do not load on entry. Custom buildings add **0 bytes**.
Genuine local terrain is **62 PNG tiles, 2,234,702 bytes** total, plus metadata.
The combined custom buildings/terrain budget is about **2.23 MB**, below both the
150 MB aim and 500 MB hard target.

The primary application bundle is approximately 1.50 MB raw, 428 KB gzip,
including MapLibre. The worker is a separate same-origin 519.5 KB raw asset.
Leaflet is lazy, approximately 148.6 KB raw / 43.3 KB gzip, with its compatibility
component and CSS also separate. Vite retains a large-primary-chunk advisory;
it is not suppressed. MapLibre earns its place as the primary renderer.

Measurements use the production build served by local `vite preview`, a fresh
installed headless Chrome profile, 1440 × 900, reduced motion and CDP encoded
network byte counts. Local preview headers and compression differ from Vercel.
The initial duration ends after network idle and vector-source readiness; it is
not a Core Web Vitals or real-device benchmark.

The first measurement found an unnecessary 3.36 MB geometry load before the
first destination. Deferring canonical/display cells reduced opening transfer
from 4.20 MB to **0.84 MB**, about **80%**. On the initial constrained run, opening
time fell from 25.3 seconds to 8.6 seconds. Matching geometry is deferred, not
removed; its first use remains a visible loading step and failures cannot confirm
locations.

Final measured values and raw evidence are in [unthrottled](review/performance.json)
and [constrained](review/performance-throttled.json) reports. The unthrottled run
recorded 837,002 initial encoded bytes in 18 requests, including two vector tile
requests totalling 91,355 bytes; opening took 1.266 seconds. The first search
transferred 3,599,262 bytes in four requests and completed in 291 ms locally.
The focused building view added one 25,091-byte vector tile. The tested terrain
view fetched 11 lazy DEM tiles, 480,938 encoded bytes, rather than the full pyramid.

With matching, hundreds of real building extrusions and terrain loaded, the
unthrottled drag sampled 60 frames: mean 16.26 ms, 95th percentile 16.8 ms,
maximum 17.0 ms. Whole-flow long tasks include loading, parsing and source
preparation, not only dragging: nine tasks, 1,693 ms total, maximum 809 ms.
There were no console errors. Non-fatal upstream road-shield null-filter warnings
were seen on some views and are not hidden by the test runner.

The constrained report uses four-times CPU slowdown, 150 ms latency, 200,000 B/s
downstream and 100,000 B/s upstream. It waits for matching cells and actual
building tiles before testing the full map interaction. Treat these finite
samples as local evidence, not guaranteed frame rates on every phone.

| Final production-preview sample | Unthrottled | Constrained |
|---|---:|---:|
| Opening transfer | 837,002 bytes | 837,014 bytes |
| Opening duration | 1.266 s | 8.577 s |
| First matching search duration | 0.291 s | 18.814 s |
| First search transfer | 3,599,262 bytes | 3,599,262 bytes |
| Focused-view vector tile transfer | 25,091 bytes | 25,098 bytes |
| Optional DEM transfer | 480,938 bytes | 480,938 bytes |
| Mean drag frame interval | 16.26 ms | 17.79 ms |
| 95th-percentile drag interval | 16.8 ms | 33.3 ms |
| Maximum sampled interval | 17.0 ms | 49.9 ms |
| Console errors | 0 | 0 |

The constrained first search remains an 18.8-second wait over this deliberately
slow local connection because canonical analysis is not yet cached. The loading
state is explicit and cannot display confirmed matches prematurely. This is a
material limit, not hidden behind the improved opening figure. The constrained
whole flow recorded 21 long tasks, 3,609 ms total, maximum 921 ms. Production CDN
compression/caching and real devices must be measured after an authorised release.

## Static transport and deployment limits

A real local terrain GET returned 200, `image/png`, 21,857 bytes. A Range request
returned 206 with `Content-Range: bytes 0-31/21857` and 32 bytes. XYZ tiles use
ordinary whole-tile requests; they do not depend on Range support. No city-wide
building GeoJSON or PMTiles archive is downloaded.

Local preview returned `Cache-Control: no-cache`, with no cross-origin header.
Terrain is same-origin, so special CORS is not required. The Vercel configuration
adds one-day terrain caching and one-hour data caching; actual deployed headers
remain a release-time check because production was not changed. Provider APIs
use `no-store`. See [HTTP evidence](review/http-headers.json) and
[deployment checklist](VERCEL_DEPLOYMENT.md).

## Remaining limits

- Local named-place search is not complete street-address geocoding. Exact pins and coordinates are available.
- TravelTime Basic is research/development/evaluation only. Persistent caching requires verified account rights; request caps are per instance. There is no paid-service substitution.
- Household sharing is portable copies, not live synchronisation. Precise links are readable by anyone holding them and have no expiry or revocation.
- Buildings are approximate OSM-derived rendering dimensions, potentially inferred from storeys. Terrain is bare-earth elevation, with disclosed flat padding outside measured pixels. Neither is a building survey.
- Must-haves, commute failures and source resolutions remain strict. Incident reporting is not a safety score. Peninsula incident/crash gaps, dated timetables, ZIP rent resolution and other inherited dataset limits remain.
- Existing CalEnviroScreen portal licence metadata is unresolved in the inherited manifest. Review its redistribution terms before a public release rather than claiming an explicit open-data licence that has not been established.
- No aerial imagery, custom DataSF/Overture footprint layer, live Railway household store or production deployment was added. Their absence does not interrupt the complete local/shareable decision workflow.
