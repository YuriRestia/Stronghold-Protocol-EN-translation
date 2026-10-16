// public/js/render/fx/noteTrails.js — the official trail layers of 丰川祥子's notes (render/fx/notes.js draws them).
// Read from the client's TrailRenderers (battle/prefabs/effects/oblvns.ab, 2026-10-16): per look and note family, its
// layers bottom to top — `tex` the texture under notes/oblvns (tools/local-extract: oblvns.ab + refs/fx/texture/*.ab),
// `rect` its material tiling [scale u, scale v, offset u, offset v] (u along the trail, v across it), `add` additive
// (else normal) blending, `w` the width (tiles: widthMultiplier × the flat widthCurve), `col` / `a` the colour and alpha
// keys along it (0 = the head, 1 = the tail). The default look: a solid band (rosmon_xxx_05_02, its fade across) in the
// family's red / magenta with the added wavy strands (oblvns_trail_01: white at the head turning pink) and dot sparkle
// (pattern_07) on it; 旋律的主人: the blue sparkling band (oblvns_skin_03) under the ribbon strips (oblvns_skin_11 /
// oblvns_skin_09). The colour comes from `col` (the textures are white or carry their own blue); S1's eight notes narrow
// with their damage (TRAIL_S1_W). Talent notes (`talent`) draw no trail (NOTE_FX).

