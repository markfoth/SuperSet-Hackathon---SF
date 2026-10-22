import { expect, test } from '@playwright/test';

test('section information keeps sources accessible while the normal panels stay concise', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'What matters to you? information', exact: true });
  await button.click();
  const priorities = page.getByRole('dialog', { name: 'What matters to you? information', exact: true });
  await expect(priorities).toBeVisible();
  await expect(priorities).toContainText('USGS');
  await expect(priorities).toContainText('straight-line');
  await expect(priorities.getByRole('link', { name: 'SFPD incident reports' })).toHaveAttribute('href', 'https://data.sf.gov/d/wg3w-h783');
  await page.keyboard.press('Escape');
  await expect(priorities).not.toBeVisible();
  await expect(button).toBeFocused();
  await page.getByRole('button', { name: 'Map layers information', exact: true }).click();
  const layers = page.getByRole('dialog', { name: 'Map layers information', exact: true });
  await expect(layers).toContainText('bars, pubs and nightclubs');
  await expect(layers).toContainText('Colma station area');
  await expect(layers.getByRole('link', { name: 'County community map' })).toBeVisible();
  await layers.getByRole('button', { name: 'Close information' }).click();
  await expect(layers).not.toBeVisible();
  await page.getByRole('checkbox', { name: 'Topographic map', exact: true }).check();
  await expect(page.locator('.sidebar .layer.active')).not.toContainText('USGS land elevation');
});

test('nightlife displays mapped density independently and selected district borders are gold', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Reset to demo', exact: true }).click();
  const cards = page.locator('.cards > .card[data-area-id]');
  await expect.poll(() => cards.count()).toBeGreaterThan(1);
  const before = await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-area-id')));
  const matching = await page.locator('.match-legend b').textContent();
  await page.getByRole('checkbox', { name: 'Nightlife', exact: true }).check();
  await expect(page.locator('.nightlife-overlay')).toBeVisible();
  await expect.poll(() => page.locator('.nightlife-overlay').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  expect(await cards.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-area-id')))).toEqual(before);
  await expect(page.locator('.match-legend b')).toHaveText(matching!);
  await expect(cards.first()).not.toContainText('Within all workplace commute limits');
  await expect(page.locator('.cards .photo-placeholder')).toHaveCount(0);
  await page.locator('.cards > .card[data-area-id="mission"] .card-title').click();
  const highlights = page.locator('.selected-district-cell');
  await expect.poll(() => highlights.count()).toBeGreaterThan(0);
  expect(await highlights.evaluateAll((paths) => paths.every((path) => path.getAttribute('stroke') === '#b8860b'))).toBe(true);
  await expect(page.locator('.match-legend')).toContainText('Gold outlines');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: `test-results/${testInfo.project.name}-nightlife-gold.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test('new county-card photos decode and clearer names reach details and rental searches', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Reset to demo', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Financial District', exact: true }).click();
  await page.getByRole('combobox', { name: 'Travel mode', exact: true }).selectOption('drive');
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: /Results \(/ }).click();
  for (const id of ['broadmoor', 'burlingame', 'country-club-park', 'unincorporated-colma', 'northern-peninsula-unincorporated-areas']) {
    const card = page.locator(`.cards > .card[data-area-id="${id}"]`);
    await expect(card).toBeVisible();
    const image = card.locator('img');
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(card.locator('.card-photo-credit')).toBeVisible();
  }
  const colma = page.locator('.cards > .card[data-area-id="unincorporated-colma"]');
  await expect(colma.locator('.card-title')).toHaveText('Colma station area');
  await colma.locator('.card-title').click();
  await expect(page.locator('.detail h2')).toHaveText('Colma station area');
  await expect(page.locator('.detail a').filter({ hasText: 'Craigslist' })).toHaveAttribute('href', /query=Colma$/);
});
