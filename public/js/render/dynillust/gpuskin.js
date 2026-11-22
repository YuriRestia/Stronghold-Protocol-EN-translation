// render/dynillust/gpuskin.js — a dynamic illustration's Spine skeleton skinned on the GPU (WebGL2).
//
// pixi-spine computes every attachment's vertices on the CPU each frame (each vertex = Σ weight × bone matrix ×
// bone-space position), wraps them in Pixi meshes and re-packs them into a batch: about half of the illustrations' CPU
// time (render/dynillust perf report, 2026-11-22). Here only the animation itself stays on the CPU (spine-core's
// AnimationState apply and the bones' world transforms); the rest runs in the vertex shader:
//   static, uploaded once per skeleton: every attachment any slot can show (all skins), its vertices as weight entries
//     (bone, bone-space x, y, weight; an unweighted vertex is one entry on its slot's bone), page UVs, slot index;
//   per frame: the bones' world matrices (a float texture, 2 texels a bone), each slot's colours (light / dark, as
//     spine-unity's MeshGenerator writes them: render/dynillust/spine-shader.js vertexColor), the deform offsets of the
//     slots an animation deforms (only those rows), and the draw order as an index list.
//   Clipping attachments clip through the stencil buffer (the same pixels as spine-core's triangle clipping).
// The fragment stage is render/dynillust/spine-shader.js's own source (spineFragmentSource: the official Spine
// materials, Dev 51), one sampler per atlas page; the vertex stage here is GLSL ES 1.00 to link with it.
//
// WebGL2 is all it needs (vertex texture fetch of RGBA32F textures with NEAREST, 32-bit indices — no float filtering
// or float render targets), which every WebGL2 phone has. Without WebGL2, or with more than 16 atlas pages, the
// skeleton draws through pixi-spine.

import { compileLook, slotRoute, vertexColor, spineFragmentSource } from './spine-shader.js';

const ROW = 1024;            // texels per row of the data textures
const MAX_WEIGHTS = 32;      // weight entries per vertex the shader loops over (the 98 illustrations: at most 9)
const CLIPPING = 6, MESH = 2, LINKED = 3, REGION = 0; // spine-core 3.8 AttachmentType

// GLSL ES 1.00, so it links with spine-shader.js's fragment source as it is (Dev 51's varyings: vTextureCoord, vColor
// = the vertex colour × uColor, vDark, vTextureId). The data textures are RGBA32F read with NEAREST at texel centres
// (exact: indices stay far below 2^24); uRows holds their heights (bones, weights, deform, slots).
const VS = `precision highp float;
attribute vec2 aWeight;     // first weight entry, count
attribute vec2 aUv;
attribute float aSlot;
attribute float aPage;
uniform sampler2D uBones;
uniform sampler2D uWeights;
uniform sampler2D uDeform;
uniform sampler2D uSlots;
uniform vec4 uRows;
uniform mat3 uXform;  // skeleton px (y down) → clip
uniform float uDepth; // the skeleton plane's clip-space z (render/dynillust/framing.js cardViewProj: Unity z / ZR)
uniform vec4 uColor;
varying vec2 vTextureCoord;
varying vec4 vColor;
varying vec3 vDark;
varying float vTextureId;
vec4 fetch(sampler2D t, float i, float h) {
  float r = floor(i / ${ROW}.0);
  return texture2D(t, vec2((i - r * ${ROW}.0 + 0.5) / ${ROW}.0, (r + 0.5) / h));
}
void main(void) {
  float start = aWeight.x, n = aWeight.y;
  vec2 p = vec2(0.0);
  for (int k = 0; k < ${MAX_WEIGHTS}; k++) {
    if (float(k) >= n) break;
    float i = start + float(k);
    vec4 w = fetch(uWeights, i, uRows.y);
    vec2 l = w.yz + fetch(uDeform, i, uRows.z).xy;
    vec4 m = fetch(uBones, 2.0 * w.x, uRows.x);
    vec2 t = fetch(uBones, 2.0 * w.x + 1.0, uRows.x).xy;
    p += (vec2(m.x * l.x + m.z * l.y, m.y * l.x + m.w * l.y) + t) * w.w;
  }
  gl_Position = vec4((uXform * vec3(p, 1.0)).xy, uDepth, 1.0);
  vColor = fetch(uSlots, 2.0 * aSlot, uRows.w) * uColor;
  vDark = fetch(uSlots, 2.0 * aSlot + 1.0, uRows.w).rgb;
  vTextureCoord = aUv;
  vTextureId = aPage;
}`;

