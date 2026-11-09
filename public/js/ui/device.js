// Multi-device support (desktop Chrome / Edge / Firefox / Safari, iPad and Android tablets in landscape, phones in
// landscape ≥ 640×360 CSS px). Capabilities are feature-detected; isIOS only selects explanatory copy:
//
//   detectFeatures()        { touch, coarse, hover, fullscreen, standalone, reducedMotion, importMaps, … } of this browser
//   installDeviceSupport()  once at boot (main.js): <html> classes (sp-touch / sp-coarse / sp-hover / sp-fs /
//                           sp-standalone / sp-reduced-motion / sp-no-hover / sp-rotatable), kept current when an input device or a
//                           preference changes; blocks page zoom gestures (iOS Safari ignores user-scalable=no:
//                           gesturestart / gesturechange are cancelled, ctrl+wheel / trackpad pinch too; touch-action in
//                           css/devices.css handles the rest); re-fires `resize` once the viewport
//                           settles after a rotation (iOS reports the old size for a few frames) so the field view and
//                           the rem scale re-layout; keeps --sp-vh (the real visible height) for the CSS.
//   fullscreen              { supported(), active(), toggle(), exit() }: Fullscreen API with the webkit-prefixed
//                           variant (iPadOS / older Safari); iPhone Safari has no element fullscreen → unsupported and the
//                           button hides. Android: after entering, the orientation is locked to landscape when allowed.
//   FullscreenButton        HUD / title button (hidden where unsupported), follows fullscreenchange.
//   useScreenWakeLock(active) screen wake lock while active and visible, restored on foreground and released on cleanup.
//   long-press              a still touch of LONG_PRESS_MS on a DOM control → a synthetic `contextmenu` (= detail) when
//                           the browser sends none (iOS Safari); when a handler took it (preventDefault: detail card,
//                           tooltip) the click of the release is swallowed — otherwise the slow tap stays a tap.
//   reducedMotion()         prefers-reduced-motion (the CSS side lives in css/theme.css + css/devices.css).
// CSS counterpart: public/css/devices.css (safe-area insets, touch-action, overscroll, tap-target expansion).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { pwaInstall } from '../pwa.js';
import { html, Icon, Button } from './components.js';
import { t } from '../../../shared/i18n.js';

/** A touch held this long without moving opens the detail (contextmenu) on DOM controls. */
export const LONG_PRESS_MS = 520;
const LONG_PRESS_SLOP = 10;

const mq = (win, q) => { try { return !!win.matchMedia?.(q)?.matches; } catch { return false; } };

/** iOS/iPadOS hint copy only; never a browser-capability gate. */
export function isIOS(win = globalThis) {
  const nav = win.navigator || {};
  const ua = nav.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua)
    || ((nav.platform === 'MacIntel' || /Macintosh/.test(ua)) && nav.maxTouchPoints > 1);
}

/**
 * Whether the SCREEN (not the viewport) is in landscape: a split-view iPad or a narrow desktop window has a portrait
 * viewport on a landscape screen — rotating would not help there. screen.orientation (Chrome, Firefox, Safari 16.4+),
 * else window.orientation (older iOS); iOS reports screen.width/height in portrait always, so no size guess there.
 * @param {any} [win]
 * @returns {boolean|null} null when unknown
 */
export function screenLandscape(win = globalThis) {
  try {
    const t = win.screen?.orientation?.type;
    if (typeof t === 'string' && t) return t.startsWith('landscape');
  } catch { /* ignore */ }
  const o = Number(win.orientation);
  if (win.orientation != null && Number.isFinite(o)) return Math.abs(o) === 90;
  return null;
}

/**
 * What this browser / device can do.
 * @param {any} [win]
 */
