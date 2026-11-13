// Synthetic household only. Reflow at 720x450 CSS pixels represents desktop 200% zoom.
const {chromium,expect}=require('@playwright/test');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const base=process.env.CG_BASE_URL||'http://localhost:5192';
 const output='docs/audit/accessibility';fs.mkdirSync(output,{recursive:true});const report=[];
 for(const [name,width,height] of [['desktop',1440,900],['laptop',1280,800],['tablet',768,1024],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  let release;const gate=new Promise(resolve=>{release=resolve;});
  await page.route('**/data/area_cells.geojson',async route=>{await gate;await route.continue();});
  await page.goto(base);await page.getByRole('button',{name:/Try the SF/}).click();await page.getByRole('button',{name:/^Matches/}).click();
  await expect(page.getByText('Calculating every workplace', {exact:false})).toBeVisible();
  await page.screenshot({path:`${output}/${name}-loading.png`});release();
  await page.locator('.map[data-eligible-count="494"]').waitFor();
  await page.locator('.map[data-map-ready="true"][data-vector-loaded="true"]').waitFor({timeout:45000});
  if(width<=820){
   await page.getByRole('button',{name:'More list',exact:true}).click();
   await expect(page.locator('.app')).toHaveClass(/sheet-full/);
   await page.waitForTimeout(500);const before=await page.locator('.map').getAttribute('data-centre');
   const panel=await page.locator('.resultsbar').boundingBox();await page.mouse.move(panel.x+panel.width*.5,panel.y+panel.height*.5);await page.mouse.wheel(0,350);await page.waitForTimeout(250);
   if(await page.locator('.map').getAttribute('data-centre')!==before)throw Error('Panel scroll moved the map');
   await page.screenshot({path:`${output}/${name}-more-list.png`});
   await page.getByRole('button',{name:'More map',exact:true}).click();
   await expect(page.locator('.app')).toHaveClass(/sheet-compact/);
  }
  await page.close();
  const failure=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});
  await failure.route('**/data/neighbourhood_metrics.json',route=>route.abort());await failure.goto(base);
  await expect(failure.getByRole('heading',{name:'We couldn’t load the local data.'})).toBeVisible();
  await failure.screenshot({path:`${output}/${name}-error.png`});
  await failure.unroute('**/data/neighbourhood_metrics.json');await failure.getByRole('button',{name:'Try again',exact:true}).focus();await failure.keyboard.press('Enter');
  await failure.getByRole('button',{name:'Add your destinations',exact:true}).waitFor();
  report.push({name,loadingGateConfirmed:true,errorRetryByKeyboard:true,panelScrollPreservedMap:width<=820?true:'not applicable'});await failure.close();
 }
 const page=await browser.newPage({viewport:{width:720,height:450},deviceScaleFactor:2,reducedMotion:'reduce'});await page.goto(base);
 await page.getByRole('button',{name:'Add your destinations',exact:true}).waitFor();
 let reached=false;
 for(let i=0;i<35;i++) {await page.keyboard.press('Tab');if(await page.getByRole('button',{name:'Add your destinations',exact:true}).evaluate(e=>e===document.activeElement)){reached=true;break;}}
 if(!reached)throw Error('Primary action unreachable by keyboard');await page.keyboard.press('Enter');
 await page.getByRole('textbox',{name:'Search local places',exact:true}).focus();await page.keyboard.type('Financial District');await page.keyboard.press('Enter');
 await page.locator('.place-search-result').first().waitFor();await page.screenshot({path:`${output}/desktop-200-percent-reflow.png`});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw Error('Horizontal page overflow at 200% equivalent reflow');
 report.push({name:'desktop-200-percent-reflow',cssViewport:'720x450',deviceScaleFactor:2,method:'1440x900 effective CSS viewport halved; installed Chrome headless, not browser toolbar zoom',keyboardPrimaryAction:true,horizontalOverflow:overflow});
 fs.writeFileSync(`${output}/checks.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
