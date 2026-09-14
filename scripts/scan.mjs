/**
 * Automated pass of the WeGuide public pre-audit.
 *
 *   node scripts/scan.mjs --pass pass1
 *
 * For every page in scripts/targets.mjs, in three viewport conditions, this runs
 * axe-core through Playwright and writes one JSON file per page and condition,
 * plus one screenshot per page and condition.
 *
 * It never signs in, never creates an account and never submits a form.
 * One page is loaded at a time, with a pause between loads.
 */
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGETS, VIEWPORTS, USER_AGENT, WCAG_TAGS, BEST_PRACTICE_TAGS, CORPUS_DATE } from './targets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAUSE_BETWEEN_LOADS_MS = 2500;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const passId = arg('pass', 'pass1');
const only = arg('only', null);

/** Keep only what a reader needs: rule, criterion, impact, selector, HTML. */
function slimViolations(violations, kind) {
  return violations.map((v) => ({
    ruleId: v.id,
    kind, // 'wcag' or 'best-practice'
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    tags: v.tags,
    successCriteria: v.tags
      .filter((t) => /^wcag\d{3,4}$/.test(t))
      .map((t) => {
        const d = t.replace('wcag', '');
        return `${d[0]}.${d[1]}.${d.slice(2)}`;
      }),
    nodeCount: v.nodes.length,
    nodes: v.nodes.slice(0, 12).map((n) => ({
      target: n.target,
      html: n.html.slice(0, 400),
      failureSummary: (n.failureSummary || '').slice(0, 600),
    })),
  }));
}

/**
 * Some component frameworks replace the native DOM accessors on their host
 * elements. On app.weguide.com.au, <ion-app>, <ion-input> and <ion-alert> report
 * `childNodes.length === 0` while `firstElementChild` is a real element. Every
 * accessibility engine that walks a page through `childNodes` — axe-core does —
 * stops there and reports on a page it never saw.
 *
 * This restores the native accessors on the affected hosts, in our own browser
 * only, so the scan can reach the application. Nothing is sent to the site.
 * Returns the list of hosts that were lying, which is itself a finding.
 */
const RESTORE_DOM_ACCESSORS = () => {
  const KEYS = ['childNodes', 'children', 'firstChild', 'lastChild', 'firstElementChild', 'childElementCount', 'textContent'];
  const native = {};
  for (const k of KEYS) {
    const d = Object.getOwnPropertyDescriptor(Node.prototype, k) || Object.getOwnPropertyDescriptor(Element.prototype, k);
    if (d) native[k] = d;
  }
  const patched = [...document.querySelectorAll('*')].filter((el) => el.childNodes.length === 0 && el.firstElementChild);
  const tags = {};
  for (const el of patched) {
    tags[el.tagName.toLowerCase()] = (tags[el.tagName.toLowerCase()] || 0) + 1;
    for (const [k, d] of Object.entries(native)) {
      try { Object.defineProperty(el, k, d); } catch { /* leave it */ }
    }
  }
  return { patchedHostTags: tags, patchedHostCount: patched.length };
};

const AXE_NODE_COUNT = () => {
  if (!window.axe?.utils?.getFlattenedTree) return null;
  const tree = window.axe.utils.getFlattenedTree(document.documentElement);
  const count = (n) => 1 + (n.children || []).reduce((s, c) => s + count(c), 0);
  return tree.reduce((s, n) => s + count(n), 0);
};

