// public/js/resources/index.js — the page side of the optional asset preload (Settings ▸ Preload assets): the preference,
// the Service Worker, the download run and the state the panel shows (ui/preload.js). Rules: shared/resources.js.
//
// Preference `sp.pref.preload` = { started, paused, voice }. Lifecycle (owner's decision, 2026-10-09): the player starts
// the download, may pause and resume it, and every file saved so far is used at once; a finished set stays and is used
// until the player clears it (Clear Cache deletes the files and unregisters the worker). There is no "off" in between.
// `started` keeps the worker registered; unless `paused`, every page load resumes the download, which after a deploy
// fetches the changed files only. `voice` is the ticked voice packs, or null to follow the voice language settings (the
// default language plus every per-operator pick, ui/voiceLang.js) until the player edits the list.
// Visuals and music are always part of it. One tab downloads at a time (Web Locks); during a match one lane runs instead
// of four, so the match's own requests keep the bandwidth.

import { createStore, loadPref, savePref, store, selectRoute } from '../store.js';
import { voiceLangStore } from '../ui/voiceLang.js';
import { effectiveVoiceLang } from '../audio.js';
import { data } from '../data.js';
import { ALL_PACKS, BASE_PACKS, MANIFEST_URL, SUMMARY_URL, VOICE_PACKS, parseManifest } from '../../../shared/resources.js';
import { PreloadStore, isQuotaError } from './store.js';

export const SW_URL = '/resource-sw.js';
export const DOWNLOAD_LOCK = 'sp-resources-preload';

/** @param {any} v */
export function sanitizePreloadPref(v) {
  const voice = Array.isArray(v?.voice) ? VOICE_PACKS.filter((p) => v.voice.includes(p)) : null;
  return { started: v?.started === true, paused: v?.paused === true, voice };
}

/**
 * The voice packs the voice language settings use: the default language (settings 语音语言), every per-operator pick
 * and, with the manifest's `audio`, the dub each voiced operator really speaks — an operator without the default's dub
 * falls back to EN, then JP (audio.js effectiveVoiceLang), so an EN default also needs the JP pack (`audio.voiceJp`).
 * @param {{ default?: string, byChar?: Record<string, string> } | null | undefined} pref
 * @param {any} [a] data/assets.json `audio`
 */
export function voicePacksOf(pref, a = null) {
  const used = new Set([pref?.default, ...Object.values(pref?.byChar || {})]);
  for (const charId of Object.keys(a?.voice || {})) used.add(effectiveVoiceLang(a, charId, pref));
  return VOICE_PACKS.filter((p) => used.has(p));
}

export const preloadPref = createStore(sanitizePreloadPref(loadPref('preload', null)));
preloadPref.subscribe((s) => savePref('preload', sanitizePreloadPref(s)));

/** The ticked voice packs right now. */
export const tickedVoicePacks = () => preloadPref.get().voice ?? voicePacksOf(voiceLangStore.get(), data.get('assets')?.audio);

/**
 * What the panel renders. phase: idle | checking | download | foreign (another tab downloads) | ready | paused | error.
 * message: a msgid key of ui/preload.js MESSAGES (plus `detail` for its {0}); packs: per-pack counters of the store.
 */
export const preloadState = createStore({
  phase: 'idle', message: '', detail: '', packs: null, savedBytes: 0, failed: 0, version: '',
  storage: null, persisted: null, unsupported: '', worker: '',
});

/** Why this browser cannot preload ('' = it can): a message key. */
export function unsupportedReason(g = globalThis) {
  if (!g.isSecureContext) return 'needsHttps';
  if (!g.caches || !g.navigator?.serviceWorker || !g.crypto?.subtle) return 'noSupport';
  return '';
}

let contextPromise = null;
let controller = null;
let running = null;

/** The manifest and its store (once per page; a failure is retried next time). */
function context() {
  contextPromise ??= (async () => {
    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new PreloadStore(parseManifest(await res.json()));
  })().catch((err) => { contextPromise = null; throw err; });
  return contextPromise;
}

/** Bytes the current selection still needs, from a status. */
export function missingBytes(packs, voice) {
  if (!packs) return 0;
  return [...BASE_PACKS, ...voice].reduce((n, p) => n + Math.max(0, (packs[p]?.bytes || 0) - (packs[p]?.doneBytes || 0)), 0);
}

