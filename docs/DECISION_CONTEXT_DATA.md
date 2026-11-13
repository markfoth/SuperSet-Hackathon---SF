# Decision context sources

Three bounded processed improvements are integrated into selected-location and home details. They are not ranking inputs. Existing groceries, parks, street gradients, stops, dated fixtures, rent indices, incidents and pollution were inventoried in [manifest.yaml](../data/sf/manifest.yaml) before adding sources.

Downloads: 13 November 2026 UTC, still 12 November Pacific. Each asset includes publisher, exact URL, licence, download date, observation period, bounds, units and limits. Cached rebuilds retain the input file date. Sizes below are uncompressed.

| Asset | Actual content | Coverage, observation and units | Rights and source |
| --- | --- | --- | --- |
| `daily_essentials.json` |1,372 records, 192,295 bytes; food shops, pharmacies, libraries, gyms, markets, parks and nine mapped entrances |[-122.55,37.60,-122.33,37.84], WGS84 points/polygon centres. OSM snapshot 2026-11-13T07:36:31Z. Distances in metres, not walking time. |OSM contributors,[ODbL](https://www.openstreetmap.org/copyright). Bounded [Overpass query](https://overpass-api.de/api/interpreter), exact query in builder. |
| `muni_service.json` |3,240 stops, 2,588,718 bytes; calendars, exceptions, service/hour counts including 24+ hours |Same bounds, stop-level schedule context. Feed `SFMTA_GTFS_20260829_20270115v2.zip`. Scheduled departures, not live reliability. |[SFMTA Transit Data Licence](https://www.sfmta.com/reports/gtfs-transit-data); required notice remains in About the data. [Official metadata](https://data.sf.gov/api/views/dni7-qpv3.json),[downloaded blob](https://data.sf.gov/api/views/dni7-qpv3/files/ba275feb-bf3d-46ed-b527-dd42555fcd8d?download=true). |
| `flood_context.json` |546 polygons, 657,191 bytes; original `FLD_ZONE`, `ZONE_SUBTY`, `SFHA_TF`, `DFIRM_ID` |Same bounds; effective FIRM zones, clipped and simplified approximately 3 m. Effective dates vary by panel. |FEMA [NFHL layer28](https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28). [Publisher licence record](https://catalog.data.gov/dataset/national-flood-hazard-layer) explicitly links [US government works](https://www.usa.gov/government-works). Attribute FEMA. Generic OpenFEMA terms returned 403 and were not used as proof of NFHL rights. |

Display terrain is also improved, with separate underlying-source rights and actual HTTP checks in [3D repair](3D_RENDERING_FIX.md). No bulk display-tile download is performed.

## Rebuild and refresh

```powershell
.venv/Scripts/python.exe -X utf8 scripts/build_decision_context.py
.venv/Scripts/python.exe -X utf8 scripts/build_decision_context.py --refresh --dataset amenities transit flood
.venv/Scripts/python.exe -X utf8 -m pytest tests/test_decision_context.py
.venv/Scripts/python.exe -X utf8 scripts/validate_datasets.py
node scripts/sync_public_data.mjs
```

Use `--dataset amenities`, `transit` or `flood` individually. Raw responses are cached in ignored `data/sf/raw/regional`. Source failure stops publication. No account or key is used; frontend builds only copy processed assets.

OSM includes selected amenities, food-shop categories and fitness centres. Entrances must be tagged nodes belonging to a mapped park boundary way, with private/no access excluded. Building entrances are not relabelled as parks. Named duplicate point/area representations within 30 m are merged. Centres remain separate from entrances. A first expanded request returned502; a later retry succeeded. No Overpass requests run in the browser.

GTFS joins trips to service IDs and counts stop times by hour. Blank times are skipped, never converted to midnight. Weekday calendars, exceptions and previous-day overnight service are applied against the selected Pacific service date. No active calendar means unknown evidence. Opposite-direction stops remain separate.

FEMA returns a complete bounded inventory of 547 IDs. Missing/duplicate inventories, transfer-limit flags and incomplete 100-ID batches fail validation. Geometry is repaired, clipped and topology-preserving simplified; GeometryCollections retain polygonal pieces only. One boundary-only intersection has zero polygon area, leaving 546 valid polygons without changing categories.

## Limits and omissions

Missing opening hours/accessibility stay null. No nearby mapped record means unknown provision. Nine entrances are sparse and not surveyed accessible routes; park centres are not entry points. No verified barrier-aware walking network was introduced.

Fresh service is Muni only. This dataset does not rebuild old commute fixtures/H3 frequency indicators or assert fresh SamTrans, BART or Caltrain coverage. Those agencies remain an outstanding freshness gap. The 2.59 MB file is lazy, outside opening transfer.

NFHL is effective regulatory mapping, not a property survey or insurance determination. No intersecting polygon does not establish no exposure. [NOAA](https://coast.noaa.gov/digitalcoast/data/flood.html) confirms its effective-FIRM/revision basis. Download dates are not panel effective dates, and simplified boundary cases need official-source checks.

Successful sources survive another source's failure, with independent unknown state and retry. Outside-extract pins are explicit. Sparse Peninsula evidence is never a favourable zero. No aircraft-noise contours, aerial imagery, new building extract or heat layer were shipped: candidate portals are not evidence of a usable licensed asset. Viewport OSM buildings were retained after regional tests; no demonstrated quality gain justified a duplicate Overture extract.

The [SFO Noise Office page](https://noise.flysfo.com/data-reports/) was inspected: it links monthly dashboards, reports and a flight tracker, including 29 permanent monitoring stations. No licensed machine-readable street-level contour asset was established from that page, and station readings/report images were not converted into residential values. The [San Mateo GIS download page](https://www.smcgov.org/tsd/gis-data-download) lists daily exported building footprints, natural features and landmarks; this alone does not establish height semantics, park accessibility or redistribution rights. The [Overture building guide](https://docs.overturemaps.org/guides/buildings/) distinguishes buildings/parts and publishes them under ODbL with OSM prioritised. No comparative gain was established that justified adding another geometry source. Existing tree records remain an inventory, not a new canopy or air-temperature measurement.
