// render/vfx/rng.js — random numbers of the official battle effects (client-only cosmetics: not the sim's RNG).
// A seeded generator per particle system (mulberry32) so the dev viewer and the tests can replay an effect exactly,
// and a hash for the per-particle field randoms: Unity keeps one random number per particle and field (the r of
// render/vfx/curves.js), here derived from the particle's seed and a field id instead of stored.

/** Seeded generator: `.next()` → [0, 1). */
export class Rng {
  constructor(seed = 1) { this.s = (seed >>> 0) || 0x9e3779b9; }

  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** A 32-bit seed for a new particle. */
  seed() { return (this.next() * 4294967296) >>> 0; }

  range(a, b) { return a + (b - a) * this.next(); }
}

/** The random number of field `f` (a small integer) of the particle with seed `s`: [0, 1). */
export function hashRand(s, f) {
  let h = Math.imul((s ^ Math.imul(f + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// (fork) The engine's own particle randoms, for the fields whose rule is read from the client [src: official
// UnityPlayer.dll 2021.3.39 game build with its UnityPlayer.pdb; addresses as dbh lists them]. Unity's Random:
// x = seed, y = x·1812433253 + 1, z = y·…+1, w = z·…+1; a draw is t = x ^ (x << 11), (x, y, z) ← (y, z, w),
// w ← w ^ (w >>> 19) ^ t ^ (t >>> 8) (the state init 0x1abf460; the xorshift inlined at its callers). A system's
// particle seeds come from its InitialModule's four such generators, lane i seeded with the system seed + 0x16f·i
// (RandN::SetSeed 0x1491090, InitialModule::ResetSeed 0x1b0aec0, from ParticleSystem::ResetSeeds at Play);
// InitialModule::Start (0x1b0b9f0–0x1b0ba65) draws all four lanes once per four new particles of one emission call,
// the call's particle j taking lane j mod 4. A field's random is the first draw of Random(particle seed + the field's
// constant), its low 23 bits / 2^23 (the texture sheet's: UpdateSingleRow2Tpl / UpdateWholeSheet2Tpl, the constants
// at 0x28a2210, 0x28a2220, 0x28a2230: frame over time, start frame, row).
const UNITY_K = 0x6c078965;

function unityState(s, st) {
  st[0] = s >>> 0;
  st[1] = (Math.imul(st[0], UNITY_K) + 1) >>> 0;
  st[2] = (Math.imul(st[1], UNITY_K) + 1) >>> 0;
  st[3] = (Math.imul(st[2], UNITY_K) + 1) >>> 0;
  return st;
}

function unityDraw(st) {
  const x = st[0], w = st[3];
  const t = (x ^ (x << 11)) >>> 0;
  st[0] = st[1]; st[1] = st[2]; st[2] = w;
  return (st[3] = (w ^ (w >>> 19) ^ t ^ (t >>> 8)) >>> 0);
}

const _ust = new Uint32Array(4);

/** Unity's random of the field with constant `c` (UR) of the particle with engine seed `s`: [0, 1). */
export function unityRand(s, c) {
  return (unityDraw(unityState((s + c) >>> 0, _ust)) & 0x7fffff) / 8388608;
}

/** The field constants of unityRand. */
export const UR = Object.freeze({ START_FRAME: 0x56b3dbb0, FRAME: 0x13740583, ROW: 0xaf502044 });

/** A system's particle seeds as the engine hands them out (see above): `.batch()` starts an emission call. */
export class UnitySeeds {
  constructor(seed) {
    this.lanes = [0, 1, 2, 3].map((i) => unityState((seed + 0x16f * i) >>> 0, new Uint32Array(4)));
    this.out = new Uint32Array(4);
    this.lane = 4;
  }

  /** A new emission call: its first particle takes lane 0 of a fresh draw. */
  batch() { this.lane = 4; }

  /** The engine seed of the call's next particle. */
  next() {
    if (this.lane >= 4) { for (let i = 0; i < 4; i++) this.out[i] = unityDraw(this.lanes[i]); this.lane = 0; }
    return this.out[this.lane++];
  }
}

/** Field ids of hashRand (one per particle property that keeps a random number). */
export const RF = Object.freeze({
  LIFETIME: 0, SPEED: 1, SIZE: 2, SIZE_Y: 3, SIZE_Z: 4, ROT: 5, ROT_X: 6, ROT_Y: 7, COLOR: 8, GRAVITY: 9,
  SIZE_OL: 10, ROT_OL: 11, COLOR_OL: 12, VEL_X: 13, VEL_Y: 14, VEL_Z: 15, ORB_X: 16, ORB_Y: 17, ORB_Z: 18,
  RADIAL: 19, SPEED_MOD: 20, LIMIT: 21, DRAG: 22, FORCE_X: 23, FORCE_Y: 24, FORCE_Z: 25, FRAME: 26, START_FRAME: 27,
  ROW: 28, FLIP_U: 29, FLIP_V: 30, FLIP_X: 31, FLIP_Y: 32, FLIP_Z: 33, ROT_DIR: 34, NOISE: 35, TRAIL: 36,
  TRAIL_LIFE: 37, CUSTOM: 38, MESH: 39, INHERIT: 40, ROT_OL_X: 41, ROT_OL_Y: 42, SIZE_OL_Y: 43, SIZE_OL_Z: 44,
  COLOR_SPEED: 45, SIZE_SPEED: 46, ROT_SPEED: 47, LIFE_SPEED: 48, SUB: 49, TRAIL_W: 50, TRAIL_C: 51, OFFSET_X: 52,
});
