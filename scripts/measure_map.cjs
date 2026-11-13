const { chromium } = require('@playwright/test');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const output = process.env.CG_PERF_OUTPUT || (process.env.CG_THROTTLE === '1' ? 'test-results/map-performance-throttled' : 'test-results/map-performance');
  fs.mkdirSync(output, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultNavigationTimeout(120000);
  page.setDefaultTimeout(45000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  const throttled = process.env.CG_THROTTLE === '1';
  if (throttled) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 100000, connectionType: 'cellular4g' });
  }
  const requestUrls = new Map(), transfers = [];
  cdp.on('Network.requestWillBeSent', e => requestUrls.set(e.requestId, e.request.url));
  cdp.on('Network.loadingFinished', e => transfers.push({ url: requestUrls.get(e.requestId), bytes: e.encodedDataLength }));
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver(list => list.getEntries().forEach(e => window.__longTasks.push({ start: e.startTime, duration: e.duration }))).observe({ type: 'longtask', buffered: true });
  });
  const started = Date.now();
  await page.goto(process.env.CG_BASE_URL || 'http://localhost:5188', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name:'Where do you need to get to?' }).waitFor();
  const controlsMs = Date.now()-started;
  await page.waitForLoadState('networkidle');
  await page.locator('.map[data-vector-loaded="true"]').waitFor({ timeout: 15000 });
  const initial = { controlsMs, ms: Date.now() - started, bytes: transfers.reduce((s, e) => s + e.bytes, 0), requests: transfers.length,
    pbfBytes: transfers.filter(e => /\.pbf/.test(e.url)).reduce((s, e) => s + e.bytes, 0),
    pbfRequests: transfers.filter(e => /\.pbf/.test(e.url)).length };
  const beforeSearch = transfers.length, searchStarted = Date.now();
  await page.getByRole('button', { name: /Try the SF/ }).click();
  await page.waitForFunction(() => Number(document.querySelector('.map')?.dataset.eligibleCount) > 0, undefined, { timeout: 90000 });
  const firstSearch = { ms: Date.now() - searchStarted, bytes: transfers.slice(beforeSearch).reduce((s, e) => s + e.bytes, 0), requests: transfers.length - beforeSearch };
  const beforeFocusedView = transfers.length;
  await page.getByRole('button', { name: 'Show pin', exact: true }).nth(1).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: '3D buildings', exact: true }).click();
  await page.waitForFunction(() => Number(document.querySelector('.map')?.dataset.buildingCount) > 0, undefined, { timeout: 45000 });
  const buildings = await page.locator('.map').evaluate(e => ({ ...e.dataset }));
  const focusedViewTransfers = transfers.slice(beforeFocusedView).filter(e => /\.pbf/.test(e.url));
  const focusedView = { vectorRequests: focusedViewTransfers.length, vectorBytes: focusedViewTransfers.reduce((s, e) => s + e.bytes, 0) };
  const beforeTerrain = transfers.length;
  await page.getByRole('button', { name: 'Terrain', exact: true }).click();
  await page.locator('.map[data-terrain-loaded="true"]').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const terrainTransfers = transfers.slice(beforeTerrain).filter(e => /\/data\/terrain\/|tiles\.mapterhorn\.com.*\.webp/.test(e.url));
  const terrain = { requests: terrainTransfers.length, bytes: terrainTransfers.reduce((s, e) => s + e.bytes, 0),
    map: await page.locator('.map').evaluate(e => ({ ...e.dataset })) };
  await page.evaluate(() => {
    window.__mapFrames = []; window.__measureFrames = true;
    let previous = performance.now();
    const frame = now => { window.__mapFrames.push(now - previous); previous = now; if (window.__measureFrames) requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
  });
  const bounds = await page.locator('.map').boundingBox();
  const dragX = bounds.x + bounds.width * 0.75, dragY = bounds.y + bounds.height * 0.5;
  await page.mouse.move(dragX, dragY); await page.mouse.down();
  await page.mouse.move(dragX - 160, dragY + 30, { steps: 24 }); await page.mouse.up();
  await page.waitForTimeout(500);
  const frames = await page.evaluate(() => { window.__measureFrames = false; return window.__mapFrames; });
  const sortedFrames = frames.slice().sort((a, b) => a - b);
  const interaction = { frameSamples: frames.length, meanFrameMs: frames.reduce((s, value) => s + value, 0) / frames.length,
    p95FrameMs: sortedFrames[Math.floor(sortedFrames.length * 0.95)], maxFrameMs: Math.max(...frames) };
  const tasks = await page.evaluate(() => window.__longTasks);
  const heapSamples=[];
  for(let i=0;i<5;i++) {
    await page.mouse.move(dragX,dragY);await page.mouse.down();await page.mouse.move(dragX-40,dragY+10,{steps:6});await page.mouse.up();
    await page.waitForTimeout(200);await cdp.send('HeapProfiler.collectGarbage');
    heapSamples.push((await cdp.send('Runtime.getHeapUsage')).usedSize);
  }
  await page.screenshot({ path: `${output}/map-3d-measured.png`, fullPage: true });
  const result = { conditions: { viewport: '1440 × 900', browser: 'Headless installed Chrome', reducedMotion: true, cpuRate: throttled ? 4 : 1,
    network: throttled ? '150 ms latency, 200000 B/s down, 100000 B/s up' : 'Unthrottled' }, initial, firstSearch, focusedView, buildings, terrain, interaction,
    longTasks: { count: tasks.length, totalMs: tasks.reduce((s, e) => s + e.duration, 0), maxMs: Math.max(0, ...tasks.map(e => e.duration)) }, heapSamples, consoleErrors };
  fs.writeFileSync(`${output}/measurements.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
