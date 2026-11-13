import {expect,test} from '@playwright/test';
test('WebGL failure keeps coordinate search, results and comparison usable',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.addInitScript(()=>{
  const original=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(kind:string,...args:unknown[]){if(kind.includes('webgl'))return null;return original.apply(this,[kind,...args] as Parameters<typeof original>);} as typeof original;
 });
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Map display unavailable'})).toBeVisible();
 await page.getByRole('button',{name:'Add your destinations',exact:true}).click();
 await page.getByRole('button',{name:'Use precise coordinates',exact:true}).click();
 await page.getByLabel('Latitude',{exact:true}).fill('37.7946');await page.getByLabel('Longitude',{exact:true}).fill('-122.3999');
 await page.getByRole('button',{name:'Use coordinate',exact:true}).click();
 await expect(page.locator('.cards>.card').first()).toBeVisible();
 await expect(page.getByRole('button',{name:'Place a pin on the map',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Save to shortlist',exact:true}).first().click();
 await page.getByRole('button',{name:'Compare saved places 1',exact:true}).click();
 await expect(page.getByRole('dialog')).toContainText('Save one more place');
 await page.keyboard.press('Escape');
 await page.screenshot({path:'docs/verification/webgl-unavailable.png'});
});

test('actual context loss preserves destinations and results',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Try the SF/}).click();
 await expect(page.locator('.cards>.card').first()).toBeVisible();
 const count=await page.locator('.cards>.card').count();
 const lost=await page.locator('.map canvas').evaluate(canvas=>{const gl=(canvas as HTMLCanvasElement).getContext('webgl2'),extension=gl?.getExtension('WEBGL_lose_context');extension?.loseContext();return !!extension;});
 expect(lost).toBe(true);
 await expect(page.getByRole('heading',{name:'Map display unavailable'})).toBeVisible();
 await expect(page.locator('.workplace')).toHaveCount(2);await expect(page.locator('.cards>.card')).toHaveCount(count);
 await expect(page.getByRole('button',{name:'Retry map display',exact:true})).toBeVisible();
});
