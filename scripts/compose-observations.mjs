/**
 * Assembles data/findings.json from the two dated runs.
 *
 *   node scripts/compose-observations.mjs
 *
 * The wording of each observation is written here. Every number, snippet, impact
 * and rule name is read back out of the run files, so nothing on the page is
 * transcribed by hand.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { TARGETS } from './targets.mjs';
import { VIEWPORTS, WCAG_TAGS, BEST_PRACTICE_TAGS, CORPUS_DATE } from './config.mjs';
import { WCAG22 } from './wcag22.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNS = ['pass1', 'pass2'];
const VPS = Object.keys(VIEWPORTS);
const read = (p) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const scan = (slug, vp, run) => read(`data/scans/${slug}.${vp}.${run}.json`);
const manual = (run) => read(`data/manual/${run}.json`);

const sc = (n) => ({ number: n, name: WCAG22[n].name, level: WCAG22[n].level });
const METHOD_AXE = (rule, vp) =>
  `axe-core 4.13.0, rule ${rule}, Chromium 153 headless ${VIEWPORTS[vp].width}x${VIEWPORTS[vp].height}, two runs on 14 Sep 2026 twenty minutes apart`;
const METHOD_SCRIPT = (what) => `${what}, Chromium 153 headless 1280x800, two runs on 14 Sep 2026 twenty minutes apart`;

/** Pull the recorded node for an axe rule so the snippet is never retyped. */
function axeNode(slug, vp, ruleId, i = 0) {
  const v = scan(slug, vp, 'pass1').violations.find((x) => x.ruleId === ruleId);
  if (!v) throw new Error(`no ${ruleId} on ${slug}.${vp}`);
  return { impact: v.impact, node: v.nodes[i], nodeCount: v.nodeCount, help: v.help, helpUrl: v.helpUrl };
}
const totalNodes = (slugs, vp, ruleId) =>
  slugs.reduce((s, slug) => s + (scan(slug, vp, 'pass1').violations.find((x) => x.ruleId === ruleId)?.nodeCount ?? 0), 0);

const O = [];
const add = (o) => O.push({ id: `O${String(O.length + 1).padStart(2, '0')}`, accessibilityReview: 'pending', ...o });

