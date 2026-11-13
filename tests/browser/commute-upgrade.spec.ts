import { expect, test } from '@playwright/test';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { AreaCellCollection, AreaCellDisplayCollection, CommuteFixtureFeature } from '../../src/types';

async function startExample(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Where do you need to get to?', exact: true })).toBeVisible();
  await page.locator('.example-prompt button').click();
  await expect(page.locator('.workplace')).toHaveCount(2);
  await expect.poll(async () => {
    const label = await page.locator('.match-legend b').textContent();
    return Number(label?.match(/^\d+/)?.[0] || 0);
  }).toBeGreaterThan(0);
}

test('fresh onboarding, label edits and searched-place selection have distinct semantics', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.match-legend')).toHaveCount(0);
  await expect(page.locator('.cards > .card')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Where do you need to get to?', exact: true })).toBeVisible();
  await expect(page.locator('.pref')).toHaveCount(0);
  await page.locator('.example-prompt button').click();
  await expect(page.locator('.workplace')).toHaveCount(2);
  const first = page.locator('.workplace').first();
  const selectedPlace = await first.locator('.selected-place').textContent();
  await first.getByRole('textbox', { name: 'Destination label', exact: true }).fill('Alex office label');
  await expect(first.locator('.selected-place')).toHaveText(selectedPlace!);
  await page.reload();
  await expect(page.locator('.workplace').first().getByRole('textbox', { name: 'Destination label', exact: true })).toHaveValue('Alex office label');
  await expect(first.locator('.selected-place')).toHaveText(selectedPlace!);
  await first.getByRole('button', { name: 'Change place', exact: true }).click();
  await first.getByRole('textbox', { name: 'Search local places', exact: true }).fill('Embarcadero');
  // Query text alone never moves the selected pin.
  await expect(first.locator('.selected-place')).toHaveText(selectedPlace!);
  await first.getByRole('button', { name: 'Search places', exact: true }).click();
  await expect(first.locator('.place-search-result').first()).toContainText('Embarcadero');
  await first.locator('.place-search-result').first().click();
  await expect(first.locator('.selected-place b')).toContainText('Embarcadero');
  await expect(first.getByRole('textbox', { name: 'Destination label', exact: true })).toHaveValue('Alex office label');
  await expect(first.locator('.status.error')).toContainText('No offline commute data');
  await expect(page.locator('.match-legend b')).toContainText('0 matching locations');
  await page.getByRole('button', { name: /^Matches/ }).click();
  await expect(page.locator('.cards > .card')).toHaveCount(0);
});