export function detectFeatures(win = globalThis) {
  const doc = win.document;
  const nav = win.navigator || {};
  const touchPoints = Number(nav.maxTouchPoints) || 0;
  const coarse = mq(win, '(any-pointer: coarse)') || mq(win, '(pointer: coarse)');
  const fine = mq(win, '(any-pointer: fine)');
  const hover = mq(win, '(any-hover: hover)') || mq(win, '(hover: hover)');
  const el = doc?.documentElement;
  const fsEnabled = !!(doc && (doc.fullscreenEnabled || doc.webkitFullscreenEnabled))
    && !!(el && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'));
  let importMaps = false;
  try { importMaps = typeof win.HTMLScriptElement?.supports === 'function' && win.HTMLScriptElement.supports('importmap'); } catch { importMaps = false; }
  return {
    touch: touchPoints > 0 || coarse || 'ontouchstart' in (win || {}),
    coarse,
    primaryCoarse: mq(win, '(pointer: coarse)'), // (fork) the main input is a touch screen (first-tap fullscreen)
    fine,
    hover,
    fullscreen: fsEnabled,
    // (fork) a browser tab in element fullscreen matches (display-mode: fullscreen) too (Chrome): that is not the installed app
    standalone: mq(win, '(display-mode: standalone)') || nav.standalone === true
      || (mq(win, '(display-mode: fullscreen)') && !(doc?.fullscreenElement || doc?.webkitFullscreenElement)),
    reducedMotion: mq(win, '(prefers-reduced-motion: reduce)'),
    screenLandscape: screenLandscape(win),
    importMaps,
    broadcastChannel: typeof win.BroadcastChannel === 'function',
    pointerEvents: typeof win.PointerEvent === 'function',
    gestureEvents: typeof win.GestureEvent === 'function',   // WebKit only (pinch zoom has to be cancelled by hand)
    visualViewport: !!win.visualViewport,
  };
}

/** The classes installDeviceSupport puts on <html> for a feature set (pure; tested). */
export function featureClasses(f) {
  return {
    'sp-touch': !!f.touch,
    'sp-coarse': !!f.coarse,
    'sp-hover': !!f.hover,
    'sp-no-hover': !f.hover,
    'sp-fs': !!f.fullscreen,
    'sp-standalone': !!f.standalone,
    'sp-reduced-motion': !!f.reducedMotion,
    // the rotate hint (css/theme.css) is for a device you can turn: a touch screen whose screen is not in landscape —
    // never a desktop browser window that happens to be narrow, nor a split-view iPad
    'sp-rotatable': !!f.coarse && f.screenLandscape !== true,
  };
}

/** prefers-reduced-motion: reduce */
export function reducedMotion(win = globalThis) { return mq(win, '(prefers-reduced-motion: reduce)'); }

/** The short-screen block of the stylesheets (css/screens/lobby.css: landscape phones), for text CSS cannot swap. */
export const SHORT_SCREEN_QUERY = '(max-height: 520px)';

/**
 * Whether a media query matches, kept current through its change events (a rotation, a resized window); false where
 * matchMedia is missing. The lobby passes SHORT_SCREEN_QUERY's answer to 选择同盟方式 (its key field's placeholder).
 * @param {string} query
 * @param {any} [win]
 */
export function useMediaQuery(query, win = globalThis) {
  const [on, setOn] = useState(() => mq(win, query));
  useEffect(() => {
    let m = null;
    try { m = win.matchMedia?.(query); } catch { m = null; }
    if (!m) return undefined;
    const sync = () => setOn(!!m.matches);
    sync();
    if (typeof m.addEventListener === 'function') { m.addEventListener('change', sync); return () => m.removeEventListener('change', sync); }
    if (typeof m.addListener === 'function') { m.addListener(sync); return () => m.removeListener(sync); } // Safari < 14
    return undefined;
  }, [query]);
  return on;
}

/**
 * Keep a class on <html> while a component is mounted and `on` holds (replaces CSS :has(), which Firefox ESR 115 and
 * Safari < 15.4 lack): the match screen sets sp-in-match, the connection banner sp-conn.
 * @param {string} name
 * @param {boolean} [on]
 */
export function useDocClass(name, on = true) {
  useEffect(() => {
    const el = globalThis.document?.documentElement;
    if (!el || !on) return undefined;
    el.classList.add(name);
    return () => el.classList.remove(name);
  }, [name, !!on]);
}

/** Hold a screen wake lock while visible; the disposer releases it. */
export function installScreenWakeLock(win = globalThis) {
  const doc = win.document;
  const wakeLock = win.navigator?.wakeLock;
  if (!doc || !wakeLock) return () => {};
  let sentinel = null;
  let generation = 0;
  const release = async (lock) => { try { await lock?.release(); } catch { /* best effort */ } };
  const cancelRetry = () => {
    doc.removeEventListener('pointerdown', onGesture, true);
    doc.removeEventListener('touchstart', onGesture, true);
  };
  const onGesture = () => {
    cancelRetry(); // a touch can also send a pointer event
    if (doc.visibilityState === 'visible') void acquire(generation, false);
  };
  const acquire = async (request, retry = true) => {
    try {
      const lock = await wakeLock.request('screen');
      // A visibility change or cleanup can finish before the request.
      if (request !== generation || doc.visibilityState !== 'visible') void release(lock);
      else sentinel = lock;
    } catch {
      if (retry && request === generation && doc.visibilityState === 'visible') {
        doc.addEventListener('pointerdown', onGesture, true);
        doc.addEventListener('touchstart', onGesture, { capture: true, passive: true });
      }
    }
  };
  const update = () => {
    const request = ++generation;
    cancelRetry();
    void release(sentinel);
    sentinel = null;
    if (doc.visibilityState === 'visible') void acquire(request);
  };
  doc.addEventListener('visibilitychange', update);
  void update();
  return () => {
    ++generation;
    cancelRetry();
    doc.removeEventListener('visibilitychange', update);
    void release(sentinel);
    sentinel = null;
  };
}

export function useScreenWakeLock(active) {
  useEffect(() => active ? installScreenWakeLock() : undefined, [!!active]);
}

// ---- fullscreen ----------------------------------------------------------------------------------------------------

/** (fork) What the first-tap fullscreen did, step by step: read by the ?fsdebug=1 overlay (ui/fsDebug.js), free otherwise. */
export const fsTrace = {
  listeners: new Set(),
  /** the last few steps, so an overlay that loads later still shows what happened at boot */
  lines: [],
  note(line) {
    const at = Math.round(globalThis.performance?.now?.() ?? 0);
    const entry = `${String(at).padStart(6)} ${String(line)}`;
    this.lines.push(entry);
    if (this.lines.length > 40) this.lines.shift();
    for (const fn of this.listeners) { try { fn(entry); } catch { /* the overlay only */ } }
  },
};
const errText = (e) => `${e?.name || 'Error'}: ${String(e?.message || e).slice(0, 120)}`;

export const fullscreen = {
  supported(win = globalThis) { return detectFeatures(win).fullscreen; },
  active(win = globalThis) { const d = win.document; return !!(d && (d.fullscreenElement || d.webkitFullscreenElement)); },
  /** (fork) the last orientation.lock answer: 'ok', an error name, 'unavailable' or null (not tried yet) */
  lastLock: null,
  /** (fork) told each lock answer (installPortraitTap: a refused lock means the phone must be turned by hand) */
  lockListeners: new Set(),
  _entering: null,
  enter(win = globalThis) {
    // (fork) one tap sends pointerup, touchend and click, and two listeners may answer it: one request at a time
    if (this._entering) return this._entering;
    this._entering = this._enter(win).finally(() => { this._entering = null; });
    return this._entering;
  },
  async _enter(win) {
    const el = win.document?.documentElement;
    if (!el) return false;
    try {
      if (typeof el.requestFullscreen === 'function') await el.requestFullscreen({ navigationUI: 'hide' });
      else if (typeof el.webkitRequestFullscreen === 'function') el.webkitRequestFullscreen();
      else { fsTrace.note('requestFullscreen: not available'); return false; }
      fsTrace.note('requestFullscreen: ok');
    } catch (e) { fsTrace.note(`requestFullscreen: ${errText(e)}`); return false; }
    // Android Chrome: a landscape game may lock the orientation while fullscreen (refused elsewhere — ignored)
    const lock = win.screen?.orientation?.lock;
    if (typeof lock !== 'function') { this.lastLock = 'unavailable'; fsTrace.note('orientation.lock: not available'); }
    else {
      try { await win.screen.orientation.lock('landscape'); this.lastLock = 'ok'; fsTrace.note('orientation.lock: ok'); }
      catch (e) { this.lastLock = e?.name || 'Error'; fsTrace.note(`orientation.lock: ${errText(e)}`); }
    }
    for (const fn of this.lockListeners) { try { fn(this.lastLock); } catch { /* a listener only */ } }
    return true;
  },
  async exit(win = globalThis) {
    const d = win.document;
    try {
      if (d?.fullscreenElement && typeof d.exitFullscreen === 'function') await d.exitFullscreen();
      else if (d?.webkitFullscreenElement && typeof d.webkitExitFullscreen === 'function') d.webkitExitFullscreen();
    } catch { return false; }
    try { win.screen?.orientation?.unlock?.(); } catch { /* ignore */ }
    return true;
  },
  toggle(win = globalThis) { return this.active(win) ? this.exit(win) : this.enter(win); },
};

export function useFullscreen() {
  const [on, setOn] = useState(() => fullscreen.active());
  useEffect(() => {
    const d = globalThis.document;
    if (!d) return undefined;
    const upd = () => setOn(fullscreen.active());
    d.addEventListener('fullscreenchange', upd);
    d.addEventListener('webkitfullscreenchange', upd);
    upd();
    return () => { d.removeEventListener('fullscreenchange', upd); d.removeEventListener('webkitfullscreenchange', upd); };
  }, []);
  return on;
}

/** Fullscreen toggle (hidden where the browser has no element fullscreen, e.g. iPhone Safari). It only enters and leaves
 * fullscreen: nothing is remembered (a phone held upright is asked for a tap by the rotate screen: installPortraitTap). */
export function FullscreenButton({ class: cls = '' }) {
  const on = useFullscreen();
  const [ok] = useState(() => fullscreen.supported());
  if (!ok) return null;
  const label = on ? t('退出全屏') : t('全屏');
  return html`<button type="button" class=${`fsbtn tapx ${cls}`} aria-label=${label} title=${label} aria-pressed=${on ? 'true' : 'false'}
      onClick=${() => fullscreen.toggle()}>
    <${Icon} name=${on ? 'collapse' : 'expand'} />
  </button>`;
}

// ---- (fork) a phone goes fullscreen and turns to landscape on its first tap -------------------------------------------
// Browsers allow fullscreen only from a user gesture, so it cannot happen as the page loads: the first tap a touch phone
// makes on the page (the entry film's 点击进入 card, usually) enters it, and in the same gesture Android Chrome locks the
// screen in landscape (fullscreen.enter; the lock works only while fullscreen, and a refusal is ignored). That tap still
// does what it does (it is not stopped, and the film never waits for it). On a touch phone only: a touch screen as the
// primary pointer (`(pointer: coarse)`; a phone that also reports hover, as some Android browsers do, still counts),
// whose shorter screen side is under PHONE_MAX_SIDE CSS px (tablets and desktops keep their window), with element
// fullscreen (iPhone Safari has none: the rotate hint and Add to Home Screen are what it gets), and not already running
// as an installed app (the manifest gives that fullscreen landscape by itself, with no tap at all).
// Once per page: a player who leaves fullscreen in landscape (the back gesture, the ⛶ button) keeps the browser's bars;
// nothing is remembered, and a reload asks again. The game is played in landscape only (owner 2026-11-09: the portrait
// version is useless): whenever such a phone is held upright, the rotate screen asks for a tap that goes fullscreen and
// turns it back (installPortraitTap). ?fsdebug=1 shows every gate and step on screen (ui/fsDebug.js).

/** Shorter screen side (CSS px) below which a touch device counts as a phone. */
export const PHONE_MAX_SIDE = 600;

/** Shorter side of the screen in CSS px (0: unknown). */
export function screenShortSide(win = globalThis) {
  const w = Number(win.screen?.width) || 0, h = Number(win.screen?.height) || 0;
  return w > 0 && h > 0 ? Math.min(w, h) : 0;
}

/**
 * Each condition of the first-tap fullscreen, with its value (pure; tested; the ?fsdebug=1 overlay lists them).
 * @param {ReturnType<typeof detectFeatures>} f
 * @param {{ shortSide: number, active?: boolean }} s
 * @returns {{ name: string, ok: boolean, value: any }[]}
 */
export function autoFullscreenGates(f, { shortSide, active = false }) {
  return [
    { name: 'touch is the primary pointer', ok: !!f.primaryCoarse, value: !!f.primaryCoarse },
    { name: `short screen side < ${PHONE_MAX_SIDE}`, ok: shortSide > 0 && shortSide < PHONE_MAX_SIDE, value: shortSide },
    { name: 'element fullscreen available', ok: !!f.fullscreen, value: !!f.fullscreen },
    { name: 'not an installed app', ok: !f.standalone, value: !!f.standalone },
    { name: 'not fullscreen already', ok: !active, value: !!active },
  ];
}

/** Whether the first tap should enter fullscreen (pure; tested). */
export function autoFullscreenWanted(f, s) { return autoFullscreenGates(f, s).every((g) => g.ok); }

/** The gates on this page now. */
export function autoFullscreenState(win = globalThis) {
  return autoFullscreenGates(detectFeatures(win), { shortSide: screenShortSide(win), active: fullscreen.active(win) });
}

/** (fork) A phone that can turn the page landscape itself: the first-tap conditions, fullscreen already or not (pure). */
export function phoneCanTurn(f, shortSide) {
  return autoFullscreenGates(f, { shortSide }).every((g) => g.ok);
}

/**
 * (fork) The portrait screen (the rotate hint in index.html, css/devices.css) on a phone that can turn the page itself asks
 * for a tap (<html class="sp-tap-rotate">: its 点击切换到横屏 line shows), and that tap enters fullscreen and locks
 * landscape — each time the phone is held upright, not only on the page's first tap. A browser that refuses the lock
 * (fullscreen.lastLock) loses the line: its rotate screen says to turn the phone by hand, as before. Returns a disposer.
 * @param {any} [win]
 * @param {{ enter?: (win: any) => Promise<boolean> }} [deps] (tests)
 */
export function installPortraitTap(win = globalThis, { enter = (w) => fullscreen.enter(w) } = {}) {
  const doc = win.document;
  const root = doc?.documentElement;
  const hint = doc?.querySelector?.('.rotate-hint');
  if (!root?.classList || !hint?.addEventListener) return () => {};
  if (!phoneCanTurn(detectFeatures(win), screenShortSide(win))) return () => {};
  // any refused lock (the first tap's too): this browser cannot turn the page, the screen asks to turn it by hand again
  const onLock = (lock) => {
    if (!lock || lock === 'ok' || !root.classList.contains('sp-tap-rotate')) return;
    root.classList.remove('sp-tap-rotate');
    fsTrace.note(`rotate screen: the lock was refused (${lock}); it asks to turn the phone by hand again`);
  };
  if (fullscreen.lastLock && fullscreen.lastLock !== 'ok') return () => {};
  root.classList.add('sp-tap-rotate');
  fullscreen.lockListeners.add(onLock);
  const onTap = (e) => {
    if (!e?.isTrusted) return;
    fsTrace.note('rotate screen tapped');
    Promise.resolve(enter(win)).catch(() => {});
  };
  hint.addEventListener('click', onTap);
  return () => { hint.removeEventListener('click', onTap); fullscreen.lockListeners.delete(onLock); root.classList.remove('sp-tap-rotate'); };
}

const TAP_EVENTS = ['pointerup', 'touchend', 'click'];

// armed: this page waits for the tap that enters fullscreen; the entry film asks for that tap on screen (ui/entryFilm.js)
const firstTap = { armed: false };

/** (fork) Whether this phone page still waits for its first tap to enter fullscreen (the screen should say "tap"). */
export function firstTapPending() { return firstTap.armed; }

/**
 * Enter fullscreen (and lock landscape) on this page's first tap, on a touch phone. Returns a disposer.
 * Activation: for a touch, `pointerup` / `touchend` carry the user activation (`pointerdown` only for a mouse), so the
 * request is made there — the entry film's gate listens on pointerdown and is not touched; `click` (still inside the
 * gesture's activation) is the fallback for a browser or a page that swallowed those. A tap on the ⛶ button (it toggles
 * by itself) or on a text field (the keyboard opens) waits for the next tap.
 * @param {any} [win]
 * @param {{ enter?: (win: any) => Promise<boolean> }} [deps] (tests)
 */
export function installFirstTapFullscreen(win = globalThis, { enter = (w) => fullscreen.enter(w) } = {}) {
  const doc = win.document;
  if (!doc?.addEventListener) return () => {};
  const failed = () => autoFullscreenState(win).filter((g) => !g.ok).map((g) => g.name);
  const atLoad = failed();
  if (atLoad.length) { fsTrace.note(`not armed: ${atLoad.join('; ')}`); return () => {}; }
  fsTrace.note('armed: waiting for the first tap');
  firstTap.armed = true;
  let busy = false, done = false;
  const off = () => {
    done = true;
    firstTap.armed = false;
    for (const t of TAP_EVENTS) doc.removeEventListener(t, onTap, true);
  };
  const onTap = (e) => {
    if (done || busy) return;
    const act = win.navigator?.userActivation?.isActive;
    fsTrace.note(`${e?.type}${e?.pointerType ? `(${e.pointerType})` : ''} trusted=${!!e?.isTrusted} activation=${act ?? '?'}`);
    if (!e?.isTrusted) return;
    if (e.type === 'pointerup' && e.pointerType === 'mouse') return;
    const el = e.target;
    if (el?.closest?.('.fsbtn, input, textarea, select, [contenteditable="true"]')) { fsTrace.note('skipped: the ⛶ button or a text field'); return; }
    if (el?.closest?.('.rotate-hint')) { off(); return; } // the rotate screen's own tap (installPortraitTap) answers it
    const now = failed();
    if (now.length) { fsTrace.note(`stopped: ${now.join('; ')}`); off(); return; }
    busy = true;
    // one gesture sends pointerup, touchend and click: the first starts the request, the others find it busy or done
    Promise.resolve(enter(win)).then((ok) => { busy = false; if (ok || fullscreen.active(win)) off(); }, () => { busy = false; });
  };
  for (const t of TAP_EVENTS) doc.addEventListener(t, onTap, t === 'touchend' ? { capture: true, passive: true } : true);
  return off;
}

/**
 * Only a browser-issued install offer shows a button; installed and unsupported environments stay quiet.
 * `square`: the glyph alone (the lobby's top bar, beside ⚙ / 📖), the name stays title / aria-label.
 */
export function PwaInstallButton({ class: cls = '', size = 'sm', square = false }) {
  const [available, setAvailable] = useState(pwaInstall.available);
  useEffect(() => pwaInstall.subscribe(setAvailable), []);
  if (!available) return null;
  return html`<${Button} variant="secondary" size=${size} icon="homePlus" square=${square} class=${cls}
    title=${t('添加到桌面')} aria-label=${t('添加到桌面')}
    data-testid="pwa-install" onClick=${() => pwaInstall.request()}>${square ? null : t('添加到桌面')}<//>`;
}

/** The portrait screen's text (public/index.html ships it in English) in the current language. */
export function updateRotateHintI18n(doc = globalThis.document) {
  const set = (id, text) => { const el = doc?.getElementById?.(id); if (el) el.textContent = text; };
  set('rotate-hint-title', t('请将设备横屏')); // en: "Rotate your device to landscape"
  set('rotate-hint-text', t('卫戍协议：盟约 需要横屏显示以获得完整体验')); // en: "Stronghold Protocol: Alliance needs landscape for the full experience"
  set('rotate-hint-pwa', t('添加到桌面'));
  set('rotate-hint-tap', t('点击切换到横屏')); // en: "Tap to switch to landscape"
  set('rotate-hint-ios', t('想要全屏：点 Safari 的“分享”，再选“添加到主屏幕”，从桌面图标打开')); // en: "For full screen: tap Share in Safari, choose Add to Home Screen, and open the game from its icon"
}

// ---- boot-time installation ----------------------------------------------------------------------------------------

let installed = null;

/**
 * Install the device handling on this page (idempotent). Returns a disposer (tests).
 * @param {any} [win]
 */
export function installDeviceSupport(win = globalThis) {
  if (installed) return installed;
  const doc = win.document;
  if (!doc?.documentElement) return () => {};
  const root = doc.documentElement;
  const offs = [];
  const on = (target, ev, fn, opts) => { if (!target?.addEventListener) return; target.addEventListener(ev, fn, opts); offs.push(() => target.removeEventListener(ev, fn, opts)); };

  const apply = () => {
    const cls = featureClasses(detectFeatures(win));
    for (const [k, v] of Object.entries(cls)) root.classList.toggle(k, v);
  };
  apply();
  for (const q of ['(any-pointer: coarse)', '(pointer: coarse)', '(any-hover: hover)', '(prefers-reduced-motion: reduce)', '(display-mode: standalone)']) {
    let m = null;
    try { m = win.matchMedia?.(q); } catch { m = null; }
    if (!m) continue;
    if (typeof m.addEventListener === 'function') on(m, 'change', apply);
    else if (typeof m.addListener === 'function') { m.addListener(apply); offs.push(() => m.removeListener(apply)); }  // Safari < 14
  }

  // visible height (the URL bar of mobile browsers comes and goes): --sp-vh = 1 % of the real visible height
  const setVh = () => {
    const h = win.visualViewport?.height || win.innerHeight || 0;
    if (h > 0) root.style.setProperty('--sp-vh', `${h / 100}px`);
  };
  setVh();
  on(win, 'resize', setVh, { passive: true });
  on(win.visualViewport, 'resize', setVh, { passive: true });

  // rotation: the new viewport size settles a few frames late on iOS → one more resize after it settles
  let rotTimer = 0;
  const onRotate = () => {
    apply();
    clearTimeout(rotTimer);
    rotTimer = setTimeout(() => { apply(); setVh(); try { win.dispatchEvent(new win.Event('resize')); } catch { /* ignore */ } }, 350);
  };
  on(win, 'orientationchange', onRotate);
  on(win.screen?.orientation, 'change', onRotate);

  // no page zoom while playing (iOS Safari ignores user-scalable=no): pinch gestures and ctrl+wheel are cancelled
  const cancel = (e) => { if (e.cancelable) e.preventDefault(); };
  on(doc, 'gesturestart', cancel, { passive: false });
  on(doc, 'gesturechange', cancel, { passive: false });
  on(doc, 'gestureend', cancel, { passive: false });
  on(doc, 'wheel', (e) => { if (e.ctrlKey && e.cancelable) e.preventDefault(); }, { passive: false });
  // (double-tap zoom and two-finger pinch on Chromium / Firefox / iOS 13+: `touch-action` in css/devices.css — no
  // scroll-blocking touchmove listener, so lists keep scrolling smoothly)

  // long-press = detail on DOM controls: Android fires `contextmenu` on a long press by itself, iOS Safari never does.
  // A touch held still for LONG_PRESS_MS without a native contextmenu gets a synthetic one (the shop cards, reward cards
  // and the fallback board open their detail cards on it), and the click the release would cause is swallowed. The field
  // canvas handles its own long-press (render/drag.js) and is skipped.
  const lp = { timer: 0, x: 0, y: 0, target: null, native: false, fired: false, swallowUntil: 0 };
  const lpCancel = () => { clearTimeout(lp.timer); lp.timer = 0; lp.target = null; };
  on(doc, 'pointerdown', (e) => {
    lpCancel();
    lp.fired = false;
    if (e.pointerType !== 'touch' || !(e.target instanceof win.Element)) return;
    if (e.target.closest('canvas, .gm__field, .fwheel, .ewheel__viewport, input, textarea, select, [contenteditable="true"]')) return;
    lp.x = e.clientX; lp.y = e.clientY; lp.target = e.target; lp.native = false;
    lp.timer = setTimeout(() => {
      const t = lp.target;
      lp.timer = 0;
      if (!t || lp.native || !t.isConnected) return;
      // Only a HANDLED long press (a detail card / a tooltip took it: the handler called preventDefault) swallows the
      // release. A slow tap on a control without a long-press meaning (准备就绪, 撤退, 出售 …) stays a tap — iOS Safari
      // still sends its click, and swallowing it made those buttons ignore any tap held ≥ LONG_PRESS_MS.
      try {
        const ev = new win.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: lp.x, clientY: lp.y, button: 2, buttons: 0 });
        lp.fired = t.dispatchEvent(ev) === false || ev.defaultPrevented === true;
      } catch { lp.fired = false; }
    }, LONG_PRESS_MS);
  }, { passive: true, capture: true });
  on(doc, 'pointermove', (e) => { if (lp.timer && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > LONG_PRESS_SLOP) lpCancel(); }, { passive: true, capture: true });
  // the release of a long press (however long it was held) is not a tap: the click that follows it is swallowed
  on(doc, 'pointerup', () => { if (lp.fired) { lp.fired = false; lp.swallowUntil = Date.now() + 700; } lpCancel(); }, { passive: true, capture: true });
  on(doc, 'pointercancel', () => { lp.fired = false; lpCancel(); }, { passive: true, capture: true });
  on(doc, 'contextmenu', (e) => { if (e.isTrusted) lp.native = true; }, { capture: true });
  on(doc, 'click', (e) => {
    if (lp.swallowUntil && Date.now() < lp.swallowUntil) { lp.swallowUntil = 0; e.preventDefault(); e.stopPropagation(); }
  }, { capture: true });

  updateRotateHintI18n(doc);
  const pwaBtn = doc?.getElementById?.('rotate-hint-pwa');
  if (pwaBtn) {
    offs.push(pwaInstall.subscribe((available) => { pwaBtn.hidden = !available; }));
    on(pwaBtn, 'click', () => { pwaInstall.request(); });
  }
  // (fork) iPhone / iPod Safari: no element fullscreen and no install prompt, so the hint says how to get an app window
  const iosLine = doc?.getElementById?.('rotate-hint-ios');
  if (iosLine) {
    const show = () => { const f = detectFeatures(win); iosLine.hidden = !(isIOS(win) && !f.fullscreen && !f.standalone); };
    show();
    on(win, 'resize', show, { passive: true });
  }
  offs.push(installFirstTapFullscreen(win));
  offs.push(installPortraitTap(win));
  // (fork) ?fsdebug=1: why a phone did or did not go fullscreen, on screen (ui/fsDebug.js; loaded only then)
  if (/[?&]fsdebug=1(?:&|$)/.test(String(win.location?.search || ''))) {
    import('./fsDebug.js').then((m) => offs.push(m.installFsDebug(win)), () => {});
  }

  installed = () => { for (const off of offs.splice(0)) { try { off(); } catch { /* ignore */ } } clearTimeout(rotTimer); installed = null; };
  return installed;
}