/**
 * The GL depth function of a material pass's ZTest name (the fx.json names, Unity's CompareFunction), or null for no
 * depth test (Disabled, Always, or none given).
 */
export function depthFunc(gl, zTest) {
  switch (zTest) {
    case 'Less': return gl.LESS;
    case 'LessEqual': return gl.LEQUAL;
    case 'Equal': return gl.EQUAL;
    case 'GreaterEqual': return gl.GEQUAL;
    case 'Greater': return gl.GREATER;
    case 'NotEqual': return gl.NOTEQUAL;
    case 'Never': return gl.NEVER;
    default: return null;
  }
}

/** Most atlas pages one draw samples (WebGL2's fragment texture-unit minimum); more → pixi-spine draws it. */
const MAX_PAGES = 16;

// the stencil pass: the clipping polygon's world positions, already in clip space
const CLIP_VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;
const CLIP_FS = `#version 300 es
precision mediump float;
out vec4 o;
void main() { o = vec4(0.0); }`;

/** Whether this GL can run the GPU path. */
export function gpuSkinSupported(gl) {
  return !!gl && typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
}

const programs = new WeakMap(); // gl → Map(page count → { main, clip, a, u, clipPos })

function compile(gl, vs, fs) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('[gpuskin] ' + gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('[gpuskin] ' + gl.getProgramInfoLog(p));
  return p;
}

/** The programs for `pages` atlas pages: our vertex stage + spine-shader.js's fragment source with that many samplers. */
function programsFor(gl, pages) {
  let byCount = programs.get(gl);
  if (!byCount) { byCount = new Map(); programs.set(gl, byCount); }
  let pr = byCount.get(pages);
  if (pr) return pr;
  const main = compile(gl, VS, spineFragmentSource(pages));
  const u = (n) => gl.getUniformLocation(main, n);
  const clip = compile(gl, CLIP_VS, CLIP_FS);
  pr = {
    main, clip,
    a: { weight: gl.getAttribLocation(main, 'aWeight'), uv: gl.getAttribLocation(main, 'aUv'), slot: gl.getAttribLocation(main, 'aSlot'), page: gl.getAttribLocation(main, 'aPage') },
    u: {
      bones: u('uBones'), weights: u('uWeights'), deform: u('uDeform'), slots: u('uSlots'), rows: u('uRows'), xform: u('uXform'),
      depth: u('uDepth'),
      // the fragment stage's uniforms, by spine-shader.js's names (SPINE_UNIFORMS)
      samplers: u('uSamplers'), color: u('uColor'), mode: u('uMode'), bleed: u('uBleed'), tintBlack: u('uTintBlack'),
      useGray: u('uUseGray'), grayScale: u('uGrayScale'), black: u('uBlack'),
    },
    units: Int32Array.from({ length: pages }, (_, i) => 4 + i), // texture units 0–3 hold the data textures
    clipPos: gl.getAttribLocation(clip, 'aPos'),
  };
  byCount.set(pages, pr);
  return pr;
}

/** A float RGBA texture of `n` texels (ROW wide), NEAREST, read at texel centres by the vertex stage. */
function dataTexture(gl, n, data) {
  const h = Math.max(1, Math.ceil(n / ROW));
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const buf = data || new Float32Array(ROW * h * 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ROW, h, 0, gl.RGBA, gl.FLOAT, buf);
  return { tex: t, h, buf };
}

