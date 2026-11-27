// render/dynillust/worker.js — one Worker that draws animated card illustrations off the page's main thread (the
// page side is render/dynillust/host.js; docs/design/vfx-format.md §33.19 Mount API, "Workers"). It runs the same
// stage as the main thread (renderer.js DynIllustStage): its own WebGL2 context on an OffscreenCanvas, its own
// requestAnimationFrame loop, the staging, GPU skinning and effect layer, and draws each card into the card's canvas,
// which the page transferred here (transferControlToOffscreen), so a card frame costs the page's main thread nothing.
//
// A classic Worker: the vendored Pixi and pixi-spine are UMD bundles that need globals (importScripts), and the
// renderer's ES modules come in through import(). Pixi's DOM adapter is replaced by an OffscreenCanvas one, and its
// two DOM plugins (accessibility: a <div>; the event system: pointer events) are removed: an offscreen stage has no
// use for either.
//
// Messages from the page (host.js): manifest, opts, quality, preload, mount (with the transferred canvas and the
// card's size), box, framing, view, start, unmount, release, hidden, act, frames, frameLog, diag, net. To the page: ok / fail
// (after boot), preloaded, state, ready, opacity, action, frameLog, diag, net (its downloads: DynIllustStage.netState), error.

/* global importScripts */
const post = (m) => self.postMessage(m);
const cards = new Map();      // id → Card
let stage = null;
let hidden = false;
let frames = null;            // [start, ms, live] per stage frame while the page asks (frames on)
let resolveManifest = null;
const manifest = new Promise((r) => { resolveManifest = r; });
let stageOpts = {};
const early = [];             // messages that came before the stage exists

function adapter() {
  return {
    createCanvas: (w, h) => new OffscreenCanvas(w || 1, h || 1),
    getCanvasRenderingContext2D: () => OffscreenCanvasRenderingContext2D,
    getWebGLRenderingContext: () => WebGLRenderingContext,
    getNavigator: () => self.navigator,
    getBaseUrl: () => self.location.href,
    getFontFaceSet: () => self.fonts || null,
    fetch: (url, o) => fetch(url, o),
    parseXML: () => { throw new Error('no XML in the illustration worker'); },
  };
}

/** A red square drawn with the stage's own renderer, read back: [r, g, b, a] of a pixel inside it. */
function drawProbe(P, r) {
  const g = new P.Graphics().beginFill(0xff0000).drawRect(0, 0, r.width, r.height).endFill();
  try {
    r.render(g, { clear: true });
    const gl = r.gl, px = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return Array.from(px);
  } finally { g.destroy(); }
}

let probePixel = null;

async function boot() {
  // WebGL2 on an OffscreenCanvas, or the page keeps its own stage (host.js falls back)
  const probe = new OffscreenCanvas(1, 1).getContext('webgl2');
  if (!probe) throw new Error('no WebGL2 in a Worker');
  probe.getExtension('WEBGL_lose_context')?.loseContext();
  self.window = self;   // the UMD bundles look for a window global
  importScripts(new URL('../../../vendor/pixi.min.js', self.location.href).href);
  const P = self.PIXI;
  P.settings.ADAPTER = adapter();
  for (const x of [P.AccessibilityManager, P.EventSystem]) if (x) { try { P.extensions.remove(x); } catch { /* not registered */ } }
  // the site's CSP has no 'unsafe-eval', and it applies here too: Pixi's shader uniforms without generated code, as
  // on the page (render/app/pixi.js installs the same patch); without it new P.Renderer throws
  const { installPixiNoEval } = await import('../app/pixiNoEval.js');
  installPixiNoEval(P);
  importScripts(new URL('../../../vendor/pixi-spine.js', self.location.href).href);
  const { DynIllustStage } = await import('./renderer.js');
  stage = new DynIllustStage({
    ...stageOpts,
    manifest: () => manifest,
    hidden: () => hidden,
    onAction: (key, a) => post({ t: 'action', key, a }),
  });
  // the stage must draw before the page hands it cards: its renderer starts, and a test square reads back red;
  // otherwise boot fails and the page draws the cards itself (host.js falls back to the main-thread stage)
  if (!stage._ensureGL()) throw new Error('the illustration renderer did not start in the Worker');
  const px = drawProbe(P, stage.renderer);
  if (!(px[0] > 200 && px[1] < 50 && px[3] > 200)) throw new Error(`the Worker renderer drew nothing (${px.join(', ')})`);
  probePixel = px;
  const run = stage._frame.bind(stage);
  stage._frame = (t) => {
    const t0 = performance.now(), n0 = stage.frameNo;
    try { return run(t); } finally {
      if (frames && frames.length < 20000) {
        let live = 0;
        for (const s of stage.slots.values()) if (!s.paused && !s.held) live++;
        // [start, ms, live slots, drawn: 1 / skipped by maxFps: 0]
        frames.push([+t0.toFixed(2), +(performance.now() - t0).toFixed(2), live, stage.frameNo !== n0 ? 1 : 0]);
      }
    }
  };
}

