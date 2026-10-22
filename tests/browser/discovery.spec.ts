import { expect, test } from '@playwright/test';

test('workplace → priorities → local cell → neighbourhood → shortlist', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.match-legend b')).toContainText(/\d+ eligible cells/);
  await expect(page.locator('.leaflet-cells-pane path[role="button"]')).toHaveCount(2408);
  await expect(page.locator('.sidebar')).toBeVisible();
  await expect(page.locator('.workplace')).toHaveCount(2);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-overview.png`, fullPage: true });
  const flat = page.locator('.pref').filter({ hasText: 'Flatter streets' });
  await flat.getByRole('radio', { name: 'Important', exact: true }).click();
  await expect(flat.getByRole('radio', { name: 'Important', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(flat).toContainText('eligible cells excluded');
  await page.getByRole('button', { name: 'Move Flatter streets down', exact: true }).click();
  await expect(page.locator('.pref').first()).toContainText('Frequent buses');
  await page.reload();
  await expect(page.locator('.pref').first()).toContainText('Frequent buses');
  await expect(page.locator('.match-legend b')).toContainText(/\d+ eligible cells/);
  await page.locator('.leaflet-cells-pane path[role="button"][fill="#27824d"]').first().press('Enter');
  await expect(page.getByRole('region', { name: 'Selected local cell' })).toBeVisible();
  await expect(page.locator('.cell-detail')).toContainText('DEM-derived');
  await expect(page.locator('.detail-photo img')).toBeVisible();
  await page.screenshot({ path: `test-results/${testInfo.project.name}-cell.png`, fullPage: true });
  await page.getByRole('button', { name: 'Save', exact: false }).last().click();
  await expect(page.locator('.shortlist-count')).toContainText('1 saved');
  await page.getByRole('button', { name: '← Results' }).click();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Commute & priorities', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Hills & street gradients', exact: true })).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Topographic map', exact: true }).check();
  await expect(page.locator('.topography-overlay')).toBeVisible();
  await expect.poll(() => page.locator('.topography-overlay').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.map-layer-error')).toHaveCount(0);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-discovery.png`, fullPage: true });
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('custom workplace never silently loses its unavailable commute', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.match-legend b')).toContainText(/\d+ eligible cells/);
  await page.getByRole('button', { name: '+ Add workplace' }).click();
  const map = await page.locator('.map').boundingBox();
  await page.mouse.click(map!.x + map!.width * 0.6, map!.y + map!.height * 0.45);
  await expect(page.locator('.workplace')).toHaveCount(3);
  await expect(page.locator('.match-legend b')).toContainText('0 eligible cells');
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  await expect(page.locator('.results .notice.error')).toContainText('Commute can’t be calculated');
  await expect(page.locator('.cards > .card')).toHaveCount(0);
  await expect(page.locator('.map')).toHaveClass(/leaflet-container/);
});

test('near misses remain excluded until a deliberate relaxation; missing routes become grey', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.match-legend b')).toContainText(/\d+ eligible cells/);
  const flat = page.locator('.pref').filter({ hasText: 'Flatter streets' });
  await flat.getByRole('radio', { name: 'Must', exact: true }).click();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  await expect(page.locator('.near-misses')).toBeVisible();
  await page.locator('.near-miss').first().click();
  await expect(page.locator('.cell-detail')).toHaveClass(/excluded/);
  const excluded = page.locator('.leaflet-cells-pane path[data-match-state="excluded"]');
  expect(await excluded.count()).toBeGreaterThan(0);
  expect(await excluded.evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).display === 'none'))).toBe(true);
  await expect(excluded.first()).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('.match-legend')).not.toContainText('Excluded');
  // Showing excluded results in the panel must never make them visible on the map.
  await page.getByRole('button', { name: '← Results' }).click();
  await page.getByRole('button', { name: 'Show other areas', exact: true }).click();
  expect(await excluded.evaluateAll((cells) => cells.every((cell) => getComputedStyle(cell).display === 'none'))).toBe(true);
  await page.locator('.near-miss').first().click();
  await expect(page.locator('.cell-detail')).toContainText('needs median DEM-derived street grade under 8%');
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Commute & priorities', exact: true }).click();
  await flat.getByRole('radio', { name: 'Important', exact: true }).click();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  await expect(page.locator('.cell-detail')).toHaveClass(/partial/);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Commute & priorities', exact: true }).click();
  await page.getByRole('button', { name: 'Remove SFO Airport', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Financial District', exact: true }).click();
  await expect(page.locator('.match-legend b')).toContainText('0 eligible cells');
  await expect(page.locator('.leaflet-cells-pane path[fill="#858e9b"]').first()).toBeAttached();
});