export const TRAIL_LAYERS = Object.freeze({
  default: {
    attack: [
      { tex: 'rosmon_xxx_05_02', rect: [1, 1, 0, 0], add: false, us: 0, w: 0.1, time: 0.35,
        col: [[0.08, 0xad0100], [0.79, 0xff0000]], a: [[0, 1], [1, 1]] },
      { tex: 'oblvns_trail_01', rect: [1, 1, 0, 0], add: true, us: -1.2, w: 0.14, time: 0.4,
        col: [[0.08, 0xffffff], [0.48, 0xff47a4]], a: [[0, 0.9], [1, 0]] },
      { tex: 'pattern_07', rect: [0.8, 0.2, 0, 0], add: true, us: -0.6, w: 0.1, time: 0.3,
        col: [[0.27, 0xffffff], [0.49, 0xffb3b3], [1, 0xff3434]], a: [[0, 0], [0.08, 1], [0.72, 0.1]] },
    ],
    s1: [
      { tex: 'rosmon_xxx_05_02', rect: [1, 1, 0, 0], add: false, us: 0, w: 0.16, time: 0.3,
        col: [[0.06, 0xff8ac0], [1, 0xff0073]], a: [[0, 1], [1, 1]] },
      { tex: 'oblvns_trail_01', rect: [1, 1, 0, 0], add: true, us: -1.2, w: 0.18, time: 0.32,
        col: [[0.08, 0xffffff], [0.48, 0xff47a4]], a: [[0.01, 1], [1, 0.1]] },
      { tex: 'pattern_07', rect: [0.8, 0.2, 0, 0], add: true, us: -0.6, w: 0.16, time: 0.2,
        col: [[0.27, 0xffffff], [0.57, 0xffcee4], [1, 0xff58ba]], a: [[0, 0], [0.08, 1], [0.72, 0.1]] },
    ],
    s2: [
      { tex: 'rosmon_xxx_05_02', rect: [1, 1, 0, 0], add: false, us: 0, w: 0.14, time: 0.5,
        col: [[0.08, 0xad0100], [0.79, 0xff0000]], a: [[0, 1], [1, 1]] },
      { tex: 'oblvns_trail_01', rect: [1.2, 1, 0, 0], add: true, us: -1.2, w: 0.16, time: 0.6,
        col: [[0.08, 0xffffff], [0.48, 0xff00e7]], a: [[0.01, 1], [1, 0]] },
      { tex: 'pattern_07', rect: [1, 0.2, 0, 0], add: true, us: -0.5, w: 0.14, time: 0.4,
        col: [[0.27, 0xffffff], [0.49, 0xffb3b3], [1, 0xff3434]], a: [[0, 0], [0.08, 1], [0.72, 0.1]] },
    ],
    s2_slow: [
      { tex: 'rosmon_xxx_05_02', rect: [1, 1, 0, 0], add: false, us: 0, w: 0.15, time: 1.2,
        col: [[0.06, 0xff8ac0], [1, 0xff0073]], a: [[0, 1], [1, 1]] },
      { tex: 'oblvns_trail_01', rect: [1, 1, 0, 0], add: true, us: -1, w: 0.17, time: 1.5,
        col: [[0.08, 0xffffff], [0.48, 0xff47a4]], a: [[0.01, 1], [0.99, 0]] },
      { tex: 'pattern_07', rect: [0.8, 0.2, 0, 0], add: true, us: -0.6, w: 0.15, time: 0.8,
        col: [[0.27, 0xffffff], [0.57, 0xffcee4], [1, 0xff58ba]], a: [[0, 0], [0.08, 1], [0.72, 0.1]] },
    ],
    s3_phy: [
      { tex: 'rosmon_xxx_05_02', rect: [1, 1, 0, 0], add: false, us: 0, w: 0.1, time: 0.4,
        col: [[0.08, 0xad0100], [0.79, 0xff0000]], a: [[0, 1], [1, 1]] },
      { tex: 'oblvns_trail_01', rect: [1, 1, 0, 0], add: true, us: -1, w: 0.12, time: 0.6,
        col: [[0.08, 0xffffff], [0.48, 0xff00e7]], a: [[0.01, 1], [1, 0]] },
      { tex: 'pattern_07', rect: [0.8, 0.2, 0, 0], add: true, us: -0.6, w: 0.1, time: 0.4,
        col: [[0.27, 0xffffff], [0.49, 0xffb3b3], [1, 0xff3434]], a: [[0, 0], [0.08, 1], [0.72, 0.1]] },
    ],
    s3_mag: [
      { tex: 'rosmon_xxx_05_02', rect: [1, 1, 0, 0], add: false, us: 0, w: 0.1, time: 0.4,
        col: [[0.06, 0xff8ac0], [1, 0xff0073]], a: [[0, 1], [1, 1]] },
      { tex: 'oblvns_trail_01', rect: [1, 1, 0, 0], add: true, us: -1, w: 0.12, time: 0.6,
        col: [[0.08, 0xffffff], [0.48, 0xff47a4]], a: [[0.01, 1], [1, 0]] },
      { tex: 'pattern_07', rect: [0.8, 0.2, 0, 0], add: true, us: -0.6, w: 0.1, time: 0.4,
        col: [[0.27, 0xffffff], [0.57, 0xffcee4], [1, 0xff58ba]], a: [[0, 0], [0.08, 1], [0.72, 0.1]] },
    ],
  },
  avemujica: {
    attack: [
      { tex: 'oblvns_skin_03', rect: [0.7, 0.66, 0, 0.35], add: false, us: -1, w: 0.37, time: 0.7,
        col: [[0, 0x556afb], [0.71, 0x5636b8]], a: [[0, 0], [0.05, 1], [1, 0.1]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0.33], add: false, us: -1, w: 0.15, time: 0.7,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.29, 1], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0.33], add: true, us: -1, w: 0.15, time: 0.7,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.63, 0]] },
    ],
    s1: [
      { tex: 'oblvns_skin_03', rect: [0.7, 0.66, 0, 0.35], add: false, us: -1, w: 0.407, time: 0.3,
        col: [[0, 0x556afb], [0.71, 0x5636b8]], a: [[0, 0], [0.05, 1], [1, 0.1]] },
      { tex: 'oblvns_skin_09', rect: [0.7, 0.33, 0, 0.33], add: false, us: -1, w: 0.18, time: 0.3,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.26, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0], add: false, us: -1, w: 0.18, time: 0.3,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.29, 1], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0], add: true, us: -1, w: 0.18, time: 0.3,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.63, 0]] },
    ],
    s2: [
      { tex: 'oblvns_skin_03', rect: [0.7, 0.66, 0, 0.35], add: false, us: -1, w: 0.37, time: 0.5,
        col: [[0, 0x556afb], [0.71, 0x5636b8]], a: [[0.14, 0], [0.25, 1], [0.67, 0.27], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0.33], add: false, us: -1, w: 0.18, time: 0.5,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0.15, 0], [0.24, 1], [0.4, 1], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0.33], add: true, us: -1, w: 0.18, time: 0.5,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0.15, 0], [0.29, 1], [0.63, 0]] },
    ],
    s2_slow: [
      { tex: 'oblvns_skin_03', rect: [0.7, 0.66, 0, 0.35], add: false, us: -1, w: 0.37, time: 1.2,
        col: [[0, 0x556afb], [0.71, 0x5636b8]], a: [[0.03, 0], [0.14, 1], [0.69, 0.13], [1, 0]] },
      { tex: 'oblvns_skin_09', rect: [0.7, 0.33, 0, 0.33], add: false, us: -1, w: 0.22, time: 1.2,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.26, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0], add: false, us: -1, w: 0.18, time: 1.2,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0.04, 0], [0.16, 1], [0.29, 1], [0.74, 0.21], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.7, 0.33, 0, 0], add: true, us: -1, w: 0.18, time: 1.2,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0.05, 0], [0.18, 1], [0.46, 0.22], [0.63, 0]] },
    ],
    s3_phy: [
      { tex: 'oblvns_skin_03', rect: [0.5, 0.66, 0, 0.35], add: false, us: -0.5, w: 0.37, time: 0.6,
        col: [[0, 0x556afb], [0.71, 0x5636b8]], a: [[0.12, 0], [0.26, 1], [0.64, 0.29], [0.99, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.5, 0.33, 0, 0.33], add: false, us: -0.5, w: 0.16, time: 0.7,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0.13, 0], [0.27, 1], [0.53, 1], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.5, 0.33, 0, 0.33], add: true, us: -0.5, w: 0.16, time: 0.7,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0.15, 0], [0.29, 1], [0.63, 0]] },
    ],
    s3_mag: [
      { tex: 'oblvns_skin_03', rect: [0.5, 0.66, 0, 0.35], add: false, us: -0.5, w: 0.37, time: 0.6,
        col: [[0, 0x556afb], [0.71, 0x5636b8]], a: [[0, 0], [0.05, 1], [0.77, 0.15], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.5, 0.33, 0, 0], add: false, us: -0.5, w: 0.16, time: 0.7,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.29, 1], [1, 0]] },
      { tex: 'oblvns_skin_11', rect: [0.5, 0.33, 0, 0], add: true, us: -0.5, w: 0.16, time: 0.7,
        col: [[0, 0xffffff], [1, 0xffffff]], a: [[0, 0], [0.1, 1], [0.63, 0]] },
    ],
  },
});

