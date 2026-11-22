// ui/cardEntrance.js — (fork) the official result card's entrance: the CN client's
// AutoChessSettleGameTeamPlayerCardView._PlayShowCardAnim, which samples the clip `auto_chess_settle_game_player_item_show`
// at its start, then plays it once with a linear tween after `index × _animDelay` (the card's place in the row)
// [src: official GameAssembly.dll 0x28E0C60: SampleClipAtBegin, PlayWithTween, SetEase(1 = Linear), SetDelay(index ×
// [this+0x100]); dump.cs AutoChessSettleGameTeamPlayerCardView _showAnim 0xF0, _animDelay 0x100; the tween's length is
// the clip's (UIAnimationTween._ConstructorImpl → AnimationHandler.GetClipLength, 0x151BF09)].
//
// The clip moves four things the page draws in its DOM — the card's CanvasGroup alpha (`.`), the illustration holder
// (`group_char/root`), the name card (`group_card`) and the rounds group (`group_round`) — and animates the card's matte
// layers (`group_char_matte`: the light beam, the top strip's dissolve, the hanger line, the frame's dissolve and the
// colour washes over the operator). The mattes are drawn here with the client's own sprites and a port of their shader
// (Torappu/UI/Dissolve/UI-DoubleDissolve-Tex) into two canvases laid over the card: the alpha-blended layers, and the
// additive ones (Blend SrcAlpha One) composited with `mix-blend-mode: plus-lighter`. A cleared card shows
// `group_complete`, the others `group_normal` (_objPassBg / _objNotPassBg). The layers stay at the clip's last frame.
// Every number below is the client's: the clip [src: official [uc]autochessouter.ab auto_chess_settle_game_player_item_show
// m_FloatCurves], the prefab [src: official [uc]autochessouter.ab auto_chess_settle_game_player_item RectTransforms /
// Images], the materials [src: same bundle, materials line_trans, complete_up_bg_dissolve, complete_frame_dissolve,
// char_color_complete, char_color_mask, char_color], the shader [src: official Torappu/UI/Dissolve/UI-DoubleDissolve-Tex
// fragment program, D3D11 disassembly of blob 7].

import { useLayoutEffect, useState } from '../../vendor/hooks.module.js';
import { data } from '../data.js';
import { uiUrl } from './assetUrls.js';
import { reducedMotion } from './device.js';

/** The card's delay step: index × this before its clip plays. [src: official auto_chess_settle_game_player_item _animDelay] */
export const ANIM_DELAY_S = 0.083;
/**
 * The clip's length: its last key (a legacy clip's length is its curves'; the stored m_MuscleClip stop time is 1.0 on
 * 78 of the bundle's 80 legacy clips, a default). [src: official auto_chess_settle_game_player_item_show, last key 1.31667]
 */
export const CLIP_LENGTH_S = 1.31667;

/** The clip: [path under panel_player ('.' = itself), attribute, [[time s, value, inSlope, outSlope], …]]. */
export const SHOW_CLIP = [
  ['group_char/root', 'm_AnchoredPosition.y', [[0, 59.1, 0, 0], [0.05, 194.763, 0, 0], [0.216667, -31.7333, -47.1352, -47.1352], [0.666667, -39, 0, 0]]],
  ['.', 'm_Alpha', [[0, 0, 0, 0], [0.25, 1, 0, 0]]],
  ['group_card', 'm_AnchoredPosition.y', [[0, -236.1, 0, 0], [0.25, -192.364, 11.782, 11.782], [0.666667, -190.4, 0, 0]]],
  ['group_char_matte/group_complete/line_trans', 'm_AnchoredPosition.y', [[0.05, 494.3, -4210.91, -4210.91], [0.0833333, 385.05, -2993.25, -2993.25], [0.133333, 316, -1450.5, -1450.5], [0.216667, 240, 0, 0]]],
  ['group_char_matte/group_complete/line_trans', 'm_Color.r', [[0.0833333, 0.141176, 0, 0], [0.133333, 0.413279, 4.68257, 4.68257], [0.183333, 0.609434, 1.89596, 1.89596], [0.4, 0.918868, 0, 0]]],
  ['group_char_matte/group_complete/line_trans', 'm_Color.g', [[0.0833333, 0.831373, 0, 0], [0.133333, 0.932075, 1.68627, 1.68627], [0.183333, 1, 0, 0], [0.4, 1, 0, 0]]],
  ['group_char_matte/group_complete/line_trans', 'm_Color.b', [[0.0833333, 0.670588, 0, 0], [0.133333, 0.811219, 2.38377, 2.38377], [0.183333, 0.908966, 0.637951, 0.637951], [0.4, 0.98134, 0, 0]]],
  ['group_char_matte/group_complete/line_trans', 'm_Color.a', [[0, 0, 0, 0], [0.05, 1, 0, 0], [0.216667, 1, 0, -5.45455], [0.4, 0, -5.45455, 0]]],
  ['group_char_matte/group_complete/line_trans', 'm_SizeDelta.x', [[0.05, 60, 0, 0], [0.0833333, 42.9, -360, -360], [0.133333, 30, -329, -329], [0.183333, 10, -192, -192], [0.216667, 6, -36.9231, -36.9231], [0.4, 2, 0, 0]]],
  ['group_char_matte/group_complete/line_trans', 'm_SizeDelta.y', [[0.05, 1103.9, 0, 0], [0.0833333, 697.7, 0, 0], [0.133333, 1307, 0, 0], [0.183333, 900, 0, 0], [0.4, 1000, 0, 0]]],
  ['group_char_matte/group_complete/line_up', 'm_FillAmount', [[0.0666667, 0, 0, 0], [0.283333, 1, 0, 0]]],
  ['group_char_matte/group_complete/char_color', 'm_Color.b', [[0.166667, 0, 0, 0], [0.25, 1, -2.89595, -2.89595], [1.05, 0, 0, 0]]],
  ['group_char_matte/group_complete/char_color', 'm_Color.r', [[0.166667, 1, 0, 0], [0.2, 0.6, -9.6, -9.6], [0.25, 0.2, -6, -6], [0.3, 0, 0, 0], [1.05, 0.642097, 0, 0]]],
  ['group_char_matte/group_complete/char_color', 'm_Color.g', [[0.166667, 0, 0, 0], [0.2, 1.49744e-7, 9.30732, 9.30732], [0.333333, 0.445259, 1.75385, 1.75385], [1.05, 0.8, 0.601789, 0.601789]]],
  ['group_char_matte/group_complete/char_color/tile_line', 'm_Alpha', [[0.2, 0, 0, 0], [0.3, 1, 0, 0], [0.916667, 0, 0, 0]]],
  ['group_char_matte/color_mask', 'm_Color.b', [[0.166667, 0, 0, 0], [0.25, 1, -2.89595, -2.89595], [0.666667, 0, 0, 0]]],
  ['group_char_matte/color_mask', 'm_Color.r', [[0.166667, 1, 0, 0], [0.2, 0.6, -9.6, -9.6], [0.25, 0.2, -6, -6], [0.3, 0, 0, 0], [0.666667, 0.702157, 0, 0]]],
  ['group_char_matte/color_mask', 'm_Color.g', [[0.166667, 0, 0, 0], [0.2, 1.49744e-7, 9.30732, 9.30732], [0.333333, 0.445259, 1.75385, 1.75385], [0.666667, 0.8, 0.601789, 0.601789]]],
  ['group_char_matte/group_complete/complete_up_bg_dissolve', 'm_Color.r', [[0.183333, 0.876998, 0, 0], [0.3, 0.198833, 0, 0]]],
  ['group_char_matte/group_complete/frame_color', 'm_Color.r', [[0.216667, 0.902893, 0, 0], [0.416667, 0.656157, 0, 0]]],
  ['group_char_matte/group_normal/char_color', 'm_Color.r', [[0.166667, 1, 0, 0], [0.2, 0.6, -9.6, -9.6], [0.25, 0.2, -6, -6], [0.3, 0, 0, 0], [1.31667, 0.642097, 0, 0]]],
  ['group_char_matte/group_normal/char_color', 'm_Color.g', [[0.166667, 0, 0, 0], [0.2, 1.49744e-7, 9.30732, 9.30732], [0.333333, 0.445259, 1.75385, 1.75385], [1.31667, 0.8, 0.601789, 0.601789]]],
  ['group_char_matte/group_normal/char_color', 'm_Color.b', [[0.166667, 0, 0, 0], [0.25, 1, -2.89595, -2.89595], [1.31667, 0, 0, 0]]],
  ['group_char_matte/group_normal/char_color/tile_line', 'm_Alpha', [[0.2, 0, 0, 0], [0.3, 1, 0, 0], [1.15, 0, 0, 0]]],
  ['group_round', 'm_Alpha', [[0.25, 0, 0, 0], [0.516667, 1, 0, 0]]],
];

