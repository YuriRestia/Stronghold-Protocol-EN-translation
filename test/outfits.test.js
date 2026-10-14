// Outfits (fork feature, docs/OUTFITS.md): the data build, the shared choice rules, the manifest helpers, the WebP
// conversion of the artwork and the outfit voice sets. The lobby / client side is test/outfits-sync.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildOutfits, layoutsFromTree, modelDir, formatOutfits, outfitRoster, OUTFIT_ID_RE } from '../tools/build-outfits.mjs';
import { cleanOutfits, isOutfitMap, isOutfitOf, serializeOutfits, parseOutfitsImport, MAX_OUTFITS } from '../shared/outfits.js';
import { outfitRec, spineEntry, hasBackSpine, unitPictureUrl, outfitArtUrl, defaultArtUrl } from '../public/js/assets.js';
import { chessAvatarUrl, chessPortraitUrl, setOutfitPicker } from '../public/js/ui/assetUrls.js';
import { Downloader, convertImage } from '../tools/assets/downloader.mjs';
import { isWebp, kindOf, validate } from '../tools/assets/formats.mjs';
import { indexVoice } from '../tools/assets/audio.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(readFileSync(path.join(ROOT, rel), 'utf8'));

// ---- tools/build-outfits.mjs ---------------------------------------------------------------------------------------

const SKINS = {
  charSkins: {
    char_1_a: { skinId: 'char_1_a', charId: 'char_1_a', battleSkin: { skinOrPrefabId: 'DefaultSkin' } },
    'char_1_a@epoque#3': {
      skinId: 'char_1_a@epoque#3', charId: 'char_1_a', avatarId: 'char_1_a_epoque#3', portraitId: 'char_1_a_epoque#3',
      battleSkin: { skinOrPrefabId: 'char_1_a_epoque#3' }, voiceId: 'char_1_a_epoque#3',
      tokenSkinMap: [{ tokenId: 'token_1_a_drone', tokenSkinId: 'token_1_a_drone_epoque#3' }, { tokenId: 'token_9_other', tokenSkinId: 'token_9_other_x#1' }],
      displaySkin: { skinName: '远路', skinGroupName: '时代/III' },
    },
    'char_1_a@boc#1': { skinId: 'char_1_a@boc#1', charId: 'char_1_a', avatarId: 'char_1_a_boc#1', portraitId: 'char_1_a_boc#1', battleSkin: { skinOrPrefabId: null }, displaySkin: { skinName: '无模型' } },
    'char_2_b@winter#1': { skinId: 'char_2_b@winter#1', charId: 'char_2_b', avatarId: 'char_2_b_winter#1', portraitId: 'char_2_b_winter#1', battleSkin: { skinOrPrefabId: 'char_2_b_winter#1' }, displaySkin: { skinName: '报童' } },
    'char_9_z@x#1': { skinId: 'char_9_z@x#1', charId: 'char_9_z', battleSkin: { skinOrPrefabId: 'char_9_z_x#1' }, displaySkin: { skinName: '不在名单' } },
  },
};
const CHESS = { c1: { charId: 'char_2_b' }, c2: { charId: 'char_1_a' } };

test('outfitRoster: the chess pool\'s operators and the 自选编队 ones, once each, sorted', () => {
  assert.deepEqual(outfitRoster(CHESS), ['char_1_a', 'char_2_b']);
  assert.deepEqual(outfitRoster(CHESS, { diy: { operators: { char_9_z: {}, char_1_a: {} } } }), ['char_1_a', 'char_2_b', 'char_9_z']);
  assert.deepEqual(outfitRoster({ t: { charId: 'token_1' } }, null), [], 'only operators');
  // a 自选编队 operator's outfits are built like a roster one's
  const { doc } = buildOutfits({ skins: SKINS, chess: CHESS, backups: { diy: { operators: { char_9_z: {} } } } });
  assert.ok(doc['char_9_z@x#1'], 'the 自选编队 operator\'s outfit');
});

