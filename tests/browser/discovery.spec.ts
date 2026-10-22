import { expect, test } from '@playwright/test';

test('workplace → priorities → local cell → neighbourhood → shortlist', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.match-legend b')).toContainText(/\d+ eligible cells/);
  await expect(page.locator('.leaflet-cells-pane path[role="button"]')).toHaveCount(1226);
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
  await page.getByRole('checkbox', { name: 'Hills & street gradients', exact: true }).check();
  // Street gradients deliberately appear only at street zoom, to avoid city-wide clutter.
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect(page.locator('.map')).not.toHaveClass(/leaflet-zoom-anim/);
  }
  await expect(page.locator('.leaflet-context-lines-pane canvas').first()).toBeVisible({ timeout: 20000 });
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
  const crime = page.getByRole('checkbox', { name: 'Reported crime', exact: true });
  const transit = page.getByRole('checkbox', { name: 'Public transport', exact: true });
  await parks.check(); await crime.check(); await transit.check();
  await expect(page.locator('.leaflet-context-fill-pane canvas')).toBeVisible();
  await crime.uncheck(); await expect(parks).toBeChecked(); await expect(transit).toBeChecked();
  await expect(page.locator('.map-layer-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});
