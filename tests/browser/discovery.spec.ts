import { expect, test, type Page } from '@playwright/test';

async function example(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
}

test('priorities, details, bookmarks and map selection stay synchronised', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await example(page);
  await page.getByRole('button', { name: /Make it feel like home/ }).click();
  const flat = page.locator('.pref').filter({ hasText: 'Flatter streets' });
  await flat.getByRole('radio', { name: 'Important', exact: true }).click();
  await expect(flat).toContainText('eligible cells excluded');
  await page.getByRole('button', { name: 'Move Flatter streets down', exact: true }).click();
  await expect(page.locator('.pref').first()).toContainText('Frequent buses');
  await page.getByRole('button', { name: /^Matches/ }).click();
  const first = page.locator('.cards > .card[data-area-id]').first();
  const id = await first.getAttribute('data-area-id');
  await first.locator('.card-title').click();
  await expect(page.locator('.map')).toHaveAttribute('data-selection-id', id!);
  await page.locator('.local-choices button').first().click();
  await expect(page.getByRole('region', { name: 'Selected local cell' })).toBeVisible();
  const cell = await page.locator('.map').getAttribute('data-selection-id');
  expect(cell).toMatch(/^[0-9a-f]+$/);
  await page.getByRole('button', { name: '+ Bookmark this location', exact: true }).click();
  await page.getByRole('button', { name: 'Shortlist 1', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare your shortlist' });
  await expect(dialog).toContainText('Settings unchanged since saved');
  await dialog.locator('.bookmark-notes textarea').fill('Visit after work.');
  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Shortlist 1', exact: true }).click();
  await expect(dialog.locator('.bookmark-notes textarea')).toHaveValue('Visit after work.');
  expect(errors).toEqual([]);
});

test('three neighbourhoods compare and rent sorting preserves the eligible set', async ({ page }) => {
  await example(page);
  await page.getByRole('button', { name: /^Matches/ }).click();
  const cards = page.locator('.cards > .card[data-area-id]');
  const original = await cards.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-area-id')));
  for (const sort of ['rent-asc', 'rent-desc', 'recommended']) {
    await page.getByRole('combobox', { name: 'Sort by', exact: true }).selectOption(sort);
    const ids = await cards.evaluateAll(nodes => nodes.map(n => n.getAttribute('data-area-id')));
    expect([...ids].sort()).toEqual([...original].sort());
  }
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Save to shortlist', exact: true }).first().click();
  await page.getByRole('button', { name: 'Shortlist 3', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare your shortlist' });
  await expect(dialog.locator('thead th')).toHaveCount(4);
  await expect(dialog).toContainText('ZIP overlap asking-rent index');
  await expect(dialog).toContainText('No exact time inferred');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Shortlist 3', exact: true })).toBeFocused();
});

test('Must-have relaxation is previewed before it changes eligibility', async ({ page }) => {
  await example(page);
  await page.getByRole('button', { name: /Make it feel like home/ }).click();
  await page.locator('.pref').filter({ hasText: 'Flatter streets' }).getByRole('radio', { name: 'Must', exact: true }).click();
  const before = await page.locator('.match-legend b').textContent();
  await page.locator('.tradeoff-panel summary').click();
  await page.getByRole('button', { name: 'Relax Flatter streets', exact: true }).click();
  await expect(page.locator('.tradeoff-preview')).toContainText('newly available');
  await expect(page.locator('.match-legend b')).toHaveText(before!);
  await page.getByRole('button', { name: 'Apply this change', exact: true }).click();
  await expect(page.locator('.pref').filter({ hasText: 'Flatter streets' }).getByRole('radio', { name: 'Important', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
});

test('Peninsula missing incidents remain unknown, and excluded cells stay off the map', async ({ page }) => {
  await example(page);
  await page.getByRole('button', { name: /Make it feel like home/ }).click();
  await page.locator('.pref').filter({ hasText: 'Fewer reported incidents' }).getByRole('radio', { name: 'Must', exact: true }).click();
  await page.getByRole('button', { name: /^Matches/ }).click();
  await page.getByRole('button', { name: 'Show exclusions', exact: true }).click();
  const peninsula = page.locator('.cards.excluded .card').filter({ hasText: 'South San Francisco' });
  await expect(peninsula).toContainText('Insufficient information');
  await peninsula.locator('.card-title').click();
  await expect(page.locator('.detail')).toContainText('Local incident and injury-crash data are unavailable');
  await expect(page.locator('.detail')).toContainText('Required evidence unavailable');
  await expect(page.locator('.map')).toHaveAttribute('data-excluded-visible', '0');
});

test('focus-on-map and destination dragging work at every screen size', async ({ page }) => {
  await example(page);
  await page.getByRole('button', { name: 'Focus on map', exact: false }).click();
  await expect(page.locator('.decision-panel')).not.toBeVisible();
  const pin = page.locator('.cg-destination-pin').first();
  await expect(pin).toBeVisible();
  await expect(pin).toBeInViewport();
  // Focusing the map resizes the canvas. Wait for its marker layout to settle.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const box = await pin.boundingBox();
  const x = box!.x + box!.width / 2, y = box!.y + box!.height / 2;
  if (test.info().project.use.hasTouch) {
    // Use real browser touch events on the emulated phone, rather than a mouse.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 8, radiusY: 8 }] });
    for (let step = 1; step <= 10; step++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + step * 5, y: y - step * 3.5, id: 1, radiusX: 8, radiusY: 8 }] });
      await page.waitForTimeout(20); // A gesture with a realistic sequence of movement samples.
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else {
    await page.mouse.move(x, y);
    await page.mouse.down(); await page.mouse.move(x + 50, y - 35, { steps: 8 }); await page.mouse.up();
  }
  await page.getByRole('button', { name: /Back to search/ }).click();
  await expect(page.locator('.workplace').first().locator('.selected-place b')).toHaveText('Pinned location');
  await expect(page.locator('.match-legend b')).toContainText('0 matching locations');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
