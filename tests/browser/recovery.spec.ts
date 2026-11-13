import { expect, test } from '@playwright/test';
import { makeScenario, makeShareLink } from '../../src/features/scenarios/model';

test('opening defers matching geometry and failed analysis never confirms locations', async ({ page }) => {
  const analysisRequests: string[] = [];
  page.on('request', request => { if (/area_cell(s|_display)\.geojson/.test(request.url())) analysisRequests.push(request.url()); });
  await page.route('**/data/area_cells.geojson', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.map')).toHaveAttribute('data-map-ready', 'true');
  expect(analysisRequests).toEqual([]);
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await expect(page.getByRole('alert')).toContainText('Local measurements could not load');
  await expect(page.locator('.match-legend b')).toContainText('0 matching locations');
  await page.unroute('**/data/area_cells.geojson');
  await page.getByRole('button', { name: 'Retry local data', exact: true }).click();
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
});

test('corrupted local workspace is preserved until an explicit replacement', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('recovery-seeded')) { localStorage.setItem('cg:household-workspace:v1', '{broken'); localStorage.setItem('recovery-seeded', '1'); } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where do you need to get to?' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('saved household could not be read');
  expect(await page.evaluate(() => localStorage.getItem('cg:household-workspace:v1'))).toBe('{broken');
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await page.reload();
  await expect(page.locator('.workplace')).toHaveCount(2);
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
});

test('same-tab share links are noticed without replacing current work', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF/ }).click();
  const scenario = makeScenario('A shared starting point', '', { workplaces: [], prefs: { parks: 'important' }, priorityOrder: ['parks'], shortlist: [], bookmarks: [], homes: [] });
  const url = makeShareLink(scenario, false, 'http://localhost:5187/');
  await page.evaluate(hash => { location.hash = hash; }, new URL(url).hash);
  await expect(page.locator('.shared-banner')).toContainText('A shared starting point');
  await expect(page.locator('.workplace')).toHaveCount(2);
  await page.getByRole('button', { name: 'Use shared scenario', exact: true }).click();
  await expect(page.locator('.workplace')).toHaveCount(0);
});

test('keyboard map pin placement and a no-overlap search remain recoverable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', {name:'Add your destinations',exact:true}).click();
  await page.getByRole('button', { name: 'Place a pin on the map', exact: true }).click();
  const canvas = page.locator('.maplibregl-canvas');
  await canvas.focus(); await canvas.press('Enter');
  await expect(page.locator('.workplace')).toHaveCount(1);
  await expect(page.locator('.selected-place b')).toHaveText('Pinned location');
  await page.getByRole('button', { name: 'Reset to demo', exact: true }).click();
  for (const card of await page.locator('.workplace').all()) {
    await card.getByRole('combobox', { name: 'Travel mode', exact: true }).selectOption('walk');
    await card.getByRole('combobox', { name: 'Maximum commute', exact: true }).selectOption('15');
  }
  await expect(page.locator('.match-legend b')).toContainText('0 matching locations');
  await page.getByRole('button', { name: /^Matches/ }).click();
  await expect(page.locator('.results')).toContainText('No confirmed matches yet');
  await page.getByRole('button', { name: 'Your search', exact: true }).click();
  await page.getByRole('button', { name: 'Reset to demo', exact: true }).click();
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
});
