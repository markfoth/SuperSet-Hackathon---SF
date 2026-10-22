# Area labels and card photos

Display names may differ from source jurisdiction names. Stable ids and boundaries do not
change, so saved areas, H3 parents and source joins remain valid. Editorial `display_name`
overrides live in `data/sf/content/neighbourhoods.yaml`; the content builder retains
`source_name` and an optional rental-search name. The app applies the same name to map,
cards, local cells, details and comparisons.

| Source group | Display name | Meaning |
|---|---|---|
| Unincorporated Colma | Colma station area | County pocket around Colma BART, separate from the incorporated Town of Colma. Rental queries use Colma. |
| Northern Peninsula unincorporated areas | San Bruno hills & county land | Combined residual county boundary; not one neighbourhood or a verified residential district. Rental queries use San Bruno. |
| Broadmoor / Country Club Park | Names retained | Named county communities, rather than city neighbourhoods. |

The county identifies a Colma BART Station Area Plan in its
[planning documents](https://www.smcgov.org/planning/codes-ordinances-and-regulations).
Its [unincorporated community layer](https://gis.smcgov.org/maps/rest/services/PLANNING/PLN_LAYERS_DMZ/MapServer/20)
explains the residual group: intersecting that layer with the existing 3.522 km² app boundary
finds approximately **2.518 km² San Francisco Watershed Lands** and **0.976 km² San Francisco Jail**.
The display name is a geographic description, not a claim that this is an official new
neighbourhood. The original generic source label remains in the content metadata.

All **53 residential content groups** now have credited, locally cached images. Five
airport/golf/quarry/park context groups are non-residential, have no ranked photo cards,
and retain no photo. Every photo stores its Commons file page, author and licence;
credits appear on cards and in detail views.

The five new residential images are:

| Group | Photo context |
|---|---|
| Broadmoor | Nearby Westmoor Park, Daly City; explicitly captioned as nearby. |
| Burlingame | Burlingame Avenue in September 2002; explicitly captioned as dated city context outside the clipped northern fragment. |
| Country Club Park | Nearby See’s Candies headquarters, South San Francisco; explicitly captioned as nearby. |
| Colma station area | Colma BART station, July 2023. |
| San Bruno hills & county land | Sweeney Ridge panorama; captioned as surrounding hills. |

These are licensed real photographs. Nearby landmark photos do not claim to depict
residential streets within the selected boundary. Run `scripts/build_content.py` to
reproduce metadata and local caches; previously fetched licences are cached under ignored
`data/sf/raw/_wikimedia_cache.json`.
