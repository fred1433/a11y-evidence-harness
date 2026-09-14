/**
 * Cropped captures that support an observation. The outline and the caption are
 * drawn by this script before the screenshot is taken; everything else is the
 * page as it rendered. Each capture is an aid: every observation on the page is
 * written so it can be read without them.
 *
 *   node scripts/evidence-capture.mjs
 */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { USER_AGENT } from './targets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public/evidence');

const SHOTS = [
  {
    name: 'signin-login-button',
    url: 'https://app.weguide.com.au/signin?throughOption=email&canFillPreviousCredential=false&programCode=',
    selector: '#login-button',
    caption: 'aria-disabled holds an un-evaluated template expression',
    pad: { x: 40, top: 42, bottom: 34 },
  },
  {
    name: 'signin-email-focused',
    url: 'https://app.weguide.com.au/signin?throughOption=email&canFillPreviousCredential=false&programCode=',
    selector: 'input[type=email]',
    caption: 'field focused with the keyboard, no visible focus indicator',
    pad: { x: 30, top: 52, bottom: 34 },
    focusFirst: true,
    outline: false,
  },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: USER_AGENT, locale: 'en-AU', deviceScaleFactor: 2 });

for (const s of SHOTS) {
  const page = await context.newPage();
  await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(9000);
  if (s.focusFirst) await page.locator(s.selector).focus();
  await page.evaluate(
    ({ selector, caption, outline }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      const box = document.createElement('div');
      Object.assign(box.style, {
        position: 'fixed', left: r.left - 4 + 'px', top: r.top - 4 + 'px',
        width: r.width + 8 + 'px', height: r.height + 8 + 'px',
        border: outline === false ? 'none' : '2px solid #d92d20', borderRadius: '8px',
        pointerEvents: 'none', zIndex: '2147483647',
      });
      const tag = document.createElement('div');
      tag.textContent = caption;
      Object.assign(tag.style, {
        position: 'fixed', left: r.left - 4 + 'px', top: Math.max(2, r.top - 30) + 'px',
        font: '500 12px/1.5 ui-sans-serif, system-ui, sans-serif', color: '#ffffff',
        background: '#d92d20', padding: '3px 8px', borderRadius: '5px',
        pointerEvents: 'none', zIndex: '2147483647', whiteSpace: 'nowrap',
      });
      document.body.append(box, tag);
    },
    s,
  );
  const r = await page.locator(s.selector).boundingBox();
  await page.screenshot({
    path: path.join(OUT, `${s.name}.png`),
    clip: {
      x: Math.max(0, r.x - s.pad.x),
      y: Math.max(0, r.y - s.pad.top),
      width: Math.min(1280 - Math.max(0, r.x - s.pad.x), r.width + s.pad.x * 2),
      height: r.height + s.pad.top + s.pad.bottom,
    },
  });
  console.log(`public/evidence/${s.name}.png`);
  await page.close();
  await new Promise((r2) => setTimeout(r2, 2500));
}
await browser.close();
