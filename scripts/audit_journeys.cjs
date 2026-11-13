const {chromium}=require('@playwright/test');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const output=process.env.CG_AUDIT_OUTPUT||'docs/audit/baseline';fs.mkdirSync(output,{recursive:true});
 const report=[];
 for(const [name,width,height] of [['desktop',1440,900],['laptop',1280,800],['tablet',768,1024],['mobile',390,844]]){
  const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.CG_BASE_URL||'http://localhost:5189');await page.getByRole('heading',{name:'Where do you need to get to?'}).waitFor();
  await page.locator('.map[data-vector-loaded="true"]').waitFor({timeout:45000});
  await page.screenshot({path:`${output}/${name}-opening.png`});
  await page.getByRole('button',{name:/Try the SF/}).click();await page.locator('.map[data-eligible-count="494"]').waitFor();
  await page.getByRole('button',{name:/^Matches/}).click();await page.screenshot({path:`${output}/${name}-results.png`});
  for(let i=0;i<3;i++)await page.getByRole('button',{name:'Save to shortlist',exact:true}).first().click();
  await page.getByRole('button',{name:'Shortlist 3',exact:true}).click();await page.screenshot({path:`${output}/${name}-compare.png`});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Your search',exact:true}).click();
  for(const card of await page.locator('.workplace').all())await card.getByRole('combobox',{name:'Maximum commute',exact:true}).selectOption('15');
  await page.getByRole('button',{name:/^Matches/}).click();await page.locator('.match-legend b').filter({hasText:'0 matching'}).waitFor();await page.screenshot({path:`${output}/${name}-empty.png`});
  report.push({name,width,height,errors,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});await page.close();
 }
 fs.writeFileSync(`${output}/journeys.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
