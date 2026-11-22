// render/dynillust/host.js — the page side of the animated illustrations' Workers (render/dynillust/worker.js;
// docs/design/vfx-format.md §33.19 Mount API, "Workers"). The same API as the main-thread stage (renderer.js
// DynIllustStage: quality, index, preload, mount → card { canvas, ready, start, state, unmount }, release, destroy), so
// the screens do not change; underneath, each illustration is drawn by one of DYN_WORKERS Workers.
//
//   - A card's canvas is a page element whose drawing the Worker owns (transferControlToOffscreen): the Worker draws
//     straight into it, so no card frame, staging piece or warm-up runs on the page's main thread.
//   - All cards of one illustration go to the same Worker (its download, parse and GPU textures exist once); a new
//     illustration goes to the Worker with the fewest.
//   - The page keeps what only it can see: each card's size (ResizeObserver, device px capped at MAX_DPR, as the stage
//     measures), whether it is in view (IntersectionObserver), whether the page is hidden, and the card's opacity.
//   - Fallback: no Worker / OffscreenCanvas / transferControlToOffscreen (workersSupported), or no Worker that boots
//     (no WebGL2 in a Worker, a script error, DYN_BOOT_MS without an answer): the main-thread stage, the same code.
//     A Worker that fails later fails its cards ('failed': the screen keeps their 2D art).

import { DynIllustStage, MAX_DPR } from './renderer.js';

/**
 * Workers drawing the illustrations (ours, not an official value). Cold Grand Alliance page 6, 8 cards, 1440p and 4K:
 * 3 Workers kept every card frame under 33 ms in all 4 loads, 2 and 4 had one over each; at most one fewer than the
 * machine's threads [src: notes dev50-l2d-perf-report.md §Workers, step 2].
 */
export const DYN_WORKERS = 3;

/** The Workers this machine gets: DYN_WORKERS, at most one fewer than its threads, at least 1. */
export function workerCount() {
  const hc = Number(globalThis.navigator?.hardwareConcurrency) || 0;
  return hc > 1 ? Math.max(1, Math.min(DYN_WORKERS, hc - 1)) : DYN_WORKERS;
}
/** A Worker that has not booted after this long counts as failed, ms. */
export const DYN_BOOT_MS = 15000;

/** Whether this browser can draw the cards in Workers. */
export function workersSupported() {
  return typeof Worker === 'function' && typeof OffscreenCanvas === 'function' && typeof HTMLCanvasElement === 'function'
    && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function';
}

/** The stage options a Worker can take (functions stay on the page). */
function plainOpts(opts) {
  const out = {};
  for (const [k, v] of Object.entries(opts || {})) if (v === null || ['boolean', 'number', 'string'].includes(typeof v)) out[k] = v;
  return out;
}

export class DynIllustHost {
  /**
   * @param {{ manifest?: () => Promise<any>, workers?: number, workerUrl?: string | URL, onAction?: (key: string, a: number) => void, [k: string]: any }} [opts]
   * Plain options (gpuSkin, pruneTimelines, slicePrewarm, fxSeed, effects…) go to each Worker's stage.
   */
  constructor(opts = {}) {
    this.opts = opts;
    this._quality = 'full';
    this.destroyed = false;
    this._group = null;
    this._index = null;
    this.cards = new Set();
    this.fallback = null;
    this.workers = [];
    this.byKey = new Map();     // key → worker record
    this.byId = new Map();      // card id → HostCard
    this._id = 0;
    this._rid = 0;
    this._waits = new Map();    // rid → resolve
    const n = Number.isInteger(opts.workers) ? opts.workers : workerCount();
    const url = opts.workerUrl || new URL('./worker.js', import.meta.url);
    if (n > 0 && workersSupported()) for (let i = 0; i < n; i++) this.workers.push(this._spawn(url, i));
    this.ready = Promise.all(this.workers.map((w) => w.ok)).then(() => {
      this.workers = this.workers.filter((w) => w.alive);
      if (!this.workers.length) this._toMain();
    });
    if (typeof ResizeObserver === 'function') {
      this.ro = new ResizeObserver((list) => { for (const e of list) e.target.__hostCard?._resized(e.contentRect); });
    }
    if (typeof IntersectionObserver === 'function') {
      this.io = new IntersectionObserver((list) => { for (const e of list) e.target.__hostCard?._view(e.isIntersecting); });
    }
    this._onVis = () => { for (const w of this.workers) w.w.postMessage({ t: 'hidden', v: document.hidden }); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVis);
  }

