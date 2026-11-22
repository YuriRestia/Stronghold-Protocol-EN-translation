// test/render/dynillust-shaders.test.js — (fork) the dynamic illustrations' shaders: the effect families the
// illustrations add (render/vfx/glsl-l2d.js through materials.js / glsl.js) and the Spine shader
// (render/dynillust/spine-shader.js: materials, slot blend routing, spine-unity's vertex colours). The GLSL itself is
// compiled in a real WebGL2 context by the review probe; here: what each shader name compiles to, and that the battle
// effects' programs are unchanged.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compileMaterial, familyOf } from '../../public/js/render/vfx/materials.js';
import { vertexSource, fragmentSource, FAMILIES } from '../../public/js/render/vfx/glsl.js';
import { L2D_FAMILIES } from '../../public/js/render/vfx/glsl-l2d.js';
import {
  compileMaterial as spineMaterial, compileLook, slotRoute, vertexColor, MODE, PAGE_TEXTURE_OPTIONS,
  spineFragmentSource, SPINE_FRAGMENT_TEMPLATE, SPINE_VERTEX_SOURCE, SPINE_UNIFORMS, materialUniforms,
} from '../../public/js/render/dynillust/spine-shader.js';

const GRAB_PASSES = [
  { blend: ['One', 'Zero', 'One', 'Zero'], zTest: 'Always', cull: 'Off' },            // the GrabPass itself
  { blend: ['One', 'Zero', 'One', 'Zero'], zTest: 'LessEqual', cull: 'Back' },        // the pass that draws
];

