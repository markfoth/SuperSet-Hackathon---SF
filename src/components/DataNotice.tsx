import { useModalFocus } from './useModalFocus';

// Source attribution and required licence notices. The SFMTA text is mandated
// by its Transit Data License Agreement §12 for derivative data.
export function DataNotice({ onClose }: { onClose: () => void }) {
  const focusRef = useModalFocus(onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section ref={focusRef} className="modal" id="about-data" role="dialog" aria-modal="true" aria-label="About the data" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close" onClick={onClose} aria-label="Close">×</button>
        <h2>About the data</h2>
        <p>Common Ground describes areas using open data. Figures are approximate, have different geographic resolutions, and none of them makes a place “safe” or “unsafe”.</p>
        <ul>
          <li><b>Neighbourhoods, police incidents, bike network, parks, injury crashes</b>; DataSF (ODC PDDL).</li>
          <li><b>Study region</b>; original SF analysis neighbourhoods and northern Peninsula groups retain their IDs. Added Census city/community groups intersect the 2020 urban footprint and 2025 shoreline-generalised place boundaries through Santa Clara and across the East Bay to Berkeley. Richmond is excluded. These are not verified residential parcels.</li>
          <li><b>Regional parks</b>; CPAD 2026a / GreenInfo Network, Creative Commons Attribution. Open-access ownership polygons; entrances and opening hours are unverified.</li>
          <li><b>Local incidents and injury crashes</b>; the SF feeds do not cover Peninsula areas. Missing local values are unavailable, never zero; city-wide annual reports are not assigned to individual hexagons.</li>
          <li><b>Transit</b>; commute examples retain BART, Caltrain and SamTrans schedules for 22 Oct 2026 and the older summer Muni model. Selected-location Muni service uses the August 2026 to January 2027 feed and its date-specific calendars. Neither is live reliability data.</li>
          <li><b>Street gradients</b>; U.S. Geological Survey 3DEP elevation and official SF / San Mateo County street centrelines. Rolling 40 m DEM estimates, not surveyed road grades.</li>
          <li><b>Residents and rent paid</b>; U.S. Census Bureau, American Community Survey 2020–2024 (tract).</li>
          <li><b>Air pollution</b>; CalEnviroScreen 5.0, California OEHHA (tract; pollution indicators only).</li>
          <li><b>Extra parks, supermarkets, cafés, restaurants, bars, pubs and nightclubs</b>: © OpenStreetMap contributors (ODbL). OpenFreeMap basemaps use OpenMapTiles and OpenStreetMap. Buildings use available OSM heights; missing heights may be inferred by the basemap and are not surveyed. Nightlife shows mapped venue density, not opening hours or attendance.</li>
          <li><b>Terrain</b>: continuous attributed Mapterhorn Terrarium tiles at actual scale (1×), independent of street gradients and match quality. No clipped DEM or artificial sea-level fill. Buildings are enabled where vector tiles contain height data. USGS / USDA satellite mode uses public-domain CONUS aerial imagery dated 2017–2021 according to the service; dates vary locally.</li>
          <li><b>Regional transport</b>; BART, Caltrain, SamTrans and VTA published GTFS, with separate feed dates. VTA open-data policy permits use without fees. AC Transit download was unavailable. Regional groceries, frequent-service and street-gradient measurements remain unknown where no complete extract exists.</li>
          <li><b>Rents</b>; Zillow Observed Rent Index (ZORI), Zillow Group. ZIP-level asking rents.</li>
          <li><b>Photos</b>; Wikimedia Commons; author and licence shown with each photo.</li>
          <li><b>Commute areas</b>; live TravelTime estimates when configured. Offline estimates: public transport from a GTFS schedule model; walking, cycling and driving are synthetic straight-line models.</li>
        </ul>
        <p className="legal">
          Muni data: Reproduced with permission granted by the City and County of San Francisco. The information has been provided by
          means of a nonexclusive, limited, and revocable license granted by the City and County of San Francisco. The City and County
          of San Francisco does not guarantee the accuracy, adequacy, completeness or usefulness of any information. The City and County
          of San Francisco provides this information “as is,” without warranty of any kind, express or implied, including but not
          limited to warranties of merchantability or fitness for a particular purpose, and assumes no responsibility for anyone’s use
          of the information.
        </p>
      </section>
    </div>
  );
}
