// render/dynillust/skeleton.js — a dynamic illustration's Spine skeleton (pixi-spine) as instance.js drives it, split
// into the parts its SkeletonRenderSeparator draws, with its bones in the illustration's Unity frame.
//
//   Mixes: the SkeletonDataAsset's `defaultMix` and its from → to pairs (Lappland the Decadenza E2: 0, Idle → Special
//   0.5 s, Idle → Interact 0.5 s, Special → Interact 0.5 s) [src: official dyn_illust_char_1038_whitw2_SkeletonData
//   defaultMix, fromAnimation, toAnimation, duration].
//   Scale: the SkeletonDataAsset's `scale` (0.01) turns skeleton units into Unity units [src: same asset `scale`].
//   Parts: SkeletonAnimation.separatorSlotNames split the draw order; each part is a SkeletonPartsRenderer whose
//   MeshRenderer has its own sorting layer / order (Lappland: part "0" order 0, part "1" order 10; the root's own
//   MeshRenderer disabled) [src: official dyn_illust_char_1038_whitw2_2 SkeletonAnimation, MeshRenderer of 0 / 1].
//   A part ends with its separator slot, the next part starts after it [unverified: spine-unity 3.8
//   MeshGenerator.GenerateSkeletonRendererInstruction as recalled — the client's copy is not disassembled yet].
//
// The pose is computed y-UP, as spine-unity computes it, with pixi-spine's global y-down flip (PIXI.spine.settings.yDown)
// off for that moment; the Spine display is flipped instead (renderer.js: a negative y scale). Spine 3.8's world
// transform for bones that drop their parent's scale or rotation (transform modes NoScale, NoScaleOrReflection,
// NoRotationOrReflection) strips a y flip along with the scale, so posing y-down mirrors those bones against the rest
// (Angelina the Mellow Wish's E2 art: the face-turn bones HM_Head_X' / X'' / Y' are NoScale and her face tore into a
// pale wedge) [src: notes dev50-gpu-skinning-report.md §Pale shapes; spine-runtimes 3.8 Bone.updateWorldTransformWith].
// A bone's `matrix` (a PIXI Matrix: b / c are spine's c / b) then maps bone space to the display's local px, y up,
// in skeleton units; Unity's skeleton space is the same y-up space × `scale`.

/** Run `fn` with pixi-spine's y-down flip off (the pose as spine-unity computes it). */
function poseYUp(fn) {
  const S = globalThis.PIXI && globalThis.PIXI.spine && globalThis.PIXI.spine.settings;
  if (!S || !S.yDown) return fn();
  S.yDown = false;
  try { return fn(); } finally { S.yDown = true; }
}

/**
 * Drop the bone timelines (rotate / translate / scale / shear) whose value never changes, with no change to any pose:
 * applying them is most of a frame's animation cost and a third to four fifths of them hold one value (Wang's E2 art:
 * 19,864 of 23,829) [src: notes dev50-l2d-perf-report.md §What is left on the CPU]. A property (timeline type + bone)
 * goes when every animation of the skeleton leaves it unkeyed or keys it with one and the same constant from time 0:
 *   some animation leaves it unkeyed → the constant must be the setup value (offset 0, scale 1): the timeline only
 *     ever sets what is already there;
 *   every animation keys it → a rotate / translate / shear constant is added to the bone's setup values, so every mix
 *     ends on the value it ended on before (scale is never baked: its mix-out reads the setup scale's sign).
 * Spine 3.8: before its first key a timeline applies the setup value, so the first key must be at time 0; rotate,
 * translate and shear apply setup + offset, scale setup × value [src: public/vendor/pixi-spine.js Rotate / Translate /
 * Scale / ShearTimeline.apply; getPropertyId = (0 rotate, 1 translate, 2 scale, 3 shear << 24) + boneIndex;
 * Animation.timelineIds, read by AnimationState's hasTimeline]. Runs once per skeleton data, before a Spine is built
 * from it. Returns { removed, baked }.
 */
