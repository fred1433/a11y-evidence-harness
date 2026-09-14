/**
 * What the continuous integration proves, and what it does not.
 *
 * It proves four properties of this harness, against a synthetic control case
 * held in fixtures/, with no network and no site involved:
 *
 *   1. a known defect is detected
 *   2. a corrected copy of the same screen reports the defect as gone
 *   3. a screen where the component was deleted reports "cannot conclude",
 *      never a pass, because a control that lost its subject proves nothing
 *   4. every criterion the harness can cite exists in WCAG 2.2
 *
 * It proves nothing about any website. Observations on a live site are dated
 * runs, kept separately, and checked by tests/observations.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { retest, CONTROL_CASE_CONTROLS } from '../scripts/retest.mjs';
import { WCAG22 } from '../scripts/wcag22.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => pathToFileURL(path.join(ROOT, 'fixtures/control-case', name)).href;
const byId = (report) => Object.fromEntries(report.results.map((r) => [r.id, r]));

test('the control case is detected: four seeded defects, four reproduced', async () => {
  const report = await retest(fixture('observed.html'), CONTROL_CASE_CONTROLS);
  assert.equal(report.results.length, CONTROL_CASE_CONTROLS.length);
  for (const r of report.results) {
    assert.equal(r.verdict, 'reproduced', `${r.id} (${r.ruleId}) should be reproduced: ${r.because}`);
    assert.ok(r.nodeCount > 0);
  }
  assert.match(report.engine.axeCore, /^\d+\.\d+\.\d+$/, 'the report must name the engine version');
});

test('a corrected copy of the same screen reports the defects as gone', async () => {
  const report = await retest(fixture('corrected.html'), CONTROL_CASE_CONTROLS);
  for (const r of report.results) {
    assert.equal(r.verdict, 'not-reproduced', `${r.id} should be not-reproduced: ${r.because}`);
    assert.equal(r.anchorPresent, true, `${r.id} only counts because the element is still there`);
    assert.equal(r.ruleExecuted, true, `${r.id} only counts because the rule ran`);
  }
});

test('deleting the component never turns a control green', async () => {
  const report = await retest(fixture('component-removed.html'), CONTROL_CASE_CONTROLS);
  const r = byId(report);
  for (const id of ['CC-1', 'CC-2', 'CC-3']) {
    assert.equal(r[id].verdict, 'cannot-conclude', `${id} lost its subject and must not be reported as fixed`);
    assert.match(r[id].because, /not present|no longer on the page/);
  }
  // The viewport tag survives the deletion and was genuinely corrected, so this
  // one is allowed to be not-reproduced. A blanket "cannot conclude" would be
  // just as wrong as a blanket pass.
  assert.equal(r['CC-4'].verdict, 'not-reproduced');
});

test('a target that cannot be loaded is an execution issue, not a clean result', async () => {
  const report = await retest(fixture('no-such-file.html'), CONTROL_CASE_CONTROLS);
  for (const r of report.results) {
    assert.equal(r.verdict, 'cannot-conclude');
    assert.match(r.because, /did not load/);
  }
});

test('no verdict is ever "not-reproduced" without a present anchor and an executed rule', async () => {
  for (const f of ['observed.html', 'corrected.html', 'component-removed.html']) {
    const report = await retest(fixture(f), CONTROL_CASE_CONTROLS);
    for (const r of report.results) {
      if (r.verdict === 'not-reproduced') {
        assert.equal(r.anchorPresent, true, `${f} ${r.id}`);
        assert.equal(r.ruleExecuted, true, `${f} ${r.id}`);
        assert.equal(r.ruleIncomplete, false, `${f} ${r.id}`);
        assert.equal(r.stateVerified, true, `${f} ${r.id}`);
      }
    }
  }
});

test('every criterion the control case cites exists in WCAG 2.2', () => {
  for (const c of CONTROL_CASE_CONTROLS) {
    assert.ok(WCAG22[c.proposedCriterion], `${c.id} cites ${c.proposedCriterion}, which is not a WCAG 2.2 A or AA criterion`);
  }
  assert.equal(WCAG22['4.1.2'].name, 'Name, Role, Value');
  assert.equal(WCAG22['2.4.11'].level, 'AA');
  assert.equal(WCAG22['2.4.10'], undefined, 'AAA criteria are not in the table this harness can cite');
});
