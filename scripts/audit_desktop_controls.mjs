import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const folder = 'docs/audit/desktop-controls';
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await page.goto(process.env.CG_BASE_URL || 'http://localhost:5196/');
await page.locator('.map[data-vector-loaded="true"]').waitFor({ timeout: 45000 });
await page.locator('.layers-toggle').click();
await page.getByText('More context layers', { exact: true }).click();
await page.getByLabel('Air pollution (PM2.5)', { exact: true }).check();
const select = page.getByLabel('Air colour scale', { exact: true });
await select.scrollIntoViewIfNeeded();
const check = await select.evaluate(node => {
  const box = node.getBoundingClientRect(), label = node.closest('label').getBoundingClientRect();
  const font = getComputedStyle(node).font;
  const context = document.createElement('canvas').getContext('2d');
  context.font = font;
  const textWidth = context.measureText(node.selectedOptions[0].textContent).width;
  const drawer = document.querySelector('.floating-layers');
  return { width: box.width, height: box.height, labelHeight: label.height, selectedTextWidth: textWidth,
    selectedTextClipped: textWidth + 30 > box.width, drawerOverflow: drawer.scrollWidth > drawer.clientWidth };
});
await page.screenshot({ path: `${folder}/1280-air-local.png` });
await select.selectOption('statewide');
await page.screenshot({ path: `${folder}/1280-air-statewide.png` });
await writeFile(`${folder}/checks.json`, JSON.stringify(check, null, 2));
await browser.close();
console.log(JSON.stringify(check));
