// render/dynillust/loader.js — one extracted dynamic illustration (docs/design/vfx-format.md §33.19) from its
// illust.json to what the renderer draws: the Spine skeleton data over its own atlas (pages uploaded raw, alphaMode
// PMA; a half page at resolution 0.5 so the atlas's full-size coordinates still apply), and the effect layer's
// compiled descriptor (fx.json) whose textures and meshes join the stage's effect library.
//
// Every file URL is hashedPath('/assets/local/dynillust/<dir>/' + rel, files[rel].hash) (shared/assetPaths.js): each
// file sits under its own hash segment, so the atlas and its pages are loaded here, never looked up by pixi-spine next
// to the skeleton.

// (the repo's shared/ in Node; the browser's /shared/: a URL cannot climb above the root)
import { hashedPath, splitHashedPath } from '../../../../shared/assetPaths.js';
import { compileEffect } from '../vfx/effect.js';

/** The folder of an illust.json URL (its hash segment dropped): '/assets/local/dynillust/<dir>/'. */
export function illustDir(illustUrl) {
  const p = splitHashedPath(String(illustUrl || '')).path;
  return p.slice(0, p.lastIndexOf('/') + 1);
}

/** The served URL of file `rel` of an illustration (its own hash segment). */
export function fileUrl(dir, entry, rel) {
  const f = entry?.files?.[rel];
  return hashedPath(dir + rel, f && f.hash);
}

/** DynIllustAction names of the index → numbers (render/dynillust/state.js ACTION). */
export const ACTION_IDS = Object.freeze({ IDLE: 0, SPECIAL_IDLE: 1, START: 2, INTERACTION: 3 });

async function okFetch(fetchFn, url, kind) {
  const res = await fetchFn(url);
  if (!res || !res.ok) throw new Error(`dynillust ${res ? res.status : 'no response'} ${url}`);
  return kind === 'json' ? res.json() : kind === 'text' ? res.text() : kind === 'blob' ? res.blob() : res.arrayBuffer();
}

async function pageTexture(P, fetchFn, url, half) {
  const blob = await okFetch(fetchFn, url, 'blob');
  const img = typeof createImageBitmap === 'function'
    ? await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    : await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = URL.createObjectURL(blob); });
  // raw upload: the Spine shader applies the material's keywords (_USEBLEED_ON: rgb × a) itself [src: doc §33.19 Files].
  // Mipmaps ON: Pixi's default (POW2) builds none for a page whose sides are not powers of two (most are: 2008, 4016),
  // so a card sampled such a page far below its size with no smaller level — the jagged edges at card size; WebGL2
  // builds mipmaps at any size and Pixi then samples them trilinearly [src: public/vendor/pixi.min.js
  // TextureSystem.updateTextureStyle: `mipmap === POW2 && !isPowerOfTwo → no mipmap`]. A third more GPU memory per page.
  return new P.BaseTexture(img, { alphaMode: P.ALPHA_MODES.PMA, resolution: half ? 0.5 : 1, mipmap: P.MIPMAP_MODES.ON });
}

/**
 * Pixi's Assets forgets skeleton `url`: its parse (cache), its load promise, and the resolver's entries. The resolver's
 * asset (`_assetMap`) holds the request's `data`, this load's atlas, and Assets.load only registers an asset whose alias
 * is new (`resolver.hasKey(alias) || this.add(o)`), so the next load of the URL — a key released, then shown again —
 * parsed the skeleton against the first load's atlas, whose pages release() had destroyed: it drew black (Dev 52,
 * 2026-11-23: a whole Grand Alliance page after Next then Prev) [src: public/vendor/pixi.min.js Assets.load, Resolver.add
 * `this._assetMap[y] = g`, Resolver.resolve `_resolverHash`].
 */
function forgetSkeleton(P, url) {
  const A = P.Assets;
  if (!A) return;
  const keys = [url];
  if (globalThis.location) keys.push(new URL(url, globalThis.location.href).href);
  try { A.cache.remove(url); } catch { /* not cached */ }
  // the loader keys its promises by the absolute URL
  try { const pc = A.loader && A.loader.promiseCache; if (pc) for (const k of keys) delete pc[k]; } catch { /* no promise cache */ }
  try {
    const r = A.resolver;
    for (const k of keys) { if (r && r._assetMap) delete r._assetMap[k]; if (r && r._resolverHash) delete r._resolverHash[k]; }
  } catch { /* no resolver maps */ }
}

/**
 * An illustration's load groups (illust.json `load` [src: doc §33.19 Load]): the group of an effect texture, mesh or
 * node, and `never`, the groups a card never plays (START, INTERACTION). Without `load`, everything is IDLE.
 */
