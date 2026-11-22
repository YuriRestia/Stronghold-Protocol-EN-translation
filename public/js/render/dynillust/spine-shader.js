// render/dynillust/spine-shader.js — the official Spine shaders of the dynamic illustrations (动态立绘) for pixi-spine:
// one batch plugin ('dynSpine') draws every slot of a skeleton (region and mesh attachments of any size) with the
// fragment computation of the material the official client gives that slot.
//
//   createDynSpine(PIXI, skeletonData, look)  → a PIXI.spine.Spine whose slots draw through 'dynSpine'
//   installDynSpine(PIXI)                     registers the plugin (createDynSpine calls it; once per PIXI)
//   compileLook(look)                         the look's materials as batch uniforms (pure; used by the tests)
//   slotRoute(compiled, spineBlend)           the material + Pixi blend a slot of that Spine blend mode draws with
//   vertexColor(rgb, a, pma, additive)        the vertex colour bytes spine-unity writes (Color32)
//   PAGE_TEXTURE_OPTIONS                      how page textures must be loaded (raw values: no premultiply on upload)
//   spineFragmentSource(textures)             the fragment shader (GLSL ES 1.0) for another vertex stage, e.g. GPU
//                                             skinning: varyings vTextureCoord, vColor (= vertex colour × uColor),
//                                             vDark, vTextureId; samplers uSamplers[textures]
//   SPINE_FRAGMENT_TEMPLATE, SPINE_VERTEX_SOURCE  the batch plugin's own sources (%count% / %forloop% unfilled)
//   SPINE_UNIFORMS, materialUniforms(mat)     the uniform names the shaders read, and their values for a compiled
//                                             material (uColor is read by the vertex stage too)
//
// `look` (one skeleton renderer of the illustration bundle, from the illustration index):
//   { kind: 'animation' | 'graphic', pmaVertexColors, tintBlack, color?: [r,g,b,a] (SkeletonGraphic m_Color),
//     material: { shader, keywords, color: _Color, black: _Black, useGray: _UseGray, grayScale: _GrayScale },
//     multiply?, screen?, additive?: the SkeletonDataAsset's blend-mode materials (same fields) or null }
//
// Official shaders (CN client `[uc]shaders.ab` and the dynchars bundles, D3D11 programs disassembled with
// d3dcompiler_47; read 2026-11-22). Every pass blends One / OneMinusSrcAlpha unless noted:
//   Torappu/Spine/L2D/Skeleton-AlphaSplit, Torappu/Spine/Skeleton-AlphaSplit:
//     t = (_MainTex.rgb, _AlphaTex.r) or _MainTex (_USEALPHATEX_OFF); _USEBLEED_ON: t.rgb *= t.a;
//     c = t × colour, colour = vertex colour × _Color; L2D only: _UseGray > 0 → c.rgb = mix(c.rgb, luma(c.rgb), _GrayScale)
//     with luma weights (0.299, 0.587, 0.114)
//   … (Tint Black): rgb = (dark + _Black.rgb) × (t.a − t.rgb) × _Color.a + t.rgb × colour.rgb, a = t.a × colour.a;
//     dark = (UV2.xy, UV3.x)
//   Spine/Blend Modes/Skeleton PMA Multiply: c = _MainTex × vertex colour × (_Color.rgb × _Color.a, _Color.a), blend
//     DstColor / OneMinusSrcAlpha (colour and alpha)
//   Spine/Skeleton: c = _MainTex × vertex colour
//   Torappu/Spine/SkeletonGraphic-AlphaSplit-ClipRect: c = t × colour, c.rgb *= c.a, × the _ClipRect test (a UI
//     RectMask2D rectangle: the renderer clips the skeleton to it)
// Which material a slot uses (spine-unity 3.8 BlendModeMaterials): Multiply / Screen / Additive slots take the
// SkeletonDataAsset's blend-mode material when it lists one, the page material otherwise. In the illustrations only
// multiply materials exist; Dusk 'Hazy Jade' (char_2015_dusk_nian#12) and char_202_demkni_ambiencesynesthesia#7
// list the plain L2D AlphaSplit shader there, so their multiply slots blend normally; only
// char_4087_ines_ambiencesynesthesia#5 has the PMA Multiply shader.
// Vertex colours (spine-runtimes 3.8 spine-unity MeshGenerator.cs, BuildMeshWithArrays / AddSubmesh): Color32 =
// skeleton × slot × attachment colour; with pmaVertexColors a = (byte)(alpha × 255), rgb = (byte)(c × a_byte), and an
// Additive slot's a = 0 (One / OneMinusSrcAlpha then adds); tint black (settings.tintBlack) writes the dark colour to
// UV2 / UV3 as floats, × alpha with pmaVertexColors; without tintBlack the UVs are absent (0).
//
// Output alpha: the official L2D AlphaSplit passes write alpha with Zero / OneMinusSrcAlpha into the illustration's
// render texture; here the illustration is drawn into a transparent canvas, so alpha is written as coverage
// (One / OneMinusSrcAlpha, Pixi's premultiplied NORMAL) and the colour channels are the official ones.

