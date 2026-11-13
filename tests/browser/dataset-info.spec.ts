import { expect, test } from '@playwright/test';

test('sources stay accessible with keyboard focus restoration', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await page.getByRole('button', { name: /Make it feel like home/ }).click();
  const button = page.getByRole('button', { name: 'What matters to you? information', exact: true });
  await button.click();
  const priorities = page.getByRole('dialog', { name: 'What matters to you? information', exact: true });
  await expect(priorities).toContainText('USGS');
  await expect(priorities).toContainText('straight-line');
  await page.keyboard.press('Escape');
  await expect(button).toBeFocused();
  await page.getByRole('button', { name: /Map layers/, exact: false }).click();
  await page.getByRole('button', { name: 'Map layers information', exact: true }).click();
  const layers = page.getByRole('dialog', { name: 'Map layers information', exact: true });
  await expect(layers).toContainText('bars, pubs and nightclubs');
  await layers.getByRole('button', { name: 'Close information', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Topographic map', exact: true }).check();
  await expect(page.locator('.map')).toHaveAttribute('data-context-loaded', /topography/);
});

test('nightlife and photos provide context without changing matching', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
  await page.getByRole('button', { name: /Map layers/ }).click();
  await page.getByRole('checkbox', { name: 'Nightlife', exact: true }).check();
  await expect(page.locator('.map')).toHaveAttribute('data-context-loaded', /nightlife/);
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByRole('button', { name: /^Matches/ }).click();
  const first = page.locator('.cards > .card').first();
  await expect.poll(() => first.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(first.locator('.card-photo-credit')).toBeVisible();
});