/**
 * One curve at time t: Unity's AnimationCurve — cubic Hermite between keys with their in / out slopes (per second),
 * clamped to the first / last value outside them (the legacy clip's default wrap).
 * @param {number[][]} keys [[t, v, inSlope, outSlope], …] @param {number} t
 */
export function evalCurve(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  const last = keys[keys.length - 1];
  if (t >= last[0]) return last[1];
  let i = 0;
  while (keys[i + 1][0] < t) i++;
  const [t0, v0, , o0] = keys[i], [t1, v1, in1] = keys[i + 1];
  const dt = t1 - t0, s = (t - t0) / dt, s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * dt * o0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * dt * in1;
}

/** Every animated value at clip time t, as `{ '<path>|<attribute>': value }`. */
export function sampleShow(t) {
  const out = {};
  for (const [path, attr, keys] of SHOW_CLIP) out[`${path}|${attr}`] = evalCurve(keys, Math.max(0, Math.min(CLIP_LENGTH_S, t)));
  return out;
}

// ---- the matte layers (panel_player space: origin at its centre, y up, 1 unit = 1/234 of the card's width) --------

const M = 'group_char_matte/';
/** The materials (Torappu/UI/Dissolve/UI-DoubleDissolve-Tex): `add` = _Dst 1 (Additive), else _Dst 10 (Alpha). */
const MAT = {
  ui: null, // UI/Default: the sprite × the vertex colour, alpha-blended
  line_trans: { add: true, ic: 0, ci: 1, col: [1, 1, 1], t1: 'm03', st1: [1, 0.95, 0, 0.025], c1: -1, s1: 0, r1: 0, t2: 'm01', st2: [1, 0.95, 0, 0.025], c2: 0.06, s2: 0.17, r2: 0 },
  complete_up_bg_dissolve: { add: false, ic: 1, ci: 1, col: [1, 1, 1], t1: 'm03', st1: [1, 1, 0, 0], c1: -1, s1: 0.5, r1: 0, t2: null, st2: [1, 1, 0, 0], c2: -0.001, s2: 0, r2: 0 },
  complete_frame_dissolve: { add: false, ic: 1, ci: 1, col: [0.141, 0.831, 0.671], t1: 'm03', st1: [1, 1, 0, 0], c1: -1, s1: 0.332, r1: 0, t2: null, st2: [1, 1, 0, 0], c2: -0.001, s2: 0, r2: 0 },
  char_color_complete: { add: true, ic: 1, ci: 1.38, col: [0.106, 0.561, 0.42], t1: 'm03', st1: [1, 1, 0, 0], c1: -1, s1: 1, r1: 0, t2: 'm03', st2: [1, 1, 0, 0], c2: -1, s2: 1, r2: 1 },
  char_color_mask: { add: true, ic: 1, ci: 1.1, col: [1, 1, 1], t1: 'm03', st1: [1, 1, 0, 0], c1: -1, s1: 1, r1: 0, t2: 'm03', st2: [1, 1, 0, 0], c2: -1, s2: 1, r2: 1 },
  char_color: { add: true, ic: 1, ci: 0.8, col: [0.368, 0.368, 0.368], t1: 'm03', st1: [1, 1, 0, 0], c1: -1, s1: 1, r1: 0, t2: 'm03', st2: [1, 1, 0, 0], c2: -1, s2: 1, r2: 1 },
};

/**
 * The layers in draw order (Unity UI: the hierarchy's order): rect = [x, y] of the pivot, [w, h], pivot [px, py];
 * sprite (a 'settleCard/…' UI key; null = white), type ('simple' | 'sliced' [l, b, r, t] | 'tiled' | 'filled' vertical
 * from the bottom), colour, material, `anim` = the clip path that drives it, `alpha` = a CanvasGroup alpha path.
 */
const GROUPS = {
  complete: [
    { id: M + 'group_complete/line_trans', pos: [2.9, 90.1], size: [2, 1000], pivot: [0.5, 0], sprite: null, color: [0.919, 1, 0.981, 0], mat: 'line_trans' },
    { id: M + 'group_complete/complete_up', pos: [0, 244], size: [234, 79], pivot: [0.5, 0], sprite: 'complete_up_glow', type: ['sliced', 3, 0, 3, 0], color: [0.039, 0.737, 0.616, 1], mat: 'ui' },
    { id: M + 'group_complete/normal_up_bg', pos: [0, 233.2], size: [234, 32], pivot: [0.5, 0.5], sprite: 'unfinish_bg', color: [0.972, 0.972, 0.972, 1], mat: 'ui' },
    { id: M + 'group_complete/complete_up_bg_dissolve', pos: [0, 233.2], size: [234, 32], pivot: [0.5, 0.5], sprite: 'complete_up_bg', color: [0.199, 0, 1, 1], mat: 'complete_up_bg_dissolve' },
    { id: M + 'group_complete/line_up', pos: [3, 239.99], size: [4, 112], pivot: [0.5, 0], sprite: 'line_up', type: ['filled'], fill: 1, color: [1, 1, 1, 1], mat: 'ui' },
    { id: M + 'group_complete/frame', pos: [0, 217.2], size: [234, 460.2], pivot: [0.5, 1], sprite: 'bg_frame', type: ['sliced', 8, 8, 8, 8], color: [0.086, 0.086, 0.086, 1], mat: 'ui' },
    { id: M + 'group_complete/frame_color', pos: [0, -12.9], size: [234, 460.2], pivot: [0.5, 0.5], sprite: 'bg_frame', type: ['sliced', 8, 8, 8, 8], color: [0.656, 0, 1, 1], mat: 'complete_frame_dissolve' },
    { id: M + 'group_complete/char_color', pos: [0, -35.07], size: [234, 563.34], pivot: [0.5, 0.5], sprite: 'char_color_mask', color: [1, 0, 0.956, 1], mat: 'char_color_complete' },
    { id: M + 'group_complete/char_color/tile_line', pos: [0, -49.13], size: [234, 535.21], pivot: [0.5, 0.5], sprite: 'tile_line', type: ['tiled', 32], color: [1, 1, 1, 0.035], mat: 'ui', alpha: M + 'group_complete/char_color/tile_line' },
  ],
  normal: [
    { id: M + 'group_normal/unfinish_up_bg', pos: [0, 233.2], size: [234, 32], pivot: [0.5, 0.5], sprite: 'unfinish_bg', color: [1, 1, 1, 1], mat: 'ui' },
    { id: M + 'group_normal/frame', pos: [0, 217.2], size: [234, 460.2], pivot: [0.5, 1], sprite: 'bg_frame', type: ['sliced', 8, 8, 8, 8], color: [0.247, 0.247, 0.247, 1], mat: 'ui' },
    { id: M + 'group_normal/char_color', pos: [0, -35.07], size: [234, 563.34], pivot: [0.5, 0.5], sprite: 'char_color_mask', color: [0.612, 0.749, 0.012, 0.314], mat: 'char_color' },
    { id: M + 'group_normal/char_color/tile_line', pos: [0, -49.13], size: [234, 535.21], pivot: [0.5, 0.5], sprite: 'tile_line', type: ['tiled', 32], color: [1, 1, 1, 0.035], mat: 'ui', alpha: M + 'group_normal/char_color/tile_line' },
  ],
  // after the active group, both kinds
  tail: [
    { id: M + 'color_mask', pos: [0, -35.07], size: [234, 563.34], pivot: [0.5, 0.5], sprite: 'char_color_mask', color: [1, 0, 0.923, 0.282], mat: 'char_color_mask' },
  ],
};

/** The sprite keys the layers draw (data/assets.json `ui`): the card's own, the shared tile line, the two dissolve masks. */
const SPRITES = {
  complete_up_glow: 'settleCard/complete_up_glow', unfinish_bg: 'settleCard/unfinish_bg', complete_up_bg: 'settleCard/complete_up_bg',
  line_up: 'settleCard/line_up', bg_frame: 'settleCard/bg_frame', char_color_mask: 'settleCard/char_color_mask', tile_line: 'settle/tile_line',
  m03: 'uiFxMask/img_uifx_basicmask_03', m01: 'uiFxMask/img_uifx_common_basicmask_01', card_bg: 'settleCard/card_bg',
};