export function loadGroups(entry) {
  const L = (entry && entry.load) || {};
  const tex = L.textures || {}, mesh = L.meshes || {}, nodes = Array.isArray(L.nodes) ? L.nodes : [];
  return {
    never: new Set(Array.isArray(L.cardNever) ? L.cardNever : []),
    texture: (k) => tex[k] || 'IDLE',
    mesh: (k) => mesh[k] || 'IDLE',
    node: (i) => nodes[i] || 'IDLE',
  };
}

/**
 * Load illustration `illustUrl` (the manifest's path). `lib`: the stage's FxLibrary (its file list gets this
 * illustration's textures and meshes). Returns { entry, dir, spineData, pages, fxDef }.
 * @param {{ P?: any, fetch?: typeof fetch, lib?: any, half?: boolean, texInfo?: Record<string, any> }} o
 */
export async function loadIllust(illustUrl, o = {}) {
  const P = o.P || globalThis.PIXI;
  const fetchFn = o.fetch || fetch.bind(globalThis);
  const entry = await okFetch(fetchFn, illustUrl, 'json');
  if (!entry || entry.format !== 'dynillust' || !entry.spine) throw new Error('not a dynillust index ' + illustUrl);
  const dir = illustDir(illustUrl);
  const sp = entry.spine;
  // atlas pages by the client's page name
  const pages = new Map();
  await Promise.all((sp.pages || []).map(async (pg) => {
    const rel = o.half && pg.half ? pg.half : pg.file;
    pages.set(pg.name, await pageTexture(P, fetchFn, fileUrl(dir, entry, rel), !!(o.half && pg.half)));
  }));
  const atlasText = await okFetch(fetchFn, fileUrl(dir, entry, sp.atlas), 'text');
  // pixi-spine divides every region's atlas coordinates by its page's `resolution` (atlas pixels = the texture's real
  // pixels) [src: public/vendor/pixi-spine.js TextureAtlas region parse: `g = baseTexture.resolution; s.x /= g, …`];
  // our atlas keeps the full-size coordinates, which a half page's logical size (resolution 0.5) already matches, so
  // it parses with 1 (the logical size kept), then the page gets its 0.5 back. Without it every half frame lands twice
  // as far and no half card draws.
  const halfPages = [...pages.values()].filter((t) => t.resolution !== 1);
  for (const t of halfPages) t._dynRes = t.resolution, t.resolution = 1;
  const restore = () => { for (const t of halfPages) { t.resolution = t._dynRes; delete t._dynRes; } };
  const atlas = await new Promise((resolve, reject) => {
    const a = new P.spine.TextureAtlas(atlasText, (name, cb) => {
      const t = pages.get(name);
      if (!t) { reject(new Error('dynillust atlas page missing: ' + name)); return; }
      cb(t);
    }, (done) => (done ? resolve(done) : reject(new Error('dynillust atlas failed'))));
    if (a && a.pages && a.pages.length && a.pages.every((p) => p.baseTexture)) resolve(a);
  }).finally(restore);
  // Pixi's Assets keeps a parse under its URL, and a parse belongs to these page textures (release() destroys them; the
  // other tier has its own): the half tier asks under its own URL (no second download unless a page switches tiers),
  // and the entry is dropped once loaded, so the next prepare parses again from the browser's HTTP cache
  const skelUrl = fileUrl(dir, entry, sp.skeleton) + (o.half ? '?tier=half' : '');
  let res;
  forgetSkeleton(P, skelUrl);
  try { res = await P.Assets.load({ src: skelUrl, data: { spineAtlas: atlas } }); } finally { forgetSkeleton(P, skelUrl); }
  const spineData = res && (res.spineData || res);
  if (!spineData || !spineData.animations) throw new Error('dynillust skeleton failed ' + sp.skeleton);
  // the effect layer: its files join the library's list, then the descriptor compiles against it
  let fxDef = null, skelDepth = null;
  if (o.lib && entry.fx && entry.fx.file) {
    const lib = o.lib;
    await lib.init();
    const g = lib.groups || (lib.groups = { fx: {}, 'fx/prefabs': {}, 'fx/tex': {}, 'fx/mesh': {} });
    for (const [k, t] of Object.entries(entry.fx.textures || {})) {
      g['fx/tex'][k] = { path: fileUrl(dir, entry, t.file), half: t.half ? fileUrl(dir, entry, t.half) : undefined };
      if (o.texInfo) o.texInfo[k] = t;   // wrap / filter / mips (§33.8), what the library's textures.json gives battle effects
    }
    for (const [k, m] of Object.entries(entry.fx.meshes || {})) g['fx/mesh'][k] = { path: fileUrl(dir, entry, m.file) };
    const desc = await okFetch(fetchFn, fileUrl(dir, entry, entry.fx.file), 'json');
    // a card never plays START or INTERACTION: their meshes stay unloaded (their nodes are never switched on). The
    // special idle's meshes load now: the compile reads a particle system's emitter mesh.
    const groups = loadGroups(entry);
    const meshes = (desc.meshes || []).filter((m) => !groups.never.has(groups.mesh(m)));
    await Promise.all(meshes.map((m) => lib.loadMesh(m, entry.key || illustUrl))); // owner: library.js _limit
    fxDef = compileEffect(desc, lib);
    skelDepth = spineDepth(desc, sp);
    // node 0 is the skeleton's node and the separator parts are its renderers: drawn from `spine`, never as effects
    const own = new Set([0, ...((sp.separator && sp.separator.parts) || []), ...((sp.renderers || []).map((r) => r.node))]);
    for (const n of own) for (const list of [fxDef.mesh, fxDef.skinned, fxDef.psr, fxDef.trail, fxDef.line]) if (list && n < list.length) list[n] = null;
  }
  return { entry, dir, spineData, pages, fxDef, skelDepth };
}

