// render/dynillust/renderer.js — the one renderer that draws every live dynamic illustration of a page (result, room,
// Grand Alliance cards), as the official DynIllustMgr does with its render slots [src: official dump.cs DynIllustMgr
// m_singleSlot, m_multiSlots; doc l2d-art-proposal §4.3].
//
//   const r = getDynIllustRenderer({ load })        one per page (a second call returns it)
//   const h = r.mount(hostEl, { illustId })          a card: h.ready (Promise), h.state, h.destroy(); the card's own
//                                                    <canvas> goes into hostEl once the illustration is drawable
//   r.stats()
//
// How it draws: one WebGL2 context on an off-page canvas. Each frame every visible illustration ("slot") is updated,
// placed in its own rectangle of that canvas (scissored), drawn — its Spine parts and its effect layer interleaved in
// Unity's sort order (sorting layer, order, render queue, depth), the parts being SkeletonPartsRenderers — and then
// copied into each card's own 2D <canvas> (the official card shows its slot's render texture through a RawImage the
// same way). So a card's DOM stacking, transforms, opacity and scrolling stay the page's, and the page has a single GL
// context however many cards it shows.
//   The same illustration at the same size on two cards is one slot, drawn once and copied to both (the official
//   single-slot broadcast [src: official dump.cs AdaptiveDynIllustUpdater _UpdateDynIllustsSingleSlotBroadcast]).
//   A card that leaves the viewport, or a hidden page, pauses its slot: the instance is disabled and the card's state
//   deactivated, its rectangle freed; back in view it is enabled and activated again — the official release of a slot
//   for an unseen view [src: official dump.cs DynIllustActiveSlotPolicy ReconcileSlotHolders]. Unmounting frees it.
//   Appearing: the card's alpha is 1 at once, no fade, and the instance loops Idle (O1, render/dynillust/state.js).
//
// Load contract: `load(illustId)` resolves to an entry (the WP0 index, render/dynillust contract):
//   { skel (URL of the .skel; pixi-spine finds the .atlas and pages beside it),
//     framing: { cameraSize, adjust, maxSize }, root: { pos: [x, y, z], scale?: [sx, sy, sz] },
//     skeleton: { scale, skin, defaultMix, mixes, separators, parts, renderer },
//     instance: { fixFxDelay, animTimeFixed, extraTracks, particles },
//     effects?: { key, followers, animators } }

import { unityToCard, cardViewProj } from './framing.js';
import { IllustSkeleton } from './skeleton.js';
import { DynIllustInstance } from './instance.js';
import { CardIllustState } from './state.js';
import { IllustEffects, illustBasis } from './effects.js';
import { FxGL } from '../vfx/gl.js';
import { FrameData } from '../vfx/geom.js';
import { resetPixi } from '../vfx/system.js';

/** Largest side of the shared canvas (px): 8 phone-size cards fit with room to spare. */
export const MAX_CANVAS = 4096;
/** Device pixel ratio cap for the cards' canvases (a 3× phone draws at 2×, as the official mobile tiers draw smaller
 * render textures than PC [src: official dump.cs DynIllustMgr.RTSizeConfig l2Mobile / l4Standalone]). */
export const MAX_DPR = 2;
/** Effect step cap per frame in s: the effect layer's own cap (render/vfx/system.js OfficialFx.update). */
export const FX_STEP_MAX = 0.25;

function byUnityOrder(a, b) {
  return (a.layer - b.layer) || (a.order - b.order) || (a.queue - b.queue) || (b.dist - a.dist) || (a.seq - b.seq);
}

let shared = null;

/** The page's renderer (created on first use). */
export function getDynIllustRenderer(opts = {}) {
  if (!shared || shared.destroyed) shared = new DynIllustRenderer(opts);
  return shared;
}

