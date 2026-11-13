import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
const folder = 'docs/audit/desktop-refinement';
await mkdir(folder, {recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page = await context.newPage();
const captureScreenshots=process.env.CG_SCREENSHOTS!=='0';
page.on('worker',worker=>{void worker.evaluate(()=>performance.setResourceTimingBufferSize(2000)).catch(()=>{});});
const cdp=await context.newCDPSession(page), transferIds=new Map(), transfers=[];
await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
cdp.on('Network.requestWillBeSent',event=>transferIds.set(event.requestId,event.request.url));
cdp.on('Network.loadingFinished',event=>transfers.push({url:transferIds.get(event.requestId),bytes:event.encodedDataLength}));
const errors=[], requests=[], failed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('response',r=>{requests.push({url:r.url(),status:r.status()}); if(r.status()>=400)failed.push({url:r.url(),status:r.status()});});
await page.addInitScript(()=>{window.__cgLongTasks=[];new PerformanceObserver(list=>window.__cgLongTasks.push(...list.getEntries().map(e=>({start:e.startTime,duration:e.duration})))).observe({type:'longtask',buffered:true});});
await page.goto(process.env.CG_BASE_URL || 'http://localhost:5194/');
await page.locator('.map[data-vector-loaded="true"]').waitFor({timeout:45000});
const initialTransfer={bytes:transfers.reduce((s,x)=>s+x.bytes,0),requests:transfers.length,contextDataRequested:transfers.filter(x=>/\/(incident_details|crash_details|cafes|restaurants|nightlife_venues|neighbourhood_character)\./.test(x.url))};
await page.getByRole('button',{name:'Dismiss navigation hint'}).click();
await page.getByRole('button',{name:/Focus on map/}).click();
const anchors=[];
for (const terrain of [false,true]) {
  if(terrain){await page.getByRole('button',{name:'Terrain',exact:true}).click(); await page.locator('.map[data-terrain-loaded="true"]').waitFor({timeout:30000});}
  for(const [zoom,pitch,bearing] of [[13.8,0,0],[15,35,85],[16,60,-35],[17,50,160]]) {
    await page.evaluate(({zoom,pitch,bearing})=>{const m=document.querySelector('.map').__commonGroundMap; m.jumpTo({center:[-122.444,37.756],zoom,pitch,bearing,padding:{top:0,bottom:0,left:0,right:0}});},{zoom,pitch,bearing});
    await page.waitForTimeout(900);
    const rect=await page.locator('.map canvas').boundingBox();
    const point={x:Math.round(rect.width*.44),y:Math.round(rect.height*.58)};
    const before=await page.evaluate(point=>{const m=document.querySelector('.map').__commonGroundMap; const anchor=m.unproject(point); return{anchor:anchor.toArray(),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()};},point);
    await page.mouse.move(rect.x+point.x,rect.y+point.y); await page.mouse.down({button:'right'});
    const samples=[];
    for(const dy of [-20,-60,-100,30]) {
      await page.mouse.move(rect.x+point.x,rect.y+point.y+dy,{steps:8});
      samples.push(await page.evaluate(({anchor,point})=>{const m=document.querySelector('.map').__commonGroundMap,p=m.project(anchor); return{errorPx:Math.hypot(p.x-point.x,p.y-point.y),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()};},{anchor:before.anchor,point}));
    }
    await page.mouse.up({button:'right'});
    anchors.push({terrain,requested:{zoom,pitch,bearing},before,samples});
    if(captureScreenshots&&terrain&&zoom===16)await page.screenshot({path:`${folder}/anchored-terrain.png`});
  }
}
// Release outside the canvas, then move back without a button: no stuck gesture.
const rect=await page.locator('.map canvas').boundingBox();
await page.mouse.move(700,rect.y+400);await page.mouse.down({button:'right'});await page.mouse.move(700,20,{steps:15});await page.mouse.up({button:'right'});
const released=await page.locator('canvas').first().getAttribute('data-right-drag');
const releasedZoom=await page.evaluate(()=>document.querySelector('.map').__commonGroundMap.getZoom());
await page.mouse.move(700,600,{steps:5});
const outsideRelease={state:released,zoomBefore:releasedZoom,zoomAfter:await page.evaluate(()=>document.querySelector('.map').__commonGroundMap.getZoom())};
await writeFile(`${folder}/anchor-checks.json`,JSON.stringify({anchors,outsideRelease},null,2));
// Real context layers and the two real-geometry demonstration vehicles.
await page.locator('.layers-toggle').click();
await page.getByLabel('Public transport',{exact:true}).check();
await page.getByLabel('Animate example vehicles',{exact:true}).check();
await page.waitForFunction(()=>document.querySelectorAll('.example-vehicle').length===2);
await page.getByLabel('Nightlife',{exact:true}).check();
await page.getByLabel('Topographic map',{exact:true}).check();
await page.getByText('More context layers',{exact:true}).click();
await page.getByLabel('Food and coffee',{exact:true}).check();
await page.waitForFunction(()=>['food','nightlife','transit','topography'].every(x=>document.querySelector('.map').dataset.contextLoaded?.split(',').includes(x)));
await page.locator('.layers-toggle').click();
await page.evaluate(()=>document.querySelector('.map').__commonGroundMap.jumpTo({center:[-122.429,37.785],zoom:13.2,pitch:30,bearing:0,padding:{top:0,bottom:0,left:0,right:0}}));
const positions=await page.locator('.example-vehicle').evaluateAll(nodes=>nodes.map(n=>({label:n.getAttribute('aria-label'),position:n.style.transform})));
await page.waitForTimeout(3000);
const moved=await page.locator('.example-vehicle').evaluateAll(nodes=>nodes.map(n=>n.style.transform));
if(captureScreenshots)await page.screenshot({path:`${folder}/transport-animation.png`});
await page.getByRole('button',{name:'3D buildings',exact:true}).click();
await page.locator('.map[data-3d="true"]').waitFor();
const buildingStates=[];
for(const zoom of [13,14,14.5,15,17]) {
 await page.evaluate(zoom=>document.querySelector('.map').__commonGroundMap.jumpTo({center:[-122.415,37.775],zoom,pitch:50,bearing:35}),zoom);
 await page.waitForTimeout(1000);
 buildingStates.push(await page.evaluate(()=>{const m=document.querySelector('.map').__commonGroundMap; return{zoom:m.getZoom(),pitch:m.getPitch(),features:m.queryRenderedFeatures({layers:['real-buildings']}).length,sourceFeatures:m.querySourceFeatures('openmaptiles',{sourceLayer:'building'}).length};}));
 if(captureScreenshots)await page.screenshot({path:`${folder}/buildings-z${zoom}.png`});
}
await page.evaluate(()=>document.querySelector('.map').__commonGroundMap.jumpTo({center:[-122.415,37.775],zoom:15,pitch:50,bearing:35}));
await page.waitForTimeout(1300);
const pan=await page.evaluate(async()=>{const m=document.querySelector('.map').__commonGroundMap; const intervals=[];const start=performance.now();let previous=start; for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);const now=performance.now();intervals.push(now-previous);previous=now; if(i%8===0)m.panBy([8,0],{duration:0});}return {start,end:performance.now(),intervals};});
const frames=pan.intervals;
const gpu=await page.evaluate(()=>{const gl=document.querySelector('canvas').getContext('webgl2');const info=gl?.getExtension('WEBGL_debug_renderer_info');return info?{vendor:gl.getParameter(info.UNMASKED_VENDOR_WEBGL),renderer:gl.getParameter(info.UNMASKED_RENDERER_WEBGL)}:null;});
const longTasks=await page.evaluate(()=>window.__cgLongTasks);
const workerResources=(await Promise.all(page.workers().map(worker=>worker.evaluate(()=>performance.getEntriesByType('resource').map(entry=>({url:entry.name,duration:entry.duration,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize}))).catch(()=>[])))).flat();
const vectorResources=workerResources.filter(x=>/\/\d+\/\d+\/\d+\.pbf(?:[?#]|$)/.test(x.url));
const sorted=[...frames].sort((a,b)=>a-b);
await writeFile(`${folder}/diagnostics.json`,JSON.stringify({baseURL:process.env.CG_BASE_URL,captureScreenshots,machine:{platform:os.platform(),release:os.release(),cpu:os.cpus()[0]?.model,logicalProcessors:os.cpus().length,totalMemory:os.totalmem(),browser:browser.version(),gpu},anchors,outsideRelease,transport:{positions,moved},buildingStates,frames:{count:frames.length,meanMs:frames.reduce((s,x)=>s+x,0)/frames.length,p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...frames)},panWindow:{start:pan.start,end:pan.end},initialTransfer,longTasks,panLongTasks:longTasks.filter(x=>x.start<pan.end && x.start+x.duration>pan.start),workerResources,transfer:{scope:'Main-page CDP; worker tile resource timings recorded separately. Cross-origin byte counts may be hidden without Timing-Allow-Origin.',pageObservedBytes:transfers.reduce((s,x)=>s+x.bytes,0),vectorRequests:vectorResources.length,vectorMeasuredEncodedBytes:vectorResources.reduce((s,x)=>s+x.encodedBodySize,0),vectorEntriesWithUnknownBytes:vectorResources.filter(x=>x.encodedBodySize===0).length,terrainBytes:transfers.filter(x=>/mapterhorn.*\.webp/.test(x.url)).reduce((s,x)=>s+x.bytes,0),entries:transfers},errors,failed,requests},null,2));
await context.close();await browser.close();
