import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// This is an authorised, bounded live evaluation using existing server keys.
// No credentials, provider bodies, request headers or browser traces are saved.
const base=process.env.CG_BASE_URL||'http://localhost:5196/';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const reports=[];page.on('pageerror',error=>reports.push({pageError:error.message}));
await mkdir('docs/verification',{recursive:true});
try{
 await page.goto(base);
 const health=await page.evaluate(()=>fetch('/api/health').then(r=>r.json()));
 assert.equal(health.configured,true);assert.equal(health.dryRun,false);
 await page.getByRole('button',{name:'Add your destinations',exact:true}).click();
 await page.getByRole('button',{name:'Use precise coordinates',exact:true}).click();
 await page.getByLabel('Latitude',{exact:true}).fill('37.8715');await page.getByLabel('Longitude',{exact:true}).fill('-122.2730');
 const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/isochrone')&&response.request().method()==='POST');
 await page.getByRole('button',{name:'Use coordinate',exact:true}).click();
 const response=await responsePromise;const body=await response.json();
 assert.equal(response.status(),200);assert.equal(body.source,'traveltime');assert.ok(body.geometry?.coordinates?.length);assert.equal(body.dryRun,undefined);
 await page.waitForFunction(()=>document.querySelector('.map')?.dataset.eligibleCount&&Number(document.querySelector('.map').dataset.eligibleCount)>0,{},{timeout:60000});
 const label=await page.locator('.workplace .status').allTextContents();
 reports.push({health:{configured:health.configured,applicationIdPresent:health.applicationIdPresent,apiKeyPresent:health.apiKeyPresent,dryRun:health.dryRun,cacheAllowed:health.cacheAllowed,timezone:health.timezone},
   customDestination:{name:'Berkeley Civic Centre area',lat:37.8715,lon:-122.273,offlineFixture:false},
   request:JSON.parse(response.request().postData()),response:{status:response.status(),source:body.source,geometryType:body.geometry.type,polygonCount:body.geometry.coordinates.length,arrivalDate:body.arrivalDate,label:body.label},
   results:await page.locator('.match-legend b').textContent(),visibleRoutingLabel:label});
 await page.screenshot({path:'docs/verification/live-berkeley.png'});
 // One more destination tests joint matching across the Bay. Both polygons
 // are real inbound provider responses, not a fixture or a screen-tile gate.
 await page.getByRole('button',{name:'+ Add destination',exact:true}).click();
 await page.getByRole('button',{name:'Use precise coordinates',exact:true}).click();
 await page.getByLabel('Latitude',{exact:true}).fill('37.5650');await page.getByLabel('Longitude',{exact:true}).fill('-122.3220');
 const jointResponse=page.waitForResponse(response=>response.url().endsWith('/api/isochrone')&&response.request().method()==='POST'&&JSON.parse(response.request().postData()).lat===37.565);
 await page.getByRole('button',{name:'Use coordinate',exact:true}).click();
 const joint=await jointResponse;assert.equal(joint.status(),200);const jointBody=await joint.json();assert.equal(jointBody.source,'traveltime');
 await page.waitForFunction(()=>!document.querySelector('.map-badge[role=status]'),{},{timeout:60000});
 reports.push({jointDestination:'San Mateo',status:joint.status(),source:jointBody.source,results:await page.locator('.match-legend b').textContent()});
 await page.screenshot({path:'docs/verification/live-cross-bay.png'});
 // A wider user-selected limit should produce real joint regional matches.
 for(let i=0;i<2;i++){
  const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/isochrone')&&r.request().method()==='POST'&&JSON.parse(r.request().postData()).minutes===120);
  await page.getByRole('combobox',{name:'Maximum commute',exact:true}).nth(i).selectOption('120');
  const response=await responsePromise;assert.equal(response.status(),200);assert.equal((await response.json()).source,'traveltime');
  await page.waitForFunction(()=>!document.querySelector('.map-badge[role=status]'),{},{timeout:60000});
 }
 const count=await page.locator('.map').getAttribute('data-eligible-count');assert.ok(Number(count)>0);
 const cards=await page.locator('.cards>.card[data-area-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-area-id')));
 await page.getByRole('button',{name:/Focus on map/}).click();
 for(const centre of [[-121.9552,37.3541],[-122.273,37.8715]]){
  await page.evaluate(centre=>document.querySelector('.map').__commonGroundMap.jumpTo({center:centre,zoom:15}),centre);await page.waitForTimeout(600);
  assert.equal(await page.locator('.map').getAttribute('data-eligible-count'),count);
 }
 await page.getByRole('button',{name:/Back to search/}).click();
 assert.deepEqual(await page.locator('.cards>.card[data-area-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-area-id'))),cards);
 reports.push({jointLimitsMinutes:[120,120],results:await page.locator('.match-legend b').textContent(),areaIds:cards,viewportIndependent:true});
 await page.screenshot({path:'docs/verification/live-regional-joint.png'});
 reports.push({success:true});
}catch(error){reports.push({success:false,failure:String(error)});await page.screenshot({path:'docs/verification/live-failure.png'});process.exitCode=1;}
await writeFile('docs/verification/live-routing.json',JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));await browser.close();
