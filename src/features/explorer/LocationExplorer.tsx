import { useEffect, useState } from 'react';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import { loadData } from '../../lib/data';

interface Place { id:string; name:string; kind:string; lat:number; lon:number; hours?:string|null; }
interface Stop { id:string; name:string; lat:number; lon:number; departures:number[][]; }
interface SourceMetadata { downloaded_at:string; observation_period:string; source_url:string; }
interface Essentials extends SourceMetadata { places:Place[]; }
interface Service extends SourceMetadata { stops:Stop[]; services:string[]; calendar:Record<string,string>[]; exceptions:Record<string,string>[]; }
export function proximity(a:{lat:number;lon:number},b:{lat:number;lon:number}) {
 const r=Math.PI/180, x=(a.lon-b.lon)*r*Math.cos((a.lat+b.lat)*r/2), y=(a.lat-b.lat)*r;
 return Math.hypot(x,y)*6371000;
}
export function activeService(data:Pick<Service,'calendar'|'exceptions'>,day:string) {
 const compact=day.replaceAll('-',''), weekdays=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
 const weekday=weekdays[new Date(day+'T12:00:00Z').getUTCDay()];
 const ids=new Set(data.calendar.filter(c=>c.start_date<=compact && c.end_date>=compact && c[weekday]==='1').map(c=>c.service_id));
 for(const e of data.exceptions.filter(e=>e.date===compact)) {if(e.exception_type==='1')ids.add(e.service_id);else ids.delete(e.service_id);}
 return ids;
}
export function LocationExplorer({lat,lon}:{lat:number;lon:number}) {
 const [essentials,setEssentials]=useState<Essentials|null>(null),[service,setService]=useState<Service|null>(null),[flood,setFlood]=useState<(FeatureCollection<Polygon|MultiPolygon>&SourceMetadata)|null>(null),[error,setError]=useState('');
 const [attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 const [day,setDay]=useState(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles'}).format(new Date())),[hour,setHour]=useState(8);
 useEffect(()=>{let cancelled=false;setLoading(true);setError('');
   Promise.allSettled([loadData<Essentials>('daily_essentials.json'),loadData<Service>('muni_service.json'),loadData<FeatureCollection<Polygon|MultiPolygon>&SourceMetadata>('flood_context.json')]).then(([p,s,f])=>{
     if(cancelled)return;
     setEssentials(p.status==='fulfilled'?p.value:null);setService(s.status==='fulfilled'?s.value:null);setFlood(f.status==='fulfilled'?f.value:null);
     const missing=[p.status==='rejected'?'essentials':'',s.status==='rejected'?'Muni':'',f.status==='rejected'?'flood':''].filter(Boolean);
     setError(missing.length?`Unavailable sources: ${missing.join(', ')}. This context is unknown; matching is unchanged.`:'');setLoading(false);
   });return()=>{cancelled=true;};},[attempt]);
 const covered=lat>=37.60&&lat<=37.84&&lon>=-122.55&&lon<=-122.33;
 if(!covered)return <section className="location-explorer"><h3>Local evidence coverage</h3><p>Outside the daily-life extract. The surrounding map is context, not a recommendation region.</p></section>;
 const nearby=(essentials?.places||[]).map(p=>({...p,distance:proximity({lat,lon},p)})).filter(p=>p.distance<2000).sort((a,b)=>a.distance-b.distance);
 const active=service?activeService(service,day):new Set<string>();
 const previous=new Date(day+'T12:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);
 const previousActive=service?activeService(service,previous.toISOString().slice(0,10)):new Set<string>();
 const stops=service?.stops.map(s=>({...s,distance:proximity({lat,lon},s),count:s.departures.reduce((n,[id,h,c])=>n+((h===hour&&active.has(service.services[id]))||(h===hour+24&&previousActive.has(service.services[id]))?c:0),0)})).filter(s=>s.distance<800).sort((a,b)=>a.distance-b.distance).slice(0,4)||[];
 const zones=flood?.features.filter(f=>['Polygon','MultiPolygon'].includes(f.geometry?.type) && booleanPointInPolygon([lon,lat],f)).map(f=>f.properties?.FLD_ZONE);
 return <section className="location-explorer" aria-label="Daily life and coverage"><h3>Daily life at this location</h3><p className="hint">Straight-line proximity, not walking time. Motorways, railways and entrances may change the actual journey.</p>
 {error&&<p role="status">{error} <button className="btn" onClick={()=>setAttempt(n=>n+1)}>Retry local context</button></p>}{loading&&<p role="status">Loading local context...</p>}
 {Object.entries({groceries:'Food shopping',pharmacy:'Health essentials',library:'Libraries',gym:'Exercise',marketplace:'Markets',park:'Green space centres', 'park entrance':'Mapped park entrances'}).map(([kind,label])=><details key={kind}><summary>{label}</summary>{nearby.filter(p=>p.kind===kind).slice(0,4).map(p=><p key={p.id}><a href={`https://www.openstreetmap.org/${p.id}`} target="_blank" rel="noreferrer">{p.name}</a> · {Math.round(p.distance)} m{p.hours&&<small> · mapped hours: {p.hours}</small>}</p>)}{!nearby.some(p=>p.kind===kind)&&<p className="hint">{essentials?'No mapped record in this extract within 2 km. Availability is unknown, not absent.':'Essentials source not loaded. Nearby provision is unknown.'}</p>}{kind==='park'&&<p className="hint">Polygon centres, not access points. Mapped entrances below are tagged boundary nodes; routes and accessible entry are unverified.</p>}</details>)}
 <h3>Useful service, not just a nearby stop</h3><div className="row"><label>Pacific service date<input type="date" value={day} onChange={e=>{if(e.target.value)setDay(e.target.value);}} /></label><label>Hour<select value={hour} onChange={e=>setHour(Number(e.target.value))}>{Array.from({length:24},(_,h)=><option value={h} key={h}>{String(h).padStart(2,'0')}:00</option>)}</select></label></div>
 {!active.size?<p className="hint">No active Muni calendar evidence for this date. Do not interpret this as no transport service.</p>:stops.map(s=><p key={s.id}>{s.name} · {Math.round(s.distance)} m · {s.count} scheduled departures in this hour</p>)}
 <p className="hint">Muni only. Opposite-direction stops may be separate. Schedules are not live reliability. Existing commute examples still use their original dated model.</p>
 <h3>Flood context</h3><p>{!flood?'Not loaded':zones?.length?`Mapped FEMA zone: ${[...new Set(zones)].join(', ')}`:'No intersecting FEMA zone returned by the bounded extract. This does not establish absence of exposure.'}</p><p className="hint">Effective FIRM boundaries, not an insurance determination or building survey. Hazard context does not change ranking.</p>
 <details><summary>Coverage, dates and sources</summary><p>OSM essentials: mapped observations {essentials?.observation_period||'unavailable'}. Download {essentials?.downloaded_at||'unknown'}. Completeness unverified. Missing accessibility and opening hours stay unknown.</p><p>Muni: {service?.observation_period||'unavailable'}. Download {service?.downloaded_at||'unknown'}. Service calendars, date exceptions and previous-day overnight departures are applied.</p><p>FEMA: download {flood?.downloaded_at||'unknown'}; effective map dates vary by panel. Polygon boundaries are simplified approximately 3 m. Missing polygons remain unassessed.</p><p>These context extracts cover 37.60 to 37.84 N, 122.55 to 122.33 W. They do not improve the source resolution or freshness of matching measurements.</p><p><a href="https://www.openstreetmap.org/copyright">OSM contributors, ODbL</a> · <a href={service?.source_url||'https://data.sf.gov/d/dni7-qpv3'}>SFMTA source</a> · <a href="https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28">FEMA source</a></p></details>
 </section>;
}
