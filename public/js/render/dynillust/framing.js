// render/dynillust/framing.js — where an official dynamic illustration sits on a card (pure math, no Pixi).
//
// The official end-of-match card shows each illustration through its own orthographic camera: the illustration's
// `_cameraSize` (half the view height in Unity units) fills a render texture that the card's RawImage shows at the
// DEFAULT adjust's size and offset, inside the card's illustration holder.
//
//   Which adjust: DEFAULT. Every view the manager creates applies ApplyAdjust(DEFAULT); only ApplySkinOffset (never
//   called by the end-screen card) applies SKIN [src: official GameAssembly.dll DynIllustMgr._CreateIllustView
//   0x14463BF (edx = 0); UICharacterDynIllust.ApplySkinOffset 0x1492685; card _RenderIllust 0x28E17E9–0x28E1815].
//   Card art window 232 × 458 UI px, centred, holder `root` at (0, −39) from its centre, scale 0.73 [src: official
//   [uc]autochessouter.ab auto_chess_settle_game_player_item group_char, root].
//   Our art windows differ in shape from the official one and change with the screen (Grand Alliance at 1546 × 905:
//   280 × 256 CSS px, at 3840 × 2160: 245 × 594), so a card CONTAINS the official window: the largest 232 × 458 box
//   that fits, centred; a slot of another shape only adds art around it [src: notes dev49-l2d-review-findings.md §1,
//   §4 (measured on the review page, device=pc)].
//
// unityToCard() is the whole mapping from the illustration's Unity frame (the prefab root's parent space: the root at
// its authored position, y up) to card pixels (y down). The skeleton, every effect and the background share it.

/** Official card art width in UI px [src: official [uc]autochessouter.ab auto_chess_settle_game_player_item group_char]. */
export const CARD_UI_W = 232;
/** Official card art height in UI px [src: same prefab, group_char]. */
export const CARD_UI_H = 458;
/** Illustration holder offset and scale on the card [src: same prefab, `root` (0, −39) scale 0.73]. */
export const HOLDER_Y = -39;
export const HOLDER_SCALE = 0.73;
/** UI px from the card's top edge to the holder's anchor, the window centre (458 / 2) [src: official
 * [uc]autochessouter.ab group_char (centred), root; notes dev49-l2d-review-findings.md §1 — was 233, calibrated]. */
export const CARD_TOP = CARD_UI_H / 2;
/** DynIllustAdjustType [src: official dump.cs DynIllustAdjustType]. */
export const ADJUST = Object.freeze({ DEFAULT: 0, SKIN: 1, HOME_PAGE: 2 });

/**
 * The linear map Unity frame → card px for a card of `w` × `h` CSS px. `f` is the illustration's framing:
 * { cameraSize, adjust: [[ox, oy, sx, sy], …] (DynIllust._adjustes as offset + size), type?: ADJUST }.
 * Returns { scale, x0, y0 }: px = x0 + scale · X, py = y0 − scale · Y.
 */
export function unityToCard(f, w, h) {
  const adj = pickAdjust(f, f.type ?? ADJUST.DEFAULT);
  // UI px → card px: the official window contained in the card, centred (see the header)
  const u = Math.min(w / CARD_UI_W, h / CARD_UI_H);
  // 10: DynIllustBase's own default `_cameraSize` [src: official GameAssembly.dll DynIllustBase..ctor 0x1442F39]
  const cs = Number(f.cameraSize) > 0 ? Number(f.cameraSize) : 10;
  // world units → UI units of the RawImage: the camera's 2·cs units span the image's `size` UI px
  const k = adj.size / (2 * cs);
  const scale = u * HOLDER_SCALE * k;
  const ax = w / 2, ay = (h - CARD_UI_H * u) / 2 + CARD_TOP * u;
  return {
    scale,
    x0: ax + u * HOLDER_SCALE * adj.ox,
    y0: ay - u * (HOLDER_Y + HOLDER_SCALE * adj.oy),
    w, h,
  };
}

/**
 * The official HOME SCREEN window at 16:9, in the illustration view's parent (panel_illustration) units: its visible
 * height and where its centre sits from the panel centre (y up). The home screen shows the view at the DEFAULT adjust
 * (HOME_PAGE is only the zoom cap of the layout editor) inside a world-space canvas seen by a FOV-50 perspective camera:
 * at 16:9 the panel plane is 213.7273 world units away, so it shows 2 · 213.7273 · tan 25° / 0.2461068 = 809.914 panel
 * units of height, centred (53.8844, 13.4711) / 0.2461068 = (218.947, 54.737) from the panel [src: notes
 * dev57-home-framing.md §1, §2, §3 (official GameAssembly.dll HomeIllustView, UIIllustLayoutInfo.Apply;
 * home_page.ab front_camera, front_canvas, panel_illustration, UI3DLayoutAdapter)].
 */
export const HOME_VH = 809.914;
export const HOME_CX = 218.947;
export const HOME_CY = 54.737;

/**
 * The linear map Unity frame → px for a `w` × `h` window framed as the official home screen frames the illustration
 * (notes dev57-home-framing.md §4): the same vertical range as the home window (p = h / HOME_VH px per panel unit), the
 * DEFAULT adjust, and the horizontal centre `centre: 'home'` (the home screen's own: the operator left of centre) or
 * `'illust'` (the view's offset: the same zoom and height, the operator centred). Same output as unityToCard.
 */
