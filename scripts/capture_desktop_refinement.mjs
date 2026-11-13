import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const phase = process.env.CG_PHASE || 'before';
const folder = `docs/audit/desktop-refinement-${phase}`;
await mkdir(folder, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  const p = await b.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto(process.env.CG_BASE_URL || 'http://localhost:5194/');
  await p.locator('.map[data-vector-loaded="true"]').waitFor({ timeout: 45000 });
  await p.screenshot({ path: `${folder}/${width}-opening.png` });
  await p.getByRole('button', { name: /Try the SF/ }).click();
  const explore = p.getByRole('button', { name: 'Explore your matches', exact: true });
  if (await explore.isVisible()) await explore.click();
  await p.locator('.cards > .card').first().waitFor();
  await p.waitForFunction(() => Number(document.querySelector('.map')?.dataset.eligibleCount)>0);
  await p.evaluate(async()=>{const m=document.querySelector('.map').__commonGroundMap;await Promise.race([new Promise(resolve=>m.once('idle',resolve)),new Promise(resolve=>setTimeout(resolve,2000))]);});
  await p.screenshot({ path: `${folder}/${width}-results.png` });
  results.push({ width, height, errors, overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), renderer: await p.locator('.map').getAttribute('data-renderer') });
  await p.close();
}
await writeFile(`${folder}/captures.json`, JSON.stringify(results, null, 2));
await b.close();