export class DynIllustRenderer {
  /**
   * @param {{ load: (id: string) => Promise<any>, fxLib?: any, lite?: boolean, rng?: () => number,
   *           now?: () => number, raf?: (cb: FrameRequestCallback) => number, onAction?: (id: string, a: number) => void }} opts
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.load = opts.load;
    this.fxLib = opts.fxLib || null;
    this.lite = !!opts.lite;
    this.views = new Set();
    this.slots = new Map();     // key → Slot
    this.cache = new Map();     // illustId → Promise<{ entry, spineData, fxDef }>
    this.destroyed = false;
    this.frameNo = 0;
    this.pass = 0;
    this.last = 0;
    this._raf = 0;
    this.P = globalThis.PIXI;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 2; this.canvas.height = 2;
    this.renderer = null;       // created with the first slot that draws
    this.stage = null;
    this.glr = null;
    this.fd = new FrameData();
    this._onVis = () => { if (!document.hidden) this._kick(); };
    document.addEventListener('visibilitychange', this._onVis);
    this.io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((list) => { for (const e of list) { const v = e.target.__dynView; if (v) v.inView = e.isIntersecting; } this._kick(); })
      : null;
  }

  _ensureGL() {
    if (this.renderer) return true;
    const P = this.P;
    try {
      this.renderer = new P.Renderer({
        view: this.canvas, width: 2, height: 2, resolution: 1, backgroundAlpha: 0, antialias: true,
        premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance',
      });
    } catch (err) { console.warn('[dynillust] no WebGL', err); return false; }
    this.stage = new P.Container();
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.glr = null; this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this._kick(); });
    return true;
  }

  /** Fetch, parse and compile one illustration (shared by every card that shows it). */
  prepare(illustId) {
    let p = this.cache.get(illustId);
    if (p) return p;
    p = (async () => {
      const entry = await this.load(illustId);
      if (!entry || !entry.skel) throw new Error('no illustration ' + illustId);
      const res = await this.P.Assets.load(entry.skel);
      const spineData = res && (res.spineData || res);
      let fxDef = null;
      if (entry.effects && entry.effects.key && this.fxLib) {
        try { await this.fxLib.init?.(); fxDef = await this.fxLib.load(String(entry.effects.key).toLowerCase()); } catch { fxDef = null; }
      }
      return { entry, spineData, fxDef };
    })();
    this.cache.set(illustId, p);
    p.catch(() => this.cache.delete(illustId));
    return p;
  }

  /** Show `illustId` on the card `host` (its CSS box is the card's art window). */
  mount(host, o = {}) {
    const view = new CardView(this, host, o);
    this.views.add(view);
    if (this.io) { host.__dynView = view; this.io.observe(host); } else view.inView = true;
    view.ready = this.prepare(o.illustId).then((prep) => {
      if (view.destroyed) return view;
      view.prep = prep;
      this._kick();
      return view;
    });
    view.ready.catch(() => {});
    return view;
  }

  _unmount(view) {
    this.views.delete(view);
    if (this.io) { try { this.io.unobserve(view.host); } catch { /* gone */ } }
    if (view.slot) { view.slot.views.delete(view); if (!view.slot.views.size) this._dropSlot(view.slot); view.slot = null; }
    if (!this.views.size) this._stop();
  }

  _dropSlot(slot) {
    this.slots.delete(slot.key);
    slot.destroy();
  }

  _kick() {
    if (this._raf || this.destroyed || !this.views.size) return;
    const raf = this.opts.raf || requestAnimationFrame;
    this._raf = raf((t) => this._frame(t));
  }

  _stop() { this._raf = 0; this.last = 0; }

  _now(t) { return this.opts.now ? this.opts.now() : t; }

  _frame(t) {
    this._raf = 0;
    if (this.destroyed || !this.views.size) return;
    const hidden = this.opts.hidden ? this.opts.hidden() : document.hidden;
    if (hidden) { this._pauseAll(); this.last = 0; return; } // the visibilitychange handler restarts it
    const now = this._now(t);
    const dt = this.last ? Math.max(0, (now - this.last) / 1000) : 0;
    this.last = now;
    this.frameNo++;
    // views → slots (size changes re-key them)
    for (const v of this.views) v.sync();
    // step the visible slots, pause the others
    const live = [];
    for (const slot of this.slots.values()) {
      const vis = [...slot.views].some((v) => v.inView && v.w > 0 && v.h > 0);
      if (!vis) { slot.pause(); continue; }
      slot.resume();
      slot.step(dt);
      live.push(slot);
    }
    if (live.length && this._ensureGL() && !this.lost) this._draw(live);
    this._kick();
  }

  _pauseAll() { for (const s of this.slots.values()) s.pause(); }