async function scanOne(browser, target, viewportName) {
  const vp = VIEWPORTS[viewportName];
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    isMobile: vp.isMobile,
    hasTouch: vp.hasTouch,
    userAgent: vp.isMobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1'
      : USER_AGENT,
    locale: 'en-AU',
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 240));
  });

  const startedAt = new Date().toISOString();
  let httpStatus = null;
  let loadError = null;
  try {
    const resp = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    httpStatus = resp ? resp.status() : null;
    await page.waitForTimeout(target.settleMs);
  } catch (e) {
    loadError = e.message.slice(0, 300);
  }

  let wcag = [];
  let bestPractice = [];
  let rulesRun = [];
  let incomplete = [];
  let axeVersion = null;
  let pageFacts = null;
  let domTraversal = null;
  let stateCheck = null;
  if (!loadError) {
    // Did the screen actually render? A framework shell answering 200 is not a
    // page, and a scan of a shell must never be filed as "nothing found".
    const expect = target.expectState;
    stateCheck = { ...expect, verified: false };
    if (expect) {
      stateCheck.verified = await page.evaluate(
        ({ kind, value }) =>
          kind === 'selector' ? !!document.querySelector(value) : document.body.innerText.includes(value),
        expect,
      );
    }
    // First run: the page exactly as it is served, which is what any tool reports.
    const asServed = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    axeVersion = asServed.testEngine?.version ?? null;
    const nodesBefore = await page.evaluate(AXE_NODE_COUNT);

    // Restore the native DOM accessors the page overrides, then run again.
    const repair = await page.evaluate(RESTORE_DOM_ACCESSORS);
    const nodesAfter = await page.evaluate(AXE_NODE_COUNT);

    const wcagRes = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    wcag = slimViolations(wcagRes.violations, 'wcag');
    const bpRes = await new AxeBuilder({ page }).withTags(BEST_PRACTICE_TAGS).analyze();
    bestPractice = slimViolations(bpRes.violations, 'best-practice');

    // Which rules actually ran, and which ones axe could not settle. An
    // "incomplete" result is an open question, never a clean result.
    rulesRun = [...wcagRes.passes, ...wcagRes.violations, ...wcagRes.incomplete, ...wcagRes.inapplicable]
      .map((r) => r.id)
      .sort();
    incomplete = wcagRes.incomplete.map((r) => ({
      ruleId: r.id,
      help: r.help,
      nodeCount: r.nodes.length,
      targets: r.nodes.slice(0, 4).map((n) => n.target),
    }));

    domTraversal = {
      ...repair,
      axeNodesAsServed: nodesBefore,
      axeNodesAfterRestore: nodesAfter,
      rulesEvaluatedAsServed: asServed.passes.length + asServed.violations.length,
      rulesEvaluatedAfterRestore: wcagRes.passes.length + wcagRes.violations.length,
      violationsAsServed: asServed.violations.map((v) => `${v.id}(${v.nodes.length})`),
      violationsAfterRestore: wcagRes.violations.map((v) => `${v.id}(${v.nodes.length})`),
      note:
        repair.patchedHostCount > 0
          ? 'This page overrides the native DOM child accessors. The as-served numbers are what an unmodified axe-core run reports; the after-restore numbers are what is actually on the page.'
          : 'No overridden DOM accessors found. As-served and after-restore results should match.',
    };

    pageFacts = await page.evaluate(() => ({
      finalUrl: location.href,
      title: document.title,
      lang: document.documentElement.getAttribute('lang'),
      h1Count: document.querySelectorAll('h1').length,
      // 1.4.10 Reflow indicator: does the document scroll sideways?
      horizontalScroll:
        document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    await mkdir(path.join(ROOT, 'data/shots'), { recursive: true });
    await page
      .screenshot({ path: path.join(ROOT, `data/shots/${target.slug}.${viewportName}.${passId}.png`) })
      .catch(() => {});
  }

  const out = {
    schema: 'weguide-a11y-preaudit/scan/1',
    pass: passId,
    corpusDate: CORPUS_DATE,
    scannedAt: startedAt,
    slug: target.slug,
    label: target.label,
    group: target.group,
    url: target.url,
    note: target.note ?? null,
    viewport: viewportName,
    viewportPx: { width: vp.width, height: vp.height, deviceScaleFactor: vp.deviceScaleFactor },
    zoomEmulation:
      viewportName === 'zoom200'
        ? '200% browser zoom on a 1280x800 display, emulated as a 640x400 CSS viewport at deviceScaleFactor 2'
        : null,
    engine: { axeCore: axeVersion, browser: `Chromium ${browser.version()}`, headless: true },
    httpStatus,
    loadError,
    pageFacts,
    consoleErrors: consoleErrors.slice(0, 8),
    domTraversal,
    stateCheck,
    counts: {
      wcagViolations: wcag.length,
      bestPracticeViolations: bestPractice.length,
      rulesExecuted: rulesRun.length,
      incomplete: incomplete.length,
    },
    rulesRun,
    tagsRequested: { normative: WCAG_TAGS, separate: BEST_PRACTICE_TAGS },
    incomplete,
    violations: wcag,
    bestPractice,
  };

  await mkdir(path.join(ROOT, 'data/scans'), { recursive: true });
  await writeFile(
    path.join(ROOT, `data/scans/${target.slug}.${viewportName}.${passId}.json`),
    JSON.stringify(out, null, 2) + '\n',
  );
  await page.close();
  await context.close();
  return out;
}

const browser = await chromium.launch({ headless: true });
const targets = only ? TARGETS.filter((t) => t.slug === only) : TARGETS;
console.log(`pass=${passId}  pages=${targets.length}  viewports=${Object.keys(VIEWPORTS).join(', ')}`);

for (const target of targets) {
  for (const viewportName of Object.keys(VIEWPORTS)) {
    const res = await scanOne(browser, target, viewportName);
    console.log(
      `  ${target.slug}.${viewportName}: http=${res.httpStatus} state=${res.stateCheck?.verified} rules=${res.counts.rulesExecuted} wcag=${res.counts.wcagViolations} bp=${res.counts.bestPracticeViolations} incomplete=${res.counts.incomplete}` +
        (res.loadError ? `  LOAD ERROR: ${res.loadError}` : '') +
        (res.pageFacts?.horizontalScroll ? '  [horizontal scroll]' : '') +
        (res.domTraversal?.patchedHostCount
          ? `  [DOM accessors overridden on ${res.domTraversal.patchedHostCount} host(s); axe saw ${res.domTraversal.axeNodesAsServed} -> ${res.domTraversal.axeNodesAfterRestore} nodes]`
          : ''),
    );
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_LOADS_MS));
  }
}
await browser.close();
console.log('done');
