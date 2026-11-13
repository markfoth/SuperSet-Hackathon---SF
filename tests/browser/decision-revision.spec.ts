import {expect,test} from '@playwright/test';

test('new visitor deliberately starts destination search and keeps place semantics',async({page})=>{
 await page.goto('/');
 await expect(page.getByRole('button',{name:'Add your destinations',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'Search local places',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Add your destinations',exact:true}).click();
 await page.getByRole('textbox',{name:'Search local places',exact:true}).fill('Financial District');
 await page.getByRole('button',{name:'Search places',exact:true}).click();
 await page.locator('.place-search-result').filter({hasText:'Example destination'}).first().click();
 await expect(page.locator('.selected-place b')).toHaveText('Financial District');
 await page.getByRole('textbox',{name:'Destination label',exact:true}).fill('College');
 await expect(page.locator('.selected-place b')).toHaveText('Financial District');
});

test('a household searches two destinations, compares three areas and retains context after adding a home',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Add your destinations',exact:true}).click();
 for(const name of ['Financial District','SFO Airport']) {
   await page.getByRole('textbox',{name:'Search local places',exact:true}).fill(name);
   await page.getByRole('button',{name:'Search places',exact:true}).click();
   await page.locator('.place-search-result').filter({hasText:'Example destination'}).first().click();
   if(name==='Financial District')await page.getByRole('button',{name:'+ Add destination',exact:true}).click();
 }
 await page.getByRole('button',{name:/Make it feel like home/}).click();
 await page.locator('.pref').filter({hasText:'Flatter streets'}).getByRole('radio',{name:'Nice',exact:true}).click();
 await page.getByRole('button',{name:/^Matches/}).click();
 await expect(page.locator('.cards>.card').first()).toBeVisible();
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'Save to shortlist',exact:true}).first().click();
 await page.getByRole('button',{name:'Shortlist 3',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Compare your shortlist'}).getByRole('columnheader')).toHaveCount(4);
 await page.keyboard.press('Escape');
 await page.locator('.cards>.card .card-title').first().click();
 await page.getByRole('button',{name:'← Results',exact:true}).click();
 await expect(page.locator('.cards>.card .card-title').first()).toBeFocused();
 await page.getByRole('button',{name:/^Homes/}).click();
 const dialog=page.getByRole('dialog',{name:'Prospective homes'});
 await dialog.getByRole('button',{name:'Enter coordinates',exact:true}).click();
 await dialog.getByLabel('Latitude',{exact:true}).fill('37.751');
 await dialog.getByLabel('Longitude',{exact:true}).fill('-122.419');
 await dialog.getByRole('button',{name:'Add home pin',exact:true}).click();
 await expect(dialog.getByRole('region',{name:'Home matching evidence'})).toContainText('actual home pin');
 await page.keyboard.press('Escape');await page.reload();
 await expect(page.locator('.persistent-summary')).toContainText('2 destinations');
 await expect(page.getByRole('button',{name:'Shortlist 4',exact:true})).toBeVisible();
});

test('a partial daily-life source failure preserves other evidence and retries without changing matching',async({page})=>{
 await page.route('**/data/muni_service.json',route=>route.abort());
 await page.goto('/');await page.getByRole('button',{name:/Try the SF/}).click();
 await page.getByRole('button',{name:/^Matches/}).click();
 await expect(page.locator('.map')).toHaveAttribute('data-eligible-count','494');
 const count=await page.locator('.map').getAttribute('data-eligible-count');
 await page.locator('.card[data-area-id="mission"] .card-title').click();await page.locator('.local-choices button').first().click();
 const explorer=page.getByRole('region',{name:'Daily life and coverage'});
 await expect(explorer).toContainText('Unavailable sources: Muni');
 await explorer.getByText('Coverage, dates and sources',{exact:true}).click();
 await expect(explorer).toContainText('mapped observations 2026');
 await expect(explorer).not.toContainText('Flood contextNot loaded');
 await page.unroute('**/data/muni_service.json');await explorer.getByRole('button',{name:'Retry local context'}).click();
 await expect(explorer).toContainText('SFMTA_GTFS_20260829_20270115v2.zip');
 await expect(page.locator('.map')).toHaveAttribute('data-eligible-count',count!);
});

test('selected location uses actual new context and date-specific transport',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Try the SF/}).click();
 await page.getByRole('button',{name:/^Matches/}).click();
 await page.locator('.card[data-area-id="mission"] .card-title').click();
 await page.locator('.local-choices button').first().click();
 const explorer=page.getByRole('region',{name:'Daily life and coverage'});
 await expect(explorer).toContainText('Straight-line proximity');
 await expect(explorer).toContainText('Flood context');
 await explorer.getByText('Coverage, dates and sources',{exact:true}).click();
 await expect(explorer).toContainText('SFMTA_GTFS_20260829_20270115v2.zip');
 await explorer.getByLabel('Pacific service date').fill('2030-01-01');
 await expect(explorer).toContainText('No active Muni calendar evidence');
});

