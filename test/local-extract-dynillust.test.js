// (fork) tools/local-extract/dynillust.py — the dynamic illustrations' extractor (DESIGN §33.19). Original synthetic
// fixtures only; no game install, network or UnityPy is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fxFixture } from './helpers/fxFixtures.js';

const PY = ['python3', 'python'].find((bin) => spawnSync(bin, ['--version']).status === 0);

function py(code) {
  const source = `import sys,json\nsys.path.insert(0, ${JSON.stringify(path.resolve('tools/local-extract'))})\nimport dynillust as dy, extract as ex\n${code}`;
  const r = spawnSync(PY ?? 'python3', ['-B', '-c', source], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('skin ids follow the official dynIllustId naming: E2 art <charId>#n, outfits <charId>@<outfit>#n', () => {
  const got = py(`print(json.dumps([dy.skin_id(k) for k in ['char_1038_whitw2_2', 'char_1038_whitw2_sale#15', 'char_2025_shu_nlc#1', 'effect']]))`);
  assert.deepEqual(got, ['char_1038_whitw2#2', 'char_1038_whitw2@sale#15', 'char_2025_shu@nlc#1', null]);
});

test('skin ids keep the official letter case of the prefab name, not the lower-case bundle name', () => {
  const got = py(`k = 'char_172_svrash_ambiencesynesthesia#4'
print(json.dumps([dy.skin_id(dy.official_key(k, 'dyn_illust_char_172_svrash_ambienceSynesthesia#4')),
                  dy.skin_id(dy.official_key(k, 'sp_dyn_illust_char_172_svrash_ambienceSynesthesia#4')),
                  dy.skin_id(dy.official_key('char_1038_whitw2_2', 'dyn_illust_char_1038_whitw2_2')),
                  dy.skin_id_mismatches(['char_172_svrash@ambiencesynesthesia#4', 'char_172_svrash@ambienceSynesthesia#4',
                                         'char_172_svrash#2', None], {'char_172_svrash@ambienceSynesthesia#4'})]))`);
  assert.deepEqual(got, ['char_172_svrash@ambienceSynesthesia#4', 'char_172_svrash@ambiencesynesthesia#4',
    'char_1038_whitw2#2', ['char_172_svrash@ambiencesynesthesia#4']]);
});

// The extracted index (data/local-assets.json, or DYNILLUST_MANIFEST for an extraction kept elsewhere): every outfit
// illustration names an outfit of data/outfits.json exactly, and every other one is E2 art `<charId>#<n>`.
test('every extracted illustration skin id exists exactly in the outfit data', (t) => {
  const file = process.env.DYNILLUST_MANIFEST || 'data/local-assets.json';
  const group = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).groups?.dynillust : null;
  if (!group || !Object.keys(group).length) return t.skip(`no dynillust group in ${file}`);
  const outfits = JSON.parse(fs.readFileSync('data/outfits.json', 'utf8'));
  const bad = Object.entries(group).filter(([, g]) => (g.skinId.includes('@')
    ? !outfits[g.skinId] || outfits[g.skinId].charId !== g.charId : !new RegExp(`^${g.charId}#\\d+$`).test(g.skinId)))
    .map(([k, g]) => `${k}: ${g.skinId}`);
  assert.deepEqual(bad, []);
});

test('the skeleton version comes from the binary header or the JSON skeleton', () => {
  const got = py(`def s(x):
    b = x.encode()
    return bytes([len(b) + 1]) + b
print(json.dumps([dy.spine_version(s('hash') + s('3.8.99') + b'rest'), dy.spine_version(b'\\xef\\xbb\\xbf{"skeleton":{"spine":"3.8.99"}}'),
                  dy.spine_version(b'\\x00')]))`);
  assert.deepEqual(got, ['3.8.99', '3.8.99', null]);
});

test('the pools pick the illustrations; a hot update wins; named keys override the pools', (t) => {
  const f = fxFixture(t);
  f.put('data/chess.json', { chess_a: { charId: 'char_9001_aaa' }, chess_b: { charId: 'char_9001_aaa' } });
  f.put('data/backups.json', { units: { char_9002_bbb: {} } });
  for (const p of ['Game_Data/StreamingAssets/AB/Windows/arts/dynchars/char_9001_aaa_2.ab',
    'Game_Data/StreamingAssets/AB/Windows/arts/dynchars/char_9002_bbb_sale#1.ab',
    'Game_Data/StreamingAssets/AB/Windows/arts/dynchars/char_9003_ccc_2.ab',
    'Game_Data/StreamingAssets/AB/Windows/arts/dynchars/effect.ab',
    'Game_Data/PersistentData/Bundles/arts/dynchars/char_9001_aaa_2.ab']) f.put(p, Buffer.from('x'));
  const got = py(`from pathlib import Path
root = Path(${JSON.stringify(f.root)})
ab = root / 'Game_Data/StreamingAssets/AB/Windows'
roots = dy.bundle_roots(ab)
pool = dy.find_bundles(roots, dy.pool_chars(root))
named = dy.find_bundles(roots, set(), {'char_9003_ccc_2'})
print(json.dumps([sorted(dy.pool_chars(root)), [r.relative_to(root).as_posix() for r in roots],
                  {k: v.relative_to(root).as_posix() for k, v in pool.items()}, list(named)]))`);
  assert.deepEqual(got[0], ['char_9001_aaa', 'char_9002_bbb']);
  assert.deepEqual(got[1], ['Game_Data/PersistentData/Bundles', 'Game_Data/StreamingAssets/AB/Windows']);
  assert.deepEqual(got[2], {
    char_9001_aaa_2: 'Game_Data/PersistentData/Bundles/arts/dynchars/char_9001_aaa_2.ab',
    'char_9002_bbb_sale#1': 'Game_Data/StreamingAssets/AB/Windows/arts/dynchars/char_9002_bbb_sale#1.ab',
  });
  assert.deepEqual(got[3], ['char_9003_ccc_2']);
});

test('writes are capped: the run budget and the per-file cap stop with CapError; files carry the asset hash', (t) => {
  const f = fxFixture(t);
  const got = py(`import time, hashlib
from pathlib import Path
out = []
w = dy.Writer(Path(${JSON.stringify(f.root)}) / 'a', dy.Budget(10, time.time() + 60))
w.put('x.bin', b'12345')
out.append(w.files['x.bin'] == {'hash': hashlib.sha256(b'12345').hexdigest()[:16], 'bytes': 5})
try:
    w.put('y.bin', b'123456')
    out.append('no cap')
except dy.CapError as e:
    out.append('size cap' in str(e))
try:
    dy.Writer(Path(${JSON.stringify(f.root)}) / 'b', dy.Budget(1, time.time() - 1)).put('z.bin', b'')
    out.append('no cap')
except dy.CapError as e:
    out.append('time cap' in str(e))
dy.PAGE_MAX_MB = 0
try:
    dy.Writer(Path(${JSON.stringify(f.root)}) / 'c', dy.Budget(10, time.time() + 60)).put('p.webp', b'1')
    out.append('no cap')
except dy.CapError as e:
    out.append('file cap' in str(e))
print(json.dumps(out))`);
  assert.deepEqual(got, [true, true, true, true]);
});

test('dynillust is opt-in: --only dynillust runs it, a plain run keeps its manifest group, a keyed run merges', (t) => {
  const f = fxFixture(t);
  f.put('ui/autochess/.keep', Buffer.from(''));
  f.put('m.json', { version: 1, source: 'local-client', count: 2,
    groups: { dynillust: { a_1: { path: '/assets/local/dynillust/a_1/illust.json' }, b_2: { path: '/old' } }, 'ui/x': { y: { path: '/y' } } } });
  const got = py(`from pathlib import Path
import contextlib, io, shutil
root = Path(${JSON.stringify(f.root)})
for name in ('export_bundle', 'export_enemy_spines', 'export_token_spines', 'export_scenes'):
    setattr(ex, name, lambda *a, **k: 0)
ex.versions.export = lambda *a, **k: 0
ex.fx.export_fx = lambda *a, **k: 0
calls = []
def fake(ab, out, manifest, log, root_, helpers, keys=None, **k):
    calls.append(keys)
    manifest['dynillust'] = {'b_2': {'path': '/new'}}
    return 1
ex.dynillust.export_dynillust = fake
res = []
for flags in ([], ['--only', 'dynillust', '--dyn-keys', 'b_2']):
    calls.clear()
    m = root / 'm.json'
    sys.argv = ['extract.py', '--game', str(root), '--out', str(root / 'out'), '--manifest', str(m), *flags]
    with contextlib.redirect_stdout(io.StringIO()): ex.main()
    res.append([list(calls), json.loads(m.read_text(encoding='utf-8'))['groups'].get('dynillust')])
print(json.dumps([res, ex.dyn_selected(['dynillust']), ex.dyn_selected(['fx']), ex.dyn_selected([])]))`);
  const [[plain, keyed], on, fxOnly, none] = got;
  assert.deepEqual(plain[0], []);
  assert.deepEqual(plain[1], { a_1: { path: '/assets/local/dynillust/a_1/illust.json' }, b_2: { path: '/old' } });
  assert.deepEqual(keyed[0], [['b_2']]);
  assert.deepEqual(keyed[1], { a_1: { path: '/assets/local/dynillust/a_1/illust.json' }, b_2: { path: '/new' } });
  assert.deepEqual([on, fxOnly, none], [true, false, false]);
});

const HAS_PIL = !!PY && spawnSync(PY, ['-c', 'import PIL'], { encoding: 'utf8' }).status === 0;

test('half pages: the premultiplied 2 × 2 mean — premultiplied pages per channel, straight pages via premultiply',
  { skip: !HAS_PIL && 'Pillow is not installed for this Python (tools/local-extract/requirements.txt)' }, () => {
  // one opaque white texel beside three transparent black ones: a premultiplied page halves to an even grey with the
  // same alpha (rgb ≤ a); a straight page keeps white colour at a quarter alpha. The old path premultiplied twice and
  // gave the premultiplied page white at a quarter alpha (the half tier's pale fringes).
  const got = py(`from PIL import Image
im = Image.new('RGBA', (2, 2), (0, 0, 0, 0)); im.putpixel((0, 0), (255, 255, 255, 255))
bled = Image.new('RGBA', (2, 2), (200, 100, 50, 0))
print(json.dumps([dy.half_page(im, False).getpixel((0, 0)), dy.half_page(im, True).getpixel((0, 0)), dy.half_page(Image.new('RGBA', (5, 3)), False).size,
                  dy.half_page(bled, True).getpixel((0, 0))]))`);
  const [pma, straight, odd, bled] = got;
  // a straight page's colour bled into transparent texels survives the halving (bilinear sampling reads it at edges)
  assert.deepEqual(bled, [200, 100, 50, 0]);
  assert.ok(Math.max(...pma.slice(0, 3)) <= pma[3], `premultiplied half keeps rgb <= a: ${pma}`);
  assert.ok(Math.abs(pma[3] - 64) <= 1, `alpha is the mean: ${pma}`);
  assert.deepEqual(straight.slice(0, 3), [255, 255, 255]);
  assert.ok(Math.abs(straight[3] - 64) <= 1, `straight alpha is the mean: ${straight}`);
  assert.deepEqual(odd, [2, 1]);
});

test('load groups: nodes gate with the nearest action switch; files take the earliest group that uses them', () => {
  // node 0 root (always on), 1 an IDLE particle set, 2 a SPECIAL_IDLE set with child 3, 4 switched on by an Animator
  // clip in the state OnInteract reaches, 5 under 4; textures: a (node 1 and node 3), b (node 3 only), c (node 5), d (unused)
  const got = py(`nodes = [{'id': 0, 'parent': None, 'children': [1, 2, 4]}, {'id': 1, 'parent': 0, 'meshRenderer': {'materials': [0]}},
         {'id': 2, 'parent': 0}, {'id': 3, 'parent': 2, 'meshRenderer': {'materials': [1]}},
         {'id': 4, 'parent': 0}, {'id': 5, 'parent': 4, 'meshFilter': 'm1', 'meshRenderer': {'materials': [2]}}]
mats = [{'textures': {'_MainTex': {'tex': 'a'}}}, {'textures': {'_MainTex': {'tex': 'a'}, '_Mask': {'tex': 'b'}}}, {'textures': {'_MainTex': {'tex': 'c'}}}]
clips = [{'curves': []}, {'curves': [{'node': 4, 'type': 'GameObject', 'property': 'm_IsActive', 'keys': [[0, 1, 0, 0]]}]}]
anim = {'layers': [{'defaultState': 0, 'anyState': [], 'states': [
  {'clip': 0, 'transitions': [{'to': 1, 'conditions': [{'param': 'OnInteract'}]}]}, {'clip': 1, 'transitions': []}]}]}
parts = [{'action': 'IDLE', 'node': 1}, {'action': 'SPECIAL_IDLE', 'node': 2}]
files = {'tex/a.webp': {'bytes': 10}, 'tex/b.webp': {'bytes': 20}, 'tex/c.webp': {'bytes': 40}, 'tex/d.webp': {'bytes': 80},
         'mesh/m1.json': {'bytes': 5}, 's.skel': {'bytes': 1}, 's.atlas': {'bytes': 1}, 'fx.json': {'bytes': 1}, 'p/x.webp': {'bytes': 100}, 'p/half/x.webp': {'bytes': 30}}
tex = {k: {'file': f'tex/{k}.webp', 'half': None} for k in 'abcd'}
L = dy.load_groups(nodes, mats, clips, parts, [anim], files, tex, {'m1': {'file': 'mesh/m1.json'}},
                   {'skeleton': 's.skel', 'atlas': 's.atlas', 'pages': [{'file': 'p/x.webp', 'half': 'p/half/x.webp'}]})
print(json.dumps(L))`);
  assert.deepEqual(got.nodes, ['IDLE', 'IDLE', 'SPECIAL_IDLE', 'SPECIAL_IDLE', 'INTERACTION', 'INTERACTION']);
  assert.deepEqual(got.textures, { a: 'IDLE', b: 'SPECIAL_IDLE', c: 'INTERACTION', d: 'IDLE' });
  assert.deepEqual(got.meshes, { m1: 'INTERACTION' });
  assert.deepEqual(got.bytes.IDLE, { full: 90, half: 90 });
  assert.deepEqual(got.firstLoad, { full: 193, half: 123 });
  assert.deepEqual(got.cardNever, ['START', 'INTERACTION']);
});

test('--print-jobs lists dynillust as an opt-in set with its index version', () => {
  const r = spawnSync(PY ?? 'python3', ['-B', 'tools/local-extract/extract.py', '--print-jobs'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const jobs = JSON.parse(r.stdout);
  assert.deepEqual(jobs.dynillust, { sub: 'dynillust', version: 1, optIn: true });
  assert.ok(!jobs.expectedGroups.includes('dynillust'), 'a plain extract does not expect the opt-in group');
});
