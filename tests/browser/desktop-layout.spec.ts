import { expect, test } from '@playwright/test';

for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  test(`desktop keeps criteria and results available at ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: /Try the SF/ }).click();
    await expect(page.locator('.cards > .card').first()).toBeVisible();
    const layout = await page.evaluate(() => {
      const left = document.querySelector('.criteria-panel')!.getBoundingClientRect();
      const right = document.querySelector('.matches-panel')!.getBoundingClientRect();
      return { left: left.width, right: right.width, mapWidth: right.left - left.right,
        overflow: document.documentElement.scrollWidth > innerWidth };
    });
    expect(layout.left).toBeGreaterThanOrEqual(300);
    expect(layout.right).toBeGreaterThanOrEqual(320);
    expect(layout.mapWidth).toBeGreaterThan(500);
    expect(layout.overflow).toBe(false);
    await expect(page.getByRole('combobox', { name: 'Travel mode', exact: true }).first()).toBeVisible();
    // Initial result framing is automatic. Deliberate pin focus is retained.
    await page.getByRole('button', { name: 'Show pin', exact: true }).first().click();
    await expect(page.locator('.map')).toHaveAttribute('data-zoom', '15.00');
    await expect(page.getByRole('button', {name:'Fit locations',exact:true})).toHaveCount(0);
    await page.getByRole('button', { name: 'Collapse your search', exact: true }).click();
    await expect(page.locator('.criteria-panel')).toBeHidden();
    await expect(page.locator('.matches-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Show your search', exact: true }).click();
    await page.getByRole('button', { name: 'Collapse matches', exact: true }).click();
    await expect(page.locator('.criteria-panel')).toBeVisible();
    await expect(page.locator('.matches-panel')).toBeHidden();
    await page.getByRole('button', { name: 'Show matches', exact: true }).click();
    await page.locator('.resultsbar').evaluate(node => { node.scrollTop = 600; });
    await expect(page.getByRole('combobox', { name: 'Sort by', exact: true })).toBeVisible();
    const leftBefore = await page.locator('.sidebar').evaluate(node => node.scrollTop);
    await page.locator('.resultsbar').evaluate(node => { node.scrollTop += 100; });
    expect(await page.locator('.sidebar').evaluate(node => node.scrollTop)).toBe(leftBefore);
    await page.locator('.cards > .card .card-title').first().click();
    await page.locator('.local-choices button').first().click();
    const selectedLocationVisible = () => page.evaluate(async () => {
      const container = document.querySelector('.map') as HTMLElement & { __commonGroundMap: import('maplibre-gl').Map };
      const map = container.__commonGroundMap;
      const data = await (map.getSource('matching') as import('maplibre-gl').GeoJSONSource).getData();
      if (data.type !== 'FeatureCollection') return false;
      const selected = data.features.find(feature => feature.properties?.h3 === container.dataset.selectionId);
      if (!selected) return false;
      const geometry = selected.geometry;
      const points = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat(2) : [];
      if (!points.length) return false;
      const lngs = points.map(point => point[0]), lats = points.map(point => point[1]);
      const target = map.project([(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2]);
      const bounds = container.getBoundingClientRect();
      const left = document.querySelector('.criteria-panel')!.getBoundingClientRect();
      const right = document.querySelector('.matches-panel')!.getBoundingClientRect();
      return target.x > (left.width ? left.right - bounds.left : 0)
        && target.x < (right.width ? right.left - bounds.left : bounds.width)
        && target.y > 0 && target.y < bounds.height;
    });
    await expect.poll(selectedLocationVisible).toBe(true);
    await page.getByRole('button', { name: 'Collapse your search', exact: true }).click();
    await expect.poll(selectedLocationVisible).toBe(true);
    await page.getByRole('button', { name: 'Show your search', exact: true }).click();
    await expect.poll(selectedLocationVisible).toBe(true);
  });
}