/**
 * S1's eight notes (look `s1_1` … `s1_8`): each prefab narrows its trail with the note's falling 攻击倍率 (default
 * trail_01 0.18 → 0.03; the outfit's Trail_01 the same) — this × the family's widths, the k-th note.
 */
export const TRAIL_S1_W = Object.freeze([1, 0.89, 0.78, 0.67, 0.56, 0.44, 0.33, 0.17]);
/**
 * …and its glyph: the default look's note particle (music02, startSize 0.4 → 0.07), the outfit's tip holder (local
 * scale 1.0 → 0.3) — × the S1 glyph size.
 */
export const GLYPH_S1_SCALE = Object.freeze({
  default: Object.freeze([1, 0.875, 0.75, 0.625, 0.5, 0.375, 0.25, 0.175]),
  avemujica: Object.freeze([1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3]),
});

/** A gradient's value at `t` (keys [[t, v]…] sorted, held flat past the ends); `rgb` lerps per channel. */
export function gradAt(keys, t, rgb = false) {
  if (!keys || !keys.length) return rgb ? 0xffffff : 1;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t > t1) continue;
    const [t0, v0] = keys[i - 1];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
    if (!rgb) return v0 + (v1 - v0) * f;
    const ch = (s) => (((v0 >> s) & 255) + ((((v1 >> s) & 255) - ((v0 >> s) & 255)) * f)) | 0;
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
  }
  return keys[keys.length - 1][1];
}
