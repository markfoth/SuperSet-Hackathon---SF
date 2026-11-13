import { expect, test } from '@playwright/test';

test('default terrain and buildings preserve matching through camera changes', async ({page})=>{
 await page.goto('/');const map=page.locator('.map');
 await expect(map).toHaveAttribute('data-3d','true');
 await expect(map).toHaveAttribute('data-terrain','true');
 await page.getByRole('button',{name:/Try.*example/}).click();
 await expect(map).toHaveAttribute('data-eligible-count',/^[1-9]\d*$/);
 const count=await map.getAttribute('data-eligible-count');
 await page.getByRole('button',{name:'Show pin',exact:true}).first().click();
 await expect(map).toHaveAttribute('data-building-count',/^[1-9]\d*$/);
 const canvas=page.locator('.map canvas');await canvas.focus();await canvas.press('Shift+ArrowUp');
 await expect(map).toHaveAttribute('data-eligible-count',count!);
 for(const name of ['3D buildings','Map tilt','Fit locations','Rotate map clockwise'])await expect(page.getByRole('button',{name,exact:true})).toHaveCount(0);
});

test('failed basemap requests retain local matching and a recovery action', async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.map-service-warning')).toContainText('Street tiles could not load');
  await page.getByRole('button', { name: /Try.*example/ }).click();
  await expect(page.locator('.map')).toHaveAttribute('data-eligible-count', /^[1-9]\d*$/);
  await expect(page.getByRole('button', { name: 'Retry tiles' })).toBeVisible();
});

test('optional context failures expose retry and recover without changing eligibility', async ({ page }) => {
  await page.route('**/data/context/parks/**', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Try.*example/ }).click();
  const map = page.locator('.map');
  await expect(map).toHaveAttribute('data-eligible-count', /^[1-9]\d*$/);
  const count = await map.getAttribute('data-eligible-count');
  await page.getByRole('button', { name: /Map layers/ }).click();
  await page.getByRole('checkbox', { name: 'Parks & open space' }).check();
  await expect(page.locator('.map-layer-error')).toContainText('could not load');
  await page.unroute('**/data/context/parks/**');
  await page.getByRole('button', { name: 'Retry layer' }).click();
  await expect(page.locator('.map')).toHaveAttribute('data-context-loaded', /parks/);
  await expect(page.locator('.map-layer-error')).toHaveCount(0);
  await expect(map).toHaveAttribute('data-eligible-count', count!);
});

test('failed terrain remains a flat map and can be retried', async ({ page }) => {
  await page.route('**/data/regional_terrain.json', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.map')).toHaveAttribute('data-map-ready', 'true');
  await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded','true');
  await expect(page.locator('.map-layer-error')).toContainText('Terrain could not load');
  await expect(page.locator('.map')).toHaveAttribute('data-terrain', 'false');
  await page.unroute('**/data/regional_terrain.json');
  await page.getByRole('button', { name: 'Retry layer' }).click();
  await expect(page.locator('.map')).toHaveAttribute('data-terrain', 'true');
});

test('missing DEM tiles retain a truthful flat map and recover without reloading',async({page})=>{
 await page.route('https://tiles.mapterhorn.com/**/*.webp',route=>route.abort());
 await page.goto('/');await expect(page.locator('.map')).toHaveAttribute('data-map-ready','true');
 await expect(page.locator('.map-layer-error')).toContainText('temporarily unavailable');
 await expect(page.locator('.map')).toHaveAttribute('data-terrain','false');
 await page.unroute('https://tiles.mapterhorn.com/**/*.webp');
 await page.getByRole('button',{name:'Retry layer',exact:true}).click();
 await expect(page.locator('.map')).toHaveAttribute('data-terrain','true');
 await expect(page.locator('.map')).toHaveAttribute('data-terrain-loaded','true');
});