/** Page textures: load / upload with these options (Pixi ALPHA_MODES.PMA = 2: values kept as stored). */
export const PAGE_TEXTURE_OPTIONS = Object.freeze({ alphaMode: 2 });

export const MODE = Object.freeze({ SPLIT: 0, TEX_X_COLOR: 1, GRAPHIC: 2 });

const PLUGIN = 'dynSpine';
const VERTEX_SIZE = 9; // x, y, u, v, colour (4 bytes), dark r g b, texture id

const VERT = `precision highp float;
attribute vec2 aVertexPosition;
attribute vec2 aTextureCoord;
attribute vec4 aColor;
attribute vec3 aDark;
attribute float aTextureId;
uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform vec4 uColor;
varying vec2 vTextureCoord;
varying vec4 vColor;
varying vec3 vDark;
varying float vTextureId;
void main(void) {
  gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aVertexPosition, 1.0)).xy, 0.0, 1.0);
  vTextureCoord = aTextureCoord;
  vTextureId = aTextureId;
  vDark = aDark;
  vColor = aColor * uColor;
}
`;

const FRAG = `precision highp float;
varying vec2 vTextureCoord;
varying vec4 vColor;
varying vec3 vDark;
varying float vTextureId;
uniform sampler2D uSamplers[%count%];
uniform float uMode;
uniform float uBleed;
uniform float uTintBlack;
uniform float uUseGray;
uniform float uGrayScale;
uniform vec4 uColor;
uniform vec3 uBlack;
void main(void) {
  vec4 color;
  %forloop%
  if (uMode > 0.5 && uMode < 1.5) { gl_FragColor = color * vColor; return; }
  vec3 rgb = uBleed > 0.5 ? color.rgb * color.a : color.rgb;
  if (uMode > 1.5) { vec4 g = vec4(rgb, color.a) * vColor; g.rgb *= g.a; gl_FragColor = g; return; }
  if (uTintBlack > 0.5) {
    gl_FragColor = vec4((vDark + uBlack) * (color.a - rgb) * uColor.a + rgb * vColor.rgb, color.a * vColor.a);
    return;
  }
  vec4 c = vec4(rgb, color.a) * vColor;
  if (uUseGray > 0.0) c.rgb = mix(c.rgb, vec3(dot(c.rgb, vec3(0.299, 0.587, 0.114))), uGrayScale);
  gl_FragColor = c;
}
`;

export const SPINE_VERTEX_SOURCE = VERT;
export const SPINE_FRAGMENT_TEMPLATE = FRAG;

/** Uniforms the Spine shaders read (besides Pixi's projectionMatrix / translationMatrix in the vertex stage). */
export const SPINE_UNIFORMS = Object.freeze(['uSamplers', 'uMode', 'uBleed', 'uTintBlack', 'uUseGray', 'uGrayScale', 'uColor', 'uBlack']);