/**
 * The card's background (prefab panel_player/group_bg/bg: Image `card_bg`, Type 1 sliced, colour white, anchored at
 * (0, −13), 300 × 528 under the 234 × 486 card; the sprite's rect 159 × 264 and border left 75 / bottom 43 / right 78 /
 * top 212 at 100 px per unit [src: official [uc]autochessouter.ab auto_chess_settle_game_player_item, Sprite card_bg
 * m_Rect / m_Border]). Drawn behind the card as a CSS border-image (the 9-slice), not in the matte canvases.
 */
export const CARD_BG = Object.freeze({ pos: [0, -13], size: [300, 528], border: { left: 75, bottom: 43, right: 78, top: 212 } });

/** The canvases' extent in panel units: the beam comes down from above the card, the washes run below it. */
export const OVERLAY = Object.freeze({ top: 760, bottom: -320, left: -117, right: 117 });
/** The top of the official top strip (normal_up_bg: y 233.2, height 32), which our card's header top stands for. */
export const STRIP_TOP = 249.2;

/** A layer's colour, fill and CanvasGroup alpha at clip time `t` (the prefab's values where the clip has none). */
export function layerState(layer, s) {
  const c = layer.color.slice();
  const ch = ['r', 'g', 'b', 'a'];
  for (let i = 0; i < 4; i++) { const v = s[`${layer.id}|m_Color.${ch[i]}`]; if (v != null) c[i] = v; }
  const pos = layer.pos.slice(), size = layer.size.slice();
  const py = s[`${layer.id}|m_AnchoredPosition.y`]; if (py != null) pos[1] = py;
  const sx = s[`${layer.id}|m_SizeDelta.x`]; if (sx != null) size[0] = sx;
  const sy = s[`${layer.id}|m_SizeDelta.y`]; if (sy != null) size[1] = sy;
  const fill = s[`${layer.id}|m_FillAmount`] ?? layer.fill ?? 1;
  const ga = layer.alpha ? (s[`${layer.alpha}|m_Alpha`] ?? 1) : 1;
  return { color: [c[0], c[1], c[2], c[3] * ga], pos, size, fill };
}

/** The DOM parts' values at clip time t: card opacity, the illustration's and the name card's offset (panel units, up +). */
export function domState(s) {
  return {
    alpha: s['.|m_Alpha'],
    root: s['group_char/root|m_AnchoredPosition.y'] - -39, // the holder rests at y −39 (prefab)
    card: s['group_card|m_AnchoredPosition.y'] - -190.4, // the name card rests at y −190.4 (prefab)
    round: s['group_round|m_Alpha'],
  };
}

// ---- the renderer (one WebGL2 context for every card) ---------------------------------------------------------------

const VS = `#version 300 es
in vec2 a_pos; in vec2 a_uv; in vec2 a_quv;
uniform vec2 u_view;
out vec2 v_uv; out vec2 v_quv;
void main() { v_uv = a_uv; v_quv = a_quv; gl_Position = vec4(a_pos / u_view * 2.0 - 1.0, 0.0, 1.0); }`;
// Torappu/UI/Dissolve/UI-DoubleDissolve-Tex, blob 7 (no UNITY_UI_ALPHACLIP / CLIP_RECT): each dissolve mask's red (inverted
// by _RevertN) against a threshold — the vertex colour's r (mask 1) / g (mask 2) × 2 − 1 when _ImageControl, else
// _DissolveNClip — smoothstepped over _DissolveNSmooth; rgb = tex × _ColIntensity × (_ImageControl ? _Color : vertex
// colour), alpha = mask1 × mask2 × tex.a × _ColIntensity × vertex alpha. The dissolve masks read the quad's own UV, the
// main texture the sprite's (identical for a simple sprite).
const FS = `#version 300 es
precision highp float;
in vec2 v_uv; in vec2 v_quv;
uniform sampler2D u_main, u_d1, u_d2;
uniform vec4 u_vcol, u_st1, u_st2; uniform vec3 u_color;
uniform float u_ic, u_ci, u_c1, u_s1, u_r1, u_c2, u_s2, u_r2, u_add;
out vec4 o;
float mask(sampler2D t, vec4 st, float rev, float clip, float sm, float drive) {
  float d = texture(t, v_quv * st.xy + st.zw).r;
  d = rev > 0.0 ? 1.0 - d : d;
  float c = u_ic > 0.0 ? drive * 2.0 - 1.0 : clip;
  float x = clamp((d - c) / max(sm, 1e-6), 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}
void main() {
  float m = mask(u_d1, u_st1, u_r1, u_c1, u_s1, u_vcol.r) * mask(u_d2, u_st2, u_r2, u_c2, u_s2, u_vcol.g);
  vec4 t = texture(u_main, v_uv) * u_ci;
  vec3 rgb = u_ic > 0.0 ? t.rgb * u_color : t.rgb * u_vcol.rgb;
  float a = clamp(m * t.a * u_vcol.a, 0.0, 1.0);
  vec3 p = clamp(rgb, 0.0, 64.0) * a;
  o = u_add > 0.0 ? vec4(p, max(p.r, max(p.g, p.b))) : vec4(p, a);
}`;

let gl = null, prog = null, buf = null, loc = null, white = null;
const textures = new Map(); // url → { tex, w, h } | Promise

// the context and the program are started (glStart) and finished (glFinish) apart: a status query before the driver is
// done waits for the whole build, so glReady polls KHR_parallel_shader_compile's COMPLETION_STATUS a frame at a time
let pending = null; // { ctx, p, vs, fs, ext }
function glStart() {
  if (gl || pending) return;
  const canvas = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(256, 256) : globalThis.document?.createElement('canvas');
  const ctx = canvas?.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!ctx) return;
  const ext = ctx.getExtension('KHR_parallel_shader_compile');
  const sh = (type, src) => { const s = ctx.createShader(type); ctx.shaderSource(s, src); ctx.compileShader(s); return s; };
  const p = ctx.createProgram();
  const vs = sh(ctx.VERTEX_SHADER, VS), fs = sh(ctx.FRAGMENT_SHADER, FS);
  ctx.attachShader(p, vs); ctx.attachShader(p, fs); ctx.linkProgram(p);
  pending = { ctx, p, vs, fs, ext };
}
function glInit() {
  if (gl) return gl;
  glStart();
  return pending ? glFinish() : null;
}
/** The program built without blocking the page: resolves to the context (null without WebGL2) once the driver is done. */
export function glReady() {
  if (gl) return Promise.resolve(gl);
  glStart();
  if (!pending) return Promise.resolve(null);
  if (!pending.ext || typeof requestAnimationFrame !== 'function') return Promise.resolve(glFinish());
  return new Promise((resolve) => {
    const poll = () => {
      if (gl) { resolve(gl); return; }
      if (!pending) { resolve(null); return; }
      if (pending.ctx.getProgramParameter(pending.p, pending.ext.COMPLETION_STATUS_KHR)) resolve(glFinish());
      else requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}
function glFinish() {
  const { ctx, p, vs, fs } = pending;
  pending = null;
  if (!ctx.getShaderParameter(vs, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(vs));
  if (!ctx.getShaderParameter(fs, ctx.COMPILE_STATUS)) throw new Error(ctx.getShaderInfoLog(fs));
  if (!ctx.getProgramParameter(p, ctx.LINK_STATUS)) throw new Error(ctx.getProgramInfoLog(p));
  gl = ctx; prog = p; buf = ctx.createBuffer();
  loc = {};
  for (const n of ['a_pos', 'a_uv', 'a_quv']) loc[n] = ctx.getAttribLocation(p, n);
  for (const n of ['u_view', 'u_main', 'u_d1', 'u_d2', 'u_vcol', 'u_st1', 'u_st2', 'u_color', 'u_ic', 'u_ci', 'u_c1', 'u_s1', 'u_r1', 'u_c2', 'u_s2', 'u_r2', 'u_add']) loc[n] = ctx.getUniformLocation(p, n);
  white = ctx.createTexture();
  ctx.bindTexture(ctx.TEXTURE_2D, white);
  ctx.texImage2D(ctx.TEXTURE_2D, 0, ctx.RGBA, 1, 1, 0, ctx.RGBA, ctx.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
  return gl;
}

/** A sprite's texture (loaded once; Unity's v up = the image's bottom row, so the upload flips Y). */
function texture(url, wrap) {
  const k = `${url}|${wrap}`;
  const have = textures.get(k);
  if (have) return have;
  const p = fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`${r.status} ${url}`))))
    .then((b) => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none' }))
    .then((img) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const w = wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, w);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, w);
      const v = { tex: t, w: img.width, h: img.height };
      textures.set(k, v);
      return v;
    });
  textures.set(k, p);
  return p;
}

