// render/dynillust/renderer.js — the stage that draws every live dynamic illustration of a page (result, room, Grand
// Alliance cards), as the official DynIllustMgr does with its render slots [src: official dump.cs DynIllustMgr
// m_singleSlot, m_multiSlots; doc l2d-art-proposal §4.3]. The screens use it only through render/dynillust/index.js
// (the mount API of docs/design/vfx-format.md §33.19).
//
// How it draws: one WebGL2 context on an off-page canvas. Each frame every visible illustration ("slot") is updated,
// placed in its own rectangle of that canvas (scissored), drawn — its Spine parts and its effect layer interleaved in
// Unity's sort order (the opaque-queue pass first, then sorting layer, order, render queue, depth: byUnityOrder), the
// parts being SkeletonPartsRenderers, depth-tested on the GPU path as their Spine material says — and then
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

import { cardFraming, framingMap, cardViewProj, ZR } from './framing.js';
import { IllustSkeleton } from './skeleton.js';
import { DynIllustInstance } from './instance.js';
import { CardIllustState, ACTION } from './state.js';
import { IllustEffects, illustBasis } from './effects.js';
import { loadIllust, loadGroups, slotData } from './loader.js';
import { GpuSkeleton, gpuSkinSupported } from './gpuskin.js';
import { FxGL } from '../vfx/gl.js';
import { FrameData } from '../vfx/geom.js';
import { FxLibrary } from '../vfx/library.js';
import { newNet, countingFetch } from './progress.js';
import { resetPixi } from '../vfx/system.js';
import { setPrewarmSink } from '../vfx/psys.js';

/** Largest side of the shared canvas (px): 8 phone-size cards fit with room to spare. */
export const MAX_CANVAS = 4096;
/** Device pixel ratio cap for the cards' canvases (a 3× phone draws at 2×, as the official mobile tiers draw smaller
 * render textures than PC [src: official dump.cs DynIllustMgr.RTSizeConfig l2Mobile / l4Standalone]). */
export const MAX_DPR = 2;
/** Effect step cap per frame in s: the effect layer's own cap (render/vfx/system.js OfficialFx.update). */
export const FX_STEP_MAX = 0.25;
/** The late card's fade in s [src: official GameAssembly.dll UICharacterIllustController.Config..cctor 0x147EF10]. */
export const LATE_FADE_S = 0.15;
/**
 * Staging work per frame in ms (ours, not an official value): a card's first-draw work — page and effect texture
 * uploads, shader builds, its slot (skeleton, GPU skinning, effect instance), the first step (the particle prewarm) and
 * a warm-up draw — runs before the card reports 'ready', a piece at a time after each frame's own work while the frame
 * has used less than this, at least one piece a frame; so start() at 'live' costs nothing and the page keeps animating.
 */
export const STAGE_BUDGET_MS = 8;
/** Frames a card waits for a layout size before it reports 'ready' unstaged (it then builds at its first draw). */
export const STAGE_SIZE_FRAMES = 30;
/** Warm-up steps of an illustration's throwaway slot before its cards report ready, and the step it switches to its special idle at (Stage._warmSpecial). */
export const WARM_STEPS = 40;
export const WARM_SPECIAL_AT = 10;
/** The real step a staged slot takes before its card reports ready, s (Card._stage): one 60 Hz frame. */
export const STAGE_STEP_S = 1 / 60;
/** Particle prewarm simulated per staging piece, ms (Card._stage; at least one step of a system). */
export const PREWARM_SLICE_MS = 4;
/** Effect texture pixels one staging piece uploads (one 1024 × 1024 texture; renderer _texPieces). */
export const UPLOAD_PIECE_PX = 1 << 20;

/**
 * The render queue that ends the engine's opaque pass: a renderer whose material queue is at most this draws in the
 * opaque pass, before every transparent one, whatever its sorting layer and order [src: official UnityPlayer.dll
 * 2021.3.39 game build (its UnityPlayer.pdb): BuildRenderObjectData 0x1328688 `cmp ebp, 0x9c4` puts each object in
 * the opaque or the transparent list by its queue (the object's own, else its shader's: 0x1328655–0x1328683);
 * DoRenderLoop 0x132bea7 draws the opaque list (DoForwardShaderRenderLoop), the skybox and image effects, then the
 * transparent list at 0x132bfdc]. W's Elite 2 bullets (3D/Toon, queue Geometry 2000, ZWrite On, sorting order 1) draw
 * before her skeleton (order 0) and hide it where they are nearer; the 3D/Toon program reads no vertex colour.
 */
export const OPAQUE_MAX_QUEUE = 2500;