test('office days persist without changing eligibility; modes, adding and removing destinations work', async ({ page }) => {
  await startExample(page);
  const first = page.locator('.workplace').first();
  const before = await page.locator('.match-legend b').textContent();
  await first.locator('.journey-settings summary').click();
  await first.getByRole('combobox', { name: 'Office days per week', exact: true }).selectOption('5');
  await expect(page.locator('.match-legend b')).toHaveText(before!);
  await expect(first.getByLabel('Arrival time', { exact: true })).toBeDisabled();
  await first.getByRole('combobox', { name: 'Travel mode', exact: true }).selectOption('drive');
  await expect(first.locator('.status')).toContainText(/Synthetic/i);
  await first.getByRole('combobox', { name: 'Maximum commute', exact: true }).selectOption('30');
  await expect(first.getByRole('combobox', { name: 'Maximum commute', exact: true })).toHaveValue('30');
  await page.reload();
  await first.locator('.journey-settings summary').click();
  await expect(first.getByRole('combobox', { name: 'Office days per week', exact: true })).toHaveValue('5');
  await expect(first.getByRole('combobox', { name: 'Travel mode', exact: true })).toHaveValue('drive');
  await page.getByRole('button', { name: 'Remove Financial District', exact: true }).click();
  await expect(page.locator('.workplace')).toHaveCount(1);
  await page.getByRole('button', { name: '+ Add destination', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search local places', exact: true }).fill('Financial District');
  await page.getByRole('button', { name: 'Search places', exact: true }).click();
  await page.locator('.place-search-result').filter({ hasText: 'Example destination' }).first().click();
  await expect(page.locator('.workplace')).toHaveCount(2);
  await expect(page.locator('.workplace').last().locator('.selected-place b')).toHaveText('Financial District');
  await page.getByRole('button', { name: 'Remove Financial District', exact: true }).click();
  await page.getByRole('button', { name: 'Remove SFO Airport', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Where do you need to get to?', exact: true })).toBeVisible();
  await expect(page.locator('.match-legend')).toHaveCount(0);
});

test('unmatched addresses and outside-coverage coordinates never become selected destinations', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', {name:'Add your destinations',exact:true}).click();
  await page.getByRole('textbox', { name: 'Search local places', exact: true }).fill('123 Imaginary Street');
  await page.getByRole('button', { name: 'Search places', exact: true }).click();
  await expect(page.locator('.place-search-results')).toContainText('No named place found');
  await expect(page.locator('.workplace')).toHaveCount(0);
  await page.getByRole('button', { name: 'Use precise coordinates', exact: true }).click();
  await page.getByRole('textbox', { name: 'Latitude', exact: true }).fill('37.50');
  await page.getByRole('textbox', { name: 'Longitude', exact: true }).fill('-122.40');
  await page.getByRole('button', { name: 'Use coordinate', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('within SF to SFO');
  await expect(page.locator('.workplace')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Latitude', exact: true }).fill('37.7946');
  await page.getByRole('textbox', { name: 'Longitude', exact: true }).fill('-122.3999');
  await page.getByRole('button', { name: 'Use coordinate', exact: true }).click();
  await expect(page.locator('.workplace')).toHaveCount(1);
  await expect(page.locator('.selected-place b')).toHaveText('Pinned location');
  await expect(page.locator('.selected-place small')).toContainText('37.79460');
});

test('failed required routing data blocks matches and a deliberate retry recovers', async ({ page }) => {
  let failedOnce = false;
  await page.route('**/data/commute_fixtures.geojson', async (route) => {
    if (!failedOnce) { failedOnce = true; await route.abort('failed'); }
    else await route.continue();
  });
  await page.goto('/');
  await page.locator('.example-prompt button').click();
  await expect(page.locator('.workplace .status.error').first()).toContainText('Routing request failed');
  await expect(page.locator('.match-legend b')).toContainText('0 matching locations');
  await page.locator('.workplace .status.error').first().getByRole('button', { name: 'Retry commute', exact: true }).click();
  await expect.poll(async () => Number((await page.locator('.match-legend b').textContent())?.match(/^\d+/)?.[0] || 0)).toBeGreaterThan(0);
  await expect(page.locator('.workplace .status.error')).toHaveCount(0);
});

test('pending route evidence cannot confirm matches and stale settings cannot replace the revised commute', async ({ page }) => {
  const [cells, display, fixtures] = await Promise.all([
    page.request.get('/data/area_cells.geojson').then((response) => response.json()) as Promise<AreaCellCollection>,
    page.request.get('/data/area_cell_display.geojson').then((response) => response.json()) as Promise<AreaCellDisplayCollection>,
    page.request.get('/data/commute_fixtures.geojson').then((response) => response.json()) as Promise<{ features: CommuteFixtureFeature[] }>,
  ]);
  const footprints = new Set(display.features.map((feature) => feature.properties.h3));
  const destination = fixtures.features.find((feature) => feature.properties.workplace === 'fidi' && feature.properties.mode === 'transit' && feature.properties.minutes === 45)!.geometry;
  const count = (mode: string, minutes: number) => {
    const first = fixtures.features.find((feature) => feature.properties.workplace === 'sfo' && feature.properties.mode === mode && feature.properties.minutes === minutes)!.geometry;
    return cells.features.filter(({ properties: cell }) => footprints.has(cell.h3) && cell.residential !== false
      && booleanPointInPolygon([cell.check_lon, cell.check_lat], first)
      && booleanPointInPolygon([cell.check_lon, cell.check_lat], destination)).length;
  };
  const expected = count('drive', 15);
  expect(expected).not.toBe(count('transit', 60));
  let release!: () => void;
  const hold = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/data/commute_fixtures.geojson', async (route) => { await hold; await route.continue(); });
  await page.goto('/');
  await page.locator('.example-prompt button').click();
  await expect(page.locator('.map-badge')).toContainText('Checking every commute');
  await expect(page.locator('.match-legend b')).toContainText('0 matching locations');
  const first = page.locator('.workplace').first();
  await first.getByRole('combobox', { name: 'Travel mode', exact: true }).selectOption('drive');
  await first.getByRole('combobox', { name: 'Maximum commute', exact: true }).selectOption('15');
  release();
  await expect(first.locator('.status')).toContainText(/Synthetic/i);
  await expect(page.locator('.match-legend b')).toContainText(`${expected} matching locations`);
});