export function pruneConstantBoneTimelines(sd) {
  if (!sd || !Array.isArray(sd.animations)) return null;
  if (sd._pruned) return sd._pruned;
  const EPS = 1e-5;
  const ENT = [2, 3, 3, 3];                      // rotate: [t, deg]; translate / scale / shear: [t, x, y]
  const IDENT = [[0], [0, 0], [1, 1], [0, 0]];   // the value that changes nothing
  const constant = (t, ent) => {
    const f = t.frames;
    if (!f || f.length < ent || Math.abs(f[0]) > EPS) return null;
    const v = []; for (let j = 1; j < ent; j++) v.push(f[j]);
    for (let i = ent; i < f.length; i += ent) for (let j = 1; j < ent; j++) if (Math.abs(f[i + j] - v[j - 1]) > EPS) return null;
    return v;
  };
  const byProp = new Map();                      // propertyId → { type, bone, list: [{ anim, t, v }] }
  for (const anim of sd.animations) {
    for (const t of anim.timelines) {
      if (typeof t.getPropertyId !== 'function' || t.boneIndex == null) continue;
      const id = t.getPropertyId(), type = id >>> 24;
      if (type > 3) continue;
      let p = byProp.get(id);
      if (!p) { p = { type, bone: t.boneIndex, list: [] }; byProp.set(id, p); }
      p.list.push({ anim, t, v: constant(t, ENT[type]) });
    }
  }
  const drop = new Set();
  let baked = 0;
  for (const p of byProp.values()) {
    if (p.list.some((x) => !x.v)) continue;                                            // some animation moves it
    const v0 = p.list[0].v;
    if (p.list.some((x) => x.v.some((y, i) => Math.abs(y - v0[i]) > EPS))) continue;    // different constants
    if (!v0.every((y, i) => Math.abs(y - IDENT[p.type][i]) <= EPS)) {
      const everywhere = new Set(p.list.map((x) => x.anim)).size === sd.animations.length;
      if (!everywhere || p.type === 2) continue;
      const b = sd.bones[p.bone];
      if (p.type === 0) b.rotation += v0[0];
      else if (p.type === 1) { b.x += v0[0]; b.y += v0[1]; }
      else { b.shearX += v0[0]; b.shearY += v0[1]; }
      baked++;
    }
    for (const x of p.list) drop.add(x.t);
  }
  for (const anim of sd.animations) {
    const keep = anim.timelines.filter((t) => !drop.has(t));
    if (keep.length === anim.timelines.length) continue;
    anim.timelines = keep;
    const ids = anim.timelineIds;
    if (ids && typeof ids.clear === 'function' && typeof ids.add === 'function') { ids.clear(); for (const t of keep) ids.add(t.getPropertyId()); }
    else if (ids) { for (const k of Object.keys(ids)) ids[k] = false; for (const t of keep) ids[t.getPropertyId()] = true; }
  }
  sd._pruned = { removed: drop.size, baked };
  return sd._pruned;
}

const PATH = 4;                 // spine-core 3.8 AttachmentType.Path
const PATH_EPSILON = 0.00001;  // spine-core 3.8 PathConstraint.epsilon

/** spine-core 3.8 Utils.setArraySize: resize in place, new entries 0. */
function sized(a, n) {
  if (a.length < n) for (let k = a.length; k < n; k++) a[k] = 0;
  else a.length = n;
  return a;
}

/**
 * spine-core 3.8 PathConstraint.update, installed on each of an illustration's path constraints. pixi-spine 4.0.6's 3.8
 * port sets the bone angle from the path only in Tangent mode (`if (tangents && (tangents ? … : …))`), so a Chain or
 * ChainScale constraint turns its bones flat to angle 0 (Exusiai the New Covenant's E2 art: both legs, the right calf
 * a pale plank across her hips) [src: public/vendor/pixi-spine.js PathConstraint.update, read 2026-11-22; spine-runtimes
 * 3.8 spine-ts PathConstraint.update: `if (tangents) r = positions[p - 1]; else if (spaces[i + 1] == 0) r =
 * positions[p + 2]; else r = Math.atan2(dy, dx);`]. Bone matrices are PIXI Matrices: b / c are spine's c / b.
 */
