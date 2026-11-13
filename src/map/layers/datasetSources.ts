export const DATASET_SOURCES: Record<string, { label: string; url: string }[]> = {
  flat: [{ label: 'USGS 3DEP', url: 'https://www.usgs.gov/3d-elevation-program' },
    { label: 'SF streets', url: 'https://data.sf.gov/d/3psu-pn9h' },
    { label: 'County streets', url: 'https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/26' }],
  topography: [{ label: 'USGS 3DEP', url: 'https://www.usgs.gov/3d-elevation-program' }],
  transit: [{ label: 'BART', url: 'https://www.bart.gov/schedules/developers/gtfs' },
    { label: 'Muni', url: 'https://www.sfmta.com/reports/gtfs-transit-data' },
    { label: 'Caltrain', url: 'https://www.caltrain.com/developer' },
    { label: 'SamTrans', url: 'https://www.samtrans.com/developer' },
    { label: 'VTA', url: 'https://gtfs.vta.org/' }, {label:'AC Transit source (extract unavailable)',url:'https://www.actransit.org/data-api-resource-center'}],
  parks: [{ label: 'SF parks', url: 'https://data.sf.gov/d/gtr9-ntp6' },
    { label: 'County parks', url: 'https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/37' },
    { label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }, {label:'CPAD / GreenInfo Network',url:'https://www.calands.org/'}],
  crime: [{ label: 'SFPD incident reports', url: 'https://data.sf.gov/d/wg3w-h783' }],
  cycling: [{ label: 'SFMTA bikeways', url: 'https://data.sf.gov/d/ygmz-vaxd' },
    { label: 'County bikeways', url: 'https://gis.smcgov.org/maps/rest/services/Common/SanMateoCounty_Basemap/MapServer/17' }],
  groceries: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
  food: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
  nightlife: [{ label: 'OpenStreetMap', url: 'https://www.openstreetmap.org/copyright' }],
  character: [{label:'SF cultural districts',url:'https://www.sf.gov/cultural-districts'},{label:'Peninsula place sources in each label',url:'https://www.brisbaneca.org/'}],
  air: [{ label: 'OEHHA CalEnviroScreen 5.0', url: 'https://oehha.ca.gov/calenviroscreen' }],
  collisions: [{ label: 'SF TransBASE', url: 'https://transbase.sfgov.org/' }],
};

export function preferenceSources(id: string) {
  return DATASET_SOURCES[id === 'frequent' || id === 'rail' ? 'transit' : id === 'lowCrime' ? 'crime' : id] ?? [];
}
