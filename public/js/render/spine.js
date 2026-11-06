// render/spine.js — Spine battle chibi wrapper + animation state machine (research 07 §5.4–5.5, ASSETS.md Roles).
//
// SpineActor owns one PIXI.spine.Spine built from cached skeleton data (assets.spine LRU; the instance never
// owns the atlas, so destroying it never frees shared textures). Animation roles come from the manifest
// (`anims`: idle, deploy, attack{begin,loop,end}, attackDown, skill{begin,loop,end,idle}, die, move, stun).
//
// Driving (units.js calls these; the sim is authoritative, the actor only visualises):
//   setBase('idle'|'move'|'stun')        the resting state from the snapshot anim code
//   attack(interval, once)                one attack happened now (b.ev 'atk'): consumes its wind-up or starts at
//                                         OnAttack, once; operator timeScale = loopDuration / interval;
//                                         `once` (a one-off cast, style.js PROJ[kind].once — 暴鸰's bomb drop): the
//                                         clip plays once at its own speed, then base; `clipPerAttack` (enemies,
//                                         GitHub #58): every attack plays the clip once — at its own speed, faster
//                                         only when the attacks come quicker than the clip —, then base (Move while
//                                         the sim walks it: it stands for that clip, server/sim/ai.js attackStand)
//   setSkill(on)                          skill begin once, then the loop for the whole skill when the clip is a
//                                         begin/loop/end set with no idle of its own (DESIGN §34.4: 白面鸮 S2 holds
//                                         Skill_Loop through every heal). An attack during that skill plays the skill's
//                                         own attack clip when the skeleton has one (焰影苇草 Skill_3_Attack), or that
//                                         loop when it has OnAttack (送葬人 S2: scaled to the interval, strikePose on
//                                         that frame), then the loop again. A loop with no OnAttack is not restarted.
//                                         A stun returns to the held loop; Begin waits until the stun ends if the skill
//                                         turned on during it. A skill with an
//                                         idle clip of its own (skill.idle, not its loop) stands in that idle between
//                                         attacks and plays its loop only on attacks (community report #23: 折桠's S2
//                                         jump). End on stop. A skill clip with NEITHER a Begin nor an own Idle
//                                         (德克萨斯 剑雨 and the other 58 instant skills: anims.skill {begin:null,
//                                         loop:'Skill', end:null}) plays that clip once for its own length: an instant
//                                         skill's flag is off again within the same 0.5 s window (sim skills.js), so
//                                         without this the actor fell through to its idle and played no skill clip at
//                                         all (player report).
//   deploy()                              'Start' once, then base
//   die()                                 die clip once (callers fade out afterwards); a skeleton without one holds its
//                                         idle clip's first frame (GitHub issue #25: the attack loop went on)
//   stunned (setBase('stun'))             stun clip, or the current track frozen at timeScale 0
//   setForm(roles, change, end)           another clip set of the skeleton (an enemy's mode, a 傀儡师's 替身), after a change clip
//                                         (no attack cuts the change clip short); `end` = { clip, in, roles? }: a
//                                         closing clip timed to end `in` s from now (a 重生's last clip ends with the
//                                         重生), landing in `roles`
//   update(dt)                            advances the skeleton (autoUpdate is off: one clock for everything); a
//                                         model frozen before it was ever posed (built while stunned without a stun
//                                         clip, or dead without a death or idle clip) shows its clip's first frame,
//                                         never its setup pose (GitHub #542: the impostor box covers the clips only)
//   poseHeld()                            true while the pose cannot change (render/units.js then neither re-poses nor
//                                         redraws the model, only advances `clock`)
//   clipBounds(names)                     skeleton-space bounds of those clips (sampled once per skeleton data, see
//                                         "clip bounds" below; render/units.js sizes the impostor box from them)
// (fork) An operator's attack clip loops over its rhythm while the next attack's wind-up confirms each coming swing;
// without one it stops just before that strike frame (no swing without an attack). Enemies and `once` casts play each
// attack's clip once. Then the end clip (if any) and base — except a skill that holds its loop (begin/loop/end and no
// idle of its own: the loop stays up, and a dedicated attack clip returns to that loop) and a skill with its own idle
// clip (those attacks go straight back to that idle). The skill's end clip closes the skill, not each spell of attacks
// while it runs.

const clampN = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Longest wind-up compression (× the rhythm speed) when the look-ahead is shorter than the natural wind-up. */
export const MAX_WIND_SPEEDUP = 2.5;

/** Floor for the one-shot window of a skill clip with no Begin / own Idle (a very short clip still gets frames). */
const SKILL_CLIP_MIN = 0.2;
/** (fork) Game seconds before the next strike frame at which an operator's unconfirmed rhythm loop drops to rest. */
const RHYTHM_DROP_MARGIN = 0.08;

/**
 * (fork) The melee clip of a model whose manifest attack is its ranged one (SpineActor.shot 'melee'), first present
 * wins. Ashlock: Attack01 is his cannon, Attack02 the shield bash (it animates F_weapon_dun). 领主 (lord): Attack is
 * the ranged shot (银灰's cane point with the eagle, user playtest 2026-10-12), Combat the melee; [ASSUMED] the same for
 * Qiubai (Attack / Combat_A), whose two clips animate the same bones. Agent (伊内丝 Ines): Attack / Skill_2_Attack throw
 * her shadow, Combat / Skill_2_Combat strike the enemy she blocks.
 */
const MELEE_TWIN = Object.freeze({ Attack01: ['Attack02'], Attack: ['Combat', 'Combat_A'], Skill_2_Attack: ['Skill_2_Combat'] });
/** (fork) The other way round (SpineActor.shot 'ranged'): Thorns' manifest Attack_1 is his melee, Attack_2 the thrown
 *  shot (user playtest 2026-10-12). */
const RANGED_TWIN = Object.freeze({ Attack_1: ['Attack_2'] });

/**
 * Attack clip timing (pure). `loopDur` / `hit` are clip seconds (strike frame at `hit`), `interval` and `lead` game
 * seconds. The clip plays at `ts = loopDur / interval` (one loop per attack); started `lead` before the attack it
 * reaches the strike frame on time: from `start = hit − lead·ts` at `ts` when little of the wind-up is lost,
 * otherwise from (nearly) the beginning at up to MAX_WIND_SPEEDUP × ts (`tsWind`).
 * @returns {{ ts: number, tsWind: number, start: number }}
 */
export function windUpPlan(loopDur, hit, interval, lead) {
  const ts = clampN(loopDur / Math.max(0.08, interval), 0.35, 4);
  const L = Math.max(0, lead);
  let start = Math.max(0, hit - L * ts), tsWind = ts;
  if (start > hit * 0.15 && L > 0) {
    tsWind = Math.min(ts * MAX_WIND_SPEEDUP, hit / L);
    start = Math.max(0, hit - L * tsWind);
  }
  return { ts, tsWind, start };
}

/** A clipping attachment (pixi-spine AttachmentType.Clipping = 6). */
const isClip = (a) => !!a && (a.type === 6 || a.constructor?.name === 'ClippingAttachment' || ('endSlot' in a && 'vertices' in a && !('uvs' in a)));

/** Whether any skin of the skeleton data has a clipping attachment. */
export function hasClipping(data) {
  try {
    for (const skin of data?.skins || []) {
      const list = typeof skin.getAttachments === 'function' ? skin.getAttachments() : [];
      for (const e of list) if (isClip(e && e.attachment)) return true;
    }
  } catch { /* unknown runtime shape: assume none */ }
  return false;
}

const EYEISH = /eye|lid|pupil/i;

/**
 * Whether the skeleton has a clipping attachment that is not an eyelid — a weapon / rope / chain cut (Miksaparato's
 * F_Weapon_mask, Mlynar's F_Sword_Cut, …). _eyeMaskFallback only approximates eyelids (it hides whole slots); such a
 * clip cuts parts of slots that stay drawn, so without the stencil the art shows uncut (an oversized weapon). A clip is
 * an eyelid when its slot, attachment or end slot is named like one, or every slot it covers (setup draw order) is.
 */
export function needsClipping(data) {
  try {
    const slots = data?.slots || [];
    for (const skin of data?.skins || []) {
      const list = typeof skin.getAttachments === 'function' ? skin.getAttachments() : [];
      for (const e of list) {
        const a = e && e.attachment;
        if (!isClip(a)) continue;
        const slot = slots[e.slotIndex], end = a.endSlot;
        if (EYEISH.test(`${slot?.name || ''} ${a.name || ''} ${end?.name || ''}`)) continue;
        const from = (slot ? slot.index : e.slotIndex) + 1, to = end ? end.index : from - 1;
        const covered = slots.slice(from, to + 1);
        if (covered.length && covered.every((s) => EYEISH.test(s.name))) continue;
        return true;
      }
    }
  } catch { /* unknown runtime shape: treat as eyelids (the old behaviour) */ }
  return false;
}

/**
 * Is (x, y) inside the polygon of `n` points `pts` (flat [x0, y0, x1, y1, …])? Ray casting (PR #384 by @Convey123).
 */
/**
 * PIXI texture of a named attachment of a slot in a pixi-spine skeleton (null without one). The region pixi-spine
 * prepared (`RegionAttachment.region.texture`, already rotated / trimmed to the atlas frame) is preferred; an atlas
 * region without one is cut out of its page's base texture.
 * @param {any} spineData pixi-spine skeleton data (`spine.spineData`)
 * @param {string} slotName slot name, e.g. 'C_Eff_Moire_B'
 * @param {string} attachmentName attachment name, e.g. 'C_Eff_Moire_B'
 * @param {any} [PIXI] the PIXI namespace (defaults to globalThis.PIXI)
 * @returns {any} a PIXI Texture, or null
 */
export function attachmentTexture(spineData, slotName, attachmentName, PIXI = globalThis.PIXI) {
  try {
    const i = spineData?.slots?.findIndex((s) => s.name === slotName) ?? -1;
    const skin = spineData?.skins?.[0];
    const att = i >= 0 && typeof skin?.getAttachment === 'function' ? skin.getAttachment(i, attachmentName) : null;
    const region = att?.region;
    if (!region || !PIXI?.Texture) return null;
    if (region.texture) return region.texture;              // pixi-spine's own cut (rotated regions included)
    const page = region.page;
    const base = page?.baseTexture;
    if (!base || region.rotate || !PIXI.Rectangle) return null;
    const w = base.width || page.width || 0, h = base.height || page.height || 0;
    if (!w || !h) return null;
    return new PIXI.Texture(base, new PIXI.Rectangle(Math.round(region.u * w), Math.round(region.v * h), region.width, region.height));
  } catch { return null; }
}

