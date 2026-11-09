// (fork) ?fsdebug=1 — an on-screen readout of the phone's first-tap fullscreen (ui/device.js installFirstTapFullscreen),
// for a player testing on a real phone with no developer tools: each condition and its value, which events the first
// tap sent (and whether they carried the user activation), what requestFullscreen and screen.orientation.lock answered,
// and whether the browser has offered to install the game (the no-tap way to fullscreen landscape). Loaded only with
// the URL parameter; English only (a test tool). It never takes a tap: pointer-events none.

import { autoFullscreenState, fsTrace, detectFeatures, screenShortSide } from './device.js';
import { pwaInstall } from '../pwa.js';

const mq = (win, q) => { try { return !!win.matchMedia?.(q)?.matches; } catch { return false; } };

function displayMode(win) {
  for (const m of ['fullscreen', 'standalone', 'minimal-ui', 'browser']) if (mq(win, `(display-mode: ${m})`)) return m;
  return '?';
}

/** The readout's text (exported for tests). */
export function fsDebugText(win = globalThis) {
  const nav = win.navigator || {};
  const doc = win.document;
  const f = detectFeatures(win);
  const lines = [
    'fsdebug: first-tap fullscreen',
    `UA ${String(nav.userAgent || '?').slice(0, 140)}`,
    `secure context ${!!win.isSecureContext} · display-mode ${displayMode(win)} · installed ${!!f.standalone}`,
    `pointer: coarse ${mq(win, '(pointer: coarse)')} · any-coarse ${mq(win, '(any-pointer: coarse)')} · any-fine ${mq(win, '(any-pointer: fine)')} · any-hover ${mq(win, '(any-hover: hover)')} · touch points ${Number(nav.maxTouchPoints) || 0}`,
    `screen ${win.screen?.width}×${win.screen?.height} (short ${screenShortSide(win)}) · window ${win.innerWidth}×${win.innerHeight} · dpr ${win.devicePixelRatio}`,
    `fullscreenEnabled ${!!(doc?.fullscreenEnabled || doc?.webkitFullscreenEnabled)} · in fullscreen ${!!(doc?.fullscreenElement || doc?.webkitFullscreenElement)} · orientation ${win.screen?.orientation?.type || '?'} · lock() ${typeof win.screen?.orientation?.lock === 'function'}`,
    `install offer (beforeinstallprompt) ${pwaInstall.available() ? 'AVAILABLE' : 'not yet'} · service worker ${nav.serviceWorker?.controller ? 'active' : 'none'}`,
    'conditions:',
    ...autoFullscreenState(win).map((g) => `  ${g.ok ? 'OK ' : 'NO '} ${g.name} (${g.value})`),
    'steps:',
    ...fsTrace.lines.map((l) => `  ${l}`),
  ];
  return lines.join('\n');
}

/** Show the readout; returns a disposer. */
export function installFsDebug(win = globalThis) {
  const doc = win.document;
  if (!doc?.body) return () => {};
  const box = doc.createElement('pre');
  box.id = 'sp-fsdebug';
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;left:4px;top:4px;right:auto;bottom:auto;z-index:2147483647;margin:0;padding:6px 8px;max-width:calc(100vw - 8px);'
    + 'max-height:calc(100vh - 8px);overflow:hidden;white-space:pre-wrap;word-break:break-word;pointer-events:none;'
    + 'font:10px/1.3 ui-monospace,Consolas,monospace;color:#9ff5d6;background:rgba(0,0,0,.82);border:1px solid #2c8f73;';
  doc.body.appendChild(box);
  // the opening film is a modal <dialog> (the top layer, above every z-index): as a popover the readout joins the top
  // layer too, and is shown again whenever a modal dialog opens, so it stays above it
  const popover = typeof box.showPopover === 'function';
  if (popover) box.popover = 'manual';
  let lastModal;
  const raise = () => {
    if (!popover) return;
    let modal;
    try { modal = doc.querySelector('dialog:modal'); } catch { modal = doc.querySelector('dialog[open]'); }
    if (modal === lastModal && lastModal !== undefined && box.matches(':popover-open')) return;
    lastModal = modal;
    try { box.hidePopover(); } catch { /* not open yet */ }
    try { box.showPopover(); } catch { /* not supported */ }
  };
  let queued = false;
  const draw = () => {
    if (queued) return;
    queued = true;
    setTimeout(() => { queued = false; raise(); try { box.textContent = fsDebugText(win); } catch (e) { box.textContent = `fsdebug failed: ${e}`; } }, 0);
  };
  const offs = [];
  const on = (t, ev, fn) => { if (!t?.addEventListener) return; t.addEventListener(ev, fn); offs.push(() => t.removeEventListener(ev, fn)); };
  fsTrace.listeners.add(draw);
  offs.push(() => fsTrace.listeners.delete(draw));
  offs.push(pwaInstall.subscribe((available) => { if (available) fsTrace.note('the browser offers to install the game'); draw(); }));
  // the fullscreen page joins the top layer above the readout too: shown again after each change (raise)
  on(doc, 'fullscreenchange', () => { lastModal = undefined; fsTrace.note(`fullscreenchange: ${doc.fullscreenElement ? 'entered' : 'left'}`); });
  on(doc, 'visibilitychange', () => fsTrace.note(`visibilitychange: ${doc.visibilityState}`));
  on(win, 'resize', draw);
  on(win.screen?.orientation, 'change', draw);
  const timer = setInterval(draw, 1000); // the service worker and activation come and go without events
  draw();
  return () => { clearInterval(timer); for (const off of offs.splice(0)) off(); box.remove(); };
}