  /** Pack the live slots, draw them, copy each into its cards' canvases. */
  _draw(live) {
    // shelf packing, tallest first
    live.sort((a, b) => b.h - a.h);
    let x = 0, y = 0, rowH = 0, W = 0, H = 0;
    for (const s of live) {
      if (x + s.w > MAX_CANVAS) { x = 0; y += rowH; rowH = 0; }
      if (y + s.h > MAX_CANVAS) { s.x = -1; continue; }
      s.x = x; s.y = y; x += s.w; rowH = Math.max(rowH, s.h);
      W = Math.max(W, x); H = Math.max(H, y + rowH);
    }
    const r = this.renderer;
    if (W > r.width || H > r.height) r.resize(Math.max(W, r.width), Math.max(H, r.height));
    const CW = r.width, CH = r.height;
    // the effect geometry of every slot, built once into one buffer
    const gl = r.gl;
    if (!this.glr && gl && r.context?.webGLVersion === 2 && this.fxLib) {
      try { this.glr = new FxGL(gl, this.fxLib); } catch (err) { console.warn('[dynillust] effects unavailable', err); }
    }
    this.fd.reset();
    for (const s of live) if (s.x >= 0) s.prepare(this, CW, CH);
    if (this.glr) this.glr.upload(this.fd);
    // the stage holds the slots placed this frame
    this.stage.removeChildren();
    for (const s of live) if (s.x >= 0) { s.root.position.set(s.x, s.y); this.stage.addChild(s.root); }
    r.render(this.stage, { clear: true });
    for (const s of live) if (s.x >= 0) for (const v of s.views) v.blit(this.canvas, s);
  }

  /** Draw one slot's sorted list (called from inside Pixi's render of the slot's Spine display). */
  _renderSlot(renderer, slot) {
    let run = null;
    const flush = () => {
      if (!run || !run.length || !this.glr) { run = null; return; }
      renderer.batch.flush();
      try {
        this.glr.draw(run, { vp: slot.vp, cam: slot.camU, time: slot.fxTime, half: this.lite, pass: ++this.pass });
      } catch (err) { if (!this._warned) { this._warned = true; console.error('[dynillust] effects draw failed', err); } }
      finally { resetPixi(renderer); }
      run = null;
    };
    for (const it of slot.items) {
      if (it.skelPart) { flush(); if (it.skelPart.enabled) slot.skel.renderPart(renderer, it.skelPart); renderer.batch.flush(); continue; }
      (run || (run = [])).push(it);
    }
    flush();
  }

  stats() {
    return { views: this.views.size, slots: this.slots.size, live: [...this.slots.values()].filter((s) => !s.paused).length, canvas: [this.canvas.width, this.canvas.height] };
  }

  destroy() {
    this.destroyed = true;
    for (const v of [...this.views]) v.destroy();
    for (const s of [...this.slots.values()]) this._dropSlot(s);
    document.removeEventListener('visibilitychange', this._onVis);
    this.io?.disconnect();
    try { this.glr?.destroy(); } catch { /* the context may be gone */ }
    try { this.renderer?.destroy(); } catch { /* ignore */ }
    if (shared === this) shared = null;
  }
}

/** One card showing an illustration (a mount). */
class CardView {
  constructor(R, host, o) {
    this.R = R;
    this.host = host;
    this.illustId = o.illustId;
    this.inView = false;
    this.destroyed = false;
    this.prep = null;
    this.slot = null;
    this.canvas = null;
    this.ctx = null;
    this.w = 0; this.h = 0; this.cssW = 0; this.cssH = 0;
    this.shown = false;
  }

  /** The state the screens read: 'loading' | 'ready' | 'failed'. */
  get state() { return this.destroyed ? 'gone' : this.prep ? 'ready' : 'loading'; }

  /** Size from the host's box; (re)attach to the slot of this size. */
  sync() {
    if (this.destroyed || !this.prep) return;
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, Math.max(1, globalThis.devicePixelRatio || 1));
    const cssW = r.width, cssH = r.height;
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (w !== this.w || h !== this.h || !this.slot) {
      this.w = w; this.h = h; this.cssW = cssW; this.cssH = cssH;
      if (this.slot) { this.slot.views.delete(this); if (!this.slot.views.size) this.R._dropSlot(this.slot); this.slot = null; }
      if (w > 0 && h > 0) {
        const key = `${this.illustId}|${w}x${h}`;
        let slot = this.R.slots.get(key);
        if (!slot) { slot = new Slot(this.R, key, this.prep, w, h); this.R.slots.set(key, slot); }
        slot.views.add(this);
        this.slot = slot;
        this._canvas(w, h);
      }
    }
  }

  _canvas(w, h) {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'dynillust-canvas';
      this.canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none';
      this.ctx = this.canvas.getContext('2d');
    }
    this.canvas.width = w; this.canvas.height = h;
  }

  blit(src, slot) {
    if (!this.ctx || !this.inView) return;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.drawImage(src, slot.x, slot.y, slot.w, slot.h, 0, 0, this.w, this.h);
    if (!this.shown) { this.shown = true; this.host.appendChild(this.canvas); }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.canvas?.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.R._unmount(this);
  }
}

