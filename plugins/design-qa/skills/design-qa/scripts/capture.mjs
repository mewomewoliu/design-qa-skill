#!/usr/bin/env node
// Screenshot a page for a design-qa run, using Puppeteer or Playwright from the
// current project's node_modules (nothing is installed by this script).
//
//   node capture.mjs <url> <out.png> [--width 390] [--height 844] [--scale 2]
//                    [--dark] [--wait 800] [--selector "#root"] [--full]
//
// For multi-step journeys, drive the browser with your own tools and use this only
// for simple single-state captures.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const a = process.argv.slice(2);
const [url, out] = a.filter((x, i) => !x.startsWith('--') && !(a[i - 1] || '').match(/^--(width|height|scale|wait|selector)$/));
if (!url || !out) { console.error('Usage: node capture.mjs <url> <out.png> [--width 390 --height 844 --scale 2 --dark --wait 800 --selector css --full]'); process.exit(2); }
const opt = (k, d) => { const i = a.indexOf(`--${k}`); return i > -1 ? a[i + 1] : d; };
const width = +opt('width', 390), height = +opt('height', 844), scale = +opt('scale', 2), wait = +opt('wait', 800);
const selector = opt('selector'), dark = a.includes('--dark'), full = a.includes('--full');

// Look in the current folder, then in immediate subfolders (demo apps often live in one).
const cwd = process.cwd();
const roots = [cwd, ...fs.readdirSync(cwd, { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(path.join(cwd, d.name, 'node_modules'))).map((d) => path.join(cwd, d.name))];
const tryLoad = (m) => {
  for (const r of roots) { try { return createRequire(path.join(r, 'noop.js'))(m); } catch { /* next */ } }
  return null;
};

const pptr = tryLoad('puppeteer');
const pw = !pptr && (tryLoad('playwright') || tryLoad('@playwright/test'));
if (!pptr && !pw) { console.error('Neither puppeteer nor playwright is installed in this project. Use your browser tool to capture instead.'); process.exit(3); }

if (pptr) {
  const browser = await pptr.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  if (dark) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.goto(url, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, wait));
  const target = selector ? await page.$(selector) : page;
  await target.screenshot({ path: out, ...(selector ? {} : { fullPage: full }) });
  await browser.close();
} else {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: dark ? 'dark' : 'light' });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(wait);
  await (selector ? page.locator(selector) : page).screenshot({ path: out, ...(selector ? {} : { fullPage: full }) });
  await browser.close();
}
console.log(`Saved ${out}`);
