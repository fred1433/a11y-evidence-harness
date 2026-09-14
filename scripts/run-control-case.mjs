/**
 * Runs the control case through the retest circuit and records the three reports
 * the page shows: the screen as observed, a corrected copy of it, and the same
 * screen with the component deleted.
 *
 *   node scripts/run-control-case.mjs
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { retest, CONTROL_CASE_CONTROLS } from './retest.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
for (const variant of ['observed', 'corrected', 'component-removed']) {
  const file = `fixtures/control-case/${variant}.html`;
  const report = await retest(pathToFileURL(path.join(ROOT, file)).href, CONTROL_CASE_CONTROLS);
  report.variant = variant;
  report.source = file;
  report.label = 'local control case, synthetic. Not a copy of anyone\'s markup and not a change to any live site.';
  writeFileSync(path.join(ROOT, `data/retest/control-${variant}.json`), JSON.stringify(report, null, 2) + '\n');
  console.log(variant.padEnd(18), report.results.map((r) => `${r.id}:${r.verdict}`).join('  '));
}
