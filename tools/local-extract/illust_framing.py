"""(fork) The official framing of the still full arts: where the client's own illustration prefab puts each one.

The official result card shows a still illustration by instantiating its prefab in the card's illustration holder
[src: official GameAssembly.dll UICharacterIllustController._LoadChrStaticIllust 0x1455770 ->
UICharacterIllustLoader.ControllerOnlyLoadChrIllust 0x1497DE0: PageAssetPool.LoadAsset, Object.Instantiate], so the prefab
root's RectTransform (m_AnchoredPosition, m_SizeDelta) is the art's own place in that holder.

Read (relative to the AB root; a hot update under Arknights_Data/PersistentData/Bundles wins):
  chararts/<charId>.ab, skinpack/<charId>.ab   prefab `illust_<portraitId>` and its Sprite / Texture2D `<portraitId>`
  data/assets.json, data/outfits.json, public/assets/outfit/art/*.webp (our copies, some trimmed to their opaque box)
Written (--out): { art file: { x, y, w, h, box: [l, t, r, b], err } } - the prefab's position and size in UI units (y up)
and the part of the official canvas our file holds, in canvas fractions (top-left origin). An art is listed only when our
file's picture matches that part (mean RGB difference at most MAX_ERR of 255); the others are printed.
Then: node tools/card-art-framing.mjs --official <out>.

usage: python tools/local-extract/illust_framing.py <repo root> <AB root> --out <file.json> [--only <text>]
Caps: 700 arts, 30 min, output under 400 KB. Writes only --out.
"""
import argparse
import json
import struct
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from dynillust import bundle_roots  # noqa: E402

MAX_ARTS, MAX_S, MAX_BYTES = 700, 1800, 400_000
ALPHAS = (0, 2, 8)  # alpha levels (of 255) tried for the trimmed box; our files were trimmed at more than one
FIT_OVER = 3.0     # a worse match than this: the crop's edges are fitted to the picture
MAX_STRETCH = 0.015
HOLDER = 100       # the illustration holder's size [src: official [uc]autochessouter.ab auto_chess_settle_game_player_item root]
MAX_ERR = 8.0      # the right pictures measured 0.7-2.6, a wrong crop 37 or more (4 arts, 2026-11-24)
CMP = 192          # the comparison's size


def wanted(root):
    """[(art file, charId, [portrait ids, best first])] of every full art data/assets.json lists."""
    assets = json.loads((root / 'data/assets.json').read_text(encoding='utf-8'))['outfits']
    outfits = json.loads((root / 'data/outfits.json').read_text(encoding='utf-8'))
    out = []
    for oid, rec in assets['chars'].items():
        if rec.get('art'):
            out.append((rec['art'], oid.split('@')[0], [outfits[oid]['portrait']] if oid in outfits else []))
    for cid, rec in assets['defaults'].items():
        if rec.get('art'):
            out.append((rec['art'], cid, [f'{cid}_2', f'{cid}_1']))
    return out


def load(roots, cid, cache):
    """The operator's prefab rects and pictures: {name.lower(): rect}, {name.lower(): largest texture object}."""
    import UnityPy
    if cid in cache:
        return cache[cid]
    cache.clear()  # one operator at a time: the textures are large
    rects, tex, sprites = {}, {}, {}
    for sub in ('chararts', 'skinpack'):
        src = next((r / sub / f'{cid}.ab' for r in roots if (r / sub / f'{cid}.ab').exists()), None)
        if src is None:
            continue
        for obj in UnityPy.load(str(src)).objects:
            t = obj.type.name
            if t == 'RectTransform':
                d = obj.read()
                try:
                    name = d.m_GameObject.read().m_Name
                except Exception:
                    continue
                if name.startswith('illust_'):
                    rects[name.lower()] = d
            elif t in ('Texture2D', 'Sprite'):
                d = obj.read()
                into = tex if t == 'Texture2D' else sprites
                w = d.m_Width if t == 'Texture2D' else d.m_Rect.width
                key = d.m_Name.lower()
                if key not in into or w > into[key][0]:
                    into[key] = (w, d)
    cache[cid] = (rects, tex, sprites)
    return cache[cid]


