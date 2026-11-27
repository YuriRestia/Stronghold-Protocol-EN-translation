"""(fork) The official home backgrounds behind the animated illustrations on a co-op room's wide cards.

The official home screen shows an illustration over the player's chosen home background (display_meta_table
homeBackgroundData); a wide room card is wider than the official card an illustration is drawn for, so a scene can end
inside it, and the card shows one of those backgrounds behind it (the user's picks of 2026-11-23:
data/dyn-card-background.json, written by tools/dyn-card-background.mjs; docs/design/client.md §10).

Read (relative to the AB root; a hot update under Arknights_Data/PersistentData/Bundles wins):
  arts/ui/homebackground/wrapper/<bgId>.ab   the background's picture as two Sprites, <bgId>_left and <bgId>_right
                                             (910 x 1024 each, side by side), beside its particle effects
Written:
  homebg/<bgId>.webp                         the two halves joined, then cover-scaled to 1280 x 720 (lossy WebP q80): a
                                             still filler, no effects (the user, 2026-11-23: "just get the still image,
                                             no need effects ... you can even use a low resolution version")
  manifest group `homebg`: bgId -> { path, w, h, kind: 'HomeBg', webp: 'lossy' } (a WebP-only folder, no PNG beside it:
                                             extract.py DIRECT_WEBP lists it)
Only the backgrounds data/dyn-card-background.json uses. Caps: 40 files, 40 MB written, 10 min; over a cap the run
deletes what it wrote this run and stops with an error.
"""
import io
import json
import time
from pathlib import Path

from dynillust import bundle_roots  # the hot-update root first, as the illustrations

HOMEBG_SUB = 'homebg'
HOMEBG_SIZE = (1280, 720)       # the user's "low resolution" still: a wide card is drawn at most ~1,100 px wide at 4K
HOMEBG_QUALITY = 80
HOMEBG_MAX_FILES = 40
HOMEBG_MAX_BYTES = 40 * 1024 * 1024
HOMEBG_MAX_S = 600


def wanted(root):
    """The background ids data/dyn-card-background.json uses (sorted), [] without the file."""
    try:
        j = json.loads((Path(root) / 'data' / 'dyn-card-background.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return []
    return sorted((j.get('backgrounds') or {}).keys())


def cover(img, size):
    """`img` scaled to cover `size` (the centre kept), as CSS background-size: cover."""
    from PIL import Image
    w, h = img.size
    tw, th = size
    k = max(tw / w, th / h)
    rw, rh = max(tw, round(w * k)), max(th, round(h * k))
    img = img.resize((rw, rh), Image.LANCZOS)
    left, top = (rw - tw) // 2, (rh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def picture(path, bg_id):
    """The background's picture from its bundle: the <bgId>_left and _right Sprites side by side (RGB), or None."""
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    from PIL import Image
    env = UnityPy.load(str(path))
    halves = {}
    for obj in env.objects:
        if obj.type.name != 'Sprite':
            continue
        data = obj.read()
        name = getattr(data, 'm_Name', '') or ''
        if name in (f'{bg_id}_left', f'{bg_id}_right'):
            halves[name.rsplit('_', 1)[1]] = data.image.convert('RGB')
    if set(halves) != {'left', 'right'}:
        return None
    left, right = halves['left'], halves['right']
    out = Image.new('RGB', (left.width + right.width, max(left.height, right.height)))
    out.paste(left, (0, 0))
    out.paste(right, (left.width, 0))
    return out


def export_homebg(ab_root, out_root, manifest, log, root, ids=None):
    """Writes homebg/<bgId>.webp for each wanted background; returns the number of files written."""
    ids = sorted(ids) if ids is not None else wanted(root)
    if not ids:
        log('homebg: no backgrounds wanted (data/dyn-card-background.json)')
        return 0
    if len(ids) > HOMEBG_MAX_FILES:
        raise RuntimeError(f'homebg: {len(ids)} backgrounds, over the cap of {HOMEBG_MAX_FILES}')
    roots = bundle_roots(ab_root)
    out_dir = Path(out_root) / HOMEBG_SUB
    out_dir.mkdir(parents=True, exist_ok=True)
    t0, total, written = time.time(), 0, []
    try:
        for bg_id in ids:
            rel = f'arts/ui/homebackground/wrapper/{bg_id}.ab'
            src = next((r / rel for r in roots if (r / rel).exists()), None)
            if src is None:
                log(f'homebg: skip (missing) {rel}')
                continue
            img = picture(src, bg_id)
            if img is None:
                log(f'homebg: skip {bg_id}: no _left / _right Sprites')
                continue
            buf = io.BytesIO()
            cover(img, HOMEBG_SIZE).save(buf, 'WEBP', quality=HOMEBG_QUALITY, method=6)
            data = buf.getvalue()
            total += len(data)
            if total > HOMEBG_MAX_BYTES or time.time() - t0 > HOMEBG_MAX_S:
                raise RuntimeError(f'homebg: over the cap ({total} B, {time.time() - t0:.0f} s)')
            fname = f'{bg_id}.webp'
            (out_dir / fname).write_bytes(data)
            written.append(out_dir / fname)
            manifest.setdefault(HOMEBG_SUB, {})[bg_id] = {
                'path': f'/assets/local/{HOMEBG_SUB}/{fname}', 'w': HOMEBG_SIZE[0], 'h': HOMEBG_SIZE[1], 'kind': 'HomeBg',
                'webp': 'lossy'}
            log(f'homebg: {bg_id} {len(data)} B')
    except Exception:
        for f in written:
            try:
                f.unlink()
            except OSError:
                pass
        manifest.pop(HOMEBG_SUB, None)
        raise
    log(f'homebg: {len(written)} backgrounds, {total} B')
    return len(written)