export function pathConstraintUpdate() {
  const attachment = this.target.getAttachment();
  if (!attachment || attachment.type !== PATH) return;
  const rotateMix = this.rotateMix, translateMix = this.translateMix;
  const translate = translateMix > 0, rotate = rotateMix > 0;
  if (!translate && !rotate) return;
  const data = this.data;
  const spacingMode = data.spacingMode, lengthSpacing = spacingMode === 0;          // SpacingMode Length 0, Fixed 1, Percent 2
  const rotateMode = data.rotateMode, tangents = rotateMode === 0, scale = rotateMode === 2; // Tangent 0, Chain 1, ChainScale 2
  const bones = this.bones, boneCount = bones.length, spacesCount = tangents ? boneCount : boneCount + 1;
  const spaces = sized(this.spaces, spacesCount);
  let lengths = null;
  const spacing = this.spacing;
  if (scale || lengthSpacing) {
    if (scale) lengths = sized(this.lengths, boneCount);
    for (let i = 0, n = spacesCount - 1; i < n;) {
      const bone = bones[i], setupLength = bone.data.length;
      if (setupLength < PATH_EPSILON) {
        if (scale) lengths[i] = 0;
        spaces[++i] = 0;
      } else {
        const x = setupLength * bone.matrix.a, y = setupLength * bone.matrix.b;
        const length = Math.sqrt(x * x + y * y);
        if (scale) lengths[i] = length;
        spaces[++i] = (lengthSpacing ? setupLength + spacing : spacing) * length / setupLength;
      }
    }
  } else {
    for (let i = 1; i < spacesCount; i++) spaces[i] = spacing;
  }
  const positions = this.computeWorldPositions(attachment, spacesCount, tangents, data.positionMode === 1, spacingMode === 2);
  let boneX = positions[0], boneY = positions[1], offsetRotation = data.offsetRotation;
  let tip;
  if (offsetRotation === 0) tip = rotateMode === 1;
  else {
    tip = false;
    const p = this.target.bone.matrix;
    offsetRotation *= p.a * p.d - p.c * p.b > 0 ? Math.PI / 180 : -Math.PI / 180;
  }
  for (let i = 0, p = 3; i < boneCount; i++, p += 3) {
    const bone = bones[i], m = bone.matrix;
    m.tx += (boneX - m.tx) * translateMix;
    m.ty += (boneY - m.ty) * translateMix;
    const x = positions[p], y = positions[p + 1], dx = x - boneX, dy = y - boneY;
    if (scale) {
      const length = lengths[i];
      if (length !== 0) { const s = (Math.sqrt(dx * dx + dy * dy) / length - 1) * rotateMix + 1; m.a *= s; m.b *= s; }
    }
    boneX = x; boneY = y;
    if (rotate) {
      const a = m.a, b = m.c, c = m.b, d = m.d; // spine's a, b, c, d
      let r;
      if (tangents) r = positions[p - 1];
      else if (spaces[i + 1] === 0) r = positions[p + 2];
      else r = Math.atan2(dy, dx);
      r -= Math.atan2(c, a);
      if (tip) {
        const cos = Math.cos(r), sin = Math.sin(r), length = bone.data.length;
        boneX += (length * (cos * a - sin * c) - dx) * rotateMix;
        boneY += (length * (sin * a + cos * c) - dy) * rotateMix;
      } else r += offsetRotation;
      if (r > Math.PI) r -= 2 * Math.PI;
      else if (r < -Math.PI) r += 2 * Math.PI;
      r *= rotateMix;
      const cos = Math.cos(r), sin = Math.sin(r);
      m.a = cos * a - sin * c; m.c = cos * b - sin * d; m.b = sin * a + cos * c; m.d = sin * b + cos * d;
    }
    bone.appliedValid = false;
  }
}

/** Spine/Skeleton's render queue: Transparent [unverified: spine-unity Spine-Skeleton.shader Tags Queue as recalled]. */
export const SKELETON_QUEUE = 3000;

export class IllustSkeleton {
  /**
   * @param {any} spineData pixi-spine skeleton data
   * @param {{ scale?: number, skin?: string, defaultMix?: number, mixes?: [string, string, number][],
   *           separators?: string[], parts?: { layer?: number, order?: number, queue?: number, enabled?: boolean }[],
   *           renderer?: { layer?: number, order?: number, queue?: number }, makeSpine?: (d: any) => any }} [o]
   * `parts`: one per separator part (none: the root renderer draws it whole)
   */
  constructor(spineData, o = {}) {
    const P = globalThis.PIXI;
    // timelines that never change go before the first Spine is built from this data (`prune: false` keeps them)
    if (o.prune !== false) pruneConstantBoneTimelines(spineData);
    // Dev 51's createDynSpine (render/dynillust/spine-shader.js: the official Spine fragment math) when the stage has it
    this.spine = o.makeSpine ? o.makeSpine(spineData) : new P.spine.Spine(spineData);
    this.spine.autoUpdate = false;
    // spine-core's path constraint math on this skeleton's constraints only (pathConstraintUpdate: pixi-spine's 3.8
    // port lost the Chain / ChainScale bone angle); other pixi-spine skeletons in the game keep the library's
    for (const c of this.spine.skeleton.pathConstraints || []) c.update = pathConstraintUpdate;
    this.scale = Number(o.scale) > 0 ? Number(o.scale) : 0.01;
    if (o.skin) { try { this.spine.skeleton.setSkinByName(o.skin); this.spine.skeleton.setSlotsToSetupPose(); } catch { /* the default skin */ } }
    const sd = this.spine.stateData;
    sd.defaultMix = Number(o.defaultMix) || 0;
    for (const m of o.mixes || []) {
      if (!Array.isArray(m) || m.length < 3) continue;
      try { sd.setMix(m[0], m[1], Number(m[2]) || 0); } catch { /* an animation this skeleton lacks */ }
    }
    this.animationNames = (spineData.animations || []).map((a) => a.name);
    const listeners = [];
    this._listeners = listeners;
    this.spine.state.addListener({ complete: (entry) => { for (const cb of listeners) cb(entry); } });
    this.separators = new Set(Array.isArray(o.separators) ? o.separators : []);
    const root = o.renderer || {};
    const parts = Array.isArray(o.parts) && o.parts.length ? o.parts : [root];
    this.parts = parts.map((p, i) => ({
      index: i,
      layer: Number(p.layer) || 0,
      order: Number(p.order) || 0,
      queue: Number.isFinite(p.queue) ? p.queue : SKELETON_QUEUE,
      enabled: p.enabled !== false,
      from: 0, to: -1,
    }));
  }

