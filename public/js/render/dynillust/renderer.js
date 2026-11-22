// render/dynillust/renderer.js — the stage that draws every live dynamic illustration of a page (result, room, Grand
// Alliance cards), as the official DynIllustMgr does with its render slots [src: official dump.cs DynIllustMgr
// m_singleSlot, m_multiSlots; doc l2d-art-proposal §4.3]. The screens use it only through render/dynillust/index.js
// (the mount API of docs/design/vfx-format.md §33.19).
//
// How it draws: one WebGL2 context on an off-page canvas. Each frame every visible illustration ("slot") is updated,
// placed in its own rectangle of that canvas (scissored), drawn — its Spine parts and its effect layer interleaved in
// Unity's sort order (sorting layer, order, render queue, depth), the parts being SkeletonPartsRenderers — and then
// copied (drawImage) into each card's own 2D canvas, `Card.canvas`, which the screen places under its overlays; the
// official card shows its slot's render texture through a RawImage the same way [src: official dump.cs DynIllustMgr
// RT_WIDTH, RT_HEIGHT]. So a card's DOM stacking, transforms, opacity and scrolling stay the page's, and the page has a
// single GL context however many cards it shows.
//   The same illustration at the same size on two cards is one slot, drawn once and copied to both (the official
//   single-slot broadcast [src: official dump.cs AdaptiveDynIllustUpdater _UpdateDynIllustsSingleSlotBroadcast]).
//   A card out of view, or a hidden page, pauses its slot: the instance is disabled and its card state deactivated, its
//   rectangle freed; in view again, enabled and activated again — the official release of an unseen view's slot [src:
//   official dump.cs DynIllustActiveSlotPolicy ReconcileSlotHolders].
//   Card.start(): a ready card shows at alpha 1 at once, straight into looping Idle, no fade and no Start — the official
//   card's SafeActivate(fastMode: true) (O1) [src: official GameAssembly.dll AutoChessSettleGameTeamPlayerCardView.
//   _RenderIllust 0x28E180B; UICharacterIllustController._ActivateIllustImmediately 0x1452771; DynIllustBase.OnEnable
//   0x1442335]. A card started while still loading (D11's late card) fades its canvas in over LATE_FADE_S once ready,
//   the controller's own non-fast fade [src: official GameAssembly.dll UICharacterIllustController.Config..cctor
//   0x147EF10 fadeDuration 0.15], also straight into Idle (the user's decision of 2026-11-22, doc §33.19 Mount API).

import { unityToCard, cardViewProj } from './framing.js';
import { IllustSkeleton } from './skeleton.js';
import { DynIllustInstance } from './instance.js';
import { CardIllustState } from './state.js';
import { IllustEffects, illustBasis } from './effects.js';
import { loadIllust, slotData } from './loader.js';
import { FxGL } from '../vfx/gl.js';
import { FrameData } from '../vfx/geom.js';
import { FxLibrary } from '../vfx/library.js';
import { resetPixi } from '../vfx/system.js';

/** Largest side of the shared canvas (px): 8 phone-size cards fit with room to spare. */
export const MAX_CANVAS = 4096;
/** Device pixel ratio cap for the cards' canvases (a 3× phone draws at 2×, as the official mobile tiers draw smaller
 * render textures than PC [src: official dump.cs DynIllustMgr.RTSizeConfig l2Mobile / l4Standalone]). */
export const MAX_DPR = 2;
/** Effect step cap per frame in s: the effect layer's own cap (render/vfx/system.js OfficialFx.update). */
export const FX_STEP_MAX = 0.25;
/** The late card's fade in s [src: official GameAssembly.dll UICharacterIllustController.Config..cctor 0x147EF10]. */
export const LATE_FADE_S = 0.15;

function byUnityOrder(a, b) {
  return (a.layer - b.layer) || (a.order - b.order) || (a.queue - b.queue) || (b.dist - a.dist) || (a.seq - b.seq);
}