/** One card as the stage sees it (host.js diag). */
function diagCard(c) {
  const s = c.slot, r = (v) => Math.round(v * 1000) / 1000;
  return {
    key: c.key, state: c.state, started: c.started, inView: c.inView, box: c.box, wh: [c.w, c.h],
    canvas: c.canvas ? [c.canvas.width, c.canvas.height] : null,
    slot: s ? { w: s.w, h: s.h, x: s.x, y: s.y, scale: r(s.map.scale), x0: r(s.map.x0), y0: r(s.map.y0), held: s.held, warmed: s.warmed, paused: s.paused, gpu: !!s.skel.gpu, cards: s.cards.size } : null,
    pages: c.prep ? [...c.prep.pages.values()].map((t) => [t.width, t.height, t.realWidth, t.realHeight, !!t.valid, !!t.destroyed]) : null,
    // the effect nodes drawing particles now: [node, particles] (at most 60)
    fx: s && s.fx ? liveNodes(s.fx.fx) : null,
    // the card canvas's own pixels: mean |difference| of horizontal neighbours (green, every 4th row): a blurred copy is low
    sharp: sharpness(c),
    // the GPU skeleton's atlas pages: [ours (this card's prep), destroyed] per page
    skelPages: s && s.skel.gpu && c.prep ? s.skel.gpu.pages.map((bt) => [[...c.prep.pages.values()].includes(bt), !!bt.destroyed]) : null,
    // the slot was built from this card's prep (its data), and its id
    slotPrep: s && c.prep ? s.data === c.prep.data : null,    slotId: s ? s.id : null,
  };
}

function sharpness(c) {
  if (!c.ctx || !(c.w > 1 && c.h > 1)) return null;
  const d = c.ctx.getImageData(0, 0, c.w, c.h).data;
  let sum = 0, n = 0;
  for (let y = 0; y < c.h; y += 4) for (let x = 1; x < c.w; x++) { const o = (y * c.w + x) * 4; sum += Math.abs(d[o + 1] - d[o - 3]); n++; }
  return n ? Math.round(sum / n * 100) / 100 : null;
}

