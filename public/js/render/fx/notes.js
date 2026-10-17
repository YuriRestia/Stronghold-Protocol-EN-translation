// public/js/render/fx/notes.js — 丰川祥子's free-flight notes (sim server/sim/notes.js; b.snap `notes`, render/interp.js
// notesAt). Each note is drawn every frame where the sim has it: a glowing head and a ribbon trail that follows its
// path (wandering sines, the loop back to a target behind her), in the look of its owner's outfit:
//   default look (校服 / keyboard)  — the same note glyphs (oblvns_skin_04 / _05) tinted pink-red (the owner's reading of
//                                    the official look, 2026-10-16; the trail tints of oblvns_attack_01_trail's materials)
//                                    and its oblvns_03 sparks
//   旋律的主人 (char_4182_oblvns@avemujica#1) — blue-white: the *_avemujica#1 effects (oblvns_skin_04 / _05 glyphs as
//                                    they are, star_268 bursts, ray_130 rings)
// The textures come from the local client (tools/local-extract: public/assets/local/notes/oblvns, git-ignored); without them
// the note is drawn from the FX atlas (a soft glow and a drawn ♪ glyph) in the same colours. Cosmetic only.

import { TRAIL_LAYERS, TRAIL_S1_W, GLYPH_S1_SCALE, gradAt } from './noteTrails.js';
import { bodyZ, SHOT_HEIGHT } from './camera.js';

const TRAIL_POINTS = 160;       // path points kept per note (oldest dropped)
const TRAIL_COLS = 48;          // columns of a trail layer's strip
// tiles: a point is added once the head moved this far — the official TrailRenderers' m_MinVertexDistance (0.1). Closer
// points made the strip wobble on a straight flight: the snapshot rounds positions to 0.01 tiles, so each 0.02-tile
// segment's direction was mostly rounding noise
const TRAIL_MIN_STEP = 0.1;
/**
 * A trail layer lives as long as the client's (TrailRenderer m_Time, 0.2–1.5 game s: noteTrails.js `time`): each path
 * point dies that long after the note passed it, so the tail fades out there (owner 2026-10-16: our fixed 1.8–2.4
 * tiles were too long) — ≈ 0.7 tiles for an attack note, 2.1 for a piano one. Widths: TRAIL_W_SCALE × the official
 * (the owner, 2026-10-16: the client's read too thin next to the glyph) [ASSUMED].
 */
const TRAIL_W_SCALE = 1.4;
/**
 * Layer textures drawn at their true aspect instead of stretched over the trail (pattern_07's dots): their tiling along
 * the trail follows the tiling across it at the family's nominal length (its trace speed × the layer's time).
 */
const ROUND_TEX = new Set(['pattern_07']);
const TRACE_SPEED = Object.freeze({ attack: 2, s1: 2.2, s2: 3.5, s2_slow: 1, s3_phy: 1.3, s3_mag: 1.3 });
/** Without the client's trail textures: one plain band of the look's trail colour, this wide (tiles). */
const TRAIL_FALLBACK_W = 0.2;
/**
 * The glyph quad's size (tiles) per note family: the official `tip_01` particle startSize of each *_avemujica#1 trail
 * (oblvns.ab: attack / talent 0.3, skill_01 0.45, skill_02_trail_02 (piano) 0.35, skill_02 (organ) 0.38, skill_03 0.3 /
 * _02 0.33); both looks draw the same glyph sheets.
 */
const GLYPH_SIZES = Object.freeze({ attack: 0.3, talent: 0.3, s1: 0.45, s2: 0.35, s2_slow: 0.38, s3_phy: 0.33, s3_mag: 0.3 });
const GLYPH_SIZE = 0.3;         // the fallback
/**
 * Which notes draw a trail and which a glow ring (the owner's reading of the game, 2026-10-16): a basic attack with
 * a target ('attack': it starts locked) both; without one ('talent': it starts free) only the ring, no trail; S1 a
 * trail, no ring; S2 piano both, organ the trail only; S3's physical notes are piano notes, its arts notes organ ones.
 */
const NOTE_FX = Object.freeze({
  attack: { trail: true, ring: true }, talent: { trail: false, ring: true }, s1: { trail: true, ring: false },
  s2: { trail: true, ring: true }, s2_slow: { trail: true, ring: false },
  s3_phy: { trail: true, ring: true }, s3_mag: { trail: true, ring: false },
});
// the ring sprite × the glyph quad: the atlas ring's bright band sits at ~0.86 of its width; the owner's official
// captures (2026-10-16) show a tight bubble, its circle ~1.2× the note's ink height (~0.24 of her sprite's height)
const RING_SIZE = 0.8;
/** [ASSUMED] the grow-in at launch (the owner: "starts small and scales up"): GROW_FROM → GROW_TO × the size in GROW_T s;
 * at full size the note's ink is ~0.2 of her sprite's height (the owner's official captures, 2026-10-16). */
