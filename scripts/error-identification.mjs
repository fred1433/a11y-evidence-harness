/**
 * SC 3.3.1 Error Identification, and what 4.1.3 Status Messages does with it.
 *
 *   node scripts/error-identification.mjs
 *
 * The portal sign in form is submitted ONCE, empty. No address, no credential and
 * no personal data is ever typed into it: the button is pressed with the field
 * blank, which is what a user does by accident, and the resulting message is read.
 * This runs once, by hand, and is never part of the repeatable scan.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { USER_AGENT } from './targets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const URL = 'https://app.weguide.com.au/signin?throughOption=email&canFillPreviousCredential=false&programCode=';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, userAgent: USER_AGENT, locale: 'en-AU' });
const page = await context.newPage();
const requests = [];
page.on('request', (r) => { if (r.method() !== 'GET') requests.push(`${r.method()} ${r.url().slice(0, 120)}`); });

await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(9000);

const snapshot = () =>
  page.evaluate(() => ({
    fieldValue: document.querySelector('input[type=email]')?.value ?? null,
    ariaInvalid: document.querySelector('input[type=email]')?.getAttribute('aria-invalid') ?? null,
    ariaDescribedby: document.querySelector('input[type=email]')?.getAttribute('aria-describedby') ?? null,
    liveRegions: [...document.querySelectorAll('[role=alert], [role=status], [aria-live]')].map((e) => ({
      role: e.getAttribute('role'), live: e.getAttribute('aria-live'), text: (e.innerText || '').trim().slice(0, 120),
    })),
    visibleText: document.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 400),
  }));

const before = await snapshot();
await page.screenshot({ path: path.join(ROOT, 'data/shots/error-identification.before.png') });

// The single authorised interaction: press Login with the field empty.
await page.locator('#login-button').click({ timeout: 10000 }).catch(async () => {
  await page.getByText('Login', { exact: true }).last().click({ force: true, timeout: 10000 });
});
await page.waitForTimeout(3500);

const after = await snapshot();
await page.screenshot({ path: path.join(ROOT, 'data/shots/error-identification.after.png') });

const out = {
  schema: 'weguide-a11y-preaudit/error-identification/1',
  url: URL,
  ranAt: new Date().toISOString(),
  browser: `Chromium ${browser.version()}`,
  method:
    'Loaded the sign in page, left the email field empty, pressed the Login button once, and read what the page did. No data was entered and nothing was sent.',
  nonGetRequestsDuringTest: requests,
  before,
  after,
  observed: {
    fieldStillEmpty: after.fieldValue === '',
    ariaInvalidSet: after.ariaInvalid !== null && after.ariaInvalid !== 'false',
    errorTextAppeared: after.visibleText !== before.visibleText,
    liveRegionCount: after.liveRegions.length,
    liveRegionWithText: after.liveRegions.filter((r) => r.text).length,
  },
  evidence: ['data/shots/error-identification.before.png', 'data/shots/error-identification.after.png'],
};

await mkdir(path.join(ROOT, 'data/manual'), { recursive: true });
await writeFile(path.join(ROOT, 'data/manual/error-identification.json'), JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out.observed, null, 1));
console.log('non-GET requests during the test:', requests.length ? requests : '(none)');
console.log('after text:', after.visibleText.slice(0, 260));
await browser.close();