/**
 * The fragment shader with `textures` samplers, the texture picked by vTextureId as Pixi's BatchShaderGenerator does
 * (one texture: uSamplers[0] always).
 */
export function spineFragmentSource(textures = 1) {
  const n = Math.max(1, textures | 0);
  let loop = '';
  for (let i = 0; i < n; i++) {
    if (i > 0) loop += '\n  else ';
    if (i < n - 1) loop += `if (vTextureId < ${i}.5)`;
    loop += `\n  { color = texture2D(uSamplers[${i}], vTextureCoord); }`;
  }
  return FRAG.replace(/%count%/g, String(n)).replace(/%forloop%/g, loop);
}

/** The uniform values of a compiled material (compileLook's base / multiply / … or slotRoute(...).mat). */
export function materialUniforms(m) {
  return { uMode: m.mode, uBleed: m.bleed, uTintBlack: m.tintBlack, uUseGray: m.useGray, uGrayScale: m.grayScale, uColor: new Float32Array(m.color), uBlack: new Float32Array(m.black) };
}

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const vec = (v, d) => (Array.isArray(v) ? d.map((x, i) => num(v[i], x)) : d.slice());
const warned = new Set();
function warnOnce(msg) { if (!warned.has(msg)) { warned.add(msg); console.warn('[dynillust] ' + msg); } }

/** Batch uniforms of one official Spine material (see the header). Unknown shaders draw as the L2D AlphaSplit one. */
export function compileMaterial(m) {
  const shader = String(m?.shader || '');
  const kw = new Set(Array.isArray(m?.keywords) ? m.keywords : []);
  const c = vec(m?.color, [1, 1, 1, 1]);
  const out = { shader, mode: MODE.SPLIT, blend: 'normal', bleed: 0, tintBlack: 0, useGray: 0, grayScale: 0, color: c, black: vec(m?.black, [0, 0, 0, 0]).slice(0, 3) };
  if (/Skeleton PMA Multiply$/.test(shader)) {
    out.mode = MODE.TEX_X_COLOR; out.blend = 'multiply'; out.color = [c[0] * c[3], c[1] * c[3], c[2] * c[3], c[3]];
  } else if (shader === 'Spine/Skeleton') {
    out.mode = MODE.TEX_X_COLOR; out.color = [1, 1, 1, 1];
  } else if (/SkeletonGraphic-AlphaSplit-ClipRect$/.test(shader)) {
    out.mode = MODE.GRAPHIC;
  } else {
    if (!/Skeleton-AlphaSplit( \(Tint Black\))?$/.test(shader)) warnOnce(`Spine shader not ported, drawn as Skeleton-AlphaSplit: ${shader || '(none)'}`);
    out.bleed = kw.has('_USEBLEED_ON') ? 1 : 0;
    out.tintBlack = /\(Tint Black\)$/.test(shader) ? 1 : 0;
    if (/\/L2D\/Skeleton-AlphaSplit$/.test(shader)) { out.useGray = num(m?.useGray, 0); out.grayScale = num(m?.grayScale, 0); }
  }
  return out;
}

/** A look's materials compiled (see the header for `look`). */
export function compileLook(look = {}) {
  const graphic = look.kind === 'graphic';
  const base = compileMaterial(look.material || {});
  return {
    graphic,
    pma: look.pmaVertexColors === undefined ? !graphic : !!look.pmaVertexColors,
    tintBlack: !!look.tintBlack,
    skeletonColor: vec(look.color, [1, 1, 1, 1]),
    base,
    multiply: look.multiply ? compileMaterial(look.multiply) : null,
    screen: look.screen ? compileMaterial(look.screen) : null,
    additive: look.additive ? compileMaterial(look.additive) : null,
  };
}

/** Spine blend mode names by Pixi BLEND_MODES value (pixi-spine maps the skeleton's modes onto these). */
const PIXI_BLEND = { NORMAL: 0, ADD: 1, MULTIPLY: 2, SCREEN: 3 };

