"""Missing art in the union of official versions. Stage first, publish only absent files.

The existing extractor decodes the local client; fetch-assets --offline --add-only builds the web manifest.
No network and no default-art replacement. Full illustrations/outfits remain cosmetic-plugin assets, as today.
"""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path


def publish(source, target):
    target = Path(target)
    if target.exists():
        return False
    target.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation also protects an asset another worktree just supplied.
    with target.open('xb') as dst, Path(source).open('rb') as src:
        shutil.copyfileobj(src, dst)
    return True


def export(ab_root, out_root, groups, log, root):
    import aklz4  # noqa: F401
    import UnityPy
    import operators
    from extract import export_enemy_spines

    root, out_root, ab_root = Path(root), Path(out_root), Path(ab_root)
    jobs = json.loads(subprocess.check_output(['node', str(root / 'tools/assets/versions.mjs'), str(root)], timeout=30))
    count = 0
    with tempfile.TemporaryDirectory(prefix='sp-version-art-') as tmp:
        stage, staged_groups = Path(tmp), {}
        chars, _ = operators.export(ab_root, stage, staged_groups, log, jobs['operators'])
        for cid, char in chars.items():
            for slot in ('avatar', 'avatarE2', 'portrait', 'portraitE2'):
                if char.get(slot):
                    src = stage / char[slot].removeprefix('/assets/local/')
                    kind = 'avatar' if slot.startswith('avatar') else 'portrait'
                    count += publish(src, out_root.parent / 'char' / kind / src.name)
            for face, model in char.get('spine', {}).items():
                for url in [model['skel'], model['atlas']] + model['textures']:
                    src = stage / url.removeprefix('/assets/local/')
                    count += publish(src, out_root.parent / 'spine/op' / cid / face / src.name)
        staged_groups = {}
        export_enemy_spines(ab_root, stage, staged_groups, log, jobs['enemies'])
        for group, files in staged_groups.items():
            for name in files:
                count += publish(stage / group / name, out_root / group / name)
            groups[group] = files
        # A bundle can hold many requested sprites; decode it only once.
        by_bundle = {}
        for job in jobs['sprites']:
            for pattern in job['bundles']:
                # Literal Unity bundle names contain brackets (not glob character classes).
                paths = ab_root.glob(pattern) if '*' in pattern else [ab_root / pattern]
                for bundle in paths:
                    if bundle.is_file():
                        by_bundle.setdefault(bundle, {})[job['name']] = job
        found = set()
        for bundle, wanted in sorted(by_bundle.items()):
            env = UnityPy.load(str(bundle))
            for obj in env.objects:
                if obj.type.name != 'Sprite':
                    continue
                sprite = obj.read()
                job = wanted.get(sprite.m_Name)
                if not job or job['path'] in found:
                    continue
                src = stage / 'sprite.png'
                sprite.image.save(src)
                count += publish(src, out_root.parent / job['path'])
                found.add(job['path'])
                log(f'{bundle.relative_to(ab_root)}: {sprite.m_Name} -> {job["path"]}')
        for job in jobs['sprites']:
            if job['path'] not in found:
                log(f'skip (not found) sprite {job["name"]}')
    return count
