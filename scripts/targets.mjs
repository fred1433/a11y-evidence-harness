// Public sample of the WeGuide portal. This is not the scope of the audit
// WeGuide is buying; it is the set of screens that can be reached without an
// account, which is what a harness can be demonstrated on from the outside.
//
// Nothing here signs in, creates an account, resets a password, sends an email
// or performs any action on the product. Screens are loaded and read.
//
// `expectState` is the proof that the screen actually rendered. An Angular shell
// answering 200 is not a rendered page, and a scan of a shell that found nothing
// must never be reported as a screen with no defects.

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

/** @type {{slug:string,url:string,group:string,label:string,settleMs:number,note?:string}[]} */
export const TARGETS = [
  // --- Patient portal, app.weguide.com.au (Angular + Ionic single page app) ---
  {
    slug: 'portal-landing',
    url: 'https://app.weguide.com.au/',
    group: 'Patient portal',
    label: 'Portal landing (app.weguide.com.au)',
    settleMs: 8000,
    note: 'Redirects client side to /landing. Entry point for Login and Create an account.',
    expectState: { kind: 'text', value: 'Welcome to WeGuide', description: 'Landing screen with the Login and Create an account buttons' },
  },
  {
    slug: 'portal-signin-email',
    url: 'https://app.weguide.com.au/signin?throughOption=email&canFillPreviousCredential=false&programCode=',
    group: 'Patient portal',
    label: 'Portal sign in, email method',
    settleMs: 8000,
    note: 'Passwordless sign in. One email field, sends a login link.',
    expectState: { kind: 'selector', value: 'input[type=email]', description: 'Sign in screen, email method, email field rendered' },
  },
  {
    slug: 'portal-register-email',
    url: 'https://app.weguide.com.au/register?throughOption=email&canFillPreviousCredential=false&programCode=',
    group: 'Patient portal',
    label: 'Portal create account, email method',
    settleMs: 8000,
    note: 'Form is loaded and read only. It is never submitted.',
    expectState: { kind: 'selector', value: 'input[type=email]', description: 'Create account screen, email method, form rendered and never submitted' },
  },
  {
    slug: 'portal-login-deeplink',
    url: 'https://app.weguide.com.au/login',
    group: 'Patient portal',
    label: 'Portal /login deep link',
    settleMs: 8000,
    note: 'Documented entry URL. In a desktop browser it lands on /error/undefined.',
    expectState: { kind: 'text', value: 'connect to our server', description: 'Error screen reached from the /login deep link' },
  },

  // --- Movement analysis portal, movement.weguide.health ---
  {
    slug: 'movement-home',
    url: 'https://movement.weguide.health/',
    group: 'Movement portal',
    label: 'Movement portal, exercise catalog',
    settleMs: 7000,
    expectState: { kind: 'selector', value: 'h1', description: 'Exercise catalog rendered' },
  },
  {
    slug: 'movement-program',
    url: 'https://movement.weguide.health/program',
    group: 'Movement portal',
    label: 'Movement portal, programs',
    settleMs: 7000,
    expectState: { kind: 'selector', value: 'h1', description: 'Programs screen rendered' },
  },
  {
    slug: 'movement-faq',
    url: 'https://movement.weguide.health/faq',
    group: 'Movement portal',
    label: 'Movement portal, FAQ',
    settleMs: 7000,
    expectState: { kind: 'selector', value: 'h1', description: 'FAQ screen rendered' },
  },

];

export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
export const BEST_PRACTICE_TAGS = ['best-practice'];