export function unityToHome(f, w, h, { centre = 'home' } = {}) {
  const adj = pickAdjust(f, ADJUST.DEFAULT);
  const cs = Number(f.cameraSize) > 0 ? Number(f.cameraSize) : 10;   // as unityToCard
  const p = h / HOME_VH;
  const k = adj.size / (2 * cs);
  const cx = centre === 'illust' ? adj.ox : HOME_CX;
  return {
    scale: p * k,
    x0: w / 2 + (adj.ox - cx) * p,
    y0: h / 2 - (adj.oy - HOME_CY) * p,
    w, h,
  };
}

/**
 * A framing map zoomed by `zoom` about the point (fx · w, fy · h) of its window: that point stays where it is, the
 * rest scales away from it. The window (the card's canvas) keeps its size, so a zoom adds no pixels. zoom 1 returns
 * the map unchanged. Our own option (a screen's per-illustration zoom for art that does not fill a card), not an
 * official one.
 */
export function zoomMap(map, zoom = 1, fx = 0.5, fy = 0.5) {
  if (!(zoom > 0) || zoom === 1) return map;
  const cx = fx * map.w, cy = fy * map.h;
  return { ...map, scale: map.scale * zoom, x0: cx + (map.x0 - cx) * zoom, y0: cy + (map.y0 - cy) * zoom };
}

/**
 * A card's framing from its mount options: `framing` 'card' | 'home', or { mode, centre, zoom, fx, fy } (fx / fy or
 * focus: [fx, fy], fractions of the card; default its centre). Returns { mode, centre, zoom, fx, fy } and `id`, a key
 * that tells two framings apart (DynIllustStage slots).
 */
export function cardFraming(framing, centre) {
  const o = framing && typeof framing === 'object' ? framing : { mode: framing, centre };
  const mode = o.mode === 'home' ? 'home' : 'card';
  const c = mode === 'home' ? (o.centre === 'illust' ? 'illust' : 'home') : null;
  const zoom = Number(o.zoom) > 0 ? Number(o.zoom) : 1;
  const fpair = Array.isArray(o.focus) ? o.focus : [o.fx, o.fy];
  const fx = Number.isFinite(Number(fpair[0])) && fpair[0] !== null ? Number(fpair[0]) : 0.5;
  const fy = Number.isFinite(Number(fpair[1])) && fpair[1] !== null ? Number(fpair[1]) : 0.5;
  const id = `${mode}${c ? '-' + c : ''}${zoom !== 1 ? `-z${zoom}@${fx},${fy}` : ''}`;
  return { mode, centre: c, zoom, fx, fy, id };
}

/** The map for a framing (cardFraming) of a `w` × `h` window: card or home, then the zoom. */
export function framingMap(f, w, h, fr) {
  const base = fr && fr.mode === 'home' ? unityToHome(f, w, h, { centre: fr.centre || 'home' }) : unityToCard(f, w, h);
  return fr ? zoomMap(base, fr.zoom, fr.fx, fr.fy) : base;
}

/** The view's size before ApplyAdjust [src: official GameAssembly.dll DynIllustMgr._CreateIllustView 0x14462B0
 * (sizeDelta 2048 × 2048; anchoredPosition left at 0)]. */
export const VIEW_SIZE = 2048;

/**
 * The adjust of `type`. A disabled part — DynIllustAdjust.DisabledValue, −3.40282e38 (Nearl the Radiant Knight's
 * epoque#17 has no DEFAULT) — is left as the view was created: offset 0, size VIEW_SIZE [src: official GameAssembly.dll
 * DynIllustView.ApplyAdjust 0x144D35F (the −3.40282e38 compare), DynIllustAdjust.enableOffset / enableSize].
 */
export function pickAdjust(f, type) {
  const list = Array.isArray(f.adjust) ? f.adjust : [];
  const a = list[type] || [];
  const on = (v) => Number.isFinite(Number(v)) && Number(v) > -1e38;
  const offOn = on(a[0]) && on(a[1]), sizeOn = on(a[2]) && Number(a[2]) > 0;
  return { ox: offOn ? Number(a[0]) : 0, oy: offOn ? Number(a[1]) : 0, size: sizeOn ? Number(a[2]) : VIEW_SIZE };
}

/**
 * Column-major view-projection (Unity frame → clip space) of a card slot of `w` × `h` px drawn at (x, y) of a target
 * of `W` × `H` px, y up in clip space. Depth: the camera looks along +z from far behind, so a bigger z is farther
 * (Unity's orthographic transparent sort); z in [−ZR, ZR] maps into the clip range.
 */
export const ZR = 1000;
export function cardViewProj(map, x, y, W, H, out = new Float32Array(16)) {
  out.fill(0);
  // px = x + x0 + s·X ; py = y + y0 − s·Y ; clip.x = 2px/W − 1 ; clip.y = 1 − 2py/H
  out[0] = 2 * map.scale / W;
  out[12] = 2 * (x + map.x0) / W - 1;
  out[5] = 2 * map.scale / H;
  out[13] = 1 - 2 * (y + map.y0) / H;
  out[10] = 1 / ZR;
  out[15] = 1;
  return out;
}
