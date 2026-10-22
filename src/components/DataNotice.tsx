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
          <li><b>Transit</b> — BART, SFMTA (Muni) and Caltrain GTFS schedules. BART and Caltrain timetables cover 22 Oct 2026; the public Muni timetable is from summer 2026.</li>
          <li><b>Elevation</b> — U.S. Geological Survey 3D Elevation Program.</li>
          <li><b>Residents and rent paid</b> — U.S. Census Bureau, American Community Survey 2020–2024 (tract).</li>
          <li><b>Air pollution</b> — CalEnviroScreen 5.0, California OEHHA (tract; pollution indicators only).</li>
          <li><b>Extra parks, supermarkets, cafés, restaurants, bars</b> — © OpenStreetMap contributors (ODbL); map tiles © Stadia Maps / OpenMapTiles.</li>
          <li><b>Rents</b> — Zillow Observed Rent Index (ZORI), Zillow Group. ZIP-level asking rents.</li>
          <li><b>Photos</b> — Wikimedia Commons; author and licence shown with each photo.</li>
          <li><b>Commute areas</b> — offline estimates: public transport from a GTFS schedule model; walking, cycling and driving are synthetic straight-line models.</li>
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
