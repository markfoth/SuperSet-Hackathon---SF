import { expect, test, type Page } from '@playwright/test';
import type { Map as GLMap } from 'maplibre-gl';
import { mkdir } from 'node:fs/promises';

type MapNode = HTMLElement & { __commonGroundMap: GLMap };
test.setTimeout(120000);

async function openLayers(page: Page) {
  await page.getByRole('button', { name: /Map layers/ }).click();
  await page.locator('.advanced-layers > summary').click();
}
async function camera(page: Page, center: [number, number], zoom: number, pitch = 0, bearing = 0) {
  await page.evaluate(({ center, zoom, pitch, bearing }) => {
    (document.querySelector('.map') as MapNode).__commonGroundMap.jumpTo({ center, zoom, pitch, bearing,
      padding: { top: 0, bottom: 0, left: 0, right: 0 } });
  }, { center, zoom, pitch, bearing });
}
async function visibleCount(page: Page, layer: string) {
  return page.evaluate((layer) => {
    const map = (document.querySelector('.map') as MapNode).__commonGroundMap;
    return map.getLayer(layer) ? map.queryRenderedFeatures({ layers: [layer] }).length : 0;
  }, layer);
}
async function clickCoordinate(page: Page, coordinate: [number, number]) {
  const point = await page.evaluate((coordinate) => {
    const map = (document.querySelector('.map') as MapNode).__commonGroundMap;
    const point = map.project(coordinate), rect = map.getContainer().getBoundingClientRect();
    return { x: rect.left + point.x, y: rect.top + point.y };
  }, coordinate);
  await page.mouse.click(point.x, point.y);
}

test('real POI markers take click priority and distinguish checked, mapped and missing websites', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/data/')) requests.push(request.url()); });
  await page.goto('/');
  await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded', 'true');
  await page.getByRole('button', { name: /Try.*example/ }).click();
  await expect(page.locator('.map')).toHaveAttribute('data-eligible-count', /^[1-9]\d*$/);
  await openLayers(page);
  await page.getByRole('checkbox', { name: 'Food and coffee', exact: true }).check();
  await expect(page.locator('.map')).toHaveAttribute('data-context-loaded', /food/);
  // This is the real retained OSM feature and the actual source-listed address.
  const trieste: [number, number] = [-122.4073, 37.79867];
  await camera(page, trieste, 16);
  await expect.poll(() => visibleCount(page, 'context-food-places-dots')).toBeGreaterThan(0);
  await clickCoordinate(page, trieste);
  const popup = page.locator('.maplibregl-popup-content .place-popup');
  await expect(popup).toContainText('Caffe Trieste');
  await expect(popup).toContainText('601 Vallejo Street');
  await expect(popup.getByRole('link', { name: 'Official website', exact: true })).toHaveAttribute('href', 'https://caffetrieste.com/');
  await expect(popup).toContainText('2026-11-13');
  await expect(popup.getByRole('link', { name: 'OpenStreetMap source page' })).toHaveAttribute('href', 'https://www.openstreetmap.org/node/331389010');
  await page.locator('.maplibregl-popup-close-button').click();
  const missing: [number, number] = [-122.43468, 37.79233];
  await camera(page, missing, 16.3);
  await expect.poll(() => visibleCount(page, 'context-food-places-dots')).toBeGreaterThan(0);
  await clickCoordinate(page, missing);
  await expect(popup).toContainText('Blue Bottle');
  await expect(popup).toContainText('No venue website in this source');
  await expect(popup.getByRole('link', { name: 'Official website', exact: true })).toHaveCount(0);
  await expect(popup.getByRole('link', { name: 'Web search for this place' })).toHaveAttribute('href', /^https:\/\/www\.google\.com\/search\?q=/);
  await expect(popup.getByRole('link', { name: 'OpenStreetMap source page' })).toHaveAttribute('href', 'https://www.openstreetmap.org/node/293573361');
  expect(requests.some(url => url.endsWith('/bars.geojson'))).toBe(false);
  await mkdir('test-results/screenshots/place-context', { recursive: true });
  await page.screenshot({ path: 'test-results/screenshots/place-context/missing-website.png' });
  await page.locator('.maplibregl-popup-close-button').click();
  const mapped: [number, number] = [-122.42125, 37.75643];
  await camera(page, mapped, 16.3);
  await expect.poll(() => visibleCount(page, 'context-food-places-dots')).toBeGreaterThan(0);
  await clickCoordinate(page, mapped);
  await expect(popup).toContainText('Ritual Coffee Roasters');
  await expect(popup.getByRole('link', { name: 'Venue website (listed in OSM)', exact: true })).toHaveAttribute('href', 'https://ritualroasters.com/');
  await expect(popup.getByRole('link', { name: 'Official website', exact: true })).toHaveCount(0);
});

