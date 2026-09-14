/**
 * The retest half of the harness.
 *
 *   node scripts/retest.mjs --file fixtures/control-case/observed.html
 *   node scripts/retest.mjs --url  https://app.weguide.com.au/signin?throughOption=email
 *   node scripts/retest.mjs --controls data/findings.json --url <url>
 *
 * A control is only meaningful if the screen it was written against is still the
 * screen in front of it. So each control carries three things that are checked
 * before any verdict is given:
 *
 *   stateSelector  the screen rendered at all
 *   anchor         the element the observation was made on is still present
 *   ruleId         the rule that produced the observation actually executed
 *
 * Verdicts:
 *   reproduced      state verified, anchor present, rule ran, defect still there
 *   not-reproduced  state verified, anchor present, rule ran, defect gone
 *   cannot-conclude anything above missing. Never reported as a pass.
 *
 * "No longer detected" is not "sufficient". A retest that goes quiet because the
 * component was deleted, the selector matched nothing, or the rule never ran is a
 * cannot-conclude, and this file exists to make that impossible to fake.
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WCAG_TAGS, USER_AGENT, VIEWPORTS } from './targets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

/** The controls carried by the local control case, used by the tests and the page. */
export const CONTROL_CASE_CONTROLS = [
  {
    id: 'CC-1',
    ruleId: 'label',
    anchor: 'input[type=email]',
    stateSelector: 'form',
    observation: 'The email field has no accessible name: the label element that wraps it carries no text.',
    proposedCriterion: '4.1.2',
  },
  {
    id: 'CC-2',
    ruleId: 'aria-valid-attr-value',
    anchor: 'button[type=submit]',
    stateSelector: 'form',
    observation: 'An un-evaluated template expression was left in the aria-disabled value of the submit button.',
    proposedCriterion: '4.1.2',
  },
  {
    id: 'CC-3',
    ruleId: 'role-img-alt',
    anchor: '[role=img]',
    stateSelector: 'form',
    observation: 'An element with role="img" has no accessible name.',
    proposedCriterion: '1.1.1',
  },
  {
    id: 'CC-4',
    ruleId: 'meta-viewport',
    anchor: 'meta[name=viewport]',
    stateSelector: 'body',
    observation: 'The viewport meta tag forbids zooming.',
    proposedCriterion: '1.4.4',
  },
];

const RESTORE_DOM_ACCESSORS = () => {
  const KEYS = ['childNodes', 'children', 'firstChild', 'lastChild', 'firstElementChild', 'childElementCount', 'textContent'];
  const native = {};
  for (const k of KEYS) {
    const d = Object.getOwnPropertyDescriptor(Node.prototype, k) || Object.getOwnPropertyDescriptor(Element.prototype, k);
    if (d) native[k] = d;
  }
  const patched = [...document.querySelectorAll('*')].filter((el) => el.childNodes.length === 0 && el.firstElementChild);
  for (const el of patched) for (const [k, d] of Object.entries(native)) { try { Object.defineProperty(el, k, d); } catch { /* keep going */ } }
  return patched.length;
};

/**
 * @param {string} target  an http(s) URL or a file:// URL
 * @param {object[]} controls
 * @param {{viewport?: string, settleMs?: number}} opts
 */
export async function retest(target, controls, opts = {}) {
  const vpName = opts.viewport ?? 'desktop';
  const vp = VIEWPORTS[vpName];
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    userAgent: USER_AGENT,
    locale: 'en-AU',
  });
  const page = await context.newPage();
  const ranAt = new Date().toISOString();
  const report = {
    schema: 'a11y-evidence-harness/retest/1',
    target,
    viewport: vpName,
    ranAt,
    engine: { browser: `Chromium ${browser.version()}` },
    results: [],
  };

  let loadError = null;
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(opts.settleMs ?? 1200);
    await page.evaluate(RESTORE_DOM_ACCESSORS);
  } catch (e) {
    loadError = e.message.slice(0, 200);
  }

  let axeResult = null;
  if (!loadError) {
    const res = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    report.engine.axeCore = res.testEngine?.version ?? null;
    axeResult = {
      violations: res.violations,
      executed: new Set([...res.passes, ...res.violations, ...res.incomplete, ...res.inapplicable].map((r) => r.id)),
      incomplete: new Set(res.incomplete.map((r) => r.id)),
    };
  }

  for (const c of controls) {
    const r = { id: c.id, ruleId: c.ruleId, anchor: c.anchor, observation: c.observation, proposedCriterion: c.proposedCriterion };
    if (loadError) {
      report.results.push({ ...r, verdict: 'cannot-conclude', because: `the page did not load: ${loadError}` });
      continue;
    }
    r.stateVerified = c.stateSelector ? await page.$(c.stateSelector).then(Boolean) : true;
    r.anchorPresent = await page.$(c.anchor).then(Boolean);
    r.ruleExecuted = axeResult.executed.has(c.ruleId);
    r.ruleIncomplete = axeResult.incomplete.has(c.ruleId);
    const hit = axeResult.violations.find((v) => v.id === c.ruleId);
    r.nodeCount = hit ? hit.nodes.length : 0;

    if (!r.stateVerified) r.verdict = 'cannot-conclude', r.because = `the expected screen state (${c.stateSelector}) was not present`;
    else if (!r.anchorPresent) r.verdict = 'cannot-conclude', r.because = `the element the observation was made on (${c.anchor}) is no longer on the page, so nothing can be concluded about it`;
    else if (!r.ruleExecuted) r.verdict = 'cannot-conclude', r.because = `the rule ${c.ruleId} did not run`;
    else if (r.ruleIncomplete) r.verdict = 'cannot-conclude', r.because = `axe returned ${c.ruleId} as incomplete, which is an open question rather than a result`;
    else if (r.nodeCount > 0) r.verdict = 'reproduced', r.because = `${c.ruleId} still matches ${r.nodeCount} element(s)`;
    else r.verdict = 'not-reproduced', r.because = `${c.ruleId} ran on a screen that still holds ${c.anchor} and matched nothing`;
    report.results.push(r);
  }

  await browser.close();
  return report;
}

// CLI
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = arg('file');
  const url = arg('url');
  const target = url ?? pathToFileURL(path.resolve(ROOT, file ?? 'fixtures/control-case/observed.html')).href;
  const controlsPath = arg('controls');
  const controls = controlsPath
    ? JSON.parse(readFileSync(path.resolve(ROOT, controlsPath), 'utf8')).findings.filter((f) => f.check?.kind === 'axe').map((f) => ({
        id: f.id, ruleId: f.check.ruleId, anchor: f.check.anchor ?? f.selector, stateSelector: f.check.stateSelector ?? 'body',
        observation: f.observation, proposedCriterion: f.criterion.number,
      }))
    : CONTROL_CASE_CONTROLS;
  const report = await retest(target, controls, { viewport: arg('viewport', 'desktop'), settleMs: Number(arg('settle', url ? 9000 : 1200)) });
  console.log(`${report.target}\n  axe-core ${report.engine.axeCore}, ${report.engine.browser}, ${report.viewport}, ${report.ranAt}`);
  for (const r of report.results) console.log(`  ${r.id.padEnd(6)} ${r.ruleId.padEnd(24)} ${String(r.verdict).padEnd(16)} ${r.because}`);
}