/**
 * The material and Pixi blend mode a slot draws with.
 * @param {ReturnType<typeof compileLook>} cl
 * @param {number} spineBlend the slot's blend mode as pixi-spine gives it (Pixi BLEND_MODES)
 */
export function slotRoute(cl, spineBlend) {
  let mat = cl.base;
  if (spineBlend === PIXI_BLEND.MULTIPLY && cl.multiply) mat = cl.multiply;
  else if (spineBlend === PIXI_BLEND.SCREEN && cl.screen) mat = cl.screen;
  else if (spineBlend === PIXI_BLEND.ADD && cl.additive) mat = cl.additive;
  if (mat !== cl.base && !/Skeleton(-AlphaSplit| PMA Multiply|Graphic)/.test(mat.shader)) warnOnce(`blend-mode material shader not ported: ${mat.shader}`);
  return { mat, blend: mat.blend === 'multiply' ? PIXI_BLEND.MULTIPLY : PIXI_BLEND.NORMAL, additive: spineBlend === PIXI_BLEND.ADD };
}

/**
 * Vertex colour bytes as spine-unity writes them (MeshGenerator, Color32).
 * @returns {number} packed little-endian RGBA (r in the low byte), as Pixi's batch reads aColor
 */
export function vertexColor(r, g, b, a, pma, additive) {
  const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const aB = Math.floor(cl(a) * 255);
  let rB, gB, bB, oA = aB;
  if (pma) {
    rB = Math.floor(cl(r) * aB); gB = Math.floor(cl(g) * aB); bB = Math.floor(cl(b) * aB);
    if (additive) oA = 0;
  } else { rB = Math.floor(cl(r) * 255); gB = Math.floor(cl(g) * 255); bB = Math.floor(cl(b) * 255); }
  return ((oA << 24) | (bB << 16) | (gB << 8) | rB) >>> 0;
}

const installed = new WeakSet();