  _spawn(url, i) {
    const rec = { i, w: null, alive: false, keys: new Set(), origin: 0, ok: null };
    rec.ok = new Promise((resolve) => {
      let done = false;
      const end = (alive) => { if (done) return; done = true; rec.alive = alive; if (!alive) { try { rec.w?.terminate(); } catch { /* gone */ } } resolve(alive); };
      try { rec.w = new Worker(url, { name: `dynillust-${i}` }); } catch (err) { console.warn('[dynillust] no Worker', err); end(false); return; }
      const timer = setTimeout(() => { console.warn('[dynillust] Worker boot timed out'); end(false); }, DYN_BOOT_MS);
      rec.w.onmessage = (e) => {
        const m = e.data || {};
        if (m.t === 'ok') { clearTimeout(timer); rec.origin = m.origin; end(true); return; }
        if (m.t === 'fail') { clearTimeout(timer); console.warn('[dynillust] Worker could not start:', m.message); end(false); return; }
        this._message(rec, m);
      };
      rec.w.onerror = (e) => {
        clearTimeout(timer);
        if (!done) { console.warn('[dynillust] Worker error', e.message); end(false); return; }
        this._died(rec, e.message);
      };
      rec.w.postMessage({ t: 'opts', opts: plainOpts(this.opts) });
      if (typeof document !== 'undefined' && document.hidden) rec.w.postMessage({ t: 'hidden', v: true });
    });
    return rec;
  }

  _message(rec, m) {
    switch (m.t) {
      case 'state': this.byId.get(m.id)?._set(m.s); break;
      case 'ready': this.byId.get(m.id)?._ready(m.ok); break;
      case 'opacity': { const c = this.byId.get(m.id); if (c) c.canvas.style.opacity = String(m.a); break; }
      case 'action': if (this.opts.onAction) { try { this.opts.onAction(m.key, m.a); } catch { /* the caller's */ } } break;
      case 'preloaded': case 'frameLog': { const r = this._waits.get(m.rid); this._waits.delete(m.rid); if (r) r(m); break; }
      case 'error': console.warn('[dynillust] Worker:', m.message); break;
      default: break;
    }
  }

  /** A Worker that failed after it booted: its cards fail (the screen keeps their 2D art); new keys go elsewhere. */
  _died(rec, why) {
    console.warn('[dynillust] Worker stopped:', why);
    rec.alive = false;
    try { rec.w.terminate(); } catch { /* gone */ }
    this.workers = this.workers.filter((w) => w !== rec);
    for (const [k, w] of this.byKey) if (w === rec) this.byKey.delete(k);
    for (const c of this.cards) if (c.worker === rec) { c._set('failed'); c._ready(false); }
    if (!this.workers.length) this._toMain();
  }

  /** The main-thread stage, for browsers without Workers that can draw (and as the last resort). */
  _toMain() {
    if (this.fallback) return;
    this.fallback = new DynIllustStage(this.opts);
    this.fallback.quality = this._quality;
    this.fallback.index();
  }

  get quality() { return this._quality; }
  set quality(q) {
    this._quality = q;
    for (const w of this.workers) w.w.postMessage({ t: 'quality', q });
    if (this.fallback) this.fallback.quality = q;
  }

