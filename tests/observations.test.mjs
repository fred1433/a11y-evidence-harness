/**
 * Checks on the dated runs against the public WeGuide screens.
 *
 * These do not run in continuous integration: the runs are kept out of the public
 * repository, so this file skips itself when they are absent. A green pipeline
 * therefore says nothing about WeGuide, which is the point.
 *
 *   node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WCAG22 } from '../scripts/wcag22.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HAVE_RUNS = existsSync(path.join(ROOT, 'data/findings.json'));
const opts = HAVE_RUNS ? {} : { skip: 'no dated runs in this checkout, which is expected in CI' };

const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const obs = HAVE_RUNS ? read('data/findings.json') : { corpus: { runs: [] }, observations: [] };
const RUNS = obs.corpus.runs?.map((r) => r.id) ?? [];
const scan = (slug, viewport, run) => read(`data/scans/${slug}.${viewport}.${run}.json`);
const manual = (run) => read(`data/manual/${run}.json`);

// ---------------------------------------------------------------------------

test('the corpus names its screens, its date, its engine and its two runs', opts, () => {
  assert.match(obs.corpus.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(RUNS.length, 2, 'evidence is only "reproduced" if two runs agree');
  assert.match(obs.corpus.engine.axeCore, /^\d+\.\d+\.\d+$/);
  assert.match(obs.corpus.engine.browser, /^Chromium /);
  assert.ok(obs.corpus.screens.length > 0);
  for (const s of obs.corpus.screens) {
    assert.match(s.url, /^https:\/\//, `${s.slug} has no URL`);
    assert.ok(s.state, `${s.slug} does not say which screen state was tested`);
  }
  assert.deepEqual(obs.corpus.tags.separate, ['best-practice'], 'best practice rules are reported separately, never as failures');
});

test('every screen in the corpus had its rendered state verified in both runs', opts, () => {
  for (const s of obs.corpus.screens) {
    for (const run of RUNS) {
      const j = scan(s.slug, 'desktop', run);
      assert.equal(j.stateCheck?.verified, true, `${s.slug} did not render in ${run}; that is an execution issue, not a clean screen`);
    }
  }
});

test('every proposed criterion exists in WCAG 2.2, with the right name and level', opts, () => {
  for (const o of obs.observations) {
    const ref = WCAG22[o.proposedCriterion.number];
    assert.ok(ref, `${o.id} proposes ${o.proposedCriterion.number}, which is not a WCAG 2.2 A or AA criterion`);
    assert.equal(o.proposedCriterion.name, ref.name, `${o.id} names the criterion wrongly`);
    assert.equal(o.proposedCriterion.level, ref.level, `${o.id} gives the wrong level`);
  }
});

test('an observation is never presented as a reviewed judgement', opts, () => {
  for (const o of obs.observations) {
    assert.equal(o.accessibilityReview, 'pending', `${o.id} claims an accessibility review we did not do`);
    if (o.source === 'axe') assert.ok(['critical', 'serious', 'moderate', 'minor'].includes(o.axeImpact), `${o.id} axe impact`);
    else assert.equal(o.axeImpact, null, `${o.id} is a scripted measure, so it carries no axe impact`);
    assert.ok(!/\b(compliant|conformance|certified|certification)\b/i.test(JSON.stringify(o)), `${o.id} uses a word we do not get to use`);
  }
});

test('every observation carries a screen, a state, a method, a remediation and evidence', opts, () => {
  const slugs = new Set(obs.corpus.screens.map((s) => s.slug));
  const ids = new Set();
  for (const o of obs.observations) {
    assert.ok(!ids.has(o.id), `duplicate id ${o.id}`);
    ids.add(o.id);
    assert.ok(o.screens.length > 0 && o.screens.every((s) => slugs.has(s)), `${o.id} names a screen outside the corpus`);
    assert.ok(o.state && o.state.length > 5, `${o.id} does not say which screen state it was seen in`);
    assert.ok(o.viewports.length > 0);
    assert.match(o.method, /\d{4}/, `${o.id} has no dated method`);
    assert.ok(o.proposedRemediation?.length > 15, `${o.id} has no remediation`);
    assert.ok(['reproduced', 'not-reproduced', 'to-investigate'].includes(o.technicalEvidence), `${o.id} evidence status`);
    assert.ok(o.evidence.length > 0, `${o.id} has no evidence`);
  }
});

test('every piece of evidence points at a file that is really there', opts, () => {
  for (const o of obs.observations) {
    for (const e of o.evidence) assert.ok(existsSync(path.join(ROOT, e)), `${o.id} points at ${e}`);
  }
});

// ---------------------------------------------------------------------------
// "Reproduced" is re-derived from the raw run output, never trusted as a label.
// ---------------------------------------------------------------------------

const PROBES = {
  axe: ({ ruleId, slug, viewport }, run) => {
    const j = scan(slug, viewport, run);
    if (!j.stateCheck?.verified) return false; // a screen that did not render proves nothing
    if (!j.rulesRun.includes(ruleId)) return false; // a rule that did not run proves nothing
    return j.violations.some((v) => v.ruleId === ruleId);
  },
  routeFailure: ({ slug, viewport, landsOn }, run) =>
    (scan(slug, viewport, run).pageFacts?.finalUrl ?? '').includes(landsOn),
  titleRepeated: ({ title, minScreens }, run) => {
    const row = manual(run).titleUniqueness.find((t) => t.title === title);
    return !!row && row.slugs.length >= minScreens;
  },
  unnamedControl: ({ slug, selector }, run) =>
    (manual(run).pages[slug]?.desktop?.formControls ?? []).some((c) => c.selector === selector && !String(c.accessibleName).trim()),
  autocompleteOff: ({ slug, minFields }, run) =>
    (manual(run).pages[slug]?.desktop?.formControls ?? []).filter((c) => c.visible && c.autocomplete === 'off').length >= minFields,
  noFocusChange: ({ slug, minStops }, run) =>
    (manual(run).pages[slug]?.desktop?.keyboardWalk ?? []).filter((s) => s.focusIndicator === 'none').length >= minStops,
  focusObscured: ({ slug }, run) => (manual(run).pages[slug]?.desktop?.keyboardWalk ?? []).some((s) => s.coveredBy),
  smallTargets: ({ slug, minTargets }, run) =>
    (manual(run).pages[slug]?.mobile?.targetSize?.undersized ?? []).length >= minTargets,
  contrastBelow: ({ slug, maxRatio }, run) =>
    (manual(run).pages[slug]?.desktop?.contrast?.text ?? []).some((t) => typeof t.ratio === 'number' && t.ratio <= maxRatio),
  horizontalScroll: ({ slug, viewport }, run) => scan(slug, viewport, run).pageFacts?.horizontalScroll === true,
  noPasswordNoCaptcha: ({ slug }, run) => {
    const a = manual(run).pages[slug]?.desktop?.accessibleAuth;
    return !!a && a.passwordFields === 0 && a.captchaPresent === false;
  },
};

test('anything marked reproduced is present in both runs, re-derived from the raw output', opts, () => {
  for (const o of obs.observations) {
    if (o.technicalEvidence !== 'reproduced') continue;
    const probe = PROBES[o.check.kind];
    assert.ok(probe, `${o.id} uses unknown probe ${o.check.kind}`);
    assert.deepEqual(o.reproducedIn.slice().sort(), RUNS.slice().sort(), `${o.id} does not list both runs`);
    for (const run of RUNS) assert.equal(probe(o.check, run), true, `${o.id} is marked reproduced but ${run} does not show it`);
  }
});

test('anything left "to investigate" says what is missing', opts, () => {
  for (const o of obs.observations) {
    if (o.technicalEvidence === 'to-investigate') assert.ok(o.openQuestion?.length > 20, `${o.id} gives no open question`);
  }
});

test('the tooling note matches what the run files recorded', opts, () => {
  const n = obs.corpus.toolingNote;
  assert.ok(n);
  for (const run of RUNS) {
    const s = scan(n.evidenceSlug, n.evidenceViewport, run);
    assert.equal(s.domTraversal.axeNodesAsServed, n.axeNodesAsServed, `as-served count in ${run}`);
    assert.equal(s.domTraversal.axeNodesAfterRestore, n.axeNodesAfterRestore, `restored count in ${run}`);
    assert.ok(s.domTraversal.axeNodesAfterRestore > s.domTraversal.axeNodesAsServed);
  }
});

test('every run file names its screen, its engine and the moment it ran', opts, () => {
  const files = readdirSync(path.join(ROOT, 'data/scans')).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= obs.corpus.screens.length * RUNS.length);
  for (const f of files) {
    const s = read(`data/scans/${f}`);
    assert.match(s.url, /^https:\/\//);
    assert.match(s.scannedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(s.engine.axeCore || s.loadError, `${f} names no axe version`);
    assert.ok(s.rulesRun.length > 20 || s.loadError, `${f} recorded no executed rules`);
  }
});

test('execution issues are listed, and never counted as clean screens', opts, () => {
  const listed = new Set((obs.corpus.executionIssues ?? []).map((i) => i.key));
  for (const s of obs.corpus.screens) {
    for (const run of RUNS) {
      for (const vp of obs.corpus.viewports) {
        const j = scan(s.slug, vp, run);
        const key = `${s.slug}.${vp}.${run}`;
        if (j.loadError || j.stateCheck?.verified === false || j.incomplete.length > 0) {
          assert.ok(listed.has(key), `${key} had an execution issue that the page does not disclose`);
        }
      }
    }
  }
});

const pageSources = () =>
  readdirSync(path.join(ROOT, 'src/app'))
    .filter((f) => f.endsWith('.tsx') || f.endsWith('.ts'))
    .map((f) => readFileSync(path.join(ROOT, 'src/app', f), 'utf8'))
    .join('\n');

test('the page states no total that is not computed from the observations', opts, () => {
  const src = pageSources();
  const strings = src.match(/["'`][^"'`]{0,200}["'`]/g) ?? [];
  const claim = /\b\d+\s+(observations?|findings?|issues?|errors?|violations?|failures?|screens?|pages?|problems?)\b/i;
  const offenders = strings.filter((s) => claim.test(s));
  assert.deepEqual(offenders, [], `hard-coded totals in the page: ${offenders.join(' | ')}`);
});

test('the published JSON matches the source', opts, () => {
  assert.equal(JSON.stringify(read('public/findings.json')), JSON.stringify(obs), 'public/findings.json is stale, run npm run export');
});

test('the words we are not allowed to use are not in the page', opts, () => {
  const src = pageSources();
  for (const word of ['pre-audit', 'preaudit', 'compliant', 'conformance', 'certified', 'certification', 'drafted with Claude', 'checked by hand']) {
    assert.ok(!new RegExp(word.replace(/[-\s]/g, '[-\\s]'), 'i').test(src), `the page says "${word}"`);
  }
  assert.ok(!/—/.test(src), 'the page contains an em dash');
  assert.match(src, /const CAL = "https:\/\/cal\.theaipipe\.com"/, 'the booking link must be exactly cal.theaipipe.com');
  assert.match(src, /github\.com\/fred1433\/a11y-evidence-harness/, 'the repository link must point at the public harness');
});