  // ---- instance.js adapter
  findAnimation(name) { return this.spine.spineData.findAnimation(name) || null; }
  setAnimation(track, name, loop) { return this.spine.state.setAnimation(track, name, !!loop); }
  current(track) { return this.spine.state.getCurrent(track) || null; }
  onComplete(cb) { this._listeners.push(cb); }

  /**
   * Skin on the GPU (render/dynillust/gpuskin.js) from now on: the CPU keeps only the animation and the bones' world
   * transforms; pixi-spine's slot meshes are hidden (Pixi skips them) and the parts draw through `gpu`.
   */
  enableGpu(gpu) {
    this.gpu = gpu;
    for (const c of this.spine.children) c.visible = false;
  }

  /** Advance by dt s and pose (fires the complete events), then split the draw order into the parts. */
  update(dt) {
    poseYUp(() => {
      if (this.gpu) {
        // spine-core's own steps (pixi-spine's Spine.update minus its per-slot mesh work)
        const sp = this.spine;
        sp.state.update(dt);
        sp.state.apply(sp.skeleton);
        sp.skeleton.updateWorldTransform();
      } else this.spine.update(dt);
    });
    this._split();
  }

  /** GPU path: upload this frame's bones, colours, deforms and draw order (before the frame is drawn). */
  upload() { if (this.gpu) this.gpu.update(); }

  /** Draw-order ranges [from, to] of the parts (children of the Spine display follow the draw order). */
  _split() {
    const order = this.spine.skeleton.drawOrder;
    const n = order.length, parts = this.parts;
    let k = 0, from = 0;
    for (let i = 0; i < n && k < parts.length - 1; i++) {
      if (this.separators.has(order[i].data.name)) { parts[k].from = from; parts[k].to = i; k++; from = i + 1; }
    }
    parts[k].from = from; parts[k].to = n - 1;
    for (let j = k + 1; j < parts.length; j++) { parts[j].from = n; parts[j].to = n - 1; }
  }

  /** Render part `p`'s slot containers with Pixi (from inside the Spine display's render). */
  renderPart(renderer, p) {
    // `depth` (renderer.js Slot): the skeleton plane's clip z and its Spine material's ZTest / ZWrite
    if (this.gpu) { this.gpu.draw(p.from, p.to, this.spine.worldTransform, renderer.width, renderer.height, this.depth || null); return; }
    const ch = this.spine.children;
    for (let i = p.from; i <= p.to && i < ch.length; i++) ch[i].render(renderer);
  }

  /**
   * A bone's pose for a BoneFollower, in the skeleton's Unity space (y-up, Unity units): { x, y, rot (degrees,
   * Spine's worldRotationX), scaleX, scaleY (local) } or null.
   */
  bonePose(name) {
    // the bone objects stay for the skeleton's life: looked up by name once, not every frame (findBone scans them all)
    const cache = this._bones || (this._bones = new Map());
    let b = cache.get(name);
    if (b === undefined) { b = this.spine.skeleton.findBone(name) || null; cache.set(name, b); }
    if (!b) return null;
    const m = b.matrix;
    const a = m ? m.a : b.a, bb = m ? m.b : b.c, tx = m ? m.tx : b.worldX, ty = m ? m.ty : b.worldY;
    // y-up skeleton units → Unity units (one reused record: read it before the next call)
    const p = this._pose || (this._pose = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 });
    p.x = tx * this.scale; p.y = ty * this.scale; p.rot = Math.atan2(bb, a) * 180 / Math.PI; p.scaleX = b.scaleX; p.scaleY = b.scaleY;
    return p;
  }

  destroy() {
    try { this.gpu?.destroy(); } catch { /* the context may be gone */ }
    try { this.spine.destroy({ children: true }); } catch { /* already gone */ }
  }
}
