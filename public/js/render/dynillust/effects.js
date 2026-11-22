// render/dynillust/effects.js — a dynamic illustration's Unity effect layer (everything in its prefab but the
// skeleton: the action particles, the always-on "General Effects", the background objects, the Animators) as ONE
// instance of our official-effect player (render/vfx/effect.js) in illustration mode, seen through the illustration's
// own camera.
//
//   Action particles on / off and FxDelay: instance.js decides, this file applies (Effect.setActive). FxDelay waits from
//   its node's enable (FxDelay.OnEnable / _DelayFunc), so the client's ForceToEnd before a deactivation needs no extra
//   step here: the node waits again whenever it is enabled again [src: official GameAssembly.dll FxDelay.ForceToEnd
//   0x5C97F2–0x5C9812; DynIllust._ApplyAnimation 0x1431A1B].
//   Animator triggers (OnIdle / OnSpecial / OnStart / OnInteract) switch each Animator that has a transition for the
//   trigger to that state's clip, from now [src: DynIllust._ApplyAnimation 0x1431B6E–0x1431BDB: SetTrigger on every
//   active Animator whose parameters hold a Trigger of that name]. The controller graph comes from the extraction.
//   BoneFollowers place their node on the bone each frame: position = the skeleton transform's TransformPoint(bone
//   world x, y, 0), rotation = the skeleton's rotation + the bone's WorldRotationX (+180° for a negative local scale
//   x with followLocalScale), local scale = the bone's local scaleX / scaleY with followLocalScale and without
//   useAppliedLocalScale, else 1 [src: official GameAssembly.dll Spine.Unity.BoneFollower.DoLateUpdate 0x63675B8
//   (TransformPoint), 0x63677B7–0x636790D (rotation), 0x6367A9A–0x6367B43 (scale); dump.cs BoneFollower fields]. Not
//   modelled: the extra 180° turns and sign flips that only negative lossy scales of the skeleton or the follower's
//   parent trigger (0x63677C8–0x6367803, 0x6367AEA–0x6367B25): no illustration root seen so far has one.
//
// The camera: orthographic along +z, centred on the illustration's origin. Our player sorts and sizes for a pinhole
// camera, so it gets one far behind (CAM_DIST) whose field of view spans the orthographic height there: billboards face
// along +z, the on-screen size clamps see the 2 · cameraSize view, and distances keep Unity's orthographic depth order.

import { Effect } from '../vfx/effect.js';
import { cameraBasis } from '../vfx/geom.js';
import { mat4 } from '../vfx/math.js';

/** Distance of the stand-in pinhole camera behind the illustration (Unity units; see the header). */
export const CAM_DIST = 10000;

/**
 * One Animator's state machine (docs/design/vfx-format.md §33.19 animators: Unity's AnimatorController constants), first
 * layer. Triggers stay set until a transition uses them (Unity's trigger rule); an Animator that is switched off goes
 * back to its default state and default parameters when it is on again (writeDefaultValuesOnDisable, DynIllustBase.Init
 * [src: official GameAssembly.dll DynIllustBase.Init 0x1441DD8–0x1441DE9]). AnyState transitions are checked before the
 * current state's; a transition without conditions needs its exit time. A transition's cross-fade (`duration`) is not
 * blended: the next state starts at once at its `offset` [unverified: our clip sampler plays one clip per Animator].
 */
export class AnimatorRuntime {
  constructor(a, clips) {
    this.node = a.node;
    this.params = a.parameters || [];
    this.layer = (a.layers || [])[0] || null;
    this.clips = clips || [];
    this.reset();
  }

  reset() {
    this.values = new Map(this.params.map((p) => [p.name, p.type === 'trigger' || p.type === 'bool' ? !!p.default : Number(p.default) || 0]));
    this.state = this.layer ? this.layer.defaultState | 0 : -1;
    this.start = null;   // content time the state began (set at the first step)
    this.off = true;
  }

  has(name) { return this.values.has(name); }

  setTrigger(name) { if (this.values.has(name)) this.values.set(name, true); }

  _len(st) { const c = st && Number.isInteger(st.clip) ? this.clips[st.clip] : null; return c && c.length > 0 ? c.length : 0; }

  _passes(t, norm) {
    const conds = t.conditions || [];
    if (!conds.length && !t.hasExitTime) return false;
    if (t.hasExitTime && !(norm >= Number(t.exitTime))) return false;
    for (const c of conds) {
      const v = this.values.get(c.param);
      const th = Number(c.threshold) || 0;
      const ok = c.mode === 'if' ? !!v : c.mode === 'ifNot' ? !v : c.mode === 'greater' ? v > th : c.mode === 'less' ? v < th
        : c.mode === 'equals' ? v === th : c.mode === 'notEqual' ? v !== th : false;
      if (!ok) return false;
    }
    return true;
  }

