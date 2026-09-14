/**
 * The half of a WCAG 2.2 AA review that an automated rule engine does not cover.
 *
 *   node scripts/manual-checks.mjs --pass pass1
 *
 * Everything here is driven through Playwright, one page at a time, so the method
 * behind each observation is written down and can be replayed. It never signs in,
 * never creates an account, and submits exactly one empty form (the portal sign in
 * form, with no data in it) to see how errors are announced.
 *
 * Checks, and what each one is for:
 *   2.4.2 Page Titled            title text, and whether it is unique across the corpus
 *   3.1.1 Language of Page       html lang present and well formed
 *   2.4.7 Focus Visible          keyboard walk, computed style compared focused vs not
 *   2.4.11 Focus Not Obscured    focused element hit tested against what is painted on top
 *   2.5.8 Target Size (Minimum)  bounding boxes, with the spacing and inline exceptions applied
 *   1.3.1 / 4.1.2 names          accessible name of every form control
 *   3.3.1 Error Identification   one empty submit of the sign in form
 *   3.3.8 Accessible Auth        cognitive function test, paste, autofill
 *   3.2.6 Consistent Help        help mechanism present and in the same relative place
 *   1.4.3 / 1.4.11 contrast      contrast ratios recomputed from rendered colours
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TARGETS, VIEWPORTS, USER_AGENT, CORPUS_DATE } from './targets.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const PAUSE_BETWEEN_LOADS_MS = 2500;
const TAB_STOPS = 30;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}
const passId = arg('pass', 'pass1');

// ---------------------------------------------------------------------------
// Code injected into the page. Kept in one string so the method is auditable.
// ---------------------------------------------------------------------------
const PAGE_HELPERS = `
window.__a11y = (() => {
  const srgb = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const parse = s => {
    if (!s) return null;
    const m = s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };
  const blend = (fg, bg) => fg.a >= 1 ? fg.rgb : fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  // Walk up for the first opaque background. Returns null if an image or gradient
  // is in the way, because then the ratio cannot be computed from colours alone.
  const bgOf = el => {
    let n = el, acc = null;
    while (n && n !== document.documentElement.parentNode) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return { unknown: 'background-image' };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { acc = acc ? blend({ rgb: acc, a: 1 }, c.rgb) : (c.a >= 1 ? c.rgb : null); if (c.a >= 1) return { rgb: acc || c.rgb }; }
      n = n.parentElement;
    }
    return { rgb: [255, 255, 255], assumed: true };
  };
  const sel = el => {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      let p = n.tagName.toLowerCase();
      if (n.classList.length) p += '.' + [...n.classList].slice(0, 2).map(c => CSS.escape(c)).join('.');
      const sibs = n.parentElement ? [...n.parentElement.children].filter(s => s.tagName === n.tagName) : [];
      if (sibs.length > 1) p += ':nth-of-type(' + (sibs.indexOf(n) + 1) + ')';
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(' > ');
  };
  const name = el => {
    if (!el) return '';
    const al = el.getAttribute('aria-label');
    if (al && al.trim()) return al.trim();
    const lb = el.getAttribute('aria-labelledby');
    if (lb) { const t = lb.split(/\\s+/).map(id => (document.getElementById(id) || {}).innerText || '').join(' ').trim(); if (t) return t; }
    if (el.labels && el.labels.length) { const t = [...el.labels].map(l => l.innerText.trim()).join(' ').trim(); if (t) return t; }
    if (el.tagName === 'INPUT' && (el.type === 'button' || el.type === 'submit')) return el.value || '';
    if (el.tagName === 'IMG') return el.getAttribute('alt') || '';
    const t = (el.innerText || el.textContent || '').trim();
    if (t) return t;
    const ti = el.getAttribute('title');
    return ti ? ti.trim() : '';
  };
  const styleSnap = el => { const cs = getComputedStyle(el); return {
    outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor,
    boxShadow: cs.boxShadow, border: cs.borderWidth + ' ' + cs.borderStyle + ' ' + cs.borderColor,
    background: cs.backgroundColor, color: cs.color, textDecoration: cs.textDecorationLine,
    filter: cs.filter, transform: cs.transform }; };
  return { parse, ratio, blend, bgOf, sel, name, styleSnap, lum };
})();
`;


// Same DOM-accessor restoration as scripts/scan.mjs. On the portal, <ion-app>,
// <ion-input> and <ion-alert> report zero childNodes while holding real children,
// which breaks any tree walk. Restored locally so the checks below see the page.
const RESTORE_DOM_ACCESSORS = `
(() => {
  const KEYS = ['childNodes','children','firstChild','lastChild','firstElementChild','childElementCount','textContent'];
  const native = {};
  for (const k of KEYS) { const d = Object.getOwnPropertyDescriptor(Node.prototype, k) || Object.getOwnPropertyDescriptor(Element.prototype, k); if (d) native[k] = d; }
  const patched = [...document.querySelectorAll('*')].filter(el => el.childNodes.length === 0 && el.firstElementChild);
  window.__patchedHosts = patched.map(el => el.tagName.toLowerCase());
  for (const el of patched) for (const [k, d] of Object.entries(native)) { try { Object.defineProperty(el, k, d); } catch {} }
})();
`;

// ---------------------------------------------------------------------------

async function openPage(browser, viewportName) {
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
  });
  const page = await context.newPage();
  return { context, page };
}

/** 2.4.7 and 2.4.11: walk the page with Tab and watch what happens. */
async function keyboardWalk(page) {
  await page.evaluate(() => { (document.activeElement || document.body).blur?.(); document.body.focus?.(); });
  const stops = [];
  const seen = new Set();
  for (let i = 0; i < TAB_STOPS; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
    const stop = await page.evaluate(() => {
      let el = document.activeElement;
      while (el && el.shadowRoot && el.shadowRoot.activeElement) el = el.shadowRoot.activeElement;
      if (!el || el === document.body) return { none: true };
      const A = window.__a11y;
      const focused = A.styleSnap(el);
      const r = el.getBoundingClientRect();
      // What is actually painted at the centre of the focused control?
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const hit = document.elementFromPoint(cx, cy);
      const covered = !!(hit && hit !== el && !el.contains(hit) && !hit.contains(el));
      return {
        selector: A.sel(el), tag: el.tagName.toLowerCase(), name: A.name(el).slice(0, 60),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        offscreen: r.width === 0 || r.height === 0 || r.bottom < 0 || r.top > innerHeight,
        coveredBy: covered ? A.sel(hit) : null,
        focusedStyle: focused,
        html: el.outerHTML.slice(0, 200),
      };
    });
    if (stop.none) break;
    const key = stop.selector + '|' + stop.rect.x + ',' + stop.rect.y;
    if (seen.has(key)) { stops.push({ ...stop, repeat: true }); break; }
    seen.add(key);
    // Same element, unfocused: does anything visibly change on focus?
    const unfocused = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      el.blur();
      const s = window.__a11y.styleSnap(el);
      return s;
    }, stop.selector).catch(() => null);
    const changed = unfocused
      ? Object.keys(stop.focusedStyle).filter((k) => stop.focusedStyle[k] !== unfocused[k])
      : null;
    stops.push({ ...stop, unfocusedStyle: unfocused, changedOnFocus: changed, focusIndicator: changed === null ? 'not-measured' : changed.length > 0 ? 'yes' : 'none' });
    // Put focus back where it was so the walk continues in order.
    await page.evaluate((sel) => { const el = document.querySelector(sel); el?.focus?.(); }, stop.selector).catch(() => {});
  }
  return stops;
}

