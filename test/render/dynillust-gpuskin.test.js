// test/render/dynillust-gpuskin.test.js — the parts of render/dynillust/gpuskin.js that run without a GPU: the WebGL2
// gate and a region attachment's quad UVs. The shader path itself is checked in a browser against pixi-spine's CPU
// path (notes: dev50-l2d-perf-report.md, "GPU skinning").

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gpuSkinSupported, regionQuadUvs } from '../../public/js/render/dynillust/gpuskin.js';
import { pathConstraintUpdate, pruneConstantBoneTimelines } from '../../public/js/render/dynillust/skeleton.js';

describe('pruneConstantBoneTimelines (constant bone timelines dropped, no pose change)', () => {
  // a Spine 3.8 bone timeline: type (0 rotate, 1 translate, 2 scale, 3 shear) << 24 + bone; frames [t, values…]
  const tl = (type, bone, frames) => ({ boneIndex: bone, frames: Float32Array.from(frames), getPropertyId: () => (type << 24) + bone });
  const anim = (name, timelines) => { const ids = []; for (const t of timelines) ids[t.getPropertyId()] = true; return { name, timelines, timelineIds: ids }; };
  test('drops a timeline at its setup value, bakes one every animation holds, keeps a moving one', () => {
    const bones = [{ rotation: 10, x: 0, y: 0, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }, { rotation: 0, x: 5, y: 5, scaleX: 1, scaleY: 1, shearX: 0, shearY: 0 }];
    const idle = anim('Idle', [tl(0, 0, [0, 0, 1, 0]), tl(1, 1, [0, 2, 3, 2, 2, 3]), tl(0, 1, [0, 0, 1, 30])]);
    const special = anim('Special', [tl(1, 1, [0, 2, 3]), tl(2, 0, [0, 2, 2])]);
    const sd = { bones, animations: [idle, special] };
    const r = pruneConstantBoneTimelines(sd);
    // rotate of bone 0 (offset 0, only Idle keys it): dropped as is; translate of bone 1 (2, 3 in both): baked;
    // rotate of bone 1 moves: kept; scale of bone 0 (2, only Special): not the setup value and not in every animation
    assert.deepEqual(r, { removed: 3, baked: 1 });
    assert.equal(bones[1].x, 7); assert.equal(bones[1].y, 8);
    assert.equal(bones[0].rotation, 10);
    assert.deepEqual(idle.timelines.map((t) => t.getPropertyId()), [(0 << 24) + 1]);
    assert.deepEqual(special.timelines.map((t) => t.getPropertyId()), [(2 << 24) + 0]);
    assert.equal(idle.timelineIds[(1 << 24) + 1], false);
    assert.equal(pruneConstantBoneTimelines(sd), r); // once per data
  });
  test('a first key after time 0 shows the setup value before it: kept', () => {
    const sd = { bones: [{ rotation: 0 }], animations: [anim('Idle', [tl(0, 0, [0.5, 15])])] };
    assert.deepEqual(pruneConstantBoneTimelines(sd), { removed: 0, baked: 0 });
  });
  test('a scale every animation holds is never baked', () => {
    const sd = { bones: [{ scaleX: 1, scaleY: 1 }], animations: [anim('Idle', [tl(2, 0, [0, 2, 2])])] };
    assert.deepEqual(pruneConstantBoneTimelines(sd), { removed: 0, baked: 0 });
    assert.equal(sd.bones[0].scaleX, 1);
  });
});

describe('pathConstraintUpdate (spine-core 3.8 PathConstraint.update)', () => {
  /** One bone on a path whose next position lies straight up from the first: a ChainScale constraint, rotate 1. */
  const make = (rotateMode) => {
    const bone = { data: { length: 10 }, matrix: { a: 1, b: 0, c: 0, d: 1, tx: 5, ty: 5 }, appliedValid: true };
    return {
      bone,
      c: {
        target: { getAttachment: () => ({ type: 4 }), bone: { matrix: { a: 1, b: 0, c: 0, d: 1 } } },
        rotateMix: 1, translateMix: 1, spacing: 1, spaces: [], lengths: [], bones: [bone],
        data: { spacingMode: 2, rotateMode, positionMode: 1, offsetRotation: 0 },
        // [x0, y0, r0, x1, y1, r1]: the path from (0, 0) to (0, 10)
        computeWorldPositions: () => [0, 0, Math.PI / 2, 0, 10, Math.PI / 2],
      },
    };
  };
  test('ChainScale turns the bone along the path (pixi-spine 4.0.6 left it at angle 0)', () => {
    const { bone, c } = make(2);
    pathConstraintUpdate.call(c);
    // moved to the path start, pointing up (+90°), length 10 kept (scale 1)
    assert.equal(bone.matrix.tx, 0); assert.equal(bone.matrix.ty, 0);
    assert.ok(Math.abs(bone.matrix.a) < 1e-9 && Math.abs(bone.matrix.b - 1) < 1e-9, JSON.stringify(bone.matrix));
    assert.equal(bone.appliedValid, false);
  });
  test('Tangent takes the path tangent', () => {
    const { bone, c } = make(0);
    pathConstraintUpdate.call(c);
    assert.ok(Math.abs(bone.matrix.a) < 1e-9 && Math.abs(bone.matrix.b - 1) < 1e-9, JSON.stringify(bone.matrix));
  });
});

describe('gpuskin', () => {
  test('needs a WebGL2 context', () => {
    assert.equal(gpuSkinSupported(null), false);
    assert.equal(gpuSkinSupported({}), false);
  });

  test('an untrimmed region spans its whole texture, spine-core corner order', () => {
    const uv = regionQuadUvs({ texture: { orig: { width: 112, height: 40 }, trim: null } });
    // bottom-left, top-left, top-right, bottom-right (spine-core 3.8 RegionAttachment)
    assert.deepEqual(Array.from(uv), [0, 1, 0, 0, 1, 0, 1, 1]);
  });

  test('a trimmed region spans only its trim rectangle (the quad updateOffset builds covers just those pixels)', () => {
    // Ling "A Gallant Dream" O_Ling_waist_body3: original 133×66, trimmed to 131×64 at (1, 1)
    const uv = Array.from(regionQuadUvs({ texture: { orig: { width: 133, height: 66 }, trim: { x: 1, y: 1, width: 131, height: 64 } } }));
    const want = [1 / 133, 65 / 66, 1 / 133, 1 / 66, 132 / 133, 1 / 66, 132 / 133, 65 / 66];
    uv.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-6, `uv[${i}] ${v} vs ${want[i]}`));
  });
});