export class DynIllustStage {
  /**
   * @param {{ manifest?: () => Promise<any>, fetch?: typeof fetch, rng?: () => number, now?: () => number,
   *           raf?: (cb: FrameRequestCallback) => number, hidden?: () => boolean, spineShader?: () => Promise<any>,
   *           onAction?: (key: string, a: number) => void }} [opts]
   * `manifest`: data/local-assets.json (assets.local()); `spineShader`: imports render/dynillust/spine-shader.js
   */
  constructor(opts = {}) {
    this.opts = opts;
    this.P = globalThis.PIXI;
    this.quality = 'full';
    this.cards = new Set();
    this.slots = new Map();     // `${key}|${quality}|${w}x${h}` → Slot
    this.cache = new Map();     // `${key}|${quality}` → { promise, prep, failed }
    this.texInfo = {};
    this.lib = new FxLibrary({ list: { groups: { fx: {}, 'fx/prefabs': {}, 'fx/tex': {}, 'fx/mesh': {} } }, fetch: opts.fetch });
    this.lib.texInfo = () => Promise.resolve(this.texInfo);
    this.destroyed = false;
    this.frameNo = 0;
    this.pass = 0;
    this.last = 0;
    this.time = 0;
    this._raf = 0;
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) { this.canvas.width = 2; this.canvas.height = 2; }
    this.renderer = null;
    this.stage = null;
    this.glr = null;
    this.fd = new FrameData();
    this.spineFactory = undefined;  // undefined: not looked up yet; null: plain pixi-spine
    this._group = null;
    this._onVis = () => { if (!this._hidden()) this._kick(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVis);
    this.io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((list) => { for (const e of list) { const c = e.target.__dynCard; if (c) c.inView = e.isIntersecting; } this._kick(); })
      : null;
  }

  _hidden() { return this.opts.hidden ? this.opts.hidden() : typeof document !== 'undefined' && document.hidden; }

  /** The `dynillust` group of data/local-assets.json (key → { path, charId, skinId, … }); {} without one. */
  index() {
    if (!this._index) {
      const m = this.opts.manifest ? this.opts.manifest() : Promise.resolve(null);
      this._index = Promise.resolve(m).catch(() => null).then((man) => {
        const g = man && man.groups && man.groups.dynillust;
        this._group = g && typeof g === 'object' ? g : {};
        return this._group;
      });
    }
    return this._index;
  }

  /** The manifest entry of a key, once index() has loaded (else undefined). */
  entryOf(key) { return this._group ? this._group[key] : undefined; }