/** navigator.storage.estimate() → { quota, usage, free } or null. */
async function estimate() {
  try {
    const e = await globalThis.navigator?.storage?.estimate?.();
    if (!e || !Number.isFinite(e.quota)) return null;
    const usage = Number.isFinite(e.usage) ? e.usage : 0;
    return { quota: e.quota, usage, free: Math.max(0, e.quota - usage) };
  } catch { return null; }
}

function notifyWorker() {
  try {
    const sw = globalThis.navigator?.serviceWorker;
    sw?.controller?.postMessage('sp-resources-changed');
    sw?.getRegistration?.('/').then((reg) => reg?.active?.postMessage('sp-resources-changed')).catch(() => {});
  } catch { /* the worker is optional */ }
}

async function ensureWorker() {
  try {
    await globalThis.navigator.serviceWorker.register(SW_URL, { scope: '/', updateViaCache: 'none' });
    preloadState.set({ worker: '' });
  } catch (err) {
    console.warn('[preload] service worker not registered', err);
    preloadState.set({ worker: String(err?.message || err) });
  }
}

async function dropWorker() {
  try {
    for (const reg of await globalThis.navigator.serviceWorker.getRegistrations()) {
      const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || '';
      if (url.endsWith(SW_URL)) await reg.unregister();
    }
  } catch { /* the worker is optional */ }
}

/**
 * The title screen's look before any download: the per-pack totals (a 1 KB summary instead of the ~300 KB file list)
 * with nothing saved. A preload that was started reads the real counters instead (inspectPreload).
 */
export async function inspectPreloadLight() {
  if (unsupportedReason()) { preloadState.set({ unsupported: unsupportedReason() }); return; }
  if (preloadPref.get().started || preloadState.get().packs) { await inspectPreload(); return; }
  try {
    const res = await fetch(SUMMARY_URL, { cache: 'no-cache' });
    if (!res.ok) return;
    const doc = await res.json();
    if (preloadState.get().packs) return;
    const packs = Object.fromEntries(ALL_PACKS.map((p) => {
      const v = doc?.packs?.[p];
      return [p, { files: Number(v?.files) || 0, bytes: Number(v?.bytes) || 0, doneFiles: 0, doneBytes: 0 }];
    }));
    preloadState.set({ packs, savedBytes: 0, storage: await estimate() });
  } catch { /* the card shows no sizes */ }
}

/** Refresh the counters and the storage estimate (opening the panel, after a change). */
export async function inspectPreload() {
  const unsupported = unsupportedReason();
  if (unsupported) { preloadState.set({ unsupported, phase: 'error', message: unsupported }); return; }
  try {
    const st = await (await context()).status();
    const busy = ['download', 'checking', 'foreign'].includes(preloadState.get().phase);
    preloadState.set({ packs: st.packs, savedBytes: st.savedBytes, version: st.version, storage: await estimate(),
      ...(busy ? {} : { phase: 'idle', message: '' }) });
  } catch (err) {
    preloadState.set({ phase: 'error', message: 'manifestFailed', detail: String(err?.message || err) });
  }
}

/** Start or resume the download. `force` skips the "does it fit" check. */
export function startPreload({ force = false } = {}) {
  if (running) return running;
  preloadPref.set({ ...preloadPref.get(), started: true, paused: false });
  controller = new AbortController();
  running = run(controller.signal, force).finally(() => { running = null; controller = null; });
  return running;
}

/** Pause the download: what is saved stays in use; a page load does not resume it until the player does. */
export function pausePreload() {
  preloadPref.set({ ...preloadPref.get(), paused: true });
  controller?.abort();
}

/** Delete every saved file and unregister the worker: assets load from the network again until the next download. */
export async function clearPreload() {
  controller?.abort();
  await running?.catch(() => {});
  preloadPref.set({ ...preloadPref.get(), started: false, paused: false });
  await dropWorker();
  try { await (await context()).clear(); } catch { await globalThis.caches?.delete?.('sp-resources-v1'); }
  await inspectPreload();
  preloadState.set({ message: 'cleared' });
}

/** Keep the worker's capture list in step with the checklist (only once a download was started). */
function syncCapturePacks() {
  if (!preloadPref.get().started) return;
  context().then((st) => st.setCapturePacks([...BASE_PACKS, ...tickedVoicePacks()])).catch(() => {});
}
preloadPref.subscribe(syncCapturePacks);
voiceLangStore.subscribe(syncCapturePacks);

