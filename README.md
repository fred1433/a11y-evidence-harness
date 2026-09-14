# a11y-evidence-harness

A small Playwright and axe-core harness for producing accessibility evidence that
someone else can replay, hand to a developer, and check again later.

**What it is.** Three scripts and a control case. `scripts/scan.mjs` loads a list of
screens in several viewport conditions, verifies that each one actually rendered,
runs axe-core with the WCAG 2.x A and AA tags, and writes one timestamped JSON file
per screen and condition, with the rule, the success criterion, the selector, the
markup, the rules that executed, and the results axe could not settle.
`scripts/manual-checks.mjs` adds the scripted measurements a rule engine does not
make: keyboard focus, target geometry, contrast recomputed from rendered colours,
form control names and autocomplete tokens, document titles.
`scripts/retest.mjs` takes an observation and answers one question later, honestly.

**What it is not.** It is not an audit, and it does not decide anything. It proposes
a success criterion; a qualified person accepts or rejects it. Severity, where it
appears, is the impact axe assigns to its own rule, not a judgement. An automated
pass covers a minority of WCAG, and nothing here listens to a screen reader.

## The one idea worth stealing

A retest that goes quiet is not a retest that passed. Before `retest.mjs` reports
anything as fixed, it checks that the screen still rendered, that the element the
observation was made on is still present, and that the rule actually executed. If
any of those is missing it answers `cannot-conclude`. Deleting a component, renaming
a class, or a scan that silently failed can all make a defect stop being detected,
and none of them is a fix.

`fixtures/control-case/` holds three synthetic copies of one small screen: one with
four seeded defects, one with all four corrected, and one with the form deleted. The
test suite asserts that the harness reproduces four defects on the first, reports
four as gone on the second, and answers `cannot-conclude` on the third rather than
declaring victory. Those fixtures are written from scratch and contain nobody's
markup.

## Running it

```bash
npm install
npx playwright install chromium

node --test tests/                  # the control case, no network, no site
node scripts/scan.mjs --pass run-a  # edit scripts/targets.mjs first
node scripts/manual-checks.mjs --pass run-a
node scripts/retest.mjs --file fixtures/control-case/observed.html
node scripts/retest.mjs --url https://example.com --controls findings.json
```

Copy `scripts/targets.example.mjs` to `scripts/targets.mjs` and edit it: that is the
only file you need to touch to point the harness somewhere else, and it is not
committed, because a given engagement's corpus and its evidence belong to that
engagement. Each entry carries an `expectState`, a selector or a phrase that proves
the screen rendered: a framework shell answering 200 is not a page, and a scan of a
shell must never be filed as a screen with no defects.

## Continuous integration

The workflow installs Chromium and runs the control case over `file://`. It contacts
no website. A green pipeline proves that the harness detects a seeded defect, that a
corrected copy reports it gone, and that a deleted component yields `cannot-conclude`.
It proves nothing about anyone's live site; observations against a live site are
dated runs, kept out of this repository.

MIT licensed. Built by Frederic de Lavenne de Choulot, The AI Pipe.
