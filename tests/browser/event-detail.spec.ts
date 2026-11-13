import { expect, test, type Page } from '@playwright/test';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { FeatureCollection, Point, Polygon, MultiPolygon } from 'geojson';
import type { Map as GLMap, GeoJSONSource } from 'maplibre-gl';

type MapElement = HTMLElement & { __commonGroundMap: GLMap };
type Kind = 'crime' | 'collisions';

test.describe('desktop published event detail', () => {
  test.skip(({ isMobile }) => isMobile, 'Desktop refinement verification only');
  test.setTimeout(90000);

  async function openMap(page: Page, demo = false) {
    await page.goto('/');
    await expect(page.locator('.map[data-renderer="maplibre"]')).toHaveAttribute('data-map-ready', 'true');
    if (demo) {
      await page.getByRole('button', { name: /Try.*example/ }).click();
      await expect(page.locator('.map')).toHaveAttribute('data-eligible-count', /^[1-9]\d*$/);
    }
    await page.getByRole('button', { name: /Focus on map/ }).click();
    await page.locator('.layers-toggle').click();
  }

  async function snapshot(page: Page, kind: Kind) {
    return page.evaluate(async kind => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      const overview = map.getSource(`context-${kind}-overview`) as GeoJSONSource | undefined;
      const points = map.getSource(`context-${kind}-details`) as GeoJSONSource | undefined;
      if (!overview || !points) return null;
      const grid = await overview.getData() as FeatureCollection;
      const detail = await points.getData() as FeatureCollection;
      return { gridTotal: grid.features.reduce((n, f) => n + Number(f.properties?.total ?? 0), 0),
        pointTotal: detail.features.reduce((n, f) => n + Number(f.properties?.total ?? 0), 0),
        pointCount: detail.features.length, period: detail.features[0]?.properties?.period,
        detailVisibility: map.getLayoutProperty(`context-${kind}-points`, 'visibility'),
        layerCount: map.getStyle().layers.filter(layer => layer.id.startsWith(`context-${kind}-`)).length,
        sourceCount: Object.keys(map.getStyle().sources).filter(id => id.startsWith(`context-${kind}-`)).length };
    }, kind);
  }

  test('incident filters share counts and a visible intersection marker wins over a matching cell', async ({ page }) => {
    const eventsRequested: string[] = [];
    page.on('request', request => { if (/\/(incident|crash)_details\.json/.test(request.url())) eventsRequested.push(request.url()); });
    await openMap(page, true);
    expect(eventsRequested).toEqual([]);
    await page.getByRole('checkbox', { name: 'Reported incidents', exact: true }).check();
    await expect.poll(async () => (await snapshot(page, 'crime'))?.pointTotal).toBe(47808);
    const all = await snapshot(page, 'crime');
    expect(all?.gridTotal).toBe(all?.pointTotal);
    expect(all?.pointCount).toBe(5457);
    expect(all?.detailVisibility).toBe('none');
    await page.getByRole('combobox', { name: /Incident category/ }).selectOption('property');
    await page.getByLabel('Incident from month', { exact: true }).fill('2026-07');
    const raw = await (await page.request.get('/data/incident_details.json')).json();
    const expected = raw.records.reduce((n: number, row: [number, number, number[], number, number]) =>
      n + (raw.months[row[1]] >= '2026-07' && (row[3] & 2) ? row[4] : 0), 0);
    await expect.poll(async () => (await snapshot(page, 'crime'))?.pointTotal).toBe(expected);
    const filtered = await snapshot(page, 'crime');
    expect(filtered?.gridTotal).toBe(expected);
    expect(filtered?.period).toMatch(/^Jul 2026 to Sept? 2026 \(inclusive\)$/);
    await page.getByRole('checkbox', { name: 'Show published intersection detail', exact: true }).check();
    await page.getByRole('button', { name: 'Done', exact: true }).click();

    const features = await page.evaluate(async () => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      return { points: await (map.getSource('context-crime-details') as GeoJSONSource).getData() as FeatureCollection<Point>,
        matching: await (map.getSource('matching') as GeoJSONSource).getData() as FeatureCollection<Polygon | MultiPolygon> };
    });
    const point = features.points.features.find(p => features.matching.features.some(cell => booleanPointInPolygon(p, cell)));
    expect(point, 'An actual published incident location lies over an eligible matching cell').toBeDefined();
    await page.evaluate(coordinates => {
      (document.querySelector('.map') as MapElement).__commonGroundMap.jumpTo({ center: coordinates as [number, number], zoom: 16.5, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
    }, point!.geometry.coordinates);
    await expect.poll(() => page.evaluate(coordinates => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      const p = map.project(coordinates as [number, number]);
      return { event: map.queryRenderedFeatures(p, { layers: ['context-crime-points'] }).length > 0,
        matching: map.queryRenderedFeatures(p, { layers: ['matching-fill'] }).length > 0 };
    }, point!.geometry.coordinates)).toEqual({ event: true, matching: true });
    const position = await page.evaluate(coordinates => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      const p = map.project(coordinates as [number, number]), r = map.getContainer().getBoundingClientRect();
      return { x: p.x + r.left, y: p.y + r.top };
    }, point!.geometry.coordinates);
    const selection = await page.locator('.map').getAttribute('data-selection-id');
    await page.mouse.click(position.x, position.y);
    await expect(page.locator('.event-popup')).toContainText('Reported near this intersection');
    await expect(page.locator('.event-popup')).toContainText('Published location is approximate');
    await expect(page.locator('.event-popup')).toContainText(/Jul 2026 to Sept? 2026/);
    await expect(page.locator('.event-popup')).toContainText('category totals can overlap');
    await expect(page.locator('.map')).toHaveAttribute('data-selection-id', selection ?? '');
    await page.screenshot({ path: 'docs/audit/event-detail-browser/incident-priority.png' });
    // A newly selected period must never leave the previous period's static
    // popup counts on screen beside updated markers and overview totals.
    await page.locator('.layers-toggle').click();
    await page.getByLabel('Incident from month', { exact: true }).fill('2026-08');
    await expect(page.locator('.event-popup')).toHaveCount(0);
    const august = raw.records.reduce((n: number, row: [number, number, number[], number, number]) =>
      n + (raw.months[row[1]] >= '2026-08' && (row[3] & 2) ? row[4] : 0), 0);
    await expect.poll(async () => (await snapshot(page, 'crime'))?.pointTotal).toBe(august);
    expect((await snapshot(page, 'crime'))?.gridTotal).toBe(august);
  });

  test('crash involvement filters retain overlapping groups and distinguish people from crash counts', async ({ page }) => {
    await openMap(page);
    await page.getByText('More context layers', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Injury crashes', exact: true }).check();
    await expect.poll(async () => (await snapshot(page, 'collisions'))?.pointTotal).toBe(8888);
    const raw = await (await page.request.get('/data/crash_details.json')).json();
    const totals: Record<string, number> = {};
    for (const [category, mask] of [['pedestrian', 1], ['cyclist', 2], ['vehicle_only', 4], ['fatal_severe', 8]] as const) {
      const expected = raw.records.reduce((n: number, row: [number, number, number[], number, number]) => n + (row[3] & mask ? row[4] : 0), 0);
      await page.getByRole('combobox', { name: /Injury crash category/ }).selectOption(category);
      await expect.poll(async () => (await snapshot(page, 'collisions'))?.pointTotal).toBe(expected);
      expect((await snapshot(page, 'collisions'))?.gridTotal).toBe(expected);
      totals[category] = expected;
    }
    const overlap = raw.records.filter((r: number[]) => (r[3] & 3) === 3).reduce((n: number, r: number[]) => n + r[4], 0);
    expect(overlap).toBeGreaterThan(0);
    expect(totals.vehicle_only).toBeLessThan(8888 - totals.pedestrian);
    await page.getByRole('checkbox', { name: 'Show published crash-location detail', exact: true }).check();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    const coordinates = await page.evaluate(async () => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      const fc = await (map.getSource('context-collisions-details') as GeoJSONSource).getData() as FeatureCollection<Point>;
      const point = fc.features.find(f => Number(f.properties?.fatalities) > 0 && f.geometry.coordinates[0] > -122.45 && f.geometry.coordinates[0] < -122.39 && f.geometry.coordinates[1] > 37.73)!;
      map.jumpTo({ center: point.geometry.coordinates as [number, number], zoom: 17, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
      return point.geometry.coordinates;
    });
    await expect.poll(() => page.evaluate(coordinates => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      return map.queryRenderedFeatures(map.project(coordinates as [number, number]), { layers: ['context-collisions-points'] }).length;
    }, coordinates)).toBeGreaterThan(0);
    const position = await page.evaluate(coordinates => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      const p = map.project(coordinates as [number, number]), r = map.getContainer().getBoundingClientRect();
      return { x: p.x + r.left, y: p.y + r.top };
    }, coordinates);
    await page.mouse.click(position.x, position.y);
    const popup = page.locator('.event-popup');
    await expect(popup).toContainText('Published injury-crash location');
    await expect(popup).toContainText(/unique injury crash/);
    await expect(popup).toContainText(/(?:person|people) injured \(non-fatal\)/);
    await expect(popup).toContainText(/fatalit(?:y|ies)/);
    await expect(popup).toContainText('Pedestrian and cyclist involvement can overlap');
    await expect(popup.getByRole('link')).toHaveAttribute('href', 'https://data.sf.gov/d/ubvf-ztfx');
    await page.screenshot({ path: 'docs/audit/event-detail-browser/crash-casualties.png' });
  });

  test('delayed load, rapid toggles and an actual style reload retain one source pair and five layers', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && /already exists|cannot add|not found|duplicate/i.test(message.text())) errors.push(message.text()); });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requested = false;
    await page.route('**/data/incident_details.json', async route => { requested = true; await gate; await route.continue(); });
    await openMap(page);
    const toggle = page.getByRole('checkbox', { name: 'Reported incidents', exact: true });
    await toggle.check();
    await expect.poll(() => requested).toBe(true);
    await toggle.uncheck();
    release();
    await expect.poll(async () => (await snapshot(page, 'crime'))?.layerCount).toBe(5);
    await expect.poll(() => page.evaluate(() => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      return map.getStyle().layers.filter(l => l.id.startsWith('context-crime-')).every(l => map.getLayoutProperty(l.id, 'visibility') === 'none');
    })).toBe(true);
    for (let i = 0; i < 3; i++) { await toggle.check(); await toggle.uncheck(); }
    await toggle.check();
    await page.getByRole('checkbox', { name: 'Show published intersection detail', exact: true }).check();
    await expect.poll(async () => (await snapshot(page, 'crime'))?.pointTotal).toBe(47808);
    await page.evaluate(async () => {
      const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
      const style = await (await fetch('https://tiles.openfreemap.org/styles/positron')).json();
      map.setStyle(style);
    });
    await expect.poll(async () => (await snapshot(page, 'crime'))?.pointTotal).toBe(47808);
    const after = await snapshot(page, 'crime');
    expect(after?.layerCount).toBe(5);
    expect(after?.sourceCount).toBe(2);
    expect(after?.detailVisibility).toBe('visible');
    expect(errors).toEqual([]);
  });

  test('overview popups describe an aggregate hexagon rather than one published intersection', async ({ page }) => {
    await openMap(page);
    for (const kind of ['crime', 'collisions'] as const) {
      if (kind === 'collisions') {
        await page.locator('.layers-toggle').click();
        await page.getByRole('checkbox', { name: 'Reported incidents', exact: true }).uncheck();
        await page.getByText('More context layers', { exact: true }).click();
      }
      await page.getByRole('checkbox', { name: kind === 'crime' ? 'Reported incidents' : 'Injury crashes', exact: true }).check();
      await expect.poll(async () => (await snapshot(page, kind))?.gridTotal).toBe(kind === 'crime' ? 47808 : 8888);
      const coordinates = await page.evaluate(async kind => {
        const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
        const data = await (map.getSource(`context-${kind}-overview`) as GeoJSONSource).getData() as FeatureCollection<Polygon>;
        const ring = data.features[0].geometry.coordinates[0];
        const point: [number, number] = [ring.reduce((n, p) => n + p[0], 0) / ring.length, ring.reduce((n, p) => n + p[1], 0) / ring.length];
        map.jumpTo({ center: point, zoom: 12.8, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 } });
        return point;
      }, kind);
      await expect.poll(() => page.evaluate(({ coordinates, kind }) => {
        const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
        return map.queryRenderedFeatures(map.project(coordinates), { layers: [`context-${kind}-overview-fill`] }).length;
      }, { coordinates, kind })).toBeGreaterThan(0);
      const point = await page.evaluate(coordinates => {
        const map = (document.querySelector('.map') as MapElement).__commonGroundMap;
        const p = map.project(coordinates), bounds = map.getContainer().getBoundingClientRect();
        return { x: p.x + bounds.left, y: p.y + bounds.top };
      }, coordinates);
      await page.mouse.click(point.x, point.y);
      const popup = page.locator('.event-popup');
      await expect(popup).toContainText(kind === 'crime' ? 'Reported incidents in this hexagon' : 'Injury crashes in this hexagon');
      await expect(popup).toContainText('H3 resolution 8, approximately 0.74 km²');
      await expect(popup).toContainText('aggregate area, not one intersection');
      await expect(popup).not.toContainText('Reported near this intersection');
      await page.screenshot({ path: `docs/audit/event-detail-browser/overview-${kind}.png` });
    }
  });
});
