// render/vfx/glsl-l2d.js — the shader families the dynamic illustrations' (动态立绘) Unity effects add to the official
// effect player (render/vfx/glsl.js conventions: uniform `u<Unity property>`, gamma-space colours, straight colour +
// alpha out for the material's blend state). Each family follows the official program of its shader, read from the CN
// client's `[uc]shaders.ab` (Unity 2021.3, D3D11 programs disassembled with d3dcompiler_47, read 2026-11-22); official
// shader source never enters the repository.
//
//   L2D_FAMILIES         family → { tex, src(defs) } like glsl.js FAMILIES
//   l2dVertexExtra(defs) the vertex-shader additions a family variant needs ({ decl, body } or null)
//
// Vertex additions (render/vfx/glsl.js vertexSource(kind, defs) inserts them after the kind's own body; `v_wpos` /
// `v_nrm` are the world position and normal, gl_Position the clip position):
//   vx 'grab'    v_g2 = clip position of the displaced point of Disturb GrabPass _DirMode 1 / 2
//   vx 'hull'    Unlit-Outline's outline pass: the clip position pushed out along the clip-space normal
//   vx 'tangent' Poker-Reflect: the world tangent, bitangent and the second UV set (mesh attributes 13 and 14)
//   vx 'vdisturb' Ram/VertexDisturb(CustomData): a mesh's vertices moved in object space by _VertexDisturbTex

const S = (names) => names.map((n) => `uniform sampler2D u${n};`).join('\n');
const U4 = (names) => names.map((n) => `uniform vec4 u${n};`).join('\n');
const U1 = (names) => names.map((n) => `uniform float u${n};`).join('\n');

