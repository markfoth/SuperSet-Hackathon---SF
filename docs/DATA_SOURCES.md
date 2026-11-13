# Data sources and coverage

## Four different extents

- **Navigation:** hosted OpenFreeMap vectors and continuous Mapterhorn terrain extend beyond the study region. Map navigation does not promise analytical coverage.
- **Commute destinations:** the server accepts a bounded Bay Area routing envelope, 37.1-38.1 N and 123-121.5 W. A destination can be outside housing coverage, including Richmond.
- **Housing:** study_boundary.geojson is the union of the original SF/northern Peninsula land and named Census place polygons intersected with the 2020 urban footprint, minus 2025 TIGER area-water polygons. It is not a rectangular recommendation boundary. Richmond municipality and Santa Clarita are excluded. SF's Inner/Outer Richmond neighbourhoods retain their existing identities.
- **Individual sources:** each dataset has its own geography, dates and gaps. A visible basemap is not evidence of shops, incidents, public transport frequency or measured gradients.

The current study contains 89 area groups: 41 original SF analysis neighbourhoods, 35 Peninsula groups and 13 East Bay city/community groups. New city/community groups do not pretend to be neighbourhood subdivisions or residential parcels. All original IDs are retained; added places use Census GEOIDs. H3-9 IDs remain the matching identifiers.

Added places are Millbrae, Burlingame, Hillsborough, San Mateo, Foster City, Belmont, San Carlos, Redwood City, Atherton, Menlo Park, East Palo Alto, Palo Alto, Mountain View, Los Altos, Los Altos Hills, Sunnyvale, Cupertino, Santa Clara, Berkeley, Emeryville, Oakland, Alameda, San Leandro, San Lorenzo, Ashland, Cherryland, Castro Valley, Hayward, Union City, Newark and Fremont. Only their urban land participates. Original SF, Daly City, Brisbane, Colma, South San Francisco, San Bruno, SFO and county-community geography is preserved.

## Coverage matrix

"Unknown" is a missing measurement, not zero, low crime/pollution, a pass or a failed threshold. Exact per-area measured-cell coverage is also exported to [coverage-matrix.csv](verification/coverage-matrix.csv).

| Evidence | SF | Original northern Peninsula | Added Peninsula / Santa Clara | East Bay |
|---|---|---|---|---|
| H3-9 commute candidates | Yes | Yes | Yes, urban land | Yes, urban land |
| Fine grouping | Analysis neighbourhoods | City/county groups | City/community groups | City/community groups |
| Land/water | Existing masks | Existing coast/lake masks | Census shore + area hydrography | Census shore + area hydrography |
| Parks/access | SF/county/OSM | County/OSM | CPAD public access | CPAD public access |
| Groceries/food/nightlife | Original OSM extract | Original bounded extract | Unknown: regional extract failed | Unknown: regional extract failed |
| Rail/stops/routes | BART, Caltrain, Muni context | BART, Caltrain, SamTrans | Caltrain, BART where served, VTA, SamTrans | BART; AC Transit extract unavailable |
| Frequent-service metric | Original dated model | Original dated model | Unknown | Unknown |
| Cycling infrastructure | Existing SFMTA network | Existing county extract | Unknown outside original coverage | Unknown |
| Street gradients | Measured street windows | Measured where DEM/street coverage exists | Unknown | Unknown |
| Visual terrain | Continuous, normal scale | Continuous, normal scale | Continuous, normal scale | Continuous, normal scale |
| Asking-rent context | ZIP/ZCTA, where published | ZIP/ZCTA, where published | ZIP/ZCTA, where published | ZIP/ZCTA, where published |
| Pollution | Whole-tract CES indicators | Whole-tract CES indicators | Whole-tract CES indicators | Whole-tract CES indicators |
| Reported incidents / injury crashes | Published feeds, separate periods | Unknown | Unknown | Unknown |

## Sources, dates, resolution and rights

The authoritative machine-readable record is [data/sf/manifest.yaml](../data/sf/manifest.yaml). It records source geography, periods, resolution, licence, refresh process, output paths and gaps. The frontend [regional coverage report](../data/sf/processed/regional_coverage.json) records individual GTFS calendar dates and acquisition failures.