test('build-outfits: the roster\'s outfits with a battle model, sorted by operator then table order; summons the game fields only', () => {
  const layouts = layoutsFromTree([
    'char_1_a/char_1_a_epoque_3/Front/x.skel', 'char_1_a/char_1_a_epoque_3/Back/x.skel',
    'char_2_b/char_2_b_winter_1/Spine/x.skel',
  ]);
  const { doc, warnings } = buildOutfits({ skins: SKINS, chess: CHESS, tokens: { token_1_a_drone: {} }, layoutOf: layouts });
  assert.deepEqual(Object.keys(doc), ['char_1_a@epoque#3', 'char_2_b@winter#1'], 'the default looks, a model-less outfit and a non-roster operator are left out');
  assert.deepEqual(doc['char_1_a@epoque#3'], {
    id: 'char_1_a@epoque#3', charId: 'char_1_a', name: '远路', series: '时代/III', model: 'char_1_a_epoque#3',
    avatar: 'char_1_a_epoque#3', portrait: 'char_1_a_epoque#3', voice: 'char_1_a_epoque#3',
    tokens: { token_1_a_drone: 'token_1_a_drone_epoque#3' }, layout: 'fb',
  });
  assert.equal(doc['char_2_b@winter#1'].layout, 'single');
  assert.equal(doc['char_2_b@winter#1'].voice, null);
  assert.ok(warnings.some((w) => w.includes('char_1_a@boc#1')), 'the model-less outfit is reported');
  // one record per line, stable
  const text = formatOutfits(doc);
  assert.equal(text.split('\n').length, 5);
  assert.deepEqual(JSON.parse(text), doc);
});

test('build-outfits: layouts from fexli\'s folders (Front+Back, Front only, one Spine model, unknown)', () => {
  const of = layoutsFromTree(['c/m_1/Front/a', 'c/m_1/Back/a', 'c/m_2/Front/a', 'c/m_3/Spine/a', 'c/m_4/Other/a', 'short']);
  assert.equal(of('c', 'm#1'), 'fb');
  assert.equal(of('c', 'm#2'), 'front');
  assert.equal(of('c', 'm#3'), 'single');
  assert.equal(of('c', 'm#4'), null);
  assert.equal(of('c', 'm#9'), null);
  assert.equal(modelDir('char_4064_mlynar_epoque#28'), 'char_4064_mlynar_epoque_28');
});

test('data/outfits.json: every record is an outfit of a roster or 自选编队 operator, with a model and a known layout', () => {
  const doc = readJson('data/outfits.json');
  const roster = new Set(outfitRoster(readJson('data/chess.json'), readJson('data/backups.json')));
  const recs = Object.values(doc);
  assert.ok(recs.length >= 270, `${recs.length} outfits`);
  for (const r of recs) {
    assert.match(r.id, OUTFIT_ID_RE, r.id);
    assert.ok(r.id.startsWith(`${r.charId}@`), r.id);
    assert.ok(roster.has(r.charId), `${r.id}: a roster or 自选编队 operator`);
    assert.ok(typeof r.model === 'string' && r.model.length, `${r.id}: model`);
    assert.ok(['fb', 'front', 'single'].includes(r.layout), `${r.id}: layout ${r.layout}`);
    assert.ok(r.tokens && typeof r.tokens === 'object');
  }
  // the outfits checked by hand on 2026-10-11 (fexli): front-only and single-model ones
  assert.equal(doc['char_291_aglina@boc#1'].layout, 'front');
  assert.equal(doc['char_1012_skadi2@iteration#2'].layout, 'single');
  // a 自选编队 operator (Kal'tsit, backups.json diy.operators; not in the chess pool) has its outfits too (2026-10-12)
  assert.ok(recs.some((r) => r.charId === 'char_003_kalts'), 'Kal\'tsit\'s outfits');
  assert.equal(doc['char_4064_mlynar@epoque#28'].voice, 'char_4064_mlynar_epoque#28');
});

// ---- shared/outfits.js ---------------------------------------------------------------------------------------------

