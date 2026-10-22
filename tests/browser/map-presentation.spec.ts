import { expect, test } from '@playwright/test';

test('fresh session shows a plain map and clears matching shapes again when inputs are removed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let routingRequests = 0;
  page.on('request', (request) => { if (request.url().includes('/api/isochrone')) routingRequests++; });
  await page.goto('/');
  await expect(page.locator('.map.leaflet-container')).toBeVisible();
  await expect(page.locator('.workplace')).toHaveCount(0);
  await expect(page.locator('.match-legend')).toHaveCount(0);
  await expect(page.locator('.individual-isochrone, .commute-overlap, .selected-district-cell')).toHaveCount(0);
  const cells = page.locator('.leaflet-cells-pane path[role="button"]');
  await expect.poll(() => cells.count()).toBeGreaterThan(1000);
  expect(await cells.evaluateAll((paths) => paths.every((p) => p.getAttribute('display') === 'none' && p.getAttribute('tabindex') === '-1'))).toBe(true);
  expect(routingRequests).toBe(0);
  await expect.poll(() => page.locator('.leaflet-tile-pane img').evaluateAll((tiles) => tiles.some((tile) => (tile as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: 'test-results/plain-map.png', fullPage: true });
  await page.getByRole('button', { name: 'Reset to demo', exact: true }).click();
  await expect(page.locator('.individual-isochrone').first()).toHaveAttribute('stroke-opacity', '0.2');
  const visibleMatches = await page.locator('.leaflet-cells-pane path:is([data-match-state="strong"], [data-match-state="partial"])').count();
  await expect(page.locator('.match-legend b')).toContainText(`${visibleMatches} eligible cells`);
  await page.getByRole('button', { name: 'Remove SFO Airport', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Financial District', exact: true }).click();
  await expect(page.locator('.match-legend')).toHaveCount(0);
  expect(await cells.evaluateAll((paths) => paths.every((p) => p.getAttribute('display') === 'none'))).toBe(true);
  expect(errors).toEqual([]);
});

test('district selection highlights its eligible park-clipped cells above every context layer', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Reset to demo', exact: true }).click();
  await page.locator('.pref').filter({ hasText: 'Flatter streets' }).getByRole('radio', { name: 'Important', exact: true }).click();
  for (const name of ['Topographic map', 'Parks & open space', 'Reported incidents', 'Public transport']) {
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  await expect(page.locator('.topography-overlay')).toBeVisible();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  const card = page.locator('.cards > .card[data-area-id]').first();
  const districtId = await card.getAttribute('data-area-id');
  await card.locator('.card-title').click();
  const highlighted = page.locator('.selected-district-cell');
  await expect.poll(() => highlighted.count()).toBeGreaterThan(0);
  const analysis = await page.request.get('/data/area_cells.geojson').then((r) => r.json());
  const parents = Object.fromEntries(analysis.features.map((f: { properties: { h3: string; nhood_id: string } }) => [f.properties.h3, f.properties.nhood_id]));
  const eligible = await page.locator('.leaflet-cells-pane path:is([data-match-state="strong"], [data-match-state="partial"])').evaluateAll((paths) => paths.map((p) => p.getAttribute('data-h3')!));
  const expected = eligible.filter((id) => parents[id] === districtId).sort();
  expect(await highlighted.evaluateAll((paths) => paths.map((p) => p.getAttribute('data-h3')!).sort())).toEqual(expected);
  const shape = await highlighted.first().getAttribute('d');
  const id = await highlighted.first().getAttribute('data-h3');
  await expect(page.locator(`.leaflet-cells-pane path[data-h3="${id}"]`)).toHaveAttribute('d', shape!);
  await expect(highlighted.first()).toHaveAttribute('fill-opacity', '0.6');
  expect(await page.locator('.leaflet-selection-pane').evaluate((pane) => Number(getComputedStyle(pane).zIndex))).toBeGreaterThan(430);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-district-highlight.png`, fullPage: true });
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Commute & priorities', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Topographic map', exact: true }).uncheck();
  await expect(highlighted).toHaveCount(expected.length);
  await expect(highlighted.first()).toHaveAttribute('fill-opacity', '0.6');
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  await page.getByRole('button', { name: '← Results' }).click();
  await expect(highlighted).toHaveCount(0);
  expect(errors).toEqual([]);
});