/** The stage's canvas and context state (host.js diag): sizes, resolution, sampler bindings, one atlas page's sampling. */
function diagStage() {
  const r = stage.renderer;
  if (!r) return null;
  const gl = r.gl, out = { r: [r.width, r.height], res: r.resolution, view: [r.view.width, r.view.height], screen: [r.screen.width, r.screen.height] };
  out.samplers = [];
  for (let u = 0; u < 8; u++) out.samplers.push(gl.getParameter ? (gl.activeTexture(gl.TEXTURE0 + u), !!gl.getParameter(gl.SAMPLER_BINDING)) : null);
  gl.activeTexture(gl.TEXTURE0);
  // the first card's first atlas page: its GL texture's filters and levels
  const c = [...cards.values()].find((x) => x.prep && x.prep.pages.size);
  const bt = c && [...c.prep.pages.values()][0];
  const g = bt && bt._glTextures && bt._glTextures[r.CONTEXT_UID];
  out.slots = [...stage.slots.values()].map((s) => [s.id, s.cards.size]);
  out.cache = [...stage.cache.keys()];
  // Pixi's asset cache: the skeleton entries it still holds
  try {
    const A = globalThis.PIXI.Assets, skel = (k) => /\.(skel|json|atlas)/.test(String(k));
    const m = A.cache._cache, pc = A.loader && A.loader.promiseCache, rc = A.resolver && (A.resolver._resolverHash || A.resolver._cache);
    out.assetSkel = {
      cache: m ? [...m.keys()].filter(skel).length : null,
      promise: pc ? Object.keys(pc).filter(skel).slice(0, 3) : null,
      resolver: rc ? Object.keys(rc).filter(skel).length : null,
      parsers: (A.loader && A.loader.parsers || []).map((p) => p.extension && p.extension.name || p.name).filter(Boolean).slice(0, 20),
    };
  } catch (e) { out.assetSkel = String(e); }
  out.pageGl = bt ? { has: !!g, dirty: g ? [g.dirtyId, bt.dirtyId] : null, valid: bt.valid, res: bt.resource && bt.resource.constructor && bt.resource.constructor.name, src: bt.resource && bt.resource.source ? [bt.resource.source.width, bt.resource.source.height] : null } : null;
  if (g) {
    gl.bindTexture(gl.TEXTURE_2D, g.texture);
    const P = (k) => gl.getTexParameter(gl.TEXTURE_2D, k);
    out.page = { key: c.key, size: [g.width, g.height], mip: g.mipmap, isTex: gl.isTexture(g.texture), min: P(gl.TEXTURE_MIN_FILTER), base: P(gl.TEXTURE_BASE_LEVEL), max: P(gl.TEXTURE_MAX_LEVEL) };
    // the texel at the page's centre (level 0), through a throwaway framebuffer
    const fb = gl.createFramebuffer(), px = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, g.texture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) { gl.readPixels(g.width >> 1, g.height >> 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.page.texel = [...px]; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
    gl.bindTexture(gl.TEXTURE_2D, null);
    r.texture.reset?.();
    r.framebuffer?.reset?.();
  }
  return out;
}

function liveNodes(e) {
  const out = [];
  for (let i = 0; i < e.def.n && out.length < 60; i++) { const sy = e.sys[i]; if (sy && e.hier[i] && sy.count > 0) out.push([i, sy.count]); }
  return out;
}

function handle(m) {
  switch (m.t) {
    case 'manifest': resolveManifest(m.data); stage.index(); break;
    case 'quality': stage.quality = m.q; break;
    case 'preload': stage.preload(m.keys).then(() => post({ t: 'preloaded', rid: m.rid })); break;
    case 'mount': {
      const c = stage.mount(m.key, {
        canvas: m.canvas,
        box: m.box || null,
        framing: m.framing,
        centre: m.centre,
        onState: (s) => post({ t: 'state', id: m.id, s }),
        onOpacity: (a) => post({ t: 'opacity', id: m.id, a }),
      });
      c.inView = m.view !== false;
      cards.set(m.id, c);
      c.ready.then((ok) => post({ t: 'ready', id: m.id, ok }));
      break;
    }
    case 'box': { const c = cards.get(m.id); if (c) { c.box = [m.w, m.h]; stage._kick(); } break; }
    case 'framing': cards.get(m.id)?.setFraming(m.framing, m.centre); break;
    case 'debug': stage.debugHide = m.hide || null; stage._kick(); break;
    case 'view': { const c = cards.get(m.id); if (c) { c.inView = !!m.v; stage._kick(); } break; }
    case 'start': cards.get(m.id)?.start(); break;
    case 'unmount': { const c = cards.get(m.id); cards.delete(m.id); c?.unmount(); break; }
    case 'release': stage.release(m.keep || []); break;
    case 'hidden': hidden = !!m.v; if (!hidden) stage._kick(); break;
    case 'act':
      // review pages only: every card plays its special idle / Start now (CardIllustState.playSpecial / playStart)
      for (const c of stage.cards) {
        const s = c.slot;
        if (!s?.card || !s.inst) continue;
        if (m.what === 'special') s.card.playSpecial(s.inst); else s.card.playStart(s.inst);
      }
      stage._kick();
      break;
    case 'frames': frames = m.on ? [] : null; break;
    case 'diag': post({ t: 'diag', rid: m.rid, gl: stage.renderer?.gl?.getError?.() ?? null, stage: diagStage(), cards: [...cards.values()].map(diagCard) }); break;
    case 'net': post({ t: 'net', rid: m.rid, ...stage.netState() }); break;
    case 'frameLog': post({ t: 'frameLog', rid: m.rid, origin: performance.timeOrigin, frames: frames || [] }); if (frames) frames = []; break;
    default: break;
  }
}

let booting = false;
self.onmessage = (e) => {
  const m = e.data || {};
  if (m.t === 'opts') {
    // the page's first message: the stage options; boot then
    if (booting) return;
    booting = true;
    stageOpts = m.opts || {};
    boot().then(() => {
      post({ t: 'ok', origin: performance.timeOrigin, probe: probePixel });
      for (const x of early.splice(0)) handle(x);
    }, (err) => post({ t: 'fail', message: String(err?.message || err) }));
    return;
  }
  if (stage) handle(m); else early.push(m);
};
self.addEventListener('error', (e) => post({ t: 'error', message: String(e.message || e) }));
self.addEventListener('unhandledrejection', (e) => post({ t: 'error', message: String(e.reason?.message || e.reason) }));
