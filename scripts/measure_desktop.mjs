import { chromium } from '@playwright/test';
import { mkdir,writeFile } from 'node:fs/promises';
const baseline=process.env.CG_BASELINE==='1';
const folder=baseline?'docs/verification/baseline-combined':'docs/verification/performance';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});page.setDefaultTimeout(60000);
const cdp=await page.context().newCDPSession(page);await cdp.send('Network.enable');await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
const urls=new Map(),transfers=[],errors=[];
cdp.on('Network.requestWillBeSent',e=>urls.set(e.requestId,e.request.url));
cdp.on('Network.loadingFinished',e=>transfers.push({url:urls.get(e.requestId),bytes:e.encodedDataLength}));
page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__longTasks=[];new PerformanceObserver(list=>list.getEntries().forEach(e=>window.__longTasks.push({start:e.startTime,duration:e.duration}))).observe({type:'longtask',buffered:true});});
const transfer=(from=0)=>({bytes:transfers.slice(from).reduce((s,e)=>s+e.bytes,0),requests:transfers.length-from});
try{
 const start=Date.now();await page.goto(process.env.CG_BASE_URL||'http://localhost:4179/');
 await page.getByRole('heading',{name:'Where do you need to get to?'}).waitFor();const controlsMs=Date.now()-start;
 await page.locator(baseline?'.map[data-vector-loaded="true"]':'.map[data-vector-loaded="true"][data-terrain-loaded="true"]').waitFor();await page.waitForLoadState('networkidle');
 const initial={controlsMs,ms:Date.now()-start,...transfer()};
 const beforeSearch=transfers.length,searchStart=Date.now();await page.getByRole('button',{name:/Try the SF/}).click();
 await page.waitForFunction(()=>Number(document.querySelector('.map')?.dataset.eligibleCount)>0);
 const firstSearch={ms:Date.now()-searchStart,...transfer(beforeSearch)};
 await page.getByRole('button',{name:/Focus on map/}).click();
 if(baseline){await page.getByRole('button',{name:'3D buildings',exact:true}).click();await page.getByRole('button',{name:'Terrain',exact:true}).click();await page.locator('.map[data-terrain-loaded="true"]').waitFor();}
 await page.evaluate(()=>document.querySelector('.map').__commonGroundMap.jumpTo({center:[-122.416,37.775],zoom:15,pitch:50,bearing:0,padding:{top:0,bottom:0,left:0,right:0}}));
 await page.waitForFunction(()=>Number(document.querySelector('.map')?.dataset.buildingCount)>0);await page.waitForLoadState('networkidle');
 const measureFrames=async()=>{
  await page.evaluate(()=>{window.__frames=[];window.__measure=true;let previous=performance.now();const frame=now=>{window.__frames.push(now-previous);previous=now;if(window.__measure)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  await page.mouse.move(1080,450);await page.mouse.down();await page.mouse.move(920,480,{steps:24});await page.mouse.up();await page.waitForTimeout(500);
  const frames=await page.evaluate(()=>{window.__measure=false;return window.__frames;});const sorted=frames.slice().sort((a,b)=>a-b);
  return{frameSamples:frames.length,meanFrameMs:frames.reduce((s,n)=>s+n,0)/frames.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)],maxFrameMs:Math.max(...frames)};
 };
 const defaultInteraction=await measureFrames();
 const optionalStart=transfers.length;
 await page.locator('.layers-toggle').click();
 await page.getByRole('checkbox',{name:'Reported incidents',exact:true}).check();
 await page.locator('.advanced-layers > summary').click();
 await page.getByRole('checkbox',{name:'Supermarkets',exact:true}).check();
 await page.locator('.map[data-context-loaded*="crime"][data-context-loaded*="groceries"]').waitFor();await page.waitForLoadState('networkidle');
 const optional={...transfer(optionalStart)};await page.locator('.layers-toggle').click();
 const combinedInteraction=await measureFrames();await page.screenshot({path:`${folder}/combined-layers.png`});
 const heapSamples=[],sourceCounts=[];
 for(let i=0;i<5;i++){
  if(baseline){await page.evaluate(()=>new Promise(resolve=>{const m=document.querySelector('.map').__commonGroundMap;m.once('style.load',resolve);m.setStyle('https://tiles.openfreemap.org/styles/positron');}));await page.waitForFunction(()=>document.querySelector('.map').__commonGroundMap.getLayer('context-crime-points'));}
  else{await page.getByRole('button',{name:/Choose map style/}).click();await page.getByRole('button',{name:'Satellite',exact:true}).click();await page.locator('.map[data-imagery-loaded="true"]').waitFor();
  await page.getByRole('button',{name:'Terrain',exact:true}).click();await page.keyboard.press('Escape');}
  await page.locator('.layers-toggle').click();await page.getByRole('checkbox',{name:'Reported incidents',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Reported incidents',exact:true}).check();await page.locator('.layers-toggle').click();
  await page.waitForLoadState('networkidle');await cdp.send('HeapProfiler.collectGarbage');heapSamples.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
  sourceCounts.push(await page.evaluate(()=>{const m=document.querySelector('.map').__commonGroundMap;return{sources:Object.keys(m.getStyle().sources).length,layers:m.getStyle().layers.length,crimeSources:Object.keys(m.getStyle().sources).filter(k=>k.startsWith('context-crime')).length};}));
 }
 const tasks=await page.evaluate(()=>window.__longTasks);
 const result={conditions:{browser:'Installed Chrome, headless',viewport:'1440x900',productionBuild:true,baseline,cacheDisabled:true,reducedMotion:true,network:'Unthrottled',cpuRate:1,cycles:baseline?'Five real style reloads and incident toggles':'Five Satellite/Terrain switches and incident toggles'},initial,firstSearch,defaultInteraction,optional,combinedInteraction,heapSamples,sourceCounts,longTasks:{count:tasks.length,totalMs:tasks.reduce((s,e)=>s+e.duration,0),maxMs:Math.max(...tasks.map(e=>e.duration))},errors};
 await writeFile(`${folder}/measurements.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await page.screenshot({path:'test-results/performance-failure.png'});throw error;}finally{await browser.close();}
