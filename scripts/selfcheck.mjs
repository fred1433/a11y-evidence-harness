/**
 * Runs the same scan against this page. A pre-audit that would not pass its own
 * tool is not worth reading.
 *
 *   node scripts/selfcheck.mjs [url]
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { WCAG_TAGS, BEST_PRACTICE_TAGS, VIEWPORTS, USER_AGENT } from './config.mjs';

const url = process.argv[2] || 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
let failures = 0;
for (const [name, vp] of Object.entries(VIEWPORTS)) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    userAgent: USER_AGENT,
  });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1200);
  const wcag = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const bp = await new AxeBuilder({ page }).withTags(BEST_PRACTICE_TAGS).analyze();
  const facts = await page.evaluate(() => ({
    scrolls: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    screens: Math.round((document.documentElement.scrollHeight / innerHeight) * 100) / 100,
  }));
  failures += wcag.violations.length;
  console.log(
    `${name.padEnd(8)} wcag=${wcag.violations.length} bp=${bp.violations.length} screens=${facts.screens}` +
      (facts.scrolls ? '  HORIZONTAL SCROLL' : ''),
  );
  for (const v of wcag.violations) console.log(`    ${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`);
  for (const v of bp.violations) console.log(`    (bp) ${v.id}: ${v.nodes.length}`);
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
