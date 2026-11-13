// (fork) Enemy sound leftovers job 2 (2026-11-13, crew-docs/enemy-sound-audit.md): enemy skill impacts whose official
// effect has no impact visual, or that our sim never casts as a skill, ring on the sim's own events instead of an effect
// spawning — so they play with battle effects off too. tools/assets/plan.mjs ENEMY_FX_SOUND_BANKS / enemyFxHits →
// sfx.units[id].fxHits; public/js/audio.js _enemyFxHit (fx events) and the attack-turn 'turn|<prefabKey>' entry.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ENEMY_FX_SOUND_BANKS, enemyFxHits } from '../tools/assets/plan.mjs';
import { AudioManager } from '../public/js/audio.js';

const leafUrl = (e) => (typeof e === 'string' ? e : e?.url ?? e?.path ?? JSON.stringify(e));

test('enemyFxHits: the banks that exist, the first as the entry and the rest as `also`, with after / gap', () => {
  const banks = { 'b.one': ['enemy/e_imp/one.mp3'], 'b.two': ['enemy/e_imp/two.mp3'] };
  const audio = { bank: (n) => banks[n] || [] };
  const out = enemyFxHits(audio, {
    'explode|x': [{ bank: 'b.one' }, { bank: 'b.two', after: 0.7 }],
    'link|y': { bank: 'b.one', gap: 2 },
    'beam|z': 'b.missing',
  }, (p) => `pool:${p[0]}`);
  assert.deepEqual(Object.keys(out).sort(), ['explode|x', 'link|y'], 'a bank the audio data lacks makes no entry');
  assert.equal(out['explode|x'].pool, 'pool:enemy/e_imp/one.mp3');
  assert.equal(out['explode|x'].also.length, 1);
  assert.equal(out['explode|x'].also[0].after, 0.7);
  assert.equal(out['link|y'].gap, 2);
  assert.equal(enemyFxHits(audio, undefined, () => null), null);
});

// the official file each entry must carry (VFX 2's audit rows, CN audio_data), and the sim source that sends the fx
const EXPECT = {
  enemy_10156_mncrer: { 'explode|heal': ['e_atk_thrwtrpt', 'e_imp_thrwtrpt'] },
  enemy_1275_dwlock_2: { 'explode|apoptosis': ['e_imp_staffrot_d'], 'beam|deathEye': ['e_imp_magic_ice'] },
  enemy_1513_dekght_2: { 'telegraph|blastArrow': ['e_imp_blade_n'] },
  enemy_1516_jakill: { 'turn|ironsandstorm': ['e_imp_reinforcement', 'e_skill_mephiimp'] },
  enemy_9009_acfort: { 'beam|devour': ['e_imp_fltbcyte'] },
  enemy_9012_acloon: { 'yanyouFlame|': ['e_imp_mortar_n'] },
  enemy_9017_achunt_2: { 'link|faithLink': ['e_imp_mchntrchn_u'] },
  enemy_9032_aclionk: { 'telegraph|royalDecree': ['e_imp_lnkgfthr_d'] },
  enemy_9033_acdeer: { 'beam|naturalSurge': ['e_imp_icevltn_d'] },
};

test('manifest: each enemy carries its fxHits with the official files', () => {
  const units = JSON.parse(fs.readFileSync('data/assets.json', 'utf8')).audio.sfx.units;
  for (const [id, tags] of Object.entries(EXPECT)) {
    for (const [tag, stems] of Object.entries(tags)) {
      const e = units[id]?.fxHits?.[tag];
      assert.ok(e, `${id} ${tag}`);
      const files = [e, ...(e.also || [])].map((p) => leafUrl(p.url).split('/').pop().replace(/\.\w+$/, ''));
      assert.deepEqual(files, stems, `${id} ${tag}`);
    }
  }
  assert.equal(units.enemy_10156_mncrer.fxHits['explode|heal'].also[0].after, 0.7, 'the flask lands after its 0.7 s life');
  assert.equal(units.enemy_9017_achunt_2.fxHits['link|faithLink'].gap, 2);
  // the attack-turn skill's impact is the attack's: its effect-key timing is gone (no second ring)
  const jc = Object.values(units.enemy_1516_jakill.casts || {}).find((c) => c.pk === 'ironsandstorm');
  assert.ok(jc && !jc.keys, 'jakill ironsandstorm: no casts.keys');
});

test('every fx tag names an event the sim sends (kind and extra.kind in the kit source)', () => {
  const src = ['server/sim/content/bosses.js', 'server/sim/content/tokens.js', ...fs.readdirSync('server/sim/content/enemies').map((f) => `server/sim/content/enemies/${f}`)]
    .map((p) => fs.readFileSync(p, 'utf8')).join('\n');
  for (const [id, table] of Object.entries(ENEMY_FX_SOUND_BANKS)) {
    for (const tag of Object.keys(table)) {
      const [kind, xkind] = tag.split('|');
      if (kind === 'turn') continue;
      assert.ok(new RegExp(`\\.fx\\(\\s*'${kind}'`).test(src), `${id}: fx '${kind}' is sent`);
      if (xkind) assert.ok(src.includes(`kind: '${xkind}'`), `${id}: kind '${xkind}' is sent`);
    }
  }
});