/** Vertex-shader additions by variant (see the header). `kind` is the geometry kind (quad / mesh / strip). */
export function l2dVertexExtra(defs = {}, kind = 'quad') {
  if (defs.vx === 'grab') {
    // Disturb GrabPass(Once) vertex program: _DirMode 1 → the vertex + _DisturbDir, _DirMode 2 → the vertex +
    // normalize(vertex − (_DisturbCenter + _ParticleSystemPositionWS)), both through the camera. Object space is taken
    // as world space (the illustrations' GrabPass renderers are particle systems simulating in world space).
    return {
      decl: 'uniform float u_DirMode;\nuniform vec4 u_DisturbDir;\nuniform vec4 u_DisturbCenter;\nuniform vec4 u_ParticleSystemPositionWS;\nout vec4 v_g2;\n',
      body: `  {
    vec3 g2 = v_wpos;
    if (u_DirMode > 0.5 && u_DirMode < 1.5) g2 = v_wpos + u_DisturbDir.xyz;
    else if (u_DirMode > 1.5 && u_DirMode < 2.5) g2 = v_wpos + normalize(v_wpos - (u_DisturbCenter.xyz + u_ParticleSystemPositionWS.xyz));
    v_g2 = u_vp * vec4(g2, 1.0);
  }\n`,
    };
  }
  if (defs.vx === 'hull') {
    // Unlit-Outline pass 2: n = normalize(P·V·(object→world)·normal).xy, n.y ×= screen width / height,
    // clip.xy += n · clip.w · _Outline_Width · saturate(1 / clip.w) · 0.0003; clip.z moved back by
    // _Outline_Depth_Offset · 0.0001 (subtracted in the client's reversed D3D depth, added in GL's)
    return {
      decl: 'uniform float u_Outline_Width;\nuniform float u_Outline_Depth_Offset;\nuniform vec4 u_ScreenParams;\n',
      body: `  {
    vec4 c = gl_Position;
    vec2 n = normalize((u_vp * vec4(v_nrm, 0.0)).xyz).xy * c.w;
    n.y *= u_ScreenParams.x / max(u_ScreenParams.y, 1.0);
    n *= u_Outline_Width * clamp(1.0 / c.w, 0.0, 1.0);
    c.xy += n * 0.0003;
    c.z += u_Outline_Depth_Offset * 0.0001;
    gl_Position = c;
  }\n`,
    };
  }
  if (defs.vx === 'vdisturb') {
    // Ram/VertexDisturb(CustomData) vertex program: d = _VertexDisturbTex(uv × ST + frac(speed × _Time.y)).xyz − 0.5,
    // w = _VertexDisturbWeightTex(uv × ST).r (both at mip 0); object-space offset d · w · _VertexDisturbIntensity.xyz,
    // plus normalize(normal) · d.x · w · _NormalDisturbIntensity when _NormalDisturb > 0; then object → world → clip.
    // Only a mesh carries its object frame here; a particle using this shader draws undisplaced.
    if (kind !== 'mesh') return null;
    return {
      decl: `${S(['_VertexDisturbTex', '_VertexDisturbWeightTex'])}
${U4(['_VertexDisturbTex_ST', '_VertexDisturbWeightTex_ST', '_VertexDisturbIntensity', '_Time'])}
${U1(['_VertexDisturbUSpeed', '_VertexDisturbVSpeed', '_NormalDisturb', '_NormalDisturbIntensity'])}
`,
      body: `  {
    vec2 vuv = a_uv * u_VertexDisturbTex_ST.xy + u_VertexDisturbTex_ST.zw + fract(vec2(u_VertexDisturbUSpeed, u_VertexDisturbVSpeed) * u_Time.y);
    vec3 d = textureLod(u_VertexDisturbTex, vuv, 0.0).xyz - 0.5;
    float w = textureLod(u_VertexDisturbWeightTex, a_uv * u_VertexDisturbWeightTex_ST.xy + u_VertexDisturbWeightTex_ST.zw, 0.0).x;
    vec3 o = d * w * u_VertexDisturbIntensity.xyz;
    float ln = length(a_nrm);
    if (u_NormalDisturb > 0.0 && ln > 1e-8) o += (a_nrm / ln) * d.x * w * u_NormalDisturbIntensity;
    vec3 q = a_pos + o;
    vec3 pw = a_center + a_m0 * q.x + a_m1 * q.y + a_m2 * q.z;
    v_wpos = pw;
    gl_Position = u_vp * vec4(pw, 1.0);
  }\n`,
    };
  }
  if (defs.vx === 'tangent') {
    // Poker-Reflect vertex program: t = normalize(object→world · tangent.xyz), b = cross(n, t) · tangent.w (×
    // unity_WorldTransformParams.w: 1 without a negative scale), uv1 = TEXCOORD1
    const toWorld = kind === 'mesh' ? 'mat3(a_m0, a_m1, a_m2) * a_tan.xyz' : 'a_tan.xyz';
    return {
      decl: 'layout(location=13) in vec4 a_tan;\nlayout(location=14) in vec2 a_uv1;\nout vec3 v_tan;\nout vec3 v_bit;\nout vec2 v_uv1;\n',
      body: `  {
    vec3 t = ${toWorld};
    float lt = length(t);
    v_tan = lt > 1e-8 ? t / lt : vec3(0.0);
    v_bit = cross(v_nrm, v_tan) * a_tan.w;
    v_uv1 = a_uv1;
  }\n`,
    };
  }
  return null;
}