/** Register the 'dynSpine' batch plugin on this PIXI (idempotent). */
export function installDynSpine(PIXI) {
  if (installed.has(PIXI)) return;
  installed.add(PIXI);
  const { Geometry, Buffer, TYPES, BatchRenderer, ExtensionType, extensions } = PIXI;

  class DynSpineGeometry extends Geometry {
    constructor(_static = false) {
      super();
      this._buffer = new Buffer(null, _static, false);
      this._indexBuffer = new Buffer(null, _static, true);
      this.addAttribute('aVertexPosition', this._buffer, 2, false, TYPES.FLOAT)
        .addAttribute('aTextureCoord', this._buffer, 2, false, TYPES.FLOAT)
        .addAttribute('aColor', this._buffer, 4, true, TYPES.UNSIGNED_BYTE)
        .addAttribute('aDark', this._buffer, 3, false, TYPES.FLOAT)
        .addAttribute('aTextureId', this._buffer, 1, true, TYPES.FLOAT)
        .addIndex(this._indexBuffer);
    }
  }

  class DynSpineRenderer extends BatchRenderer {
    constructor(renderer) {
      super(renderer);
      this.setShaderGenerator({ vertex: VERT, fragment: FRAG });
      this.geometryClass = DynSpineGeometry;
      this.vertexSize = VERTEX_SIZE;
      this._mat = null;
    }

    // Pixi builds a uniform group's upload function from the keys present at its first bind: all of them now
    contextChange() {
      super.contextChange();
      Object.assign(this._shader.uniforms, {
        uMode: 0, uBleed: 0, uTintBlack: 0, uUseGray: 0, uGrayScale: 0,
        uColor: new Float32Array([1, 1, 1, 1]), uBlack: new Float32Array([0, 0, 0]),
      });
    }

    render(el) {
      const route = el._dynRoute();
      el._dynMat = route.mat;
      // one batch per material: its uniforms are set at the flush
      if (this._bufferSize > 0 && route.mat !== this._mat) this.flush();
      this._mat = route.mat;
      super.render(el);
    }

    flush() {
      if (this._vertexCount === 0) return;
      const m = this._mat, u = this._shader.uniforms;
      u.uMode = m.mode; u.uBleed = m.bleed; u.uTintBlack = m.tintBlack; u.uUseGray = m.useGray; u.uGrayScale = m.grayScale;
      u.uColor.set(m.color); u.uBlack.set(m.black);
      this.renderer.shader.bind(this._shader);
      super.flush();
    }

    packInterleavedGeometry(el, attributeBuffer, indexBuffer, aIndex, iIndex) {
      const { uint32View, float32View } = attributeBuffer;
      const packed = aIndex / this.vertexSize;
      const uvs = el.uvs, ind = el.indices, vd = el.vertexData;
      const tex = el._texture.baseTexture._batchLocation;
      const own = el._dynOwner, cl = own.cl, sc = cl.skeletonColor;
      const a = Math.min(el.worldAlpha, 1) * sc[3];
      const L = el._dynLight, D = el._dynDark;
      const route = el._dynRouteCache;
      const argb = vertexColor(L[0] * sc[0], L[1] * sc[1], L[2] * sc[2], a, cl.pma, route.additive);
      let dr = 0, dg = 0, db = 0;
      if (cl.tintBlack) { const k = cl.pma ? a : 1; dr = D[0] * k; dg = D[1] * k; db = D[2] * k; }
      for (let i = 0; i < vd.length; i += 2) {
        float32View[aIndex++] = vd[i];
        float32View[aIndex++] = vd[i + 1];
        float32View[aIndex++] = uvs[i];
        float32View[aIndex++] = uvs[i + 1];
        uint32View[aIndex++] = argb;
        float32View[aIndex++] = dr;
        float32View[aIndex++] = dg;
        float32View[aIndex++] = db;
        float32View[aIndex++] = tex;
      }
      for (let i = 0; i < ind.length; i++) indexBuffer[iIndex++] = packed + ind[i];
    }
  }
  DynSpineRenderer.extension = { name: PLUGIN, type: ExtensionType.RendererPlugin };
  extensions.add(DynSpineRenderer);
  pluginClass.set(PIXI, DynSpineRenderer);
}

const pluginClass = new WeakMap();

/** The renderer's 'dynSpine' plugin; a renderer created before installDynSpine gets one on first use. */
function ensurePlugin(PIXI, renderer) {
  let p = renderer.plugins[PLUGIN];
  if (!p) {
    const C = pluginClass.get(PIXI);
    p = renderer.plugins[PLUGIN] = new C(renderer);
    if (renderer.gl) p.contextChange();
  }
  return p;
}

/** The per-slot colour object pixi-spine fills (setLight / setDark), plus the routing of the slot's blend mode. */
function attachSlotState(obj, owner) {
  obj._dynOwner = owner;
  obj._dynLight = new Float32Array([1, 1, 1]);
  obj._dynDark = new Float32Array([0, 0, 0]);
  obj._slotBlend = PIXI_BLEND.NORMAL;
  obj._dynRouteCache = slotRoute(owner.cl, PIXI_BLEND.NORMAL);
  obj.color = {
    setLight: (r, g, b) => { obj._dynLight[0] = r; obj._dynLight[1] = g; obj._dynLight[2] = b; },
    setDark: (r, g, b) => { obj._dynDark[0] = r; obj._dynDark[1] = g; obj._dynDark[2] = b; },
  };
  obj._dynRoute = () => obj._dynRouteCache;
}

/** pixi-spine sets `blendMode` from the slot; the element reports the official material's blend instead. */
function routeBlendMode(proto) {
  Object.defineProperty(proto, 'blendMode', {
    configurable: true,
    get() { return this._dynRouteCache ? this._dynRouteCache.blend : PIXI_BLEND.NORMAL; },
    set(v) {
      this._slotBlend = v;
      if (this._dynOwner) this._dynRouteCache = slotRoute(this._dynOwner.cl, v);
    },
  });
}

