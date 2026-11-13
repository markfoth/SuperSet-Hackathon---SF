const {chromium}=require('@playwright/test');const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const output='docs/audit/original-live';fs.mkdirSync(output,{recursive:true});const report=[];
 for(const [name,width,height] of [['desktop',1440,900],['laptop',1280,800],['tablet',768,1024],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});await page.goto('https://common-ground-sf.vercel.app/');
  await page.getByRole('button',{name:'+ Add workplace',exact:true}).waitFor();await page.waitForTimeout(700);await page.screenshot({path:`${output}/${name}-opening.png`});
  await page.getByRole('button',{name:'+ Add workplace',exact:true}).click();
  const pinMode=await page.getByRole('button',{name:/Click the map to place/}).count();
  await page.screenshot({path:`${output}/${name}-pin-first.png`});
  await page.getByRole('button',{name:'Reset to demo',exact:true}).click();
  const resultsTab=page.getByRole('button',{name:/^Results \(/});if(await resultsTab.isVisible())await resultsTab.click();
  await page.locator('.cards>.card').first().waitFor();await page.waitForTimeout(300);await page.screenshot({path:`${output}/${name}-results.png`});
  report.push({name,viewport:[width,height],renderer:await page.locator('.map').getAttribute('data-renderer'),pinModeOfferedImmediately:pinMode>0,resultCount:await page.locator('.cards>.card').count(),horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await page.close();
 }
 fs.writeFileSync(`${output}/comparison.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