describe('dynamic illustration effect shaders (materials.js)', () => {
  test('each of the illustrations\' shaders has its own family, none falls back', () => {
    const want = {
      'Torappu/Particles-L2D/Dissolve/Dissolve AB Double edge': 'dissolveDoubleEdge',
      'Hidden/Particles-L2D/Dissolve/Dissolve AB Double edge': 'dissolveDoubleEdge',
      'Torappu/Particles-L2D/Dissolve/Dissolve Add Double edge': 'dissolveDoubleEdge',
      'Torappu/Particles-L2D/Disturb/Disturb GrabPass': 'disturbGrab',
      'Torappu/Particles-L2D/Disturb/Disturb GrabPassOnce': 'disturbGrab',
      'Torappu/Particles/RGBsplit': 'rgbSplit',
      'Torappu/Particles-L2D/Unlit-Outline': 'unlitOutline',
      'Torappu/Particles-L2D/Mask/Erase': 'maskErase',
      'Torappu/Particles-L2D/3D/Toon': 'toon',
      'Torappu/Particles-L2D/3D/MatCapTransparent': 'matcap',
      'Torappu/Particles-L2D/Particles-Poker-Reflect': 'poker',
      'Torappu/UI/AlphaBlend': 'uiAlphaBlend',
      'Torappu/Particles-L2D/Special/Particle-Blur': 'particleBlur',
    };
    for (const [shader, family] of Object.entries(want)) {
      assert.deepEqual(familyOf(shader), { family }, shader);
      assert.ok(L2D_FAMILIES[family], `${family} is defined`);
      assert.match(fragmentSource(family, {}), /void main\(\)/);
    }
  });

  test('a GrabPass shader draws with its second pass, grabbing per renderer or once per frame', () => {
    const each = compileMaterial({ shader: 'Torappu/Particles-L2D/Disturb/Disturb GrabPass', passes: GRAB_PASSES });
    assert.equal(each.grab, 'each');
    assert.equal(each.state.cull, 'Back');
    assert.equal(each.state.zTest, 'lequal');
    assert.equal(each.defs.vx, 'grab');
    assert.equal(each.defs.cvs, false);
    const once = compileMaterial({ shader: 'Torappu/Particles-L2D/Disturb/Disturb GrabPassOnce', keywords: ['_CUSTOMDATA_ON'], passes: GRAB_PASSES });
    assert.equal(once.grab, 'once');
    assert.equal(once.defs.cvs, true, '_CUSTOMDATA_ON turns the custom streams on');
    assert.notEqual(once.key, each.key);
    const blur = compileMaterial({ shader: 'Torappu/Particles-L2D/Special/Particle-Blur', passes: GRAB_PASSES });
    assert.equal(blur.grab, 'once', 'the blur shares the named grab "_DisturbGrabTexture"');
  });

  test('Unlit-Outline draws its outline hull as a second pass with that pass\'s state', () => {
    const m = compileMaterial({ shader: 'Torappu/Particles-L2D/Unlit-Outline', passes: [
      { blend: ['SrcAlpha', 'OneMinusSrcAlpha', 'Zero', 'OneMinusSrcAlpha'], cull: 'Back', zWrite: true },
      { blend: ['SrcAlpha', 'OneMinusSrcAlpha', 'Zero', 'OneMinusSrcAlpha'], cull: 'Front', zWrite: true },
    ] });
    assert.equal(m.family, 'unlitOutline');
    assert.equal(m.second.family, 'unlitOutlineHull');
    assert.equal(m.second.state.cull, 'Front');
    assert.equal(m.second.defs.vx, 'hull');
    assert.equal(m.second.second, null);
  });

  test('the Add Double edge program keeps its own edge term', () => {
    const add = compileMaterial({ shader: 'Torappu/Particles-L2D/Dissolve/Dissolve Add Double edge' });
    const ab = compileMaterial({ shader: 'Hidden/Particles-L2D/Dissolve/Dissolve AB Double edge' });
    assert.equal(add.defs.edgeAdd, true);
    assert.notEqual(add.key, ab.key);
    assert.doesNotMatch(fragmentSource(add.family, add.defs), /0\.001\) \/ \(u_Edgecolor/);
    assert.match(fragmentSource(ab.family, ab.defs), /\(e \+ 0\.001\) \/ \(u_Edgecolor\.a \+ 0\.001\)/);
  });

  test('the battle effects\' materials and programs are unchanged', () => {
    const m = compileMaterial({ shader: 'Torappu/Particles/AlphaBlend', passes: [{ blend: ['SrcAlpha', 'OneMinusSrcAlpha', 'Zero', 'OneMinusSrcAlpha'] }] });
    assert.equal(m.key, 'basic|000');
    assert.equal(m.grab, undefined);
    assert.equal(m.second, undefined);
    const d = compileMaterial({ shader: 'Torappu/Particles/Dissolve/Dissolve(CustomData)', keywords: ['_HGCUSTOMVERTEXSTREAM_ON'] });
    assert.equal(d.key, 'dissolveCd|100');
    for (const kind of ['quad', 'mesh', 'strip']) {
      assert.equal(vertexSource(kind), vertexSource(kind, {}));
      assert.equal(vertexSource(kind), vertexSource(kind, d.defs), 'battle defs add nothing to the vertex shader');
      assert.doesNotMatch(vertexSource(kind), /v_g2|a_tan|u_Outline/);
    }
    for (const fam of Object.keys(FAMILIES)) assert.ok(!L2D_FAMILIES[fam], `${fam} is not redefined`);
  });

  test('Disturb2 moves its own texture by two noise reads and ignores the vertex rgb (Dusk\'s Elite 2 background)', () => {
    const ab = compileMaterial({ shader: 'Torappu/Particles-L2D/Disturb/Disturb2 (AlphaBlend)', keywords: ['_DISTURBMODE_DEFAULT'] });
    const add = compileMaterial({ shader: 'Torappu/Particles-L2D/Disturb/Disturb2 (Add)' });
    const glow = compileMaterial({ shader: 'Torappu/Particles-L2D/Disturb/Disturb2 (AlphaBlend)', keywords: ['_DISTURBMODE_GLOW'] });
    for (const m of [ab, add, glow]) assert.equal(m.family, 'disturb2');
    assert.equal(ab.defs.glow, false);
    assert.equal(add.defs.add, true);
    assert.equal(glow.defs.glow, true);
    assert.equal(new Set([ab.key, add.key, glow.key]).size, 3);
    const src = fragmentSource('disturb2', ab.defs);
    assert.match(src, /u_Noise1Param\.zw \* 0\.1/);
    assert.match(src, /c\.a \* v_col\.a/);
    assert.doesNotMatch(src, /v_col\.rgb/, 'the vertex colour\'s rgb is not read');
    assert.match(fragmentSource('disturb2', add.defs), /c\.rgb \* t\.a/);
    assert.match(fragmentSource('disturb2', glow.defs), /t\.g \* u_GlowColor/);
    assert.notEqual(familyOf('Torappu/Particles/Disturb/Disturb Origin').family, 'disturb2', 'the battle Disturb Origin keeps its family');
  });

  test('Ram/VertexDisturb moves a mesh\'s vertices and always disturbs the main UV (Degenbrecher\'s outfit)', () => {
    const vd = compileMaterial({ shader: 'Torappu/Particles-L2D/Ram/VertexDisturb(CustomData)' });
    const rd = compileMaterial({ shader: 'Torappu/Particles-L2D/Ram/Disturb(CustomData)' });
    const battle = compileMaterial({ shader: 'Torappu/Particles/Ram/VertexDisturb(CustomData)' });
    assert.equal(vd.family, 'ramDisturbCd');
    assert.equal(vd.defs.vx, 'vdisturb');
    assert.notEqual(vd.key, rd.key);
    assert.equal(battle.defs.vx, undefined, 'the battle shader keeps its program');
    const v = vertexSource('mesh', vd.defs);
    assert.match(v, /textureLod\(u_VertexDisturbTex, vuv, 0\.0\)\.xyz - 0\.5/);
    assert.match(v, /d \* w \* u_VertexDisturbIntensity\.xyz/);
    assert.ok(v.lastIndexOf('gl_Position = u_vp * vec4(pw, 1.0)') > v.indexOf('gl_Position = u_vp * vec4(p, 1.0)'));
    assert.equal(vertexSource('quad', vd.defs), vertexSource('quad'), 'a particle draws undisplaced');
    assert.match(fragmentSource(vd.family, vd.defs), /muv2 = muv \+ dist\.xy;/);
    assert.match(fragmentSource(rd.family, rd.defs), /muv2 = muv \+ dist\.xy \* u_DisturbInfluenceMainUV;/);
  });

  test('an illustration target translates the official alpha factors from transmittance to coverage (Mask/Erase)', async () => {
    const { rtAlphaFactors } = await import('../../public/js/render/vfx/gl.js');
    const erase = compileMaterial({ shader: 'Torappu/Particles-L2D/Mask/Erase', passes: [{ blend: ['SrcAlpha', 'OneMinusSrcAlpha', 'One', 'OneMinusSrcAlpha'] }] });
    assert.deepEqual(rtAlphaFactors(erase.state.srcA, erase.state.dstA), [false, true], 'Erase: C(1 − a), the pixel turns see-through');
    const ab = compileMaterial({ shader: 'Torappu/Particles-L2D/AlphaBlend', passes: [{ blend: ['SrcAlpha', 'OneMinusSrcAlpha', 'Zero', 'OneMinusSrcAlpha'] }] });
    assert.deepEqual(rtAlphaFactors(ab.state.srcA, ab.state.dstA), [true, true], 'alpha blend: coverage accumulates as before');
    const add = compileMaterial({ shader: 'Torappu/Particles-L2D/Additive', passes: [{ blend: ['SrcAlpha', 'One', 'Zero', 'One'] }] });
    assert.deepEqual(rtAlphaFactors(add.state.srcA, add.state.dstA), [false, false], 'additive keeps the target alpha');
    assert.equal(rtAlphaFactors(1, 0), null, 'no exact equivalent: the default stays');
  });

  test('a vertex variant adds its code at the end of main()', () => {
    const v = vertexSource('quad', { vx: 'grab' });
    assert.match(v, /out vec4 v_g2;/);
    assert.ok(v.indexOf('v_g2 = u_vp') > v.indexOf('gl_Position = u_vp'), 'after the clip position');
    assert.ok(v.trimEnd().endsWith('}'));
    const h = vertexSource('mesh', { vx: 'hull' });
    assert.match(h, /gl_Position = c;/);
    const t = vertexSource('mesh', { vx: 'tangent' });
    assert.match(t, /mat3\(a_m0, a_m1, a_m2\) \* a_tan\.xyz/);
    assert.doesNotMatch(vertexSource('quad', { vx: 'tangent' }), /a_m0, a_m1/);
  });
});