/** The URLs of every sprite the layers draw, or null when one is missing from the manifest (the card keeps its look). */
export function entranceSprites(m = data.get('assets')) {
  const out = {};
  for (const [k, key] of Object.entries(SPRITES)) {
    const url = uiUrl(m, key);
    if (!url) return null;
    out[k] = url;
  }
  return out;
}

/** Load every texture (a promise; rejects when one fails). */
export function loadEntrance(urls) {
  if (!glInit()) return Promise.reject(new Error('no WebGL2'));
  return Promise.all(Object.entries(urls).filter(([k]) => k !== 'card_bg').map(([k, url]) => texture(url, k === 'tile_line')));
}

/** A layer's quads: [x, y, u, v, qu, qv] × 6 per quad, in panel units relative to the overlay's bottom-left. */
function quads(layer, st, spr) {
  const [px, py] = st.pos, [w, h] = st.size;
  const x0 = px - w * layer.pivot[0] - OVERLAY.left, y0 = py - h * layer.pivot[1] - OVERLAY.bottom;
  const out = [];
  const quad = (ax, ay, bx, by, au, av, bu, bv) => {
    const qu = (x) => (x - x0) / w, qv = (y) => (y - y0) / h;
    out.push(ax, ay, au, av, qu(ax), qv(ay), bx, ay, bu, av, qu(bx), qv(ay), bx, by, bu, bv, qu(bx), qv(by),
      ax, ay, au, av, qu(ax), qv(ay), bx, by, bu, bv, qu(bx), qv(by), ax, by, au, bv, qu(ax), qv(by));
  };
  const type = layer.type?.[0] || 'simple';
  if (type === 'sliced' && spr) {
    // 9-slice: border px of the sprite = units (sprite ppu 100 / canvas reference ppu 100) [src: official sprites m_Border, m_PixelsToUnits 100]
    const [, l, b, r, t] = layer.type;
    const xs = [x0, x0 + l, x0 + w - r, x0 + w], ys = [y0, y0 + b, y0 + h - t, y0 + h];
    const us = [0, l / spr.w, 1 - r / spr.w, 1], vs = [0, b / spr.h, 1 - t / spr.h, 1];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (xs[i + 1] > xs[i] && ys[j + 1] > ys[j]) quad(xs[i], ys[j], xs[i + 1], ys[j + 1], us[i], vs[j], us[i + 1], vs[j + 1]);
  } else if (type === 'tiled' && spr) {
    const tile = layer.type[1];
    quad(x0, y0, x0 + w, y0 + h, 0, 0, w / tile, h / tile);
  } else if (type === 'filled') {
    const f = Math.max(0, Math.min(1, st.fill));
    if (f > 0) quad(x0, y0, x0 + w, y0 + h * f, 0, 0, 1, f);
  } else quad(x0, y0, x0 + w, y0 + h, 0, 0, 1, 1);
  return out;
}

/**
 * Draw one card's mattes at clip time t into its two canvases (`base`: alpha-blended, `add`: additive), each covering
 * OVERLAY at `scale` px per panel unit.
 * @param {{ base: HTMLCanvasElement, add: HTMLCanvasElement }} cv @param {'complete'|'normal'} kind
 */
export function drawMattes(cv, kind, t, scale, urls) {
  if (!glInit()) return false;
  const W = Math.max(1, Math.round((OVERLAY.right - OVERLAY.left) * scale)), H = Math.max(1, Math.round((OVERLAY.top - OVERLAY.bottom) * scale));
  const c = gl.canvas;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const s = sampleShow(t);
  const layers = [...GROUPS[kind], ...GROUPS.tail];
  const tex = (k) => { const v = textures.get(`${urls[k]}|${k === 'tile_line'}`); return v && !v.then ? v : null; };
  gl.useProgram(prog);
  gl.viewport(0, 0, W, H);
  gl.uniform2f(loc.u_view, OVERLAY.right - OVERLAY.left, OVERLAY.top - OVERLAY.bottom);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enable(gl.BLEND);
  for (const add of [false, true]) {
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, add ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
    for (const layer of layers) {
      const mat = MAT[layer.mat];
      if (!!mat?.add !== add) continue;
      const st = layerState(layer, s);
      if (!(st.color[3] > 0)) continue;
      const spr = layer.sprite ? tex(layer.sprite) : null;
      if (layer.sprite && !spr) continue;
      const v = new Float32Array(quads(layer, st, spr));
      if (!v.length) continue;
      gl.bufferData(gl.ARRAY_BUFFER, v, gl.STREAM_DRAW);
      gl.enableVertexAttribArray(loc.a_pos); gl.vertexAttribPointer(loc.a_pos, 2, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(loc.a_uv); gl.vertexAttribPointer(loc.a_uv, 2, gl.FLOAT, false, 24, 8);
      gl.enableVertexAttribArray(loc.a_quv); gl.vertexAttribPointer(loc.a_quv, 2, gl.FLOAT, false, 24, 16);
      const bind = (unit, t2, u) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t2 || white); gl.uniform1i(u, unit); };
      bind(0, spr?.tex, loc.u_main);
      bind(1, mat?.t1 ? tex(mat.t1)?.tex : null, loc.u_d1);
      bind(2, mat?.t2 ? tex(mat.t2)?.tex : null, loc.u_d2);
      const m = mat || { ic: 0, ci: 1, col: [1, 1, 1], st1: [1, 1, 0, 0], st2: [1, 1, 0, 0], c1: -1, s1: 1, r1: 0, c2: -1, s2: 1, r2: 0 };
      gl.uniform4fv(loc.u_vcol, st.color);
      gl.uniform4fv(loc.u_st1, m.st1); gl.uniform4fv(loc.u_st2, m.st2);
      gl.uniform3fv(loc.u_color, m.col);
      for (const [u, val] of [['u_ic', m.ic], ['u_ci', m.ci], ['u_c1', m.c1], ['u_s1', m.s1], ['u_r1', m.r1], ['u_c2', m.c2], ['u_s2', m.s2], ['u_r2', m.r2], ['u_add', add ? 1 : 0]]) gl.uniform1f(loc[u], val);
      gl.drawArrays(gl.TRIANGLES, 0, v.length / 6);
    }
    const target = add ? cv.add : cv.base;
    if (target.width !== W || target.height !== H) { target.width = W; target.height = H; }
    const ctx = target.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(c, 0, 0);
  }
  return true;
}

// ---- one picture dissolved away (ui/dynCards.js: the room cards' switch to their animated illustrations) ------------

/**
 * The material a picture dissolves away with: the result card's own `complete_up_bg_dissolve` (UI-DoubleDissolve, mask
 * `img_uifx_basicmask_03` over the quad, smooth 0.5, threshold driven by the vertex colour's red) [src: MAT above].
 */
const DISSOLVE_MAT = 'complete_up_bg_dissolve';

/** Load what a dissolve needs (the shader and its mask); resolves to the mask's URL, rejects without WebGL2 or the sprite. */
export function loadDissolve(m = data.get('assets')) {
  const mask = uiUrl(m, SPRITES[MAT[DISSOLVE_MAT].t1]);
  if (!mask) return Promise.reject(new Error('no dissolve mask'));
  return glReady().then((ok) => {
    if (!ok) throw new Error('no WebGL2');
    bloomMask = mask;
    // texture() hands back the loaded texture itself once it is cached (a promise only while it loads); the sparks read the
    // mask's pixels once
    // (and the smoothed copy built now, while the cards wait: a 128 px blur, not at the show)
    return Promise.all([texture(mask, false), maskPixels(mask)]).then(() => { buildSoftMask(); return mask; });
  });
}

/**
 * The bloom on the dissolve (the user's direction of 2026-11-22: "a white bright bloom that moves on the boundary between
 * old and new, … leaving the entire card artwork white glow before the glow fades away into the live2D already
 * showing"): additive white through the same shader and mask as the dissolve — a band on the dissolve's edge (mask 1 ×
 * the inverted mask 2, the official `color_mask` layer's band construction [src: MAT.char_color_mask r2 1]) and a glow
 * over what the edge has passed, then a fade. `width` is the band's half-width in mask units, `band` / `glow` its
 * alpha and the glow's, `fadeS` the glow's fade after the dissolve.
 */