  /** The `dynillust` group of data/local-assets.json (as DynIllustStage.index); the Workers get it too. */
  index() {
    if (!this._index) {
      const m = this.opts.manifest ? this.opts.manifest() : Promise.resolve(null);
      this._index = Promise.resolve(m).catch(() => null).then((man) => {
        const g = man && man.groups && man.groups.dynillust;
        this._group = g && typeof g === 'object' ? g : {};
        return this._group;
      });
      this._index.then((g) => this.ready.then(() => { for (const w of this.workers) w.w.postMessage({ t: 'manifest', data: { groups: { dynillust: g } } }); }));
    }
    return this._index;
  }

  entryOf(key) { return this._group ? this._group[key] : undefined; }

  /** The Worker that draws `key`: its own, else the one with the fewest illustrations. */
  _route(key) {
    let w = this.byKey.get(key);
    if (w && w.alive) return w;
    w = null;
    for (const x of this.workers) if (x.alive && (!w || x.keys.size < w.keys.size)) w = x;
    if (w) { w.keys.add(key); this.byKey.set(key, w); }
    return w;
  }

  _ask(w, msg) {
    const rid = ++this._rid;
    return new Promise((resolve) => { this._waits.set(rid, resolve); w.w.postMessage({ ...msg, rid }); });
  }

  /** D10: every key ready (or failed) before its cards show. */
  async preload(keys) {
    await this.ready;
    await this.index();
    if (this.fallback) return this.fallback.preload(keys);
    const per = new Map();
    for (const k of new Set((keys || []).filter(Boolean))) {
      const w = this._route(k);
      if (!w) continue;
      if (!per.has(w)) per.set(w, []);
      per.get(w).push(k);
    }
    await Promise.all([...per].map(([w, ks]) => this._ask(w, { t: 'preload', keys: ks })));
  }

  /** Free every key not in `keep` and not on a mounted card (as DynIllustStage.release). */
  release(keep = []) {
    const hold = new Set(keep);
    for (const c of this.cards) hold.add(c.key);
    for (const w of this.workers) {
      w.w.postMessage({ t: 'release', keep: [...hold] });
      for (const k of [...w.keys]) if (!hold.has(k)) { w.keys.delete(k); if (this.byKey.get(k) === w) this.byKey.delete(k); }
    }
    if (this.fallback) this.fallback.release(keep);
  }

  mount(key, o = {}) {
    const card = new HostCard(this, key, o);
    this.cards.add(card);
    return card;
  }

  /** Review pages: every card plays its special idle ('special') or Start now. */
  act(what) {
    for (const w of this.workers) w.w.postMessage({ t: 'act', what });
    if (this.fallback) {
      for (const c of this.fallback.cards) { const s = c.slot; if (s?.card && s.inst) { if (what === 'special') s.card.playSpecial(s.inst); else s.card.playStart(s.inst); } }
      this.fallback._kick();
    }
    return this.cards.size;
  }

  /**
   * Measuring: `frames(true)` starts each Worker's log of its stage frames; `frameLog()` returns them, per Worker, as
   * [start ms in this page's time, frame ms, live slots], and clears them.
   */
  frames(on) { for (const w of this.workers) w.w.postMessage({ t: 'frames', on: !!on }); }
  async frameLog() {
    const out = await Promise.all(this.workers.map((w) => this._ask(w, { t: 'frameLog' })));
    const base = typeof performance !== 'undefined' ? performance.timeOrigin : 0;
    return out.map((m) => (m.frames || []).map(([t, ms, live]) => [+(t + (m.origin - base)).toFixed(2), ms, live]));
  }

  stats() {
    return { workers: this.workers.length, fallback: !!this.fallback, cards: this.cards.size, keys: this.workers.map((w) => w.keys.size), quality: this._quality };
  }

