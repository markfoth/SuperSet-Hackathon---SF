# Data catalogue

Status as of 2026-10-22. **Downloaded/processed** rows are recorded in
[`data/sf/manifest.yaml`](../data/sf/manifest.yaml) with counts, dates and limitations; licence
"verified" means the terms were read tonight. Candidate rows marked *verify* have not had their
endpoint or dataset ID checked; confirm before building.

Priority: **P0** core demo · **P1** valuable next · **P2** later · **Omit** not planned.

## In the build

| Dataset | Source | Priority | Resolution | Licence | Status | Complexity | Usage |
|---|---|---|---|---|---|---|---|
| Analysis Neighborhoods (41) | [DataSF j2bu-swwd](https://data.sf.gov/d/j2bu-swwd) (map view p5b7-5n3h) | P0 | Neighbourhood polygon | PDDL (verified) | Processed | Low | Content, grouping, boundaries |
| Canonical area cells (1,226) | H3 + existing processed sources | P0 | H3 **9**, clipped to SF land | Inherits inputs | Processed: `area_cells.geojson` | Medium | Commute eligibility, priorities, local evidence; coarse source ids retained |
| Active street centrelines | [DataSF 3psu-pn9h](https://data.sf.gov/d/3psu-pn9h), DPW | P0 | Street segments | PDDL (verified) | 16,378 active records, 14,585 usable line parts | Medium | Road-aligned DEM sampling, residential evidence |
| Police incident reports | [DataSF wg3w-h783](https://data.sf.gov/d/wg3w-h783) | P0 | Point (anonymised to intersection/block) → H3 res-8 + neighbourhood | PDDL (verified) | Processed: 49,515 incidents, 2025-10-01 → 2026-10-01 | Medium | Reported-crime layer and preference |
| SFMTA bike network | [DataSF ygmz-vaxd](https://data.sf.gov/d/ygmz-vaxd) | P0 | Street segment | PDDL (verified) | Processed: 5,499 segments | Low | Cycling layer, bike-lane preference, segment grade |
| Rec & Park properties | [DataSF gtr9-ntp6](https://data.sf.gov/d/gtr9-ntp6) | P0 | Polygon | PDDL (verified) | Processed | Low | Parks layer, park access |
| OSM parks (non-RPD) | OpenStreetMap via Overpass | P0 | Polygon | ODbL (verified) | Processed: 59 added | Medium | Presidio, GGNRA, state parks |
| BART GTFS | [bart.gov](https://www.bart.gov/schedules/developers/gtfs) | P0 | Stop / shape | BART developer licence (revocable; no trademarks) | Processed; valid to 2027-01-10, covers 22 Oct | Medium | Transit layer, rail access, commute model |
| Muni GTFS | [SFMTA](https://www.sfmta.com/reports/gtfs-transit-data) | P0 | Stop / shape | SFMTA Transit Data Licence — notice required (verified) | Processed; **expired 2026-08-28, labelled out-of-date** (no newer public feed; Mobility Database snapshots identical) | Medium | As above |
| Muni GTFS (current, via 511) | [511.org](https://511.org/open-data/transit) operator SF | P1 | Stop / shape | 511 developer terms | **Blocked: needs API_511_KEY** (wired; preferred automatically) | Low once keyed | Timetable covering 22 Oct |
| Caltrain GTFS | [Trillium-hosted official feed](https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip) | P0 | Stop / shape | Unresolved — attribute Caltrain | Processed; valid to 2027-01-31, covers 22 Oct | Medium | As above |
| SamTrans GTFS | [511.org](https://511.org/open-data/transit) (samtrans.com developer page is gone) | P1 | Stop / shape | 511 terms forbid redistribution without developer agreement | **Blocked: needs API_511_KEY** (a mirrored copy exists but was not used) | Low once keyed | SFO buses (292, 398, ECR) |
| Neighbourhood content | Editorial YAML + Wikimedia Commons | P0 | Neighbourhood | Text: own; photos CC/PD per photo | Processed: 41/41 photos, cached locally | Low | Detail panel |
| Commute fixtures | Derived (GTFS schedule model + synthetic) | P0 | H3 res-9 → polygons | Inherits GTFS | Processed: 32 polygons | Medium | Offline commute gate |
| Elevation (3DEP) | [USGS National Map](https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer) | P0 | ~10 m raster → 40 m street windows → H3-9 | Public domain (verified) | 1,013 cells have sufficient street coverage | Medium | Local street flatness; no terrain-average substitute |
| Supermarkets/greengrocers | OpenStreetMap | P1 | Point | ODbL | Processed: 208 | Low | Grocery access |
| Injury traffic crashes | [DataSF ubvf-ztfx](https://data.sf.gov/d/ubvf-ztfx) | P1 | Point → H3 res-8 + neighbourhood | PDDL | Processed: 3 years | Low | Crash layer, detail panel |
| Zillow ZORI by ZIP | [Zillow Research](https://www.zillow.com/research/data/) | P1 | ZIP (monthly 2015–2026-09) | Free with attribution; **derived redistribution unresolved** | Processed: 34 ZIPs | Low | Rent trend (asking rents) |
| ZCTA 2020 boundaries | [TIGERweb](https://tigerweb.geo.census.gov/) | P1 | ZIP approximation | Public domain | Downloaded (used for rents + land mask) | Low | ZIP ↔ neighbourhood overlap |
| ACS 2020-24 population & rent paid | [Census table-based summary files](https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/) B01003, B25064 (keyless; the API needs a key) | P1 | Census tract | Public domain | Processed: 310 tracts | Medium | Rents *paid*; per-resident crime rates |
| 2020 census tracts | [TIGERweb](https://tigerweb.geo.census.gov/) | P1 | Polygon | Public domain | Processed (clipped to study area) | Low | Geometry for ACS + CES |
| CalEnviroScreen 5.0 (final) | [data.ca.gov](https://data.ca.gov/dataset/calenviroscreen-5-0) CSV + data dictionary | P1 | Census tract | Unresolved ("not specified"); attribute OEHHA | Processed: pollution indicators only | Low | Air-pollution layer and detail panel |
| Cafés, restaurants, bars | OpenStreetMap (amenity=cafe/restaurant/bar/pub, shop=coffee) | P1 | Point | ODbL | Processed: 813 / 1,932 / 500 | Low | Discovery context (zoom >= 15), not ranked |

## Candidates

| Dataset | Source | Priority | Resolution | Licence | Status | Complexity | Usage |
|---|---|---|---|---|---|---|---|
| Street trees | DataSF "Street Tree List" (*verify* id tkzw-k3nq) | P1 | Point | PDDL | Deferred | Low | Leafy-streets preference |
| Tree canopy | USFS/NLCD Tree Canopy Cover | P2 | 30 m raster | Public domain | Deferred | Medium | Canopy share per neighbourhood |
| Transport noise (road/rail/air) | [BTS National Transportation Noise Map](https://www.bts.gov/geospatial/national-transportation-noise-map) | P1 | 30 m raster | Public domain | Deferred | Medium | Quiet-streets preference |
| SFO aircraft noise contours | SFO Noise Abatement Office (CNEL contours) | P2 | Contour polygon | Unresolved | Deferred | Medium | Airport noise near south/east SF & Peninsula |
| Fog / sunshine | USGS Pacific coastal fog & low-cloud frequency (Torregrosa et al.) — *verify* | P1 | ~1 km raster | Public domain (USGS) | Deferred | Medium | "Sunnier" preference (Mission vs Sunset) |
| FEMA flood zones | [FEMA NFHL](https://msc.fema.gov) | P1 | Polygon | Public domain | Deferred | Low | Hazard context |
| Sea-level-rise vulnerability | DataSF / SF Planning SLR zones — *verify* | P2 | Polygon | PDDL | Deferred | Low | Hazard context |
| 100-year storm flood risk | SFPUC map on DataSF — *verify* | P2 | Polygon | PDDL | Deferred | Low | Hazard context |
| Liquefaction / landslide zones | [CGS Seismic Hazard Zones](https://maps.conservation.ca.gov/cgs/EQZApp/) | P1 | Polygon | Public (CA) — verify | Deferred | Low | Seismic context |
| Soft-story buildings | DataSF Soft-Story program — *verify* | P2 | Parcel point | PDDL | Deferred | Low | Building-risk context |
| Population density (block) | Census 2020 DHC | P2 | Block | Public domain | Deferred (tract density done) | Medium | Finer density |
| Schools (locations) | [CDE Public Schools](https://www.cde.ca.gov/ds/si/ds/pubschls.asp) | P1 | Point | Public (CA) | Deferred | Low | Proximity |
| School performance | [CA School Dashboard](https://www.caschooldashboard.org/) | P2 | School | Public (CA) — verify | Deferred | High (SFUSD lottery ≠ catchment) | Context only; SF assignment isn't address-based |
| Healthcare | OSM (hospital/clinic/doctors/pharmacy); CA HCAI licensed facilities | P2 | Point | ODbL / CA open data | Deferred | Low | Proximity |
| Transit frequency | Derived from GTFS (done partly: weekday departures per stop) | P0 ✓ / P1 | Stop | GTFS terms | Partly processed | Low | Frequent-transit preference; peak headways next |
| Muni reliability | SFMTA performance data — *verify* | P2 | Route | Unresolved | Deferred | Medium | Context |
| Bike share stations | [Bay Wheels GBFS](https://gbfs.baywheels.com/gbfs/gbfs.json) | P2 | Point | Lyft licence — verify | Deferred | Low | Cycling context |
| Registered businesses | DataSF "Registered Business Locations" — *verify* id g8m3-pdis | P2 | Point | PDDL | Deferred | Medium | High-street vitality |
| 311 street cleanliness | DataSF 311 Cases — *verify* id vw6y-z8j6 | P2 | Point | PDDL | Deferred | Medium | Context (reporting-biased) |
| Air quality monitors | EPA AirData / AQS | P2 | Monitor point | Public domain | Deferred | Low | Context only (too sparse for neighbourhoods) |
| HUD Small Area FMR | [HUD SAFMR](https://www.huduser.gov/portal/datasets/fmr/smallarea/index.html) | P2 | ZIP | Public domain | Deferred | Low | Rent benchmark by bedroom count |
| Housing stock / tenure | ACS B25003, B25024, B25034 (bulk files, keyless) | P2 | Tract | Public domain | Deferred | Low | Character (renter share, building age) |
| Assessor secured roll | DataSF — *verify* | P2 | Parcel | PDDL | Deferred | High | Building age / type at fine resolution |
| Housing pipeline | SF Planning on DataSF — *verify* | P2 | Parcel | PDDL | Deferred | Medium | New-build supply |
| Peninsula city boundaries | Census Places / San Mateo County GIS | P1 | Polygon | Public | Deferred | Medium | Rank Daly City, South SF, San Bruno, Millbrae (D6) |
| Peninsula crime | San Mateo County agencies / FBI CDE | P2 | Agency / point (varies) | Varies | Deferred | High | Needed before ranking Peninsula areas |
| Short-term rentals | Inside Airbnb | Omit | Listing | CC BY 4.0 | — | — | Out of scope |
| Individual listings | Any portal | Omit | Listing | Proprietary | — | — | Not a listings site; link out instead |
