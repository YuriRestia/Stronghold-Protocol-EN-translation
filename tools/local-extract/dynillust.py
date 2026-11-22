"""(fork) The official dynamic illustrations (动态立绘) of the operators in our pools, from a locally installed CN client
(DESIGN §33.19, docs/design/vfx-format.md: the format every file below follows).

Run through extract.py (needs the client and .venv-extract; a plain `extract.py` run leaves them out):
  .venv/bin/python tools/local-extract/extract.py --only dynillust [--dyn-keys k1,k2] [--dyn-max-mb 1024]

Read (paths relative to the AB root; a hot update under Arknights_Data/PersistentData/Bundles wins):
  arts/dynchars/<key>.ab          one prefab `dyn_illust_<key>`: the Spine skeleton (SkeletonAnimation + its
                                  SkeletonDataAsset, atlas, RGB + [alpha] pages) on the root, the DynIllust behaviour,
                                  the effect layer (particles, meshes, animators, backgrounds)
  arts/dynchars/effect.ab         the effects DynIllustEffectHolder loads by path
  refs/fx/**, [uc]shaders.ab, anon/*.bin, shaders/*.ab   shared textures, shaders (names and render states), scripts
and from the repository: data/chess.json (charId of every record) and data/backups.json (`units`): the illustrations
whose operator is in one of the two pools.

Written under <out>/dynillust/<dir>/ (<dir> = fx.fx_file(key)), every file capped (DYN_MAX_MB in all, PAGE_MAX_MB a page,
DYN_MAX_S for the run); over a cap the illustration's folder is deleted and the run stops with an error:
  illust.json            the index (§33.19): spine, framing, actions, files with their content hashes, sizes
  <stem>.skel | .json    the skeleton TextAsset as stored (binary 3.8, or Spine JSON)
  <stem>.atlas           atlas text, `size:` per page, no `pma`
  p/<page>.webp, p/half/<page>.webp    the pages with the [alpha] texture merged (straight alpha), WebP lossy q90
  fx.json                the whole prefab as one §33.4 descriptor (holder effects spliced under their holders)
  tex/**, mesh/**        its textures (§33.8) and meshes (§33.9)
and one group `dynillust` in the manifest (data/local-assets.json): key → illust.json, charId, skinId, bytes.
Everything is (c) Hypergryph; for private, non-commercial fan use only. Nothing of it is ever committed.
"""
import hashlib
import io
import json
import re
import shutil
import time
from pathlib import Path

import fx

DYN_SUB = 'dynillust'
DYN_VERSION = 1             # illust.json `version` (§33.19)
DYN_DIRS = ('arts/dynchars',)
DYN_EFFECTS = 'arts/dynchars/effect.ab'
DYN_MAX_MB = 1024           # the whole run (crew storage rule: over 1 GB needs the user's OK)
PAGE_MAX_MB = 64            # one encoded page (a 4096² RGBA page is 64 MB raw)
DYN_MAX_S = 3600            # the whole run
ENV_BATCH = 8               # illustrations per UnityPy environment (shared bundles decompressed once a batch)
# Spine pages: lossy WebP quality 90, alpha 100 — the maintainer's choice for the guide pages and the profile icons after
# side-by-side comparisons (extract.py GUIDE_WEBP_OPTIONS, DIRECT_WEBP)
# `exact`: the RGB under transparent texels is kept as stored (the shader multiplies or not by its keywords)
PAGE_WEBP = {'quality': 90, 'method': 4, 'alpha_quality': 100, 'exact': True}
PAGE_WEBP_LOSSLESS = {'lossless': True, 'quality': 100, 'method': 4, 'exact': True}   # premultiplied half pages
KEY_RE = re.compile(r'^(char_\d+_[a-z0-9]+)_(.+)$')
ACTIONS = {-1: 'NONE', 0: 'IDLE', 1: 'SPECIAL_IDLE', 2: 'START', 3: 'INTERACTION'}   # official dump.cs DynIllustAction
ADJUST = ('DEFAULT', 'SKIN', 'HOME_PAGE')                                         # official dump.cs DynIllustAdjustType
PARAM_TYPES = {1: 'float', 3: 'int', 4: 'bool', 9: 'trigger'}                     # Unity AnimatorControllerParameterType
COND_MODES = {1: 'if', 2: 'ifNot', 3: 'greater', 4: 'less', 6: 'equals', 7: 'notEqual'}   # Unity AnimatorConditionMode
NO_CLIP = 0xFFFFFFFF


class CapError(RuntimeError):
    """A size or time cap was hit: the run stops."""


def skin_id(key):
    """The official skinId of an illustration key: `<charId>_<n>` (E2 art) → `<charId>#<n>`, `<charId>_<outfit>#<n>`
    → `<charId>@<outfit>#<n>` (official skin_table.json: dynIllustId = 'dyn_illust_' + key)."""
    m = KEY_RE.match(key)
    if not m:
        return None
    cid, rest = m.groups()
    return f'{cid}#{rest}' if rest.isdigit() else f'{cid}@{rest}'


def official_key(key, prefab_name):
    """The key as the client spells it. Bundle files and container paths are lower case (`…_ambiencesynesthesia#4.ab`);
    the card prefab's GameObject keeps the official case of skin_table dynIllustId
    (`dyn_illust_char_172_svrash_ambienceSynesthesia#4`), which the skinId must match exactly. A name that is not this
    key's prefab leaves the key as it is."""
    name = prefab_name or ''
    if name.startswith('dyn_illust_') and name[len('dyn_illust_'):].lower() == key.lower():
        return name[len('dyn_illust_'):]
    return key


def outfit_ids(root):
    """The outfit ids of data/outfits.json (tools/build-outfits.mjs, from the official skin_table), or None without it."""
    p = Path(root) / 'data' / 'outfits.json'
    if not p.is_file():
        return None
    return set(json.loads(p.read_text(encoding='utf-8')).keys())


def skin_id_mismatches(skin_ids, outfits):
    """Outfit skinIds (`<charId>@<outfit>#<n>`) that are not exactly an id of data/outfits.json: the game never finds
    their illustration (one differing letter case is enough)."""
    return sorted(s for s in skin_ids if s and '@' in s and s not in outfits)


def pool_chars(root):
    """charIds of the main pool (data/chess.json records) and the self-select pool (data/backups.json units)."""
    data = Path(root) / 'data'
    chess = json.loads((data / 'chess.json').read_text(encoding='utf-8'))
    backups = json.loads((data / 'backups.json').read_text(encoding='utf-8'))
    return {r.get('charId') for r in chess.values() if r.get('charId')} | set((backups.get('units') or {}).keys())


def bundle_roots(ab_root):
    """[hot-update root, AB root]: Arknights_Data/PersistentData/Bundles first when it exists."""
    ab_root = Path(ab_root)
    roots = [p / 'PersistentData' / 'Bundles' for p in ab_root.parents if (p / 'PersistentData' / 'Bundles').is_dir()]
    return roots[:1] + [ab_root]