export function pointInPolygon(x, y, pts, n) {
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * The eyelid fallback's cut (SpineActor._eyeMaskFallback, GitHub #647): a covered slot is hidden when less than
 * CLIP_HIDE_SHARE of its drawn area lies inside the clip polygon, kept when at least CLIP_KEEP_SHARE does, and in
 * between its centre decides (the 0.2.2 rule, GitHub #177). [ASSUMED] both shares.
 */
const CLIP_HIDE_SHARE = 0.25, CLIP_KEEP_SHARE = 0.5;

/**
 * World geometry of what a slot draws, into `buf.v` (grown to fit): a vertex attachment's world vertices (a mesh), else
 * a region's quad — its attachment rectangle (width × height × scale, rotated, at x / y) through the bone, corners in
 * order. Returns the number of floats written, 0 when nothing is measurable. pixi-spine keeps a bone's world transform
 * in `bone.matrix` (a PIXI Matrix, whose b / c are spine's c / b); spine-ts's a…d / worldX / worldY are read only when
 * there is no matrix — 0.2.2 read those alone, undefined on pixi-spine's bones, so no region was ever measured.
 */
function drawnVerts(slot, att, buf) {
  const n = att.worldVerticesLength | 0;
  if (n >= 2 && typeof att.computeWorldVertices === 'function') {
    if (buf.v.length < n) buf.v = new Float32Array(n);
    att.computeWorldVertices(slot, 0, n, buf.v, 0, 2);
    return n;
  }
  const b = slot.bone;
  if (att.region === undefined || !b || !Number.isFinite(att.x) || !Number.isFinite(att.y) || !(att.width > 0) || !(att.height > 0)) return 0;
  const m = b.matrix;
  const a = m ? m.a : b.a, bb = m ? m.c : b.b, c = m ? m.b : b.c, d = m ? m.d : b.d, tx = m ? m.tx : b.worldX, ty = m ? m.ty : b.worldY;
  const hw = (att.width * (Number.isFinite(att.scaleX) ? att.scaleX : 1)) / 2, hh = (att.height * (Number.isFinite(att.scaleY) ? att.scaleY : 1)) / 2;
  const rad = ((att.rotation || 0) * Math.PI) / 180, cs = Math.cos(rad), sn = Math.sin(rad);
  const v = buf.v;
  for (let q = 0; q < 4; q++) {
    const px = q === 0 || q === 3 ? -hw : hw, py = q < 2 ? -hh : hh;
    const lx = px * cs - py * sn + att.x, ly = px * sn + py * cs + att.y;
    v[q * 2] = a * lx + bb * ly + tx; v[q * 2 + 1] = c * lx + d * ly + ty;
  }
  return 8;
}

/** Twice the signed area of the polygon of `n` points `p` (flat). */
function area2(p, n) {
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) s += p[j * 2] * p[i * 2 + 1] - p[i * 2] * p[j * 2 + 1];
  return s;
}

/**
 * Area of the polygon `poly` (`pn` points) inside the convex polygon `win` (`wn` points): Sutherland–Hodgman with the
 * clip polygon as the subject, so a concave one is measured exactly (the bridge edges a concave subject leaves along the
 * window's border add no area). `buf.a` / `buf.b` are scratch buffers, grown to fit (each pass at most doubles the points).
 */
function clippedArea(poly, pn, win, wn, buf) {
  const w2 = area2(win, wn);
  if (!(Math.abs(w2) > 1e-9)) return 0;
  const sg = w2 > 0 ? 1 : -1, cap = pn * 2 * 2 ** wn;
  if (buf.a.length < cap) { buf.a = new Float64Array(cap); buf.b = new Float64Array(cap); }
  let src = buf.a, dst = buf.b, m = pn;
  for (let i = 0; i < pn * 2; i++) src[i] = poly[i];
  for (let e = 0; e < wn && m >= 3; e++) {
    const ax = win[e * 2], ay = win[e * 2 + 1], k = (e + 1) % wn, ex = win[k * 2] - ax, ey = win[k * 2 + 1] - ay;
    let o = 0;
    for (let i = 0; i < m; i++) {
      const j = i + 1 < m ? i + 1 : 0;
      const px = src[i * 2], py = src[i * 2 + 1], qx = src[j * 2], qy = src[j * 2 + 1];
      const dp = sg * (ex * (py - ay) - ey * (px - ax)), dq = sg * (ex * (qy - ay) - ey * (qx - ax));
      if (dp >= 0) { dst[o++] = px; dst[o++] = py; }
      if ((dp >= 0) !== (dq >= 0)) { const t = dp / (dp - dq); dst[o++] = px + (qx - px) * t; dst[o++] = py + (qy - py) * t; }
    }
    m = o >> 1;
    const s = src; src = dst; dst = s;
  }
  return m >= 3 ? Math.abs(area2(src, m)) / 2 : 0;
}

/**
 * Does the eyelid fallback hide covered slot `slot` (drawing `att`) under the clip polygon `poly` of `pn` (≥ 3) points?
 * By the share of its drawn area inside the polygon — what the stencil would keep: each mesh triangle (a region: its
 * quad) clips the polygon — and in the middle band (CLIP_HIDE_SHARE … CLIP_KEEP_SHARE), or when no area is measurable
 * (a path, a collapsed mesh), by its centre (mesh: the mean of its vertices; region: its quad's centre).
 */
function clipHides(slot, att, buf, poly, pn) {
  const n = drawnVerts(slot, att, buf);
  if (!n) return false;
  const v = buf.v, tri = att.triangles;
  let total = 0, inside = 0;
  if ((att.worldVerticesLength | 0) < 2) { total = Math.abs(area2(v, 4)) / 2; inside = clippedArea(poly, pn, v, 4, buf); }
  else if (tri && tri.length >= 3) {
    const w = buf.w;
    for (let k = 0; k + 2 < tri.length; k += 3) {
      const i0 = tri[k] * 2, i1 = tri[k + 1] * 2, i2 = tri[k + 2] * 2;
      if (i0 + 1 >= n || i1 + 1 >= n || i2 + 1 >= n) continue;
      w[0] = v[i0]; w[1] = v[i0 + 1]; w[2] = v[i1]; w[3] = v[i1 + 1]; w[4] = v[i2]; w[5] = v[i2 + 1];
      const a = Math.abs(area2(w, 3)) / 2;
      if (!(a > 0)) continue;
      total += a;
      inside += clippedArea(poly, pn, w, 3, buf);
    }
  }
  const share = total > 1e-6 ? inside / total : NaN;
  if (share < CLIP_HIDE_SHARE) return true;
  if (share >= CLIP_KEEP_SHARE) return false;
  let cx = 0, cy = 0;
  for (let k = 0; k < n; k += 2) { cx += v[k]; cy += v[k + 1]; }
  cx /= n >> 1; cy /= n >> 1;
  return Number.isFinite(cx) && Number.isFinite(cy) && !pointInPolygon(cx, cy, poly, pn);
}

/** Union of two [x0, y0, x1, y1] boxes (a may be null); a new array. */
const unionBox = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b.slice());

// ---- clip bounds (GitHub #542) ------------------------------------------------------------------------------------
// What a skeleton can draw, in skeleton space (pixi-spine's y-down world; rects are [x0, y0, x1, y1]): each clip, sampled
// once per skeleton data and shared by every actor built from it (the setup pose is never shown: SpineActor.update poses
// even a model frozen before its first update at its clip's first frame). render/units.js sizes a unit's
// impostor slot from the clips the unit plays — a slot sized from the first pose drawn (plus a margin) cut 野鬃's idle
// flag and 浊心斯卡蒂's head in her S3 flight, and 598 of the roster's 681 skeletons play a clip that leaves a slot sized
// that way from their idle's first frame. A clip is posed on a scratch skeleton of the same runtime (never an actor's
// own) CLIP_SAMPLE_HZ times a second, at most CLIP_SAMPLE_MAX + 1 times (a longer clip is sampled more sparsely); every
// slot that is drawn (alpha > 0) counts — a region with its whole attachment rectangle (the atlas trim only makes the
// drawn sprite smaller), a mesh with its world vertices. (Skeleton.getBounds() cannot be used: pixi-spine never computes
// the RegionAttachment offsets it reads, its sprites do not need them.) Requests are queued; `stepClipBounds(ms)`, called
// by render/app.js once per frame, samples within that time budget: the clips a unit plays take ≈ 9 ms per skeleton on
// the current roster (53 ms at most), so a model is measured a few frames after it loads, long before a crowd needs its
// impostor. [ASSUMED] the rate, the cap and the budget (a pose between two samples is covered by the box's padding,
// units.js IMP_BOX, and anything past it is cut by the atlas slot's scissor, never left behind). A record is queued only
// while an actor uses its skeleton data: when the last one is destroyed (a model swap, a battlefield torn down) its pending
// clips and its scratch skeleton are dropped — nothing holds a skeleton the Spine store let go, and nothing stale is
// measured ahead of the next scene's models —, and a later actor queues what was never measured again. A clip whose
// sampling throws is recorded as not measurable (false): units.js draws it directly while it plays, never as empty.
export const CLIP_SAMPLE_HZ = 60;
export const CLIP_SAMPLE_MAX = 48;
export const CLIP_BOUNDS_BUDGET_MS = 2.5;
const ATT_REGION = 0, ATT_MESH = 2;      // pixi-spine AttachmentType
const boundsOf = new WeakMap();          // skeleton data → { data, Skeleton, skel, rects: Map<clip, rect|null|false>, todo, job, users, failed }
const boundsQueue = [];                  // records with clips still to sample, oldest request first
const nowMs = () => (globalThis.performance ? globalThis.performance.now() : Date.now());
const emptyRect = () => [Infinity, Infinity, -Infinity, -Infinity];
const rectOk = (r) => !!r && Number.isFinite(r[0]) && Number.isFinite(r[1]) && Number.isFinite(r[2]) && Number.isFinite(r[3]) && r[0] <= r[2] && r[1] <= r[3];

/** Grow `r` by everything `skel` draws in its current pose (see "clip bounds"); `buf.v` is a scratch vertex buffer. */
function poseRect(skel, r, buf) {
  for (const slot of skel.drawOrder) slotRect(slot, r, buf);
  return r;
}

/**
 * (fork) Grow `r` by what one slot draws in the current pose (poseRect; SpineActor._mixGuard): false when it draws
 * nothing (no attachment, an inactive bone, alpha ≈ 0, another attachment type).
 */