const GROW_FROM = 0.45, GROW_TO = 1.3, GROW_T = 0.5;
/** The glyph sheets' lift (grey by the brightest channel, then ^gamma): low = nearer white (owner 2026-10-16). */
const GLYPH_GAMMA = 0.4;
/** The official trail materials scroll their texture along the trail (_MainUSpeed, texture units per game s:
 * noteTrails.js `us`): baked as SCROLL_PHASES frames of the texture shifted, the colour / alpha keys staying put. */
const SCROLL_PHASES = 24;
const FADE = 0.25;              // real s a note lingers (shrinking) after the sim dropped it
/** Fade-in at launch (s; the trail with the note), from the prefabs: the note's root particle (oblvns_attack_01_trail/…/dan: alpha 0 → 1
 * by 0.11 of its 0.6 s life) and its bubble (…/dan/huan_x: by 0.24 of 1 s). */
const FADE_IN = 0.066, RING_FADE_IN = 0.24;
const HEAD_Z = 0.55;            // the height (tiles) of a note whose owner and target are both gone
/**
 * Its height is the client's own (the sim is 2D): born at her launch height (SHOT_HEIGHT.launch, as her bullets), a
 * locked note (snapshot `tgt`) descends / rises with the distance it has left, so it meets its enemy at that enemy's
 * HitPoint when it is a boss (where the official hit spawns, off its centre — the drawn note bends there from the sim's
 * 2D path, in step with the same distance), else its body (SHOT_HEIGHT.aim, where bullets strike); a free note drifts
 * back to her launch height and its sim path (FREE_EASE per s).
 */
const FREE_EASE = 3;
const HIT_T = 0.32;             // real s of a hit burst (the official hit prefabs flash for ~0.3 s)
const MAX_HITS = 24;            // bursts alive at once (a Fever volley strikes many times a second)

/** The two looks: colours from the official materials (_TintColor / _MainColor), texture names under notes/oblvns. */
export const NOTE_LOOKS = Object.freeze({
  default: {
    head: 0xff5a8c, glow: 0xff2a5a, trail: 0xff4f86, trailCore: 0xffd0de, spark: 0xffb0c8,
    // the glyph near white with a pink cast (owner 2026-10-16: it must stand out against the red / pink trail)
    glyphs: ['oblvns_skin_04', 'oblvns_skin_05'], glyphTint: 0xffe4ee, burst: 'oblvns_03', ring: null,
  },
  avemujica: {
    head: 0xe8f0ff, glow: 0x6f7dff, trail: 0x7a86ff, trailCore: 0xf2f4ff, spark: 0xffffff,
    // near white with a blue cast (owner 2026-10-16, as the default look's)
    glyphs: ['oblvns_skin_04', 'oblvns_skin_05'], glyphTint: 0xeef2ff, burst: 'star_268', ring: 'ray_130',
  },
});

/** The look of a note: the owner's worn outfit (its view's `info.model`, render/units.js) decides. */
export function noteLookOf(ownerView) {
  const m = ownerView?.info?.model;
  return typeof m === 'string' && m.includes('avemujica') ? 'avemujica' : 'default';
}

/** S1's glyph cells: oblvns_skin_04 / _05 are 2×2 sheets of four notes (the eight trails pick one each). */
const SHEET = Object.freeze([[0, 0], [1, 0], [0, 1], [1, 1]]);