def find_bundles(roots, chars, keys=None):
    """key → bundle path of every arts/dynchars/<key>.ab whose operator is in `chars` (or the named `keys`); a hot
    update wins."""
    out = {}
    for r in roots:
        for d in DYN_DIRS:
            base = Path(r) / d
            if not base.is_dir():
                continue
            for p in sorted(base.glob('*.ab')):
                key = p.stem
                m = KEY_RE.match(key)
                if not m or key in out:
                    continue
                if (keys and key not in keys) or (not keys and m.group(1) not in chars):
                    continue
                out[key] = p
    return dict(sorted(out.items()))


def scan_all_cabs(roots):
    cabs = {}
    for r in roots:
        for name, path in fx.scan_cabs(r, dirs=fx.CAB_DIRS + DYN_DIRS).items():
            cabs.setdefault(name, path)
    return cabs


def spine_version(blob):
    """'3.8.99' from a skeleton: JSON `skeleton.spine`, else the binary header (hash string, then version string; Spine's
    varint-prefixed strings, length + 1)."""
    text = blob.lstrip(b'\xef\xbb\xbf \r\n\t')
    if text[:1] == b'{':
        try:
            return json.loads(text.decode('utf-8')).get('skeleton', {}).get('spine')
        except ValueError:
            return None
    pos = 0

    def varint():
        nonlocal pos
        v, shift = 0, 0
        while True:
            b = blob[pos]
            pos += 1
            v |= (b & 0x7F) << shift
            if not b & 0x80:
                return v
            shift += 7

    def string():
        nonlocal pos
        n = varint()
        if n <= 1:
            return None if n == 0 else ''
        s = blob[pos:pos + n - 1].decode('utf-8', 'replace')
        pos += n - 1
        return s
    try:
        string()
        return string()
    except IndexError:
        return None


class Writer:
    """Capped file writes under one illustration folder; records each file's size and the server's asset hash."""

    def __init__(self, base, budget):
        self.base, self.budget, self.files = Path(base), budget, {}

    def put(self, rel, data):
        if len(data) > PAGE_MAX_MB * 1024 * 1024:
            raise CapError(f'{rel}: {len(data)} bytes over the {PAGE_MAX_MB} MB file cap')
        self.budget.spend(len(data), rel)
        fx.write_atomic(self.base / rel, data)
        self.files[rel] = {'hash': hashlib.sha256(data).hexdigest()[:16], 'bytes': len(data)}

    def adopt(self, rel):
        """A file another writer (the effect exporter) wrote under base."""
        data = (self.base / rel).read_bytes()
        self.budget.spend(len(data), rel)
        self.files[rel] = {'hash': hashlib.sha256(data).hexdigest()[:16], 'bytes': len(data)}


class Budget:
    def __init__(self, max_bytes, deadline):
        self.max_bytes, self.deadline, self.used = max_bytes, deadline, 0

    def spend(self, n, what):
        self.used += n
        if self.used > self.max_bytes:
            raise CapError(f'size cap: {self.used} bytes > {self.max_bytes} at {what}')
        if time.time() > self.deadline:
            raise CapError(f'time cap reached at {what}')


class EncodedCache:
    """Texture key → (meta, full bytes, half bytes) across the illustrations of a run: the shared refs/fx textures are
    encoded once (bounded: CACHE_MAX_MB)."""
    CACHE_MAX_MB = 256

    def __init__(self):
        self.items, self.size = {}, 0

    def get(self, key):
        return self.items.get(key)

    def put(self, key, value):
        n = len(value[1]) + len(value[2] or b'')
        if self.size + n <= self.CACHE_MAX_MB * 1024 * 1024:
            self.items[key] = value
            self.size += n