test('applied trade-off can be undone without silently relaxing a constraint',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Try the SF/}).click();
 await page.getByRole('button',{name:/Make it feel like home/}).click();
 const flat=page.locator('.pref').filter({hasText:'Flatter streets'});
 await flat.getByRole('radio',{name:'Must',exact:true}).click();
 const before=await page.locator('.match-legend b').textContent();
 await page.locator('.tradeoff-panel summary').click();
 await page.getByRole('button',{name:'Relax Flatter streets',exact:true}).click();
 await expect(page.locator('.match-legend b')).toHaveText(before!);
 await page.getByRole('button',{name:'Apply this change',exact:true}).click();
 await page.locator('.tradeoff-panel summary').click();
 await page.getByRole('button',{name:'Undo last adjustment',exact:true}).click();
 await expect(flat.getByRole('radio',{name:'Must',exact:true})).toHaveAttribute('aria-checked','true');
 await expect(page.locator('.match-legend b')).toHaveText(before!);
});

test('identical priorities reached through different edit histories produce identical areas',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Try the SF/}).click();
 await page.getByRole('button',{name:/Make it feel like home/}).click();
 const flat=page.locator('.pref').filter({hasText:'Flatter streets'}),parks=page.locator('.pref').filter({hasText:'Parks nearby'});
 await flat.getByRole('radio',{name:'Must',exact:true}).click();await parks.getByRole('radio',{name:'Important',exact:true}).click();
 await page.getByRole('button',{name:/^Matches/}).click();
 const before=await page.locator('.cards>.card[data-area-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-area-id')));
 const count=await page.locator('.map').getAttribute('data-eligible-count');
 await page.getByRole('button',{name:'Your search',exact:true}).click();
 await flat.getByRole('radio',{name:'Off',exact:true}).click();await parks.getByRole('radio',{name:'Off',exact:true}).click();
 await parks.getByRole('radio',{name:'Important',exact:true}).click();await flat.getByRole('radio',{name:'Must',exact:true}).click();
 await page.getByRole('button',{name:/^Matches/}).click();
 expect(await page.locator('.cards>.card[data-area-id]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-area-id')))).toEqual(before);
 await expect(page.locator('.map')).toHaveAttribute('data-eligible-count',count!);
});

test('short desktop reflow keeps every map control unobscured',async({page})=>{
 await page.setViewportSize({width:720,height:450});await page.goto('/');
 await expect(page.locator('.map')).toHaveAttribute('data-map-ready','true');
 for(const name of ['3D buildings','Terrain','Map tilt','Reset north','Fit locations','Zoom in','Zoom out']) {
   const hit=await page.getByRole('button',{name,exact:true}).evaluate(node=>{
     const box=node.getBoundingClientRect(),target=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
     return node===target||node.contains(target);
   });
   expect(hit,`${name} must remain reachable`).toBe(true);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
