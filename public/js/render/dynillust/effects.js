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
   *           animators?: { node: number, triggers: Record<string, number> }[] }} [o]
   * `animators[].triggers`: trigger name → index in def.clips of the state it leads to
   */
  constructor(def, o = {}) {
    this.def = def;
    this.fx = new Effect(def, { lite: !!o.lite, lib: o.lib, seed: o.seed }).illustMode();
    // the prefab root (the DynIllust GameObject, which carries the skeleton) at its authored place
    this.fx.place({ pos: Array.isArray(def.rootPos) ? def.rootPos : [0, 0, 0] });
    this.fx._matrices();
    this.followers = (o.followers || []).filter((f) => f && Number.isInteger(f.node) && f.node > 0 && f.node < def.n && f.bone);
    this.animators = (o.animators || []).filter((a) => a && Number.isInteger(a.node) && a.triggers);
    if (this.followers.length) this.fx.worldOv = new Map(this.followers.map((f) => [f.node, mat4()]));
  }

  setActive(node, on) { this.fx.setActive(node, on); }

  /** FxDelay.ForceToEnd: nothing more to do in our model (see the header). */
  forceDelayEnd() {}

  /** Animator.SetTrigger(name) on every Animator of the layer that has it. */
  trigger(name) {
    for (const a of this.animators) {
      const clip = a.triggers[name];
      if (Number.isInteger(clip) && this.fx.hier[a.node]) this.fx.setAnimatorClip(a.node, clip);
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
