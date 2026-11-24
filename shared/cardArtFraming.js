// shared/cardArtFraming.js — where a still full art sits on a TALL card (pure math; the browser and tools/ both use it).
//
// A wide room card frames a still full art on the operator's face (tools/card-art-framing.mjs stillFraming, data in
// data/card-art-framing.json). The tall cards — the solo room's, the result screen's team cards — are the official card's
// shape (art window 232 × 458 UI px, render/dynillust/framing.js CARD_UI_W / CARD_UI_H); the animated illustration shows
// there through the official camera, and a still gets the same face rule on that shape. No per-art number is stored: the
// rect follows from the art's aspect (its stored wide rect's width ÷ height) and the face the table already holds
// (found from the official portrait inside the full art, tools/card-art-framing.mjs), so the table does not grow.
//
// mode 'upper': the face on the face line, the head inside, the art over the whole card (the smallest scale that covers
//   it) — the upper body, like the wide cards. mode 'full': the whole art inside the card (contain), centred; the card's
//   background shows around it.

/** The official card's art window [src: render/dynillust/framing.js CARD_UI_W, CARD_UI_H; official [uc]autochessouter.ab group_char]. */
export const WIN_W = 232, WIN_H = 458;
/** The face rule's design values (the wide cards': tools/dyn-cover-framing.mjs): the head's top stays this far from the
 * card's top, the face line sits in BAND (fractions of the card's height) and at most FACE_MAX. */
export const TOP_MIN = 0.02, BAND = [0.22, 0.38], FACE_MAX = 0.45;
export const TALL_MODES = Object.freeze(['upper', 'full']);

/**
 * A still full art's box on the official window, in window units from the window's centre ([L, T, W, H]; the unit is
 * the same as data/card-art-framing.json's: px = w/2 + u·L … with u = min(w / 232, h / 458) on a card of any size).
 * `aspect` = art width ÷ height; `face` = [x, y, top] in art fractions (the face, the head's top); `wideH` = the art's
 * height in card heights on the wide card (its rect's height ÷ 458), the scale 'upper' keeps.
 * @param {{ aspect: number, face?: number[]|null, mode?: 'upper'|'full' }} o
 * @returns {number[]|null}
 */
export function tallRect({ aspect, face = null, mode = 'upper', wideH = 0 }) {
  if (!(aspect > 0)) return null;
  const ar = WIN_W / WIN_H;                       // the window's width, its height 1
  let x, y, w, h;
  if (mode === 'full') {
    h = Math.min(1, ar / aspect); w = h * aspect;
    x = (ar - w) / 2; y = (1 - h) / 2;
  } else {
    // the art at the scale the wide card's framing found for it (`wideH`: its height in card heights, from the wide rect:
    // the scale at which the scene covers a card's height), but never smaller than a cover of the tall card
    h = Math.max(1, ar / aspect, wideH || 0); w = h * aspect;
    const f = Array.isArray(face) && face.length >= 3 ? face : [0.5, 0.3, 0.1];
    const fyArt = f[1] * h, topArt = f[2] * h;
    const fitHead = (fyArt - topArt) + TOP_MIN + 0.01;
    const yt = Math.min(FACE_MAX, Math.max(BAND[0], Math.min(BAND[1], fyArt), fitHead));
    y = yt - fyArt;
    // the art's top stays at or above the card's top and its bottom at or below the card's bottom (a cover)
    y = Math.min(0, y);
    if (y + h < 1) y = 1 - h;
    x = Math.min(0, Math.max(ar - w, ar / 2 - f[0] * w));
  }
  return [(x - ar / 2) * WIN_H, (y - 0.5) * WIN_H, w * WIN_H, h * WIN_H].map((v) => +v.toFixed(2));
}