/** Page UVs of a mesh / region attachment: its region UVs through the region texture's frame (rotation included). */
function pageUvs(PIXI, att) {
  const ruv = att.regionUVs || att.uvs;
  const tex = att.region && att.region.texture;
  if (!ruv || !tex) return null;
  const out = new Float32Array(ruv.length);
  const m = new PIXI.TextureMatrix(tex);
  m.update(true);
  m.multiplyUvs(ruv instanceof Float32Array ? ruv : Float32Array.from(ruv), out);
  return out;
}

/**
 * A region attachment's corner UVs (spine-core 3.8 RegionAttachment vertex order: bottom-left, top-left, top-right,
 * bottom-right) over its texture's original size: the quad covers only the trimmed pixels (updateOffset adds the
 * region's offsetX / offsetY), so its UVs span the trim rectangle, not the whole original.
 */
export function regionQuadUvs(region) {
  const t = region && region.texture, o = t && t.orig, tr = t && t.trim;
  let u0 = 0, v0 = 0, u1 = 1, v1 = 1;
  if (o && tr && o.width > 0 && o.height > 0) { u0 = tr.x / o.width; v0 = tr.y / o.height; u1 = (tr.x + tr.width) / o.width; v1 = (tr.y + tr.height) / o.height; }
  return new Float32Array([u0, v1, u0, v0, u1, v0, u1, v1]);
}

