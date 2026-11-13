import { expect, test } from '@playwright/test';

test('MapLibre preserves matches through 3D and real bounded terrain toggles', async ({ page }) => {
  const terrainResponses: string[] = [];
  const workerErrors: string[] = [];
  page.on('response', (response) => { if (/tiles\.mapterhorn\.com\/.*\.webp/.test(response.url()) && response.ok()) terrainResponses.push(response.url()); });
  page.on('console', (message) => { if (/Worker failed|Failed to fetch worker/.test(message.text())) workerErrors.push(message.text()); });
  await page.goto('/');
  const map = page.locator('.map[data-renderer="maplibre"]');
  await expect(map).toHaveAttribute('data-map-ready', 'true');
  expect(terrainResponses).toEqual([]);
  await page.getByRole('button', { name: /Try.*example/ }).first().click();
  await expect(map).toHaveAttribute('data-eligible-count', /^[1-9]\d*$/);
  const count = await map.getAttribute('data-eligible-count');
  await page.getByRole('button', { name: '3D buildings', exact: true }).click();
  await expect(map).toHaveAttribute('data-3d', 'true');
  await expect(map).toHaveAttribute('data-pitch', '50');
  await page.getByRole('button', { name: 'Terrain', exact: true }).click();
  await expect(map).toHaveAttribute('data-terrain', 'true');
  await expect.poll(() => terrainResponses.length).toBeGreaterThan(0);
  await expect(map).toHaveAttribute('data-eligible-count', count!);
  await page.getByRole('button', { name: 'Reset north', exact: true }).click();
  await page.getByRole('button', { name: 'Fit locations', exact: true }).click();
  await page.getByRole('button', { name: '3D buildings', exact: true }).click();
  await expect(map).toHaveAttribute('data-3d', 'false');
  await expect(map).toHaveAttribute('data-terrain', 'true');
  await page.getByRole('button', { name: 'Map tilt', exact: true }).click();
  await expect(map).toHaveAttribute('data-pitch', '0');
  await expect(map).toHaveAttribute('data-terrain', 'true');
  await page.getByRole('button', { name: 'Terrain', exact: true }).click();
  await expect(map).toHaveAttribute('data-terrain', 'false');
  expect(workerErrors).toEqual([]);
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
  await page.route('**/data/parks.geojson', route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: /Try.*example/ }).click();
  const map = page.locator('.map');
  await expect(map).toHaveAttribute('data-eligible-count', /^[1-9]\d*$/);
  const count = await map.getAttribute('data-eligible-count');
  await page.getByRole('button', { name: /Map layers/ }).click();
  await page.getByRole('checkbox', { name: 'Parks & open space' }).check();
  await expect(page.locator('.map-layer-error')).toContainText('could not load');
  await page.unroute('**/data/parks.geojson');
  await page.getByRole('button', { name: 'Retry layer' }).click();
  await expect(page.locator('.map')).toHaveAttribute('data-context-loaded', /parks/);
  await expect(page.locator('.map-layer-error')).toHaveCount(0);
  await expect(map).toHaveAttribute('data-eligible-count', count!);
});

test('failed terrain remains a flat map and can be retried', async ({ page }) => {
  await page.route('**/data/regional_terrain.json', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.map')).toHaveAttribute('data-map-ready', 'true');
  await page.getByRole('button', { name: 'Terrain', exact: true }).click();
  await expect(page.locator('.map-layer-error')).toContainText('Terrain could not load');
  await expect(page.locator('.map')).toHaveAttribute('data-terrain', 'false');
  await page.unroute('**/data/regional_terrain.json');
  await page.getByRole('button', { name: 'Retry layer' }).click();
  await expect(page.locator('.map')).toHaveAttribute('data-terrain', 'true');
});

test('WebGL-unavailable browsers retain a 2D matching and pin interface', async ({ page }) => {
  // Explicit failure simulation; this test does not claim raster tile availability.
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind: string, ...args: unknown[]) {
      if (kind.includes('webgl')) return null;
      return original.apply(this, [kind, ...args] as Parameters<typeof original>);
    } as typeof original;
  });
  await page.goto('/');
  await expect(page.locator('.map[data-renderer="leaflet"]')).toBeVisible();
  await expect(page.locator('.map-fallback-notice')).toContainText('2D map');
  await page.getByRole('button', { name: /Try.*example/ }).click();
  await expect(page.locator('.map')).toHaveAttribute('data-eligible-count', /^[1-9]\d*$/);
  await expect(page.locator('.leaflet-marker-icon.wp-pin')).toHaveCount(2);
});

test('missing DEM tiles retain a truthful flat map and recover without reloading',async({page})=>{
 await page.route('https://tiles.mapterhorn.com/**/*.webp',route=>route.abort());
 await page.goto('/');await expect(page.locator('.map')).toHaveAttribute('data-map-ready','true');
 await page.getByRole('button',{name:'Terrain',exact:true}).click();
 await expect(page.locator('.map-layer-error')).toContainText('temporarily unavailable');
 await expect(page.locator('.map')).toHaveAttribute('data-terrain','false');
 await page.unroute('https://tiles.mapterhorn.com/**/*.webp');
 await page.getByRole('button',{name:'Retry layer',exact:true}).click();
 await expect(page.locator('.map')).toHaveAttribute('data-terrain','true');
 await expect(page.locator('.map')).toHaveAttribute('data-terrain-loaded','true');
});

test('actual WebGL context loss preserves the household in the 2D fallback',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/Try.*example/}).click();
 const map=page.locator('.map');await expect(map).toHaveAttribute('data-eligible-count',/^[1-9]\d*$/);
 const count=await map.getAttribute('data-eligible-count');
 const lost=await page.locator('.map canvas').evaluate(canvas=>{
  const context=(canvas as HTMLCanvasElement).getContext('webgl2');
  const extension=context?.getExtension('WEBGL_lose_context');extension?.loseContext();return !!extension;
 });
 expect(lost).toBe(true);
 await expect(page.locator('.map[data-renderer="leaflet"]')).toBeVisible();
 await expect(page.locator('.map')).toHaveAttribute('data-eligible-count',count!);
 await expect(page.locator('.leaflet-marker-icon.wp-pin')).toHaveCount(2);
});