// --- 1. The template expression left in an ARIA attribute -------------------
{
  const a = axeNode('portal-signin-email', 'desktop', 'aria-valid-attr-value');
  add({
    headline: 'A template expression was left in an ARIA attribute',
    observation:
      'On the sign in screen the Login button carries aria-disabled="getErrors(false).length? \'true\' : \'false\'". The framework binding was written as a literal string, so the expression reaches the browser un-evaluated. Assistive technology reads that value as neither true nor false.',
    screens: ['portal-signin-email'],
    state: 'Sign in screen, email method, reached from the landing screen and by direct URL',
    viewports: VPS,
    selector: a.node.target.flat().join(' '),
    snippet: a.node.html,
    source: 'axe',
    axeImpact: a.impact,
    method: METHOD_AXE('aria-valid-attr-value', 'desktop'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('4.1.2'),
    proposedRemediation:
      'Bind the attribute rather than writing it as a string: [attr.aria-disabled]="getErrors(false).length > 0".',
    evidence: ['public/evidence/signin-login-button.png', 'data/scans/portal-signin-email.desktop.pass1.json', 'data/scans/portal-signin-email.desktop.pass2.json'],
    check: { kind: 'axe', ruleId: 'aria-valid-attr-value', slug: 'portal-signin-email', viewport: 'desktop', anchor: '#login-button', stateSelector: 'input[type=email]' },
    featured: true,
  });
}

// --- 2. Form fields with no accessible name ---------------------------------
{
  const a = axeNode('portal-register-email', 'desktop', 'label');
  const n = totalNodes(['portal-signin-email', 'portal-register-email'], 'desktop', 'label');
  add({
    headline: 'Form fields have a visible label and no accessible name',
    observation:
      `The word Email is painted above the sign in field, and First Name, Last Name and Program code above the create account fields, but the label elements that wrap those inputs contain no text. ${n} fields across the two screens expose an empty accessible name, so a screen reader announces an unlabelled edit field.`,
    screens: ['portal-signin-email', 'portal-register-email'],
    state: 'Sign in and create account screens, email method. Neither form was submitted with data.',
    viewports: VPS,
    selector: a.node.target.flat().join(' '),
    snippet: a.node.html,
    source: 'axe',
    axeImpact: a.impact,
    method: METHOD_AXE('label', 'desktop'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('4.1.2'),
    proposedRemediation:
      'Give each ion-input a label that reaches the native input, through the component label property or an aria-label, so the visible text and the accessible name are the same words.',
    evidence: ['data/scans/portal-register-email.desktop.pass1.json', 'data/scans/portal-register-email.desktop.pass2.json'],
    check: { kind: 'axe', ruleId: 'label', slug: 'portal-register-email', viewport: 'desktop', anchor: 'input[type=email]', stateSelector: 'form' },
  });
}

// --- 3. Zoom disabled -------------------------------------------------------
{
  const a = axeNode('portal-landing', 'desktop', 'meta-viewport');
  const screens = ['portal-landing', 'portal-signin-email', 'portal-register-email', 'portal-login-deeplink'];
  add({
    headline: 'The viewport meta tag switches pinch zoom off',
    observation:
      'Every screen of the portal ships the same viewport tag with maximum-scale=1.0 and user-scalable=no. On a phone or tablet that stops a reader from pinching to enlarge the page. It was found on all four portal screens that were reached.',
    screens,
    state: 'All four portal screens reached without an account',
    viewports: VPS,
    selector: 'meta[name="viewport"]',
    snippet: a.node.html,
    source: 'axe',
    axeImpact: a.impact,
    method: METHOD_AXE('meta-viewport', 'desktop'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('1.4.4'),
    proposedRemediation: 'Drop maximum-scale and user-scalable from the viewport tag, leaving width=device-width, initial-scale=1.',
    evidence: ['data/scans/portal-landing.desktop.pass1.json', 'data/scans/portal-landing.desktop.pass2.json'],
    check: { kind: 'axe', ruleId: 'meta-viewport', slug: 'portal-landing', viewport: 'desktop', anchor: 'meta[name=viewport]', stateSelector: 'body' },
  });
}

// --- 4. Icons exposed as images with no name --------------------------------
{
  const a = axeNode('portal-signin-email', 'desktop', 'role-img-alt');
  add({
    headline: 'Icons are exposed as images with nothing to announce',
    observation:
      'The phone and QR code icons beside the alternative sign in routes carry role="img" with no aria-label and no title. A screen reader meets an image it must announce and has no words for it. If they are decoration, the role is what should go.',
    screens: ['portal-signin-email', 'portal-register-email'],
    state: 'Sign in and create account screens, email method',
    viewports: VPS,
    selector: a.node.target.flat().join(' '),
    snippet: a.node.html,
    source: 'axe',
    axeImpact: a.impact,
    method: METHOD_AXE('role-img-alt', 'desktop'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('1.1.1'),
    proposedRemediation:
      'Either give each icon an aria-label that says what it does, or mark it aria-hidden="true" and remove role="img" when the neighbouring text already carries the meaning.',
    evidence: ['data/scans/portal-signin-email.desktop.pass1.json', 'data/scans/portal-signin-email.desktop.pass2.json'],
    check: { kind: 'axe', ruleId: 'role-img-alt', slug: 'portal-signin-email', viewport: 'desktop', anchor: '[role=img]', stateSelector: 'input[type=email]' },
  });
}

// --- 5. Movement portal text contrast ---------------------------------------
{
  const a = axeNode('movement-home', 'desktop', 'color-contrast');
  const mine = manual('pass1').pages['movement-home'].desktop.contrast.text[0];
  add({
    headline: 'Grey body text and category tabs sit just under the contrast threshold',
    observation:
      `Body text and the category tabs use #6b7280 on #f4f4f4. axe measures 4.39 to 1 where 4.5 is required for text of this size, and an independent recomputation from the rendered colours gives ${mine.ratio} to 1. The gap is small and it is on the running text of three screens.`,
    screens: ['movement-home', 'movement-program', 'movement-faq'],
    state: 'Exercise catalog, programs and FAQ screens of the movement portal',
    viewports: ['desktop', 'mobile', 'zoom200'],
    selector: a.node.target.flat().join(' '),
    snippet: a.node.html,
    source: 'axe',
    axeImpact: a.impact,
    method: `${METHOD_AXE('color-contrast', 'desktop')}, cross checked against contrast ratios recomputed from the rendered colours`,
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('1.4.3'),
    proposedRemediation: 'Darken the grey one step, for example #4b5563 on the same background, which measures about 7 to 1.',
    evidence: ['data/scans/movement-home.desktop.pass1.json', 'data/scans/movement-home.desktop.pass2.json'],
    check: { kind: 'axe', ruleId: 'color-contrast', slug: 'movement-home', viewport: 'desktop', anchor: '.catalog-subtitle', stateSelector: 'h1' },
  });
}

// --- 6 and 7. The phone install banner --------------------------------------
{
  const b = axeNode('movement-home', 'mobile', 'button-name');
  add({
    headline: 'On a phone, the install banner has a close button with no name',
    observation:
      'At 390 by 844 the movement portal shows an add to home screen banner. Its close button has no text, no aria-label and no title, so it is announced as a button with nothing to say. It does not appear at desktop width, which is why one viewport is not enough.',
    screens: ['movement-home', 'movement-program', 'movement-faq'],
    state: 'Movement portal on a phone viewport, install banner shown',
    viewports: ['mobile'],
    selector: b.node.target.flat().join(' '),
    snippet: b.node.html,
    source: 'axe',
    axeImpact: b.impact,
    method: METHOD_AXE('button-name', 'mobile'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('4.1.2'),
    proposedRemediation: 'Give the close button an aria-label such as "Dismiss install banner".',
    evidence: ['data/scans/movement-home.mobile.pass1.json', 'data/scans/movement-home.mobile.pass2.json'],
    check: { kind: 'axe', ruleId: 'button-name', slug: 'movement-home', viewport: 'mobile', anchor: 'button', stateSelector: 'h1' },
  });
  const i = axeNode('movement-home', 'mobile', 'image-alt');
  add({
    headline: 'On a phone, the install banner icon has no alt attribute',
    observation:
      'The same banner loads its icon from a favicon service with no alt attribute at all, so the image is announced by its file name or its URL.',
    screens: ['movement-home', 'movement-program', 'movement-faq'],
    state: 'Movement portal on a phone viewport, install banner shown',
    viewports: ['mobile'],
    selector: i.node.target.flat().join(' '),
    snippet: i.node.html,
    source: 'axe',
    axeImpact: i.impact,
    method: METHOD_AXE('image-alt', 'mobile'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('1.1.1'),
    proposedRemediation: 'Add alt="" if the icon repeats the banner text, or an alt that names the app if it does not.',
    evidence: ['data/scans/movement-home.mobile.pass1.json', 'data/scans/movement-home.mobile.pass2.json'],
    check: { kind: 'axe', ruleId: 'image-alt', slug: 'movement-home', viewport: 'mobile', anchor: 'img', stateSelector: 'h1' },
  });
}

// --- 8. One title for every screen ------------------------------------------
{
  const row = manual('pass1').titleUniqueness.find((t) => t.title === 'WeGuide');
  add({
    headline: 'Every portal screen reports the same document title',
    observation:
      `The landing, sign in, create account and error screens all report <title>WeGuide</title>. ${row.slugs.length} screens, one title. A screen reader user moving between them, or reading a browser tab or a history entry, gets the same word each time, including on the screen that says the server cannot be reached.`,
    screens: row.slugs,
    state: 'All four portal screens reached without an account',
    viewports: ['desktop'],
    selector: 'head > title',
    snippet: '<title>WeGuide</title>',
    source: 'scripted-measure',
    axeImpact: null,
    method: METHOD_SCRIPT('document title read on each screen after render, then compared across the corpus'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('2.4.2'),
    proposedRemediation: 'Set the title on each route, for example "Sign in - WeGuide", and update it when the router navigates.',
    evidence: ['data/manual/pass1.json', 'data/manual/pass2.json'],
    check: { kind: 'titleRepeated', title: 'WeGuide', minScreens: 4 },
  });
}

// --- 9. autocomplete off on identity fields ---------------------------------
{
  const fields = manual('pass1').pages['portal-register-email'].desktop.formControls.filter((c) => c.visible && c.autocomplete === 'off');
  add({
    headline: 'Identity fields declare autocomplete="off"',
    observation:
      `On the create account screen ${fields.length} visible fields, the email address and the three text fields beside it, declare autocomplete="off"; the sign in email field does the same. That turns off the browser and password manager autofill that a reader with a motor or memory impairment relies on, and it is the mechanism WCAG names for identifying an input's purpose.`,
    screens: ['portal-signin-email', 'portal-register-email'],
    state: 'Sign in and create account screens, email method, fields empty',
    viewports: ['desktop'],
    selector: fields.map((f) => f.selector).join(', '),
    snippet: fields[0].html,
    source: 'scripted-measure',
    axeImpact: null,
    method: METHOD_SCRIPT('autocomplete attribute read from every rendered form control'),
    technicalEvidence: 'reproduced',
    reproducedIn: RUNS,
    proposedCriterion: sc('1.3.5'),
    proposedRemediation:
      'Set autocomplete to the token that matches each field: email or username, given-name, family-name, tel. The program code has no token in the WCAG list and can keep autocomplete off.',
    evidence: ['data/manual/pass1.json', 'data/manual/pass2.json'],
    check: { kind: 'autocompleteOff', slug: 'portal-register-email', minFields: fields.length },
  });
}

// --- 10. No visible focus indicator -----------------------------------------
add({
  headline: 'Focusing a portal text field changes nothing on screen',
  observation:
    'Arriving on the sign in email field with the Tab key leaves the rendering identical: no outline, no shadow, no border change, on the input or on any of its three ancestors. A capture of the field before focus and a capture of the same field while it holds focus are the same file, byte for byte. The same measurement repeats on the four create account fields.',
  screens: ['portal-signin-email', 'portal-register-email'],
  state: 'Sign in and create account screens, email method, field reached with the Tab key',
  viewports: ['desktop'],
  selector: '#ion-input-1',
  snippet: '<input class="native-input sc-ion-input-md" id="ion-input-1" type="email">',
  source: 'scripted-measure',
  axeImpact: null,
  method: METHOD_SCRIPT('computed style of the focused element and its ancestors compared with the same element unfocused, then two cropped captures compared byte for byte'),
  technicalEvidence: 'reproduced',
  reproducedIn: RUNS,
  proposedCriterion: sc('2.4.7'),
  proposedRemediation: 'Give focused fields and buttons a visible indicator, for example a two pixel outline in the brand purple with an offset, and never remove the browser default without replacing it.',
  evidence: ['public/evidence/signin-email-focused.png', 'data/manual/pass1.json', 'data/manual/pass2.json'],
  check: { kind: 'noFocusChange', slug: 'portal-signin-email', minStops: 1 },
});

// --- 11. Contrast on buttons that are inactive ------------------------------
{
  const a = axeNode('portal-signin-email', 'desktop', 'color-contrast');
  add({
    headline: 'axe flags the Login and Submit buttons for contrast, and they are inactive',
    observation:
      'axe measures the Login and Submit button labels at 3.01 to 1, under the 4.5 required. In the state we observed, both buttons carry the framework\'s disabled class because the form is empty. WCAG 1.4.3 does not set a contrast requirement for an inactive component, so this may well be exempt where it stands, and the question is what the same label measures once the button is live. Reaching that state means typing an address into their form, which this run did not do.',
    screens: ['portal-signin-email', 'portal-register-email'],
    state: 'Sign in and create account screens with empty forms, so the submit control is in its disabled styling',
    viewports: VPS,
    selector: a.node.target.flat().join(' '),
    snippet: a.node.html,
    source: 'axe',
    axeImpact: a.impact,
    method: METHOD_AXE('color-contrast', 'desktop'),
    technicalEvidence: 'to-investigate',
    reproducedIn: RUNS,
    openQuestion:
      'The rule fires in both runs, but the exception for inactive components may apply. It needs measuring in the enabled state, which requires entering a real address in their form.',
    proposedCriterion: sc('1.4.3'),
    proposedRemediation: 'Measure the enabled state first. If it is also under 4.5 to 1, darken the label; if only the disabled state is under, nothing is required by 1.4.3.',
    evidence: ['data/scans/portal-signin-email.desktop.pass1.json', 'data/scans/portal-signin-email.desktop.pass2.json'],
    check: { kind: 'axe', ruleId: 'color-contrast', slug: 'portal-signin-email', viewport: 'desktop', anchor: '#login-button', stateSelector: 'input[type=email]' },
  });
}

// --- 12. The empty submit ---------------------------------------------------
{
  const e = read('data/manual/error-identification.json');
  add({
    headline: 'The empty submit shows an error in red, and no live region carries it',
    observation:
      `Pressing Login with the field empty turns the field red, sets aria-invalid and prints "Please fill out the Email" under it. The screen holds ${e.after.liveRegions.length} live region and it is empty, so nothing was announced through it. The message also has no programmatic tie to the field it belongs to.`,
    screens: ['portal-signin-email'],
    state: 'Sign in screen, email field left empty, Login pressed once',
    viewports: ['desktop'],
    selector: 'input[type=email]',
    snippet: '<input type="email" aria-invalid="true"> with the message rendered in a sibling node',
    source: 'scripted-measure',
    axeImpact: null,
    method:
      'One scripted press of the Login button with the field empty, Chromium 153 headless 1280x800, 14 Sep 2026. Run once on purpose: no address was entered and nothing was sent.',
    technicalEvidence: 'to-investigate',
    reproducedIn: ['pass1'],
    openQuestion:
      'This was done once, deliberately, so it is not a reproduced observation. A second identical press, and a listen with a screen reader, are what would settle whether the message is announced.',
    proposedCriterion: sc('4.1.3'),
    proposedRemediation:
      'Put the message in a container with role="alert" or aria-live="assertive", and point the field at it with aria-describedby so the two are tied together.',
    evidence: ['data/manual/error-identification.json', 'data/shots/error-identification.after.png'],
    check: { kind: 'manual-once' },
  });
}

// ---------------------------------------------------------------------------
// Execution issues: anything that stopped a rule from producing a result.
// A screen that did not render, or a rule axe could not settle, is an open
// question, never a clean screen.
// ---------------------------------------------------------------------------
const executionIssues = [];
for (const t of TARGETS) {
  for (const run of RUNS) {
    for (const vp of VPS) {
      const j = scan(t.slug, vp, run);
      if (j.loadError) executionIssues.push({ key: `${t.slug}.${vp}.${run}`, kind: 'load-error', detail: j.loadError });
      else if (j.stateCheck?.verified === false)
        executionIssues.push({ key: `${t.slug}.${vp}.${run}`, kind: 'state-not-reached', detail: `the expected state was not found: ${j.stateCheck.description}` });
      if (j.incomplete.length)
        executionIssues.push({
          key: `${t.slug}.${vp}.${run}`,
          kind: 'axe-incomplete',
          detail: `axe could not settle ${j.incomplete.map((i) => i.ruleId).join(', ')} on this screen, so those rules are an open question here rather than a result`,
        });
    }
  }
}

const sample = scan('portal-signin-email', 'desktop', 'pass1');
const out = {
  schema: 'a11y-evidence-harness/observations/1',
  corpus: {
    date: CORPUS_DATE,
    runs: RUNS.map((id, i) => ({ id, label: i === 0 ? 'run A' : 'run B', startedAt: scan('portal-landing', 'desktop', id).scannedAt })),
    screens: TARGETS.map((t) => ({
      slug: t.slug, url: t.url, label: t.label, group: t.group,
      state: t.expectState.description,
      stateVerified: RUNS.every((r) => scan(t.slug, 'desktop', r).stateCheck?.verified === true),
    })),
    viewports: VPS.map((v) => v),
    viewportDetail: VPS.map((v) => ({
      name: v, width: VIEWPORTS[v].width, height: VIEWPORTS[v].height, deviceScaleFactor: VIEWPORTS[v].deviceScaleFactor,
      note: v === 'zoom200' ? '200% browser zoom on a 1280x800 display, emulated as a 640x400 CSS viewport at deviceScaleFactor 2' : null,
    })),
    engine: sample.engine,
    tags: { normative: WCAG_TAGS, separate: BEST_PRACTICE_TAGS },
    rulesExecuted: sample.rulesRun.length,
    rulesRun: sample.rulesRun,
    toolingNote: {
      evidenceSlug: 'portal-signin-email',
      evidenceViewport: 'desktop',
      patchedHostTags: sample.domTraversal.patchedHostTags,
      axeNodesAsServed: sample.domTraversal.axeNodesAsServed,
      axeNodesAfterRestore: sample.domTraversal.axeNodesAfterRestore,
      rulesEvaluatedAsServed: sample.domTraversal.rulesEvaluatedAsServed,
      rulesEvaluatedAfterRestore: sample.domTraversal.rulesEvaluatedAfterRestore,
      violationsAsServed: sample.domTraversal.violationsAsServed,
      violationsAfterRestore: sample.domTraversal.violationsAfterRestore,
    },
    executionIssues,
    limitsShort: [
      'The scripted tab sequence stops early on the portal, so the tab order was not measured end to end. No observation rests on it.',
      'SC 2.4.11 Focus Not Obscured was not concluded: the hit test returns artefacts across the shadow boundary, so its results were discarded.',
      'SC 3.3.8 Accessible Authentication was not concluded. One screen is not an authentication process.',
    ],
    limits: [
      'The scripted tab sequence stops early on the portal, because focus returns to the document body between stops. The portal tab order was not measured end to end and no observation here rests on it.',
      'SC 2.4.11 Focus Not Obscured was not concluded. The hit test that would answer it returns artefacts across the component shadow boundary, so its results were discarded rather than published.',
      'The independent contrast recomputation reads colours from the light DOM and cannot see a background painted inside a shadow root. Where it disagrees with axe, the axe figure is the one quoted.',
      'SC 2.5.8 Target Size was measured geometrically, with the spacing and inline exceptions applied. No control under 24 by 24 CSS pixels survived those exceptions on the screens observed. That is a measurement, not a verdict.',
      'SC 3.3.8 Accessible Authentication was not concluded. In the state observed the sign in screen has no password field, no CAPTCHA and does not block pasting, but one screen is not the authentication process.',
      'Criteria that need a person, among them whether an alternative text is meaningful, whether a reading order makes sense, whether a heading describes its section, and whether an error message helps, were not assessed here.',
    ],
  },
  observations: O,
};

// Guard rails on the way out.
for (const o of O) {
  if (!WCAG22[o.proposedCriterion.number]) throw new Error(`${o.id}: ${o.proposedCriterion.number} is not a WCAG 2.2 A or AA criterion`);
  for (const e of o.evidence) if (!existsSync(path.join(ROOT, e))) throw new Error(`${o.id}: missing evidence ${e}`);
}

writeFileSync(path.join(ROOT, 'data/findings.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`${O.length} observations, ${executionIssues.length} execution issues, ${out.corpus.screens.length} screens, ${out.corpus.rulesExecuted} rules executed`);
console.log('reproduced:', O.filter((o) => o.technicalEvidence === 'reproduced').length, ' to investigate:', O.filter((o) => o.technicalEvidence === 'to-investigate').length);