export class GpuSkeleton {
  /**
   * @param {any} renderer the Pixi renderer (its WebGL2 context)
   * @param {any} spine the pixi-spine Spine (its skeleton and state stay the CPU side)
   * @param {any} look the illustration's Spine look (render/dynillust/spine-shader.js)
   */
  constructor(renderer, spine, look) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.spine = spine;
    this.cl = compileLook(look || {});
    this._build(globalThis.PIXI); // sets this.pr once the page count is known
  }

  _build(PIXI) {
    const gl = this.gl, sk = this.spine.skeleton, sd = this.spine.spineData;
    // every attachment a slot can show (all skins); a page index per region texture
    const pages = [];
    const pageOf = (att) => {
      const bt = att.region && att.region.texture && att.region.texture.baseTexture;
      let i = pages.indexOf(bt);
      if (i < 0) { i = pages.length; pages.push(bt); }
      return i;
    };
    const verts = [];           // per vertex: weightStart, count, u, v, slot, page
    const weights = [];         // per entry: bone, x, y, w
    const indices = [];         // global, per drawable
    this.drawables = new Map(); // attachment → { vStart, vCount, iStart, iCount, wStart, wCount, unweighted, slot }
    this.clips = new Map();     // attachment → ClippingAttachment (computed per frame)
    for (const skin of sd.skins) {
      const list = skin.attachments || [];
      for (let s = 0; s < list.length; s++) {
        const map = list[s];
        if (!map) continue;
        for (const name in map) {
          const att = map[name];
          if (!att || this.drawables.has(att)) continue;
          if (att.type === CLIPPING) { this.clips.set(att, att); continue; }
          if (att.type !== MESH && att.type !== LINKED && att.type !== REGION) continue;
          const uvs = att.type === REGION ? pageUvs(PIXI, { regionUVs: regionQuadUvs(att.region), region: att.region }) : pageUvs(PIXI, att);
          if (!uvs) continue;
          const page = pageOf(att);
          const vStart = verts.length / 6, wStart = weights.length / 4;
          const boneOfSlot = sd.slots[s].boneData.index;
          let vCount, unweighted = false;
          if (att.type === REGION) {
            // pixi-spine draws regions as sprites and never fills `offset` (it stays all zeros): spine-core's quad here
            if (typeof att.updateOffset === 'function') att.updateOffset();
            const off = att.offset;
            if (!off) continue;
            for (let k = 0; k < 4; k++) {
              verts.push(weights.length / 4, 1, uvs[k * 2], uvs[k * 2 + 1], s, page);
              weights.push(boneOfSlot, off[k * 2], off[k * 2 + 1], 1);
            }
            vCount = 4; unweighted = true;
          } else if (!att.bones) {
            const v = att.vertices;
            vCount = v.length / 2; unweighted = true;
            for (let k = 0; k < vCount; k++) {
              verts.push(weights.length / 4, 1, uvs[k * 2], uvs[k * 2 + 1], s, page);
              weights.push(boneOfSlot, v[k * 2], v[k * 2 + 1], 1);
            }
          } else {
            const b = att.bones, v = att.vertices;
            let bi = 0, vi = 0, k = 0;
            while (bi < b.length) {
              const n = b[bi++];
              verts.push(weights.length / 4, n, uvs[k * 2], uvs[k * 2 + 1], s, page);
              for (let j = 0; j < n; j++, bi++, vi += 3) weights.push(b[bi], v[vi], v[vi + 1], v[vi + 2]);
              k++;
            }
            vCount = k;
          }
          const iStart = indices.length;
          const tris = att.type === REGION ? [0, 1, 2, 2, 3, 0] : att.triangles;
          for (const t of tris) indices.push(vStart + t);
          this.drawables.set(att, { vStart, vCount, iStart, iCount: tris.length, wStart, wCount: weights.length / 4 - wStart, unweighted, slot: s, page, att, deformOn: false });
        }
      }
    }
    if (pages.length > MAX_PAGES) throw new Error(`[gpuskin] ${pages.length} atlas pages (at most ${MAX_PAGES})`);
    this.pages = pages;
    this.indices = Uint32Array.from(indices);
    this.drawIdx = new Uint32Array(this.indices.length);
    // GL objects
    const pr = this.pr = programsFor(gl, Math.max(1, pages.length));
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, Float32Array.from(verts), gl.STATIC_DRAW);
    const S = 24;
    gl.enableVertexAttribArray(pr.a.weight); gl.vertexAttribPointer(pr.a.weight, 2, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(pr.a.uv); gl.vertexAttribPointer(pr.a.uv, 2, gl.FLOAT, false, S, 8);
    gl.enableVertexAttribArray(pr.a.slot); gl.vertexAttribPointer(pr.a.slot, 1, gl.FLOAT, false, S, 16);
    gl.enableVertexAttribArray(pr.a.page); gl.vertexAttribPointer(pr.a.page, 1, gl.FLOAT, false, S, 20);
    this.ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.drawIdx.byteLength, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    const nW = weights.length / 4;
    const wData = new Float32Array(ROW * Math.max(1, Math.ceil(nW / ROW)) * 4); wData.set(weights);
    this.weightsTex = dataTexture(gl, nW, wData);
    this.deformTex = dataTexture(gl, nW);
    this.bonesTex = dataTexture(gl, sk.bones.length * 2);
    this.slotsTex = dataTexture(gl, sk.slots.length * 2);
    this.clipBuf = gl.createBuffer();
    this.clipVao = gl.createVertexArray();
    gl.bindVertexArray(this.clipVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.clipBuf);
    gl.enableVertexAttribArray(pr.clipPos); gl.vertexAttribPointer(pr.clipPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.deformDirty = [Infinity, -1];
    this.vertCount = verts.length / 6;
    this.weightCount = nW;
  }

  /**
   * Per frame, after the skeleton's world transforms: bone matrices, slot colours, deform offsets, the draw order.
   * Fills `ranges[pos]` = { first, count, route, clip } for each draw-order position (render via draw()).
   */
  update() {
    const gl = this.gl, sk = this.spine.skeleton, cl = this.cl, sc = cl.skeletonColor;
    // bones
    const B = this.bonesTex.buf, bones = sk.bones;
    for (let i = 0; i < bones.length; i++) {
      const m = bones[i].matrix, o = i * 8;
      B[o] = m.a; B[o + 1] = m.b; B[o + 2] = m.c; B[o + 3] = m.d; B[o + 4] = m.tx; B[o + 5] = m.ty;
    }
    gl.bindTexture(gl.TEXTURE_2D, this.bonesTex.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ROW, this.bonesTex.h, gl.RGBA, gl.FLOAT, B);
    // slots, deform, draw order
    const S = this.slotsTex.buf, D = this.deformTex.buf, order = sk.drawOrder;
    const idx = this.drawIdx;
    this.order = this.order || new Array(order.length);
    let n = 0;
    for (let pos = 0; pos < order.length; pos++) {
      const slot = order[pos];
      const rec = this.order[pos] || (this.order[pos] = { first: 0, count: 0, route: null, clip: null, end: false });
      rec.first = n; rec.count = 0; rec.clip = null; rec.end = false;
      const att = slot.getAttachment();
      if (!att || !slot.bone.active) continue;
      if (att.type === CLIPPING) { rec.clip = att; continue; }
      const d = this.drawables.get(att);
      if (!d) continue;
      // colours (spine-unity MeshGenerator: skeleton × slot × attachment; pma bytes; an additive slot's alpha 0)
      const ac = att.color, c = slot.color;
      const route = slotRoute(cl, slot.data.blendMode);
      rec.route = route;
      const a = sc[3] * c.a * (ac ? ac.a : 1);
      const argb = vertexColor(sc[0] * c.r * (ac ? ac.r : 1), sc[1] * c.g * (ac ? ac.g : 1), sc[2] * c.b * (ac ? ac.b : 1), a, cl.pma, route.additive);
      const so = slot.data.index * 8;
      S[so] = (argb & 255) / 255; S[so + 1] = ((argb >>> 8) & 255) / 255; S[so + 2] = ((argb >>> 16) & 255) / 255; S[so + 3] = (argb >>> 24) / 255;
      if (cl.tintBlack && slot.darkColor) { const k = cl.pma ? a : 1; S[so + 4] = slot.darkColor.r * k; S[so + 5] = slot.darkColor.g * k; S[so + 6] = slot.darkColor.b * k; } else { S[so + 4] = 0; S[so + 5] = 0; S[so + 6] = 0; }
      // deform (spine-core 3.8: slot.deform holds this attachment's vertices or, weighted, its per-entry offsets)
      const def = slot.deform;
      if (def && def.length && (att.type === MESH || att.type === LINKED)) {
        this._deform(d, att, def, D);
        d.deformOn = true;
      } else if (d.deformOn) {
        D.fill(0, d.wStart * 4, (d.wStart + d.wCount) * 4);
        this._dirty(d);
        d.deformOn = false;
      }
      idx.set(this.indices.subarray(d.iStart, d.iStart + d.iCount), n);
      n += d.iCount;
      rec.count = d.iCount;
    }
    this.indexCount = n;
    gl.bindTexture(gl.TEXTURE_2D, this.slotsTex.tex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, ROW, this.slotsTex.h, gl.RGBA, gl.FLOAT, S);
    if (this.deformDirty[1] >= 0) {
      const r0 = Math.floor(this.deformDirty[0] / ROW), r1 = Math.floor(this.deformDirty[1] / ROW);
      gl.bindTexture(gl.TEXTURE_2D, this.deformTex.tex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, r0, ROW, r1 - r0 + 1, gl.RGBA, gl.FLOAT, D, r0 * ROW * 4);
      this.deformDirty[0] = Infinity; this.deformDirty[1] = -1;
    }
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, idx, 0, n);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  }

  _dirty(d) {
    const dd = this.deformDirty;
    if (d.wStart < dd[0]) dd[0] = d.wStart;
    if (d.wStart + d.wCount - 1 > dd[1]) dd[1] = d.wStart + d.wCount - 1;
  }

  _deform(d, att, def, D) {
    if (d.unweighted) {
      // the deform array replaces the bone-space vertices: the offset from the setup vertices
      const v = att.vertices;
      for (let k = 0; k < d.vCount; k++) { const o = (d.wStart + k) * 4; D[o] = def[k * 2] - v[k * 2]; D[o + 1] = def[k * 2 + 1] - v[k * 2 + 1]; }
    } else {
      // weighted: one (x, y) offset per weight entry, added to its bone-space position
      for (let k = 0; k < d.wCount; k++) { const o = (d.wStart + k) * 4; D[o] = def[k * 2]; D[o + 1] = def[k * 2 + 1]; }
    }
    this._dirty(d);
  }

  /**
   * Draw the draw-order positions from..to (inclusive) with the skeleton display's world transform `wt`. `depth`
   * ({ z, test, write } or null): the skeleton plane's clip z and its material's ZTest / ZWrite, so the effects' depth
   * written before it (an opaque-queue mesh, drawn first) hides it where they are nearer, as the official Spine
   * material does (every one of the 98: ZTest LessEqual, ZWrite Off) [src: official fx.json materials of each
   * illustration's spine.materials, passes[0]]; null: no depth test (as pixi-spine draws).
   */
  draw(from, to, wt, W, H, depth = null) {
    const gl = this.gl, pr = this.pr, u = pr.u;
    if (!this.order || to < from) return;
    gl.useProgram(pr.main);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
    const X = this._x || (this._x = new Float32Array(9));
    X[0] = 2 * wt.a / W; X[1] = -2 * wt.b / H; X[2] = 0;
    X[3] = 2 * wt.c / W; X[4] = -2 * wt.d / H; X[5] = 0;
    X[6] = 2 * wt.tx / W - 1; X[7] = 1 - 2 * wt.ty / H; X[8] = 1;
    gl.uniformMatrix3fv(u.xform, false, X);
    gl.uniform1f(u.depth, depth && Number.isFinite(depth.z) ? depth.z : 0);
    const tex = [[this.bonesTex.tex, u.bones], [this.weightsTex.tex, u.weights], [this.deformTex.tex, u.deform], [this.slotsTex.tex, u.slots]];
    // pages first: a page Pixi has not uploaded yet goes up through its texture system on unit 0
    for (let p = 0; p < pr.units.length; p++) {
      const bt = this.pages[p], g = bt ? this._glTex(bt) : null;
      gl.activeTexture(gl.TEXTURE4 + p);
      gl.bindTexture(gl.TEXTURE_2D, g);
    }
    gl.uniform1iv(u.samplers, pr.units);
    for (let i = 0; i < 4; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tex[i][0]); gl.uniform1i(tex[i][1], i); }
    gl.uniform4f(u.rows, this.bonesTex.h, this.weightsTex.h, this.deformTex.h, this.slotsTex.h);
    gl.enable(gl.BLEND);
    const fn = depth ? depthFunc(gl, depth.test) : null;
    this._depthOn = !!fn;
    if (fn) { gl.enable(gl.DEPTH_TEST); gl.depthFunc(fn); gl.depthMask(!!depth.write); }
    else gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    let runFirst = -1, runCount = 0, runRoute = null, clipEnd = null;
    const flush = () => {
      if (runCount > 0) {
        this._material(runRoute);
        gl.drawElements(gl.TRIANGLES, runCount, gl.UNSIGNED_INT, runFirst * 4);
      }
      runFirst = -1; runCount = 0;
    };
    const order = this.spine.skeleton.drawOrder;
    for (let pos = from; pos <= to && pos < this.order.length; pos++) {
      const r = this.order[pos];
      if (r.clip) {
        flush();
        this._clipStart(r.clip, order[pos], wt, W, H);
        clipEnd = r.clip.endSlot;
        gl.useProgram(pr.main); gl.bindVertexArray(this.vao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
        continue;
      }
      if (r.count) {
        if (runCount && (r.route.mat !== runRoute.mat || r.route.blend !== runRoute.blend || runFirst + runCount !== r.first)) flush();
        if (!runCount) { runFirst = r.first; runRoute = r.route; }
        runCount += r.count;
      }
      if (clipEnd && order[pos].data === clipEnd) { flush(); this._clipEnd(); clipEnd = null; }
    }
    flush();
    if (clipEnd) this._clipEnd();
    gl.bindVertexArray(null);
    if (this._depthOn) { gl.disable(gl.DEPTH_TEST); gl.depthMask(true); this._depthOn = false; }
  }

  _material(route) {
    const gl = this.gl, u = this.pr.u, m = route.mat;
    if (route.blend === 2) gl.blendFuncSeparate(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA, gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
    else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(u.mode, m.mode); gl.uniform1f(u.bleed, m.bleed); gl.uniform1f(u.tintBlack, m.tintBlack);
    gl.uniform1f(u.useGray, m.useGray); gl.uniform1f(u.grayScale, m.grayScale);
    gl.uniform4f(u.color, m.color[0], m.color[1], m.color[2], m.color[3]);
    gl.uniform3f(u.black, m.black[0], m.black[1], m.black[2]);
  }

  /** The GL texture of a page (Pixi uploads it). */
  _glTex(bt) {
    const r = this.renderer;
    let g = bt._glTextures && bt._glTextures[r.CONTEXT_UID];
    if (!g) { r.texture.bind(bt, 0); g = bt._glTextures[r.CONTEXT_UID]; }
    return g ? g.texture : null;
  }

  /** Stencil = the clipping polygon (even-odd through INVERT: concave polygons too). */
  _clipStart(clip, slot, wt, W, H) {
    const gl = this.gl, pr = this.pr;
    const n = clip.worldVerticesLength;
    const w = this._clipW && this._clipW.length >= n ? this._clipW : (this._clipW = new Float32Array(n));
    clip.computeWorldVertices(slot, 0, n, w, 0, 2);
    const pts = n / 2;
    const tri = this._clipT && this._clipT.length >= (pts - 2) * 6 ? this._clipT : (this._clipT = new Float32Array(Math.max(6, (pts - 2) * 6)));
    const cx = (i) => 2 * (wt.a * w[i * 2] + wt.c * w[i * 2 + 1] + wt.tx) / W - 1;
    const cy = (i) => 1 - 2 * (wt.b * w[i * 2] + wt.d * w[i * 2 + 1] + wt.ty) / H;
    let o = 0;
    for (let i = 1; i < pts - 1; i++) { tri[o++] = cx(0); tri[o++] = cy(0); tri[o++] = cx(i); tri[o++] = cy(i); tri[o++] = cx(i + 1); tri[o++] = cy(i + 1); }
    gl.useProgram(pr.clip);
    gl.bindVertexArray(this.clipVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.clipBuf);
    gl.bufferData(gl.ARRAY_BUFFER, tri.subarray(0, o), gl.STREAM_DRAW);
    gl.enable(gl.STENCIL_TEST);
    gl.clearStencil(0); gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 0, 1);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
    gl.stencilMask(1);
    // the clip polygon marks the stencil whatever lies in front of it: the depth test applies to the slots it clips
    if (this._depthOn) gl.disable(gl.DEPTH_TEST);
    gl.drawArrays(gl.TRIANGLES, 0, o / 2);
    if (this._depthOn) gl.enable(gl.DEPTH_TEST);
    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.EQUAL, 1, 1);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  }

  _clipEnd() {
    const gl = this.gl;
    gl.clear(gl.STENCIL_BUFFER_BIT);
    gl.disable(gl.STENCIL_TEST);
  }

  destroy() {
    const gl = this.gl;
    for (const t of [this.weightsTex, this.deformTex, this.bonesTex, this.slotsTex]) if (t) gl.deleteTexture(t.tex);
    gl.deleteBuffer(this.vbo); gl.deleteBuffer(this.ibo); gl.deleteBuffer(this.clipBuf);
    gl.deleteVertexArray(this.vao); gl.deleteVertexArray(this.clipVao);
  }
}