  async _spineFactory() {
    if (this.spineFactory !== undefined) return this.spineFactory;
    this.spineFactory = null;
    try {
      const mod = this.opts.spineShader ? await this.opts.spineShader() : await import('./spine-shader.js');
      if (mod && typeof mod.createDynSpine === 'function') this.spineFactory = mod.createDynSpine;
    } catch { /* Dev 51's shader not installed: pixi-spine's own */ }
    return this.spineFactory;
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
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.lib.forgetGpu(); this._kick(); });
    const gl = this.renderer.gl;
    if (gl && this.renderer.context?.webGLVersion === 2) {
      try { this.glr = new FxGL(gl, this.lib); } catch (err) { console.warn('[dynillust] effects unavailable', err); }
    }
    return true;
  }

  /** Download, decode, build and upload one key (cached per quality). Resolves to the prepared data or rejects. */
  _prepare(key) {
    const ck = `${key}|${this.quality}`;
    let c = this.cache.get(ck);
    if (c) return c.promise;
    c = { promise: null, prep: null, failed: false };
    c.promise = (async () => {
      await this.index();
      const e = this.entryOf(key);
      if (!e || !e.path) throw new Error('no illustration ' + key);
      await this._spineFactory();
      const prep = await loadIllust(e.path, { P: this.P, fetch: this.opts.fetch, lib: this.lib, half: this.quality === 'half', texInfo: this.texInfo });
      prep.data = slotData(prep.entry);
      await this._warm(prep);
      c.prep = prep;
      return prep;
    })();
    c.promise.catch((err) => { c.failed = true; console.warn('[dynillust]', key, err?.message || err); });
    this.cache.set(ck, c);
    return c.promise;
  }

  /** Put an illustration's pages, effect programs and textures on the GPU ahead of its first draw (D10). */
  async _warm(prep) {
    if (!this._ensureGL() || this.lost) return;
    const r = this.renderer;
    for (const t of prep.pages.values()) { try { r.texture.bind(t); } catch { /* uploaded at its first draw */ } }
    const def = prep.fxDef, glr = this.glr;
    if (!def || !glr) return;
    const half = this.quality === 'half';
    await Promise.all((def.textures || []).map((k) => this.lib.loadTexture(k, half)));
    const progs = new Map();
    const add = (kind, mi) => { const mat = mi != null ? def.material(mi, false) : null; if (mat) progs.set(`${kind}|${mat.key}`, [kind, mat]); };
    for (let i = 0; i < def.n; i++) {
      const pr = def.psr[i];
      if (pr && pr.enabled && pr.mode !== 'none') { add(pr.mode === 'mesh' ? 'mesh' : 'quad', pr.mats[0]); if (def.ps[i]?.trail) add('strip', pr.mats[1]); }
      if (def.mesh[i]) for (const mi of def.mesh[i].mats) add('mesh', mi);
      for (const x of [def.skinned[i], def.trail[i], def.line[i]]) if (x) for (const mi of x.mats) add('strip', mi);
    }
    try {
      for (const [kind, mat] of progs.values()) glr.program(kind, mat);
      for (const k of def.textures || []) glr.texture(k, half);
    } finally { resetPixi(r); }
  }

  /** D10: get every key ready (or failed) before its cards are shown. Settles when all have. */
  async preload(keys) {
    await Promise.allSettled([...new Set(keys || [])].filter(Boolean).map((k) => this._prepare(k)));
  }

  /** Free every cached key not in `keep` and not on a mounted card (the match starts: release()). */
  release(keep = []) {
    const hold = new Set(keep);
    for (const c of this.cards) hold.add(c.key);
    for (const [ck, c] of this.cache) {
      const key = ck.slice(0, ck.lastIndexOf('|'));
      if (hold.has(key)) continue;
      this.cache.delete(ck);
      if (c.prep) for (const t of c.prep.pages.values()) { try { t.destroy(); } catch { /* gone */ } }
    }
    if (!this.cards.size) this.lib.dropImages();
  }

  /** A card showing `key` (docs/design/vfx-format.md §33.19 Mount API). */
  mount(key, o = {}) {
    const card = new Card(this, key, o);
    this.cards.add(card);
    return card;
  }

  _unmount(card) {
    this.cards.delete(card);
    if (this.io && card.canvas) { try { this.io.unobserve(card.canvas); } catch { /* gone */ } }
    if (card.slot) { card.slot.cards.delete(card); if (!card.slot.cards.size) this._dropSlot(card.slot); card.slot = null; }
  }

  _dropSlot(slot) { this.slots.delete(slot.id); slot.destroy(); }

  _kick() {
    if (this._raf || this.destroyed || !this.cards.size) return;
    const raf = this.opts.raf || requestAnimationFrame;
    this._raf = raf((t) => this._frame(t));
  }

  _frame(t) {
    this._raf = 0;
    if (this.destroyed || !this.cards.size) { this.last = 0; return; }
    if (this._hidden()) { for (const s of this.slots.values()) s.pause(); this.last = 0; return; }
    const now = this.opts.now ? this.opts.now() : t;
    const dt = this.last ? Math.max(0, (now - this.last) / 1000) : 0;
    this.last = now;
    this.time += dt;
    this.frameNo++;
    for (const c of this.cards) c.sync(dt);
    const live = [];
    for (const slot of this.slots.values()) {
      if (![...slot.cards].some((c) => c.drawing)) { slot.pause(); continue; }
      slot.resume();
      slot.step(dt);
      live.push(slot);
    }
    if (live.length && this._ensureGL() && !this.lost) this._draw(live);
    this._kick();
  }

  /** Pack the live slots, draw them, copy each into its cards' canvases. */
  _draw(live) {
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
    this.fd.reset();
    for (const s of live) if (s.x >= 0) s.prepare(this, CW, CH);
    if (this.glr) this.glr.upload(this.fd);
    this.stage.removeChildren();
    for (const s of live) if (s.x >= 0) { s.root.position.set(s.x, s.y); this.stage.addChild(s.root); }
    r.render(this.stage, { clear: true });
    for (const s of live) if (s.x >= 0) for (const c of s.cards) c.blit(this.canvas, s);
  }

  /** Draw one slot's sorted list (from inside Pixi's render of the slot's Spine display). */
  _renderSlot(renderer, slot) {
    let run = null;
    const flush = () => {
      if (!run || !run.length || !this.glr) { run = null; return; }
      renderer.batch.flush();
      try {
        this.glr.draw(run, { vp: slot.vp, cam: slot.camU, time: slot.fxTime, half: this.quality === 'half', pass: ++this.pass });
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
    return {
      cards: this.cards.size, slots: this.slots.size, live: [...this.slots.values()].filter((s) => !s.paused).length,
      cached: this.cache.size, canvas: this.canvas ? [this.canvas.width, this.canvas.height] : null, quality: this.quality,
    };
  }

  destroy() {
    this.destroyed = true;
    for (const c of [...this.cards]) c.unmount();
    for (const s of [...this.slots.values()]) this._dropSlot(s);
    this.release([]);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this._onVis);
    this.io?.disconnect();
    try { this.glr?.destroy(); } catch { /* the context may be gone */ }
    try { this.renderer?.destroy(); } catch { /* ignore */ }
  }
}

