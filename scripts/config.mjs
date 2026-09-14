/**
 * Everything the harness needs that is not a list of screens: the viewport
 * conditions, the rule tags it asks axe for, and the user agent it presents.
 *
 * The screens themselves live in scripts/targets.mjs, which is not committed:
 * a given engagement's corpus belongs to that engagement. Copy
 * scripts/targets.example.mjs to scripts/targets.mjs and edit it.
 */

export const CORPUS_DATE = '2026-09-14';

export const VIEWPORTS = {
  // Desktop, 1280x800 CSS pixels, 1 device pixel per CSS pixel.
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  // Phone, 390x844 CSS pixels (iPhone 14 class), touch enabled.
  mobile: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  // 200% browser zoom on a 1280x800 display. Browser zoom halves the CSS viewport
  // and doubles the device pixel ratio, so a 1280x800 screen at 200% reports
  // 640x400 CSS pixels at deviceScaleFactor 2. That is what we emulate here,
  // rather than a CSS `zoom` property, which browsers do not apply the same way.
  zoom200: { width: 640, height: 400, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
};

export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const BEST_PRACTICE_TAGS = ['best-practice'];
