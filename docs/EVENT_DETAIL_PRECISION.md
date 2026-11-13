# Reported incidents and injury-crash context

Reviewed 13 November 2026. These optional layers are descriptive context. They do not alter household commute gates or ranking.

The H3 resolution 8 overview remains. Enable **Show published intersection detail** or **Show published crash-location detail** for proportional markers at neighbourhood zoom (13.5 in MapLibre; 14 in Leaflet). Nearby locations are clustered through MapLibre zoom 14; zoom in to separate them. A cluster is a display grouping, not a newly measured geographical site. A shared published coordinate receives one count marker. Categories and month bounds apply to both the overview and detailed locations from the same deduplicated records. Source retrieval date, selected period and precision appear in the popup.

## Police incidents

Source: [SFPD Incident Reports, DataSF wg3w-h783](https://data.sf.gov/d/wg3w-h783). The [official SFPD data dictionary](https://data.sfgov.org/api/views/hje8-if2w/files/21f4d2ba-7925-422b-95e1-40620d16ca17?download=true&filename=POL-0008_DataDictionary.pdf) specifies intersection-level published locations. The portal identifies `incident_id` as an incident report identifier. Locations are anonymised, approximate and are never presented as an offence address or a building. No reverse geocoding, address inference or location jitter is applied.

The recorded source window is **1 October 2025 to 1 October 2026, end exclusive**, retrieved 21 October 2026. It is a fixed historical window, rather than a live rolling claim. Existing initial-report rules are preserved: II and VI report codes only, excluding supplements and the existing administrative/non-criminal categories. Source `incident_id` deduplicates multiple offence rows before any map aggregation. Each incident keeps the union of its categories and groups. Category counts can therefore overlap and need not sum to the incident total. Drug offences can reflect enforcement activity; reported incidents are incomplete and do not establish safety.

There are **49,311** unique counted incidents, of which **47,808** have valid in-bounds published coordinates, at **5,457** distinct coordinates. Unlocated/out-of-bounds incidents are omitted from both map views, rather than assigned invented locations. When a source incident has conflicting published coordinates, the first valid coordinate by stable `row_id` is used once; the builder records the conflict count in asset metadata. This map total can differ from a source total that includes unlocated incidents. It is not a claim that every offence is reported.

The audit found a specific pre-existing classification defect: pandas converted missing category text to NaN, while the old classifier excluded only None and empty strings. NaN therefore fell through to criminal `other`. There are **204** unique initial-report IDs with no qualifying known offence category; these had inflated the old 49,515 total and 48,012 mapped count. The shared classifier now treats every absent/non-string category, including NaN, as unknown and excludes those records from counted criminal reports. Eighty-one additional IDs have both a missing-category row and a known qualifying row: the known report remains counted once, and the unknown row supplies no invented category.

The canonical crime grid, neighbourhood summary, neighbourhood metrics and affected existing area-cell `incidents_per_km2` values were regenerated from these same accepted events and exact H3 source IDs. Uncovered source IDs and every Peninsula cell remain null, including when an SF coarse hexagon crosses the county boundary. The display footprint file contains only H3 identifiers and geometry, so there is no second density field to update. Ranking rules, measurement bands and commute gates are unchanged; the evidence correction can change a ranking that previously relied on inflated counts.

## Injury crashes

Source: **TransBASE.sfgov.org / SFDPH and SFPD**, [Traffic Crashes Resulting in Injury, DataSF ubvf-ztfx](https://data.sf.gov/d/ubvf-ztfx). The [official party table](https://data.sf.gov/d/8gtc-pjc6) and [victim table](https://data.sf.gov/d/nwes-mmgh) were inspected alongside crash-level schema metadata. Crash rows describe crashes; party rows describe participants and victim rows describe injured people. Joining these tables and summing repeated crash fields would multiply counts, so this implementation uses the sufficient published crash-level fields without a multiplying join.

The recorded crash window is **1 October 2023 to 1 October 2026, end exclusive**, refreshed from the same bounded window on 13 November 2026. `case_id_pkey` is the unique crash report number; `unique_id` is the table row identifier. The refresh adds the true report key that the old raw extract discarded. The bounded subset contained 8,942 rows and **8,941 unique crash reports**. One duplicate report was removed; **8,888** unique crashes have valid SF-bounds coordinates, at **6,126** distinct published coordinates.

`dph_col_grp` is officially defined as a grouping based on parties involved. The detailed description is mapped by explicit published group names, rather than a vague substring or assumptions based on location. In particular, Bicycle-Pedestrian and Vehicle-Bicycle-Pedestrian match both pedestrian and cyclist filters. Only Vehicle(s) Only Involved matches motor-vehicle-only. Unknown involvement stays unknown and is not folded into vehicle-only. Fatal/severe means the crash-level highest severity is Fatal or Injury (Severe); it can overlap every involvement filter. No fault determination is inferred.

`number_injured` counts non-fatal severe, visible and complaint-of-pain injuries. `number_killed` counts fatalities. Popups keep **crashes**, **people injured (non-fatal)** and **fatalities** distinct. Missing casualty values remain unknown. These are reported injury crashes, not property-damage-only crashes, and do not include every bicycle fall or unreported event. The source maps to simplified street centrelines and intersections, merges complex junction locations and excludes highway crashes. Recent quarters can be incomplete. Counts are affected by exposure and reporting.

The existing canonical `collisions_grid.geojson` and collision fields in neighbourhood metrics were rebuilt with the true report deduplication and independent involvement flags. The older pipeline made cyclist/pedestrian mutually exclusive and assigned unknown groups to vehicles. Its corrected code now uses the same shared pure classification function as the detail builder. Canonical eligibility and preference rules are unchanged.

## Coverage, assets and reproduction

Both feeds cover SF only. Compatible Peninsula evidence remains unavailable. Missing records do not mean zero and no SF value is projected into Peninsula communities. The datasets use PDDL, recorded in `data/sf/manifest.yaml`. Police data has 12 complete source months; crashes have 36. The user can select inclusive monthly bounds inside these fixed periods. The popup shows the exact selected monthly range. Public data can change retrospectively on refresh.

Data preparation happens outside application requests and frontend builds. The incident detail asset is approximately **1.38 MB** and `crash_details.json` is **552,673 bytes** before HTTP compression; the manifest records exact current bytes. They are lazy-loaded only when their layer is enabled. Monthly category bundles retain unique-event totals without shipping offence records, personal details or full historical source feeds. Venue and context layers continue to load independently. MapLibre and Leaflet use the same filtered aggregates. The compatibility renderer bounds detailed point drawing to the visible viewport and uses canvas; the primary MapLibre renderer also clusters nearby detail locations.

```powershell
# Rebuild all bounded event outputs from cached inputs, including corrected overview.
.venv/Scripts/python.exe -X utf8 scripts/build_event_details.py
# Refresh only the same bounded crash window, then rebuild.
.venv/Scripts/python.exe -X utf8 scripts/build_event_details.py --refresh-crashes
# Police refresh remains the existing explicitly bounded downloader.
.venv/Scripts/python.exe -X utf8 scripts/download_datasets.py --only police_incidents
.venv/Scripts/python.exe -X utf8 -m pytest tests/test_event_details.py
npm test -- src/map/layers/eventDetails.test.ts
node scripts/sync_public_data.mjs
```

The tested machine's Windows Application Control blocks the pre-existing native Python H3 extension. The new builder uses the standard `h3-js` development dependency via `scripts/event_h3.mjs` for exact H3 indexing and cell areas, with no H3 code shipped to the browser. It does not bypass the control or substitute approximate geometry. The nine pure Python event tests and four frontend aggregation tests pass. The general geospatial pipeline still requires a working native H3 environment; these results do not establish that the full Python suite passes.