/** One card showing an illustration (a mount): its own 2D canvas, the §33.19 states. */
export class Card {
  constructor(S, key, o) {
    this.S = S;
    this.key = key;
    this.onState = typeof o.onState === 'function' ? o.onState : null;
    this.state = 'loading';
    this.inView = !S.io;
    this.started = false;
    this.fade = -1;          // seconds into the late fade, −1 when none
    this.slot = null;
    this.prep = null;
    this.w = 0; this.h = 0;
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) {
      this.canvas.className = 'dynillust-canvas';
      this.canvas.width = 1; this.canvas.height = 1;
      this.canvas.style.opacity = '0';
      this.ctx = this.canvas.getContext('2d');
      this.canvas.__dynCard = this;
      if (S.io) S.io.observe(this.canvas);
    }
    this.ready = S._prepare(key).then((prep) => {
      if (this.state === 'unmounted') return false;
      this.prep = prep;
      if (this.started) { this.fade = 0; S._kick(); }   // D11: the late card fades in
      else this._set('ready');
      return true;
    }, () => { if (this.state !== 'unmounted') this._set('failed'); return false; });
  }

  _set(st) {
    if (this.state === st) return;
    this.state = st;
    if (this.onState) { try { this.onState(st); } catch (err) { console.error('[dynillust] onState', err); } }
  }

  /** Show the illustration (see the states). */
  start() {
    if (this.started || this.state === 'unmounted' || this.state === 'failed') return;
    this.started = true;
    if (this.state === 'ready') {
      if (this.canvas) this.canvas.style.opacity = '1';
      this._set('live');
      this.S._kick();
    }
  }

  /** Drawn this frame: started, ready, in view, sized. */
  get drawing() { return this.started && !!this.prep && this.inView && this.w > 0 && this.h > 0 && this.state !== 'unmounted'; }

  /** Size from the canvas's CSS box; (re)attach to the slot of this size; advance the late fade. */
  sync(dt) {
    if (!this.prep || !this.canvas || this.state === 'unmounted') return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, Math.max(1, globalThis.devicePixelRatio || 1));
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w !== this.w || h !== this.h || !this.slot) {
      this.w = w; this.h = h;
      if (this.slot) { this.slot.cards.delete(this); if (!this.slot.cards.size) this.S._dropSlot(this.slot); this.slot = null; }
      if (w > 0 && h > 0) {
        const id = `${this.key}|${this.S.quality}|${w}x${h}`;
        let slot = this.S.slots.get(id);
        if (!slot) { slot = new Slot(this.S, id, this.key, this.prep, w, h); this.S.slots.set(id, slot); }
        slot.cards.add(this);
        this.slot = slot;
        this.canvas.width = w; this.canvas.height = h;
      }
    }
    if (this.fade >= 0 && this.drawing) {
      this.fade += dt;
      const a = Math.min(1, this.fade / LATE_FADE_S);
      this.canvas.style.opacity = String(a);
      if (a >= 1) { this.fade = -1; this._set('live'); }
    }
  }

  blit(src, slot) {
    if (!this.ctx || !this.drawing) return;
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.ctx.drawImage(src, slot.x, slot.y, slot.w, slot.h, 0, 0, this.w, this.h);
  }

  unmount() {
    if (this.state === 'unmounted') return;
    this._set('unmounted');
    this.S._unmount(this);
  }
}