test('shared/outfits: a choice is { charId: own outfit }, cleaned, capped; the C2S check and the import envelope', () => {
  assert.ok(isOutfitOf('char_1_a', 'char_1_a@epoque#3'));
  assert.ok(!isOutfitOf('char_1_a', 'char_2_b@epoque#3'), 'another operator\'s outfit');
  assert.ok(!isOutfitOf('char_1_a', 'char_1_a'), 'the default look is no outfit');
  assert.ok(!isOutfitOf('constructor', 'x@y#1'));
  const dirty = { char_2_b: 'char_2_b@winter#1', char_1_a: 'char_2_b@winter#1', __proto__x: 1, char_3_c: 'char_3_c@x#1' };
  assert.deepEqual(cleanOutfits(dirty), { char_2_b: 'char_2_b@winter#1', char_3_c: 'char_3_c@x#1' });
  assert.deepEqual(cleanOutfits(dirty, { 'char_2_b@winter#1': {} }), { char_2_b: 'char_2_b@winter#1' }, 'unknown outfits dropped');
  assert.deepEqual(cleanOutfits(dirty, new Set(['char_3_c@x#1'])), { char_3_c: 'char_3_c@x#1' });
  assert.deepEqual(cleanOutfits(null), {});
  assert.deepEqual(cleanOutfits(['a']), {});
  assert.ok(isOutfitMap({}));
  assert.ok(isOutfitMap({ char_1_a: 'char_1_a@b#1' }));
  assert.ok(!isOutfitMap({ char_1_a: 'char_2_b@b#1' }));
  assert.ok(!isOutfitMap([]) && !isOutfitMap(null) && !isOutfitMap('x'));
  const big = {};
  for (let i = 0; i <= MAX_OUTFITS; i++) big[`char_${i}_a`] = `char_${i}_a@b#1`;
  assert.ok(!isOutfitMap(big), 'over the cap');
  assert.equal(Object.keys(cleanOutfits(big)).length, MAX_OUTFITS);
  // export → import round trip; refusals
  const text = serializeOutfits({ char_2_b: 'char_2_b@winter#1' });
  assert.deepEqual(parseOutfitsImport(text), { ok: true, outfits: { char_2_b: 'char_2_b@winter#1' }, asked: 1 });
  assert.equal(parseOutfitsImport('').ok, false);
  assert.equal(parseOutfitsImport('{nope').ok, false);
  assert.equal(parseOutfitsImport(JSON.stringify({ v: 99, outfits: {} })).error, '这份数据来自更新的版本（v{v}），请先更新游戏');
  assert.equal(parseOutfitsImport(JSON.stringify({ v: 1, kind: 'diy', picks: {} })).error, '这不是时装的数据');
  assert.equal(parseOutfitsImport(JSON.stringify({ v: 1, kind: 'outfits' })).error, '里面没有时装的数据');
  assert.equal(parseOutfitsImport('x'.repeat(70000)).ok, false, 'too long');
});

// ---- the manifest (public/js/assets.js, ui/assetUrls.js) -----------------------------------------------------------

const SP = (n) => ({ skel: `/assets/${n}.skel`, atlas: `/assets/${n}.atlas`, textures: [`/assets/${n}.png`], anims: { idle: 'Idle' } });
const M = {
  chars: { char_1_a: { avatar: '/a/base.png', avatarE2: '/a/e2.png', portrait: '/p/base.png', portraitE2: '/p/e2.png', spine: { front: SP('base_f'), back: SP('base_b') } } },
  tokens: { token_1_a_drone: { avatar: '/t/drone.png', spine: SP('drone') } },
  outfits: {
    chars: {
      'char_1_a@epoque#3': { avatar: '/o/av.png', portrait: '/o/po.png', art: '/o/art.webp', spine: { front: SP('of_f'), back: SP('of_b') } },
      'char_1_a@boc#1': { avatar: '/o/av2.png', portrait: '/o/po2.png', spine: { front: SP('of2_f') } },
    },
    tokens: { 'token_1_a_drone_epoque#3': { token: 'token_1_a_drone', avatar: '/o/drone.png', spine: SP('of_drone') } },
    defaults: { char_1_a: { art: '/o/char_1_a_default.webp' } },
  },
};