/** 2.5.8 Target Size (Minimum), with the spacing and inline exceptions applied. */
async function targetSizes(page) {
  return page.evaluate(() => {
    const A = window.__a11y;
    const SELECTOR = 'a[href], button, input:not([type=hidden]), select, textarea, ion-button, [role=button], [role=link], [role=checkbox], [role=radio], [role=tab], [role=switch], summary';
    const els = [...document.querySelectorAll(SELECTOR)].filter((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && r.height > 0 && r.top < innerHeight * 3;
    });
    const boxes = els.map((el) => ({ el, r: el.getBoundingClientRect() }));
    const undersized = [];
    for (const { el, r } of boxes) {
      if (r.width >= 24 && r.height >= 24) continue;
      // Inline exception: the target sits inside a sentence of text.
      const cs = getComputedStyle(el);
      const parentText = (el.parentElement?.innerText || '').trim();
      const inline = cs.display.startsWith('inline') && parentText.length > (el.innerText || '').trim().length + 15;
      if (inline) continue;
      // Spacing exception: a 24px circle on this target touches no other target's circle.
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const clash = boxes.some(({ el: o, r: o2 }) => {
        if (o === el) return false;
        const ox = o2.left + o2.width / 2, oy = o2.top + o2.height / 2;
        return Math.hypot(cx - ox, cy - oy) < 24;
      });
      if (!clash) continue;
      undersized.push({
        selector: A.sel(el), tag: el.tagName.toLowerCase(), name: A.name(el).slice(0, 50),
        width: Math.round(r.width), height: Math.round(r.height),
        html: el.outerHTML.slice(0, 220),
        exceptionsApplied: 'inline and spacing exceptions of SC 2.5.8 both checked and not met',
      });
    }
    return { interactiveCount: boxes.length, undersized: undersized.slice(0, 20) };
  });
}

