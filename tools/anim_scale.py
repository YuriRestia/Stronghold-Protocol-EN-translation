"""(fork) Every ability's clip-scale cap from the official client: `_maxAnimScale` (and its `_animKey`) of each ability
behaviour in our operators', backups' and tokens' prefabs → docs/research/15-attack-anim-scale.json (committed; tools/build-data.mjs
reads it into `attackAnim.maxScale`).

AbstractAnimatedAbility.UpdatePlaybackSpeed (GameAssembly, disassembled): animScale = attack time / clip length, at least
MIN_ANIM_SCALE 0.1 and, when `_maxAnimScale` ≥ 0, at most `_maxAnimScale` (under an animation slow-down also at most 2.5,
not modelled). The sim times an attack's strike by it (server/sim/ai.js allyCastWindup), the renderer its effects'
speed (render/spine.js abilitySpeed).

  .venv-extract/Scripts/python tools/anim_scale.py [--game <client>] [--out docs/research/15-attack-anim-scale.json]

Output: { "<unitId>": { "<node path under the prefab root>": [maxAnimScale, animKey, class] } }, sorted; only abilities
that carry the field.
"""
import argparse
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
# a maintainer tool, kept out of tools/local-extract/ (which ships to players) because it writes a research table; it
# borrows that folder's client reader
sys.path.insert(0, str(HERE / 'local-extract'))

from extract import locate_client  # noqa: E402
from fx import AssetEnv, scan_cabs  # noqa: E402

TOKEN_CACHE = ROOT / '.cache/fx/tokens.json'


def unit_ids():
    """Our units: every charId in chess / backups, every token id in tokens.json."""
    ids = set()
    for f in ('chess.json', 'backups.json'):
        ids |= set(re.findall(r'"(char_\d+_[a-z0-9]+)"', (ROOT / 'data' / f).read_text(encoding='utf-8')))
    ids |= set(json.loads((ROOT / 'data/tokens.json').read_text(encoding='utf-8')).keys())
    return sorted(ids)


def token_bundles():
    """token id → its bundle (the extractor's container cache, fx.py container_index)."""
    out = {}
    if TOKEN_CACHE.exists():
        for rel, v in json.loads(TOKEN_CACHE.read_text(encoding='utf-8')).items():
            for p in v.get('prefabs') or []:
                out.setdefault(p.lower(), rel)
    return out


def go_path(env, sf, go_obj):
    """(root name, 'A/B/C') of a GameObject: its prefab root and its path below it (as fx/index.json `node`)."""
    names = []
    go = go_obj
    for _ in range(64):
        d = env.tt(go)
        names.append(d.get('m_Name', ''))
        tr = None
        for c in d.get('m_Component') or []:
            f, o = env.resolve(sf, c.get('component') if isinstance(c, dict) else None)
            if o is not None and o.type.name in ('Transform', 'RectTransform'):
                tr = o
                break
        if tr is None:
            break
        father = env.tt(tr).get('m_Father')
        f, fo = env.resolve(sf, father)
        if fo is None:
            break
        f2, go = env.resolve(sf, env.tt(fo).get('m_GameObject'))
        if go is None:
            break
    names.reverse()
    return names[0], '/'.join(names[1:])


def scan_unit(ab_root, cabs, rel, root_name=None):
    env = AssetEnv(ab_root, cabs)
    out = {}
    for sf in env.load_rel(rel):
        for o in list(sf.objects.values()):
            if o.type.name != 'MonoBehaviour':
                continue
            try:
                d = env.tt(o)
            except Exception:
                continue
            if '_maxAnimScale' not in d:
                continue
            f, go = env.resolve(sf, d.get('m_GameObject'))
            root, path = go_path(env, sf, go) if go is not None else ('', '')
            if root_name and root.lower() != root_name.lower():
                continue
            out[path] = [round(float(d['_maxAnimScale']), 4), d.get('_animKey', ''), env.script(o)[1]]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--game', default=None)
    ap.add_argument('--out', default=str(ROOT / 'docs/research/15-attack-anim-scale.json'))
    ap.add_argument('--only', default='', help='comma-separated unit ids (a check run)')
    args = ap.parse_args()
    ab_root = Path(locate_client(args.game))
    cabs = scan_cabs(ab_root)
    toks = token_bundles()
    ids = [x for x in args.only.split(',') if x] or unit_ids()
    res, missing = {}, []
    for i, uid in enumerate(ids):
        rel = f'charpack/{uid}.ab' if uid.startswith('char_') else toks.get(uid.lower())
        if not rel or not (ab_root / rel).exists():
            missing.append(uid)
            continue
        try:
            got = scan_unit(ab_root, cabs, rel, None if uid.startswith('char_') else uid)
        except Exception as e:  # noqa: BLE001
            print(f'  {uid}: {e}', file=sys.stderr)
            missing.append(uid)
            continue
        # (a token bundle holds many tokens: scan_unit kept this token's own prefab)
        res[uid] = dict(sorted(got.items()))
        if (i + 1) % 25 == 0:
            print(f'  {i + 1}/{len(ids)}', flush=True)
    lines = [f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False, separators=(",", ":"))}' for k, v in sorted(res.items())]
    Path(args.out).write_text('{\n' + ',\n'.join(lines) + '\n}\n', encoding='utf-8', newline='\n')
    print(f'{len(res)} units, {sum(len(v) for v in res.values())} abilities; missing {len(missing)}: {" ".join(missing[:20])}')


if __name__ == '__main__':
    main()
