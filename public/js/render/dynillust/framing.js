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