/** One illustration drawn at one size: its skeleton, instance, card state and effect layer. */
class Slot {
  constructor(S, id, key, prep, w, h) {
    this.S = S;
    this.id = id;
    this.key = key;
    this.cards = new Set();
    this.w = w; this.h = h;
    this.x = -1; this.y = -1;
    this.paused = true;
    this.time = 0;
    this.fxTime = 0;
    this.items = [];
    const P = S.P, d = prep.data, sk = d.skeleton;
    this.data = d;
    const look = sk.look;
    const make = S.spineFactory ? (sd) => S.spineFactory(P, sd, look) : null;
    this.skel = new IllustSkeleton(prep.spineData, { ...sk, makeSpine: make });
    this.fx = prep.fxDef ? new IllustEffects(prep.fxDef, { lib: S.lib, lite: false, ...d.effects }) : null;
    if (this.fx) this.fx.fx.place({ pos: d.root.pos });
    this.inst = new DynIllustInstance({ skel: this.skel, fx: this.fx, data: d.instance, now: () => this.time });
    this.card = new CardIllustState({ rng: S.opts.rng, onAction: S.opts.onAction ? (a) => S.opts.onAction(key, a) : null });
    this.map = unityToCard(d.framing, w, h);
    const pos = d.root.pos, rs = d.root.scale;
    const sp = this.skel.spine;
    sp.position.set(this.map.x0 + this.map.scale * pos[0], this.map.y0 - this.map.scale * pos[1]);
    sp.scale.set(this.map.scale * this.skel.scale * rs[0], this.map.scale * this.skel.scale * rs[1]);
    sp.render = (renderer) => S._renderSlot(renderer, this);
    this.root = new P.Container();
    const mask = new P.Graphics().beginFill(0xffffff).drawRect(0, 0, w, h).endFill();
    this.root.addChild(mask, sp);
    this.root.mask = mask;
    this.basis = illustBasis(d.framing.cameraSize, h);
    this.camU = this.basis.pos;
    this.zRoot = Number(pos[2]) || 0;
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
      this.fx.animate();
      const d = Math.min(dt, FX_STEP_MAX);
      this.fx.update(d);
      this.fxTime += d;
    }
  }

  /** Sort this frame's effect entries and skeleton parts, build the effects' geometry into the shared buffer. */
  prepare(S, CW, CH) {
    cardViewProj(this.map, this.x, this.y, CW, CH, this.vp);
    const items = this.items;
    items.length = 0;
    let seq = 0;
    // (`skelPart`, not `part`: the effect entries' own `part` names their renderer kind)
    for (const p of this.skel.parts) items.push({ skelPart: p, layer: p.layer, order: p.order, queue: p.queue, dist: this.zRoot - this.camU[2], seq: seq++ });
    if (this.fx && S.glr) this.fx.gather(this.basis, (e) => { e.seq = seq++; items.push(e); });
    items.sort(byUnityOrder);
    let w = 0, prev = null;
    for (const e of items) {
      if (e.skelPart) { items[w++] = e; prev = null; continue; }
      const r = e.effect.build(e, this.basis, S.fd, S.frameNo);
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
    try { this.root.destroy({ children: true }); } catch { /* ignore */ }
  }
}
