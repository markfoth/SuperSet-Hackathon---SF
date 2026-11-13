import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const folder = 'docs/audit/desktop-panel-framing';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  await page.goto(process.env.CG_BASE_URL || 'http://localhost:5194/');
  await page.locator('.map[data-vector-loaded="true"]').waitFor({ timeout: 45000 });
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await page.waitForFunction(() => document.querySelector('.map')?.getAttribute('data-eligible-count') === '494');
  await page.getByRole('button', { name: 'Show pin', exact: true }).first().click();
  await page.waitForTimeout(800);
  for (const state of ['both', 'left-collapsed', 'both-collapsed', 'right-collapsed', 'both-restored']) {
    if (state === 'left-collapsed') await page.getByRole('button', { name: 'Collapse your search', exact: true }).click();
    if (state === 'both-collapsed') await page.getByRole('button', { name: 'Collapse matches', exact: true }).click();
    if (state === 'right-collapsed') await page.getByRole('button', { name: 'Show your search', exact: true }).click();
    if (state === 'both-restored') await page.getByRole('button', { name: 'Show matches', exact: true }).click();
    await page.waitForTimeout(250);
    // Fit locations is re-run after each layout to exercise the active inset calculation.
    await page.getByRole('button', { name: 'Fit locations', exact: true }).click();
    await page.waitForTimeout(500);
    const result = await page.evaluate(() => {
      const container = document.querySelector('.map');
      const map = container.__commonGroundMap;
      const left = document.querySelector('.criteria-panel').getBoundingClientRect();
      const right = document.querySelector('.matches-panel').getBoundingClientRect();
      const view = container.getBoundingClientRect();
      const minX = left.width ? left.right : view.left;
      const maxX = right.width ? right.left : view.right;
      const pins = [...document.querySelectorAll('.cg-destination-pin')].map(node => {
        const box = node.getBoundingClientRect();
        return { name: node.getAttribute('aria-label'), x: box.x + box.width / 2,
          visible: box.x + box.width / 2 > minX && box.x + box.width / 2 < maxX };
      });
      const controls = [...document.querySelectorAll('.map-topline button, .layers-toggle, .map-navigation button')].map(node => {
        const box = node.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
        return { name: node.getAttribute('aria-label') || node.textContent.trim(), reachable: hit === node || node.contains(hit) };
      });
      return { camera: { zoom: map.getZoom(), centre: map.getCenter().toArray() }, padding: map.getPadding(), visibleMap: { minX, maxX, width: maxX - minX }, pins, controls };
    });
    results.push({ width, height, state, ...result });
    await page.screenshot({ path: `${folder}/${width}-${state}.png` });
  }
  await page.close();
}
await writeFile(`${folder}/checks.json`, JSON.stringify(results, null, 2));
await browser.close();
const failures = results.flatMap(result => [
  ...result.pins.filter(pin => !pin.visible).map(pin => `${result.width}/${result.state}: hidden pin ${pin.name}`),
  ...result.controls.filter(control => !control.reachable).map(control => `${result.width}/${result.state}: obscured control ${control.name}`),
]);
console.log(JSON.stringify({ states: results.length, failures }, null, 2));
if (failures.length) process.exitCode = 1;
