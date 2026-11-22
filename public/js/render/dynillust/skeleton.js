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
// pixi-spine keeps the skeleton y-down: a bone's `matrix` (a PIXI Matrix: b / c are spine's c / b) maps bone space to
// the Spine display's local px. Unity's skeleton space is y-up and in skeleton units × `scale`.

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
    // Dev 51's createDynSpine (render/dynillust/spine-shader.js: the official Spine fragment math) when the stage has it
    this.spine = o.makeSpine ? o.makeSpine(spineData) : new P.spine.Spine(spineData);
    this.spine.autoUpdate = false;
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
    if (this.gpu) {
      // spine-core's own steps (pixi-spine's Spine.update minus its per-slot mesh work)
      const sp = this.spine;
      sp.state.update(dt);
      sp.state.apply(sp.skeleton);
      sp.skeleton.updateWorldTransform();
    } else this.spine.update(dt);
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
    if (this.gpu) { this.gpu.draw(p.from, p.to, this.spine.worldTransform, renderer.width, renderer.height); return; }
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
    // y-down px → y-up skeleton units → Unity units (one reused record: read it before the next call)
    const p = this._pose || (this._pose = { x: 0, y: 0, rot: 0, scaleX: 1, scaleY: 1 });
    p.x = tx * this.scale; p.y = -ty * this.scale; p.rot = Math.atan2(-bb, a) * 180 / Math.PI; p.scaleX = b.scaleX; p.scaleY = b.scaleY;
    return p;
  }

  destroy() {
    try { this.gpu?.destroy(); } catch { /* the context may be gone */ }
    try { this.spine.destroy({ children: true }); } catch { /* already gone */ }
  }
}