test('nightlife and character progressively expose real clusters, venue names and sourced labels', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded', 'true');
  await openLayers(page);
  await page.getByRole('checkbox', { name: 'Nightlife', exact: true }).check();
  await expect(page.locator('.map')).toHaveAttribute('data-context-loaded', /nightlife/);
  await camera(page, [-122.421, 37.775], 11.5);
  await expect.poll(() => visibleCount(page, 'context-nightlife-places-clusters')).toBeGreaterThan(0);
  await camera(page, [-122.4215, 37.7612], 13.5);
  await expect.poll(() => visibleCount(page, 'context-nightlife-places-dots')).toBeGreaterThan(0);
  expect(await visibleCount(page, 'context-nightlife-places-clusters')).toBe(0);
  expect(await visibleCount(page, 'context-nightlife-places-names')).toBe(0);
  await camera(page, [-122.4215, 37.7612], 15.2);
  await expect.poll(() => visibleCount(page, 'context-nightlife-places-names')).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/screenshots/place-context/nightlife-street.png' });
  await page.getByRole('checkbox', { name: 'Nightlife', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Neighbourhood character', exact: true }).check();
  await expect(page.locator('.map')).toHaveAttribute('data-context-loaded', /character/);
  await camera(page, [-122.43, 37.74], 11.1);
  await expect.poll(() => visibleCount(page, 'context-character-places-broad')).toBeGreaterThan(0);
  expect(await visibleCount(page, 'context-character-places-district')).toBe(0);
  await camera(page, [-122.4146, 37.7526], 14.3, 45, 35);
  await expect.poll(() => visibleCount(page, 'context-character-places-district')).toBeGreaterThan(0);
  expect(await visibleCount(page, 'context-character-places-broad')).toBe(0);
  await clickCoordinate(page, [-122.4146, 37.7526]);
  const popup = page.locator('.maplibregl-popup-content .place-popup');
  await expect(popup).toContainText('Mission, Calle 24');
  await expect(popup).toContainText('Reviewed 2026-11-13');
  await expect(popup.getByRole('link', { name: 'Calle 24 cultural district' })).toHaveAttribute('href', 'https://www.calle24sf.org/');
  await expect(popup).toContainText('not a safety judgement or housing ranking input');
  await page.screenshot({ path: 'test-results/screenshots/place-context/character-tilted.png' });
});

test('delayed POIs survive rapid visibility changes and an actual basemap style reload without duplicate sources', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /already exists|Cannot add|not in the map|context-food/.test(message.text())) errors.push(message.text()); });
  await page.route('**/data/context/{cafes,restaurants}/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 900));
    await route.continue();
  });
  await page.goto('/');
  await expect(page.locator('.map')).toHaveAttribute('data-vector-loaded', 'true');
  await openLayers(page);
  const food = page.getByRole('checkbox', { name: 'Food and coffee', exact: true });
  await food.check(); await food.uncheck(); await food.check(); await food.uncheck(); await food.check();
  await page.evaluate(() => {
    const map = (document.querySelector('.map') as MapNode).__commonGroundMap;
    map.setStyle('https://tiles.openfreemap.org/styles/positron');
  });
  await expect.poll(() => page.evaluate(() => {
    const map = (document.querySelector('.map') as MapNode).__commonGroundMap;
    return !!map.getLayer('context-food-places-dots') && map.isSourceLoaded('context-food-places');
  })).toBe(true);
  const state = await page.evaluate(() => {
    const map = (document.querySelector('.map') as MapNode).__commonGroundMap, style = map.getStyle();
    return { sources: Object.keys(style.sources).filter(id => id.startsWith('context-food-')),
      layers: style.layers.filter(layer => layer.id.startsWith('context-food-')).map(layer => layer.id) };
  });
  expect(state.sources).toEqual(['context-food-places']);
  expect(state.layers).toHaveLength(4);
  expect(new Set(state.layers).size).toBe(4);
  await food.uncheck();
  await expect.poll(() => page.evaluate(() => {
    const map = (document.querySelector('.map') as MapNode).__commonGroundMap;
    return map.getLayoutProperty('context-food-places-dots', 'visibility');
  })).toBe('none');
  await food.check();
  await camera(page, [-122.4215, 37.7612], 14);
  await expect.poll(() => visibleCount(page, 'context-food-places-dots')).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
