// Public-example review captures. Uses an isolated browser, never the user's stored household.
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output = 'docs/review';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const evidence = [];
for (const [name, width, height] of [['desktop', 1440, 900], ['tablet', 1024, 768], ['mobile', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.CG_BASE_URL || 'http://localhost:4173/');
  await page.getByRole('heading', { name: 'Where do you need to get to?' }).waitFor();
  await page.locator('.map[data-vector-loaded="true"]').waitFor({ timeout: 30000 });
  await page.screenshot({ path: `${output}/${name}-opening.png` });
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await page.getByRole('button', { name: 'Explore your matches', exact: true }).click();
  await page.locator('.cards > .card').first().waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${output}/${name}-matches.png` });
  await page.locator('.card-title').first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${output}/${name}-detail.png` });
  if (name === 'desktop') {
    await page.getByRole('button', { name: /Results$/ }).click();
    await page.getByRole('button', { name: 'Your search', exact: true }).click();
    await page.getByRole('button', { name: 'Show pin', exact: true }).nth(1).click();
    await page.getByRole('button', { name: 'Explore', exact: true }).click();
    await page.getByRole('button', { name: 'Terrain', exact: true }).click();
    await page.locator('.map[data-terrain-loaded="true"]').waitFor({ timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Focus on map', exact: false }).click();
    await page.screenshot({ path: `${output}/desktop-explore.png` });
    await page.getByRole('button', { name: /Scenarios/ }).click();
    await page.getByLabel('Scenario name').fill('Three office days, together');
    await page.getByLabel('Household notes').fill('Start with the commute. Visit our shortlist after work.');
    await page.screenshot({ path: `${output}/desktop-scenarios.png` });
    await page.keyboard.press('Escape');
  }
  evidence.push({ viewport: `${width} × ${height}`, errors, renderer: await page.locator('.map').getAttribute('data-renderer'), horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), map: await page.locator('.map').evaluate(node => ({ ...node.dataset })) });
  await page.close();
}
await writeFile(`${output}/screenshots.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
await browser.close();