export const BLOOM = Object.freeze({ width: 0.2, band: 1, glow: 0.8, fadeS: 0.5 }); // [ASSUMED: tuned to the user's description of 2026-11-22, not yet OK'd on the clip]
let bloomMask = null;

/**
 * The border glow's looks, for the user to choose from (2026-11-23: "the border glow and white glow of the card … just
 * drowns out any particle effect"; the review page's `&glow=0…4`, 0 the current one). Bands are in mask units around
 * the dissolve's edge (`lo` … `hi`, ramping over `soft`, `color` rgb, `a` alpha); `glow` the wash over what the edge
 * passed (none: only the bands), faded over `fadeS` once the picture is gone; `dim` darkens the old picture to `to`
 * over `s` seconds before the sweep starts; `char` darkens the old picture just ahead of the edge (a burn); `spark` the
 * glitter's palette.
 */
const WHITE = [1, 1, 1], TEAL = [0.15, 0.8, 0.75];
/** The game's mint accent `#4ed8af` [src: docs/design/client.md §10 Look & feel]. */
const MINT = [0x4e / 255, 0xd8 / 255, 0xaf / 255];
export const GLOW_STYLES = Object.freeze({ // [ASSUMED: proposals for the user's pick of 2026-11-23, not yet chosen]
  0: { glow: { a: 0.8, color: WHITE }, fadeS: 0.5, bands: [{ lo: -0.2, hi: 0.2, soft: 0.2, color: WHITE, a: 1 }], spark: 'teal' },
  1: { glow: null, fadeS: 0.25, spark: 'teal', bands: [
    { lo: -0.3, hi: 0, soft: 0.17, color: [0.35, 0.85, 0.8], a: 0.45 },
    { lo: -0.13, hi: 0.1, soft: 0.09, color: TEAL, a: 0.9 },
    { lo: -0.035, hi: 0.035, soft: 0.035, color: WHITE, a: 1 }] },
  2: { dim: { to: 0.45, s: 0.35 }, glow: { a: 0.3, color: WHITE }, fadeS: 0.35, spark: 'teal', bands: [
    { lo: -0.16, hi: 0.16, soft: 0.16, color: WHITE, a: 1 }] },
  3: { glow: { a: 0.4, color: [0.2, 0.72, 0.68] }, fadeS: 0.5, spark: 'white', bands: [
    { lo: -0.22, hi: 0.2, soft: 0.2, color: TEAL, a: 1 },
    { lo: -0.04, hi: 0.04, soft: 0.04, color: WHITE, a: 1 }] },
  4: { char: { lo: 0, hi: 0.2, soft: 0.1, a: 0.92 }, glow: null, fadeS: 0.2, spark: 'ember', bands: [
    { lo: -0.07, hi: 0.06, soft: 0.06, color: [1, 0.38, 0.06], a: 1 },
    { lo: -0.02, hi: 0.025, soft: 0.025, color: [1, 0.88, 0.55], a: 1 }] },
  // the user's pick of 2026-11-23: "1 + 2 + 3, but the color matches the theme color" — the old picture dims, then a thin
  // white edge in a mint halo with a short mint trail sweeps it away over a faint mint wash; white glitter
  // then "the edge should be half as thin, … cleaner and more elegant", and "why do I see a 2nd line?" (the official
  // mask is noise on a slope: the same value comes back in patches, each its own line): one line on a smoothed copy of
  // the mask (`soft`), a tight dissolve under it (`dissolveSoft`, the official material's is 0.5), no trail, a faint
  // wash starting at the line (`glowReach`), the glitter born on the line (`sparkLead`), a lighter dim
  5: { soft: true, dissolveSoft: 0.06, glowReach: 0.02, sparkLead: 0.01, reach: 0.05,
    dim: { to: 0.75, s: 0.2 }, glow: { a: 0.15, color: MINT }, fadeS: 0.3, spark: 'white', bands: [
      { lo: -0.035, hi: 0.025, soft: 0.025, color: MINT, a: 0.8 },
      { lo: -0.01, hi: 0.01, soft: 0.01, color: WHITE, a: 1 }] },
});
/** The look the cards use (the user's pick, 5); the review page's `&glow=0…4` shows the others. */
export const GLOW_DEFAULT = 5;
/** The glow's look now (the review page's choice, else the default). */
export function glowStyle() { return GLOW_STYLES[globalThis.__dynGlow] || GLOW_STYLES[GLOW_DEFAULT]; }

/**
 * Draw the bloom into the 2D canvas `target` (w × h device px), premultiplied and additive (the canvas composites with
 * `mix-blend-mode: plus-lighter`): `k` the dissolve's progress 0 … 1 (drawDissolve's drive), `glow` the glow's alpha
 * now, `band` the band's. The dissolve keeps the picture where the mask d > 2k − 1, its edge (half alpha) at
 * d = 2k − 0.75 [src: drawDissolve, DISSOLVE_MAT s1 0.5]; the band peaks there, the glow covers d below it.
 */
export function drawBloom(target, k, glow, band, w, h) {
  return flushTiles([{ kind: 'bloom', target, k, glow, band, W: Math.max(1, Math.round(w)), H: Math.max(1, Math.round(h)) }]);
}

/** One bloom tile in the current viewport (flushTiles). */
function tileBloom(it) {
  const tm = bloomMask ? textures.get(`${bloomMask}|false`) : null;
  if (!tm || tm.then) return false;
  const S = glowStyle(), edge = edgeOf(it.k, S), mk = lookMask(S, tm), gr = S.glowReach ?? BLOOM.width;
  gl.blendFunc(gl.ONE, gl.ONE);
  if (S.glow) maskPass(mk, null, -2, edge + gr, gr, S.glow.color, S.glow.a * it.glow);
  for (const b of S.bands) maskPass(mk, mk.tex, edge + b.lo, edge + b.hi, b.soft, b.color, b.a * it.band);
  return true;
}

/**
 * One additive pass of the shader through the mask: on where the mask's d is above `lo` and below `hi`, ramping over
 * `soft` at both ends. The shader's threshold is drive × 2 − 1: mask 1 = smoothstep((d − c1) / soft) with c1 = lo (on
 * above it); mask 2 (inverted d) = smoothstep(((1 − d) − c2) / soft) with c2 = 1 − hi (on below hi). `d1` null: mask 1
 * white, always on (the glow over everything the edge passed).
 */
function maskPass(tm, d1, lo, hi, soft, color, alpha) {
  if (!(alpha > 0)) return;
  // main texture white; mask 1 the noise or white; mask 2 the noise, inverted
  bindTex(0, null, loc.u_main); bindTex(1, d1, loc.u_d1); bindTex(2, tm.tex, loc.u_d2);
  gl.uniform4fv(loc.u_vcol, [d1 ? (lo + 1) / 2 : 0, (2 - hi) / 2, 0, alpha]);
  gl.uniform4fv(loc.u_st1, [1, 1, 0, 0]); gl.uniform4fv(loc.u_st2, [1, 1, 0, 0]);
  gl.uniform3fv(loc.u_color, color);
  for (const [u, val] of [['u_ic', 1], ['u_ci', 1], ['u_c1', -1], ['u_s1', soft], ['u_r1', 0], ['u_c2', -1], ['u_s2', soft], ['u_r2', 1], ['u_add', 1]]) gl.uniform1f(loc[u], val);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function bindTex(unit, t2, u) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t2 || white); gl.uniform1i(u, unit); }

// ---- one GL pass per frame for every card's dissolve and bloom ------------------------------------------------------
// Each card drawing its own (a draw, then a copy into its canvas, twice per card) made the GPU finish and hand back the
// shared canvas up to sixteen times a frame (a 49.9 ms frame with eight cards). Queued instead, a frame packs every
// card's tiles into the canvas, draws them in one pass (a viewport and scissor per tile), then copies each tile out.
const queue = [];
/** Queue a card's dissolve frame (drawDissolve's arguments) for flushBatch. */
export function batchDissolve(target, pic, drive, w, h, dim = 1) {
  queue.push({ kind: 'dissolve', target, pic, drive, dim, W: Math.max(1, Math.round(w)), H: Math.max(1, Math.round(h)) });
}
/** Queue a card's bloom frame (drawBloom's arguments) for flushBatch. */
export function batchBloom(target, k, glow, band, w, h) {
  queue.push({ kind: 'bloom', target, k, glow, band, W: Math.max(1, Math.round(w)), H: Math.max(1, Math.round(h)) });
}
/** Draw everything queued this frame in one pass. */
export function flushBatch() { return flushTiles(queue.splice(0)); }

