import {expect,test} from '@playwright/test';
test('air uses a continuous fixed local percentile ramp and explicit missing coverage',async({page})=>{
 await page.goto('/');await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded','true');
 await page.locator('.layers-toggle').click();await page.getByText('More context layers',{exact:true}).click();await page.getByLabel('Air pollution (PM2.5)',{exact:true}).check();
 await expect(page.locator('.map')).toHaveAttribute('data-context-loaded',/air/);
 await expect(page.locator('.legend')).toContainText('No published PM2.5 value');
 const style=await page.evaluate(async()=>{const m=(document.querySelector('.map') as any).__commonGroundMap;const s=await m.getSource('context-air-tracts').getData();const a=s.features.map((f:any)=>f.properties.ces_pm_pctl);return{colour:m.getPaintProperty('context-air-tracts-0','fill-color'),min:Math.min(...a.filter((x:any)=>x!=null)),max:Math.max(...a.filter((x:any)=>x!=null)),missing:a.filter((x:any)=>x==null).length};});
 expect(style.colour).toContainEqual(['==',['get','ces_pm_pctl'],null]);expect(JSON.stringify(style.colour)).toContain('interpolate');expect(style.min).toBe(7.6);expect(style.max).toBe(34.2);expect(style.missing).toBe(3);
 await page.getByLabel('Air colour scale',{exact:true}).selectOption('statewide');
 await expect(page.locator('.legend')).toContainText('100th California percentile');
 const statewide=await page.evaluate(()=>(document.querySelector('.map') as any).__commonGroundMap.getPaintProperty('context-air-tracts-0','fill-color'));
 expect(JSON.stringify(statewide)).toContain('100');expect(JSON.stringify(statewide)).not.toContain('35');
});
test('example vehicles play only on request, pause when hidden, and clean up on layer off',async({page})=>{
 await page.goto('/');await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded','true');await page.locator('.layers-toggle').click();await page.getByLabel('Public transport',{exact:true}).check();
 await expect(page.getByLabel('Animate example vehicles')).not.toBeChecked();await expect(page.locator('.example-vehicle')).toHaveCount(0);
 await page.getByLabel('Animate example vehicles').check();await expect(page.locator('.example-vehicle')).toHaveCount(2);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 const paused=await page.locator('.example-vehicle').first().getAttribute('style');await page.waitForTimeout(200);expect(await page.locator('.example-vehicle').first().getAttribute('style')).toBe(paused);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('.example-vehicle').first()).not.toHaveAttribute('style',paused!);
 await page.getByRole('button',{name:'Pause animation'}).click();await expect(page.locator('.example-vehicle')).toHaveCount(0);
 await page.getByLabel('Animate example vehicles').check();await expect(page.locator('.example-vehicle')).toHaveCount(2);await page.getByLabel('Public transport',{exact:true}).uncheck();await expect(page.locator('.example-vehicle')).toHaveCount(0);
});
test('buildings survive delayed tiles and rapid navigation at the documented pitch constraint',async({page})=>{
 await page.goto('/');await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded','true');await page.getByRole('button',{name:'3D buildings',exact:true}).click();
 await page.route('https://tiles.openfreemap.org/**/*.pbf',async route=>{await new Promise(resolve=>setTimeout(resolve,180));await route.continue();});
 for(const [lng,lat,zoom] of [[-122.41,37.775,14.5],[-122.43,37.76,16],[-122.411,37.654,14.5],[-122.399,37.795,15]])await page.evaluate(({lng,lat,zoom})=>(document.querySelector('.map') as any).__commonGroundMap.jumpTo({center:[lng,lat],zoom,pitch:60,bearing:35}),{lng,lat,zoom});
 await expect.poll(()=>page.evaluate(()=>{const m=(document.querySelector('.map') as any).__commonGroundMap;return m.queryRenderedFeatures({layers:['real-buildings']}).length;})).toBeGreaterThan(0);
 await expect(page.locator('.map')).toHaveAttribute('data-pitch','50');await expect(page.locator('.map-service-warning')).toHaveCount(0);
});