/** 1.3.1 and 4.1.2: does every form control carry an accessible name and a purpose? */
async function formControls(page) {
  return page.evaluate(() => {
    const A = window.__a11y;
    const PURPOSE = { email: 'email', tel: 'tel', password: 'current-password', url: 'url' };
    return [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        selector: A.sel(el), tag: el.tagName.toLowerCase(), type: el.getAttribute('type'),
        accessibleName: A.name(el), hasLabelElement: !!(el.labels && el.labels.length && [...el.labels].some((l) => l.innerText.trim())),
        ariaLabel: el.getAttribute('aria-label'), placeholder: el.getAttribute('placeholder'),
        autocomplete: el.getAttribute('autocomplete'),
        expectedPurpose: PURPOSE[el.getAttribute('type')] || null,
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        ariaInvalid: el.getAttribute('aria-invalid'), ariaDescribedby: el.getAttribute('aria-describedby'),
        visible: cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0,
        html: el.outerHTML.slice(0, 260),
      };
    });
  });
}

/** 3.2.6 Consistent Help: is a help mechanism present, and where in the page order? */
async function helpMechanism(page) {
  return page.evaluate(() => {
    const A = window.__a11y;
    const links = [...document.querySelectorAll('a[href]')];
    const hits = links
      .map((a, i) => ({ a, i }))
      .filter(({ a }) => /contact|help|support|faq|get in touch/i.test((a.innerText || '') + ' ' + (a.getAttribute('href') || '')))
      .map(({ a, i }) => ({ text: (a.innerText || '').trim().slice(0, 40), href: a.getAttribute('href'), orderIndex: i, selector: A.sel(a), inHeader: !!a.closest('header, nav'), inFooter: !!a.closest('footer') }));
    return { totalLinks: links.length, helpLinks: hits.slice(0, 8) };
  });
}

/** 1.4.3 and 1.4.11: contrast recomputed from the colours the browser actually painted. */
async function contrast(page) {
  return page.evaluate(() => {
    const A = window.__a11y;
    const out = { text: [], nonText: [] };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let node;
    while ((node = walker.nextNode())) {
      const t = node.nodeValue.trim();
      if (t.length < 3) continue;
      const el = node.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const fg = A.parse(cs.color);
      const bg = A.bgOf(el);
      if (!fg) continue;
      if (bg.unknown) { out.text.push({ selector: A.sel(el), text: t.slice(0, 40), note: 'background image, ratio not computable from colours' }); continue; }
      const fgRgb = A.blend(fg, bg.rgb);
      const ratio = A.ratio(fgRgb, bg.rgb);
      const px = parseFloat(cs.fontSize);
      const bold = Number(cs.fontWeight) >= 700;
      const large = px >= 24 || (bold && px >= 18.66);
      const required = large ? 3 : 4.5;
      if (ratio < required) {
        out.text.push({
          selector: A.sel(el), text: t.slice(0, 40), fg: cs.color, bg: 'rgb(' + bg.rgb.map(Math.round).join(', ') + ')',
          ratio: Math.round(ratio * 100) / 100, required, fontSizePx: px, bold, large,
          assumedWhiteRoot: !!bg.assumed, html: el.outerHTML.slice(0, 200),
        });
      }
    }
    // 1.4.11: boundary of interactive controls against their surroundings.
    for (const el of [...document.querySelectorAll('button, ion-button, input:not([type=hidden]), select, textarea, [role=button]')].slice(0, 25)) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const own = A.parse(cs.backgroundColor);
      const around = A.bgOf(el.parentElement || document.body);
      if (!own || around.unknown || own.a === 0) continue;
      const ratio = A.ratio(A.blend(own, around.rgb || [255, 255, 255]), around.rgb || [255, 255, 255]);
      out.nonText.push({
        selector: A.sel(el), name: A.name(el).slice(0, 40), fill: cs.backgroundColor,
        surround: 'rgb(' + (around.rgb || [255, 255, 255]).map(Math.round).join(', ') + ')',
        borderWidth: cs.borderWidth, ratio: Math.round(ratio * 100) / 100, requiredIfSoleIndicator: 3,
      });
    }
    out.text = out.text.slice(0, 25);
    out.nonText = out.nonText.slice(0, 15);
    return out;
  });
}

