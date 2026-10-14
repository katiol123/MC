// Browser smoke test (needs Playwright: `npm i -D playwright`, or a global install).
// Starts the static server, opens the game, drives the menus with real key presses, runs a CPU
// fight, checks for JS errors and measures render + simulation cost. Screenshots go to ./smoke-shots.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright not found. Install it with: npm i -D playwright && npx playwright install chromium');
  process.exit(2);
}

const PORT = 8123;
const server = spawn(process.execPath, ['scripts/serve.js', String(PORT)], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.mkdirSync('smoke-shots', { recursive: true });
let failed = false;
try {
  await sleep(500);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${PORT}/`);
  await sleep(1500);
  await page.screenshot({ path: 'smoke-shots/1-title.png' });
  await page.keyboard.press('Enter'); // Arcade
  await sleep(500);
  for (const k of ['KeyD', 'KeyD', 'KeyF', 'KeyD', 'KeyF']) { await page.keyboard.press(k); await sleep(250); }
  await page.screenshot({ path: 'smoke-shots/2-select.png' });
  await sleep(4500); // versus splash -> fight
  const scene = await page.evaluate(() => window.__app.scene.constructor.name);
  if (scene !== 'FightScene') throw new Error(`expected FightScene, got ${scene}`);
  // play a little: walk, jab, kick, jump
  for (const k of ['KeyD', 'KeyF', 'KeyV', 'KeyW', 'KeyG']) { await page.keyboard.down(k); await sleep(120); await page.keyboard.up(k); await sleep(200); }
  await page.keyboard.press('F1');
  await sleep(1500);
  await page.screenshot({ path: 'smoke-shots/3-fight-debug.png' });
  const perf = await page.evaluate(async () => {
    const app = window.__app;
    const s = app.scene;
    const t0 = performance.now();
    let n = 0;
    while (performance.now() - t0 < 1000) { s.renderer.render(app.ctx, 0.5, { debug: s.debug, now: performance.now() }); n++; }
    const t1 = performance.now();
    let k = 0;
    while (performance.now() - t1 < 500) { s.tick(); k++; }
    return { renderMs: 1000 / n, tickMs: 500 / k, frame: s.match.frame, error: String(app.lastError || '') };
  });
  console.log('render cost per frame (ms):', perf.renderMs.toFixed(2), ' simulation tick (ms):', perf.tickMs.toFixed(3));
  if (perf.error) errors.push(perf.error);
  if (errors.length) throw new Error('JS errors:\n' + errors.join('\n'));
  console.log('smoke test OK');
  await browser.close();
} catch (e) {
  failed = true;
  console.error('SMOKE TEST FAILED:', e.message);
} finally {
  server.kill();
}
process.exit(failed ? 1 : 0);