/**
 * Draw order: the opaque pass first, then sorting layer, order, render queue, back to front. (Inside the opaque pass the
 * same keys: its depth-writing opaque meshes give the same picture in any order.)
 */
export function byUnityOrder(a, b) {
  const pa = a.queue <= OPAQUE_MAX_QUEUE ? 0 : 1, pb = b.queue <= OPAQUE_MAX_QUEUE ? 0 : 1;
  return (pa - pb) || (a.layer - b.layer) || (a.order - b.order) || (a.queue - b.queue) || (b.dist - a.dist) || (a.seq - b.seq);
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
    this._quality = 'full';     // the quality setter: a change frees the other tier's cache once no card shows it
    this.cards = new Set();
    this.slots = new Map();     // `${key}|${quality}|${w}x${h}` → Slot
    this.cache = new Map();     // `${key}|${quality}` → { promise, prep, failed }
    this.texInfo = {};
    // (fork) every download counted as it arrives (render/dynillust/progress.js): netState() for the room's stall check
    this.net = newNet();
    this._fetch = countingFetch(opts.fetch || ((url, o) => globalThis.fetch(url, o)), this.net);
    this.lib = new FxLibrary({ list: { groups: { fx: {}, 'fx/prefabs': {}, 'fx/tex': {}, 'fx/mesh': {} } }, fetch: this._fetch });
    this.lib.texInfo = () => Promise.resolve(this.texInfo);
    this.destroyed = false;
    this.frameNo = 0;
    this.pass = 0;
    this.last = 0;
    this.time = 0;
    this._raf = 0;
    this._jobs = [];            // staging pieces (STAGE_BUDGET_MS): () => true when done, false to try again next frame
    this._warming = new Set();  // staged slots to draw once (not stepped) in the next frame: the warm-up draw
    // the shared GL canvas: off-page on the main thread, an OffscreenCanvas in a Worker (render/dynillust/worker.js)
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas')
      : typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(2, 2) : null;
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

  /** 'full' | 'half' (the D7 setting): new cards load at this tier; the other tier is freed once no card shows it. */
  get quality() { return this._quality; }
  set quality(q) {
    const old = this._quality;
    this._quality = q;
    if (old !== q) this._freeTier(old);
  }

  /**
   * Free the prepared illustrations of `tier` (not the current one) that no mounted card shows: their atlas pages and
   * their effect textures on the GPU, those another illustration of that tier still uses excepted. A player switching
   * Full → Half kept the full pages in GPU memory until the match started (release()). The current tier is never
   * freed here, so what a screen keeps for the result stays.
   */
  _freeTier(tier) {
    if (tier === this._quality) return;
    const shown = new Set();
    for (const c of this.cards) if (c.tier === tier && c.state !== 'unmounted') shown.add(c.key);
    const keep = new Set(), gone = [];
    for (const [ck, c] of this.cache) {
      const i = ck.lastIndexOf('|');
      if (ck.slice(i + 1) !== tier) continue;
      if (shown.has(ck.slice(0, i))) { for (const k of c.prep?.fxDef?.textures || []) keep.add(k); continue; }
      gone.push([ck, c]);
    }
    const free = (prep, textures) => {
      for (const t of prep.pages.values()) { try { t.destroy(); } catch { /* gone */ } }
      if (textures && this.glr) for (const k of prep.fxDef?.textures || []) if (!keep.has(k)) this.glr.dropTexture(k, tier === 'half');
    };
    for (const [ck, c] of gone) {
      this.cache.delete(ck);
      if (c.prep) free(c.prep, true);
      // still loading (a preload no card shows): its pages go once it is in; its effect textures too, unless the key
      // was asked for again at that tier meanwhile (they are shared by key: the new load uses them)
      else c.promise.then((prep) => { if (prep) free(prep, !this.cache.has(ck)); }, () => {});
    }
  }

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
        // not multisampled: the GrabPass / blur materials copy the bound framebuffer (render/vfx/gl.js _grabFrame)
        view: this.canvas, width: 2, height: 2, resolution: 1, backgroundAlpha: 0, antialias: false,
        premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance',
      });
    } catch (err) { console.warn('[dynillust] no WebGL', err); return false; }
    this.stage = new P.Container();
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.glr = null; this.lost = true; });
    this.canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.lib.forgetGpu(); this._kick(); });
    const gl = this.renderer.gl;
    if (gl && this.renderer.context?.webGLVersion === 2) {
      // rtAlpha: the official illustration render texture's alpha is a transmittance (camera clear (0, 0, 0, 1), the
      // card's UI/UI_RT_DYN_ILLUST adds RT.rgb + background × RT.a), so an eraser (Mask/Erase) makes pixels see-through;
      // FxGL keeps the materials' alpha factors, turned into our coverage alpha [src: doc client.md §Official battle
      // effects, Shaders; render/vfx/gl.js rtAlphaFactors]
      try { this.glr = new FxGL(gl, this.lib, { rtAlpha: true }); } catch (err) { console.warn('[dynillust] effects unavailable', err); }
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
      // (`effects: false`: the skeleton alone, for checks that compare two renders of it)
      const lib = this.opts.effects === false ? null : this.lib;
      const prep = await loadIllust(e.path, { P: this.P, fetch: this._fetch, lib, half: this.quality === 'half', texInfo: this.texInfo });
      prep.data = slotData(prep.entry);
      await this._warm(prep);
      c.prep = prep;
      return prep;
    })();
    c.promise.catch((err) => { c.failed = true; console.warn('[dynillust]', key, err?.message || err); });
    this.cache.set(ck, c);
    return c.promise;
  }

  /**
   * Put an illustration's pages, effect programs and textures on the GPU ahead of its first draw (D10). The downloads
   * and decodes run here; every GL call (an upload, a program's build start) is one staging piece (_runJobs), so no
   * frame carries them all. Settles once the pieces ran; `prep.progs` lists the programs (their builds may still run:
   * _stage waits for them).
   */
  async _warm(prep) {
    if (!this._ensureGL() || this.lost) return;
    const def = prep.fxDef, glr = this.glr;
    const half = this.quality === 'half';
    // the load groups [src: doc §33.19 Load]: everything a card will show (IDLE and SPECIAL_IDLE) before it is ready,
    // so nothing loads, uploads or compiles once it plays (the user, 2026-11-22: "Wait until it's ready, then play the
    // animation"); START's and INTERACTION's never (a card never plays them)
    const groups = loadGroups(prep.entry);
    const first = ((def && glr && def.textures) || []).filter((k) => !groups.never.has(groups.texture(k)));
    // one owner per illustration: the library shares its parallel loads between the cards in turn
    await Promise.all(first.map((k) => this.lib.loadTexture(k, half, prep.entry && prep.entry.key)));
    const progs = new Map();
    if (def && glr) {
      const add = (kind, mi) => { const mat = mi != null ? def.material(mi, false) : null; if (mat) progs.set(`${kind}|${mat.key}`, [kind, mat]); };
      for (let i = 0; i < def.n; i++) {
        if (groups.never.has(groups.node(i))) continue;
        const pr = def.psr[i];
        if (pr && pr.enabled && pr.mode !== 'none') { add(pr.mode === 'mesh' ? 'mesh' : 'quad', pr.mats[0]); if (def.ps[i]?.trail) add('strip', pr.mats[1]); }
        if (def.mesh[i]) for (const mi of def.mesh[i].mats) add('mesh', mi);
        for (const x of [def.skinned[i], def.trail[i], def.line[i]]) if (x) for (const mi of x.mats) add('strip', mi);
      }
    }
    prep.progs = [...progs.values()];
    const r = this.renderer;
    const gl1 = (fn) => () => { if (!this.lost) { try { fn(); } catch { /* done at its first draw instead */ } finally { resetPixi(r); } } return true; };
    const pieces = [];
    for (const t of prep.pages.values()) pieces.push(gl1(() => r.texture.bind(t)));
    if (def && glr) {
      // the builds start here and run on in the driver (KHR_parallel_shader_compile); several starts make one piece
      for (let i = 0; i < prep.progs.length; i += 4) { const some = prep.progs.slice(i, i + 4); pieces.push(gl1(() => { for (const [kind, mat] of some) glr.program(kind, mat); })); }
      pieces.push(...this._texPieces(first, half));
    }
    await this._enqueue(pieces);
  }

  /**
   * Staging pieces that upload effect textures `keys` (decoded already), several small ones per piece: at most
   * UPLOAD_PIECE_PX pixels each, a larger texture alone. One upload per piece let a busy page take a frame per texture
   * (staging runs at least one piece a frame, more only within STAGE_BUDGET_MS).
   */
  _texPieces(keys, half) {
    const glr = this.glr, r = this.renderer, out = [];
    let some = [], px = 0;
    const flush = () => {
      if (!some.length) return;
      const ks = some;
      out.push(() => { if (!this.lost && glr) for (const k of ks) { try { glr.texture(k, half); } catch { /* at its first draw */ } finally { resetPixi(r); } } return true; });
      some = []; px = 0;
    };
    for (const k of keys) {
      const im = this.lib.images.get(`${k}|${half ? 1 : 0}`)?.image;
      const n = im ? (im.width || 1) * (im.height || 1) : UPLOAD_PIECE_PX;
      if (px && px + n > UPLOAD_PIECE_PX) flush();
      some.push(k); px += n;
    }
    flush();
    return out;
  }

  /**
   * Warm-up runs, once per illustration before its cards report ready, on a throwaway slot of it: WARM_STEPS real
   * steps, each drawn offscreen by the next frame, Idle first and from WARM_SPECIAL_AT into the special idle (Spine's
   * mix: computeHold, then applyMixingFrom every step of the mix; the action particle set switched on and built); then
   * the slot is destroyed. One step per staging piece and per frame. The code a live card runs every frame then is
   * already optimised: on a cold page the first frames after the switch took 36–51 ms and the first special idles'
   * mix 35–71 ms, running the same functions as a 8–10 ms steady frame [src: notes dev50-l2d-perf-report.md §Warm
   * before ready; dev55-special-idle-freeze.md]. The cards' own slots are not touched: their timing stays official.
   */
  _warmSpecial(prep, key, w, h) {
    if (prep.specialWarm) return prep.specialWarm;
    let t = null, n = 0, waited = 0;
    const live = () => t && !this.lost;
    prep.specialWarm = this._enqueue([
      () => {
        if (this.lost || !this.renderer) return true;
        t = new Slot(this, `${key}|warm`, key, prep, w, h);
        t.temp = true;
        t.resume();
        // its prewarms are not needed: those systems start empty
        setPrewarmSink((sys) => sys.clear());
        try { t.step(0); } finally { setPrewarmSink(null); }
        return true;
      },
      () => {
        if (!live()) return true;
        // the last step's draw first (a frame's _draw takes it out of _warming); given up if it never comes
        if (this._warming.has(t)) return ++waited >= STAGE_SIZE_FRAMES;
        if (n >= WARM_STEPS) return true;
        if (n === WARM_SPECIAL_AT) t.inst.changeAction(ACTION.SPECIAL_IDLE, 1);
        t.step(1 / 60);
        n++; waited = 0;
        this._warming.add(t);
        return false;
      },
      () => { if (t) { this._warming.delete(t); t.destroy(); t = null; } return true; },
    ]);
    return prep.specialWarm;
  }

  /** One card's special idle start per stage frame (state.js mayStartSpecial): true for the first to ask in a frame. */
  _specialTurn() {
    if (this._specialFrame === this.frameNo) return false;
    this._specialFrame = this.frameNo;
    return true;
  }

  /** Queue staging pieces; settles once the last of them is done. */
  _enqueue(pieces) {
    if (!pieces.length) return Promise.resolve();
    return new Promise((resolve) => {
      const last = pieces[pieces.length - 1];
      this._jobs.push(...pieces.slice(0, -1), () => { const done = last(); if (done) resolve(); return done; });
      this._kick();
    });
  }

  /**
   * Run staging pieces after this frame's own work while the frame has used less than STAGE_BUDGET_MS (at least one
   * piece a frame). A piece that is not done yet (waiting for a layout size, a shader build) goes to the back.
   */
  _runJobs(frameStart) {
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    let ran = 0;
    for (let n = this._jobs.length; n > 0 && this._jobs.length; n--) {
      if (ran && now() - frameStart >= STAGE_BUDGET_MS) break;
      const job = this._jobs.shift();
      let done = true;
      try { done = job() !== false; } catch (err) { console.warn('[dynillust] staging', err); }
      if (!done) this._jobs.push(job);
      ran++;
    }
  }

  /**
   * (fork) Its downloads now (render/dynillust/progress.js): `open` responses still arriving, `received` bytes and
   * `moves` (headers and chunks) so far. The room's stall check reads it (ui/dynCards.js).
   */
  netState() { return { open: this.net.open, received: this.net.received, moves: this.net.moves }; }

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

  /**
   * A card showing `key` (docs/design/vfx-format.md §33.19 Mount API). In a Worker (render/dynillust/worker.js) `o`
   * also gives the card's `canvas` (an OffscreenCanvas the page transferred), `box` (its size in device px, kept
   * current by the page) and `onOpacity` (the late fade, applied by the page to its canvas element).
   */
  mount(key, o = {}) {
    const card = new Card(this, key, o);
    this.cards.add(card);
    return card;
  }

  _unmount(card) {
    this.cards.delete(card);
    if (this.io && card.canvas) { try { this.io.unobserve(card.canvas); } catch { /* gone */ } }
    if (card.slot) { card.slot.cards.delete(card); if (!card.slot.cards.size) this._dropSlot(card.slot); card.slot = null; }
    // the last card of a tier the stage no longer uses: that tier's cache goes (_freeTier)
    if (card.tier && card.tier !== this._quality) this._freeTier(card.tier);
  }

  _dropSlot(slot) { this._warming.delete(slot); this.slots.delete(slot.id); slot.destroy(); }

  /** Put `card` on the slot of its key at w × h (built when none yet), leaving its old one; the slot, or null at 0 size. */
  _attach(card, prep, w, h) {
    card.w = w; card.h = h;
    if (card.slot) { card.slot.cards.delete(card); if (!card.slot.cards.size) this._dropSlot(card.slot); card.slot = null; }
    if (!(w > 0 && h > 0)) return null;
    // (a card framed another way — the home screen's — draws its own slot)
    const id = `${card.key}|${this.quality}|${w}x${h}|${card.frameId}`;
    let slot = this.slots.get(id);
    if (!slot) { slot = new Slot(this, id, card.key, prep, w, h, card.frame); this.slots.set(id, slot); }
    slot.cards.add(card);
    card.slot = slot;
    card.canvas.width = w; card.canvas.height = h;
    return slot;
  }

  _kick() {
    if (this._raf || this.destroyed || (!this.cards.size && !this._jobs.length)) return;
    const raf = this.opts.raf || requestAnimationFrame;
    this._raf = raf((t) => this._frame(t));
  }

  _frame(t) {
    this._raf = 0;
    if (this.destroyed || (!this.cards.size && !this._jobs.length)) { this.last = 0; return; }
    if (this._hidden()) { for (const s of this.slots.values()) s.pause(); this.last = 0; this._capAt = 0; return; }
    const frameStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // `maxFps`: the cards update and draw at most this often, as the official game caps its own frame rate (doc
    // §33.19 Workers). A display frame closer than one interval (less half a display frame) to the last drawn one is
    // skipped; the next drawn one steps by the real time since, so timing stays in real seconds. Staging still runs.
    const capMs = this.opts.maxFps > 0 ? 1000 / this.opts.maxFps : 0;
    if (capMs) {
      const disp = this._rafT ? Math.min(t - this._rafT, capMs) : 0;
      this._rafT = t;
      if (this._capAt && t - this._capAt < capMs - disp / 2) {
        if (this._jobs.length) this._runJobs(frameStart);
        this._kick();
        return;
      }
      // keep the cadence (the next one interval after this one), unless a long frame left it behind
      this._capAt = this._capAt && t - this._capAt < 2 * capMs ? this._capAt + capMs : t;
    }
    const now = this.opts.now ? this.opts.now() : t;
    const dt = this.last ? Math.max(0, (now - this.last) / 1000) : 0;
    this.last = now;
    this.time += dt;
    this.frameNo++;
    for (const c of this.cards) c.sync(dt);
    const live = [], warm = [];
    for (const slot of this.slots.values()) {
      let any = false;
      for (const c of slot.cards) if (c.drawing) { any = true; break; }
      if (!any) {
        // a staged slot waits enabled and posed (its prewarm done) until its card shows; drawn once to warm up
        if (slot.held) { if (this._warming.has(slot)) warm.push(slot); continue; }
        slot.pause();
        continue;
      }
      slot.held = false;
      this._warming.delete(slot);
      slot.resume();
      slot.step(dt);
      live.push(slot);
    }
    for (const s of this._warming) if (s.temp) warm.push(s);   // a throwaway slot of _warmSpecial
    if ((live.length || warm.length) && this._ensureGL() && !this.lost) {
      this._draw(live.concat(warm));
      for (const s of warm) { if (s.x >= 0) { s.warmed = true; this._warming.delete(s); } }
    }
    if (this._jobs.length) this._runJobs(frameStart);
    this._kick();
  }

  /** Rows of slots, tallest first, in the stage canvas (MAX_CANVAS): sets each slot's x, y (−1: no room); [W, H]. */
  _pack(list) {
    list.sort((a, b) => b.h - a.h);
    let x = 0, y = 0, rowH = 0, W = 0, H = 0;
    for (const s of list) {
      if (x + s.w > MAX_CANVAS) { x = 0; y += rowH; rowH = 0; }
      if (y + s.h > MAX_CANVAS) { s.x = -1; continue; }
      s.x = x; s.y = y; x += s.w; rowH = Math.max(rowH, s.h);
      W = Math.max(W, x); H = Math.max(H, y + rowH);
    }
    return [W, H];
  }

  /**
   * Grow the stage canvas to hold every slot that has cards, live or staged, before a card reports ready: it grew at
   * the first frame with all the page's cards live, one of that frame's costs [src: notes dev55-renderer-flip-trace.md
   * §2]. Positions are set again by each frame's _draw.
   */
  _fitCanvas() {
    const r = this.renderer;
    if (!r || this.lost) return;
    const [W, H] = this._pack([...this.slots.values()].filter((s) => s.cards.size));
    if (W > r.width || H > r.height) { r.resize(Math.max(W, r.width), Math.max(H, r.height)); resetPixi(r); }
  }

  /** Pack the live slots, draw them, copy each into its cards' canvases. */
  _draw(live) {
    const [W, H] = this._pack(live);
    const r = this.renderer;
    if (W > r.width || H > r.height) r.resize(Math.max(W, r.width), Math.max(H, r.height));
    const CW = r.width, CH = r.height;
    this.fd.reset();
    for (const s of live) if (s.x >= 0) s.prepare(this, CW, CH);
    if (this.glr) this.glr.upload(this.fd);
    // the GPU skeletons' per-frame uploads (bones, colours, deforms, draw order), then Pixi's GL caches are stale
    for (const s of live) if (s.x >= 0) s.skel.upload();
    resetPixi(r);
    this.stage.removeChildren();
    for (const s of live) if (s.x >= 0) { s.root.position.set(s.x, s.y); this.stage.addChild(s.root); }
    r.render(this.stage, { clear: true });
    // a staged slot's warm-up draw copies too, into its still hidden cards: their first copy (the 2D canvas's own
    // first draw) is then not part of the first live frame
    for (const s of live) if (s.x >= 0) { const warm = this._warming.has(s); for (const c of s.cards) c.blit(this.canvas, s, warm); }
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
      if (it.skelPart) {
        flush();
        if (it.skelPart.enabled) {
          if (slot.skel.gpu) { renderer.batch.flush(); slot.skel.renderPart(renderer, it.skelPart); resetPixi(renderer); }
          else slot.skel.renderPart(renderer, it.skelPart);
        }
        renderer.batch.flush();
        continue;
      }
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
    this.box = Array.isArray(o.box) ? o.box : null;   // [w, h] device px from the page (Worker), else measured here
    this.tier = S.quality;                             // the tier its illustration loads at (DynIllustStage._freeTier)
    // framing: 'card' (the official end-screen card, default) or 'home' (the official home screen), or
    // { mode, centre, zoom, fx, fy }: a zoom about a point of the card inside its own canvas (framing.js cardFraming)
    this.frame = cardFraming(o.framing, o.centre);
    this.frameId = this.frame.id;
    this.onOpacity = typeof o.onOpacity === 'function' ? o.onOpacity : null;
    this.canvas = o.canvas || (typeof document !== 'undefined' ? document.createElement('canvas') : null);
    if (this.canvas) {
      this.canvas.width = 1; this.canvas.height = 1;
      this.ctx = this.canvas.getContext('2d');
      if (this.canvas.style) {
        // a page element (not a Worker's OffscreenCanvas)
        this.canvas.className = 'dynillust-canvas';
        this.canvas.__dynCard = this;
        if (S.io) S.io.observe(this.canvas);
      }
      this._opacity(0);
    }
    this.ready = S._prepare(key).then((prep) => this._stage(prep)).then((prep) => {
      if (this.state === 'unmounted') return false;
      this.prep = prep;
      if (this.started) { this.fade = 0; S._kick(); }   // D11: the late card fades in
      else this._set('ready');
      return true;
    }, () => { if (this.state !== 'unmounted') this._set('failed'); return false; });
  }

  /** The canvas's CSS box in device px (capped at MAX_DPR): [w, h]; in a Worker, the size the page sent. */
  _measure() {
    if (this.box || !this.canvas.getBoundingClientRect) return this.box || [0, 0];
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, Math.max(1, globalThis.devicePixelRatio || 1));
    return [Math.round(r.width * dpr), Math.round(r.height * dpr)];
  }

  /**
   * Build and warm this card's slot before the card reports 'ready' (STAGE_BUDGET_MS pieces): wait for a layout size,
   * build the slot, enable it and take its first step (the particle prewarm), draw it once offscreen, wait for its
   * shaders. Resolves to `prep`. Without a canvas, while the context is lost, or with no size after STAGE_SIZE_FRAMES
   * frames, it resolves at once and the slot builds at its first draw, as before. A stage whose renderer cannot start
   * (no WebGL, or a Pixi that needs eval under the site's CSP) rejects: the card is 'failed' and keeps its 2D art,
   * instead of a 'live' card that never draws.
   */
  _stage(prep) {
    const S = this.S;
    if (!this.canvas || S.lost || this.state === 'unmounted') return prep;
    if (!S._ensureGL()) throw new Error('the illustration renderer did not start');
    let waited = 0, slot = null;
    const progsReady = () => !S.glr || (prep.progs || []).every(([kind, mat]) => { S.glr.program(kind, mat); return !S.glr.building(kind, mat); });
    const prewarms = [];   // particle systems whose prewarm waits for the slices below (psys.js setPrewarmSink)
    const clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    return S._enqueue([
      () => {
        if (this.state === 'unmounted') return true;
        const [w, h] = this._measure();
        if (w > 0 && h > 0) { slot = S._attach(this, prep, w, h); return true; }
        return ++waited >= STAGE_SIZE_FRAMES;
      },
      () => {
        // the first step: OnEnable (Idle), the effects switched on; their prewarms wait for the next piece
        if (slot && !slot.held && !slot.warmed && slot.paused) {
          slot.resume();
          // (`slicePrewarm: false`: each prewarm in one go, for checks that compare the two)
          if (S.opts.slicePrewarm !== false) setPrewarmSink((sys) => prewarms.push(sys));
          try { slot.step(0); } finally { setPrewarmSink(null); }
          slot.held = true;
        }
        return true;
      },
      () => {
        // the prewarms, PREWARM_SLICE_MS at a time (the same steps as one loop: psys.js prewarmStep), then the warm-up
        // draw. A slot stepped meanwhile (another card of it went live) finishes them itself (PSys.update).
        if (!slot || this.state === 'unmounted') return true;
        const t0 = clock();
        while (prewarms.length) {
          const left = PREWARM_SLICE_MS - (clock() - t0);
          if (left <= 0) return false;
          if (!prewarms[0].prewarmStep(left)) return false;
          prewarms.shift();
        }
        if (slot.held) { S._fitCanvas(); S._warming.add(slot); }
        return true;
      },
      // drawn once (the next frame's _draw), and every shader built
      () => !slot || this.state === 'unmounted' || !slot.held || (slot.warmed && progsReady()),
      () => {
        // one real step and a second warm-up draw: the first step with time in it (the animation's, the particles')
        // was the costliest part of the first live frame [src: notes dev55-renderer-flip-trace.md §2]. The card then
        // starts STAGE_STEP_S into its idle.
        if (slot && slot.held && this.state !== 'unmounted') { slot.step(STAGE_STEP_S); slot.warmed = false; S._warming.add(slot); }
        return true;
      },
      () => !slot || this.state === 'unmounted' || !slot.held || slot.warmed,
    ]).then(() => (slot && this.state !== 'unmounted' ? S._warmSpecial(prep, this.key, slot.w, slot.h) : null)).then(() => prep);
  }

  /** The canvas's opacity: on the element here, or through the page (onOpacity) for a Worker's card. */
  _opacity(a) {
    if (this.canvas && this.canvas.style) this.canvas.style.opacity = String(a);
    else if (this.onOpacity) this.onOpacity(a);
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
      if (this.canvas) this._opacity(1);
      this._set('live');
      this.S._kick();
    }
  }

  /**
   * Change the framing of a mounted card (mount's `framing` / `centre`, framing.js cardFraming) without a remount: a
   * slot only this card draws is moved in place (Slot.reframe), so the animation, its effects and the special-idle
   * timer go on, with no staging, restart or fade. A slot other cards share, or a framing another card of this key
   * already shows, is left: the card moves to the slot of its new framing at its next frame (sync → _attach).
   */
  setFraming(framing, centre) {
    if (this.state === 'unmounted') return;
    const f = cardFraming(framing, centre);
    if (f.id === this.frameId) return;
    this.frame = f;
    this.frameId = f.id;
    const S = this.S, s = this.slot;
    if (s && s.cards.size === 1 && s.cards.has(this)) {
      const id = `${this.key}|${s.id.split('|')[1]}|${s.w}x${s.h}|${f.id}`;
      if (!S.slots.has(id)) {
        S.slots.delete(s.id);
        s.id = id;
        s.reframe(f);
        S.slots.set(id, s);
      }
    }
    S._kick();
  }

  /** Drawn this frame: started, ready, in view, sized. */
  get drawing() { return this.started && !!this.prep && this.inView && this.w > 0 && this.h > 0 && this.state !== 'unmounted'; }

  /** Size from the canvas's CSS box; (re)attach to the slot of this size; advance the late fade. */
  sync(dt) {
    if (!this.prep || !this.canvas || this.state === 'unmounted') return;
    const [w, h] = this._measure();
    if (w !== this.w || h !== this.h || !this.slot || this.slot.frameId !== this.frameId) this.S._attach(this, this.prep, w, h);
    if (this.fade >= 0 && this.drawing) {
      this.fade += dt;
      const a = Math.min(1, this.fade / LATE_FADE_S);
      this._opacity(a);
      if (a >= 1) { this.fade = -1; this._set('live'); }
    }
  }

  /** `warm`: the staging's warm-up draw, into the canvas while it is still hidden (opacity 0 until start()). */
  blit(src, slot, warm = false) {
    if (!this.ctx || !(this.drawing || (warm && !this.started && this.state !== 'unmounted'))) return;
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
  /** `frame`: { mode: 'card' | 'home', centre, zoom, fx, fy } (Card.frame, framing.js cardFraming). */
  constructor(S, id, key, prep, w, h, frame = null) {
    this.S = S;
    this.id = id;
    this.key = key;
    this.cards = new Set();
    this.w = w; this.h = h;
    this.x = -1; this.y = -1;
    this.paused = true;
    this.held = false;    // staged (Card._stage): enabled and posed, waiting for its card to show
    this.warmed = false;  // drawn once offscreen
    this.time = 0;
    this.fxTime = 0;
    this.items = [];
    const P = S.P, d = prep.data, sk = d.skeleton;
    this.data = d;
    const look = sk.look;
    const make = S.spineFactory ? (sd) => S.spineFactory(P, sd, look) : null;
    // (`pruneTimelines: false`: keep the constant timelines, for checks that compare the two)
    this.skel = new IllustSkeleton(prep.spineData, { ...sk, makeSpine: make, prune: S.opts.pruneTimelines !== false });
    // GPU skinning (render/dynillust/gpuskin.js) on WebGL2; pixi-spine's CPU meshes otherwise (or with gpuSkin: false)
    if (S.opts.gpuSkin !== false && S.renderer && gpuSkinSupported(S.renderer.gl)) {
      try { this.skel.enableGpu(new GpuSkeleton(S.renderer, this.skel.spine, look)); } catch (err) { console.warn('[dynillust] GPU skinning off', err); }
    }
    // (`fxSeed`: one particle seed for every slot, for checks that compare two stages; random otherwise)
    this.fx = prep.fxDef ? new IllustEffects(prep.fxDef, { lib: S.lib, lite: false, ...d.effects, seed: S.opts.fxSeed }) : null;
    if (this.fx) this.fx.fx.place({ pos: d.root.pos });
    this.inst = new DynIllustInstance({ skel: this.skel, fx: this.fx, data: d.instance, now: () => this.time });
    this.card = new CardIllustState({ rng: S.opts.rng, onAction: S.opts.onAction ? (a) => S.opts.onAction(key, a) : null, mayStartSpecial: () => S._specialTurn() });
    this.reframe(frame);
    const sp = this.skel.spine;
    sp.render = (renderer) => S._renderSlot(renderer, this);
    this.root = new P.Container();
    const mask = new P.Graphics().beginFill(0xffffff).drawRect(0, 0, w, h).endFill();
    this.root.addChild(mask, sp);
    this.root.mask = mask;
    this.basis = illustBasis(d.framing.cameraSize, h);
    this.camU = this.basis.pos;
    this.zRoot = Number(d.root.pos[2]) || 0;
    // the skeleton plane's depth in cardViewProj's clip space (z / ZR) and its Spine material's ZTest / ZWrite (GPU path)
    this.skel.depth = prep.skelDepth ? { z: this.zRoot / ZR, test: prep.skelDepth.zTest, write: prep.skelDepth.zWrite } : null;
    this.vp = new Float32Array(16);
  }

  /**
   * Place the skeleton for `frame` (Card.frame): the framing map and the skeleton's position and scale. The effects
   * read the map each frame (prepare → cardViewProj), so a reframe moves everything at once; the animation, its
   * effects and their particles go on as they were (Card.setFraming).
   */
  reframe(frame = null) {
    const d = this.data;
    this.frameId = frame ? frame.id : null;
    this.map = framingMap(d.framing, this.w, this.h, frame);
    const pos = d.root.pos, rs = d.root.scale;
    const sp = this.skel.spine;
    sp.position.set(this.map.x0 + this.map.scale * pos[0], this.map.y0 - this.map.scale * pos[1]);
    // y flipped here: the skeleton is posed y-up, as spine-unity poses it (skeleton.js poseYUp)
    sp.scale.set(this.map.scale * this.skel.scale * rs[0], -this.map.scale * this.skel.scale * rs[1]);
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
    // (`S.debugHide`: 'skel' or 'fx' leaves that layer out, for checks of what draws a wrong picture; worker.js 'debug')
    const hide = S.debugHide;
    if (hide !== 'skel') for (const p of this.skel.parts) items.push({ skelPart: p, layer: p.layer, order: p.order, queue: p.queue, dist: this.zRoot - this.camU[2], seq: seq++ });
    if (this.fx && S.glr && hide !== 'fx') this.fx.gather(this.basis, (e) => { e.seq = seq++; items.push(e); });
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
    // the skeleton first: its GPU skinning data textures were left behind before (only the display was destroyed)
    try { this.skel.destroy(); } catch { /* ignore */ }
    try { this.root.destroy({ children: true }); } catch { /* ignore */ }
  }
}