def picture(tex, name):
    """The official picture on its whole canvas (RGBA)."""
    from PIL import Image
    w, d = tex[name]
    img = d.image.convert('RGBA')
    al = tex.get(name + '[alpha]')
    if al and al[0] * 2 >= w:
        a = al[1].image.convert('RGBA')
        lo, hi = a.getchannel('R').getextrema()
        img.putalpha((a.getchannel('R') if hi > lo else a.getchannel('A')).resize(img.size, Image.BILINEAR))
    return img


def flat(img):
    from PIL import Image
    s = img.resize((CMP, CMP), Image.BILINEAR)
    out = Image.new('RGB', s.size, (255, 0, 255))
    out.paste(s, mask=s.getchannel('A'))
    return out


def err(a, b):
    from PIL import ImageChops, ImageStat
    return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3


def axis(rt, c):
    """(centre from the holder's centre, size) of a RectTransform on one axis, as Unity lays it out in HOLDER."""
    v = {k: getattr(getattr(rt, 'm_' + k), c) for k in ('AnchorMin', 'AnchorMax', 'Pivot', 'AnchoredPosition', 'SizeDelta', 'LocalScale')}
    lo, hi, p = v['AnchorMin'], v['AnchorMax'], v['Pivot']
    size = (v['SizeDelta'] + (hi - lo) * HOLDER) * v['LocalScale']
    return (lo + (hi - lo) * p - 0.5) * HOLDER + v['AnchoredPosition'] + (0.5 - p) * size, size


def preserve_aspect(rt):
    """Image.m_PreserveAspect of the rect's object, or None. Read from the component's end, which is UnityEngine.UI.Image's
    own serialized order: type, preserveAspect, fillCenter, fillMethod, fillAmount, fillClockwise, fillOrigin,
    useSpriteMesh, pixelsPerUnitMultiplier (the defaults of the last seven tell the component)."""
    for c in rt.m_GameObject.read().m_Component:
        obj = getattr(c, 'component', c).deref()
        raw = obj.get_raw_data()
        if obj.type.name == 'MonoBehaviour' and len(raw) >= 64:
            v = struct.unpack('<9i', raw[-36:])
            if v[2:] == (1, 4, 0x3F800000, 1, 0, 0, 0x3F800000) and v[0] in (0, 1, 2, 3) and v[1] in (0, 1):
                return bool(v[1])
    return None


def fit(img, mine, start):
    """The part of the canvas `mine` shows, from the box `start` (canvas px): each edge (and each pair of edges) moved
    while the difference falls, in steps from 6 % of the canvas to 0.1 %. (box, difference). Works on a 640-px copy."""
    k = 640 / max(img.size)
    small = img.resize((round(img.width * k), round(img.height * k)))
    cur = [v * k for v in start]

    def score(b):
        if b[2] - b[0] < 40 or b[3] - b[1] < 40:
            return 999.0
        return err(flat(small.crop(tuple(round(v) for v in b))), mine)
    best = score(cur)
    moves = [(0,), (1,), (2,), (3,), (0, 2), (1, 3)]
    for step in (38, 20, 10, 5, 2, 1):
        moved = True
        while moved:
            moved = False
            for m in moves:
                for sign in (-1, 1):
                    b = [v + (sign * step if i in m else 0) for i, v in enumerate(cur)]
                    e = score(b)
                    if e < best - 1e-6:
                        cur, best, moved = b, e, True
    return [round(v) / k for v in cur], best