/**
 * The skeleton material's depth state, { zTest, zWrite } (fx.json pass names), or null: its atlas material's first
 * pass (`spine.look.material.index`, else `spine.materials[0]`, an index into fx.json `materials`). All 98: ZTest
 * LessEqual, ZWrite Off [src: official fx.json materials of each illustration's spine.materials, passes[0]].
 */
export function spineDepth(desc, sp) {
  const i = Number.isInteger(sp?.look?.material?.index) ? sp.look.material.index : sp?.materials?.[0];
  const pass = Number.isInteger(i) ? desc?.materials?.[i]?.passes?.[0] : null;
  return pass && pass.zTest ? { zTest: pass.zTest, zWrite: !!pass.zWrite } : null;
}

/** The renderer's entry fields from an illust.json (render/dynillust/renderer.js Slot). */
export function slotData(entry) {
  const sp = entry.spine || {}, fr = entry.framing || {}, ac = entry.actions || {};
  const adj = fr.adjust || {};
  const pick = (a) => (a ? [a.offset?.[0] || 0, a.offset?.[1] || 0, a.size?.[0] || 0, a.size?.[1] || 0] : null);
  const rend = Array.isArray(sp.renderers) ? sp.renderers : [];
  const partRend = rend.filter((r) => Number.isInteger(r.part)).sort((a, b) => a.part - b.part);
  const queueOf = (q) => (Number.isFinite(q) ? q : q === 'Transparent' || q == null ? 3000 : Number(q) || 3000);
  const toR = (r) => ({ layer: Number(r.sortingLayer) || 0, order: Number(r.sortingOrder) || 0, queue: queueOf(r.queue), enabled: r.enabled !== false });
  const root = rend.find((r) => r.part == null);
  return {
    framing: { cameraSize: fr.cameraSize, maxSize: fr.maxSize, adjust: [pick(adj.DEFAULT), pick(adj.SKIN), pick(adj.HOME_PAGE)] },
    root: { pos: fr.root?.pos || [0, 0, 0], scale: fr.root?.scale || [1, 1, 1] },
    skeleton: {
      scale: sp.scale, skin: sp.skin || '', defaultMix: sp.mix?.default || 0, mixes: sp.mix?.pairs || [],
      separators: sp.separator ? sp.separator.slots || [] : [],
      parts: sp.separator && partRend.length ? partRend.map(toR) : undefined,
      renderer: root ? toR(root) : undefined,
      look: sp.look || null,
    },
    instance: {
      fixFxDelay: ac.fixFxDelay !== false, animTimeFixed: !!ac.animTimeFixed,
      extraTracks: (ac.extraTracks || []).map((e) => ({ track: e.track, name: e.animation })),
      particles: (ac.particles || []).map((p) => ({ action: ACTION_IDS[p.action] ?? -1, node: p.node })).filter((p) => p.action >= 0 && Number.isInteger(p.node)),
    },
    effects: {
      followers: (sp.followers || []).map((f) => ({ node: f.node, bone: f.bone, xy: f.xy, z: f.z, rot: f.rotation, scale: f.localScale, applied: f.appliedLocalScale })),
      animators: ac.animators || [],
    },
  };
}
