import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('named scenarios survive reload and export/import keeps household context', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF \+ SFO example/ }).click();
  await expect(page.locator('.workplace')).toHaveCount(2);
  await page.getByRole('button', { name: /Scenarios/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Your scenarios' });
  await dialog.getByLabel('Scenario name').fill('Three office days, together');
  await dialog.getByLabel('Household notes').fill('Compare parks and our journey limits.');
  await dialog.getByRole('button', { name: 'Save scenario', exact: true }).click();
  await expect(dialog.locator('.scenario-row')).toContainText('Three office days, together');
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Export JSON', exact: true }).click();
  const download = await downloadPromise;
  const body = await readFile((await download.path())!, 'utf8');
  const exported = JSON.parse(body);
  expect(exported.scenario.snapshot.workplaces).toHaveLength(2);
  expect(exported.scenario.snapshot.workplaces[0].officeDays).toBe(3);
  expect(exported.includesPreciseLocations).toBe(true);
  await dialog.getByRole('button', { name: 'Close your scenarios', exact: true }).click();
  await page.reload();
  await expect(page.locator('.workplace')).toHaveCount(2);
  await page.getByRole('button', { name: /Scenarios/ }).click();
  await expect(dialog.locator('.scenario-row')).toContainText('Three office days, together');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'household.json', mimeType: 'application/json', buffer: Buffer.from(body) });
  await expect(dialog.getByRole('button', { name: 'Use imported scenario', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Use imported scenario', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.workplace')).toHaveCount(2);
  await expect(page.getByLabel('Destination label').first()).toHaveValue('SFO Airport');
  await expect(page.locator('.match-legend b')).toContainText('494 matching locations');
});