export class NoteLayer {
  /**
   * @param {{ P: any, layer: any, cam: () => any, view: (id) => any, localUrl: (group: string, name: string) => string|null,
   *           fxTex: any }} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.P = ctx.P;
    this.root = new ctx.P.Container();
    ctx.layer.addChild(this.root);
    this.notes = new Map();   // note id → { head, lift, glow, trail, pts, look, size, t, seen, fade }
    this.hits = [];           // hit bursts { sp, flash, look, x, y, t, rot }
    this._tex = new Map();
    this._p = { x: 0, y: 0, s: 0, depth: 0 };
    /**
     * 'official' (default): a note is drawn by its official projectile prefab (ctx.official: render/vfx/wiring.js
     * noteFlight / noteHit) whenever the official effects are on, and this layer builds nothing for it — ours is the
     * fallback (官方特效 off, none extracted, the 2D board). 'ours': always this layer (the sandbox's comparison).
     */
    this.mode = 'official';
  }

  /** Draw the notes launched from now on as 'official' (ours as the fallback) or always 'ours'. */
  setMode(m) { this.mode = m === 'ours' ? 'ours' : 'official'; }

  /** Whether the official effects draw notes now. */
  _officialOn() {
    const o = this.ctx.official;
    return this.mode === 'official' && !!o && typeof o.flight === 'function' && (typeof o.active !== 'function' || !!o.active());
  }

  /** A local texture of notes/oblvns (cached; null when the client art is absent). */
  tex(name) {
    if (!name) return null;
    if (this._tex.has(name)) return this._tex.get(name);
    let t = null;
    try {
      const url = this.ctx.localUrl('notes/oblvns', name);
      if (url) t = this.P.Texture.from(encodeURI(url));
    } catch { t = null; }
    this._tex.set(name, t);
    return t;
  }

  /**
   * A glyph sheet made bright (cached): the official sheets are a mid blue-white (average ≈ 125 / 136 / 195), so a tint
   * — a multiply — turned the default look's pink into a dark purple under its own white glow. `white` = grey by each
   * pixel's brightest channel (the tint then gives the look's colour at full strength), else the hue kept; both lifted
   * (GLYPH_GAMMA) so the glyph is the brightest part of the note. Drawn into a canvas once its image loads; null without
   * a DOM or the local art.
   */
  _bright(name, white) {
    const key = `${name}~${white ? 'w' : 'b'}`;
    if (this._tex.has(key)) return this._tex.get(key);
    let t = null;
    try {
      const url = this.ctx.localUrl('notes/oblvns', name);
      if (url && typeof document !== 'undefined' && typeof Image !== 'undefined') {
        const SIZE = 256;   // every notes/oblvns glyph sheet is 256²
        const cv = document.createElement('canvas');
        cv.width = cv.height = SIZE;
        t = this.P.Texture.from(cv);
        const img = new Image();
        img.onload = () => {
          try {
            const g = cv.getContext('2d', { willReadFrequently: true });
            g.clearRect(0, 0, SIZE, SIZE);
            g.drawImage(img, 0, 0, SIZE, SIZE);
            const d = g.getImageData(0, 0, SIZE, SIZE), px = d.data;
            let top = 1;
            for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 8) top = Math.max(top, px[i], px[i + 1], px[i + 2]);
            for (let i = 0; i < px.length; i += 4) {
              const m = Math.max(px[i], px[i + 1], px[i + 2]);
              if (!m) continue;
              const v = 255 * Math.pow(m / top, GLYPH_GAMMA);
              if (white) px[i] = px[i + 1] = px[i + 2] = v;
              else { const s = v / m; px[i] = Math.min(255, px[i] * s); px[i + 1] = Math.min(255, px[i + 1] * s); px[i + 2] = Math.min(255, px[i + 2] * s); }
            }
            g.putImageData(d, 0, 0);
            t.baseTexture.update();
          } catch { /* a tainted canvas: the sheet stays empty, the glow and trail still show */ }
        };
        img.src = encodeURI(url);
      }
    } catch { t = null; }
    this._tex.set(key, t);
    return t;
  }

  /** A glyph cell of a 2×2 sheet (or the whole texture), per note index. */
  _glyph(L, idx) {
    if (!L.glyphs) return null;
    const name = L.glyphs[idx % L.glyphs.length];
    const base = this._bright(name, true) || this.tex(name);
    if (!base) return null;
    if (!/skin_0[45]$/.test(name)) return base;
    const key = `${name}#${idx % 4}w`;
    if (this._tex.has(key)) return this._tex.get(key);
    let t = null;
    try {
      const [cx, cy] = SHEET[idx % 4];
      const w = base.width / 2, h = base.height / 2;
      if (w > 1 && h > 1) t = new this.P.Texture(base.baseTexture, new this.P.Rectangle(cx * w, cy * h, w, h));
    } catch { t = null; }
    if (t) this._tex.set(key, t);
    return t || base;
  }

  _make(n, L) {
    const P = this.P;
    const lk = NOTE_LOOKS[L];
    const glow = new P.Sprite(this.ctx.fxTex.glow || P.Texture.WHITE);
    glow.anchor.set(0.5); glow.blendMode = P.BLEND_MODES.ADD; glow.tint = lk.glow; glow.alpha = 0.75;
    const idx = /^s1_(\d)$/.test(n.look) ? Number(n.look.slice(3)) - 1 : (n.id % 4);
    const gt = this._glyph(lk, idx);
    // the official glyph in the look's tint; without the local client art a small drawn ♪ in the same colour
    const mk = () => {
      const s = gt ? new P.Sprite(gt) : new P.Text(idx % 2 ? '♪' : '♫', { fontFamily: 'sans-serif', fontSize: 48, fill: lk.head });
      s.anchor.set(0.5);
      if (gt) s.tint = lk.glyphTint;
      return s;
    };
    // the glyph is the head and the brightest part: drawn opaque (not only added onto the dark field), with an added
    // copy on top that lifts it to its full colour; the glow and the trail stay under it
    const head = mk();
    const lift = mk(); lift.blendMode = P.BLEND_MODES.ADD;
    const fam = /^s1_/.test(n.look) ? 's1' : n.look;
    const fx = NOTE_FX[fam] ?? NOTE_FX.attack;
    // the trail: the family's official layers (noteTrails.js), one textured strip each, under the glow and the glyph
    const s1k = /^s1_(\d)$/.test(n.look) ? Number(n.look.slice(3)) - 1 : -1;
    const layers = fx.trail ? this._trailLayers(L, fam, s1k) : [];
    const trail = new P.Container();
    for (const l of layers) trail.addChild(l.mesh);
    // the glow ring (bubble) around the note, in the look's glow colour
    let ring = null;
    if (fx.ring) {
      ring = new P.Sprite(this.ctx.fxTex.ring || this.ctx.fxTex.glow || P.Texture.WHITE);
      ring.anchor.set(0.5); ring.blendMode = P.BLEND_MODES.ADD; ring.tint = lk.glow;
    }
    this.root.addChild(trail, glow);
    if (ring) this.root.addChild(ring);
    this.root.addChild(head, lift);
    // S1's k-th note: its glyph as small as the prefab draws it (its damage falls along the volley)
    const size = (GLYPH_SIZES[fam] ?? GLYPH_SIZE) * (s1k >= 0 ? GLYPH_S1_SCALE[L][s1k] ?? 1 : 1);
    const life = layers.reduce((m, l) => Math.max(m, l.time), 0);
    return { head, lift, glow, ring, trail, layers, hasTrail: layers.length > 0, life, pts: [], look: L, lk, size, t: 0, seen: 0, fade: 0, x: n.x, y: n.y,
      z: this._launchZ(n.owner), lock: null, z0: 0, d0: 0, ox: 0, oy: 0, ox0: 0, oy0: 0 };
  }

  /**
   * A note struck (sim fx 'note' on 'hit'): the burst of its look at (x, y) — the default look's red spark
   * (oblvns_attack_01_hit: oblvns_03), 旋律的主人's blue four-point star (…_avemujica#1: star_268) — with a flash.
   */
  hit(ex, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // at the struck enemy's HitPoint / body (where its note was heading); else the note's own height
    const tv = ex.tgt != null ? this.ctx.view(ex.tgt) : null;
    const hp = tv && !tv.destroyed ? this._hitPt(tv) : null;
    if (hp) { x = hp.x; y = hp.y; }
    const z = hp ? hp.z : tv && !tv.destroyed ? bodyZ(this.ctx.cam(), tv, SHOT_HEIGHT.aim) : this.notes.get(ex.id)?.z ?? HEAD_Z;
    // an official note strikes with its projectile's official hit (ours only when that cannot play)
    const rec = this.notes.get(ex.id);
    if ((rec ? !!rec.ofx : this._officialOn()) && typeof this.ctx.official?.hit === 'function') {
      let ok;
      try { ok = this.ctx.official.hit(this.ctx.view(ex.owner), ex.look || '', tv && !tv.destroyed ? tv : null, x, y, z); } catch { ok = false; }
      if (ok) return;
    }
    const P = this.P;
    const L = noteLookOf(this.ctx.view(ex.owner));
    const lk = NOTE_LOOKS[L];
    const tex = this.tex(lk.burst);
    const sp = new P.Sprite(tex || this.ctx.fxTex.glow || P.Texture.WHITE);
    sp.anchor.set(0.5); sp.blendMode = P.BLEND_MODES.ADD; sp.tint = tex ? 0xffffff : lk.glow;
    const flash = new P.Sprite(this.ctx.fxTex.glow || P.Texture.WHITE);
    flash.anchor.set(0.5); flash.blendMode = P.BLEND_MODES.ADD; flash.tint = lk.spark;
    this.root.addChild(flash, sp);
    this.hits.push({ sp, flash, x, y, z, t: 0, rot: (ex.id % 8) * 0.39, big: /^s2$|^s3/.test(ex.look || '') });
    while (this.hits.length > MAX_HITS) { const h = this.hits.shift(); h.sp.destroy(); h.flash.destroy(); }
  }

  _updateHits(dt, cam) {
    const p = this._p;
    let w = 0;
    for (const h of this.hits) {
      h.t += dt;
      if (h.t >= HIT_T) { h.sp.destroy(); h.flash.destroy(); continue; }
      const u = h.t / HIT_T;
      cam.project(h.x, h.y, h.z, p);
      const size = p.s * (h.big ? 0.7 : 0.5) * (0.6 + 0.6 * (1 - (1 - u) * (1 - u)));
      h.sp.position.set(p.x, p.y); h.sp.width = h.sp.height = size; h.sp.rotation = h.rot + u * 0.6; h.sp.alpha = 1 - u;
      h.flash.position.set(p.x, p.y); h.flash.width = h.flash.height = size * 0.8 * (1 - u * 0.5); h.flash.alpha = 0.8 * (1 - u) * (1 - u);
      this.hits[w++] = h;
    }
    this.hits.length = w;
  }

  /** Draw the notes of this frame (`list` from interp.notesAt). */
  sync(list, dt, frame, now = null) {
    const cam = this.ctx.cam();
    if (!cam) return;
    // the trails age in game time (the render clock; without one, this layer's own)
    this._now = Number.isFinite(now) ? now : (this._now ?? 0) + dt;
    const T = this._now;
    const p = this._p;
    if (this.hits.length) this._updateHits(dt, cam);
    for (const n of list) {
      let r = this.notes.get(n.id);
      // the official effects switched off mid-flight: the note goes on as ours
      if (r && r.ofx && !this._officialOn()) { this._drop(r); r = null; }
      if (!r) { r = this._official(n) || this._make(n, noteLookOf(this.ctx.view(n.owner))); this.notes.set(n.id, r); }
      r.seen = frame; r.fade = 0;
      this._height(r, n, cam, dt);
      r.x = n.x + r.ox; r.y = n.y + r.oy;
      if (r.ofx) { const a = r.at; a.x = r.x; a.y = r.y; a.z = r.z; a.hx = n.hx; a.hy = n.hy; continue; }
      const last = r.pts[r.pts.length - 1];
      if (!last || Math.hypot(r.x - last[0], r.y - last[1]) >= TRAIL_MIN_STEP) {
        r.pts.push([r.x, r.y, T, r.z]);
        if (r.pts.length > TRAIL_POINTS) r.pts.splice(0, r.pts.length - TRAIL_POINTS);
      }
    }
    for (const [id, r] of this.notes) {
      // an official note: its prefab draws (and fades) it; gone from the snapshot, it stops
      if (r.ofx) { if (r.seen !== frame) { this._drop(r); this.notes.delete(id); } continue; }
      if (r.seen !== frame) {
        r.fade += dt;
        if (r.fade >= FADE) { this._drop(r); this.notes.delete(id); continue; }
      }
      const k = 1 - r.fade / FADE;
      if (r.seen === frame) r.t += dt;
      cam.project(r.x, r.y, r.z, p);
      const s = p.s;
      // it starts small and grows (ease-out) to its full size
      const g = Math.min(1, r.t / GROW_T);
      const grow = GROW_FROM + (GROW_TO - GROW_FROM) * (1 - (1 - g) * (1 - g));
      // the glyph cell is mostly empty around the note: its quad is `size` tiles, the note itself ~2/3 of that
      const hs = s * r.size * grow * k;
      const tex = r.head.texture;
      const asp = tex && tex.height > 0 ? tex.width / tex.height : 1;
      for (const sp of [r.head, r.lift]) { sp.position.set(p.x, p.y); sp.height = hs; sp.width = hs * asp; }
      r.glow.position.set(p.x, p.y);
      r.glow.width = r.glow.height = hs * 0.95;
      const kin = k * Math.min(1, r.t / FADE_IN);
      r.head.alpha = kin; r.lift.alpha = kin; r.glow.alpha = 0.35 * kin;
      if (r.ring) {
        r.ring.position.set(p.x, p.y);
        r.ring.width = r.ring.height = hs * RING_SIZE;
        r.ring.alpha = 0.8 * k * Math.min(1, r.t / RING_FADE_IN);
      }
      if (r.hasTrail) {
        // points older than the longest layer are gone (one kept past it, so the tail can be placed between)
        let cut = 0;
        while (cut < r.pts.length - 1 && T - r.pts[cut + 1][2] > r.life) cut++;
        if (cut) r.pts.splice(0, cut);
        this._ribbon(r, cam, k, T);
      }
    }
  }

  /**
   * A new note drawn by its official projectile prefab (ctx.official.flight, following r.at): a bare record — its
   * height only (_height), no sprite, trail strip or baked texture of this layer. null when the official effects do
   * not draw it (off, the prefab missing): the note is ours.
   */
  _official(n) {
    if (!this._officialOn()) return null;
    const r = { ofx: null, at: null, seen: 0, fade: 0, x: n.x, y: n.y, z: this._launchZ(n.owner), lock: null, z0: 0, d0: 0,
      ox: 0, oy: 0, ox0: 0, oy0: 0 };
    r.at = { x: n.x, y: n.y, z: r.z, hx: n.hx, hy: n.hy };
    let h;
    try { h = this.ctx.official.flight(this.ctx.view(n.owner), n.look, () => r.at); } catch { h = null; }
    if (!h) return null;
    r.ofx = h;
    return r;
  }

  /** Her launch height (bullets leave her there); HEAD_Z once she is gone. */
  _launchZ(owner) {
    const v = owner != null ? this.ctx.view(owner) : null;
    return v && !v.destroyed ? bodyZ(this.ctx.cam(), v, SHOT_HEIGHT.launch) : HEAD_Z;
  }

  /** A boss's HitPoint (ctx.hitPoint: where its official hits spawn), or null (any other enemy: its body instead). */
  _hitPt(v) {
    if (!v?.isBoss || typeof this.ctx.hitPoint !== 'function') return null;
    let hp;
    try { hp = this.ctx.hitPoint(v); } catch { hp = null; }
    return hp && Number.isFinite(hp.x) && Number.isFinite(hp.y) && Number.isFinite(hp.z) ? hp : null;
  }

  /**
   * This frame's height and drawn offset of note `r` (`n` from notesAt): locked on a living enemy, it goes from the
   * height / offset it had at the lock to that enemy's HitPoint (else its body, no offset) in step with the ground
   * distance closed (there at the hit); free, it eases to her launch height and its sim path. A new lock (a re-pick)
   * starts again from where the note is.
   */
  _height(r, n, cam, dt) {
    const tv = n.tgt != null ? this.ctx.view(n.tgt) : null;
    if (tv && !tv.destroyed && tv.alive !== false) {
      const d = Math.hypot(tv.x - n.x, tv.y - n.y);
      if (r.lock !== n.tgt) { r.lock = n.tgt; r.z0 = r.z; r.ox0 = r.ox; r.oy0 = r.oy; r.d0 = Math.max(d, 1e-3); }
      const f = Math.min(1, d / r.d0);
      const hp = this._hitPt(tv);
      const zt = hp ? hp.z : bodyZ(cam, tv, SHOT_HEIGHT.aim);
      const ex = hp ? hp.x - tv.x : 0, ey = hp ? hp.y - tv.y : 0;
      r.z = zt + (r.z0 - zt) * f;
      r.ox = ex + (r.ox0 - ex) * f; r.oy = ey + (r.oy0 - ey) * f;
      return;
    }
    r.lock = null;
    const goal = this._launchZ(n.owner);
    const k = Math.min(1, dt * FREE_EASE);
    r.z += (goal - r.z) * k;
    r.ox -= r.ox * k; r.oy -= r.oy * k;
  }

  /**
   * The trail layers of a note (look `L`, family `fam`, S1 note index `s1k` or −1): one SimpleMesh strip per official
   * layer (noteTrails.js) with its baked texture (_layerTex), its width (tiles) and its lifetime (game s).
   * Without the local art (or headless) a single plain band in the look's trail colour stands in.
   */
  _trailLayers(L, fam, s1k) {
    const P = this.P;
    if (!P.SimpleMesh) return [];
    const spec = TRAIL_LAYERS[L]?.[fam] ?? TRAIL_LAYERS[L]?.attack ?? [];
    const wk = s1k >= 0 ? TRAIL_S1_W[s1k] ?? 1 : 1;
    const out = [];
    for (const l of spec) {
      const w = l.w * TRAIL_W_SCALE * wk;
      // a round-dot texture keeps its aspect: as many texture units along the trail per tile as across it, at the
      // family's nominal trail length (its trace speed × the layer's life) — the client's own tiling stretches it
      let rect = l.rect;
      if (ROUND_TEX.has(l.tex)) {
        const len = (TRACE_SPEED[fam] ?? 2) * l.time;
        rect = [l.rect[1] * len / Math.max(1e-6, w), l.rect[1], l.rect[2], l.rect[3]];
      }
      const frames = this._layerTex({ ...l, rect });
      if (frames) out.push({ mesh: this._strip(frames[0], l.add), frames, us: l.us || 0, w, time: l.time });
    }
    if (!out.length) {
      const lk = NOTE_LOOKS[L];
      const tex = this._layerTex({ tex: null, col: [[0, lk.trail], [1, lk.trail]], a: [[0, 0.8], [1, 0]] })?.[0];
      const mesh = this._strip(tex || P.Texture.WHITE, true);
      if (!tex) mesh.tint = lk.trail;   // headless: a flat band of the trail colour
      out.push({ mesh, w: TRAIL_FALLBACK_W * wk, time: 0.4 });
    }
    return out;
  }

  /**
   * A trail layer's texture, baked once (cached by its spec): u along the trail (0 = the head … 1 = the tail) and v
   * across it, the client texture's material rect (scale / offset, wrapped; Unity's v runs bottom-up) times the
   * layer's colour and alpha keys — so the colour runs along the trail as in the client (a TrailRenderer's gradient
   * is per vertex, which a batched Pixi mesh has not). `tex` null: a soft plain band. Null without a DOM or the art.
   */
  _layerTex(l) {
    const key = `layer:${l.tex}:${(l.rect || []).join(',')}:${JSON.stringify(l.col)}:${JSON.stringify(l.a)}:${l.us || 0}`;
    if (this._tex.has(key)) return this._tex.get(key);
    let t = null;
    try {
      const url = l.tex ? this.ctx.localUrl('notes/oblvns', l.tex) : null;
      if (typeof document !== 'undefined' && (url || !l.tex) && (!url || typeof Image !== 'undefined')) {
        const W = 256, H = 64;
        // one canvas per scroll phase (a still layer: one)
        const cvs = Array.from({ length: l.us && l.tex ? SCROLL_PHASES : 1 }, () => {
          const cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          return cv;
        });
        t = cvs.map((cv) => this.P.Texture.from(cv));
        const bake = (img) => cvs.forEach((cv, f) => {
          const shift = f / cvs.length;   // texture units the material has scrolled
          const g = cv.getContext('2d', { willReadFrequently: true });
          let src = null, sw = 0, sh = 0;
          if (img) {
            sw = img.naturalWidth || img.width; sh = img.naturalHeight || img.height;
            const sc = document.createElement('canvas'); sc.width = sw; sc.height = sh;
            const sg = sc.getContext('2d', { willReadFrequently: true }); sg.drawImage(img, 0, 0);
            src = sg.getImageData(0, 0, sw, sh).data;
          }
          const [su, sv, ou, ov] = l.rect || [1, 1, 0, 0];
          const out = g.createImageData(W, H), px = out.data;
          const wrap = (x) => x - Math.floor(x);
          for (let x = 0; x < W; x++) {
            const tu = (x + 0.5) / W;
            const c = gradAt(l.col, tu, true), al = gradAt(l.a, tu);
            const cr = (c >> 16) & 255, cg = (c >> 8) & 255, cb = c & 255;
            for (let y = 0; y < H; y++) {
              const tv = (y + 0.5) / H;
              let r = 255, gg = 255, b = 255, a;
              if (src) {
                const u = wrap(ou + su * tu + shift), v = wrap(ov + sv * (1 - tv));
                const i = ((Math.min(sh - 1, Math.floor((1 - v) * sh)) * sw) + Math.min(sw - 1, Math.floor(u * sw))) * 4;
                r = src[i]; gg = src[i + 1]; b = src[i + 2]; a = src[i + 3];
              } else a = 255 * Math.max(0, 1 - Math.abs(tv * 2 - 1)) ** 0.8;
              const o = (y * W + x) * 4;
              px[o] = (r * cr) / 255; px[o + 1] = (gg * cg) / 255; px[o + 2] = (b * cb) / 255; px[o + 3] = a * al;
            }
          }
          g.putImageData(out, 0, 0);
          t[f].baseTexture.update();
        });
        if (url) {
          const img = new Image();
          img.onload = () => { try { bake(img); } catch { /* a tainted canvas: the layer stays empty */ } };
          img.src = encodeURI(url);
        } else bake(null);
      }
    } catch { t = null; }
    this._tex.set(key, t);
    return t;
  }

  /** A strip of TRAIL_COLS quads (few enough vertices for Pixi to batch it): column 0 the tail, the last the head. */
  _strip(tex, add) {
    const P = this.P;
    const n = TRAIL_COLS;
    const verts = new Float32Array(n * 4), uvs = new Float32Array(n * 4), idx = new Uint16Array((n - 1) * 6);
    for (let j = 0; j < n; j++) { const u = 1 - j / (n - 1); uvs.set([u, 0, u, 1], j * 4); }
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], i * 6); }
    const m = new P.SimpleMesh(tex, verts, uvs, idx);
    m.blendMode = add ? P.BLEND_MODES.ADD : P.BLEND_MODES.NORMAL;
    return m;
  }

  /**
   * The trail: one strip per layer along the path the note flew in the layer's last `time` game seconds — column j
   * at age time × (1 − j / (cols − 1)) behind the head (the path point of that moment, lerped between kept points),
   * so the baked texture's u is the age share, its colour and alpha keys run with it as on a TrailRenderer, and the
   * tail dies where the client's does. Constant width (the client's trails do not taper; their textures fade them).
   */
  _ribbon(r, cam, k, T) {
    const pts = r.pts;
    r.trail.alpha = k * Math.min(1, r.t / FADE_IN);
    if (pts.length < 1) { r.trail.visible = false; return; }
    r.trail.visible = true;
    const p = this._p;
    const n = TRAIL_COLS;
    // projected path, newest first: the note now, then the kept points back in time
    const m = Math.min(pts.length, TRAIL_POINTS) + 1;
    const sc = this._sc && this._sc.length >= m * 4 ? this._sc : (this._sc = new Float32Array((TRAIL_POINTS + 1) * 4));
    cam.project(r.x, r.y, r.z, p);
    sc[0] = p.x; sc[1] = p.y; sc[2] = p.s; sc[3] = 0;
    for (let q = 1; q < m; q++) {
      const pt = pts[pts.length - q];
      cam.project(pt[0], pt[1], pt[3], p);
      sc[q * 4] = p.x; sc[q * 4 + 1] = p.y; sc[q * 4 + 2] = p.s; sc[q * 4 + 3] = Math.max(sc[(q - 1) * 4 + 3], T - pt[2]);
    }
    const oldest = sc[(m - 1) * 4 + 3];
    for (const l of r.layers) {
      if (l.frames && l.frames.length > 1) {
        const ph = l.us * T;
        l.mesh.texture = l.frames[Math.floor((ph - Math.floor(ph)) * l.frames.length) % l.frames.length];
      }
      const v = l.mesh.vertices;
      let seg = 0;
      for (let j = n - 1; j >= 0; j--) {
        // its age (never older than the path: a young note's first columns gather on its launch point)
        const age = Math.min(oldest, l.time * (1 - j / (n - 1)));
        while (seg < m - 2 && sc[(seg + 1) * 4 + 3] < age) seg++;
        const o0 = seg * 4, o1 = Math.min(m - 1, seg + 1) * 4;
        const a0 = sc[o0 + 3], a1 = sc[o1 + 3];
        const f = a1 > a0 ? Math.min(1, Math.max(0, (age - a0) / (a1 - a0))) : 0;
        const x = sc[o0] + (sc[o1] - sc[o0]) * f, y = sc[o0 + 1] + (sc[o1 + 1] - sc[o0 + 1]) * f;
        const ps = sc[o0 + 2] + (sc[o1 + 2] - sc[o0 + 2]) * f;
        let tx = sc[o0] - sc[o1], ty = sc[o0 + 1] - sc[o1 + 1];
        let tl = Math.hypot(tx, ty);
        if (tl < 1e-6) { tx = l.tx ?? 1; ty = l.ty ?? 0; tl = 1; }   // a still point keeps the last direction
        tx /= tl; ty /= tl; l.tx = tx; l.ty = ty;
        const hw = Math.max(0.6, ps * l.w) * 0.5;
        v[j * 4] = x - ty * hw; v[j * 4 + 1] = y + tx * hw;
        v[j * 4 + 2] = x + ty * hw; v[j * 4 + 3] = y - tx * hw;
      }
    }
  }

  _drop(r) {
    if (r.ofx) { try { r.ofx.stop(); } catch { /* ignore */ } r.ofx = null; return; }
    r.head.destroy(); r.lift.destroy(); r.glow.destroy(); r.trail.destroy({ children: true }); if (r.ring) r.ring.destroy();
  }

  /** view.stats(): notes in flight, those the official prefabs draw, this layer's display objects (0 = no cost). */
  stats() {
    let official = 0;
    for (const r of this.notes.values()) if (r.ofx) official++;
    return { notes: this.notes.size, official, drawn: this.root.children.length };
  }

  clear() {
    for (const r of this.notes.values()) this._drop(r);
    this.notes.clear();
    for (const h of this.hits) { h.sp.destroy(); h.flash.destroy(); }
    this.hits.length = 0;
  }

  destroy() {
    this.clear();
    this.root.destroy({ children: true });
  }
}
