# Northern Peninsula coverage — 22 October 2026

Discovery now covers San Francisco through South San Francisco to SFO's southern edge
(37.60° N). The matching file contains **2,408 unique H3-9 cells**. SF retains its 41 analysis
neighbourhood ids; the extension has 17 county city/unincorporated grouping polygons.
Peninsula city groups are not presented as surveyed neighbourhood boundaries.

The extension includes Daly City, Colma, Brisbane, South San Francisco, San Bruno, Broadmoor,
and the parts of Pacifica, Millbrae and other jurisdictions inside the cutoff, including a small
northern Burlingame fragment. County ocean/bay and lakes are removed before generating land
cells. Dedicated airport, park, golf and quarry jurisdictions remain context and are excluded
from residential candidates. Uncertain residential land use remains disclosed.

## Sources and availability

| Data | Peninsula coverage |
|---|---|
| Boundaries / land | [County jurisdictions](https://gis.smcgov.org/maps/rest/services/ODP/Jurisdictions/FeatureServer/0), minus [ocean/bay](https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/38) and [lakes](https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/30), clipped at SFO |
| Streets / hills | [County streets](https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/26): 6,337 usable line parts; same USGS DEM, 40 m windows, length weighting and minimum coverage as SF. Not surveyed grades |
| Cycling | [County bikeways](https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/17), **Existing status only**. Proposed/unknown status omitted. Protected/lane/path/shared distinctions retained; completeness unverified |
| Parks | [County parks](https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/37) plus refreshed OSM polygons, deduplicated against existing park geometry. Straight-line access; entrances unverified |
| Transit | BART, Caltrain, Muni and **SamTrans**. The [official SamTrans developer download](https://www.samtrans.com/developer) needs no key and covers 20 September–14 November 2026. Bus stops, routes and weekday frequency included; Muni expiry disclosure retained |
| Groceries / food / drink | Study-area OSM supermarkets plus cafés/restaurants/bars refreshed through SFO. Food/drink is context only, never ranked; mapping completeness unverified |
| Population / rent paid | ACS 2020–2024 tracts including San Mateo County. Land-area apportionment is approximate, not an official city population count. Partially included county tracts retain their full census land-area denominator |
| Pollution | Actual containing CalEnviroScreen 5.0 tract; GEOID retained. Pollution indicators only; no demographic vulnerability/composite score |
| Asking rents | Actual containing ZCTA with Zillow ZORI ZIP series; source ZIP retained. Insufficient-listing ZIPs remain null. Brisbane has little ZORI coverage |
| Photos | Seven new local Wikimedia city photos, with credit/licence/source URL. Municipal context photos can show places outside the clip in partially included cities |
| Commutes | Live TravelTime inbound searches work throughout the extension. Offline fixtures rebuilt with SamTrans and the same water-free land; still labelled approximate/synthetic |
| Police incidents | **Unavailable locally.** The [SSF annual crime report](https://www.ssf.net/files/assets/public/v/1/police/flyers/2025/2024-pd-crime-stats.pdf) is a historical city-wide report, not a comparable geocoded 12-month cell feed. SFPD reports are not extended into Peninsula cells |
| Injury crashes | **Unavailable in the current local layer.** [County road-safety reports](https://ccag.ca.gov/plansreportslibrary-2/transportation/countywide-local-roadway-safety-plan/) use other historical periods and are not substituted for the SF TransBASE three-year feed |

Missing police/crash values are explicit nulls. A Must for fewer reported incidents makes
affected Peninsula cells **unknown**, never passing or excluded on a false zero. The layer
notes, selected-area details and About Data disclose these gaps. County update dates differ;
absence of a mapped facility does not prove no facility exists. Public county GIS has no
explicit redistribution licence in the inspected REST metadata; the manifest records this
and attributes San Mateo County. No public deployment was performed.

## Measured coverage

Counts include non-residential context cells. Rent values remain whole-ZIP measurements.

| Group | Cells | Usable street grades | Pollution value | ZIP rent value |
|---|---:|---:|---:|---:|
| South San Francisco | 233 | 209 | 233 | 225 |
| Daly City | 188 | 171 | 188 | 187 |
| Colma | 48 | 35 | 48 | 48 |
| Brisbane | 82 | 61 | 82 | 2 |
| San Bruno | 128 | 123 | 128 | 128 |
| Pacifica, included part | 202 | 103 | 201 | 201 |
| Millbrae, included part | 46 | 42 | 46 | 45 |

Overall, **1,877 cells** meet the gradient measurement thresholds. South San Francisco's mapped
context includes **13 cafés, 33 restaurants and 5 bars/pubs**, BART/Caltrain stations and SamTrans
bus service. These are snapshot counts, not an inventory guarantee.

## Rebuild and checks

The registry pages county ArcGIS responses past its 1,000-feature limit. Raw data stays
gitignored. `peninsula.py` adapts county schemas; the ordinary rebuild generates every output.

```powershell
.venv/Scripts/python.exe -X utf8 scripts/rebuild_all.py --offline
.venv/Scripts/python.exe -X utf8 scripts/validate_datasets.py
.venv/Scripts/python.exe -X utf8 -m pytest
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

For fresh raw data, omit `--offline`. SamTrans needs no added key; `API_511_KEY` remains optional
for current Muni / alternate feeds. Both gradient GeoJSON files load lazily and stay below
3 MB; matching data is approximately 2.50 MB. All processed GeoJSON files meet the 3 MB budget.

Desktop/mobile checks cover local Peninsula evidence, photo decoding, correct rental links,
Must/unknown handling and excluded borders. A separate live browser used a real South San
Francisco workplace: TravelTime returned an estimate, 10 SSF cells remained eligible under
all three workplaces, and no page errors occurred.