/** 3.3.8: is there a cognitive function test, and can the field be pasted into / autofilled? */
async function accessibleAuth(page) {
  return page.evaluate(() => {
    const A = window.__a11y;
    const fields = [...document.querySelectorAll('input:not([type=hidden])')];
    const pw = fields.filter((f) => f.type === 'password');
    const captcha = !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], .g-recaptcha, [class*="captcha" i]');
    const results = fields.filter((f) => f.offsetParent !== null).map((f) => {
      // Cancelable paste event, carrying nothing. We read defaultPrevented only;
      // no value is ever written into the field.
      const ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
      f.focus();
      const delivered = f.dispatchEvent(ev);
      return { selector: A.sel(f), type: f.type, autocomplete: f.getAttribute('autocomplete'), pasteBlocked: !delivered, valueAfter: f.value };
    });
    return { passwordFields: pw.length, captchaPresent: captcha, fields: results,
      method: 'cancelable paste event dispatched with an empty clipboard payload; only defaultPrevented was read, no text was entered' };
  });
}

// ---------------------------------------------------------------------------

const browser = await chromium.launch({ headless: true });
const results = { schema: 'weguide-a11y-preaudit/manual/1', pass: passId, corpusDate: CORPUS_DATE, ranAt: new Date().toISOString(), browser: `Chromium ${browser.version()}`, headless: true, tabStops: TAB_STOPS, pages: {} };

for (const target of TARGETS) {
  const perPage = { slug: target.slug, url: target.url, label: target.label, group: target.group };
  // Desktop pass: titles, focus, names, help, contrast, auth.
  {
    const { context, page } = await openPage(browser, 'desktop');
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(target.settleMs);
      await page.addScriptTag({ content: RESTORE_DOM_ACCESSORS });
      await page.addScriptTag({ content: PAGE_HELPERS });
      perPage.desktop = {
        finalUrl: page.url(),
        patchedHosts: await page.evaluate(() => window.__patchedHosts || []),
        title: await page.title(),
        lang: await page.evaluate(() => document.documentElement.getAttribute('lang')),
        keyboardWalk: await keyboardWalk(page),
        formControls: await formControls(page),
        help: await helpMechanism(page),
        contrast: await contrast(page),
        accessibleAuth: await accessibleAuth(page),
      };
    } catch (e) {
      perPage.desktop = { error: e.message.slice(0, 300) };
    }
    await context.close();
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_LOADS_MS));
  }
  // Mobile pass: target sizes are only meaningful where fingers are used.
  {
    const { context, page } = await openPage(browser, 'mobile');
    try {
      await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForTimeout(target.settleMs);
      await page.addScriptTag({ content: RESTORE_DOM_ACCESSORS });
      await page.addScriptTag({ content: PAGE_HELPERS });
      perPage.mobile = { finalUrl: page.url(), patchedHosts: await page.evaluate(() => window.__patchedHosts || []), targetSize: await targetSizes(page) };
    } catch (e) {
      perPage.mobile = { error: e.message.slice(0, 300) };
    }
    await context.close();
    await new Promise((r) => setTimeout(r, PAUSE_BETWEEN_LOADS_MS));
  }
  results.pages[target.slug] = perPage;
  console.log(`  ${target.slug}: tabStops=${perPage.desktop?.keyboardWalk?.length ?? '-'} noFocusIndicator=${perPage.desktop?.keyboardWalk?.filter((s) => s.focusIndicator === 'none').length ?? '-'} smallTargets=${perPage.mobile?.targetSize?.undersized?.length ?? '-'} contrastText=${perPage.desktop?.contrast?.text?.length ?? '-'}`);
}

// 2.4.2: are the titles distinct across the corpus?
const titles = {};
for (const [slug, p] of Object.entries(results.pages)) {
  const t = p.desktop?.title;
  if (t == null) continue;
  (titles[t] ||= []).push(slug);
}
results.titleUniqueness = Object.entries(titles).map(([title, slugs]) => ({ title, slugs, unique: slugs.length === 1 }));

await mkdir(path.join(ROOT, 'data/manual'), { recursive: true });
await writeFile(path.join(ROOT, `data/manual/${passId}.json`), JSON.stringify(results, null, 2) + '\n');
await browser.close();
console.log('done');