/** Tick or untick a voice pack (the list stops following the voice settings from here on). */
export function setVoicePack(pack, on) {
  if (!VOICE_PACKS.includes(pack)) return;
  const cur = new Set(tickedVoicePacks());
  if (on) cur.add(pack); else cur.delete(pack);
  preloadPref.set({ ...preloadPref.get(), voice: VOICE_PACKS.filter((p) => cur.has(p)) });
}

/** Go back to the voice settings' packs. */
export function followVoiceSettings() {
  preloadPref.set({ ...preloadPref.get(), voice: null });
}

/** Delete the saved files of unticked voice packs. */
export async function removeVoicePacks(packs) {
  if (running) return;
  const st = await context();
  await st.removePacks(packs.filter((p) => VOICE_PACKS.includes(p)));
  notifyWorker();
  await inspectPreload();
}

async function withLock(job) {
  const locks = globalThis.navigator?.locks;
  if (!locks?.request) return job();
  return locks.request(DOWNLOAD_LOCK, { ifAvailable: true }, (lock) => (lock ? job() : { busy: true }));
}

function recheckOnVisible() {
  const doc = globalThis.document;
  if (!doc?.addEventListener) return;
  const again = () => {
    if (doc.visibilityState !== 'visible') return;
    doc.removeEventListener('visibilitychange', again);
    const p = preloadPref.get();
    if (p.started && !p.paused) void startPreload({ force: true });
  };
  doc.addEventListener('visibilitychange', again);
}

async function run(signal, force) {
  const unsupported = unsupportedReason();
  if (unsupported) { preloadState.set({ unsupported, phase: 'error', message: unsupported }); return; }
  preloadState.set({ phase: 'checking', message: 'checking', failed: 0 });
  let st;
  try { st = await context(); } catch (err) {
    preloadState.set({ phase: 'error', message: 'manifestFailed', detail: String(err?.message || err) });
    return;
  }
  await ensureWorker();
  const voice = tickedVoicePacks();
  const packs = [...BASE_PACKS, ...voice];
  // the worker saves what the game fetches meanwhile, for these packs only
  await st.setCapturePacks(packs).catch(() => {});
  const before = await st.status();
  // persist(): Chrome / Firefox then keep the files when the disk runs low (Safari decides by itself)
  const persisted = await Promise.resolve(globalThis.navigator.storage?.persist?.()).then((v) => v ?? null, () => null);
  const storage = await estimate();
  preloadState.set({ packs: before.packs, savedBytes: before.savedBytes, version: before.version, storage, persisted });
  const need = missingBytes(before.packs, voice);
  if (!force && storage && need > storage.free) {
    preloadState.set({ phase: 'error', message: 'noRoom' });
    return;
  }
  if (signal.aborted) { preloadState.set({ phase: 'paused', message: 'paused' }); return; }
  preloadState.set({ phase: 'download', message: '' });
  try {
    const outcome = await withLock(() => st.download({
      packs, signal,
      laneLimit: () => (selectRoute(store.get()) === 'game' ? 1 : 4),
      onFlush: notifyWorker,
      onProgress: (p) => preloadState.set({ packs: p.packs, savedBytes: p.savedBytes, failed: p.failed }),
    }));
    if (outcome?.busy) {
      preloadState.set({ phase: 'foreign', message: 'otherTab' });
      recheckOnVisible();
      return;
    }
    notifyWorker();
    preloadState.set({ phase: 'ready', message: outcome.failed ? 'someFailed' : 'done', storage: await estimate() });
  } catch (err) {
    notifyWorker();
    const now = await st.status().catch(() => null);
    const counters = now ? { packs: now.packs, savedBytes: now.savedBytes } : {};
    if (err?.name === 'AbortError') preloadState.set({ ...counters, phase: 'paused', message: 'paused' });
    else if (isQuotaError(err)) preloadState.set({ ...counters, phase: 'error', message: 'quota', storage: await estimate() });
    else preloadState.set({ ...counters, phase: 'error', message: 'failed', detail: String(err?.message || err) });
  }
}

/** Boot (main.js): a started preload keeps its worker and, unless paused, resumes; a stray worker of a cleared one goes. */
export function installPreload() {
  if (unsupportedReason()) return;
  const p = preloadPref.get();
  if (p.started) {
    void ensureWorker();
    // after the first screen: the boot's own requests go first
    if (!p.paused) setTimeout(() => { void startPreload({ force: true }); }, 4000);
  } else {
    void dropWorker();
  }
}
