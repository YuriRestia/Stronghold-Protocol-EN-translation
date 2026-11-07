import { APP_VERSION } from '../../shared/constants.js';

/** Unrelated browser flows use a returning player; release-notes.e2e.test.js covers first-run and update prompts. */
export function seedReleaseRead(page) {
  return page.evaluateOnNewDocument((version) => {
    if (window.top !== window) return; // plugin sandbox frames do not have access to the host's storage
    localStorage.setItem(`sp.pref.release-seen.${version}`, '1');
    // (fork) no entry film (ui/entryFilm.js): with the art on disk its tap-to-enter card covers the login screen
    sessionStorage.setItem('sp.entryFilm.off', '1');
  }, APP_VERSION);
}
