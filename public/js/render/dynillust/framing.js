// render/dynillust/framing.js — where an official dynamic illustration sits on a card (pure math, no Pixi).
//
// The official end-of-match card shows each illustration through its own orthographic camera: the illustration's
// `_cameraSize` (half the view height in Unity units) fills a render texture that the card's RawImage shows at the
// DEFAULT adjust's size and offset, inside the card's illustration holder.
//
//   Which adjust: DEFAULT. Every view the manager creates applies ApplyAdjust(DEFAULT); only ApplySkinOffset (never
//   called by the end-screen card) applies SKIN [src: official GameAssembly.dll DynIllustMgr._CreateIllustView
//   0x14463BF (edx = 0); UICharacterDynIllust.ApplySkinOffset 0x1492685; card _RenderIllust 0x28E17E9–0x28E1815].
//   Card art window 232 × 458 UI px, holder `root` at (0, −39), scale 0.73 [src: official [uc]autochessouter.ab
//   auto_chess_settle_game_player_item].
//   Visible top 233 UI px above the holder's anchor: the one calibrated constant [src: doc l2d-art-proposal §4.1
//   Framing on the card, calibrated on the official clip's Angelina card].
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
/** UI px from the card's top edge to the holder anchor [src: doc l2d-art-proposal §4.1, calibrated]. */
export const CARD_TOP = 233;
/** DynIllustAdjustType [src: official dump.cs DynIllustAdjustType]. */
export const ADJUST = Object.freeze({ DEFAULT: 0, SKIN: 1, HOME_PAGE: 2 });

/**
 * The linear map Unity frame → card px for a card of `w` × `h` CSS px. `f` is the illustration's framing:
 * { cameraSize, adjust: [[ox, oy, sx, sy], …] (DynIllust._adjustes as offset + size), type?: ADJUST }.
 * Returns { scale, x0, y0 }: px = x0 + scale · X, py = y0 − scale · Y.
 */
export function unityToCard(f, w, h) {
  const adj = pickAdjust(f, f.type ?? ADJUST.DEFAULT);
  const u = w / CARD_UI_W;
  // 10: DynIllustBase's own default `_cameraSize` [src: official GameAssembly.dll DynIllustBase..ctor 0x1442F39]
  const cs = Number(f.cameraSize) > 0 ? Number(f.cameraSize) : 10;
  // world units → UI units of the RawImage: the camera's 2·cs units span the image's `size` UI px
  const k = adj.size / (2 * cs);
  const scale = u * HOLDER_SCALE * k;
  const ax = w / 2, ay = CARD_TOP * u;
  return {
    scale,
    x0: ax + u * HOLDER_SCALE * adj.ox,
    y0: ay - u * (HOLDER_Y + HOLDER_SCALE * adj.oy),
    w, h,
  };
}

/**
 * The adjust of `type`, falling back to DEFAULT when the illustration does not author it. Without any, the image is
 * `_maxSize` (default 2048 [src: official GameAssembly.dll DynIllustBase..ctor 0x1442F40]) at no offset.
 */
export function pickAdjust(f, type) {
  const list = Array.isArray(f.adjust) ? f.adjust : [];
  const max = Array.isArray(f.maxSize) && Number(f.maxSize[0]) > 0 ? Number(f.maxSize[0]) : 2048;
  const a = list[type] || list[ADJUST.DEFAULT] || [0, 0, max, max];
  return { ox: Number(a[0]) || 0, oy: Number(a[1]) || 0, size: Number(a[2]) > 0 ? Number(a[2]) : 2048 };
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