/** The quad over a whole tile (y up), its picture and mask UVs 0–1 (the picture was uploaded flipped). */
const TILE_QUAD = new Float32Array([0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1]);
const MAX_SIDE = 4096;
/** Shelf-pack tiles (rows of at most MAX_SIDE), tallest first, so a set and its subsets pack alike; sets it.x / it.y. */
function packTiles(items) {
  let x = 0, y = 0, rowH = 0, CW = 1, CH = 1;
  for (const it of [...items].sort((a, b) => b.H - a.H || b.W - a.W)) {
    if (x + it.W > MAX_SIDE) { x = 0; y += rowH; rowH = 0; }
    it.x = x; it.y = y; x += it.W; rowH = Math.max(rowH, it.H);
    CW = Math.max(CW, x); CH = Math.max(CH, y + rowH);
  }
  return { CW, CH };
}
/** Grow the shared canvas to CW × CH (never shrunk while in use: a resize reallocates the drawing buffer). */
function growCanvas(CW, CH) {
  const c = gl.canvas;
  if (c.width < CW || c.height < CH) { c.width = Math.max(c.width, CW); c.height = Math.max(c.height, CH); }
}
/**
 * The cards about to show (each a dissolve and a bloom tile of W × H device px): the shared canvas is sized for all of
 * them now, while they wait, so it never grows during the show (a growth reallocates it: 46–100 ms frames as the
 * staggered cards joined, work/dev-55 wf-1440 / wf-4k, 2026-11-23). `W` 0 drops the card. Returns how many cards are
 * still reserved.
 */
const reserved = new Map();
let shrinkTimer = 0;
/** How long after the last card the shared canvas is shrunk (ms): past the screen's settling, a design choice. */
const SHRINK_AFTER_MS = 2000;
export function reserveTiles(token, W = 0, H = 0, { grow = true } = {}) {
  if (W > 0 && H > 0) reserved.set(token, { W: Math.round(W), H: Math.round(H) }); else reserved.delete(token);
  if (!gl) return reserved.size;
  clearTimeout(shrinkTimer);
  // a group's cards record their tiles one by one and grow the canvas once (growReserved): each growth reallocates it
  if (!grow && reserved.size) return reserved.size;
  // nobody waiting or showing: give the memory back (8 wide cards at 4K held about 4050 × 5040 px, ~80 MB) a moment
  // later, off the animation (the resize in the show's last frame cost it 47–70 ms, work/dev-55 wf-1440 / wf-4k); a
  // later draw (a result card's entrance) grows it again to what it needs
  if (!reserved.size) {
    shrinkTimer = setTimeout(() => { if (!reserved.size && !queue.length && gl) { gl.canvas.width = 1; gl.canvas.height = 1; } }, SHRINK_AFTER_MS);
    return 0;
  }
  growReserved();
  return reserved.size;
}
/** Grow the shared canvas once for every reserved card (reserveTiles with `grow: false` records only). */
export function growReserved() {
  if (!reserved.size || !glInit()) return;
  const items = [];
  for (const r of reserved.values()) items.push({ ...r }, { ...r });
  const { CW, CH } = packTiles(items);
  growCanvas(CW, CH);
}
function flushTiles(items) {
  if (!items.length || !glInit()) return false;
  const { CW, CH } = packTiles(items);
  const c = gl.canvas;
  growCanvas(CW, CH);
  gl.useProgram(prog);
  gl.uniform2f(loc.u_view, 1, 1);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, TILE_QUAD, gl.STREAM_DRAW);
  gl.enableVertexAttribArray(loc.a_pos); gl.vertexAttribPointer(loc.a_pos, 2, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(loc.a_uv); gl.vertexAttribPointer(loc.a_uv, 2, gl.FLOAT, false, 24, 8);
  gl.enableVertexAttribArray(loc.a_quv); gl.vertexAttribPointer(loc.a_quv, 2, gl.FLOAT, false, 24, 16);
  gl.enable(gl.BLEND);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 0);
  const drawn = items.map((it) => {
    const gy = c.height - it.y - it.H;
    gl.viewport(it.x, gy, it.W, it.H);
    gl.scissor(it.x, gy, it.W, it.H);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return it.kind === 'dissolve' ? tileDissolve(it) : tileBloom(it);
  });
  gl.disable(gl.SCISSOR_TEST);
  items.forEach((it, i) => {
    if (!drawn[i]) return;
    const t = it.target;
    if (t.width !== it.W || t.height !== it.H) { t.width = it.W; t.height = it.H; }
    const ctx = t.getContext('2d');
    ctx.clearRect(0, 0, it.W, it.H);
    ctx.drawImage(c, it.x, it.y, it.W, it.H, 0, 0, it.W, it.H);
  });
  return drawn.every(Boolean);
}

// ---- the border sparks (the user, 2026-11-22: "there should be some particle effects that runs with the border between
// old and new in the glow … Currently it looks too bland and 'clean'") -------------------------------------------------

/**
 * Glitter that falls out of the card (the user, 2026-11-22: "I expected it to fall out of the card itself, and currently
 * it's swallowed up in the glow"; 2026-11-23: "a star … the glitter/sparkling shape", "a better color", "dies faster and
 * spawn less", "B looks better, but having a bit of A would make it better"), drawn on one page-wide layer over
 * everything, so it leaves the card, painted normally (not added: an added spark is lost in the white glow). Born on the
 * glow's leading edge, where the mask reads `lead` past the dissolve's edge, over the old picture. Most fall down through
 * the card and out of its bottom (B); `sideShare` of them are born near the card's left and right edges (`side`, the
 * share of the width) and thrown outward and up (A: `sideVx` outward, `sideVy`). `rate` births per second per card
 * while the border moves, `life` s / `size` (the star's ray, a share of the card's height: the co-op rooms' wide cards
 * are 2–3 × the tall ones) ranges, `vx` / `vy` CSS px per second at birth, `gravity` CSS px/s², `twinkle` the flicker's
 * rate (Hz), `near` how close to the birth line's value a point must read, `max` live stars per card.
 */
export const SPARKS = Object.freeze({ // [ASSUMED: tuned to the user's descriptions of 2026-11-22/23, not yet OK'd on the clip]
  rate: 38, life: [0.35, 0.7], size: [0.025, 0.05], vx: [-50, 50], vy: [-30, 80], gravity: 650,
  sideShare: 0.3, side: 0.16, sideVx: [140, 360], sideVy: [-280, -90],
  twinkle: [6, 11], near: 0.04, lead: 0.2, max: 45,
});

/** The dissolve mask's red channel on the CPU, top row first (texture rows are uploaded flipped: row = y / H of the box). */
let maskPx = null;
function maskPixels(url) {
  if (maskPx?.url === url) return Promise.resolve(maskPx);
  if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return Promise.resolve(null);
  // a 128 px copy is enough to place sparks; the full mask read back on the CPU took a 37 ms task
  return fetch(url).then((r) => r.blob()).then((b) => createImageBitmap(b, { resizeWidth: 128, resizeHeight: 128, resizeQuality: 'medium' })).then((img) => {
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data, r = new Uint8Array(img.width * img.height);
    for (let i = 0; i < r.length; i++) r[i] = d[i * 4];
    maskPx = { url, w: img.width, h: img.height, r };
    return maskPx;
  }).catch(() => null);
}

/**
 * The dissolve edge's mask value at progress k: half alpha at d = 2k − 1 + smooth / 2 (the official material's smooth
 * 0.5: 2k − 0.75; a look's own `dissolveSoft` otherwise).
 */
export const edgeOf = (k, S = glowStyle()) => 2 * k - 1 + (S.dissolveSoft ?? DISSOLVE_SMOOTH) / 2;
/** The official dissolve material's smooth [src: MAT DISSOLVE_MAT s1]. */
const DISSOLVE_SMOOTH = 0.5;
/**
 * The drive range a look's sweep runs over: from where its bands first reach the card (edge −reach) to where they
 * leave it (edge 1 + reach), so none of the sweep's time is spent off the card.
 */