test('share links exclude precise locations by default and require a deliberate import action', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF \+ SFO example/ }).click();
  await page.getByRole('button', { name: /Scenarios/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Your scenarios' });
  await dialog.getByLabel('Scenario name').fill('Household starting point');
  await expect(dialog.getByRole('checkbox', { name: /Include precise destinations/ })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Create share link', exact: true }).click();
  const link = await dialog.getByLabel('Scenario link').inputValue();
  const encoded = new URL(link).hash.replace('#scenario=', '');
  const body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  expect(body.includesPreciseLocations).toBe(false);
  expect(body.scenario.snapshot.workplaces).toEqual([]);
  expect(body.scenario.snapshot.homes).toEqual([]);
  expect(body.scenario.snapshot.bookmarks).toEqual([]);
  await dialog.getByRole('checkbox', { name: /Include precise destinations/ }).check();
  await dialog.getByRole('button', { name: 'Create share link', exact: true }).click();
  const privateLink = await dialog.getByLabel('Scenario link').inputValue();
  const precise = JSON.parse(Buffer.from(new URL(privateLink).hash.replace('#scenario=', ''), 'base64url').toString('utf8'));
  expect(precise.includesPreciseLocations).toBe(true);
  expect(precise.scenario.snapshot.workplaces).toHaveLength(2);
  const sharedPage = await context.newPage();
  await sharedPage.goto(link);
  await expect(sharedPage.locator('.shared-banner')).toContainText('Household starting point');
  // Existing local work remains until the recipient explicitly chooses this shared copy.
  await expect(sharedPage.locator('.workplace')).toHaveCount(2);
  await sharedPage.getByRole('button', { name: 'Use shared scenario', exact: true }).click();
  await expect(sharedPage.locator('.workplace')).toHaveCount(0);
  await expect(sharedPage.getByRole('heading', { name: 'Where do you need to get to?' })).toBeVisible();
  await sharedPage.close();
});

test('specific homes keep entered costs and distinguish unknown exact journey times', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF \+ SFO example/ }).click();
  await page.getByRole('button', { name: /^Homes/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Prospective homes' });
  await dialog.getByRole('button', { name: 'Enter coordinates', exact: true }).click();
  await dialog.getByLabel('Latitude', { exact: true }).fill('37.751');
  await dialog.getByLabel('Longitude', { exact: true }).fill('-122.419');
  await dialog.getByRole('button', { name: 'Add home pin', exact: true }).click();
  await dialog.getByLabel('Home label').fill('Flat near 24th Street');
  await dialog.getByLabel('Monthly rent · USD', { exact: true }).fill('3200');
  await dialog.getByLabel('Bedrooms · optional', { exact: true }).fill('2');
  await dialog.getByLabel('Notes', { exact: true }).fill('Ask about bicycle storage.');
  await dialog.locator('summary').filter({ hasText: 'Monthly transport assumptions' }).click();
  await dialog.getByLabel('Return fare per destination day · USD', { exact: true }).fill('6');
  await dialog.getByLabel('Other transport each month · USD', { exact: true }).fill('30');
  await dialog.getByRole('button', { name: 'Save home details', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Compare home costs' })).toContainText('$3,386');
  await dialog.getByRole('button', { name: 'Check journey times', exact: true }).click();
  await expect(dialog.getByRole('region', { name: 'Exact journey estimates' })).toContainText('Not measured');
  await expect(dialog.getByRole('region', { name: 'Exact journey estimates' })).toContainText('Offline contours');
  await dialog.evaluate((node) => { node.scrollTop = 0; });
  await page.screenshot({ path: `test-results/${testInfo.project.name}-homes.png`, fullPage: true });
  await dialog.getByRole('button', { name: 'Close prospective homes', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /^Homes/ }).click();
  await expect(dialog.getByLabel('Home label')).toHaveValue('Flat near 24th Street');
  await expect(dialog.getByLabel('Monthly rent · USD', { exact: true })).toHaveValue('3200');
  await expect(dialog.getByLabel('Notes', { exact: true })).toHaveValue('Ask about bicycle storage.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('three prospective homes compare user-entered rents without borrowing ZIP precision', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Try the SF \+ SFO example/ }).click();
  await page.getByRole('button', { name: /^Homes/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Prospective homes' });
  for (const [name, rent, lon] of [['First flat', '3000', '-122.419'], ['Second flat', '3300', '-122.420'], ['Third flat', '3100', '-122.421']]) {
    await dialog.getByRole('button', { name: 'Enter coordinates', exact: true }).click();
    await dialog.getByLabel('Latitude', { exact: true }).fill('37.751');
    await dialog.getByLabel('Longitude', { exact: true }).fill(lon);
    await dialog.getByRole('button', { name: 'Add home pin', exact: true }).click();
    await dialog.getByLabel('Home label').fill(name);
    await dialog.getByLabel('Monthly rent · USD', { exact: true }).fill(rent);
    await dialog.getByRole('button', { name: 'Save home details', exact: true }).click();
  }
  const comparison = dialog.getByRole('region', { name: 'Compare home costs' });
  await expect(comparison.getByRole('columnheader')).toHaveCount(4);
  await expect(comparison).toContainText('First flat');
  await expect(comparison).toContainText('Second flat');
  await expect(comparison).toContainText('Third flat');
  await expect(comparison).toContainText('Whole-ZIP index, not a bedroom-specific property estimate');
  await expect(comparison.getByRole('row', { name: /Rent \+ transport \/ month/ })).toContainText('Incomplete costs');
});

test('scenario dialog contains keyboard focus, closes with Escape and rejects malformed imports', async ({ page }) => {
  await page.goto('/');
  const launcher = page.getByRole('button', { name: /Scenarios/ });
  await launcher.click();
  const dialog = page.getByRole('dialog', { name: 'Your scenarios' });
  await dialog.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(dialog.getByRole('alert')).toContainText('valid Common Ground JSON');
  await dialog.getByLabel('Scenario name').focus();
  for (let i = 0; i < 14; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(launcher).toBeFocused();
});