test('assets.js: an outfit id resolves its own model / picture; a front-only outfit has no Back; the default look is untouched', () => {
  assert.equal(outfitRec(M, 'char_1_a'), null, 'a charId is no outfit');
  assert.equal(spineEntry(M, 'char_1_a@epoque#3').skel, '/assets/of_f.skel');
  assert.equal(spineEntry(M, 'char_1_a@epoque#3', { back: true }).skel, '/assets/of_b.skel');
  assert.equal(spineEntry(M, 'char_1_a@boc#1', { back: true }).skel, '/assets/of2_f.skel', 'front-only: Front facing away too');
  assert.equal(hasBackSpine(M, 'char_1_a@epoque#3'), true);
  assert.equal(hasBackSpine(M, 'char_1_a@boc#1'), false);
  assert.equal(spineEntry(M, 'token_1_a_drone_epoque#3').skel, '/assets/of_drone.skel', 'a summon look: one model');
  assert.equal(hasBackSpine(M, 'token_1_a_drone_epoque#3'), false);
  assert.equal(spineEntry(M, 'char_1_a@nope#1'), null, 'an outfit the manifest lacks: no model (the view keeps its own)');
  assert.equal(unitPictureUrl(M, 'char_1_a@epoque#3'), '/o/av.png');
  assert.equal(unitPictureUrl(M, 'token_1_a_drone_epoque#3'), '/o/drone.png');
  assert.equal(spineEntry(M, 'char_1_a').skel, '/assets/base_f.skel');
  assert.equal(unitPictureUrl(M, 'char_1_a'), '/a/base.png');
  assert.equal(outfitArtUrl(M, 'char_1_a@epoque#3', 'art'), '/o/art.webp');
  assert.equal(outfitArtUrl(M, 'char_1_a@boc#1', 'art'), null);
  assert.equal(defaultArtUrl(M, 'char_1_a'), '/o/char_1_a_default.webp');
  assert.equal(defaultArtUrl(M, 'char_9_z'), null);
});

test('assetUrls: an outfit replaces the avatar / portrait, the elite (E2) art too; without one the art is unchanged', () => {
  const base = { charId: 'char_1_a', assets: { avatar: 'char_1_a', portrait: 'char_1_a_1' } };
  const elite = { charId: 'char_1_a', isGolden: true, assets: { avatar: 'char_1_a_2', portrait: 'char_1_a_2' } };
  try {
    setOutfitPicker(null);
    assert.equal(chessAvatarUrl(M, elite), '/a/e2.png');
    assert.equal(chessPortraitUrl(M, base), '/p/base.png');
    setOutfitPicker((id) => (id === 'char_1_a' ? 'char_1_a@epoque#3' : null));
    for (const c of [base, elite]) {
      assert.equal(chessAvatarUrl(M, c), '/o/av.png');
      assert.equal(chessPortraitUrl(M, c), '/o/po.png');
    }
    // another player's unit: `{ outfit }` overrides the own choice (null = their default look)
    assert.equal(chessPortraitUrl(M, elite, { outfit: null }), '/p/e2.png');
    assert.equal(chessAvatarUrl(M, base, { outfit: 'char_1_a@boc#1' }), '/o/av2.png');
    // an outfit the manifest lacks: the operator's own art
    setOutfitPicker(() => 'char_1_a@nope#1');
    assert.equal(chessAvatarUrl(M, elite), '/a/e2.png');
  } finally { setOutfitPicker(null); }
});

test('data/assets.json: every outfit of data/outfits.json has its art and Front model; the layouts match', () => {
  const m = readJson('data/assets.json');
  const doc = readJson('data/outfits.json');
  if (!m.outfits) return; // a checkout whose manifest predates the outfits
  for (const r of Object.values(doc)) {
    const o = m.outfits.chars[r.id];
    assert.ok(o, `${r.id}: in the manifest`);
    for (const k of ['avatar', 'portrait']) assert.match(o[k], /^\/assets\/outfit\/(avatar|portrait)\/[A-Za-z0-9_.-]+\.png$/, `${r.id}.${k}`);
    assert.match(o.art, /^\/assets\/outfit\/art\/[A-Za-z0-9_.-]+\.webp$/, `${r.id}.art`);
    assert.ok(o.spine?.front?.skel, `${r.id}: Front model`);
    assert.equal(!!o.spine.back, r.layout === 'fb', `${r.id}: Back model iff layout fb`);
  }
  for (const c of new Set(Object.values(readJson('data/chess.json')).map((x) => x.charId).filter(Boolean))) assert.match(m.outfits.defaults[c]?.art || '', /\.webp$/, `${c}: default art`);
});