export function sweepRange(S = glowStyle()) {
  const off = (S.dissolveSoft ?? DISSOLVE_SMOOTH) / 2, reach = S.reach ?? BLOOM.width;
  return [(-reach + 1 - off) / 2, (1 + reach + 1 - off) / 2];
}

/**
 * The look's smoothed mask (GLOW_STYLES `soft`): the official mask's 128 px copy box-blurred (two passes each way,
 * SOFT_BLUR_PX), a little of the raw mask kept for an organic edge (SOFT_RAW), stretched back to 0 … 1; on the GPU as a
 * half-float texture (8-bit steps showed as stairs on a line this thin) and on the CPU for the glitter's births.
 */
const SOFT_BLUR_PX = 10, SOFT_RAW = 0.15;
let softMask = null;
function buildSoftMask() {
  if (!maskPx || !gl) return null;
  if (softMask?.url === maskPx.url) return softMask;
  const { w, h, r } = maskPx;
  const a = Float32Array.from(r, (v) => v / 255);
  // a running-sum box (one add and one subtract per pixel: the direct sum took a 45 ms task, work/dev-55 la.json)
  const box = (src, horiz) => {
    const out = new Float32Array(w * h), R = SOFT_BLUR_PX;
    const lines = horiz ? h : w, len = horiz ? w : h;
    const at = (line, i) => (horiz ? line * w + i : i * w + line);
    for (let line = 0; line < lines; line++) {
      let s = 0, n = 0;
      for (let i = 0; i <= Math.min(R, len - 1); i++) { s += src[at(line, i)]; n++; }
      for (let i = 0; i < len; i++) {
        out[at(line, i)] = s / n;
        const add = i + R + 1, drop = i - R;
        if (add < len) { s += src[at(line, add)]; n++; }
        if (drop >= 0) { s -= src[at(line, drop)]; n--; }
      }
    }
    return out;
  };
  let b = a;
  for (let p = 0; p < 2; p++) b = box(box(b, true), false);
  const mix = b.map((v, i) => SOFT_RAW * a[i] + (1 - SOFT_RAW) * v);
  let lo = 1, hi = 0;
  for (const v of mix) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const cpu = mix.map((v) => (v - lo) / Math.max(1e-6, hi - lo));
  // the GPU copy flipped as the sprites are (texture(): imageOrientation flipY)
  const up = new Float32Array(w * h);
  for (let y = 0; y < h; y++) up.set(cpu.subarray(y * w, y * w + w), (h - 1 - y) * w);
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, up);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  softMask = { url: maskPx.url, tex: t, px: { w, h, f: cpu } };
  return softMask;
}
/** The mask a look's bands and dissolve read: the smoothed one for a `soft` look, else the official texture `tm`. */
function lookMask(S, tm) { return (S.soft && buildSoftMask()) || tm; }

const stars = new Map();
const STAR_PX = 64;
/** The glitter's palettes (GLOW_STYLES spark): its halo and its rays' stops past the white core. */
const SPARK_PALETTES = {
  teal: { halo: ['rgba(60,215,195,0.7)', 'rgba(40,190,180,0.3)', 'rgba(30,170,165,0)'], rays: ['190,255,240', '50,205,190', '25,160,160'] },
  white: { halo: ['rgba(235,245,255,0.75)', 'rgba(200,225,255,0.3)', 'rgba(190,215,255,0)'], rays: ['250,252,255', '215,232,255', '180,205,255'] },
  ember: { halo: ['rgba(255,170,60,0.7)', 'rgba(255,120,30,0.3)', 'rgba(240,90,20,0)'], rays: ['255,240,200', '255,170,60', '235,90,20'] },
};
/**
 * A glitter star: four thin pinched rays (a sparkle, not a five-pointed star) and a shorter diagonal pair, a white core,
 * the rays mint-cyan deepening to teal at the tips (the cards' teal; painted over, so they read on the white glow too)
 * and a teal halo.
 */
function sparkStar(palette = 'teal') {
  if (stars.has(palette) || typeof OffscreenCanvas !== 'function') return stars.get(palette) || null;
  const P = SPARK_PALETTES[palette] || SPARK_PALETTES.teal;
  const c = new OffscreenCanvas(STAR_PX, STAR_PX), g = c.getContext('2d'), m = STAR_PX / 2;
  const halo = g.createRadialGradient(m, m, 0, m, m, m * 0.5);
  halo.addColorStop(0, P.halo[0]); halo.addColorStop(0.5, P.halo[1]); halo.addColorStop(1, P.halo[2]);
  g.fillStyle = halo; g.fillRect(0, 0, STAR_PX, STAR_PX);
  // a ray pair: tips at `len` on both axes, the sides pinched in to `waist` (quadratic curves through the centre's side)
  const rays = (len, waist, rot, alpha) => {
    g.save(); g.translate(m, m); g.rotate(rot);
    const fill = g.createRadialGradient(0, 0, 0, 0, 0, len);
    fill.addColorStop(0, `rgba(255,255,255,${alpha})`); fill.addColorStop(0.22, `rgba(${P.rays[0]},${alpha})`);
    fill.addColorStop(0.6, `rgba(${P.rays[1]},${alpha * 0.95})`); fill.addColorStop(1, `rgba(${P.rays[2]},0)`);
    g.fillStyle = fill;
    g.beginPath(); g.moveTo(0, -len);
    g.quadraticCurveTo(waist, -waist, len, 0); g.quadraticCurveTo(waist, waist, 0, len);
    g.quadraticCurveTo(-waist, waist, -len, 0); g.quadraticCurveTo(-waist, -waist, 0, -len);
    g.fill(); g.restore();
  };
  rays(m * 0.98, m * 0.07, 0, 1);
  rays(m * 0.5, m * 0.06, Math.PI / 4, 0.8);
  stars.set(palette, c);
  return c;
}

/**
 * Draw one star, invisibly, into the glitter's page-wide layer while the cards wait: the browser sets a canvas layer up
 * on its first real draw, and the first star at the show cost a 96–113 ms frame (work/dev-55 wf-1440 / wf-4k, 2026-11-23).
 */
export function warmSparks(ctx, palette = glowStyle().spark) {
  const img = sparkStar(palette);
  if (!img || !ctx) return;
  ctx.globalAlpha = 0.01;
  ctx.drawImage(img, 0, 0, 2, 2);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, 2, 2);
}

/**
 * A card's glitter in page coordinates: `step` it by dt s with the border at progress k (births only while `born`) over
 * the card's box `{ left, top, width, height }` (CSS px), `draw` it on the page-wide layer (device px = CSS × dpr).
 */
export function makeSparks(palette = glowStyle().spark) {
  const P = SPARKS;
  const list = [];
  let acc = 0;
  const rnd = (a) => a[0] + Math.random() * (a[1] - a[0]);
  return {
    get count() { return list.length; },
    step(dt, k, born, box) {
      for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        s.age += dt; s.vy += P.gravity * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.age >= s.life) list.splice(i, 1);
      }
      if (!born || !maskPx || !box) return;
      // the look's mask (the smoothed one for a `soft` look: born on its one line) and lead
      const S = glowStyle(), soft = S.soft ? buildSoftMask()?.px : null;
      const e = edgeOf(k, S) + (S.sparkLead ?? P.lead);
      if (e < -P.near || e > 1 + P.near) return;
      acc += P.rate * dt;
      for (let tries = 0; acc >= 1 && tries < 400 && list.length < P.max; tries++) {
        const thrown = Math.random() < P.sideShare;
        let x = Math.random();
        if (thrown) x = x < 0.5 ? x * 2 * P.side : 1 - (x - 0.5) * 2 * P.side;
        const y = Math.random();
        const at = Math.min(maskPx.h - 1, (y * maskPx.h) | 0) * maskPx.w + Math.min(maskPx.w - 1, (x * maskPx.w) | 0);
        const d = soft ? soft.f[at] : maskPx.r[at] / 255;
        if (Math.abs(d - e) > P.near) continue;
        const vx = thrown ? (x < 0.5 ? -1 : 1) * rnd(P.sideVx) : rnd(P.vx);
        list.push({ x: box.left + x * box.width, y: box.top + y * box.height, vx, vy: rnd(thrown ? P.sideVy : P.vy), age: 0,
          life: rnd(P.life), size: rnd(P.size) * box.height, rot: Math.random() * Math.PI / 2, spin: (Math.random() - 0.5) * 3, tw: rnd(P.twinkle) * 2 * Math.PI, ph: Math.random() * 6.3 });
        acc -= 1;
      }
      if (acc > 1) acc = 1;
    },
    draw(ctx, dpr) {
      const img = sparkStar(palette);
      if (!img || !list.length) return;
      for (const s of list) {
        const t = s.age / s.life;
        // a quick flare in, a twinkle, then shrinking out
        const flick = 0.75 + 0.25 * Math.sin(s.ph + s.age * s.tw);
        const r = s.size * dpr * Math.min(1, t * 8) * (1 - 0.6 * t) * flick;
        if (r < 0.3) continue;
        ctx.globalAlpha = (1 - t * t) * (0.8 + 0.2 * flick);
        const a = s.rot + s.spin * s.age, cs = Math.cos(a), sn = Math.sin(a);
        ctx.setTransform(cs, sn, -sn, cs, s.x * dpr, s.y * dpr);
        ctx.drawImage(img, -r, -r, 2 * r, 2 * r);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
    },
  };
}