export const L2D_FAMILIES = {
  // Dissolve AB / Add Double edge (Torappu/ and Hidden/Particles-L2D/): the Double dissolve, then an edge colour
  // blended in by pow(1 − smoothstep(0, _Edgecolor.a, m1·m2), _pow); the AB program pads that ratio by 0.001 and
  // floors the blend at 0.001, the Add program does neither
  dissolveDoubleEdge: {
    tex: ['_MainTex', '_DissolveTex_01', '_DissolveTex_02'],
    src: (d) => `${S(['_MainTex', '_DissolveTex_01', '_DissolveTex_02'])}
${U4(['_MainTex_ST', '_DissolveTex_01_ST', '_DissolveTex_02_ST', '_TintColor', '_Edgecolor'])}
${U1(['_Amount_01', '_BorderWidth_01', '_Amount_02', '_BorderWidth_02', '_pow'])}
void main() {
  float m1 = dissolveMask(texture(u_DissolveTex_01, st(v_uv, u_DissolveTex_01_ST)).r, u_Amount_01, u_BorderWidth_01);
  float m2 = dissolveMask(texture(u_DissolveTex_02, st(v_uv, u_DissolveTex_02_ST)).r, u_Amount_02, u_BorderWidth_02);
  float e = m1 * m2;
  ${d.edgeAdd
    ? 'float k = clamp(e / u_Edgecolor.a, 0.0, 1.0);\n  float s = pow(1.0 - k * k * (3.0 - 2.0 * k), u_pow);'
    : 'float k = clamp((e + 0.001) / (u_Edgecolor.a + 0.001), 0.0, 1.0);\n  float s = max(pow(1.0 - k * k * (3.0 - 2.0 * k), u_pow), 0.001);'}
  vec4 c = 2.0 * v_col * u_TintColor * texture(u_MainTex, st(v_uv, u_MainTex_ST));
  vec3 rgb = mix(c.rgb, u_Edgecolor.rgb, s);
  float a = c.a + s * (u_Edgecolor.a * c.a - c.a);
  o_col = vec4(rgb, clamp(e * a, 0.0, 1.0));
}`,
  },
  // Disturb GrabPass / GrabPassOnce: the frame drawn so far (u_GrabTexture) read at this pixel moved by a scrolled noise
  // texture's red × _Intensity × an optional mask × vertex colour red, in one of four directions (_DirMode: 1 an
  // object-space vector, 2 away from a centre, 3 a UV-space vector × −0.1, 4 from a UV centre × ±0.1). Blend One Zero:
  // the moved pixels replace the frame. _CUSTOMDATA_ON: Custom1.xy (TEXCOORD1) offsets the noise, Custom1.zw scales the
  // move, Custom2.xy (TEXCOORD2) offsets the mask, Custom2.z scales _MaskIntensity.
  // u_GrabParams = (viewport x, viewport y, the sign that turns a UV-space offset into this target's: −1 when clip +y
  // is screen-up, as the client's grab UVs run downward), u_GrabSize = (1 / viewport width, 1 / viewport height).
  disturbGrab: {
    tex: ['_MaskTex', '_DisturTex'],
    src: (d) => `${S(['_MaskTex', '_DisturTex', '_GrabTexture'])}
${U4(['_MaskTex_ST', '_DisturTex_ST', '_DisturbDirUV', '_DisturbCenterUV', '_MaskSpeed', '_NoiseSpeed', '_GrabParams', '_GrabSize'])}
${U1(['_Intensity', '_Mask', '_ShowMask', '_ShowNoise', '_PolarCoord', '_PolarRadius', '_MaskIntensity', '_DirMode', '_DisturbInvert'])}
in vec4 v_g2;
void main() {
  float m = 1.0;
  if (u_Mask > 0.0) {
    vec4 mk;
    if (u_PolarCoord > 0.0) {
      float u = length(v_uv - 0.5) * 2.0 * u_PolarRadius - u_MaskSpeed.x * u_Time.y;
      mk = texture(u_MaskTex, vec2(u) + u_MaskTex_ST.zw${d.cvs ? ' + v_t2.xx' : ''});
    } else {
      mk = texture(u_MaskTex, v_uv * u_MaskTex_ST.xy - u_MaskSpeed.xy * u_Time.y + u_MaskTex_ST.zw${d.cvs ? ' + v_t2.xy' : ''});
    }
    m = 1.0 + clamp(${d.cvs ? 'v_t2.z * ' : ''}u_MaskIntensity, 0.0, 1.0) * (mk.r - 1.0);
    if (u_ShowMask > 0.0) { o_col = vec4(vec3(m), 1.0); return; }
  }
  vec4 n = texture(u_DisturTex, v_uv * u_DisturTex_ST.xy + u_DisturTex_ST.zw + fract(u_NoiseSpeed.xy * u_Time.x)${d.cvs ? ' + v_t1.xy' : ''});
  if (u_ShowNoise > 0.0) { o_col = m * n; return; }
  vec2 suv = (gl_FragCoord.xy - u_GrabParams.xy) * u_GrabSize.xy;
  vec2 dir = vec2(1.0);
  if (u_DirMode > 0.5 && u_DirMode < 2.5) dir = (v_g2.xy / v_g2.w * 0.5 + 0.5) - suv;
  else if (u_DirMode > 2.5 && u_DirMode < 3.5) dir = u_DisturbDirUV.xy * -0.1 * vec2(1.0, u_GrabParams.z);
  else if (u_DirMode > 3.5 && u_DirMode < 4.5) dir = normalize(v_uv - u_DisturbCenterUV.xy) * (u_DisturbInvert * 2.0 - 1.0) * 0.1 * vec2(1.0, u_GrabParams.z);
  vec2 off = dir * u_Intensity * n.r * m * v_col.r${d.cvs ? ' * v_t1.zw' : ''};
  o_col = texture(u_GrabTexture, suv + off);
}`,
  },
  // Torappu/Particles-L2D/Disturb/Disturb2 (AlphaBlend / Add): the main texture (UV × _MainTex_ST) moved by two
  // noise reads of _DisturTex — red at UV × _Noise1Param.x + (frac(_Noise1Param.y × _Time.x), 0), green at the same
  // with _Noise2Param — × their .zw × 0.1. _DISTURBMODE_DEFAULT: AlphaBlend = texture × _MainColor, alpha × vertex
  // alpha; Add = the same with the colour × texture alpha. _DISTURBMODE_GLOW: texture red × _MainColor + green ×
  // _GlowColor. Saturated. The vertex colour's rgb is not read.
  disturb2: {
    tex: ['_MainTex', '_DisturTex'],
    src: (d) => `${S(['_MainTex', '_DisturTex'])}
${U4(['_MainTex_ST', '_MainColor', '_GlowColor', '_Noise1Param', '_Noise2Param'])}
void main() {
  vec2 uv = st(v_uv, u_MainTex_ST);
  vec2 n1 = uv * u_Noise1Param.x + vec2(fract(u_Noise1Param.y * u_Time.x), 0.0);
  vec2 n2 = uv * u_Noise2Param.x + vec2(fract(u_Noise2Param.y * u_Time.x), 0.0);
  vec2 off = texture(u_DisturTex, n2).g * u_Noise2Param.zw * 0.1 + texture(u_DisturTex, n1).r * u_Noise1Param.zw * 0.1;
  vec4 t = texture(u_MainTex, uv + off);
  ${d.glow
    ? 'o_col = clamp(t.r * u_MainColor + t.g * u_GlowColor, 0.0, 1.0);'
    : d.add
      ? 'vec4 c = t * u_MainColor;\n  o_col = clamp(vec4(c.rgb * t.a, c.a * v_col.a), 0.0, 1.0);'
      : 'vec4 c = t * u_MainColor;\n  o_col = clamp(vec4(c.rgb, c.a * v_col.a), 0.0, 1.0);'}
}`,
  },
  // Torappu/Particles-L2D/Special/Particle-Blur: the frame copy (GrabPass "_DisturbGrabTexture", shared with
  // GrabPassOnce) averaged over 8 taps at these offsets × _BlurSize pixels (× Custom1.x, TEXCOORD0.z, with
  // _CUSTOMDATA_ON); alpha 1, blend One Zero
  particleBlur: {
    tex: [],
    src: (d) => `${S(['_GrabTexture'])}
${U4(['_GrabParams', '_GrabSize'])}
${U1(['_BlurSize'])}
const vec2 K[8] = vec2[8](vec2(0.25, 0.0), vec2(-0.319290, 0.292496), vec2(0.048872, -0.556877), vec2(0.402445, 0.524917),
  vec2(-0.738535, -0.130636), vec2(0.699605, -0.445032), vec2(-0.234003, 0.870484), vec2(-0.446272, -0.859268));
void main() {
  vec2 suv = (gl_FragCoord.xy - u_GrabParams.xy) * u_GrabSize.xy;
  vec2 px = ${d.cvs ? 'v_t0.x * ' : ''}u_BlurSize * u_GrabSize.xy * vec2(1.0, u_GrabParams.z);
  vec3 c = vec3(0.0);
  for (int i = 0; i < 8; i++) c += texture(u_GrabTexture, suv + px * K[i]).rgb;
  o_col = vec4(c * 0.125, 1.0);
}`,
  },
  // Torappu/Particles/RGBsplit: the main texture read three times, R / G / B each moved along its _Offset{R,G,B}.xy ×
  // .z × 0.1 by (noise^_SplitRandom × _SplitIntensity + _SplitBase), noise = the product of four sines of
  // _Time.y × (15, 16, 19, 27) × _SplitFrequency; alpha = Σ channel alpha × _Offset.w; × 2 × colour × _TintColor.
  // _UseCustomData: Custom1 (TEXCOORD1) scales the three .z and _SplitBase, Custom2.x (TEXCOORD2.x) the exponent
  rgbSplit: {
    tex: ['_MainTex', '_MaskTex'],
    src: () => `${S(['_MainTex', '_MaskTex'])}
${U4(['_MainTex_ST', '_TintColor', '_OffsetR', '_OffsetG', '_OffsetB'])}
${U1(['_SplitIntensity', '_SplitFrequency', '_SplitBase', '_SplitRandom', '_UseMask', '_UseCustomData'])}
void main() {
  bool cd = u_UseCustomData > 0.0;
  vec4 c1 = cd ? v_t1 : vec4(1.0);
  float oR = c1.x * u_OffsetR.z, oG = c1.y * u_OffsetG.z, oB = c1.z * u_OffsetB.z, base = c1.w * u_SplitBase;
  float rnd = cd ? u_SplitRandom * v_t2.x + 0.000001 : u_SplitRandom;
  vec4 s = sin(u_Time.y * vec4(15.0, 16.0, 19.0, 27.0) * u_SplitFrequency);
  float n = pow((s.x + 1.0) * 0.5 * (s.y * 0.5 + 1.0) * (s.z * 0.5 + 1.0) * (s.w * 0.5 + 1.0), rnd);
  float amt = n * u_SplitIntensity + base;
  vec2 uv = st(v_uv, u_MainTex_ST);
  float m = 1.0;
  if (u_UseMask > 0.0) m = texture(u_MaskTex, clamp(oR * u_OffsetR.xy * 0.1 * amt + uv, 0.0, 1.0)).r;
  vec4 R = texture(u_MainTex, clamp(oR * u_OffsetR.xy * 0.1 * amt * m + uv, 0.0, 1.0));
  vec4 G = texture(u_MainTex, clamp(oG * u_OffsetG.xy * 0.1 * amt * m + uv, 0.0, 1.0));
  vec4 B = texture(u_MainTex, clamp(oB * u_OffsetB.xy * 0.1 * amt * m + uv, 0.0, 1.0));
  vec4 c = vec4(R.a * R.r, G.a * G.g, B.a * B.b, clamp(G.a * u_OffsetG.w + R.a * u_OffsetR.w + B.a * u_OffsetB.w, 0.0, 1.0));
  c *= 2.0 * v_col * u_TintColor;
  o_col = vec4(c.rgb, clamp(c.a, 0.0, 1.0));
}`,
  },
  // Torappu/Particles-L2D/Unlit-Outline pass 1: 2 × colour × _TintColor × texture, alpha saturated × _Alpha
  unlitOutline: {
    tex: ['_MainTex'],
    src: () => `${S(['_MainTex'])}
${U4(['_MainTex_ST', '_TintColor'])}
${U1(['_Alpha'])}
void main() {
  vec4 c = texture(u_MainTex, st(v_uv, u_MainTex_ST)) * 2.0 * v_col * u_TintColor;
  o_col = vec4(c.rgb, clamp(c.a, 0.0, 1.0) * u_Alpha);
}`,
  },
  // … pass 2 (cull Front, the hull pushed out by vertex extra 'hull'): _Outline_Color, alpha = colour alpha × _Alpha
  unlitOutlineHull: {
    tex: [],
    src: () => `${U4(['_Outline_Color'])}
${U1(['_Alpha'])}
void main() { o_col = vec4(u_Outline_Color.rgb, v_col.a * u_Alpha); }`,
  },
  // Torappu/Particles-L2D/Mask/Erase: black, alpha (1 − texture red) × _Strength
  maskErase: {
    tex: ['_MainTex'],
    src: () => `${S(['_MainTex'])}
${U4(['_MainTex_ST'])}
${U1(['_Strength'])}
void main() { o_col = vec4(0.0, 0.0, 0.0, (1.0 - texture(u_MainTex, st(v_uv, u_MainTex_ST)).r) * u_Strength); }`,
  },
  // Torappu/Particles-L2D/3D/Toon (_SUNMODE_CUSTOM): Blinn-Phong in world space with the view-space _SunDir turned into
  // world space (u_InvViewRot), _LightColor; diffuse × _SunDir.w × _Diffuse, saturated specular × _Specular, ambient ×
  // albedo, + emission × _EmissionColor; alpha = albedo alpha
  toon: {
    tex: ['_MainTex', '_EmissionMap'],
    src: () => `${S(['_MainTex', '_EmissionMap'])}
${U4(['_MainTex_ST', '_SpecColor', '_Color', '_EmissionColor', '_SunDir', '_LightColor'])}
${U1(['_Ambient', '_Diffuse', '_Specular', '_Shininess'])}
uniform mat3 u_InvViewRot;
void main() {
  vec3 N = normalize(v_nrm);
  vec3 L = normalize(u_InvViewRot * normalize(u_SunDir.xyz));
  vec3 I = normalize(v_wpos - u_WorldSpaceCameraPos);
  vec3 H = normalize(L - I);
  vec3 spec = clamp(pow(clamp(dot(H, N), 0.0, 1.0), u_Shininess) * u_SpecColor.rgb * u_LightColor.rgb * u_Specular, 0.0, 1.0);
  float diff = clamp(dot(N, L), 0.0, 1.0);
  vec2 uv = st(v_uv, u_MainTex_ST);
  vec4 alb = texture(u_MainTex, uv) * u_Color;
  vec3 rgb = diff * alb.rgb * u_LightColor.rgb * u_SunDir.w * u_Diffuse + spec + u_Ambient * alb.rgb;
  rgb += texture(u_EmissionMap, uv).rgb * u_EmissionColor.rgb;
  o_col = vec4(rgb, alb.a);
}`,
  },
  // Torappu/Particles-L2D/3D/MatCapTransparent: the view-space normal reads a matcap (xy × 0.5 + 0.5) blended over
  // texture × _Color by a smoothstepped fresnel (1 − n.z)^_FresnelPow over _CtrlParams.xy; a highlight map smoothstepped
  // over _CtrlParams.zw × _HighLightStrength × the dissolve mask lightens toward white; alpha × the dissolve mask
  matcap: {
    tex: ['_DissolveTex', '_MainTex', '_MatCapHighLight', '_MatCap'],
    src: () => `${S(['_DissolveTex', '_MainTex', '_MatCapHighLight', '_MatCap'])}
${U4(['_MainTex_ST', '_DissolveTex_ST', '_Color', '_CtrlParams'])}
${U1(['_FresnelPow', '_HighLightStrength', '_Amount', '_BorderWidth'])}
uniform mat3 u_ViewRot;
void main() {
  vec3 nv = normalize(u_ViewRot * normalize(v_nrm));
  vec2 muv = nv.xy * 0.5 + 0.5;
  float fr = pow(1.0 - clamp(nv.z, 0.0, 1.0), u_FresnelPow) - u_CtrlParams.x;
  float t = clamp(fr / (u_CtrlParams.y - u_CtrlParams.x), 0.0, 1.0);
  float f = t * t * (3.0 - 2.0 * t);
  float h = clamp((texture(u_MatCapHighLight, muv).r - u_CtrlParams.z) / (u_CtrlParams.w - u_CtrlParams.z), 0.0, 1.0);
  h = h * h * (3.0 - 2.0 * h) * u_HighLightStrength;
  vec4 c = mix(texture(u_MainTex, st(v_uv, u_MainTex_ST)) * u_Color, texture(u_MatCap, muv), f);
  float dm = dissolveMask(texture(u_DissolveTex, st(v_uv, u_DissolveTex_ST)).r, u_Amount, u_BorderWidth);
  c += h * dm * (1.0 - c);
  o_col = vec4(c.rgb, dm * c.a);
}`,
  },
  // Torappu/Particles-L2D/Particles-Poker-Reflect: card art (_PokerTex × 2 × _PokerColor) or the number (_NumberTex on
  // UV1) by _NumberMask, lit by (−_LightDir · n) × 0.5 + _DiffuseIntensity + 0.5, plus the cubemap reflection of the
  // normal-mapped normal × colour; alpha = colour alpha. Normal map: (a·r, g) × 2 − 1, z = √(1 − min(xy·xy, 1))
  poker: {
    tex: ['_NormalMap', '_PokerTex', '_NumberTex', '_NumberMask', '_CubeMap'],
    src: () => `${S(['_NormalMap', '_PokerTex', '_NumberTex', '_NumberMask'])}
uniform samplerCube u_CubeMap;
${U4(['_PokerTex_ST', '_NumberTex_ST', '_NumberMask_ST', '_NormalMap_ST', '_PokerColor', '_LightDir'])}
${U1(['_DiffuseIntensity'])}
in vec3 v_tan; in vec3 v_bit; in vec2 v_uv1;
void main() {
  vec4 nm = texture(u_NormalMap, st(v_uv, u_NormalMap_ST));
  vec2 xy = vec2(nm.a * nm.r, nm.g) * 2.0 - 1.0;
  float z = sqrt(1.0 - min(dot(xy, xy), 1.0));
  vec3 Nw = normalize(v_nrm);
  vec3 N = normalize(xy.x * v_tan + xy.y * v_bit + z * Nw);
  float diff = dot(-u_LightDir.xyz, Nw) * 0.5 + u_DiffuseIntensity + 0.5;
  vec3 I = normalize(v_wpos - u_WorldSpaceCameraPos);
  vec3 env = texture(u_CubeMap, I - 2.0 * dot(I, N) * N).rgb * v_col.rgb;
  float mask = texture(u_NumberMask, st(v_uv, u_NumberMask_ST)).r;
  vec3 num = texture(u_NumberTex, st(v_uv1, u_NumberTex_ST)).rgb;
  vec3 pk = texture(u_PokerTex, st(v_uv, u_PokerTex_ST)).rgb * 2.0 * u_PokerColor.rgb;
  o_col = vec4(mix(pk, num, mask) * diff + env, v_col.a);
}`,
  },
  // Torappu/UI/AlphaBlend: 2 × texture × colour × _TintColor, alpha saturated; discards alpha < 0.001 (blend SrcAlpha /
  // _DstBlend from the material)
  uiAlphaBlend: {
    tex: ['_MainTex'],
    src: () => `${S(['_MainTex'])}
${U4(['_TintColor'])}
void main() {
  vec4 c = texture(u_MainTex, v_uv) * v_col * u_TintColor;
  if (c.a - 0.001 < 0.0) discard;
  o_col = vec4(c.rgb * 2.0, clamp(c.a, 0.0, 1.0));
}`,
  },
};