/** One illustration drawn at one size: its skeleton, instance, card state and effect layer. */
class Slot {
  constructor(R, key, prep, w, h) {
    this.R = R;
    this.key = key;
    this.views = new Set();
    this.w = w; this.h = h;
    this.x = -1; this.y = -1;
    this.paused = true;
    this.time = 0;
    this.fxTime = 0;
    this.items = [];
    const P = R.P, e = prep.entry, sk = e.skeleton || {};
    this.entry = e;
    this.skel = new IllustSkeleton(prep.spineData, sk);
    this.fx = prep.fxDef ? new IllustEffects(prep.fxDef, { lib: R.fxLib, lite: R.lite, ...(e.effects || {}) }) : null;
    if (this.fx && Array.isArray(e.root?.pos)) this.fx.fx.place({ pos: e.root.pos });
    this.inst = new DynIllustInstance({ skel: this.skel, fx: this.fx, data: e.instance || {}, now: () => this.time });
    this.card = new CardIllustState({ rng: R.opts.rng, onAction: R.opts.onAction ? (a) => R.opts.onAction(key, a) : null });
    // placement: Unity frame → slot px
    this.map = unityToCard(e.framing || {}, w, h);
    const pos = Array.isArray(e.root?.pos) ? e.root.pos : (prep.fxDef?.rootPos || [0, 0, 0]);
    const rs = Array.isArray(e.root?.scale) ? e.root.scale : [1, 1, 1];
    const sp = this.skel.spine;
    sp.position.set(this.map.x0 + this.map.scale * pos[0], this.map.y0 - this.map.scale * pos[1]);
    sp.scale.set(this.map.scale * this.skel.scale * rs[0], this.map.scale * this.skel.scale * rs[1]);
    sp.render = (renderer) => R._renderSlot(renderer, this);
    this.root = new P.Container();
    const mask = new P.Graphics().beginFill(0xffffff).drawRect(0, 0, w, h).endFill();
    this.root.addChild(mask, sp);
    this.root.mask = mask;
    this.basis = illustBasis(e.framing?.cameraSize, h);
    this.camU = this.basis.pos;
    this.vp = new Float32Array(16);
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.inst.enable();
    this.card.activate();
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.inst.disable();
    this.card.deactivate();
    this.x = -1;
  }

  /** One frame: the card's state (OnTick), the instance's Update, the skeleton, LateUpdate, followers, effects. */
  step(dt) {
    this.time += dt;
    this.card.tick(this.inst);
    this.inst.update();
    this.skel.update(dt);
    this.inst.lateUpdate();
    if (this.fx) {
      this.fx.follow(this.skel);
      const d = Math.min(dt, FX_STEP_MAX);
      this.fx.update(d);
      this.fxTime += d;
    }
  }

  /** Sort this frame's effect entries and skeleton parts, build the effects' geometry into the shared buffer. */
  prepare(R, CW, CH) {
    cardViewProj(this.map, this.x, this.y, CW, CH, this.vp);
    const items = this.items;
    items.length = 0;
    let seq = 0;
    const zRoot = Array.isArray(this.entry.root?.pos) ? Number(this.entry.root.pos[2]) || 0 : 0;
    // (`skelPart`, not `part`: the effect entries' own `part` names their renderer kind)
    for (const p of this.skel.parts) items.push({ skelPart: p, layer: p.layer, order: p.order, queue: p.queue, dist: zRoot - this.camU[2], seq: seq++ });
    if (this.fx && R.glr) this.fx.gather(this.basis, (e) => { e.seq = seq++; items.push(e); });
    items.sort(byUnityOrder);
    // geometry in draw order; neighbours of one material and kind become one draw
    let w = 0, prev = null;
    for (const e of items) {
      if (e.skelPart) { items[w++] = e; prev = null; continue; }
      const r = e.effect.build(e, this.basis, R.fd, R.frameNo);
      if (!r || !r.count) continue;
      e.kind = r.kind; e.first = r.first; e.count = r.count;
      if (prev && prev.mat === e.mat && prev.kind === e.kind && !prev.ov && !e.ov && prev.meshKey === e.meshKey && prev.submesh === e.submesh
        && prev.first + prev.count === e.first) { prev.count += e.count; continue; }
      items[w++] = e;
      prev = e;
    }
    items.length = w;
  }

  destroy() {
    try { this.fx?.destroy(); } catch { /* ignore */ }
    try { this.skel.destroy(); } catch { /* ignore */ }
    try { this.root.destroy({ children: true }); } catch { /* ignore */ }
  }
}