/**
 * The picture to dissolve: `src` (a canvas: the whole box as it shows) on the GPU, flipped as the sprites are; `pic` (a
 * previous result) is reused. Returns { tex, mask, w, h }, or null without WebGL2.
 */
export function dissolvePicture(src, mask, pic = null) {
  if (!glInit()) return null;
  const t = pic?.tex || gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
  return { tex: t, mask, w: src.width, h: src.height };
}

/** Free a dissolvePicture's texture. */
export function freeDissolvePicture(pic) {
  if (pic?.tex && gl) { try { gl.deleteTexture(pic.tex); } catch { /* the context is gone */ } }
}

/**
 * The picture's crop as CSS `object-fit: cover` shows it in a w × h box at object-position (px, py) (0–1): the texture
 * coordinates of the box's left / right / top / bottom edges (v down from the picture's top).
 */
export function coverUv(iw, ih, w, h, px = 0.5, py = 0.5) {
  const s = Math.max(w / iw, h / ih), dw = iw * s, dh = ih * s;
  const x = (w - dw) * px, y = (h - dh) * py;
  return { u0: -x / dw, u1: (w - x) / dw, t0: -y / dh, t1: (h - y) / dh };
}

/**
 * Draw `pic` (dissolvePicture: the whole box) into the 2D canvas `target` (w × h device px), dissolved by `drive`
 * 0 (whole) … 1 (gone): the material's threshold is drive × 2 − 1 [src: FS mask(), _ImageControl].
 */
export function drawDissolve(target, pic, drive, w, h) {
  return flushTiles([{ kind: 'dissolve', target, pic, drive, W: Math.max(1, Math.round(w)), H: Math.max(1, Math.round(h)) }]);
}

/** One dissolve tile in the current viewport (flushTiles): the whole box, its picture uploaded flipped. */
function tileDissolve(it) {
  const pic = it.pic;
  const tm = pic?.tex ? textures.get(`${pic.mask}|false`) : null;
  if (!tm || tm.then) return false;
  const m = MAT[DISSOLVE_MAT], S = glowStyle(), mk = lookMask(S, tm);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  bindTex(0, pic.tex, loc.u_main); bindTex(1, mk.tex, loc.u_d1); bindTex(2, null, loc.u_d2);
  // vertex colour: r drives mask 1; g 0 keeps mask 2 (white) whole (threshold −1)
  gl.uniform4fv(loc.u_vcol, [Math.max(0, Math.min(1, it.drive)), 0, 1, 1]);
  gl.uniform4fv(loc.u_st1, m.st1); gl.uniform4fv(loc.u_st2, m.st2);
  // the glow look's dim (darkens the old picture: its colour, premultiplied, times the factor)
  const dim = it.dim > 0 && it.dim < 1 ? it.dim : 1;
  gl.uniform3fv(loc.u_color, m.col.map((c) => c * dim));
  for (const [u, val] of [['u_ic', m.ic], ['u_ci', m.ci], ['u_c1', m.c1], ['u_s1', S.dissolveSoft ?? m.s1], ['u_r1', m.r1], ['u_c2', m.c2], ['u_s2', m.s2], ['u_r2', m.r2], ['u_add', 0]]) gl.uniform1f(loc[u], val);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  // the burn look: the old picture darkened just ahead of the edge (its colour times 1 − the pass, alpha kept)
  const ch = glowStyle().char;
  if (ch && bloomMask && it.drive > 0) {
    const bt = textures.get(`${bloomMask}|false`);
    if (bt && !bt.then) {
      const edge = edgeOf(it.drive, glowStyle());
      gl.blendFuncSeparate(gl.ZERO, gl.ONE_MINUS_SRC_COLOR, gl.ZERO, gl.ONE);
      maskPass(bt, bt.tex, edge + ch.lo, edge + ch.hi, ch.soft, WHITE, ch.a);
    }
  }
  return true;
}

// ---- the card ------------------------------------------------------------------------------------------------------

/**
 * Play the entrance on a result card (screens/settle.js TeamCard): once, from the moment the card mounts, after
 * `index × ANIM_DELAY_S`. Drives the card's CSS variables (--ce-a its opacity, --ce-root / --ce-card the illustration's
 * and the name card's offsets in px, --ce-round the rounds group's opacity) and draws the mattes into the card's two
 * `.tcard__ce` canvases. Under reduced motion the card shows the clip's last frame at once. Returns false — and the card
 * keeps its own look — when the manifest lacks a sprite or the page has no WebGL2.
 * @param {{ current: HTMLElement|null }} ref the card @param {{ index: number, kind: 'complete'|'normal' }} o
 */
export function useCardEntrance(ref, { index, kind }) {
  const [urls] = useState(() => {
    const u = entranceSprites();
    try { return u && glInit() ? u : null; } catch (err) { console.warn('[cardEntrance] WebGL2', err); return null; }
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!urls || !el) return undefined;
    const [base, add] = el.querySelectorAll('.tcard__ce');
    const head = el.querySelector('.tcard__head');
    const bg = el.querySelector('.tcard__cardbg');
    if (bg) { bg.style.borderImageSource = `url("${urls.card_bg}")`; bg.style.borderImageSlice = `${CARD_BG.border.top} ${CARD_BG.border.right} ${CARD_BG.border.bottom} ${CARD_BG.border.left} fill`; }
    const t0 =performance.now() + Math.max(0, index) * ANIM_DELAY_S * 1000;
    let raf = 0, ready = false, now = 0, live = true;
    const apply = (t) => {
      now = t;
      const w = el.getBoundingClientRect().width;
      if (!(w > 0)) return;
      const scale = w / (OVERLAY.right - OVERLAY.left);
      const d = domState(sampleShow(t));
      el.style.setProperty('--ce-a', String(d.alpha));
      el.style.setProperty('--ce-root', `${(-d.root * scale).toFixed(2)}px`);
      el.style.setProperty('--ce-card', `${(-d.card * scale).toFixed(2)}px`);
      el.style.setProperty('--ce-round', String(d.round));
      const top = (head ? head.offsetTop : 0) - (OVERLAY.top - STRIP_TOP) * scale;
      for (const c of [base, add]) { c.style.top = `${top}px`; c.style.height = `${(OVERLAY.top - OVERLAY.bottom) * scale}px`; }
      if (bg) {
        const [bx, by] = CARD_BG.pos, [bw, bh] = CARD_BG.size, b = CARD_BG.border;
        Object.assign(bg.style, { left: `${(bx - bw / 2 - OVERLAY.left) * scale}px`, top: `${top + (OVERLAY.top - (by + bh / 2)) * scale}px`,
          width: `${bw * scale}px`, height: `${bh * scale}px`, borderWidth: `${b.top * scale}px ${b.right * scale}px ${b.bottom * scale}px ${b.left * scale}px` });
      }
      if (ready) drawMattes({ base, add }, kind, t, scale * (globalThis.devicePixelRatio || 1), urls);
    };
    const tick = () => {
      if (!live) return;
      const t = (performance.now() - t0) / 1000;
      apply(Math.max(0, t));
      if (t < CLIP_LENGTH_S) raf = requestAnimationFrame(tick);
    };
    if (reducedMotion()) apply(CLIP_LENGTH_S); else tick();
    loadEntrance(urls).then(() => { if (live) { ready = true; apply(now); } }, (err) => console.warn('[cardEntrance] sprites', err));
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => apply(now)) : null;
    ro?.observe(el);
    return () => { live = false; cancelAnimationFrame(raf); ro?.disconnect(); };
  }, [urls, kind]);
  return !!urls;
}
