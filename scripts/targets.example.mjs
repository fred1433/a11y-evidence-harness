// Copy this file to scripts/targets.mjs and point it at the screens you are
// looking at. Nothing here signs in, creates an account or submits data: the
// harness loads screens and reads them.
//
// `expectState` is the proof that a screen actually rendered. A framework shell
// answering 200 is not a page, and a scan of a shell must never be filed as a
// screen with no defects, so every entry has to say how to recognise itself.
export * from './config.mjs';

/** @type {{slug:string,url:string,group:string,label:string,settleMs:number,expectState:object,note?:string}[]} */
export const TARGETS = [
  {
    slug: 'home',
    url: 'https://example.com/',
    group: 'Public site',
    label: 'Home',
    settleMs: 4000,
    expectState: { kind: 'selector', value: 'h1', description: 'Home page rendered' },
  },
  {
    slug: 'sign-in',
    url: 'https://example.com/sign-in',
    group: 'Public site',
    label: 'Sign in',
    settleMs: 6000,
    expectState: { kind: 'text', value: 'Sign in', description: 'Sign in form rendered' },
    note: 'Loaded and read only. Never submitted.',
  },
];
