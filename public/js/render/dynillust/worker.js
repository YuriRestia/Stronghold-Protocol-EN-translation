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
// card's size), box, view, start, unmount, release, hidden, act, frames, frameLog, diag. To the page: ok / fail (after
// boot), preloaded, state, ready, opacity, action, frameLog, diag, error.

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
  };
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
    case 'diag': post({ t: 'diag', rid: m.rid, gl: stage.renderer?.gl?.getError?.() ?? null, cards: [...cards.values()].map(diagCard) }); break;
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