  /** Advance to content time `ct` (node active in hierarchy: `on`); returns { clip, at } to sample, or null. */
  step(ct, on) {
    if (!this.layer) return null;
    if (!on) { if (!this.off) this.reset(); return null; }
    if (this.off) { this.off = false; this.start = ct; }
    for (let guard = 0; guard < 4; guard++) {
      const st = this.layer.states[this.state];
      if (!st) return null;
      const len = this._len(st), speed = Number.isFinite(st.speed) ? st.speed : 1;
      const norm = len > 0 ? (ct - this.start) * speed / len : 0;
      const list = [...(this.layer.anyState || []), ...(st.transitions || [])];
      const t = list.find((x) => this._passes(x, norm));
      if (!t) break;
      for (const c of t.conditions || []) if (this.params.find((p) => p.name === c.param && p.type === 'trigger')) this.values.set(c.param, false);
      this.state = t.to == null ? this.layer.defaultState | 0 : t.to;
      const nxt = this.layer.states[this.state], nlen = this._len(nxt), ns = nxt && Number.isFinite(nxt.speed) && nxt.speed > 0 ? nxt.speed : 1;
      this.start = ct - (Number(t.offset) || 0) * nlen / ns;
    }
    const st = this.layer.states[this.state];
    if (!st || !Number.isInteger(st.clip)) return null;
    const speed = Number.isFinite(st.speed) ? st.speed : 1;
    return { clip: st.clip, elapsed: (ct - this.start) * speed };
  }
}

/** The effect player's camera basis for an illustration camera of half-height `cameraSize`, `h` px tall. */
export function illustBasis(cameraSize, h) {
  const cs = Number(cameraSize) > 0 ? Number(cameraSize) : 10;
  return cameraBasis(0, [0, 0, -CAM_DIST], h, 2 * Math.atan(cs / CAM_DIST));
}

export class IllustEffects {
  /**
   * @param {any} def the compiled prefab (render/vfx/library.js)
   * @param {{ lib?: any, lite?: boolean, seed?: number,
   *           followers?: { node: number, bone: string, xy?: boolean, z?: boolean, rot?: boolean, scale?: boolean }[],
   *           animators?: any[] }} [o]
   * `animators`: the index's Animator state machines (§33.19)
   */
  constructor(def, o = {}) {
    this.def = def;
    this.fx = new Effect(def, { lite: !!o.lite, lib: o.lib, seed: o.seed }).illustMode();
    // the prefab root (the DynIllust GameObject, which carries the skeleton) at its authored place
    this.fx.place({ pos: Array.isArray(def.rootPos) ? def.rootPos : [0, 0, 0] });
    this.fx._matrices();
    this.followers = (o.followers || []).filter((f) => f && Number.isInteger(f.node) && f.node > 0 && f.node < def.n && f.bone);
    this.animators = (o.animators || []).filter((a) => a && Number.isInteger(a.node) && a.node < def.n && Array.isArray(a.layers))
      .map((a) => new AnimatorRuntime(a, def.clips));
    if (this.animators.length) this.fx.animOv = new Map();
    if (this.followers.length) this.fx.worldOv = new Map(this.followers.map((f) => [f.node, mat4()]));
  }

  setActive(node, on) { this.fx.setActive(node, on); }

  /** FxDelay.ForceToEnd: nothing more to do in our model (see the header). */
  forceDelayEnd() {}

  /** Animator.SetTrigger(name) on every active Animator that has that parameter (DynIllust._ApplyAnimation). */
  trigger(name) {
    for (const a of this.animators) if (this.fx.hier[a.node] && a.has(name)) a.setTrigger(name);
  }

  /** The Animators' state machines at the layer's content time, before the frame's clips are sampled. */
  animate() {
    if (!this.animators.length) return;
    const ct = this.fx.ctime;
    for (const a of this.animators) {
      const r = a.step(ct, !!this.fx.hier[a.node]);
      if (r) this.fx.animOv.set(a.node, { clip: r.clip, at: ct - r.elapsed });
      else this.fx.animOv.delete(a.node);
    }
  }

  /** BoneFollower.LateUpdate for every follower, from the skeleton's pose (skeleton.js bonePose). */
  follow(skel) {
    if (!this.followers.length) return;
    const root = this.fx.world[0];
    for (const f of this.followers) {
      const b = skel.bonePose(f.bone);
      const out = this.fx.worldOv.get(f.node);
      if (!b || !out) continue;
      const cur = this.fx.world[f.node];
      // the root's rotation about z and its lossy scale (the illustration root is not rotated about x / y)
      const rx = Math.hypot(root[0], root[1]), ry = Math.hypot(root[4], root[5]);
      const rootRot = Math.atan2(root[1], root[0]);
      let rot = f.rot !== false ? b.rot : 0;
      if (f.rot !== false && f.scale !== false && b.scaleX < 0) rot += 180;
      const ang = rootRot + rot * Math.PI / 180, c = Math.cos(ang), s = Math.sin(ang);
      const sx = (f.scale !== false ? b.scaleX : 1) * rx, sy = (f.scale !== false ? b.scaleY : 1) * ry;
      const px = f.xy !== false ? root[0] * b.x + root[4] * b.y + root[12] : cur[12];
      const py = f.xy !== false ? root[1] * b.x + root[5] * b.y + root[13] : cur[13];
      const pz = f.z !== false ? root[14] : cur[14];
      out.fill(0);
      out[0] = c * sx; out[1] = s * sx; out[4] = -s * sy; out[5] = c * sy; out[10] = 1; out[15] = 1;
      out[12] = px; out[13] = py; out[14] = pz;
    }
  }

  update(dt) { this.fx.update(dt); }

  /** The visible renderers as draw entries (render/vfx/effect.js gather). */
  gather(basis, sink) { this.fx.gather(basis, sink); }

  destroy() { this.fx.kill(); }
}
