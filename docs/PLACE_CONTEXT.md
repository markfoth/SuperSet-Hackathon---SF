# Places and neighbourhood character

The food layer contains cafes and restaurants. Bars, pubs and nightclubs belong to nightlife, alongside its existing fixed-bandwidth density picture. A venue is not drawn twice in food and nightlife. POIs remain discovery context and never enter housing rankings.

MapLibre fetches each layer only when enabled. A single source per layer clusters at city scale through tile zoom 12, shows individual points earlier than the former zoom-15 threshold, and adds collision-aware names at zoom 14. Cluster and individual filters are mutually exclusive, so cluster totals do not double-count the dissolving markers. Source OSM IDs deduplicate merged food features, while different venues at the same coordinate remain separate. Names and labels are interactive before underlying polygons. Nightlife density remains a concentration of mapped establishments, not observed street activity, noise or opening hours.

## Useful links

Preprocessing retains source identifiers, addresses, HTTP(S) website tags, telephone, mapped opening hours, wheelchair tags, contributor check dates and snapshot dates. External strings use `textContent`. Both Python and browser code reject active-content schemes, relative URLs, embedded credentials and control characters. Websites supplied by OSM are labelled **Venue website (listed in OSM)**. Missing websites show a clearly labelled web search and the OSM source page rather than a guessed official URL.

Four venue/address associations were manually checked on 13 November 2026 and are keyed by exact OSM ID, source name and street address in `data/sf/content/poi_verified_websites.json`:

- [Caffe Trieste](https://caffetrieste.com/) explicitly lists 601 Vallejo Street, San Francisco. The home page contains older posts, so this verifies association rather than today's hours.
- [Safeway's King Street branch](https://local.safeway.com/safeway/ca/san-francisco/298-king-st.html) lists 298 King Street, San Francisco and the matching telephone.
- [Woods Lowside](https://www.woodsbeer.com/lowside) lists 530 Haight Street and the matching telephone. Its official hours differ from the OSM snapshot; users are directed to check the venue page.
- [Mezze and Mooore](https://www.mezzeandmooore.com/) lists 198 Guerrero Street separately from its Irving Street branch.

Only these checked associations receive **Official website** and a review date. They do not establish every source tag is current. Renewing a raw snapshot will require a full spatial rebuild to add or remove venues. The bounded metadata command enriches existing output points without changing their inclusion or coordinates:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/enrich_place_context.py
```

It matches an existing OSM ID or an unambiguous name/category/rounded-coordinate combination. Ambiguous matches stay without contact enrichment. This command also works without native geospatial DLLs. The full processing steps now preserve the same contact fields:

```powershell
.venv/Scripts/python.exe -X utf8 scripts/download_datasets.py --only osm_food_drink osm_groceries osm_nightlife
.venv/Scripts/python.exe -X utf8 scripts/process_datasets.py --only pois groceries nightlife
node scripts/sync_public_data.mjs
```

## Editorial character layer

The reviewable source is `data/sf/content/neighbourhood_character.json`. It contains 12 areas, 23 source records and six explicit research gaps. Its lazy output is `neighbourhood_character.geojson`: 19 district/broad labels, 35,407 bytes before compression. Wider views use broader summaries of the same reviewed areas; closer views use corridor descriptions. They are editorial anchors, not surveyed boundaries.

The review is manual aspect analysis across food, nightlife, arts/retail, residential form, parks/waterfront and office/industrial uses. Every published label has at least two independently authored publisher groups. Syndicated copies count once. Source records keep URLs, known publication dates, review dates, source type, evidence notes and publisher groups. Null publication dates mean the reviewer could not verify a publication date. Evidence strength is descriptive, without invented numerical confidence. No overall sentiment score is calculated.

The dataset combines tourism material and official planning with local organisations and independent journalism. Promotional superlatives are excluded. Older journalism is used cautiously to corroborate enduring corridors or physical features, with explicit limitations. Brisbane has limited recent independent reporting and says so. Unsupported areas including Westlake, Colma, Broadmoor and the San Bruno hills remain in a research queue rather than receiving fabricated descriptions. Public discussions were considered as subjective research context but are not needed to support these factual amenity labels.

Examples include [Calle 24's district information](https://www.calle24sf.org/) with [Axios reporting](https://www.axios.com/local/san-francisco/2025/10/10/sf-mission-calle-24-latino-culture-legacy), [Daly City's legacy registry](https://dalycity.org/1205/Legacy-Business-Registry) with [KQED's local food history](https://www.kqed.org/bayareabites/133626/how-has-the-bays-filipino-food-scene-changed-just-ask-daly-citys-chel-gilla), and [San Bruno's streetscape plan](https://www.sanbruno.ca.gov/DocumentCenter/View/1688/San-Mateo-Avenue-Conceptual-Streetscape-Plan-PDF) with [independent local reporting](https://localnewsmatters.org/2025/08/15/san-bruno-in-spotlight-during-victorian-days-walking-tours/). Complete supporting evidence and limitations travel with each label and appear in its popup.

```powershell
# Review and edit the source JSON first, then regenerate the static output.
.venv/Scripts/python.exe -X utf8 scripts/build_neighbourhood_character.py
.venv/Scripts/python.exe -X utf8 -m pytest tests/test_place_context.py
npx.cmd vitest run src/map/layers/placeContext.test.ts
```

The builder validates independent corroboration, stable IDs, label length, review status, URLs and study-area anchors. Descriptions concern places and amenities. They do not classify residents by ethnicity or class, infer safety, measure noise, or affect ranking. No model service or runtime API is involved.

## Compatibility and measured assets

`buildLeafletPlaces` provides the compatibility renderer with the same data, safe popups, low-zoom marker aggregation and collision-filtered street labels. MapLibre remains the primary renderer. The fallback does not emulate 3D terrain/building geometry.

Processed feature counts are unchanged by contact enrichment: cafes 893, restaurants 2,125, bars 532, groceries 200, nightlife venues 570. Assets are respectively 434,235; 1,083,982; 255,006; 101,472; and 275,124 bytes before compression. Food loads only the cafe/restaurant files, and nightlife uses its own deduplicated venue file. Neither reads the bars file at runtime. These are bounded layer payloads, not startup downloads.
