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
/**
 * A card's fixed drawing cost in download-size terms (DynIllustHost._cost): page 6's per-card frame times fit
 * 0.402 ms + 0.251 ms per MB of half-tier download, i.e. the fixed part is worth 1.6 MB [src: notes
 * dev50-l2d-perf-report.md §Cost per card].
 */
export const CARD_FIXED_BYTES = 1.6e6;

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
    // keys: what it has loaded (its cache); active: key → _cost of what it draws now; load: their sum
    const rec = { i, w: null, alive: false, keys: new Set(), active: new Map(), load: 0, origin: 0, ok: null };
    rec.ok = new Promise((resolve) => {
      let done = false;
      const end = (alive) => { if (done) return; done = true; rec.alive = alive; if (!alive) { try { rec.w?.terminate(); } catch { /* gone */ } } resolve(alive); };
      try { rec.w = new Worker(url, { name: `dynillust-${i}` }); } catch (err) { console.warn('[dynillust] no Worker', err); end(false); return; }
      const timer = setTimeout(() => { console.warn('[dynillust] Worker boot timed out'); end(false); }, DYN_BOOT_MS);
      rec.w.onmessage = (e) => {
        const m = e.data || {};
        // ok: the Worker's renderer started and drew its test square (m.probe, the pixel read back)
        if (m.t === 'ok') { clearTimeout(timer); rec.origin = m.origin; rec.probe = m.probe || null; end(true); return; }
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
      case 'preloaded': case 'frameLog': case 'diag': case 'net': { const r = this._waits.get(m.rid); this._waits.delete(m.rid); if (r) r(m); break; }
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

  /**
   * An illustration's drawing cost, estimated before it loads, in bytes: its download size at the stage's quality
   * (the manifest's `bytes` / `bytesHalf`) plus CARD_FIXED_BYTES. On Grand Alliance page 6 a card's frame time fit
   * fixed + per-MB (r² 0.73), the fixed part worth about 1.6 MB [src: notes dev50-l2d-perf-report.md §Cost per card].
   */
  _cost(key) {
    if (this.opts.split === 'count') return 1;   // (`split: 'count'`: by count, for checks that compare the two)
    const e = this.entryOf(key);
    const b = e && (this._quality === 'half' ? e.bytesHalf || e.bytes : e.bytes);
    return (b > 0 ? b : 0) + CARD_FIXED_BYTES;
  }

  /**
   * The Worker that draws `key`: the one that has it (its files and GPU textures are there), else the one with the
   * least to draw now. A Worker's load counts only the illustrations it draws or has just preloaded (`active`), not
   * the ones it keeps cached from an earlier page: those made a swap from page 5 to page 6 pile 3 heavy cards on one
   * Worker (61 fps) [src: notes dev50-l2d-perf-report.md §Workers, step 3].
   */
  _route(key) {
    let w = this.byKey.get(key);
    if (!(w && w.alive)) {
      w = null;
      for (const x of this.workers) if (x.alive && (!w || x.load < w.load)) w = x;
      if (!w) return null;
      w.keys.add(key);
      this.byKey.set(key, w);
    }
    if (!w.active.has(key)) { const c = this._cost(key); w.active.set(key, c); w.load += c; }
    return w;
  }

  /** `key` no longer drawn by `w` (no card of it left there): its cost leaves the Worker's load. */
  _idle(w, key) {
    if (!w || !w.active.has(key)) return;
    for (const c of this.cards) if (c.key === key && c.worker === w && c.state !== 'unmounted') return;
    w.load -= w.active.get(key);
    w.active.delete(key);
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
    // the heaviest first: each then goes to the least loaded Worker (a better split than the screen's order)
    const list = [...new Set((keys || []).filter(Boolean))].sort((a, b) => this._cost(b) - this._cost(a));
    for (const k of list) {
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
      for (const k of [...w.keys]) {
        if (hold.has(k)) continue;
        w.keys.delete(k);
        if (w.active.has(k)) { w.load -= w.active.get(k); w.active.delete(k); }
        if (this.byKey.get(k) === w) this.byKey.delete(k);
      }
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
   * [start ms in this page's time, frame ms, live slots, drawn 1 / skipped by maxFps 0], and clears them.
   */
  frames(on) { for (const w of this.workers) w.w.postMessage({ t: 'frames', on: !!on }); }
  async frameLog() {
    const out = await Promise.all(this.workers.map((w) => this._ask(w, { t: 'frameLog' })));
    const base = typeof performance !== 'undefined' ? performance.timeOrigin : 0;
    return out.map((m) => (m.frames || []).map(([t, ms, live, drawn]) => [+(t + (m.origin - base)).toFixed(2), ms, live, drawn]));
  }

  /**
   * (fork) The downloads of every Worker's stage and the fallback's, summed (DynIllustStage.netState): the room's stall
   * check (ui/dynCards.js). A Worker that never answers leaves the promise pending, which the caller treats as no
   * reading (never as a stall).
   */
  async netState() {
    const out = await Promise.all(this.workers.map((w) => this._ask(w, { t: 'net' })));
    if (this.fallback) out.push(this.fallback.netState());
    return out.reduce((s, m) => ({ open: s.open + (m.open || 0), received: s.received + (m.received || 0), moves: s.moves + (m.moves || 0) }), { open: 0, received: 0, moves: 0 });
  }

  /**
   * Debugging: each Worker's cards as its stage sees them (worker.js 'diag'): key, state, the box it was sent, the
   * card's and its canvas's size, its slot (size, place in the stage canvas, framing scale, held / warmed / paused, GPU
   * skinning) and the atlas pages' sizes, plus the context's GL error. For a card that looks wrong while it is live.
   */
  async diag() {
    const out = await Promise.all(this.workers.map((w) => this._ask(w, { t: 'diag' })));
    return out.map((m, i) => ({ worker: i, gl: m.gl, stage: m.stage || null, cards: m.cards || [] }));
  }

  stats() {
    return { workers: this.workers.length, fallback: !!this.fallback, cards: this.cards.size, keys: this.workers.map((w) => w.keys.size), load: this.workers.map((w) => w.load), probe: this.workers.map((w) => w.probe), quality: this._quality };
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
    // the card's framing (DynIllustStage.mount: 'card' | 'home' | { mode, centre, zoom, fx, fy }), passed on as given
    // (plain data: it goes to the Worker in the mount message)
    this.framing = { framing: o.framing && typeof o.framing === 'object' ? { ...o.framing } : (o.framing || 'card'), centre: o.centre };
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
    // routed once the index is in (the illustration's cost: DynIllustHost._cost)
    H.ready.then(() => H.index()).then(() => this._place());
  }

  /** To the main-thread stage (fallback) or to this key's Worker, with the canvas transferred. */
  _place() {
    if (this.state === 'unmounted') { this._ready(false); return; }
    const H = this.H;
    if (H.fallback) {
      this.inner = H.fallback.mount(this.key, { ...this.framing, canvas: this.canvas, onState: (s) => this._set(s) });
      if (this.started) this.inner.start();
      this.inner.ready.then((ok) => this._ready(ok));
      return;
    }
    const w = H._route(this.key);
    if (!w) { this._set('failed'); this._ready(false); return; }
    this.worker = w;
    // the size comes from the observer's first report (layout size, before the next paint; the Worker's card waits for
    // it). Not from getBoundingClientRect: that includes CSS transforms, so a card mounted during its seat's entrance
    // animation was staged at the scaled size (721 × 404 for 720 × 403) and built again unwarmed at its first frame.
    if (!H.ro && this.canvas.isConnected) this._resized(this.canvas.getBoundingClientRect(), false);
    const off = this.canvas.transferControlToOffscreen();
    w.w.postMessage({ t: 'mount', id: this.id, key: this.key, canvas: off, box: this.box, ...this.framing }, [off]);
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

  /** A new framing for this card, without a remount (renderer.js Card.setFraming). */
  setFraming(framing, centre) {
    if (this.state === 'unmounted') return;
    this.framing = { framing: framing && typeof framing === 'object' ? { ...framing } : (framing || 'card'), centre };
    if (this.inner) this.inner.setFraming(this.framing.framing, centre);
    else if (this.worker) this.worker.w.postMessage({ t: 'framing', id: this.id, ...this.framing });
    // (not placed yet: _place sends this.framing with the mount)
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
    else if (this.worker) { this.worker.w.postMessage({ t: 'unmount', id: this.id }); H._idle(this.worker, this.key); }
    this._ready(false);
  }
}
