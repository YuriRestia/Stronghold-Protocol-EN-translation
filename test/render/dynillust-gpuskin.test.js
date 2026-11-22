// test/render/dynillust-gpuskin.test.js — the parts of render/dynillust/gpuskin.js that run without a GPU: the WebGL2
// gate and a region attachment's quad UVs. The shader path itself is checked in a browser against pixi-spine's CPU
// path (notes: dev50-l2d-perf-report.md, "GPU skinning").

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gpuSkinSupported, regionQuadUvs } from '../../public/js/render/dynillust/gpuskin.js';

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