  destroy() {
    this.destroyed = true;
    for (const c of [...this.cards]) c.unmount();
    for (const w of this.workers) { try { w.w.terminate(); } catch { /* gone */ } }
    this.workers = [];
    this.ro?.disconnect();
    this.io?.disconnect();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVis);
    this.fallback?.destroy();
  }
}

/** A card on the page whose illustration a Worker draws (or the main-thread stage, as a fallback). */
class HostCard {
  constructor(H, key, o) {
    this.H = H;
    this.key = key;
    this.id = ++H._id;
    this.onState = typeof o.onState === 'function' ? o.onState : null;
    this.state = 'loading';
    this.started = false;
    this.worker = null;
    this.inner = null;
    this.box = null;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'dynillust-canvas';
    this.canvas.width = 1; this.canvas.height = 1;
    this.canvas.style.opacity = '0';
    this.canvas.__hostCard = this;
    let resolve;
    this.ready = new Promise((r) => { resolve = r; });
    this._resolve = resolve;
    H.byId.set(this.id, this);
    H.ready.then(() => this._place());
  }

  /** To the main-thread stage (fallback) or to this key's Worker, with the canvas transferred. */
  _place() {
    if (this.state === 'unmounted') { this._ready(false); return; }
    const H = this.H;
    if (H.fallback) {
      this.inner = H.fallback.mount(this.key, { canvas: this.canvas, onState: (s) => this._set(s) });
      if (this.started) this.inner.start();
      this.inner.ready.then((ok) => this._ready(ok));
      return;
    }
    const w = H._route(this.key);
    if (!w) { this._set('failed'); this._ready(false); return; }
    this.worker = w;
    // the size now, if the screen placed the canvas already (the observer's first report follows)
    if (this.canvas.isConnected) this._resized(this.canvas.getBoundingClientRect(), false);
    const off = this.canvas.transferControlToOffscreen();
    w.w.postMessage({ t: 'mount', id: this.id, key: this.key, canvas: off, box: this.box }, [off]);
    if (this.started) w.w.postMessage({ t: 'start', id: this.id });
    H.ro?.observe(this.canvas);
    H.io?.observe(this.canvas);
  }

  /** The canvas's CSS box → device px capped at MAX_DPR (the stage's own measure, Card._measure). */
  _resized(r, send = true) {
    const dpr = Math.min(MAX_DPR, Math.max(1, globalThis.devicePixelRatio || 1));
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.box && this.box[0] === w && this.box[1] === h) return;
    this.box = [w, h];
    if (send && this.worker) this.worker.w.postMessage({ t: 'box', id: this.id, w, h });
  }

  _view(v) { if (this.worker) this.worker.w.postMessage({ t: 'view', id: this.id, v }); }

  _set(st) {
    if (this.state === st || this.state === 'unmounted') return;
    this.state = st;
    if (this.onState) { try { this.onState(st); } catch (err) { console.error('[dynillust] onState', err); } }
  }

  _ready(ok) { if (this._resolve) { this._resolve(!!ok); this._resolve = null; } }

  /** Show the illustration (as Card.start: a ready card is live at once; a loading one fades in once ready). */
  start() {
    if (this.started || this.state === 'unmounted' || this.state === 'failed') return;
    this.started = true;
    if (this.inner) { this.inner.start(); return; }
    if (this.state === 'ready') { this.canvas.style.opacity = '1'; this._set('live'); }
    if (this.worker) this.worker.w.postMessage({ t: 'start', id: this.id });
  }

  unmount() {
    if (this.state === 'unmounted') return;
    this._set('unmounted');
    this.state = 'unmounted';
    const H = this.H;
    H.cards.delete(this);
    H.byId.delete(this.id);
    H.ro?.unobserve(this.canvas);
    H.io?.unobserve(this.canvas);
    if (this.inner) this.inner.unmount();
    else if (this.worker) this.worker.w.postMessage({ t: 'unmount', id: this.id });
    this._ready(false);
  }
}