class DynExporter(fx.Exporter):
    """The §33 exporter writing into one illustration folder; the Spine pages are not effect textures (they are
    written as p/*.webp) and are named `spine:<page>` where a material uses them. Textures are encoded as
    fx.Exporter._export_texture does (same keys, meta and encoding), through `cache`."""

    def __init__(self, env, out_dir, log, spine_tex, cache):
        super().__init__(env, out_dir, log=log)
        self.out = Path(out_dir)
        self.spine_tex = spine_tex          # (id(file), path id) → page name
        self.cache = cache

    def texture(self, f, o):
        page = self.spine_tex.get((id(f), o.path_id))
        return f'spine:{page}' if page else super().texture(f, o)

    def material(self, f, o):
        """fx.Exporter.material, plus the Cubemap textures it leaves out (`tex: null`): Particles-Poker-Reflect's
        `_CubeMap` (Lee's Trust Your Eyes) → a cube strip (§33.19)."""
        m = super().material(f, o)
        for name, te in self.env.tt(o).get('m_SavedProperties', {}).get('m_TexEnvs', []):
            ent = m['textures'].get(name)
            if ent is None or ent.get('tex') is not None:
                continue
            tf, to = self.env.resolve(o.assets_file, te.get('m_Texture'))
            if to is not None and tf != 'builtin' and to.type.name == 'Cubemap':
                key = self.cubemap(tf, to)
                if key:
                    ent['tex'] = key
                    ent.pop('default', None)
        return m

    def cubemap(self, f, o):
        """A Cubemap → one image of its 6 faces side by side in Unity's face order (+X −X +Y −Y +Z −Z), each face
        decoded as UnityPy decodes a Texture2D (rows top-down); meta `cube: true`, `w` / `h` one face's size."""
        k = (id(f), o.path_id)
        if k in self._tex_keys:
            return self._tex_keys[k]
        key = None
        try:
            from PIL import Image
            from UnityPy.export.Texture2DConverter import parse_image_data
            t = o.read()
            data = bytes(t.get_image_data())
            count = t.m_ImageCount or 6
            size = len(data) // count
            faces = [parse_image_data(data[i * size:(i + 1) * size], t.m_Width, t.m_Height, t.m_TextureFormat,
                                      getattr(t.object_reader, 'version', (0, 0, 0, 0)),
                                      getattr(t.object_reader, 'platform', 0), getattr(t, 'm_PlatformBlob', None))
                     for i in range(count)]
            has_alpha = any('A' in im.getbands() and im.getchannel('A').getextrema()[0] < 255 for im in faces)
            strip = Image.new('RGBA' if has_alpha else 'RGB', (t.m_Width * count, t.m_Height))
            for i, im in enumerate(faces):
                strip.paste(im.convert(strip.mode), (i * t.m_Width, 0))
            h = hashlib.sha1(f'cube:{strip.mode}:{strip.size}'.encode())
            h.update(strip.tobytes())
            key = f'{fx.FX_SAFE.sub("_", t.m_Name or "cube").strip("._") or "cube"}-{h.hexdigest()[:8]}'
            d = self.env.tt(o)
            buf = io.BytesIO()
            strip.save(buf, 'WEBP', quality=fx.WEBP_QUALITY, method=fx.WEBP_METHOD)
            meta = {'name': t.m_Name, 'w': t.m_Width, 'h': t.m_Height, 'cube': True,
                    'faces': ['+X', '-X', '+Y', '-Y', '+Z', '-Z'][:count],
                    'format': fx.TEXTURE_FORMATS.get(d.get('m_TextureFormat'), str(d.get('m_TextureFormat'))),
                    'mips': d.get('m_MipCount', 1), 'srgb': d.get('m_ColorSpace', 1) == 1, 'alpha': has_alpha,
                    'file': f'tex/{key}.webp', 'half': None, 'wrapU': 'clamp', 'wrapV': 'clamp',
                    'filter': ['point', 'bilinear', 'trilinear'][min(2, d.get('m_TextureSettings', {}).get('m_FilterMode', 1))],
                    'aniso': d.get('m_TextureSettings', {}).get('m_Aniso', 0)}
            fx.write_atomic(self.out / meta['file'], buf.getvalue())
            self.textures[key] = meta
        except Exception as e:
            self.log(f'  warn cubemap #{o.path_id}: {e!r}')
            key = None
        self._tex_keys[k] = key
        return key

    def _export_mesh(self, o):
        """fx.Exporter._export_mesh plus `tangents` (x, y, z, w per vertex; Poker-Reflect's normal map needs them).
        Kept here so the battle effects' mesh files stay as they are."""
        from UnityPy.helpers.MeshHelper import MeshHandler
        m = o.read()
        h = MeshHandler(m)
        h.process()
        flat = lambda rows, n: [fx.f6(x) for r in (rows or []) for x in list(r)[:n]]  # noqa: E731
        doc = {'format': 'fx-mesh', 'version': fx.MESH_VERSION, 'name': m.m_Name, 'vertexCount': h.m_VertexCount,
               'positions': flat(h.m_Vertices, 3)}
        if h.m_Normals:
            doc['normals'] = flat(h.m_Normals, 3)
        if getattr(h, 'm_Tangents', None):
            doc['tangents'] = flat(h.m_Tangents, 4)
        if h.m_UV0:
            doc['uv0'] = flat(h.m_UV0, 2)
        if h.m_UV1:
            doc['uv1'] = flat(h.m_UV1, 2)
        if h.m_Colors:
            doc['colors'] = [fx.f6(x) for x in fx.norm_channel(flat(h.m_Colors, 4), fx.color_format(m, h))]
        doc['submeshes'] = [[i for tri in sub for i in tri] for sub in h.get_triangles()]
        bone_i, bone_w = fx.skin_rows(h.m_BoneIndices, h.m_BoneWeights, h.m_VertexCount)
        if bone_i:
            doc['boneWeights'] = bone_w
            doc['boneIndices'] = bone_i
            doc['bindPoses'] = [[fx.f6(bp.get(f'e{r}{c}', 0)) for r in range(4) for c in range(4)]
                                for bp in (self.env.tt(o).get('m_BindPose') or [])]
        body = json.dumps(doc, separators=(',', ':'))
        key = f'{fx.FX_SAFE.sub("_", m.m_Name or "mesh").strip("._") or "mesh"}-{hashlib.sha1(body.encode()).hexdigest()[:8]}'
        if key not in self.meshes:
            fx.write_atomic(self.out / 'mesh' / f'{key}.json', body.encode('utf-8'))
            self.meshes[key] = {'name': m.m_Name, 'verts': h.m_VertexCount, 'file': f'mesh/{key}.json'}
        return key

    def _export_texture(self, o):
        from PIL import Image
        t = o.read()
        img = t.image
        if img is None:
            return None
        h = hashlib.sha1(f'{img.mode}:{img.size}'.encode())
        h.update(img.tobytes())
        key = f'{fx.FX_SAFE.sub("_", t.m_Name or "tex").strip("._") or "tex"}-{h.hexdigest()[:8]}'
        if key in self.textures:
            return key
        hit = self.cache.get(key)
        if hit is None:
            d = self.env.tt(o)
            has_alpha = 'A' in img.getbands() and img.getchannel('A').getextrema()[0] < 255
            img = img.convert('RGBA') if has_alpha else img.convert('RGB')
            meta = {'name': t.m_Name, 'w': t.m_Width, 'h': t.m_Height,
                    'format': fx.TEXTURE_FORMATS.get(d.get('m_TextureFormat'), str(d.get('m_TextureFormat'))),
                    'mips': d.get('m_MipCount', 1), 'srgb': d.get('m_ColorSpace', 1) == 1, 'alpha': has_alpha,
                    'file': f'tex/{key}.webp', 'half': None}
            ts = d.get('m_TextureSettings', {})
            wrap = ['repeat', 'clamp', 'mirror', 'mirrorOnce']
            meta.update({'wrapU': wrap[min(3, ts.get('m_WrapU', 0))], 'wrapV': wrap[min(3, ts.get('m_WrapV', 0))],
                         'filter': ['point', 'bilinear', 'trilinear'][min(2, ts.get('m_FilterMode', 1))],
                         'aniso': ts.get('m_Aniso', 0)})
            full = io.BytesIO()
            img.save(full, 'WEBP', quality=fx.WEBP_QUALITY, method=fx.WEBP_METHOD)
            half = None
            if t.m_Width >= fx.HALF_MIN and t.m_Height >= fx.HALF_MIN:
                size = (max(1, t.m_Width // 2), max(1, t.m_Height // 2))
                small = (img.convert('RGBa').resize(size, Image.LANCZOS).convert('RGBA') if has_alpha
                         else img.resize(size, Image.LANCZOS))
                buf = io.BytesIO()
                small.save(buf, 'WEBP', quality=fx.WEBP_QUALITY, method=fx.WEBP_METHOD)
                half = buf.getvalue()
                meta['half'] = f'tex/half/{key}.webp'
            hit = (meta, full.getvalue(), half)
            self.cache.put(key, hit)
        meta, full, half = hit
        fx.write_atomic(self.out / meta['file'], full)
        if half is not None:
            fx.write_atomic(self.out / meta['half'], half)
        self.textures[key] = dict(meta)
        return key


def _go_key(o):
    return (id(o.assets_file), o.path_id)


def _ref(env, sfile, pptr):
    f, o = env.resolve(sfile, pptr)
    return (f, o) if o is not None and f != 'builtin' else (None, None)


def _node_of(env, ids, comps, sfile, pptr):
    """Node id of a PPtr to a GameObject or a component of this prefab, else None."""
    f, o = _ref(env, sfile, pptr)
    if o is None:
        return None
    k = _go_key(o)
    if k in ids:
        return ids[k]
    return comps[k][0] if k in comps else None


def walk(env, root, extra_children):
    """nodes / ids / comps of the GameObject tree under `root` as fx.Exporter.prefab builds them, with
    `extra_children[(file, path id)]` appended to a node's children (the holders' instantiated effects)."""
    nodes, ids, comps = [], {}, {}
    order = [(root, None)]
    while order:
        go, parent = order.pop(0)
        nid = len(nodes)
        ids[_go_key(go)] = nid
        gd = env.tt(go)
        nodes.append({'id': nid, 'name': gd.get('m_Name', ''), 'parent': parent, 'children': [],
                      'active': bool(gd.get('m_IsActive', 1)), '_go': go})
        if parent is not None:
            nodes[parent]['children'].append(nid)
        order[0:0] = [(k, nid) for k in fx.go_children(env, go) + extra_children.get(_go_key(go), [])]
        for c in gd.get('m_Component', []):
            cf, co = env.resolve(go.assets_file, c.get('component'))
            if co is not None and cf != 'builtin':
                comps[_go_key(co)] = (nid, co.type.name, co)
    return nodes, ids, comps


def animator_graph(env, ctx, co, nid):
    """An Animator's controller as a state machine (§33.19): parameters, layers, states with their clip (descriptor
    clip index), transitions with their conditions. Names from the controller's m_TOS table."""
    d = env.tt(co)
    cf, cc = _ref(env, co.assets_file, d.get('m_Controller'))
    if cc is None:
        return None
    ct = env.tt(cc)
    tos = {int(h): n for h, n in ct.get('m_TOS') or []}
    clip_refs = ct.get('m_AnimationClips') or []
    c = ct.get('m_Controller') or {}
    un = lambda x: x.get('data', x) if isinstance(x, dict) else x  # noqa: E731
    defaults = un(c.get('m_DefaultValues') or {})
    store = {1: 'm_FloatValues', 3: 'm_IntValues', 4: 'm_BoolValues', 9: 'm_BoolValues'}
    params = []
    for v in un(c.get('m_Values') or {}).get('m_ValueArray', []):
        v = un(v)
        t = v.get('m_Type')
        arr = defaults.get(store.get(t, ''), []) or []
        dv = arr[v['m_Index']] if 0 <= v.get('m_Index', -1) < len(arr) else None
        params.append({'name': tos.get(v.get('m_ID'), str(v.get('m_ID'))), 'type': PARAM_TYPES.get(t, t),
                       'default': bool(dv) if t in (4, 9) and dv is not None else dv})

    def clip_index(cid):
        if cid is None or cid == NO_CLIP or not 0 <= cid < len(clip_refs):
            return None
        kf, ko = _ref(env, cc.assets_file, clip_refs[cid])
        return ctx.clip(kf, ko, nid) if ko is not None else None

    def transition(t, count):
        t = un(t)
        dest = t.get('m_DestinationState')
        conds = []
        for cd in t.get('m_ConditionConstantArray', []):
            cd = un(cd)
            conds.append({'mode': COND_MODES.get(cd.get('m_ConditionMode'), cd.get('m_ConditionMode')),
                          'param': tos.get(cd.get('m_EventID'), str(cd.get('m_EventID'))),
                          'threshold': fx.f6(cd.get('m_EventThreshold', 0))})
        out = {'to': dest if isinstance(dest, int) and 0 <= dest < count else None,
               'duration': fx.f6(t.get('m_TransitionDuration', 0)), 'fixedDuration': bool(t.get('m_HasFixedDuration')),
               'offset': fx.f6(t.get('m_TransitionOffset', 0)), 'exitTime': fx.f6(t.get('m_ExitTime', 0)),
               'hasExitTime': bool(t.get('m_HasExitTime')), 'conditions': conds}
        if out['to'] is None:
            out['toRaw'] = dest
        return out

    machines = [un(m) for m in c.get('m_StateMachineArray', [])]
    layers = []
    for layer in c.get('m_LayerArray', []):
        layer = un(layer)
        sm = machines[layer.get('m_StateMachineIndex', 0)] if machines else {}
        raw_states = [un(s) for s in sm.get('m_StateConstantArray', [])]
        states = []
        for s in raw_states:
            trees = [un(b) for b in s.get('m_BlendTreeConstantArray', [])]
            tree_nodes = [un(n) for n in (trees[0].get('m_NodeArray', []) if trees else [])]
            clips = [clip_index(n.get('m_ClipID')) for n in tree_nodes]
            st = {'name': tos.get(s.get('m_NameID'), str(s.get('m_NameID'))), 'clip': clips[0] if len(clips) == 1 else None,
                  'speed': fx.f6(s.get('m_Speed', 1)), 'loop': bool(s.get('m_Loop')),
                  'transitions': [transition(t, len(raw_states)) for t in s.get('m_TransitionConstantArray', [])]}
            if len(clips) > 1:
                st['blendClips'] = clips
            states.append(st)
        layers.append({'name': tos.get(layer.get('m_Binding'), None), 'defaultState': sm.get('m_DefaultState', 0),
                       'defaultWeight': fx.f6(layer.get('m_DefaultWeight', 1)), 'states': states,
                       'anyState': [transition(t, len(raw_states)) for t in sm.get('m_AnyStateTransitionConstantArray', [])]})
    return {'node': nid, 'controller': ct.get('m_Name'), 'parameters': params, 'layers': layers}


def half_page(img, straight):
    """The half-size copy of an atlas page, exactly w/2 × h/2, every texel the premultiplied mean of its 2 × 2 source
    texels (Image.BOX: no overshoot, so rgb ≤ a stays true). How the page stores colour decides the steps:
    - premultiplied (the material has no `_USEBLEED_ON`: the shader takes rgb as it is) — each channel averaged alike,
      on the separate bands. Image.resize on the RGBA image would premultiply it a second time (Pillow premultiplies
      RGBA itself before resampling and divides afterwards): an edge texel kept its full colour while its alpha halved,
      the pale fringes of the half tier (Goldenglow summer#12, 2026-11-22);
    - straight (`_USEBLEED_ON`: the shader multiplies rgb by a) — where the half texel has alpha, the alpha-weighted
      colour (premultiplied, averaged, divided back: Pillow's RGBa round trip); where it is fully transparent, the plain
      mean of the source colour. These pages carry colour bled into their transparent texels (88 % of the transparent
      ring around Eyjafjalla epoque#57's regions), which bilinear sampling reads at every edge; the round trip alone
      leaves black there, a dark outline round small parts (2026-11-22)."""
    from PIL import Image
    size = (img.width // 2, img.height // 2)
    box = (0, 0, size[0] * 2, size[1] * 2)
    rgba = img.convert('RGBA')
    if straight:
        weighted = rgba.convert('RGBa').resize(size, Image.BOX, box=box).convert('RGBA')
        alpha = weighted.getchannel('A')
        bled = rgba.convert('RGB').resize(size, Image.BOX, box=box)
        rgb = Image.composite(weighted.convert('RGB'), bled, alpha.point(lambda v: 255 if v else 0))
        return Image.merge('RGBA', (*rgb.split(), alpha))
    return Image.merge('RGBA', [band.resize(size, Image.BOX, box=box) for band in rgba.split()])


def material_keywords(env, mo):
    """A material's shader keywords (m_ValidKeywords, or the older space-separated m_ShaderKeywords)."""
    d = env.tt(mo)
    kw = d.get('m_ValidKeywords') or d.get('m_ShaderKeywords') or []
    return kw.split() if isinstance(kw, str) else list(kw)


def write_spine(env, sda_file, sda, writer, helpers, log, key):
    """Skeleton, atlas and pages of a SkeletonDataAsset → files; returns the `spine` part of the index (without the
    SkeletonAnimation fields) and the page texture map for the exporter."""
    _, skel = _ref(env, sda_file, sda.get('skeletonJSON'))
    if skel is None:
        raise ValueError('skeleton TextAsset missing')
    ta = skel.read()
    blob = helpers['text_bytes'](ta)
    is_json = blob.lstrip(b'\xef\xbb\xbf \r\n\t')[:1] == b'{'
    stem = re.sub(r'\.(skel|json)$', '', helpers['safe_name'](ta.m_Name or key))   # Python 3.8: no removesuffix
    skel_rel = f'{stem}.json' if is_json else f'{stem}.skel'
    texts, pages, page_tex, materials, straight = [], {}, {}, [], {}
    for aref in sda.get('atlasAssets') or []:
        _, aa = _ref(env, sda_file, aref)
        if aa is None:
            continue
        at = env.tt(aa)
        _, atext = _ref(env, aa.assets_file, at.get('atlasFile'))
        if atext is not None:
            texts.append(helpers['text_bytes'](atext.read()).decode('utf-8', 'replace'))
        for mref in at.get('materials') or []:
            mf, mo = _ref(env, aa.assets_file, mref)
            if mo is None:
                continue
            texs = dict(env.tt(mo)['m_SavedProperties']['m_TexEnvs'])
            tf, main = _ref(env, mo.assets_file, texs.get('_MainTex', {}).get('m_Texture'))
            af, alpha = _ref(env, mo.assets_file, texs.get('_AlphaTex', {}).get('m_Texture'))
            if main is None:
                continue
            mt = main.read()
            name = mt.m_Name + '.png'       # as the atlas names it (`#` kept); the file name is made safe below
            pages[name] = helpers['merge_alpha'](mt.image, alpha.read().image if alpha is not None else None)
            straight[name] = '_USEBLEED_ON' in material_keywords(env, mo)   # the shader premultiplies: straight page
            page_tex[(id(tf), main.path_id)] = name
            if alpha is not None:
                page_tex[(id(af), alpha.path_id)] = name
            materials.append((mf, mo))
    if not texts or not pages:
        raise ValueError('atlas or pages missing')
    atlas = texts[0] if len(texts) == 1 else '\n\n'.join(t.strip('\n') for t in texts) + '\n'
    names = helpers['atlas_pages'](atlas)
    if set(names) != set(pages):
        if len(names) != 1 or len(pages) != 1:
            raise ValueError(f'atlas pages {names} do not match the textures {sorted(pages)}')
        only = next(iter(pages))
        pages = {names[0]: pages[only]}
        straight = {names[0]: straight[only]}
        page_tex = {k: names[0] for k in page_tex}
    atlas_rel = f'{stem}.atlas'
    writer.put(skel_rel, blob)
    writer.put(atlas_rel, helpers['normalize_atlas'](atlas, {p: img.size for p, img in pages.items()}).encode('utf-8'))
    out_pages = []
    for name, img in pages.items():
        base = fx.fx_file(Path(name).stem)              # URL-safe: `#` → `_` + CRC32 (§33.1)
        full, half = f'p/{base}.webp', f'p/half/{base}.webp'
        buf = io.BytesIO()
        img.save(buf, 'WEBP', **PAGE_WEBP)
        writer.put(full, buf.getvalue())
        small = half_page(img, straight.get(name, False))
        buf = io.BytesIO()
        # a premultiplied half page is lossless: lossy WebP's 4:2:0 colour subsampling spreads colour past the alpha
        # edges (rgb > a), pale fringes again at half size (Goldenglow summer#12: 3.0 % unencoded, 5.9 % at q90)
        small.save(buf, 'WEBP', **(PAGE_WEBP if straight.get(name, False) else PAGE_WEBP_LOSSLESS))
        writer.put(half, buf.getvalue())
        out_pages.append({'name': name, 'file': full, 'half': half, 'w': img.width, 'h': img.height,
                          'pma': not straight.get(name, False)})
    mix = {'default': fx.f6(sda.get('defaultMix', 0)),
           'pairs': [[a, b, fx.f6(t)] for a, b, t in zip(sda.get('fromAnimation') or [], sda.get('toAnimation') or [],
                                                         sda.get('duration') or [])]}
    spine = {'skeleton': skel_rel, 'format': 'json' if is_json else 'binary', 'version': spine_version(blob),
             'atlas': atlas_rel, 'pages': out_pages, 'scale': fx.f6(sda.get('scale', 1)), 'mix': mix}
    return spine, page_tex, materials, sda.get('blendModeMaterials') or {}


def effect_prefabs(env, eff_path):
    """Container path (lower case) → prefab GameObject of arts/dynchars/effect.ab, loaded into `env`."""
    out = {}
    if eff_path is None:
        return out
    for sf in env.load(eff_path):
        for cpath, obj in (getattr(sf, 'container', None) or {}).items():
            if cpath.endswith('.prefab'):
                try:
                    out[cpath.lower()] = obj.deref() if hasattr(obj, 'deref') else obj
                except Exception:
                    continue
    return out


GROUPS = ('IDLE', 'SPECIAL_IDLE', 'START', 'INTERACTION')     # load order; IDLE also holds the always-on parts
TRIGGER_GROUP = {'OnIdle': 'IDLE', 'OnSpecial': 'SPECIAL_IDLE', 'OnStart': 'START', 'OnInteract': 'INTERACTION'}
CARD_NEVER = ('START', 'INTERACTION')   # the card never plays Start (O1) and has no tap (D9)
_REF = re.compile(r'"(mesh|texture)":"([^"]+)"|"material":(\d+)')


def state_groups(animator):
    """Animator state index → action group: the default state is IDLE; a transition on a trigger (OnSpecial, …) gives
    its target that trigger's group; a transition without one passes its source's group on (exit-time chains)."""
    out = []
    for layer in animator.get('layers') or []:
        states, g = layer.get('states') or [], {layer.get('defaultState', 0): 'IDLE'}
        def target(t, src):
            for c in t.get('conditions') or []:
                if c.get('param') in TRIGGER_GROUP:
                    return TRIGGER_GROUP[c['param']]
            return g.get(src) if src is not None else None
        changed = True
        while changed:
            changed = False
            edges = [(i, t) for i, s in enumerate(states) for t in s.get('transitions') or []]
            edges += [(None, t) for t in layer.get('anyState') or []]
            for src, t in edges:
                grp = target(t, src)
                if grp and t.get('to') is not None and t['to'] not in g:
                    g[t['to']] = grp
                    changed = True
        out.append((states, g))
    return out


def load_groups(nodes, materials, clips, particles, animators, files, textures, meshes, spine):
    """§33.19 `load`: the earliest action group needing each node, texture and mesh, and the bytes of each group.
    A node gates with the nearest node (itself or an ancestor) that an action switches on: an ActionParticle or a holder
    effect of that action, or a GameObject.m_IsActive curve of a clip in an Animator state of that group; a node no
    action gates is always on (IDLE). A file belongs to the earliest group of the nodes that use it."""
    gate = {}
    for p in particles:
        if p.get('node') is not None:
            gate.setdefault(p['node'], set()).add(p['action'])
    for a in animators:
        for states, g in state_groups(a):
            for si, grp in g.items():
                ci = states[si].get('clip') if 0 <= si < len(states) else None
                clip = clips[ci] if isinstance(ci, int) and 0 <= ci < len(clips) else None
                for cv in (clip or {}).get('curves') or []:
                    if (cv.get('type') == 'GameObject' and cv.get('property') == 'm_IsActive' and cv.get('node') is not None
                            and any(len(k) > 1 and k[1] is not None and k[1] > 0.5 for k in cv.get('keys') or [])):
                        gate.setdefault(cv['node'], set()).add(grp)
    rank = {g: i for i, g in enumerate(GROUPS)}
    node_group = []
    for n in nodes:
        cur, tags = n, None
        while cur is not None:
            if cur['id'] in gate:
                tags = gate[cur['id']]
                break
            cur = nodes[cur['parent']] if cur.get('parent') is not None else None
        node_group.append(min((t for t in (tags or {'IDLE'}) if t in rank), key=rank.get, default='IDLE'))
    tex_group, mesh_group = {}, {}
    def use(table, key, grp):
        if key and (key not in table or rank[grp] < rank[table[key]]):
            table[key] = grp
    for n, grp in zip(nodes, node_group):
        body = json.dumps({k: v for k, v in n.items() if k != 'children'}, separators=(',', ':'))
        for kind, key, mi in _REF.findall(body):
            if kind == 'mesh':
                use(mesh_group, key, grp)
            elif kind == 'texture':
                use(tex_group, key, grp)
            elif mi:
                m = materials[int(mi)] if int(mi) < len(materials) else {}
                for t in (m.get('textures') or {}).values():
                    use(tex_group, t.get('tex'), grp)
        for k in ('meshRenderer', 'particleSystemRenderer', 'skinnedMeshRenderer', 'trailRenderer', 'lineRenderer', 'spriteRenderer'):
            for mi in (n.get(k) or {}).get('materials') or []:
                if isinstance(mi, int) and mi < len(materials):
                    for t in (materials[mi].get('textures') or {}).values():
                        use(tex_group, t.get('tex'), grp)
        if isinstance(n.get('meshFilter'), str):
            use(mesh_group, n['meshFilter'], grp)
    tex_group = {k: tex_group.get(k, 'IDLE') for k in textures}       # a texture no node names stays in the first load
    mesh_group = {k: mesh_group.get(k, 'IDLE') for k in meshes}
    size = lambda rel: files.get(rel, {}).get('bytes', 0) if rel else 0    # noqa: E731
    by = {g: {'full': 0, 'half': 0} for g in GROUPS}
    for k, grp in tex_group.items():
        t = textures[k]
        by[grp]['full'] += size(t['file'])
        by[grp]['half'] += size(t.get('half') or t['file'])
    for k, grp in mesh_group.items():
        by[grp]['full'] += size(meshes[k]['file'])
        by[grp]['half'] += size(meshes[k]['file'])
    base_full = size(spine['skeleton']) + size(spine['atlas']) + size('fx.json') + sum(size(p['file']) for p in spine['pages'])
    base_half = size(spine['skeleton']) + size(spine['atlas']) + size('fx.json') + sum(size(p['half']) for p in spine['pages'])
    return {'groups': list(GROUPS), 'cardNever': list(CARD_NEVER), 'nodes': node_group, 'textures': tex_group,
            'meshes': mesh_group, 'bytes': by,
            'firstLoad': {'full': base_full + by['IDLE']['full'], 'half': base_half + by['IDLE']['half']}}


def export_one(env, key, path, eff_path, out_dir, budget, helpers, log):
    """One illustration → out_dir; returns its index entry for the manifest."""
    sfiles = env.load(path)
    root = None
    for sf in sfiles:
        for cpath, obj in (getattr(sf, 'container', None) or {}).items():
            if cpath.endswith(f'/dyn_illust_{key}.prefab'):
                root = obj.deref() if hasattr(obj, 'deref') else obj
    if root is None:
        raise ValueError(f'no prefab dyn_illust_{key} in {path.name}')
    sid = skin_id(official_key(key, env.tt(root).get('m_Name')))
    def tree_behaviours(cmps):
        """(class, typetree, object) of every MonoBehaviour in a walked tree."""
        out = []
        for _nid, kind, co in cmps.values():
            if kind == 'MonoBehaviour':
                try:
                    out.append((env.script(co)[1], env.tt(co), co))
                except Exception:
                    continue
        return out
    # Only the card prefab's own tree: a bundle may also hold sp_dyn_illust_<key> (DynIllustSpecial + lip sync),
    # dyn_entrance_<key> (DynIllustStartPlay) and dyn_portrait_<key>, each with its own skeleton and separator.
    behaviours = tree_behaviours(walk(env, root, {})[2])
    dyn = next(((c, t, o) for c, t, o in behaviours if '_cameraSize' in t), None)
    if dyn is None:
        raise ValueError('no DynIllust behaviour')
    dyn_cls, dt, do = dyn
    _, sk = _ref(env, do.assets_file, dt.get('_skeleton'))
    if sk is None:
        raise ValueError('DynIllust._skeleton missing')
    st = env.tt(sk)
    # SkeletonAnimation keeps its mesh settings on itself; SkeletonGraphic (UI) under meshGenerator.settings
    graphic = 'meshGenerator' in st or 'startingAnimation' in st
    gen = ((st.get('meshGenerator') or {}).get('settings') or {}) if graphic else st
    sda_f, sda = _ref(env, sk.assets_file, st.get('skeletonDataAsset'))
    if sda is None:
        raise ValueError('SkeletonDataAsset missing')
    writer = Writer(out_dir, budget)
    spine, page_tex, spine_mats, blend = write_spine(env, sda.assets_file, env.tt(sda), writer, helpers, log, key)

    # holders: their effect prefab becomes a child of the holder's GameObject (Instantiate(original, parent))
    extra, holders = {}, []
    effects = None
    for cls, t, o in behaviours:
        if '_effectPath' not in t:
            continue
        if effects is None:
            effects = effect_prefabs(env, eff_path)
        hf, hgo = _ref(env, o.assets_file, t.get('m_GameObject'))
        eff = effects.get('dyn/' + t['_effectPath'].lower() + '.prefab')
        if hgo is None or eff is None:
            log(f'  warn {key}: holder effect {t["_effectPath"]} not found')
            continue
        extra.setdefault(_go_key(hgo), []).append(eff)
        holders.append((hgo, eff, t))

    ex = DynExporter(env, out_dir, log, page_tex, helpers['cache'])
    nodes, ids, comps = walk(env, root, extra)
    behaviours = tree_behaviours(comps)          # now with the holders' effects (their FxDelays, shakes)
    ctx = fx.PrefabCtx(ex, nodes, ids, comps)
    stats = {'nodes': len(nodes), 'particleSystems': 0, 'liveParticles': 0, 'duration': 0.0, 'looping': False}
    for n in nodes:
        ctx.node(n, n.pop('_go'), stats)
    mats = [ctx.material(f, o) for f, o in spine_mats]
    animators = []
    for a in dt.get('_animators') or []:
        af, ao = _ref(env, do.assets_file, a)
        if ao is not None and _go_key(ao) in comps:
            g = animator_graph(env, ctx, ao, comps[_go_key(ao)][0])
            if g:
                animators.append(g)
    ctx.finish()
    stats['liveParticles'] = round(stats['liveParticles'])
    stats['duration'] = None if stats['looping'] else fx.f6(stats['duration'])
    tex_used = sorted(k for k in ctx.tex_used if k in ex.textures)
    desc = {'format': 'fx-prefab', 'version': fx.FORMAT_VERSION, 'key': f'dyn_illust_{key}', 'bundle': f'arts/dynchars/{path.name}',
            'root': 0, 'nodes': nodes, 'materials': ctx.materials, 'clips': ctx.clips, 'textures': tex_used,
            'meshes': sorted(ctx.mesh_used), 'refs': [], 'stats': stats}
    writer.put('fx.json', json.dumps(desc, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    textures, meshes = {}, {}
    for k in tex_used:
        meta = dict(ex.textures[k])
        writer.adopt(meta['file'])
        if meta.get('half'):
            writer.adopt(meta['half'])
        textures[k] = meta
    for k in sorted(ctx.mesh_used):
        writer.adopt(ex.meshes[k]['file'])
        meshes[k] = ex.meshes[k]

    delays = {}
    for cls, t, o in behaviours:
        if cls == 'FxDelay' and '_delayTime' in t:
            n = _node_of(env, ids, comps, o.assets_file, t.get('m_GameObject'))
            if n is not None:
                delays[n] = fx.f6(t['_delayTime'])
    particles = []
    for p in dt.get('_particles') or []:
        n = _node_of(env, ids, comps, do.assets_file, p.get('particle'))
        particles.append({'action': ACTIONS.get(p.get('action'), p.get('action')), 'node': n, 'delay': delays.get(n)})
    out_holders = []
    for hgo, eff, t in holders:
        hn, rn = ids.get(_go_key(hgo)), ids.get(_go_key(eff))
        action = ACTIONS.get(t.get('_action'), t.get('_action'))
        out_holders.append({'node': hn, 'action': action, 'path': t['_effectPath'], 'root': rn})
        particles.append({'action': action, 'node': rn, 'delay': delays.get(rn), 'holder': True})
    followers, separator = [], None
    sk_node = _node_of(env, ids, comps, sk.assets_file, st.get('m_GameObject'))
    for cls, t, o in behaviours:
        if cls == 'BoneFollower' and 'boneName' in t:
            followers.append({'node': _node_of(env, ids, comps, o.assets_file, t.get('m_GameObject')), 'bone': t['boneName'],
                              'xy': bool(t.get('followXYPosition')), 'z': bool(t.get('followZPosition')),
                              'rotation': bool(t.get('followBoneRotation')), 'flip': bool(t.get('followSkeletonFlip')),
                              'localScale': bool(t.get('followLocalScale')),
                              'appliedLocalScale': bool(t.get('useAppliedLocalScale')),
                              'axis': t.get('maintainedAxisOrientation')})
        if 'partsRenderers' in t and _go_key(_ref(env, o.assets_file, t.get('skeletonRenderer'))[1] or sk) == _go_key(sk):
            separator = {'slots': list(st.get('separatorSlotNames') or []),
                         'parts': [_node_of(env, ids, comps, o.assets_file, r) for r in t.get('partsRenderers') or []],
                         'copyPropertyBlock': bool(t.get('copyPropertyBlock')),
                         'copyMeshRendererFlags': bool(t.get('copyMeshRendererFlags'))}
    if separator is None and st.get('separatorSlotNames'):
        separator = {'slots': list(st['separatorSlotNames']), 'parts': [], 'copyPropertyBlock': False,
                     'copyMeshRendererFlags': False}

    def blend_list(name):
        out = []
        for e in blend.get(name) or []:
            mf, mo = _ref(env, sda.assets_file, e.get('material'))
            out.append({'page': e.get('pageName'), 'material': ctx.material(mf, mo) if mo is not None else None})
        return out
    def look_of(i):
        """Dev 51's shader inputs of a material (§33.19 `look`)."""
        if i is None:
            return None
        mt = ctx.materials[i]
        cols, fl = mt.get('colors') or {}, mt.get('floats') or {}
        return {'index': i, 'shader': mt.get('shader'), 'keywords': mt.get('keywords') or [], 'queue': mt.get('queue'),
                'color': cols.get('_Color'), 'black': cols.get('_Black'), 'useGray': fl.get('_UseGray'),
                'grayScale': fl.get('_GrayScale')}
    if graphic:
        gf, gm = _ref(env, sk.assets_file, st.get('m_Material'))
        main_mat = ctx.material(gf, gm) if gm is not None else (mats[0] if mats else None)
    else:
        main_mat = mats[0] if mats else None
    blends = {'additive': blend_list('additiveMaterials'), 'multiply': blend_list('multiplyMaterials'),
              'screen': blend_list('screenMaterials')}
    color = st.get('m_Color')
    look = {'kind': 'graphic' if graphic else 'animation', 'pmaVertexColors': bool(gen.get('pmaVertexColors')),
            'tintBlack': bool(gen.get('tintBlack')),
            'color': [fx.f6(color[c]) for c in 'rgba'] if isinstance(color, dict) else None,
            'material': look_of(main_mat),
            **{k: (look_of(v[0]['material']) if v else None) for k, v in blends.items()}}
    renderers = []
    for part, nid in [(None, sk_node)] + list(enumerate((separator or {}).get('parts') or [])):
        r = nodes[nid].get('meshRenderer') if nid is not None else None
        if r is None:
            continue
        q = [ctx.materials[i].get('queue') for i in r.get('materials') or [] if isinstance(i, int)]
        renderers.append({'node': nid, 'part': part, 'enabled': bool(r.get('m_Enabled', True)),
                          'sortingLayer': r.get('m_SortingLayer'), 'sortingLayerID': r.get('m_SortingLayerID'),
                          'sortingOrder': r.get('m_SortingOrder'),
                          'queue': q[0] if q else (look['material'] or {}).get('queue')})
    spine.update({'kind': look['kind'], 'materials': mats,
                  'animation': st.get('_animationName', st.get('startingAnimation')),
                  'loop': bool(st.get('loop', st.get('startingLoop'))),
                  'timeScale': fx.f6(st.get('timeScale', 1)), 'skin': st.get('initialSkinName', ''),
                  'flipX': bool(st.get('initialFlipX')), 'flipY': bool(st.get('initialFlipY')),
                  'pmaVertexColors': look['pmaVertexColors'], 'tintBlack': look['tintBlack'],
                  'zSpacing': fx.f6(gen.get('zSpacing', 0)), 'useClipping': bool(gen.get('useClipping')),
                  'blendModes': {'requires': bool(blend.get('requiresBlendModeMaterials')),
                                 'applyAdditive': bool(blend.get('applyAdditiveMaterial')), **blends},
                  'look': look, 'renderers': renderers, 'separator': separator, 'followers': followers})
    root_node = nodes[sk_node if sk_node is not None else 0]
    paths = {}
    for n in nodes:                                   # node path (names from the root, '/'-joined) → first node id
        p, parent = [], n
        while parent['parent'] is not None:
            p.append(parent['name'])
            parent = nodes[parent['parent']]
        paths.setdefault('/'.join(reversed(p)), n['id'])
    shakes = []
    for cls, t, o in behaviours:
        if cls == 'FxDynIllustCameraShake':
            # `_shakeTrigs`: [{ delay, duration, strength (Vector3), vibrato, randomness, fadeOut }] as stored
            shakes.append({'node': _node_of(env, ids, comps, o.assets_file, t.get('m_GameObject')),
                           'enabled': bool(t.get('m_Enabled', 1)),
                           'trigs': fx.enc_value(t.get('_shakeTrigs') or [], lambda p: None)})
    adj = dt.get('_adjustes') or []
    framing = {'cameraSize': fx.f6(dt.get('_cameraSize')),
               'maxSize': [fx.f6(dt['_maxSize']['x']), fx.f6(dt['_maxSize']['y'])] if dt.get('_maxSize') else None,
               'adjust': {ADJUST[i]: {'offset': [fx.f6(a['offset']['x']), fx.f6(a['offset']['y'])],
                                      'size': [fx.f6(a['size']['x']), fx.f6(a['size']['y'])]}
                          for i, a in enumerate(adj[:len(ADJUST)])},
               'root': {'node': root_node['id'], 'pos': root_node.get('pos'), 'rot': root_node.get('rot'),
                        'scale': root_node.get('scale')}}
    actions = {'particles': particles, 'holders': out_holders, 'animators': animators, 'cameraShakes': shakes,
               'fixFxDelay': bool(dt.get('_fixFxDelay')), 'animTimeFixed': bool(dt.get('_animTimeFixed')),
               'extraTracks': [{'track': e.get('trackIndex'), 'animation': e.get('animationName')}
                               for e in dt.get('_extraTrackAnimations') or []]}
    files = writer.files
    full = sum(v['bytes'] for r, v in files.items() if not r.startswith(('p/half/', 'tex/half/')))
    # the half tier swaps every page and every texture that has a half copy for that copy
    swaps = [(p['file'], p['half']) for p in spine['pages']] + [(t['file'], t['half']) for t in textures.values() if t.get('half')]
    half = full + sum(files[h]['bytes'] - files[f]['bytes'] for f, h in swaps)
    m = KEY_RE.match(key)
    index = {'format': 'dynillust', 'version': DYN_VERSION, 'key': key, 'charId': m.group(1), 'skinId': sid,
             'class': dyn_cls, 'bundle': f'arts/dynchars/{path.name}', 'client': helpers.get('client'),
             'files': dict(sorted(files.items())), 'bytes': {'full': full, 'half': half},
             'spine': spine, 'framing': framing, 'actions': actions,
             'fx': {'file': 'fx.json', 'textures': textures, 'meshes': meshes, 'paths': paths,
                    # nodes whose FxGetParticleSystemPosWS sets _ParticleSystemPositionWS (GrabPass _DirMode 2 reads it)
                    'posWS': [n['id'] for n in nodes
                              if any(b.get('class') == 'FxGetParticleSystemPosWS' for b in n.get('behaviours') or [])]}}
    index['load'] = load_groups(nodes, ctx.materials, ctx.clips, particles, animators, files, textures, meshes, spine)
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    budget.spend(len(body), 'illust.json')
    fx.write_atomic(Path(out_dir) / 'illust.json', body)
    return {'charId': index['charId'], 'skinId': index['skinId'], 'bytes': full + len(body), 'bytesHalf': half + len(body),
            'class': dyn_cls, 'holders': len(out_holders), 'particles': len(particles), 'nodes': len(nodes),
            'animators': len(animators), 'format': spine['format'], 'version': spine['version'],
            'tintBlack': spine['tintBlack'], 'kind': spine['kind'], 'shakes': len(shakes),
            'spineShader': (spine['look']['material'] or {}).get('shader'),
            'multiply': (spine['look']['multiply'] or {}).get('shader'),
            'shaders': sorted({x.get('shader') or '?' for x in ctx.materials})}


def export_dynillust(ab_root, out_root, manifest, log, root, helpers, keys=None, max_mb=DYN_MAX_MB, max_s=DYN_MAX_S,
                     report=None, shard=None):
    """The dynillust run (extract.py --only dynillust): every illustration of our pools (or `keys`) → <out_root>/dynillust;
    manifest group `dynillust`. Returns the number of illustrations written. A cap stops the run (CapError) after deleting
    the illustration it was writing."""
    roots = bundle_roots(ab_root)
    bundles = find_bundles(roots, pool_chars(root), set(keys) if keys else None)
    if shard:                                        # (i, n): every n-th illustration from the i-th (0-based)
        bundles = dict(list(bundles.items())[shard[0]::shard[1]])
    log(f'dynillust: {len(bundles)} illustrations ({", ".join(str(r) for r in roots)})')
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    cabs = scan_all_cabs(roots)
    budget = Budget(max_mb * 1024 * 1024, time.time() + max_s)
    eff_path = next((Path(r) / DYN_EFFECTS for r in roots if (Path(r) / DYN_EFFECTS).is_file()), None)
    hp = dict(helpers)
    hp['client'] = next((fx.client_version(r) for r in roots if fx.client_version(r)), None)
    hp['cache'] = EncodedCache()
    group, rows, n = {}, {}, 0
    out_base = Path(out_root) / DYN_SUB
    env = None
    for i, (key, path) in enumerate(bundles.items()):
        t0 = time.time()
        if i % ENV_BATCH == 0:      # a fresh environment every ENV_BATCH illustrations: shared bundles load once a batch,
            env = fx.AssetEnv(Path(ab_root), cabs)   # memory stays bounded
        d = out_base / fx.fx_file(key)
        if d.exists():
            shutil.rmtree(d)
        try:
            row = export_one(env, key, path, eff_path, d, budget, hp, log)
        except CapError:
            shutil.rmtree(d, ignore_errors=True)
            raise
        except Exception as e:  # one broken illustration must not stop the others
            shutil.rmtree(d, ignore_errors=True)
            log(f'FAIL {key}: {e!r}')
            rows[key] = {'error': str(e)[:300]}
            continue
        group[key] = {'path': f'/assets/local/{DYN_SUB}/{fx.fx_file(key)}/illust.json', 'kind': 'DynIllust',
                      'charId': row['charId'], 'skinId': row['skinId'], 'bytes': row['bytes'], 'bytesHalf': row['bytesHalf']}
        rows[key] = {**row, 'seconds': round(time.time() - t0, 1)}
        n += 1
        log(f'{key}: {row["bytes"] / 1048576:.1f} MB full / {row["bytesHalf"] / 1048576:.1f} MB half, {row["nodes"]} nodes, '
            f'{row["particles"]} particle sets, {row["holders"]} holders ({time.time() - t0:.1f} s; run '
            f'{budget.used / 1048576:.0f} MB)')
    manifest[DYN_SUB] = group
    outfits = outfit_ids(root)
    if outfits is not None:     # every outfit illustration must name its outfit exactly, or the game never shows it
        for sid in skin_id_mismatches([g['skinId'] for g in group.values()], outfits):
            log(f'WARNING skinId {sid} is not an id of data/outfits.json: no outfit shows this illustration')
            for k, g in group.items():
                if g['skinId'] == sid:
                    rows[k]['skinIdMismatch'] = True
    if report:
        fx.write_atomic(Path(report), json.dumps(rows, ensure_ascii=False, indent=1).encode('utf-8'))
    return n
