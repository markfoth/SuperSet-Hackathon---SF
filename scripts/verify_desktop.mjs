import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

const folder='docs/verification';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:process.env.CG_BROWSER||'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(45000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const report={browser:process.env.CG_BROWSER||'chrome',gestures:[],layouts:[],errors};
const camera=()=>page.evaluate(()=>{const m=document.querySelector('.map').__commonGroundMap;return{zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing(),centre:m.getCenter().toArray()};});
try {
 await page.goto(process.env.CG_BASE_URL||'http://localhost:5196/');
 await page.locator('.map[data-vector-loaded="true"]').waitFor();
 await page.locator('.map[data-terrain-loaded="true"]').waitFor();
 for(const name of ['3D buildings','Map tilt','Rotate map clockwise','Fit locations'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);
 assert.equal(await page.getByRole('group',{name:'Map mode',exact:true}).count(),0);
 for(const [width,height] of [[1280,800],[1440,900],[1920,1080]]){await page.setViewportSize({width,height});await page.waitForTimeout(250);await page.screenshot({path:`${folder}/${width}-opening-${report.browser}.png`});}
 await page.setViewportSize({width:1440,height:900});
 await page.getByRole('button',{name:/Focus on map/}).click();
 if(await page.getByRole('button',{name:'Dismiss navigation hint'}).count())await page.getByRole('button',{name:'Dismiss navigation hint'}).click();
 for(const [zoom,pitch,bearing] of [[14.5,0,0],[15,35,85],[15.5,55,-35]]){
   await page.evaluate(({zoom,pitch,bearing})=>document.querySelector('.map').__commonGroundMap.jumpTo({center:[-122.444,37.756],zoom,pitch,bearing,padding:{top:0,bottom:0,left:0,right:0}}),{zoom,pitch,bearing});
   await page.waitForTimeout(600);
   const rect=await page.locator('.map canvas').boundingBox();const point={x:rect.width*.44,y:rect.height*.60};
   const anchor=await page.evaluate(point=>document.querySelector('.map').__commonGroundMap.unproject(point).toArray(),point);
   await page.mouse.move(rect.x+point.x,rect.y+point.y);await page.mouse.down({button:'right'});
   await page.mouse.move(rect.x+point.x,rect.y+point.y-100,{steps:20});
   const right=await page.evaluate(({anchor,point})=>{const m=document.querySelector('.map').__commonGroundMap;return{error:m.project(anchor).dist(point),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()};},{anchor,point});
   assert.ok(right.error<3,`Right anchor drift ${right.error}`);assert.ok(Math.abs(right.zoom-zoom-.8)<.12);assert.ok(Math.abs(right.pitch-pitch)<.01);assert.ok(Math.abs(right.bearing-bearing)<.01);
   await page.mouse.move(rect.x+point.x,15);await page.mouse.up({button:'right'});
   assert.equal(await page.locator('.map canvas').getAttribute('data-right-drag'),'false');
   await page.evaluate(({zoom,pitch,bearing})=>document.querySelector('.map').__commonGroundMap.jumpTo({center:[-122.444,37.756],zoom,pitch,bearing}),{zoom,pitch,bearing});
   await page.waitForTimeout(300);
   const orbitAnchor=await page.evaluate(point=>document.querySelector('.map').__commonGroundMap.unproject(point).toArray(),point);
   await page.mouse.move(rect.x+point.x,rect.y+point.y);await page.mouse.down({button:'middle'});
   await page.mouse.move(rect.x+point.x+80,rect.y+point.y-80,{steps:24});
   const middle=await page.evaluate(({anchor,point})=>{const m=document.querySelector('.map').__commonGroundMap;return{error:m.project(anchor).dist(point),zoom:m.getZoom(),pitch:m.getPitch(),bearing:m.getBearing()};},{anchor:orbitAnchor,point});
   assert.ok(middle.error<3,`Middle anchor drift ${middle.error}`);assert.ok(Math.abs(middle.pitch-Math.min(60,pitch+20))<.05);assert.ok(Math.abs(middle.bearing-bearing-28)<.05);
   await page.mouse.up({button:'middle'});assert.equal(await page.locator('.map canvas').getAttribute('data-middle-drag'),'false');
   report.gestures.push({start:{zoom,pitch,bearing},right,middle});
 }
 for(const button of ['middle','right'])for(const event of ['blur','pointercancel']){
   await page.mouse.move(700,500);await page.mouse.down({button});
   if(event==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
   else await page.evaluate(()=>document.querySelector('.map canvas').dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));
   await page.mouse.up({button});assert.equal(await page.locator('.map canvas').getAttribute(button==='middle'?'data-middle-drag':'data-right-drag'),'false');
 }
 await page.getByRole('button',{name:'Reset north',exact:true}).click();assert.ok(Math.abs((await camera()).bearing)<.01);
 const compass=await page.locator('.compass-button svg').getAttribute('style');assert.match(compass,/rotate\(0deg\)/);
 const beforePan=await camera();await page.mouse.move(700,450);await page.mouse.down();await page.mouse.move(790,480,{steps:15});await page.mouse.up();
 assert.notDeepEqual((await camera()).centre,beforePan.centre);
 const beforeWheel=(await camera()).zoom;await page.mouse.wheel(0,-250);await page.waitForTimeout(500);assert.ok((await camera()).zoom>beforeWheel);
 await page.getByRole('button',{name:/Back to search/}).click();
 await page.getByRole('button',{name:/Try the SF/}).click();
 await page.locator('.cards > .card').first().waitFor();
 await page.waitForFunction(()=>Number(document.querySelector('.map').dataset.eligibleCount)>0);
 await page.locator('.cards > .card .card-title').first().click();
 await page.waitForTimeout(500);
 const beforeStyle={camera:await camera(),selection:await page.locator('.map').getAttribute('data-selection-id'),pins:await page.locator('.cg-destination-pin').count(),count:await page.locator('.match-legend b').textContent()};
 await page.getByRole('button',{name:/Choose map style/}).click();await page.getByRole('button',{name:'Satellite',exact:true}).click();
 await page.locator('.map[data-imagery-loaded="true"]').waitFor();
 await page.waitForTimeout(700);
 assert.deepEqual(await camera(),beforeStyle.camera);assert.equal(await page.locator('.map').getAttribute('data-selection-id'),beforeStyle.selection);assert.equal(await page.locator('.cg-destination-pin').count(),beforeStyle.pins);assert.equal(await page.locator('.match-legend b').textContent(),beforeStyle.count);
 await page.screenshot({path:`${folder}/satellite-${report.browser}.png`});
 await page.getByRole('button',{name:'Terrain',exact:true}).click();await page.keyboard.press('Escape');
 await page.getByRole('button',{name:/Results$/}).click();
 for(const [width,height]of[[1280,800],[1440,900],[1920,1080]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(300);
   const layout=await page.evaluate(()=>{const l=document.querySelector('.criteria-panel').getBoundingClientRect(),r=document.querySelector('.matches-panel').getBoundingClientRect(),s=document.querySelector('.map-style-control').getBoundingClientRect();return{left:l.width,right:r.width,mapWidth:r.left-l.right,selectorVisible:s.left>=l.right&&s.right<=r.left,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.ok(layout.left>=300&&layout.right>=320&&layout.mapWidth>500&&layout.selectorVisible&&!layout.overflow);
   await page.screenshot({path:`${folder}/${width}-results-${report.browser}.png`});report.layouts.push({width,height,...layout});
 }
 assert.deepEqual(errors,[]);
 report.success=true;
}catch(error){report.success=false;report.failure=String(error);await page.screenshot({path:`${folder}/failure-${report.browser}.png`});console.error(error);process.exitCode=1;}
await writeFile(`${folder}/desktop-${report.browser}.json`,JSON.stringify(report,null,2));
await context.close();await browser.close();
console.log(JSON.stringify(report,null,2));
