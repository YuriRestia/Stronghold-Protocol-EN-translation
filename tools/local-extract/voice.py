#!/usr/bin/env python3
"""Fill the English / Korean voice lines the public mirror lacks from a locally installed client (optional, host-side).

data/assets.json audio.voiceEn / audio.voiceKr are downloaded from ArknightsAssets2 `voice_en/` / `voice_kr/`, a dump
of the CN client. The CN client gets an English or Korean dub only some time after the EN server releases it, so a
voice set the EN server already plays can be missing there (寻翼之歌 char_1041_angel2_iteration#6 on 2026-11-09: the
EN client had it, the mirror had no folder). This script reads those lines from a local client's voice bundles
(audio/sound_beta_2/voice_en|voice_kr/<set>.ab, hot updates under Arknights_Data/PersistentData/Bundles first) and
writes them where tools/fetch-assets.mjs would have put the download, as the same kind of file the mirror serves
(mp3, mono, 44.1 kHz, 64 kbit/s):

    public/assets/audio/voice/en/<set dir>/cn_019.mp3

Only lines of a set missing from the tree are written; a file already on disk is never touched. Afterwards
`node tools/fetch-assets.mjs --add-only` lists them (a leaf whose file is on disk stays, whether or not the mirror has
it). The client of the dub's own server is the right one: the EN client for en, and it carries kr too.

Usage:
  .venv-extract/Scripts/python.exe -I -B tools/local-extract/voice.py --game <EN install dir or AB root>
      [--lang en --lang kr] [--manifest data/assets.json] [--assets public/assets] [--dry-run]
Needs UnityPy (tools/local-extract/requirements.txt) and ffmpeg on PATH.
"""
import argparse
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
ROOT = Path(__file__).resolve().parents[2]

# dub → (manifest tree, bundle folder under audio/sound_beta_2): tools/assets/audio.mjs VOICE_DIRS
DUBS = {'en': ('voiceEn', 'voice_en'), 'kr': ('voiceKr', 'voice_kr')}
# the bundle roots of an install, newest first (a hot update replaces the shipped bundle)
BUNDLE_ROOTS = (('Arknights_Data', 'PersistentData', 'Bundles'), ('Arknights_Data', 'StreamingAssets', 'AB', 'Windows'))
LINE = re.compile(r'^/assets/audio/voice/[a-z]+/([^/]+)/(cn_\d+)\.mp3$')


def bundle_roots(game):
    game = Path(game)
    if (game / 'audio' / 'sound_beta_2').is_dir():
        return [game]
    return [game.joinpath(*tail) for tail in BUNDLE_ROOTS if game.joinpath(*tail, 'audio', 'sound_beta_2').is_dir()]


def find_bundle(roots, folder, set_key):
    for root in roots:
        p = root / 'audio' / 'sound_beta_2' / folder / f'{set_key}.ab'
        if p.is_file():
            return p
    return None


def lines_of(slots):
    """{slot: path | [paths]} → [(dir, stem)] of the primary tree's lines."""
    out = []
    for v in slots.values():
        for path in (v if isinstance(v, list) else [v]):
            m = LINE.match(path) if isinstance(path, str) else None
            if m:
                out.append((m.group(1), m.group(2)))
    return out


def clips_of(bundle):
    import aklz4  # noqa: F401  (registers the LZ4AK decoder)
    import UnityPy
    out = {}
    for obj in UnityPy.load(str(bundle)).objects:
        if obj.type.name != 'AudioClip':
            continue
        clip = obj.read()
        name = (getattr(clip, 'm_Name', None) or getattr(clip, 'name', '')).lower()
        samples = clip.samples
        if samples:
            out[name] = next(iter(samples.values()))
    return out


def to_mp3(wav, dest, ffmpeg):
    dest.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / 'line.wav'
        src.write_bytes(wav)
        part = dest.with_suffix('.mp3.part')
        subprocess.run([ffmpeg, '-v', 'error', '-y', '-i', str(src), '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame',
                        '-b:a', '64k', '-f', 'mp3', str(part)], check=True)
        part.replace(dest)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--game', required=True, help='install directory of the client (EN for en / kr) or its AB root')
    ap.add_argument('--lang', action='append', choices=sorted(DUBS), help='dub(s) to fill (default: en and kr)')
    ap.add_argument('--manifest', default=str(ROOT / 'data' / 'assets.json'))
    ap.add_argument('--assets', default=str(ROOT / 'public' / 'assets'))
    ap.add_argument('--dry-run', action='store_true', help='list what would be written')
    a = ap.parse_args()
    roots = bundle_roots(a.game)
    if not roots:
        sys.exit(f'no audio/sound_beta_2 bundles under {a.game}')
    ffmpeg = shutil.which('ffmpeg')
    if not ffmpeg and not a.dry_run:
        sys.exit('ffmpeg not found on PATH')
    audio = json.loads(Path(a.manifest).read_text(encoding='utf-8'))['audio']
    assets = Path(a.assets)
    written = absent = kept = 0
    for lang in a.lang or sorted(DUBS):
        tree, folder = DUBS[lang]
        have = audio.get(tree) or {}
        for set_key, slots in sorted(audio.get('voice', {}).items()):
            if set_key in have:
                continue
            want = lines_of(slots)
            bundle = find_bundle(roots, folder, set_key)
            if bundle is None:
                print(f'{lang} {set_key}: not in this client')
                absent += 1
                continue
            clips = None
            n = 0
            for d, stem in want:
                dest = assets / 'audio' / 'voice' / lang / d / f'{stem}.mp3'
                if dest.exists():
                    kept += 1
                    continue
                if a.dry_run:
                    n += 1
                    continue
                clips = clips if clips is not None else clips_of(bundle)
                wav = clips.get(stem)
                if wav is None:
                    print(f'{lang} {set_key}: {stem} not in {bundle.name}')
                    continue
                to_mp3(wav, dest, ffmpeg)
                n += 1
            written += n
            print(f'{lang} {set_key}: {n} line(s) {"to write" if a.dry_run else "written"} from {bundle}')
    print(f'done: {written} {"to write" if a.dry_run else "written"}, {kept} already on disk, {absent} set(s) not in this client')


if __name__ == '__main__':
    main()