def frame(root, roots, art, cid, ids, cache):
    """(entry, None) or (None, why not)."""
    from PIL import Image
    ours = root / 'public' / art.lstrip('/')
    if not ours.exists():
        return None, 'no local file'
    rects, tex, sprites = load(roots, cid, cache)
    mine, best = None, None
    for pid in ids:
        key = pid.lower()
        rt = rects.get('illust_' + key)
        if rt is None or key not in tex:
            continue
        img = picture(tex, key)
        sp = sprites.get(key)
        if sp and abs(sp[1].m_Rect.width / sp[1].m_Rect.height - img.width / img.height) > 0.01:
            return None, f'{pid}: the sprite is not its whole texture'
        if mine is None:
            src = Image.open(ours).convert('RGBA')
            mine, aspect = flat(src), src.width / src.height
        boxes = [(0, 0, img.width, img.height)]
        for th in ALPHAS:
            b = img.getchannel('A').point(lambda v, th=th: 255 if v > th else 0).getbbox()
            if b:
                boxes.append(b)
        tries = [(b, err(flat(img.crop(b)), mine)) for b in dict.fromkeys(boxes)]
        b, e = min(tries, key=lambda q: q[1])
        if e > FIT_OVER:
            tries.append(fit(img, mine, b))
        for b, e in tries:
            # the crop must be our file's own shape: a stretched fit is no match
            if abs((b[2] - b[0]) / (b[3] - b[1]) / aspect - 1) > MAX_STRETCH:
                continue
            if best is None or e < best['err']:
                (cx, w), (cy, h) = axis(rt, 'x'), axis(rt, 'y')
                keep = preserve_aspect(rt)
                if keep is None:
                    return None, f'{pid}: its Image was not read'
                if keep:  # Unity's Image fits the sprite inside the rect, about the pivot (centred unless the pivot is not)
                    s = min(w / img.width, h / img.height)
                    cx, w = cx + (0.5 - rt.m_Pivot.x) * (img.width * s - w), img.width * s
                    cy, h = cy + (0.5 - rt.m_Pivot.y) * (img.height * s - h), img.height * s
                best = {'x': round(cx, 3), 'y': round(cy, 3), 'w': round(w, 3), 'h': round(h, 3),
                        'box': [round(b[0] / img.width, 5), round(b[1] / img.height, 5), round(b[2] / img.width, 5), round(b[3] / img.height, 5)],
                        'err': round(e, 2)}
        if best and best['err'] <= MAX_ERR:
            return best, None
    if best is None:
        return None, 'no prefab, picture or undistorted match: ' + ', '.join(ids)
    return None, f"no match (error {best['err']})"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root')
    ap.add_argument('ab')
    ap.add_argument('--out', required=True)
    ap.add_argument('--only')
    a = ap.parse_args()
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    root, roots = Path(a.root), bundle_roots(a.ab)
    arts = sorted(wanted(root), key=lambda r: (r[1], r[0]))
    if a.only:
        arts = [r for r in arts if a.only in r[0]]
    if len(arts) > MAX_ARTS:
        raise SystemExit(f'{len(arts)} arts, over the cap of {MAX_ARTS}')
    t0, out, cache = time.time(), {}, {}
    for art, cid, ids in arts:
        if time.time() - t0 > MAX_S:
            raise SystemExit('over the time cap, nothing written')
        try:
            e, why = frame(root, roots, art, cid, ids, cache)
        except Exception as ex:  # one unreadable bundle must not lose the rest
            e, why = None, f'{type(ex).__name__}: {str(ex)[:80]}'
        if e:
            out[art.rsplit('/', 1)[1]] = e
        else:
            print(f'skip {art.rsplit("/", 1)[1]}: {why}', flush=True)
    txt = json.dumps(out, indent=0, sort_keys=True) + '\n'
    if len(txt) > MAX_BYTES:
        raise SystemExit('over the output cap, nothing written')
    Path(a.out).write_text(txt, encoding='utf-8', newline='\n')
    print(f'{len(out)} of {len(arts)} arts in {time.time() - t0:.0f} s')


if __name__ == '__main__':
    main()