| Source | Period / resolution | Licence and refresh | Important limits |
|---|---|---|---|
| [DataSF boundaries](https://data.sf.gov/d/j2bu-swwd), San Mateo County GIS | Source neighbourhood / city / county boundaries | DataSF PDDL and existing county terms; explicit pipeline refresh | Original fine IDs retained; county groups are not SF neighbourhoods |
| [Census places](https://www.census.gov/geographies/mapping-files/2025/geo/carto-boundary-file.html), [2020 urban areas](https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Urban/MapServer), [area hydrography](https://www2.census.gov/geo/tiger/TIGER2025/AREAWATER/) | 2025 places at 1:500,000; 2020 urban footprint; 2025 area water | US public domain; refresh named CA places and three bounded county water extracts | Generalised boundaries are not parcels; unrecorded water remains possible |
| H3 matching/display | Resolution 9, about 0.1 square kilometre; stable parent-5 display partitions | Apache-2.0 and inherited input licences; regenerate after analytical inputs change | One representative point, not every address. Park-cut geometry is display only |
| [CPAD / GreenInfo Network](https://data.ca.gov/@california-natural-resources-agency/california-protected-areas-database) | 2026a public-access ownership polygons | Creative Commons Attribution; catalogue states no restrictions on public use; semiannual refresh | Excludes private/restricted holdings and easements. No entrance, opening-hours or barrier model. Access uses published polygons including nearby parks beyond housing land |
| [OpenStreetMap](https://www.openstreetmap.org/copyright), existing SFMTA/county cycling | Original dated bounded extracts; exact mapped features | ODbL and existing municipal terms; explicit source refresh | Regional Overpass requests failed/rate-limited. Missing areas remain unknown; no distant SF feature is substituted as regional absence |
| Agency GTFS | Stops and route shapes; dates below | Agency developer licences / VTA open-data policy; explicit downloads, calendar inspection and repacking | Context is not routing, reliability, live positions or a frequent-service estimate |
| USGS 3DEP + official street centrelines | Original roughly 10 m DEM and 40 m street-aligned windows | US public domain plus street-source terms; explicit rebuild | No gradients outside measured coverage; see STREET_GRADIENT_METHOD.md |
| [Mapterhorn](https://mapterhorn.com/attribution/) | Continuous 512 px Terrarium z0-12, overzoomed at street scale | Attributed source licences, including USGS public domain and Copernicus open licence; refresh metadata explicitly | Rendering only, source years/datums vary. Best-effort external service; no clipped DEM replacement |
| [USGS/USDA aerial imagery](https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer) | Service lists CONUS 2017-2021 acquisitions; mostly 1 m source imagery, variable; XYZ z0-16 | CONUS public domain; [USGS service use](https://www.usgs.gov/software/webmap-interactive-web-maps-using-national-map-tnm-services) permits unrestricted use; attribution retained | Not current imagery. June 2024 cache refresh is not acquisition. Browser CORS and regional coverage verified. No per-client rate allowance/SLA found; request only visible tiles, eight parallel image requests maximum; no mosaic download |
| Zillow ZORI + Census ZCTAs | September 2026 all-type asking index; ZIP/ZCTA | Existing Zillow terms, attribution and Census public domain; refresh raw table and ZCTAs | Not listing/bedroom-specific rent, rent paid or a fine-cell estimate |
| OEHHA CalEnviroScreen 5.0 | Indicator-specific, mostly 2019-2024; whole 2020 tracts | OEHHA attribution retained; original portal licence remains unresolved; refresh on release | Pollution indicators only; no composite/vulnerability score or interpolation. Geometry clipping does not make values local. Fixed colour scales, never viewport-normalised |
| [SFPD incident reports](https://data.sf.gov/d/wg3w-h783) | 1 Oct 2025 to 30 Sep 2026, selected complete months; anonymised published intersections | DataSF PDDL; refresh and rebuild deduplicated bundles/column geometry | Unique incident IDs, not offence rows. Offence categories can overlap. Missing/unmapped records are not allocated elsewhere. SF only |
| [SF TransBASE injury crashes](https://data.sf.gov/d/ubvf-ztfx) | 1 Oct 2023 to 30 Sep 2026; published intersections/centrelines | DataSF terms; explicit refreshed crash input and bundle builder | True crash ID deduplication; people injured/fatalities differ from crash count; highways excluded by source |
| Local essentials, detailed Muni service, FEMA flood context | Original bounded extract; source-specific dates/calendars | Existing licences/notices retained in manifest and UI | These extra local panels do not gain regional coverage merely because housing expands |

## Transport feed inspection

| Agency | Published calendar range inspected | Result / terms |
|---|---|---|
| [BART](https://www.bart.gov/schedules/developers/gtfs) | 10 Aug 2026 to 10 Jan 2027 | Public static feed; developer agreement; attributed, no branding copied |
| [Caltrain](https://www.caltrain.com/developer-resources) | 31 Jan 2026 to 31 Jan 2027 | Public Trillium feed; existing developer terms |
| [SamTrans](https://www.samtrans.com/developer) | 20 Sep to 14 Nov 2026 | Keyless public feed; permission to use/reproduce/redistribute, as-is. It does not cover the next Monday arrival used in live verification |
| [Muni](https://www.sfmta.com/reports/gtfs-transit-data) | Overview/fixture feed 23 Jul to 28 Aug 2026 | Expired and labelled. Separate detailed-service extract uses 29 Aug 2026 to 15 Jan 2027 calendars. Required SFMTA notice remains in DataNotice.tsx |
| [AC Transit](https://www.actransit.org/data-api-resource-center) | Not verified because current-feed download failed | [Terms](https://www.actransit.org/data-terms-and-conditions/) permit attributed use/reproduction/redistribution with disclaimers. Do not claim a timetable or fill the bus gap with another agency |
| [VTA](https://gtfs.vta.org/) | 26 Oct 2026 to 10 Jan 2027 | Public feed; [VTA policy](https://s3-us-west-2.amazonaws.com/gis-open-data-portal/Open_Data_Policy.pdf) permits use without licence/fee requirements. Route types identify light-rail stops; no bus stop is silently treated as rail |

Live TravelTime routing is separate from these committed context feeds. Its successful next-weekday response does not certify that a local GTFS extract covers that day. No paid account, card requirement or new provider plan was introduced.

## Municipal incidents and crashes investigated

Oakland publishes a rolling 90-day CrimeWatch extract and separate reports. Berkeley publishes crime/calls-for-service material. These are not automatically comparable with the selected SFPD initial-report window/definitions/precision. State SWITRS is a separate crash source with its own access and reporting process. This iteration does not manufacture a uniform cross-city series. Non-SF incident/crash fields remain null and block a corresponding Must-have rather than imply low counts.

## Reproduce and refresh

Heavy preprocessing is explicit and stays outside requests/builds. Raw inputs are cached under ignored data/sf/raw. Every new download is individually bounded, with no regional aerial mosaic, planet building extract or unbounded live query.

```powershell
# Original fine geography, measurements, offline fixtures and content:
.venv/Scripts/python.exe -X utf8 scripts/rebuild_all.py --offline
# Regional pipeline and worker/browser inputs:
.venv/Scripts/python.exe -X utf8 scripts/build_region.py
.venv/Scripts/python.exe -X utf8 scripts/build_regional_context.py
.venv/Scripts/python.exe -X utf8 scripts/build_regional_parks.py
.venv/Scripts/python.exe -X utf8 scripts/pack_region.py
.venv/Scripts/python.exe -X utf8 scripts/pack_context.py
node scripts/build_crime_columns.mjs
.venv/Scripts/python.exe -X utf8 scripts/validate_datasets.py
.venv/Scripts/python.exe -X utf8 -m pytest
```

Builders reuse cached downloads. Refresh only the specifically named cached source files, then rerun the dependent builders. build_regional_context.py --measure-only recomputes access from existing processed context without network downloads; run CPAD parks afterwards, then both packers. Original fixture dates remain deliberate historical examples. Do not rebuild while browser tests are reading outputs.

On this host Windows Application Control blocked the pre-existing H3 4.5 binary. Verification used an isolated ignored H3 4.3.1 wheel under data/cache/python, with PYTHONPATH set to that directory. This does not change frontend H3-9 resolution or cell IDs. A normal fresh environment can install requirements.txt; do not replace the user's environment files.