test('rent sorting keeps feasible results and unknown prices last; map emphasises shared overlap', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect.poll(() => page.locator('.cards > .card[data-area-id]').count()).toBeGreaterThan(1);
  const outlines = page.locator('.individual-isochrone');
  await expect(outlines.first()).toHaveAttribute('stroke-opacity', '0.2');
  expect(await outlines.evaluateAll((paths) => paths.every((p) => p.getAttribute('stroke-opacity') === '0.2'))).toBe(true);
  await expect(page.locator('.commute-overlap').first()).toHaveAttribute('stroke-opacity', '1');
  await expect(page.locator('.commute-overlap').first()).toHaveAttribute('stroke-width', '5');
  await expect(page.locator('.commute-overlap').first()).not.toHaveAttribute('stroke-dasharray');
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  const cards = page.locator('.cards > .card[data-area-id]');
  const original = await cards.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-area-id')!));
  const metrics = (await page.request.get('/data/neighbourhood_metrics.json').then((r) => r.json())).neighbourhoods;
  const sort = page.getByRole('combobox', { name: 'Sort by', exact: true });
  await expect(cards.first()).toContainText(/\d+ areas? found/);
  await expect(cards.first()).not.toContainText('candidate cells fit');
  for (const direction of ['rent-asc', 'rent-desc']) {
    await sort.selectOption(direction);
    const ids = await cards.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-area-id')!));
    expect([...ids].sort()).toEqual([...original].sort());
    const prices: (number | null)[] = ids.map((id) => metrics[id].rents?.typical_rent_zip_weighted ?? null);
    const known = prices.filter((v): v is number => v != null);
    expect(known).toEqual([...known].sort((a, b) => direction === 'rent-asc' ? a - b : b - a));
    const firstMissing = prices.indexOf(null);
    if (firstMissing >= 0) expect(prices.slice(firstMissing).every((p) => p == null)).toBe(true);
  }
  await page.reload();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  await expect(sort).toHaveValue('rent-desc');
  await sort.selectOption('recommended');
  await expect.poll(() => cards.evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-area-id')!))).toEqual(original);
});

test('saved neighbourhood comparison and independent context layers', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.match-legend b')).toContainText(/\d+ eligible cells/);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  await page.getByRole('button', { name: 'Save to shortlist', exact: true }).nth(0).click();
  await page.getByRole('button', { name: 'Save to shortlist', exact: true }).nth(0).click();
  await page.getByRole('button', { name: '♥ 2 saved', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Compare shortlist' })).toBeVisible();
  await expect(page.locator('.comparison')).toContainText('ZIP-level asking rent');
  await expect(page.locator('.comparison thead th')).toHaveCount(3);
  await page.getByRole('button', { name: 'Close comparison', exact: true }).click();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Commute & priorities', exact: true }).click();
  const parks = page.getByRole('checkbox', { name: 'Parks & open space', exact: true });
  const crime = page.getByRole('checkbox', { name: 'Reported incidents', exact: true });
  const transit = page.getByRole('checkbox', { name: 'Public transport', exact: true });
  await parks.check(); await crime.check(); await transit.check();
  await expect(page.locator('.leaflet-context-fill-pane canvas')).toBeVisible();
  await crime.uncheck(); await expect(parks).toBeChecked(); await expect(transit).toBeChecked();
  await expect(page.locator('.map-layer-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('Peninsula cells show local evidence and missing incidents stay unknown under a Must', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.locator('.match-legend b')).toContainText(/\d+ eligible cells/);
  const cell = page.locator('.leaflet-cells-pane path[aria-label^="South San Francisco, cell"]:is([data-match-state="strong"], [data-match-state="partial"])').first();
  await cell.press('Enter');
  await expect(page.locator('.detail h2')).toHaveText('South San Francisco');
  await expect(page.locator('.detail')).toContainText('Peninsula city grouping');
  await expect(page.locator('.detail')).toContainText('Local incident and injury-crash data are unavailable');
  await expect(page.locator('.detail-photo img')).toBeVisible();
  await expect.poll(() => page.locator('.detail-photo img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.locator('.detail a').filter({ hasText: 'Craigslist' })).toHaveAttribute('href', /\/search\/pen\/apa/);
  await expect(page.locator('.detail a').filter({ hasText: 'Zillow' })).toHaveAttribute('href', /San%20Mateo%20County/);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Commute & priorities', exact: true }).click();
  await page.locator('.pref').filter({ hasText: 'Fewer reported incidents' }).getByRole('radio', { name: 'Must', exact: true }).click();
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  await expect(page.locator('.cell-detail')).toHaveClass(/unknown/);
  await expect(page.locator('.cell-detail')).toContainText('Required information unavailable');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-peninsula.png`, fullPage: true });
});