function fakeWindow() {
  const listeners = new Map();
  class Param { constructor() { this.value = 1; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } cancelScheduledValues() {} }
  class Node { connect() {} disconnect() {} }
  class Gain extends Node { constructor() { super(); this.gain = new Param(); } }
  class Src extends Node { constructor() { super(); this.playbackRate = new Param(); } start() {} stop() {} }
  class Ctx {
    constructor() { this.currentTime = 0; this.state = 'running'; this.destination = new Node(); }
    createGain() { return new Gain(); }
    createBufferSource() { return new Src(); }
    decodeAudioData(ab, ok) { ok({ duration: 1 }); }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
  }
  return { win: { AudioContext: Ctx, document: { hidden: false, addEventListener() {} }, addEventListener(t, fn) { listeners.set(t, fn); }, removeEventListener() {} }, fire: (t) => listeners.get(t)?.() };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function rig(units) {
  const fw = fakeWindow();
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: {}, pools: {}, units } } };
  const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
  a.install();
  fw.fire('pointerdown');
  await wait(10);
  const requested = [];
  const buffer = a._buffer.bind(a);
  a._buffer = (url) => { requested.push(String(url).split('/').pop()); return buffer(url); };
  return { a, requested };
}

test('client: a kit fx rings its enemy\'s impact (id / from), after its delay, a chain once per gap, a nameless death flask', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const { a, requested } = await rig({
      enemy_9009_acfort: { fxHits: { 'beam|devour': { url: '/s/grab.mp3', after: 0.05 } } },
      enemy_9017_achunt_2: { fxHits: { 'link|faithLink': { url: '/s/ray.mp3', gap: 2 } } },
      enemy_10156_mncrer: { fxHits: { 'explode|heal': { url: '/s/throw.mp3', also: [{ url: '/s/land.mp3', after: 0.05 }] } } },
      enemy_1513_dekght_2: { fxHits: { 'telegraph|blastArrow': { url: '/s/arrow.mp3' } } },
    });
    a.setFieldUnits([
      { id: 1, kind: 'enemy', side: 'enemy', defId: 'enemy_9009_acfort', spine: 'enemy_9009_acfort' },
      { id: 2, kind: 'enemy', side: 'enemy', defId: 'enemy_9017_achunt_2', spine: 'enemy_9017_achunt_2' },
      { id: 3, kind: 'enemy', side: 'enemy', defId: 'enemy_10156_mncrer', spine: 'enemy_10156_mncrer' },
      { id: 4, kind: 'enemy', side: 'enemy', defId: 'enemy_1513_dekght_2', spine: 'enemy_1513_dekght_2' },
      { id: 7, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_102_texas' },
    ]);
    await wait(10);
    requested.length = 0;
    a.handleBattleEvents([['fx', 'beam', 0, 0, { from: 1, to: 9, kind: 'devour' }]]);
    await wait(5);
    assert.deepEqual(requested, [], 'the grab lands later');
    await wait(80);
    assert.deepEqual(requested, ['grab.mp3']);
    requested.length = 0;
    a.handleBattleEvents([['fx', 'beam', 0, 0, { from: 1, to: 9, kind: 'fireWeapon' }], ['fx', 'beam', 0, 0, { from: 7, to: 1, kind: 'devour' }]]);
    a.handleBattleEvents([['fx', 'telegraph', 2, 3, { id: 4, to: 7, kind: 'blastArrow' }]]);
    await wait(80);
    assert.deepEqual(requested, ['arrow.mp3'], 'another kind and another unit\'s fx ring nothing; the arrow rings at once');
    requested.length = 0;
    a.handleBattleEvents([['fx', 'link', 0, 0, { from: 2, to: 5, kind: 'faithLink' }]]);
    await wait(100);   // past the crowd gap (two chains in one moment are one sound, _castPart)
    a.handleBattleEvents([['fx', 'link', 0, 0, { from: 2, to: 6, kind: 'faithLink' }]]);
    await wait(10);
    assert.deepEqual(requested, ['ray.mp3', 'ray.mp3'], 'once per chain while it holds; a second spring\'s chain rings');
    requested.length = 0;
    a.handleBattleEvents([['fx', 'explode', 5, 5, { r: 1, kind: 'heal' }]]);
    await wait(10);
    assert.deepEqual(requested, [], 'a nameless fx with nobody dying rings nothing');
    a.handleBattleEvents([['fx', 'explode', 5, 5, { r: 1, kind: 'heal' }], ['die', 3, 'killed']]);
    await wait(80);
    assert.deepEqual(requested.filter((u) => u === 'throw.mp3' || u === 'land.mp3'), ['throw.mp3', 'land.mp3'], 'the dying acolyte\'s flask: thrown, then landing');
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('client: an attack-turn skill\'s impact replaces that one attack\'s impact (Jesselton\'s 铁沙暴)', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  try {
    const { a, requested } = await rig({
      enemy_1516_jakill: { attack: '/s/atk.mp3', hit: '/s/hit.mp3', casts: { 0: { pk: 'ironsandstorm', hit: { url: '/s/s1_hit_cast.mp3' } } },
        fxHits: { 'turn|ironsandstorm': { url: '/s/s1_hit.mp3', also: [{ url: '/s/s1_reach.mp3' }] } } },
    });
    a.setFieldUnits([
      { id: 1, kind: 'enemy', side: 'enemy', defId: 'enemy_1516_jakill', spine: 'enemy_1516_jakill' },
      { id: 7, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_102_texas' },
    ]);
    await wait(10);
    requested.length = 0;
    a.handleBattleEvents([['cast', 1, 0], ['atk', 1, 7, 'arts']]);
    await wait(10);
    requested.length = 0;
    a.handleBattleEvents([['dmg', 7, 100, 'arts']]);
    await wait(10);
    assert.deepEqual(requested, ['s1_hit.mp3', 's1_reach.mp3'], 'the skill shot\'s hit and reach');
    requested.length = 0;
    a.handleBattleEvents([['atk', 1, 7, 'arts']]);
    a.handleBattleEvents([['dmg', 7, 100, 'arts']]);
    await wait(10);
    assert.ok(!requested.includes('s1_hit.mp3'), 'the next normal attack has its own impact again');
  } finally {
    globalThis.fetch = origFetch;
  }
});