describe('dynamic illustration Spine shader (spine-shader.js)', () => {
  const L2D = 'Torappu/Spine/L2D/Skeleton-AlphaSplit';

  test('materials: bleed, tint black, gray, PMA multiply, SkeletonGraphic', () => {
    const bleed = spineMaterial({ shader: L2D, keywords: ['_USEALPHATEX_OFF', '_USEBLEED_ON'], useGray: 1, grayScale: 0.5 });
    assert.deepEqual([bleed.mode, bleed.bleed, bleed.tintBlack, bleed.useGray, bleed.grayScale, bleed.blend], [MODE.SPLIT, 1, 0, 1, 0.5, 'normal']);
    const split = spineMaterial({ shader: 'Torappu/Spine/Skeleton-AlphaSplit', keywords: [], useGray: 1 });
    assert.equal(split.useGray, 0, 'the plain AlphaSplit shader has no gray');
    const tb = spineMaterial({ shader: `${L2D} (Tint Black)`, keywords: ['_USEBLEED_ON'], color: [1, 1, 1, 0.5], black: [0.1, 0.2, 0.3, 0] });
    assert.deepEqual([tb.tintBlack, tb.bleed, tb.color[3], tb.black], [1, 1, 0.5, [0.1, 0.2, 0.3]]);
    const mul = spineMaterial({ shader: 'Spine/Blend Modes/Skeleton PMA Multiply', color: [0.5, 1, 1, 0.5] });
    assert.deepEqual([mul.mode, mul.blend, mul.color], [MODE.TEX_X_COLOR, 'multiply', [0.25, 0.5, 0.5, 0.5]]);
    assert.equal(spineMaterial({ shader: 'Torappu/Spine/SkeletonGraphic-AlphaSplit-ClipRect' }).mode, MODE.GRAPHIC);
  });

  test('Dusk "Hazy Jade": its multiply slots draw with the plain L2D shader, blended normally (O5)', () => {
    const mat = { shader: L2D, keywords: ['_USEALPHATEX_OFF', '_USEBLEED_ON'] };
    const cl = compileLook({ kind: 'animation', pmaVertexColors: true, material: mat, multiply: mat });
    const r = slotRoute(cl, 2);
    assert.equal(r.blend, 0, 'Pixi NORMAL');
    assert.equal(r.mat.mode, MODE.SPLIT);
  });

  test('Ines: a real PMA Multiply material multiplies; additive slots stay on the base material', () => {
    const cl = compileLook({ kind: 'animation', pmaVertexColors: true, material: { shader: L2D, keywords: ['_USEBLEED_ON'] }, multiply: { shader: 'Spine/Blend Modes/Skeleton PMA Multiply' } });
    assert.equal(slotRoute(cl, 2).blend, 2, 'Pixi MULTIPLY');
    const add = slotRoute(cl, 1);
    assert.equal(add.mat, cl.base);
    assert.equal(add.blend, 0);
    assert.equal(add.additive, true);
    assert.equal(slotRoute(cl, 3).mat, cl.base, 'no screen material: the base one');
  });

  test('vertex colours as spine-unity writes them: bytes truncated, PMA, additive alpha 0', () => {
    const unpack = (c) => [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24];
    assert.deepEqual(unpack(vertexColor(1, 0.5, 0.25, 0.5, true, false)), [127, 63, 31, 127]);
    assert.deepEqual(unpack(vertexColor(1, 0.5, 0.25, 0.5, true, true)), [127, 63, 31, 0]);
    assert.deepEqual(unpack(vertexColor(1, 0.5, 0.25, 0.5, false, true)), [255, 127, 63, 127], 'straight colours: no additive rule');
  });

  test('the fragment source and uniform list for another vertex stage (GPU skinning)', () => {
    const one = spineFragmentSource(1), four = spineFragmentSource(4);
    assert.doesNotMatch(one + four, /%count%|%forloop%/);
    assert.match(one, /uniform sampler2D uSamplers\[1\];/);
    assert.match(one, /color = texture2D\(uSamplers\[0\], vTextureCoord\)/);
    assert.equal((four.match(/if \(vTextureId < /g) || []).length, 3);
    for (const v of ['vTextureCoord', 'vColor', 'vDark', 'vTextureId']) assert.match(one, new RegExp(`varying [a-z0-9]+ ${v};`));
    for (const u of SPINE_UNIFORMS) assert.ok((SPINE_FRAGMENT_TEMPLATE + SPINE_VERTEX_SOURCE).includes(u), u);
    const mu = materialUniforms(compileLook({ material: { shader: L2D, keywords: ['_USEBLEED_ON'] } }).base);
    assert.deepEqual(Object.keys(mu).sort(), SPINE_UNIFORMS.filter((u) => u !== 'uSamplers').sort());
    assert.equal(mu.uBleed, 1);
  });

  test('looks default to the renderer kind and page textures load raw', () => {
    assert.equal(compileLook({ kind: 'graphic' }).pma, false);
    assert.equal(compileLook({}).pma, true);
    assert.equal(PAGE_TEXTURE_OPTIONS.alphaMode, 2);
  });
});