let building = null; // the owner state while the Spine constructor creates its slot objects
const classes = new WeakMap();

const CLIPPING = 6; // pixi-spine AttachmentType.Clipping

/**
 * pixi-spine starts a clip at every slot that ever showed a clipping attachment (`slot.currentGraphics` set), also
 * after an animation replaced that attachment by a region or mesh; such a clip has no end slot, so it masks every
 * later slot with a stale polygon. Dusk 'Hazy Jade' (O5): Idle swaps Xi_R_EyeWhite2 (a clip ending at
 * Xi_R_EyeBall_Light) for the mesh Xi_R_EyeWhite, and the eyes, brows and everything drawn after them vanished.
 * The Spine runtime clips only while the clipping attachment is the slot's attachment (spine-core 3.8
 * SkeletonClipping clipStart / clipEnd at its end slot): the slot reports its clip graphics only then.
 */
function clipOnlyWhileShown(slot) {
  let g = slot.currentGraphics || null;
  Object.defineProperty(slot, 'currentGraphics', {
    configurable: true,
    get() { const a = this.getAttachment(); return a && a.type === CLIPPING ? g : null; },
    set(v) { g = v; },
  });
}

function withOwner(own, make) {
  const prev = building;
  if (own) building = own;
  try { return make(); } finally { building = prev; }
}

function classesFor(PIXI) {
  let c = classes.get(PIXI);
  if (c) return c;
  const { SpineMesh, SpineSprite, Spine } = PIXI.spine;
  const TRIANGLES = PIXI.DRAW_MODES.TRIANGLES;

  class DynMesh extends SpineMesh {
    constructor(...args) {
      super(...args);
      this.material.pluginName = PLUGIN;
      attachSlotState(this, building);
    }
    // every slot mesh goes through the batch, whatever its vertex count (Mesh batches only < 100 vertices)
    _render(renderer) {
      ensurePlugin(PIXI, renderer);
      if (this.autoUpdate) this.geometry.getBuffer('aVertexPosition').update();
      if (this.drawMode === TRIANGLES) this._renderToBatch(renderer);
      else this._renderDefault(renderer);
    }
  }
  routeBlendMode(DynMesh.prototype);

  class DynSprite extends SpineSprite {
    constructor(...args) {
      super(...args);
      this.pluginName = PLUGIN;
      attachSlotState(this, building);
    }
    _render(renderer) {
      ensurePlugin(PIXI, renderer);
      super._render(renderer);
    }
  }
  routeBlendMode(DynSprite.prototype);

  class DynSpine extends Spine {
    constructor(skeletonData, owner) {
      building = owner;
      try { super(skeletonData); } finally { building = null; }
      this._dynOwner = owner;
      // pixi-spine's two-colour path: light = slot × attachment colour, dark = the slot's dark colour
      this.color = { light: new Float32Array([1, 1, 1]), dark: new Float32Array([0, 0, 0]) };
      for (const sl of this.skeleton.slots) clipOnlyWhileShown(sl);
    }
    // during the constructor `building` is this skeleton's owner; later (an attachment first shown by an animation)
    // the instance's own
    newMesh(texture, vertices, uvs, indices, drawMode) {
      return withOwner(this._dynOwner, () => new DynMesh(texture, vertices, uvs, indices, drawMode));
    }
    newSprite(texture) {
      return withOwner(this._dynOwner, () => new DynSprite(texture));
    }
  }
  c = { DynMesh, DynSprite, DynSpine };
  classes.set(PIXI, c);
  return c;
}

/**
 * A Spine skeleton drawn with the official materials of `look`.
 * @param {any} PIXI the PIXI namespace with pixi-spine (PIXI.spine) loaded
 * @param {any} skeletonData pixi-spine skeleton data
 * @param {object} look see the header
 */
export function createDynSpine(PIXI, skeletonData, look) {
  installDynSpine(PIXI);
  const { DynSpine } = classesFor(PIXI);
  return new DynSpine(skeletonData, { cl: compileLook(look) });
}