function slotRect(slot, r, buf) {
  const grow = (x, y) => { if (x < r[0]) r[0] = x; if (x > r[2]) r[2] = x; if (y < r[1]) r[1] = y; if (y > r[3]) r[3] = y; };
  const bone = slot.bone;
  if (!bone || bone.active === false) return false;
  const att = typeof slot.getAttachment === 'function' ? slot.getAttachment() : slot.attachment;
  if (!att || (slot.color ? slot.color.a : 1) * (att.color ? att.color.a : 1) <= 0.004) return false;
  if (att.type === ATT_MESH && typeof att.computeWorldVertices === 'function') {
    const n = att.worldVerticesLength | 0;
    if (n < 2) return false;
    if (buf.v.length < n) buf.v = new Float32Array(n);
    const v = buf.v;
    att.computeWorldVertices(slot, 0, n, v, 0, 2);
    for (let k = 0; k < n; k += 2) grow(v[k], v[k + 1]);
    return true;
  }
  if (att.type === ATT_REGION && bone.matrix) {
    // the attachment rectangle (width × height × scale, rotated, at x / y) through the bone (a PIXI matrix)
    const m = bone.matrix;
    const hw = (att.width * att.scaleX) / 2, hh = (att.height * att.scaleY) / 2;
    const rad = (att.rotation * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    for (let q = 0; q < 4; q++) {
      const px = q === 0 || q === 3 ? -hw : hw, py = q < 2 ? -hh : hh;
      const lx = px * c - py * s + att.x, ly = px * s + py * c + att.y;
      grow(m.a * lx + m.c * ly + m.tx, m.b * lx + m.d * ly + m.ty);
    }
    return true;
  }
  return false;
}

/** (fork) A clip's timelines that decide what its slots draw (attachment and colour keys; SpineActor._hiddenByOutgoing),
 *  listed once per clip. */
const slotTimelinesOf = new WeakMap();
function slotTimelines(anim) {
  let list = slotTimelinesOf.get(anim);
  if (!list) {
    list = (anim.timelines || []).filter((tl) => tl && Number.isInteger(tl.slotIndex) && typeof tl.apply === 'function'
      && !(tl.attachment && 'vertices' in tl.attachment));   // not the deform timelines (vertex offsets only)
    slotTimelinesOf.set(anim, list);
  }
  return list;
}

/** (fork) SpineActor._mixGuard: how far past the mixed clips' bounds a slot may reach while they crossfade — `min`
 *  skeleton units + `share` × the bounds' longer side (a blend of two poses sits between them; poses between two
 *  samples). A crossfade whose visible slots include more than `swapMin` and `swapShare` × of them that no outgoing
 *  clip draws now swaps one body for another (伊内丝's 'boc' outfit) and is cut. [ASSUMED] the values. */
export const MIX_GUARD_PAD = Object.freeze({ min: 40, share: 0.08, swapMin: 12, swapShare: 0.4 });

/** The scratch skeleton of a bounds record (made on demand, dropped once its queued clips are sampled). */
function scratchSkeleton(rec) {
  if (rec.skel) return rec.skel;
  const Skeleton = rec.Skeleton;
  if (typeof Skeleton !== 'function' || Skeleton === Object) throw new Error('no Spine runtime');
  const skel = new Skeleton(rec.data);
  if (!Array.isArray(skel.drawOrder) || typeof skel.setToSetupPose !== 'function' || typeof skel.updateWorldTransform !== 'function') throw new Error('no Spine runtime');
  rec.skel = skel;
  return skel;
}

/** The bounds record of skeleton data `data`; `failed` when this runtime cannot be posed here (tried at once). */
function boundsRecord(data, Skeleton) {
  let rec = boundsOf.get(data);
  if (rec) return rec;
  rec = { data, Skeleton, skel: null, rects: new Map(), todo: [], job: null, users: 0, failed: false, buf: { v: new Float32Array(256) } };
  try {
    const skel = scratchSkeleton(rec);
    skel.setToSetupPose();
    skel.updateWorldTransform();
  } catch {
    rec.failed = true;
    rec.skel = null;
  }
  boundsOf.set(data, rec);
  return rec;
}

/**
 * Start sampling clip `name`: { name, anim, d, n, i, r } (posed at t = d·i/n for i = 0…n; `r` grows), or null when the
 * skeleton has no such clip.
 */
function startClip(rec, name) {
  const anim = typeof rec.data.findAnimation === 'function' ? rec.data.findAnimation(name) : null;
  if (!anim || typeof anim.apply !== 'function') return null;
  const d = Number.isFinite(anim.duration) && anim.duration > 0 ? anim.duration : 0;
  const n = d > 0 ? Math.min(CLIP_SAMPLE_MAX, Math.max(1, Math.ceil(d * CLIP_SAMPLE_HZ))) : 0;
  scratchSkeleton(rec).setToSetupPose();
  const times = clipTimes(anim, d, n);
  return { name, anim, d, n: times.length - 1, i: 0, times, r: emptyRect() };
}

/** (fork) At most this many key-time poses (a key and the instant before it) on top of a clip's even samples (thinned evenly past it). */
export const CLIP_SAMPLE_KEYS = 480;
/** (fork) Seconds before a key also posed (the pose a timeline reaches just before it jumps at the key). */
export const CLIP_KEY_LEAD_S = 0.0002;

/**
 * (fork) The times a clip is posed at: the even samples t = d·i/n, plus every key of its timelines (at most
 * CLIP_SAMPLE_KEYS of them) — a pose held for a frame between two even samples (赫拉格 Hellagur's katana reaching 160
 * units further at 0.70 s of his 1.33 s skill, 维伊 Veen's shadow) left the box otherwise. Sorted, the ones within 1 ms
 * of another dropped. Key times are read from each timeline's `frames` (pixi-spine 3.x: one time per getFrameCount()
 * entries, its first; 4.x: getFrameEntries()); a timeline that does not expose them adds nothing.
 */
function clipTimes(anim, d, n) {
  const even = [];
  for (let i = 0; i <= n; i++) even.push(n ? (d * i) / n : 0);
  if (!(d > 0) || !Array.isArray(anim.timelines)) return even;
  const keys = [];
  for (const tl of anim.timelines) {
    const f = tl && tl.frames;
    if (!f || typeof f.length !== 'number') continue;
    let count = 0, stride = 0;
    try {
      if (typeof tl.getFrameEntries === 'function') { stride = tl.getFrameEntries(); count = f.length / stride; }
      else if (typeof tl.getFrameCount === 'function') { count = tl.getFrameCount(); stride = count > 0 ? f.length / count : 0; }
    } catch { continue; }
    if (!(count > 0) || !Number.isInteger(stride) || stride < 1) continue;
    for (let k = 0; k < count; k++) { const t = f[k * stride]; if (Number.isFinite(t) && t > 0 && t <= d) keys.push(t); }
  }
  if (!keys.length) return even;
  // one entry per key time (timelines share most of them: a clip authored at 30 fps has at most 30 a second)
  keys.sort((x, y) => x - y);
  const uniq = [];
  for (const t of keys) if (!uniq.length || t - uniq[uniq.length - 1] > CLIP_KEY_LEAD_S / 2) uniq.push(t);
  // a key and the instant before it: a pose can jump there (维伊's shadow 160 units further 1 ms before a deform key)
  keys.length = 0;
  for (const t of uniq) { if (t - CLIP_KEY_LEAD_S > 0) keys.push(t - CLIP_KEY_LEAD_S); if (t < d) keys.push(t); }
  const picked = keys.length > CLIP_SAMPLE_KEYS
    ? Array.from({ length: CLIP_SAMPLE_KEYS }, (_, i) => keys[Math.floor((i * keys.length) / CLIP_SAMPLE_KEYS)])
    : keys;
  const all = [...even, ...picked].sort((x, y) => x - y);
  const out = [];
  for (const t of all) if (!out.length || t - out[out.length - 1] > CLIP_KEY_LEAD_S / 2) out.push(t);
  return out;
}

/**
 * Queue clips `names` of skeleton data `data` (pixi-spine runtime class `Skeleton`) for sampling — those neither sampled
 * nor queued yet — and return its record (`rects`, `failed`).
 */
export function requestClipBounds(data, Skeleton, names) {
  const rec = boundsRecord(data, Skeleton);
  if (rec.failed) return rec;
  let added = false;
  for (const n of names) {
    if (typeof n === 'string' && !rec.rects.has(n) && !rec.todo.includes(n) && !(rec.job && rec.job.name === n)) { rec.todo.push(n); added = true; }
  }
  if (added && !boundsQueue.includes(rec)) boundsQueue.push(rec);
  else if (!boundsQueue.includes(rec)) rec.skel = null;   // nothing to sample: no scratch skeleton kept
  return rec;
}

/**
 * One actor more (+1, SpineActor.clipBounds) or less (−1, SpineActor.destroy) measures record `rec`; with none left, the
 * record leaves the queue with its pending clips (todo and the clip in progress) and its scratch skeleton — a later actor
 * queues what was never measured again (a todo left behind would read as queued and never be measured).
 */
function useBounds(rec, delta) {
  rec.users = Math.max(0, rec.users + delta);
  if (rec.users > 0) return;
  const i = boundsQueue.indexOf(rec);
  if (i >= 0) boundsQueue.splice(i, 1);
  rec.todo.length = 0;
  rec.job = null;
  rec.skel = null;
}

/**
 * Sample queued clips for up to `budgetMs` (render/app.js calls it once per frame): pose after pose, a clip resumed on the
 * next call when the budget runs out inside it; at least one pose per call.
 * @returns {number} clips finished
 */
export function stepClipBounds(budgetMs = CLIP_BOUNDS_BUDGET_MS) {
  if (!boundsQueue.length) return 0;
  const end = nowMs() + budgetMs;
  let finished = 0, posed = 0;
  while (boundsQueue.length) {
    const rec = boundsQueue[0];
    if (!rec.job) {
      const name = rec.todo.shift();
      if (name === undefined) { boundsQueue.shift(); rec.skel = null; continue; }
      let broken = false;
      try { rec.job = startClip(rec, name); } catch { rec.job = null; broken = true; }
      // no such clip: it never plays (null); a clip that could not be set up: not measurable (false)
      if (!rec.job) { rec.rects.set(name, broken ? false : null); finished++; continue; }
    }
    const j = rec.job;
    try {
      const skel = scratchSkeleton(rec);
      while (j.i <= j.n) {
        const t = j.times ? j.times[j.i] : j.n ? (j.d * j.i) / j.n : 0;
        j.anim.apply(skel, t, t, false, null, 1, 0, 0);   // MixBlend.setup, MixDirection.mixIn: the clip's own pose at t
        skel.updateWorldTransform();
        poseRect(skel, j.r, rec.buf);
        j.i++;
        posed++;
        if (nowMs() >= end) break;
      }
    } catch { j.i = j.n + 1; j.broken = true; }
    if (j.i > j.n) {
      // a pose that threw: the clip is not measurable (false) — drawn directly while it plays, not taken as empty
      rec.rects.set(j.name, j.broken ? false : rectOk(j.r) ? j.r : null);
      rec.job = null;
      finished++;
    }
    if (posed && nowMs() >= end) break;
  }
  return finished;
}

/** Clips still waiting to be sampled, the one in progress included (dev / tests). */
export function pendingClipBounds() { return boundsQueue.reduce((s, r) => s + r.todo.length + (r.job ? 1 : 0), 0); }

export class SpineActor {
  /**
   * @param {any} spineData PIXI.spine skeleton data
   * @param {object} entry manifest Spine entry (anims, animations, hits, bounds, pma)
   */
  constructor(spineData, entry) {
    const P = globalThis.PIXI;
    this.entry = entry;
    this.roles = entry.anims || {};
    this.durations = entry.animations || {};
    this.spine = new P.spine.Spine(spineData);
    this.spine.autoUpdate = false;
    this.names = new Set((spineData.animations || []).map((a) => a.name));
    /**
     * Clipping attachments render as stencil masks (≈1.5 ms of GPU each per frame on tiled GPUs): such skeletons
     * are drawn through the impostor atlas while clipping is on, and clipping is switched off when too many of them
     * share a field (app.js budget) — then _eyeMaskFallback hides what a closed eyelid would cut (GitHub #177).
     */
    this.clipped = hasClipping(spineData);
    this.clipNeeded = this.clipped && needsClipping(spineData); // non-eyelid clips: the masks stay on (setClipping)
    this.clipOn = true;
    this._clipHidden = new Set(); // slot indexes the eyelid fallback hid in its last pass (_eyeMaskFallback)
    this.mixRect = null;          // (fork) what a crossfade drew in the last update, [x0, y0, x1, y1] (_mixGuard)
    if (this.clipped) {
      const sp = this.spine;
      const orig = typeof sp.createGraphics === 'function' ? sp.createGraphics.bind(sp) : null;
      if (orig) sp.createGraphics = (slot, att) => { const g = orig(slot, att); if (!this.clipOn && slot.clippingContainer) { slot.clippingContainer.mask = null; g.renderable = false; } return g; };
    }
    try { this.spine.stateData.defaultMix = 0.12; } catch { /* ignore */ }
    this.base = 'idle';
    this.mode = 'base';           // base | attack | skillBegin | deploy | die | stun | change
    this.endClip = null;          // setForm's closing clip, played as a change clip once the clock reaches endAt,
    this.endAt = 0;               // landing in endRoles (the next form's) when given
    this.endRoles = null;
    this.skillIndex = null;       // the skill slot whose clip `skill` plays (setSkillIndex), null = the manifest's primary
    this.strike = null;           // the attack-class skill clip the next / current attack plays (castStrike)
    this.runMode = false;         // move on the model's own Run cycle (setRunMode)
    this.formRoles = null;        // the clip set of the form in force (setForm), over the unit's own roles
    this.skillOn = false;
    this.skillClipOnce = false;    // skillBegin: the skill's own clip plays once (a clip with no Begin / own Idle)
    this.skillEndPending = false;  // … and the skill turned off inside it: play its End clip / base when it ends
    this.skillEndAfterAttack = false;   // (fork) the skill turned off during its own attack clip: its End clip after it
    this.skillBeginPending = false; // setSkill(true) during a stun: Begin plays when the stun ends (§34.4.1)
    this.attackUntil = 0;
    this.clock = 0;
    this.current = '';
    this.frozen = false;
    this.dead = false;
    this.interval = 1;
    /**
     * Enemies (render/units.js, GitHub #58): each attack plays the attack clip once — at its own speed, faster only when
     * the attacks come quicker than the clip — and then the resting state; the sim stands the enemy for exactly that
     * clip (server/sim/ai.js attackStand). Off (operators): (fork) the clip loops over the attack rhythm while attacks
     * keep coming, each next swing confirmed by its wind-up; unconfirmed, it drops to rest just before that strike.
     */
    this.clipPerAttack = false;
    this.wound = false;           // wound up for the coming attack (windUp → attack)
    /**
     * (fork) A model with a melee clip set next to its ranged one, the manifest's roles naming one of them: a 重炮手
     * (fortress) melees while blocking, a 领主 (lord) at its own / front tile. 'ranged' | 'melee' = the coming attack's
     * kind (UnitView._shotKind), which _shot maps to the model's twin; null = neither, the roles as they are.
     */
    this.shot = null;
    this._applied = false;        // an update has posed the skeleton since its clip last changed (poseHeld)
    this._posed = false;          // the skeleton was ever posed (a model frozen before that shows its clip's first frame)
    this._appliedTint = undefined; // the tint that update put on the slots (pixi-spine applies `tint` in update)
    this._play(this._idleName(), true);
  }

  /** Enable / disable the skeleton's clipping masks (always on when a clip is not an eyelid: needsClipping). */
  setClipping(on) {
    on = !!on || this.clipNeeded;
    if (!this.clipped || on === this.clipOn) return;
    this.clipOn = on;
    if (on) this._showClipHidden();   // the stencil takes over from the eyelid fallback
    for (const slot of this.spine?.skeleton?.slots || []) {
      if (!slot.clippingContainer) continue;
      slot.clippingContainer.mask = on ? slot.currentGraphics || null : null;
      // PIXI makes a released mask renderable again: the clip polygon must never draw as a white shape
      if (slot.currentGraphics) slot.currentGraphics.renderable = false;
    }
  }

  /**
   * The equipped skill (DESIGN §16 loadout, UnitInfo.skillIndex): its own Spine clip when the model has one per skill
   * index (`anims.skills`), else the primary skill's clip.
   * @param {number|undefined} index 0-based skill index
   */
  setSkillIndex(index) {
    this.skillIndex = Number.isInteger(index) ? index : null;
    this._applyRoles();
  }

  /**
   * A fast mover walks on its model's own Run cycle (`anims.run`; PR #275 by @xcdoge): 猎狗pro (moveSpeed 1.9, 行动速度很快)
   * ships Move_Loop 0.80 s next to Run_Loop 0.53 s. Composes with setSkillIndex; a model without a Run cycle is unchanged.
   */
  setRunMode(on) {
    this.runMode = !!on;
    this._applyRoles();
  }

  /** The unit's own roles (the manifest's, its skill slot's clip and the Run cycle applied) under the form in force. */
  _applyRoles() {
    const anims = this.entry?.anims || {};
    const clip = Number.isInteger(this.skillIndex) && anims.skills ? anims.skills[String(this.skillIndex)] : null;
    const run = this.runMode && anims.run ? anims.run : null;
    const base = clip || run ? { ...anims } : anims;
    if (clip) base.skill = clip;
    if (run) base.move = run;
    this.baseRoles = base;
    this.roles = this.formRoles ? { ...base, ...this.formRoles } : base;
  }

  /** The unit's own roles: the manifest's with its skill slot's clip (setSkillIndex) and Run cycle — what a form ends in. */
  _baseRoles() { return this.baseRoles || this.entry?.anims || {}; }

  /**
   * Another clip set of the same skeleton — an enemy's mode (render/units.js FORMS: 掠海漂移体's 爬行模式 plays its *_02
   * clips), a 傀儡师's 替身: `roles` override the unit's own roles (null = back to them — the equipped skill's clip
   * included); `change` = a transition clip played once first (also while stunned: the pose it ends in is the one a stun
   * then holds). `end` = { clip, in, roles? } (game s): a closing clip played the same way so that it ends `in` s from
   * now, landing in `roles` — a leader's 重生 ends on its last clip while the sim still holds it, and the next form
   * starts on its own clips.
   */
  setForm(roles, change = null, end = null) {
    const anims = this._baseRoles();
    this.formRoles = roles || null;   // kept over a later skill slot (_applyRoles)
    this.roles = roles ? { ...anims, ...roles } : anims;
    this.endClip = null;
    if (this.dead) return;
    if (end && this.has(end.clip) && end.in > 0) {
      this.endClip = end.clip;
      this.endAt = this.clock + Math.max(0, end.in - this.dur(end.clip));
      this.endRoles = end.roles || null;
    }
    if (change && this.has(change)) this._change(change);
    else if (this.mode === 'base') this._play(this._baseName(), true);
    else if (this.mode === 'stun' && this.has(this.roles.stun?.loop)) this._play(this.roles.stun.loop, true);
  }

  /**
   * Re-pose on the clip set in force right after an immediate form switch (render/units.js STEALTH_FORMS: 假想敌：骨刺's
   * stealth bit; PR #365): a running attack goes on in the new set's attack clip at the same point relative to its
   * strike frame (a pending wind-up still strikes at windUntil), a stun / the resting state restarts on the new set's
   * clip without a crossfade, and the skeleton is posed at once — also while a freeze holds it (`frozen`).
   */
  syncFormPose() {
    if (this.dead) return;
    if (this.mode === 'attack') {
      const track = this.spine.state.tracks[0];
      const clip = this._attackClip();
      if (!track || !clip) return;
      const loop = this._shot(clip.loop);
      const dur = this.dur(loop);
      const oldHit = this._hitTime(this.current, this.dur(this.current));
      const hit = this._hitTime(loop, dur);
      const start = clampN(track.trackTime + hit - oldHit, 0, dur);
      const lead = this.wound && this.windUntil != null
        ? Math.max(0, this.windUntil - this.clock) : 0;
      const ts = lead > 0 ? Math.max(0, hit - start) / lead : track.timeScale;
      const tailTs = lead > 0 ? this.windTs : ts;
      this._play(loop, track.loop, { start, timeScale: ts, mix: 0 });
      this.attackUntil = this.clock + lead +
        Math.max(0, dur - (lead > 0 ? hit : start)) / tailTs;
    } else if (this.mode === 'stun') {
      const name = this.has(this.roles.stun?.loop) ? this.roles.stun.loop : this._baseName();
      this._play(name, true, { mix: 0 });
    } else if (this.mode === 'base') {
      this._play(this._baseName(), true, { mix: 0 });
    } else {
      return;
    }
    // Apply the new attachments even when normal updates are frozen.
    this.spine.update(0);
    this._posed = true;
  }

  /** Play a form's transition clip once; attacks and the resting state wait for it (mode 'change'). */
  _change(clip) {
    if (this.mode !== 'change') this.stunWanted = this.mode === 'stun';
    this.frozen = false;
    this.mode = 'change';
    this._play(clip, false, { mix: 0.08 });
    this.changeUntil = this.clock + this.dur(clip);
  }

  has(name) { return !!name && this.names.has(name); }
  dur(name) { const d = this.durations[name]; return typeof d === 'number' && d > 0 ? d : this._durFromData(name); }

  _durFromData(name) {
    try { const a = this.spine.spineData.findAnimation(name); return a && a.duration > 0 ? a.duration : 1; } catch { return 1; }
  }

  _idleName() {
    const sk = this.roles.skill;
    // [ASSUMED] DESIGN §34.4.1: the resting clip of a held skill is its loop. Idle here is the stand-up a stun
    // used to leave behind for the rest of the skill (白面鸮 S2).
    if (this._skillLoopHeld()) return sk.loop;
    if (this.skillOn && sk && this.has(sk.idle)) return sk.idle;
    return this.has(this.roles.idle) ? this.roles.idle : (this.has('Idle') ? 'Idle' : [...this.names][0]);
  }

  _baseName() {
    if (this.base === 'move') {
      const mv = this.roles.move;
      if (mv && this.has(mv.loop)) return mv.loop;
    }
    return this._idleName();
  }

  _play(name, loop, { timeScale = 1, mix, track = 0, start = 0 } = {}) {
    if (!this.has(name)) return false;
    const st = this.spine.state;
    const e = st.setAnimation(track, name, loop);
    if (e) {
      e.timeScale = timeScale;
      if (mix != null) e.mixDuration = mix;
      if (start) e.trackTime = start;
    }
    this.current = name;
    this._applied = false;
    return true;
  }

  _queue(name, loop, timeScale = 1) {
    if (!this.has(name)) return false;
    const e = this.spine.state.addAnimation(0, name, loop, 0);
    if (e) e.timeScale = timeScale;
    this._applied = false;
    return true;
  }

  /** Resting state from the snapshot. */
  setBase(base) {
    if (this.dead) return;
    const b = base === 'move' || base === 'stun' ? base : 'idle';
    // a mode change clip plays out first; the resting state it lands in is remembered
    if (this.mode === 'change') { this.stunWanted = b === 'stun'; if (b !== 'stun') this.base = b; return; }
    if (b === 'stun') { this._enterStun(); return; }
    if (this.mode === 'stun') this._leaveStun();
    if (b === this.base && this.mode !== 'stun') return;
    this.base = b;
    if (this.mode === 'base') this._play(this._baseName(), true);
  }

  _enterStun() {
    if (this.mode === 'stun') return;
    this.mode = 'stun';
    const s = this.roles.stun;
    if (s && this.has(s.loop)) {
      if (this.has(s.begin)) { this._play(s.begin, false); this._queue(s.loop, true); }
      else this._play(s.loop, true);
    } else {
      this.frozen = true;
    }
  }

  _leaveStun() {
    this.frozen = false;
    this.mode = 'base';
    // [ASSUMED] DESIGN §34.4.1: Begin cannot play under a stun. A skill that turned on during it plays Begin
    // now and queues the loop. A skill that was already on resumes the loop through _idleName (no second Begin).
    if (this.skillBeginPending && this._skillLoopHeld()) {
      this.skillBeginPending = false;
      const sk = this.roles.skill;
      this.mode = 'skillBegin';
      this._play(sk.begin, false, { mix: 0.08 });
      this.skillBeginUntil = this.clock + this.dur(sk.begin);
      if (this.has(sk.loop)) this._queue(sk.loop, true);
      return;
    }
    this.skillBeginPending = false;
    this._play(this._baseName(), true);
  }

  /**
   * An attack is due in `lead` game seconds (the renderer sees it ahead in the snapshot buffer): start the attack
   * clip from its wind-up so the strike frame lands when the attack event is rendered. Returns true once started;
   * false when it is still too early (call again next frame) or there is nothing to wind up.
   */
  windUp(interval, lead, once = false) {
    if (this.dead || this.mode === 'stun' || this.mode === 'die' || this.mode === 'change' || !(lead >= 0)) return false;
    const clip = this._attackClip();
    if (!clip) return false;
    const loop = this._shot(clip.loop);
    // One queued attack owns one wind-up. A later attack may begin while the previous recovery is still playing.
    if (this.mode === 'attack' && this.current === loop && (once || this.wound)) return false;
    const loopDur = this.dur(loop);
    // a one-off cast plays at the clip's own speed (one loop per clip length), whatever the attack rhythm
    const iv = once ? loopDur : clampN(Number.isFinite(interval) && interval > 0 ? interval : this.interval, 0.08, 8);
    const hit = this._hitTime(loop, loopDur);
    const rhythm = !once && !this.clipPerAttack;
    // (fork) an operator's rhythm loop already swinging: this attack takes the coming swing, no restart
    if (rhythm && this.mode === 'attack' && this.current === loop && this._confirmSwing(loopDur, hit, iv, lead)) return true;
    // clip per attack: its own speed, sped up only when the attacks come quicker than the clip
    const plan = windUpPlan(loopDur, hit, this.clipPerAttack && !once ? Math.min(iv, loopDur) : iv, lead);
    if (!(hit > 0) || lead * plan.ts > hit + 1e-6) return false;
    if (!once) this.interval = iv;
    this.mode = 'attack';
    this.attackUntil = rhythm ? this._rhythmUntil(this.clock + lead, plan.ts, loopDur)
      : this.clock + lead + Math.max(0, loopDur - hit) / plan.ts;
    this._play(loop, rhythm, { timeScale: plan.tsWind, start: plan.start, mix: 0.06 });
    this.windTs = plan.ts;
    this.windUntil = this.clock + lead;
    // for the official effects that start with the cast (render/vfx/wiring.js castStart): how far into its clip the
    // wind-up started and when the cast ends, in game s at the clip's own speed — sped up only when the attacks come
    // quicker than the clip, as the client plays it (this actor may stretch the clip over a slower rhythm)
    const tsOff = clampN(loopDur / iv, 1, 4);
    this.windSkip = plan.start / tsOff;
    this.windCastLeft = lead + Math.max(0, loopDur - hit) / tsOff;
    this.wound = true;
    return true;
  }

  /**
   * An attack happened now. `interval` = seconds between attacks (game time already scaled to real); `once` = a one-off
   * cast (no rhythm): the clip plays once at its own speed from its strike frame, then the resting state.
   */
  attack(interval, once = false) {
    if (this.dead || this.mode === 'stun' || this.mode === 'die' || this.mode === 'change') return;   // a form change plays out
    if (!once) this.interval = clampN(Number.isFinite(interval) && interval > 0 ? interval : this.interval, 0.08, 8);
    const clip = this._attackClip();
    if (!clip) return;
    const loop = this._shot(clip.loop);
    const loopDur = this.dur(loop);
    const per = this.clipPerAttack && !once;
    // clip per attack: its own speed (ts 1), faster only when the attacks come quicker than the clip
    const ts = once ? 1 : per ? clampN(loopDur / Math.min(this.interval, loopDur), 1, 4) : clampN(loopDur / this.interval, 0.35, 4);
    const hit = this._hitTime(loop, loopDur);
    const rhythm = !once && !per;
    // (a clip-per-attack actor still playing the previous attack's clip was not wound up for this one; an operator's
    // rhythm loop still running goes on, re-phased below)
    const wasAttacking = this.mode === 'attack' && this.current === loop
      && (this.wound || (rhythm && !!this.spine.state.tracks[0]?.loop));
    this.mode = 'attack';
    this.attackUntil = rhythm ? this._rhythmUntil(this.clock, ts, loopDur) : this.clock + Math.max(0, loopDur - hit) / ts;
    this.windUntil = null;
    this.wound = false;
    if (!wasAttacking) {
      // not wound up (no look-ahead, e.g. a batch that arrived late): the sim already resolved the hit, so show the
      // strike frame now — unless a clip-per-attack actor's rhythm leaves room for the whole clip (interval ≥ clip):
      // then the clip plays complete from its wind-up at its own speed, the strike a little late (重犯's iron ball
      // lifts before the slam; #246 by @TsangAsuna, accepted by the owner on 2026-10-07)
      const whole = per && this.interval >= loopDur;
      if (whole) this.attackUntil = this.clock + loopDur / ts;
      this._play(loop, rhythm, { timeScale: ts, start: whole ? 0 : hit, mix: 0.06 });
    } else {
      const e = this.spine.state.tracks[0];
      if (e) {
        e.timeScale = ts;
        // Preserve operator hit-phase correction when a coarse/batched update crossed windUntil.
        // This adjusts the prepared single clip; it does not start another visual swing.
        if (!once && !per) {
          const t = e.trackTime % loopDur;
          let d = hit - t;
          if (d > loopDur / 2) d -= loopDur; else if (d < -loopDur / 2) d += loopDur;
          e.trackTime += d * 0.8;
        }
      }
    }
  }

  /** (fork) When an operator's rhythm loop, striking at `strikeAt` at `ts`, drops to its resting state: just before
   *  the next strike frame, unless the next attack's wind-up confirms that swing first (no swing without an attack). */
  _rhythmUntil(strikeAt, ts, loopDur) {
    const period = loopDur / ts;
    return strikeAt + period - Math.min(RHYTHM_DROP_MARGIN, period * 0.25);
  }

  /**
   * (fork) The next attack is due in `lead` while the rhythm loop is already swinging toward its next strike: ease the
   * loop's speed so that strike lands on time (the speed returns to the rhythm at windUntil, as after a wind-up) and
   * keep the loop going. False when that strike is too far off to reach (the caller restarts from the wind-up).
   */
  _confirmSwing(loopDur, hit, interval, lead) {
    const e = this.spine.state.tracks[0];
    if (!e || !e.loop || !(hit > 0) || !(lead >= 0)) return false;
    const ts = clampN(loopDur / Math.max(0.08, interval), 0.35, 4);
    let toHit = hit - (e.trackTime % loopDur);
    if (toHit < 0) toHit += loopDur;
    const tsWind = lead > 0 ? toHit / lead : Infinity;
    if (!(tsWind >= ts * 0.4 && tsWind <= ts * MAX_WIND_SPEEDUP)) return false;
    this.interval = interval;
    e.timeScale = tsWind;
    this.windTs = ts;
    this.windUntil = this.clock + lead;
    this.attackUntil = this._rhythmUntil(this.clock + lead, ts, loopDur);
    // the official cast effects (render/vfx/wiring.js castStart), as windUp sets them: this swing is already under way,
    // `hit - toHit` into its clip (0 when the loop wrapped: the coming swing starts from its top)
    const tsOff = clampN(loopDur / Math.max(0.08, interval), 1, 4);
    this.windSkip = Math.max(0, hit - toHit) / tsOff;
    this.windCastLeft = lead + Math.max(0, loopDur - hit) / tsOff;
    this.wound = true;
    return true;
  }

  /** The clip `name` plays as under `shot`: the model's twin for this attack where it has one, else `name`.
   *  'ranged': RANGED_TWIN, else the `_B` cannon (号角 Attack_A → Attack_B, Skill_3_A_Loop → Skill_3_B_Loop);
   *  'melee': MELEE_TWIN. */
  _shot(name) {
    // (fork) a form whose clips are the official mode's own (render/units.js FORMS `noShotTwin`: 丰川祥子's S2 timbres)
    if (!this.shot || typeof name !== 'string' || this.roles?.noShotTwin) return name;
    if (this.shot === 'ranged') {
      for (const t of RANGED_TWIN[name] || []) if (this.has(t)) return t;
      const t = name.replace(/_A(?=_|$)/, '_B');
      return t !== name && this.has(t) ? t : name;
    }
    for (const t of MELEE_TWIN[name] || []) if (this.has(t)) return t;
    return name;
  }

  /** (fork) The clips `name` may play as under either shot (_shot) other than itself — the twins no role names, which
   *  render/units.js adds to the impostor box's clips (a 重炮手 / 领主 only). */
  shotTwins(name) {
    if (typeof name !== 'string') return [];
    const out = new Set();
    for (const t of [...(RANGED_TWIN[name] || []), ...(MELEE_TWIN[name] || [])]) if (this.has(t)) { out.add(t); break; }
    const b = name.replace(/_A(?=_|$)/, '_B');
    if (b !== name && this.has(b)) out.add(b);
    out.delete(name);
    return [...out];
  }

  /**
   * Begin / loop / end, and no idle of its own: the loop is the stance for the whole skill (DESIGN §34.4).
   * A distinct skill.idle (折桠 Skill_2_Idle) is the stance between attacks, so the loop stays the attack clip.
   * via:'attack' (远牙: the role is the normal attack triple) is not a skill stance.
   */
  _skillLoopHeld() {
    const sk = this.roles.skill;
    if (!this.skillOn || !sk || sk.via === 'attack') return false;
    if (!this.has(sk.begin) || !this.has(sk.loop) || !this.has(sk.end)) return false;
    if (sk.idle && sk.idle !== sk.loop && this.has(sk.idle)) return false;
    return true;
  }

  /** Skill_3_Begin → Skill_3, Skill_Start → Skill, Skill1_Loop → Skill1. */
  _skillPrefix() {
    const sk = this.roles.skill;
    const name = (sk && (sk.begin || sk.loop)) || '';
    return String(name).replace(/_(?:Begin|Start|Loop|End|Idle)$/i, '').replace(/(?:Begin|Start|Loop|End|Idle)$/i, '');
  }

  /**
   * This skill's own strike clip, which the resolver drops when a Loop exists (anim-roles skillFamily: loop =
   * P_Loop before P_Attack). 焰影苇草 S3 is Skill_3_Attack beside Skill_3_Begin/Loop/End.
   * [ASSUMED] (DESIGN §34.4.1): no table says which clip an atk plays during a held loop. Only a same-prefix
   * `<prefix>_Attack` (or `<prefix>_Attack_*`, not Down / Begin / End / Idle) counts — not the normal Attack and
   * not another skill's Attack_2 (塞雷娅). A loop that itself contains OnAttack is not a separate clip: `_attackClip`
   * returns the skill role so the existing per-attack scale and strikePose path plays that loop.
   */
  _skillOwnAttack() {
    const sk = this.roles.skill;
    if (!sk || /attack/i.test(sk.loop || '')) return null;
    const prefix = this._skillPrefix();
    if (!prefix) return null;
    const used = new Set([sk.begin, sk.loop, sk.end, sk.idle]);
    const head = `${prefix}_Attack`;
    const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_Attack(?:_|$)`, 'i');
    const hits = (this.entry && this.entry.hits) || {};
    const cands = [];
    for (const n of this.names) {
      if (used.has(n) || /down/i.test(n) || /_(?:begin|start|end|idle)(?:_|$)/i.test(n)) continue;
      if (!re.test(n)) continue;
      cands.push(n);
    }
    if (!cands.length) return null;
    if (cands.includes(head)) return head;
    cands.sort();
    const withHit = cands.find((n) => Array.isArray(hits[n]) && hits[n].length);
    return withHit || cands[0];
  }

  /**
   * The clip of the attack-class skill the next attack is (render/units.js UnitView.onCast: an enemy's `strike` slot,
   * `anims.skills[slot]` — 杰斯顿·威廉姆斯's C1_Skill): that attack plays it in place of its attack clip, then the clip's end
   * restores the attack role; null = a plain attack. A clip the model lacks is ignored.
   * @param {{ begin: string|null, loop: string, end: string|null }|null} clip
   */
  castStrike(clip) {
    this.strike = clip && this.has(clip.loop) ? clip : null;
  }

  _attackClip() {
    if (this.strike) return this.strike;
    const sk = this.roles.skill;
    const mode = this.skillOn ? this.skillAttackMode?.() : null;
    if (this.skillOn && !this._skillLoopHeld()) {
      if (mode?.animKey === 'Attack') {
        const a = mode.down && this.has(this.roles.attackDown?.loop) ? this.roles.attackDown : this.roles.attack;
        if (this.has(a?.loop)) return a;
      } else if (this.has(mode?.animKey)) {
        if (mode.animKey === sk?.loop) return sk; // keep a skill's own idle / End ownership
        return { begin: null, loop: mode.animKey, end: null };
      }
      // [ASSUMED] A cosmetic skeleton missing the official clip retains its own roles (§34.31).
    }
    if (this.skillOn && sk && this.has(sk.loop) && sk.via !== 'attack' && !this._skillIsBuffOnly()) {
      if (this._skillLoopHeld()) {
        // A dedicated strike clip (焰影苇草 Skill_3_Attack) wins. Otherwise a loop that itself has OnAttack is
        // the strike: return the skill role so windUp / attack scale it and strikePose is that frame. The attack
        // end already returns to the looping loop and skips End. A loop with no OnAttack stays put — returning
        // the normal attack would stand her up (白面鸮 S2). [ASSUMED] DESIGN §34.4.1.
        const atk = this._skillOwnAttack();
        if (atk) return { begin: null, loop: atk, end: null };
        const hits = this.entry && this.entry.hits && this.entry.hits[sk.loop];
        if (Array.isArray(hits) && hits.length) return sk;
        return null;
      }
      // Without a verified mode mapping the skill clip stays the attack clip, as before §34.31: a lone clip without
      // OnAttack is not proof of a cast (the integrator kept unverified operators unchanged, with or without the index).
      return sk;
    }
    const a = this.roles.attack;
    if (a && this.has(a.loop)) return a;
    return null;
  }

  // Skill loops that are pure stances (no OnAttack in the loop) are still valid attack visuals during a skill;
  // only an idle-typed skill loop is treated as buff-only (a verified mode mapping wins first, §34.31).
  _skillIsBuffOnly() {
    const sk = this.roles.skill;
    return !!sk && sk.loop === this.roles.idle;
  }

  /**
   * The running skill's own idle clip when its attacks are its loop clip (anims skill.idle ≠ skill.loop: 折桠's
   * Skill_2_Idle beside the Skill_2_Loop jump attack, 史尔特尔's Skill_3_Idle, 耀骑士临光's Skill_3_Idle …): the pose
   * between its attacks. null otherwise — no skill on, no idle clip, or the loop is that idle (蕾缪安's S2 / S3).
   */
  _skillIdle() {
    const sk = this.roles.skill;
    if (!this.skillOn || !sk || sk.idle === sk.loop || !this.has(sk.idle)) return null;
    return this._attackClip() === sk ? sk.idle : null;
  }

  /**
   * The strike frame of the attack clip playing now — { anim (the spine Animation), time (its first hit, s) } — or null
   * when no attack clip plays (render/units.js boneOffset: a shot leaves the muzzle as that frame poses it).
   */
  strikePose() {
    if (this.mode !== 'attack' || this.dead) return null;
    const tr = this.spine && this.spine.state ? this.spine.state.tracks[0] : null;
    const anim = tr && tr.animation;
    if (!anim || anim.name !== this.current) return null;
    return { anim, time: this._hitTime(anim.name, this.dur(anim.name)) };
  }

  _hitTime(anim, dur) {
    const hits = this.entry.hits && this.entry.hits[anim];
    if (Array.isArray(hits) && hits.length && Number.isFinite(hits[0])) return clampN(hits[0], 0, dur);
    return dur * 0.5;
  }

  /** Skill active flag changed. */
  setSkill(on) {
    on = !!on;
    if (on === this.skillOn || this.dead) return;
    this.skillOn = on;
    const sk = this.roles.skill;
    if (this.mode === 'stun' || this.mode === 'die') {
      // [ASSUMED] DESIGN §34.4.1: Begin waits out a stun. A skill that is already on keeps its loop via _idleName.
      if (on && this.mode === 'stun' && this._skillLoopHeld()) this.skillBeginPending = true;
      if (!on) this.skillBeginPending = false;
      return;
    }
    this.skillBeginPending = false;
    // a skill that ends as the unit (re)deploys — 乌尔比安's 【返回】 is a 【移动】 (sim Battle.moveRedeploy) right before
    // his S3's 'skill' off event — lets the deploy clip play out (then the plain idle) instead of cutting it with the End
    if (!on && this.mode === 'deploy') return;
    this.skillEndAfterAttack = false;
    if (on && sk) {
      this.skillEndPending = false;
      this.skillClipOnce = false;
      if (this.has(sk.begin)) {
        this.mode = 'skillBegin';
        this._play(sk.begin, false, { mix: 0.08 });
        this.skillBeginUntil = this.clock + this.dur(sk.begin);
        // then the skill's own idle until an attack plays its loop (community report #23); without one, the loop
        const next = this._skillIdle() || (this.has(sk.loop) ? this._shot(sk.loop) : null);
        if (next) this._queue(next, true);
      } else if (!this.has(sk.idle) && this.has(sk.loop) && sk.via !== 'attack' && sk.loop !== this.roles.attack?.loop && !this._skillIsBuffOnly()) {
        // No Begin and no own Idle: the skill's clip IS its animation (德克萨斯 剑雨 — anims.skill {begin:null,
        // loop:'Skill', end:null}, the 2.17 s clip; 58 instant skills in all). Play it once for its own length. An
        // instant skill turns the flag off inside the same tick (sim skills.js fires 'skill' 1 and 0 together and only
        // holds the anim code SKILL for 0.5 s), so this window is what keeps it on screen: the actor used to fall
        // through to the base clip and show no skill animation at all (player report).
        this.mode = 'skillBegin';
        this.skillClipOnce = true;
        const once = this._shot(sk.loop);
        this._play(once, false, { mix: 0.08 });
        this.skillBeginUntil = this.clock + Math.max(SKILL_CLIP_MIN, this.dur(once));
      } else if (this.mode === 'base') this._play(this._baseName(), true);
    } else if (!on && sk) {
      // an instant skill switches off while its own one-shot clip runs: let the clip finish — the state machine plays
      // its End clip (or the base) when the window ends — instead of cutting it with End / base right now
      if (this.skillClipOnce && this.clock < this.skillBeginUntil) {
        this.skillEndPending = true;
        return;
      }
      this.skillClipOnce = false;
      // (fork) a charge / instant skill whose attack is its loop clip switches off right after that attack (sim
      // skills.js: 'skill' 1, the attack, 'skill' 0 in one tick — 风笛 Bagpipe's S2 double shot): the attack plays out,
      // then its End clip (update, mode 'attack')
      if (this.has(sk.end) && this.mode === 'attack' && this.current === this._shot(sk.loop) && this.clock < this.attackUntil) {
        this.skillEndAfterAttack = true;
        return;
      }
      if (this.has(sk.end)) {
        this.mode = 'skillEnd';
        this._play(sk.end, false, { mix: 0.08 });
        this.skillEndUntil = this.clock + this.dur(sk.end);
      } else {
        this.mode = 'base';
        this._play(this._baseName(), true);
      }
    }
  }

  deploy() {
    if (this.dead) return;
    const d = this.roles.deploy;
    if (this.has(d) && d !== this.roles.idle) {
      this.mode = 'deploy';
      this._play(d, false, { mix: 0 });
      this.deployAt = this.clock;
      this.deployUntil = this.clock + this.dur(d);
    }
  }

  /** Seconds into the deploy clip while it plays, else null (a model swapped mid-deploy carries it over: units.js). */
  deployElapsed() {
    return this.mode === 'deploy' ? Math.max(0, this.clock - (this.deployAt || 0)) : null;
  }

  /**
   * [x0, y0, x1, y1] (skeleton units) holding every pose this actor has shown: the union of the manifest's per-clip
   * `extents` (sampled at build time, tools/assets/skel.mjs clipExtents) over the clips it has played (and is mixing
   * from), the idle clip from the start. It only grows, so a unit's box settles after its first attack and skill; a
   * union over every clip would size every unit for effects it never plays (Pallas: 3948 × 4065 units against ~1300 ×
   * 570 for her S3). The deploy clip (a drop from far above) counts only while it plays. Null without the extents
   * (an older manifest). A new box is a new array, so callers may compare by identity.
   */
  extents() {
    const per = this.entry?.extents;
    if (!per) return null;
    const ext = this._ext || (this._ext = { seen: new Set(), box: null, deploy: null });
    const deployName = this.roles.deploy;
    let grew = false;
    const see = (name) => {
      if (!name || name === deployName || ext.seen.has(name) || !per[name]) return;
      ext.seen.add(name);
      ext.box = unionBox(ext.box, per[name]);
      grew = true;
    };
    see(this._idleName());
    for (const tr of this.spine?.state?.tracks || []) {
      for (let e = tr; e; e = e.mixingFrom) see(e.animation?.name);
    }
    if (grew) ext.deploy = null;
    if (this.mode === 'deploy' && per[deployName]) return ext.deploy || (ext.deploy = unionBox(ext.box, per[deployName]));
    return ext.box;
  }

  /** The skeleton's death clip, or null. */
  dieClip() {
    const d = this.roles.die || (this.has('Die') ? 'Die' : null);
    return d && this.has(d) ? d : null;
  }

  /**
   * Play the death clip; returns its duration (0 when there is none). A skeleton without one (131 of the 135 Back
   * models, GitHub issue #25; a few idle-only summons and enemies) stops whatever looped — an attack, a skill or the idle —
   * and holds the first frame of its idle clip (frozen when it has none either) [ASSUMED look]: a dead unit never goes on attacking. A
   * knocked-out operator shows its fall with the Front model instead (render/units.js _wantsBack).
   */
  die() {
    if (this.dead) return 0;
    this.dead = true;
    this.frozen = false;
    this.skillBeginPending = false;
    this.mode = 'die';
    const d = this.dieClip();
    if (d) { this._play(d, false, { mix: 0.05 }); return this.dur(d); }
    const idle = this.has(this.roles.idle) ? this.roles.idle : this.has('Idle') ? 'Idle' : null;
    if (idle) this._play(idle, false, { mix: 0.1, timeScale: 0 });
    else this.frozen = true;
    return 0;
  }

  /**
   * True while an update would draw the same pixels: a frozen model, or a dead one whose only clip — track 0, not
   * looping, not mixing — has played out (the held end of a death clip; a skeleton without one holds its idle at
   * timeScale 0). Only once an update has posed the current clip and put the current tint on the slots (pixi-spine applies
   * `tint` in update: the grey of a knocked-out operator, a hit flash). Never while a form's closing clip or a wind-up is
   * pending: those act on the clock.
   */
  poseHeld() {
    if (!this._applied || this.spine.tint !== this._appliedTint || this.endClip || this.windUntil != null) return false;
    if (this.frozen) return true;
    if (this.mode !== 'die') return false;
    const tracks = this.spine.state.tracks;
    for (let i = 1; i < tracks.length; i++) if (tracks[i]) return false;
    const e = tracks[0];
    if (!e || e.loop || e.mixingFrom) return false;
    return e.timeScale === 0 || e.trackTime >= e.animationEnd - e.animationStart;
  }

  /** Revive (redeploy after death). */
  revive() {
    this.dead = false;
    this.frozen = false;
    this.mode = 'base';
    this.skillOn = false;
    this.skillBeginPending = false;
    this._play(this._baseName(), true);
  }

  update(dt) {
    this.clock += dt;
    if (this.endClip && this.clock >= this.endAt) {
      const clip = this.endClip;
      this.endClip = null;
      if (this.endRoles) { this.formRoles = this.endRoles; this.roles = { ...this._baseRoles(), ...this.endRoles }; }
      if (!this.dead) this._change(clip);
    }
    if (this.windUntil != null && this.clock >= this.windUntil) {
      // a compressed wind-up reached its strike frame: back to the rhythm speed (attack() also does it)
      this.windUntil = null;
      const e = this.spine.state.tracks[0];
      if (e && this.mode === 'attack') e.timeScale = this.windTs;
    }
    switch (this.mode) {
      case 'attack':
        if (this.clock > this.attackUntil) {
          this.mode = 'base';
          this.wound = false;
          this.windUntil = null;
          // a held begin/loop/end skill: the dedicated attack clip (if the skeleton has one) returns to the
          // looping loop. Skill_End and Idle would stand her up between heals (DESIGN §34.4).
          if (this._skillLoopHeld() && this.has(this.roles.skill.loop)) {
            this._play(this._shot(this.roles.skill.loop), true, { mix: 0.15 });
            break;
          }
          // (fork) an unconfirmed rhythm loop stops short of its next strike: hold its pose through the crossfade
          const out = this.spine.state.tracks[0];
          if (out && out.loop) out.timeScale = 0;
          const clip = this._attackClip() || this.roles.attack;
          this.strike = null;   // a strike attack is over (castStrike)
          // a skill with its own idle: back to that idle (its end clip is for the end of the skill, setSkill(false))
          const toSkillIdle = clip === this.roles.skill && !!this._skillIdle();
          const sk = this.roles.skill;
          const endSkill = this.skillEndAfterAttack;
          this.skillEndAfterAttack = false;
          if (endSkill && sk && this.has(sk.end) && this.current === this._shot(sk.loop)) {
            // (fork) the skill switched off during its own attack: its End clip closes it now
            this.mode = 'skillEnd';
            this._play(sk.end, false, { mix: 0.08 });
            this.skillEndUntil = this.clock + this.dur(sk.end);
          } else if (clip && this.has(clip.end) && !toSkillIdle) { this._play(clip.end, false); this._queue(this._baseName(), true); }
          else this._play(this._baseName(), true, { mix: 0.15 });
        }
        break;
      case 'skillBegin':
        if (this.clock >= this.skillBeginUntil) {
          const sk = this.roles.skill;
          const once = this.skillClipOnce;
          const pending = this.skillEndPending;
          this.skillClipOnce = false;
          this.skillEndPending = false;
          this.mode = 'base';
          if (pending && this.has(sk?.end)) {
            // the skill switched off inside its own clip: its End clip closes it now
            this.mode = 'skillEnd';
            this._play(sk.end, false, { mix: 0.08 });
            this.skillEndUntil = this.clock + this.dur(sk.end);
          } else if (once || pending || !this.has(sk?.loop)) {
            // the one-shot clip is over (or the skill has no loop clip at all): rest. A Begin clip with a queued next
            // clip (the loop, or the skill's own idle) needs no play here — it is already on the track
            this._play(this._baseName(), true);
          }
        }
        break;
      case 'skillEnd':
        if (this.clock >= this.skillEndUntil) { this.mode = 'base'; this._play(this._baseName(), true); }
        break;
      case 'deploy':
        if (this.clock >= this.deployUntil) { this.mode = 'base'; this._play(this._baseName(), true); }
        break;
      case 'change':
        if (this.clock >= this.changeUntil) {
          this.mode = 'base';
          if (this.stunWanted) { this.stunWanted = false; this._enterStun(); } else this._play(this._baseName(), true);
        }
        break;
      default: break;
    }
    // frozen (a stun without a stun clip, a death without a death or idle clip): the pose holds — but a model frozen before
    // it was ever posed (built while its unit is stunned or dead) is posed once at the current clip's first frame, never
    // left in its setup pose, which no clip shows and the impostor box does not cover (GitHub #542: 隐现's Back model
    // stands 900 units to the right of its feet in the setup pose)
    if (!this.frozen || !this._posed) {
      try {
        this.spine.update(this.frozen ? 0 : dt);
        this._posed = true;               // (a first update that threw is tried again: no setup pose left on screen)
      } catch { /* a broken skeleton must not stop the frame */ }
    }
    if (this.clipped && !this.clipOn) this._eyeMaskFallback();
    this.mixRect = null;
    if (!this.frozen) this._mixGuard();
    this._applied = true;
    this._appliedTint = this.spine.tint;
  }

  /**
   * The eyelids without the stencil masks (GitHub #177; PR #384 by @Convey123, re-implemented). On this roster the
   * clipping attachments are eyelids: the polygon is the eye's opening and the eyeball / eye-white meshes drawn after
   * it are clipped to it, so a closing eye (a blink, a knock-down) is hidden by the mask, not by the art. The masks
   * are off on a crowded field or below high quality (render/app.js pickClipping), and the eyeballs showed through
   * the closed lids (佩佩, 仇白, 隐德来希, 琳琅诗怀雅 …). While they are off, every slot a clip covers — walked in draw
   * order from the clipping slot to its endSlot, with the attachments in force (any skin), as pixi-spine does — is
   * hidden for the frame when the clip would cut most of it (clipHides: less than a quarter of its drawn area inside the
   * polygon, or less than half with its centre outside; GitHub #647 — 纯烬艾雅法拉's eyeballs are regions, never measured
   * before, and her lids close to a slit through their centres) [ASSUMED: all or nothing per slot, an approximation of
   * the mask's cut]. pixi-spine shows every attached slot container again on each update.
   */
  _eyeMaskFallback() {
    const sp = this.spine, skel = sp && sp.skeleton, boxes = sp && sp.slotContainers;
    if (!skel || !Array.isArray(skel.drawOrder) || !boxes) return;
    this._showClipHidden();   // undo the last pass (a pixi-spine update re-shows them anyway; a frozen one does not)
    try {
      const buf = this._clipBuf || (this._clipBuf = { v: new Float32Array(64), poly: new Float32Array(16), w: new Float32Array(6), a: new Float64Array(256), b: new Float64Array(256) });
      let pn = -1, end = null;   // pn: points of the clip in force (−1: none; < 3: degenerate, hides nothing)
      for (const slot of skel.drawOrder) {
        const att = typeof slot.getAttachment === 'function' ? slot.getAttachment() : slot.attachment;
        if (isClip(att)) {
          const n = att.worldVerticesLength | 0;
          if (buf.poly.length < n) buf.poly = new Float32Array(n);
          if (n >= 6) att.computeWorldVertices(slot, 0, n, buf.poly, 0, 2);
          pn = n >> 1;
          end = att.endSlot && att.endSlot !== slot.data ? att.endSlot : null;
          continue;
        }
        if (pn < 0) continue;
        const box = boxes[slot.data.index];
        if (pn >= 3 && att && box && clipHides(slot, att, buf, buf.poly, pn)) {
          box.visible = false;
          this._clipHidden.add(slot.data.index);
        }
        if (end && slot.data === end) { pn = -1; end = null; }
      }
    } catch { /* an unknown runtime shape must never stop the frame */ }
  }

  /** Show the slot containers the fallback hid (those still drawing an attachment). */
  _showClipHidden() {
    if (!this._clipHidden.size) return;
    const slots = this.spine?.skeleton?.slots, boxes = this.spine?.slotContainers;
    for (const i of this._clipHidden) {
      const slot = slots && slots[i];
      if (boxes && boxes[i] && slot && (typeof slot.getAttachment === 'function' ? slot.getAttachment() : slot.attachment)) boxes[i].visible = true;
    }
    this._clipHidden.clear();
  }

  /**
   * (fork) A crossfade draws nothing far from where both of its clips draw. Bones a clip moves far away while it hides
   * their slots (effects and props waiting out of sight) are blended in from there while the other clip shows those
   * slots: 伊内丝 Ines's slashes (A1–A4) wait about 1600 units to her right at alpha 0 and slid in half-faded as her
   * attack began (the "extra sprite" by her attack); her 'boc' outfit moves its waist bone 900 units below her for the
   * last frames of its attack, so its crossfade back to idle slid her whole body up from there. While a clip mixes in
   * (track 0), a visible slot reaching MIX_GUARD_PAD past the union of the mixed clips' measured bounds (clipBounds —
   * what each clip draws on its own):
   *   - is hidden for the frame when a clip mixing out does not draw it now (pixi-spine shows it again on its next
   *     update);
   *   - otherwise ends the crossfade (the incoming clip alone from the next frame, posed now): a slot both clips draw
   *     blended that far out is the body itself, and hiding it would tear the model apart.
   * A crossfade that mostly draws slots no outgoing clip draws (MIX_GUARD_PAD.swap*) is cut too: the 'boc' outfit's
   * attack swaps to a second body rig whose bones wait 900 units up and to her left while hidden, so the attack's
   * crossfade drew that body dashing in from there.
   * `mixRect` is then what the crossfade draws ([x0, y0, x1, y1], null without one): render/units.js draws the model
   * directly while it leaves the impostor box (a blend of two poses can pass outside both). No guard while a mixed clip
   * is not measured.
   */
  _mixGuard() {
    const sp = this.spine, tr = sp && sp.state && sp.state.tracks ? sp.state.tracks[0] : null, rec = this._bounds;
    if (!tr || !tr.mixingFrom || !rec || !rec.rects || !sp.skeleton || !sp.slotContainers) return;
    let u = null;
    for (let e = tr, d = 0; e && d < 4; e = e.mixingFrom, d++) {
      const r = rec.rects.get(e.animation && e.animation.name);
      if (!r) return;   // not sampled, unmeasurable (false) or drawing nothing (null): no guard
      u = unionBox(u, r);
    }
    const pad = MIX_GUARD_PAD.min + MIX_GUARD_PAD.share * Math.max(u[2] - u[0], u[3] - u[1]);
    const lim = [u[0] - pad, u[1] - pad, u[2] + pad, u[3] + pad];
    const buf = this._mixBuf || (this._mixBuf = { v: new Float32Array(256) });
    const r = [0, 0, 0, 0];
    let cut = false;
    const drawn = [Infinity, Infinity, -Infinity, -Infinity];
    try {
      const hidden = this._hiddenByOutgoing(tr);   // slot indexes an outgoing clip does not draw now
      let shown = 0, fresh = 0;   // visible slots; those of them an outgoing clip does not draw
      for (const slot of sp.skeleton.drawOrder) {
        const box = sp.slotContainers[slot.data.index];
        if (!box || !box.visible) continue;
        r[0] = r[1] = Infinity; r[2] = r[3] = -Infinity;
        if (!slotRect(slot, r, buf)) continue;
        shown++;
        if (hidden.has(slot.data.index)) fresh++;
        if (r[0] < lim[0] || r[1] < lim[1] || r[2] > lim[2] || r[3] > lim[3]) {
          if (hidden.has(slot.data.index)) { box.visible = false; continue; }
          cut = true;
          break;
        }
        if (r[0] < drawn[0]) drawn[0] = r[0]; if (r[1] < drawn[1]) drawn[1] = r[1];
        if (r[2] > drawn[2]) drawn[2] = r[2]; if (r[3] > drawn[3]) drawn[3] = r[3];
      }
      // a body swap: the incoming clip draws a set of slots the outgoing one does not (its bones parked anywhere),
      // nothing to blend from
      if (!cut && fresh > Math.max(MIX_GUARD_PAD.swapMin, MIX_GUARD_PAD.swapShare * shown)) cut = true;
      if (cut) {
        tr.mixingFrom = null;   // the outgoing clips leave the mix (AnimationState drops them with no further pose)
        tr.mixDuration = 0;
        // this frame: the incoming clip alone, from the setup pose as it is measured (no bone left where the outgoing
        // clip had moved it)
        sp.skeleton.setToSetupPose();
        sp.update(0);
        if (this.clipped && !this.clipOn) this._eyeMaskFallback();
      } else if (drawn[0] <= drawn[2]) this.mixRect = drawn;
    } catch { /* an unknown runtime shape must never stop the frame */ }
  }

  /**
   * (fork, _mixGuard) The slot indexes some clip mixing out of `tr` does not draw at its current time (no attachment, or
   * alpha ≈ 0), from that clip's attachment and colour timelines on a probe skeleton (slots only, no bones posed).
   */
  _hiddenByOutgoing(tr) {
    const out = new Set();
    const data = this.spine.spineData, Skeleton = this.spine.skeleton.constructor;
    const probe = this._probe || (this._probe = new Skeleton(data));
    for (let e = tr.mixingFrom, d = 0; e && d < 3; e = e.mixingFrom, d++) {
      const anim = e.animation;
      if (!anim) continue;
      const t = typeof e.getAnimationTime === 'function' ? e.getAnimationTime() : e.trackTime;
      probe.setSlotsToSetupPose();
      for (const tl of slotTimelines(anim)) tl.apply(probe, t, t, null, 1, 0, 0);   // MixBlend.setup, MixDirection.mixIn
      for (const slot of probe.slots) {
        const att = slot.getAttachment();
        if (!att || (slot.color ? slot.color.a : 1) * (att.color ? att.color.a : 1) <= 0.004) out.add(slot.data.index);
      }
    }
    return out;
  }

  /**
   * Skeleton-space bounds of clips `names` ("clip bounds" above; render/units.js _impBox): a Map name → rect (null: draws
   * nothing / no such clip; false: its sampling threw, not measurable) once every clip is sampled; null while some still
   * wait — they are queued here and render/app.js samples them (stepClipBounds); false when this runtime cannot be posed
   * off-screen (a test double). The actor counts as a user of its skeleton's record until it is destroyed.
   * @param {string[]} names
   */
  clipBounds(names) {
    const sp = this.spine;
    const data = sp && sp.spineData;
    if (!data) return false;
    let rec = boundsOf.get(data);
    if (!rec || names.some((n) => !rec.rects.has(n))) rec = requestClipBounds(data, sp.skeleton && sp.skeleton.constructor, names);
    if (rec.failed) return false;
    if (this._bounds !== rec) {
      if (this._bounds) useBounds(this._bounds, -1);
      this._bounds = rec;
      useBounds(rec, 1);
    }
    const clips = new Map();
    for (const n of names) {
      if (!rec.rects.has(n)) return null;
      clips.set(n, rec.rects.get(n));
    }
    return clips;
  }

  /**
   * PIXI texture of a named attachment of a slot of this model (null without one) — the official effect art a kit
   * attaches at runtime: 魔王's three 「微尘」 live in the slots `C_Eff_Moire_B` / `B2` / `B3` (all sharing the region
   * `C_Eff_Moire_B`), but every animation leaves those slots empty, so render/motes.js draws them itself and needs the
   * region. The texture is cached per (slot, attachment).
   * @param {string} slotName e.g. 'C_Eff_Moire_B'
   * @param {string} attachmentName e.g. 'C_Eff_Moire_B'
   * @returns {any} a PIXI Texture, or null (no such slot / attachment, no region, no PIXI)
   */
  effectTexture(slotName, attachmentName) {
    const key = `${slotName}|${attachmentName}`;
    if (this._effectTex?.has(key)) return this._effectTex.get(key);
    const out = attachmentTexture(this.spine?.spineData, slotName, attachmentName, globalThis.PIXI);
    (this._effectTex || (this._effectTex = new Map())).set(key, out);
    return out;
  }

  /** Model height in skeleton units (setup-pose bounds, else a chibi default). */
  get height() {
    const b = this.entry.bounds;
    if (b && Number.isFinite(b.height) && b.height > 20) return Math.min(b.height, 900);
    return 380;
  }

  destroy() {
    if (this._bounds) { useBounds(this._bounds, -1); this._bounds = null; }   // the last user gone: its queue entry goes
    try { this.spine.destroy({ children: true, texture: false, baseTexture: false }); } catch { /* ignore */ }
    this.spine = null;
  }
}