// ---- the artwork's WebP conversion ---------------------------------------------------------------------------------

/** A tiny valid PNG (sharp makes it, so the test needs no fixture file). */
async function pngOf(w, h) {
  const sharp = (await import('sharp')).default;
  return sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 0.5 } } }).png().toBuffer();
}

test('downloader: a png → webp job is validated as PNG, stored as WebP (≤ 1024 px), kept by a re-run', async () => {
  assert.equal(kindOf('a.webp'), 'webp');
  const png = await pngOf(2048, 1024);
  const webp = await convertImage(png, 'webp');
  assert.ok(isWebp(webp) && validate('webp', webp));
  assert.ok(!isWebp(png) && !isWebp(webp.subarray(0, webp.length - 1)), 'not a WebP / truncated');
  const sharp = (await import('sharp')).default;
  const meta = await sharp(webp).metadata();
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 512);
  assert.ok(meta.hasAlpha);
  const dir = mkdtempSync(path.join(tmpdir(), 'sp-outfit-'));
  try {
    let fetches = 0;
    const fetchImpl = async () => { fetches++; return new Response(png, { status: 200, headers: { 'content-length': String(png.length) } }); };
    const job = { rel: 'outfit/art/x.webp', urls: ['https://example.invalid/x.png'], kind: 'webp', from: 'png' };
    const dl = new Downloader({ root: dir, ledgerPath: path.join(dir, 'ledger.json'), fetchImpl, backoffMs: 0, log: () => {} });
    const r1 = await dl.runJob(job);
    assert.equal(r1.status, 'ok');
    const out = readFileSync(path.join(dir, job.rel));
    assert.ok(isWebp(out));
    assert.equal(dl.ledger.files[job.rel].bytes, out.length, 'the ledger records the converted size');
    const r2 = await dl.runJob(job);
    assert.equal(r2.status, 'skip', 'kept by a re-run');
    assert.equal(fetches, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- outfit voice sets ---------------------------------------------------------------------------------------------

test('indexVoice: an outfit word key is indexed under its own key (the operator\'s lines stay the operator\'s)', () => {
  const charword = { charWords: {
    a: { charId: 'char_1_a', wordKey: 'char_1_a', placeType: 'BATTLE_START', voiceId: 'CN_019', voiceAsset: 'char_1_a/CN_019', voiceIndex: 1 },
    b: { charId: 'char_1_a', wordKey: 'char_1_a_epoque#3', placeType: 'BATTLE_START', voiceId: 'CN_019', voiceAsset: 'char_1_a_epoque#3/CN_019', voiceIndex: 1 },
  } };
  const plain = indexVoice(charword, 'CN');
  assert.deepEqual([...plain.keys()], ['char_1_a'], 'without wordKeys: the operator only');
  const both = indexVoice(charword, 'CN', null, ['char_1_a_epoque#3']);
  assert.deepEqual(both.get('char_1_a_epoque#3'), { start: ['char_1_a_epoque#3/CN_019'] });
  assert.deepEqual(both.get('char_1_a'), { start: ['char_1_a/CN_019'] });
});

test('data/assets.json: the outfit voice sets sit in the voice trees under their word key, files safe-named', () => {
  const m = readJson('data/assets.json');
  const keys = Object.keys(m.audio.voice).filter((k) => k.includes('#'));
  if (!keys.length) return;
  for (const k of keys) {
    for (const u of JSON.stringify(m.audio.voice[k]).match(/"\/assets\/[^"]+"/g)) {
      // ('char_4064_mlynar_epoque#28' → …_epoque_28; Mudrock's outfits share 'char_311_mudrok#1' → …_mudrok_1)
      assert.match(u, /^"\/assets\/audio\/voice\/cn\/char_\d+_[a-z0-9]+(?:_[A-Za-z]+)?_\d+\/cn_\d+\.mp3"$/, `${k}: ${u}`);
    }
  }
  if (existsSync(path.join(ROOT, 'public', 'assets', 'audio', 'voice', 'cn', 'char_4064_mlynar_epoque_28'))) {
    assert.ok(m.audio.voice['char_4064_mlynar_epoque#28']?.start, 'Młynar\'s W Dali has its own battle-start line');
  }
});
