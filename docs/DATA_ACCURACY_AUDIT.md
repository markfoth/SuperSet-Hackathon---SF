# Data accuracy audit — 22 October 2026

Classification: **observation** = public-source records; **derived** = calculations from those records;
**approximation** = explicit model assumptions; **synthetic** = unsupported by an actual travel network.
The manifest retains source URLs, download dates, periods, licences and limitations.

| Application input | Classification | Actual resolution and limitations |
|---|---|---|
| Analysis neighbourhood boundaries | Observation | DataSF's 41 polygons, simplified by 5 m; names/content grouping only |
| H3 centres and access distances | Derived | H3 resolution 9; straight-line geographical access, not walking routes |
| Police incidents | Observation / derived | Anonymised intersection/block reports aggregated to H3 **8**; reporting and visitor biases; no address-level safety claims |
| Injury collisions | Observation / derived | Three-year reports, H3 **8**; traffic exposure is not controlled |
| Parks | Observation / derived | RPD and OSM polygons; proximity does not establish an accessible entrance |
| Transit stops and routes | Observation | GTFS geometry; departures are scheduled, not real-time reliability; public Muni feed expires 28 August 2026 |
| Cycling facilities | Observation / derived | SFMTA line segments; direction-specific lengths may count both sides; not a comfort or connectivity score |
| Groceries | Observation / derived | Volunteer-mapped OSM supermarket locations; completeness and current opening status unverified |
| Elevation raster | Observation / derived | USGS bare-earth elevation, exported/resampled to approximately 10 m in EPSG:26943; no surveyed road grades |
| Existing hills filter (superseded) | Derived, misleading proxy | Mean terrain slope within 170 m, then neighbourhood median; includes slopes alongside roads; unsuitable as street steepness |
| Street gradients | Derived | Official active DataSF centrelines + USGS DEM; rolling elevation differences along roads, not surrounding terrain; bridges/tunnels/retaining walls remain limitations |
| Transit commute fixtures | Approximation | Backwards GTFS graph, typical peak waits, assumed access/transfer walking and SFO AirTrain hop; expired Muni schedule disclosed |
| Walk, cycle, drive commute fixtures | **Synthetic** | Straight-line speed contours; retained only as explicitly labelled offline demonstrations, never verified travel times |
| Live commute polygons | Provider model | Inbound TravelTime arrival searches, server-side credentials; routing is estimated, not a travel-time guarantee |
| Population and rent paid | Observation / approximation | ACS 2020–24 tract estimates and margins of error; neighbourhood apportionment assumes uniform tract population |
| Pollution | Observation / derived | CalEnviroScreen tract indicators; neighbourhood means are population weighted; never independent H3 measurements; composite/vulnerability fields excluded |
| Asking rents | Observation / derived | Zillow monthly **ZIP** index; neighbourhood overlap estimates are not local quotes or H3 rent observations |
| Cafés, restaurants, bars | Observation | OSM context only; never ranked |
| Photos, descriptions and tags | Editorial | Commons photos with individual licences; own editorial drafts, not measured indicators |
| Residential eligibility | Approximation with evidence | Conservative park/street evidence only; no comprehensive parcel land-use source. Uncertain land use is flagged, not silently removed |

Baseline: 8 frontend tests, 27 Python tests, all validators and production build pass. Python
dependencies needed a local environment and permission to load native geospatial binaries.
No routing credentials were configured at baseline. User will supply them in gitignored `.env`.

Implementation rules: missing values remain JSON null; a missing hard measurement is **unknown**,
never a match. Coarse measurements retain their original source cell/tract/ZIP identifiers. Source
absence is never filled using a neighbourhood average disguised as a fine observation.
