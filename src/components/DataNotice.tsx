// Source attribution and required licence notices. The SFMTA text is mandated
// by its Transit Data License Agreement §12 for derivative data.
export function DataNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" id="about-data" role="dialog" aria-label="About the data" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn close" onClick={onClose} aria-label="Close">×</button>
        <h2>About the data</h2>
        <p>Common Ground describes areas using open data. Figures are approximate, have different geographic resolutions, and none of them makes a place “safe” or “unsafe”.</p>
        <ul>
          <li><b>Neighbourhoods, police incidents, bike network, parks, injury crashes</b> — DataSF (ODC PDDL).</li>
          <li><b>Northern Peninsula through SFO</b> — San Mateo County GIS city/unincorporated boundaries, streets, existing bikeways, parks and coastline. Peninsula groups are cities or unincorporated areas; SF groups are analysis neighbourhoods. Coverage stops at SFO’s southern edge.</li>
          <li><b>Local incidents and injury crashes</b> — the SF feeds do not cover Peninsula areas. Missing local values are unavailable, never zero; city-wide annual reports are not assigned to individual hexagons.</li>
          <li><b>Transit</b> — BART, SFMTA (Muni), Caltrain and SamTrans GTFS schedules. BART, Caltrain and SamTrans timetables cover 22 Oct 2026; the public Muni timetable is from summer 2026.</li>
          <li><b>Street gradients</b> — U.S. Geological Survey 3DEP elevation and official SF / San Mateo County street centrelines. Rolling 40 m DEM estimates, not surveyed road grades.</li>
          <li><b>Residents and rent paid</b> — U.S. Census Bureau, American Community Survey 2020–2024 (tract).</li>
          <li><b>Air pollution</b> — CalEnviroScreen 5.0, California OEHHA (tract; pollution indicators only).</li>
          <li><b>Extra parks, supermarkets, cafés, restaurants, bars, pubs and nightclubs</b> — © OpenStreetMap contributors (ODbL). Background maps use OpenStreetMap for the hosted demo, or Stadia Maps / OpenMapTiles when configured; see the map attribution. Nightlife shows smoothed mapped venue density, not opening hours or attendance.</li>
          <li><b>Rents</b> — Zillow Observed Rent Index (ZORI), Zillow Group. ZIP-level asking rents.</li>
          <li><b>Photos</b> — Wikimedia Commons; author and licence shown with each photo.</li>
          <li><b>Commute areas</b> — live TravelTime estimates when configured. Offline estimates: public transport from a GTFS schedule model; walking, cycling and driving are synthetic straight-line models.</li>
        </ul>
        <p className="legal">
          Muni data: Reproduced with permission granted by the City and County of San Francisco. The information has been provided by
          means of a nonexclusive, limited, and revocable license granted by the City and County of San Francisco. The City and County
          of San Francisco does not guarantee the accuracy, adequacy, completeness or usefulness of any information. The City and County
          of San Francisco provides this information “as is,” without warranty of any kind, express or implied, including but not
          limited to warranties of merchantability or fitness for a particular purpose, and assumes no responsibility for anyone’s use
          of the information.
        </p>
      </div>
    </div>
  );
}
