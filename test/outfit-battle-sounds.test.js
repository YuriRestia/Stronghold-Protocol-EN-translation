// test/outfit-battle-sounds.test.js — (fork, docs/OUTFITS.md) an outfit's own official battle banks. audio_data names an
// outfit's twin of an operator's bank with the outfit's skinId part ('…char_377_gdglow.attack_sanrio#1'); the client plays
// the twin where one exists, else the operator's bank. tools/assets/audio.mjs outfitAudioView swaps each picked bank for
// its twin, tools/assets/plan.mjs writes the result as `sfx.outfits[skinId]` (only when it differs), and
// public/js/audio.js unitSfx plays it for a unit wearing that outfit.
// Run: node --test test/outfit-battle-sounds.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan } from '../tools/assets/plan.mjs';
import { indexAudio, outfitAudioView } from '../tools/assets/audio.mjs';
import { AudioManager, setOutfitSfxResolver, unitSfx } from '../public/js/audio.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const bank = (name, asset, max = 2) => ({ name, sounds: [{ asset: `Audio/Sound_Beta_2/${asset}`, weight: 1, minVolume: 1, maxVolume: 1 }], maxSoundAllowed: max, popOldest: true, loop: false });

/** Goldenglow and Eyjafjalla with a Sanrio twin of some banks; Executor shares Eyjafjalla's outfit token. */
const AUDIO = {
  soundFXBanks: [
    bank('battle.ON_ABILITY_ON.char_377_gdglow.attack', 'Player/p_atk/p_atk_sparklight_n'),
    bank('battle.ON_ABILITY_ON.char_377_gdglow.attack_sanrio#1', 'Player/p_atk/p_atk_sparklight_n_sanrio#1'),
    bank('battle.ON_PROJECTILE_HIT.projectile_chr_gdglow', 'Player/p_imp/p_imp_sparklight_n'),
    bank('battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_sanrio#1', 'Player/p_imp/p_imp_sparklight_n_sanrio#1', 3),
    bank('battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_funnel_s1', 'Player/p_imp/p_imp_sparklightfunnel_n'),
    bank('battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_funnel_s1_sanrio#1', 'Player/p_imp/p_imp_sparklightfunnel_n_sanrio#1'),
    bank('battle.ON_SKILL_START.skchr_gdglow_1', 'Battle/b_char/b_char_atkboost'),
    bank('battle.ON_SKILL_START.skchr_gdglow_1_sanrio#1', 'Battle/b_char/b_char_atkboost'),
    bank('battle.ON_ABILITY_START.char_180_amgoat.attack', 'Player/p_atk/p_atk_firemag_n'),
    bank('battle.ON_ABILITY_START.char_180_amgoat_sanrio#2.attack', 'Player/p_atk/p_atk_firemag_n_sanrio#2'),
    bank('battle.ON_UNIT_BORN.char_180_amgoat_sanrio#2', 'Battle/b_char/b_char_set'),
    bank('battle.ON_ABILITY_ON.char_1032_excu2.attack', 'Player/p_atk/p_atk_shotgunx_n'),
    bank('battle.ON_ABILITY_ON.char_1032_excu2_sanrio#2.attack', 'Player/p_atk/p_atk_shotgunx_n_sanrio#2'),
    bank('battle.ON_UNIT_BORN.char_1012_skadi2.iteration#2', 'Battle/b_char/b_char_spskadi1'),
  ],
};
const skills = (short) => [0, 1, 2].map((i) => ({ index: i, skillId: `skchr_${short}_${i + 1}` }));
const OPS = {
  char_377_gdglow: { name: 'gdglow', skills: skills('gdglow') },
  char_180_amgoat: { name: 'amgoat', skills: skills('amgoat') },
  char_263_skadi: { name: 'skadi', skills: [] },
};
const OUTFITS = {
  'char_377_gdglow@sanrio#1': { id: 'char_377_gdglow@sanrio#1', charId: 'char_377_gdglow' },
  'char_180_amgoat@sanrio#2': { id: 'char_180_amgoat@sanrio#2', charId: 'char_180_amgoat' },
  'char_377_gdglow@plain#3': { id: 'char_377_gdglow@plain#3', charId: 'char_377_gdglow' },
};
const rel = (l) => l?.alts?.[0]?.rel;

test('outfitAudioView: an outfit\'s twins replace exactly the operator\'s banks; a twin with no operator bank is added; none → null', () => {
  const audio = indexAudio(AUDIO);
  const v = outfitAudioView(audio, 'char_377_gdglow', 'sanrio#1');
  assert.equal(v.replaced, 4, 'attack, impact, drone hit and the skill start (same file, on the twin\'s own pool)');
  assert.deepEqual(v.added, []);
  const atk = audio.bank('battle.ON_ABILITY_ON.char_377_gdglow.attack');
  assert.deepEqual(v.tr(atk), ['player/p_atk/p_atk_sparklight_n_sanrio#1.mp3']);
  assert.equal(v.audio.unitBanks.get('char_377_gdglow').get('ON_ABILITY_ON.attack'), atk, 'the picks see the operator\'s own banks');
  assert.equal(v.audio.poolOf(atk).id, 'battle.ON_ABILITY_ON.char_377_gdglow.attack_sanrio#1', 'the twin\'s official pool');
  const goat = outfitAudioView(audio, 'char_180_amgoat', 'sanrio#2');
  assert.equal(goat.replaced, 1, 'Executor\'s banks of the same token are not hers');
  assert.deepEqual(goat.added, ['battle.ON_UNIT_BORN.char_180_amgoat']);
  assert.deepEqual(goat.audio.unitBanks.get('char_180_amgoat').get('ON_UNIT_BORN'), ['battle/b_char/b_char_set.mp3']);
  assert.equal(audio.unitBanks.get('char_180_amgoat').get('ON_UNIT_BORN'), undefined, 'the index itself is untouched');
  assert.equal(outfitAudioView(audio, 'char_263_skadi', 'iteration#2'), null, '"skadi" is not "skadi2"');
  assert.equal(outfitAudioView(audio, 'char_377_gdglow', 'plain#3'), null);
});

test('plan: sfx.outfits[skinId] is the operator\'s entry with each twin\'s file and pool; the operator\'s own entry is unchanged', () => {
  const plain = buildPlan({ assets07: {}, ops03: {}, enemies05: {}, maps05: {}, audio: indexAudio(AUDIO), modelsData: {}, extraOperators: OPS }).template;
  const t = buildPlan({ assets07: {}, ops03: {}, enemies05: {}, maps05: {}, audio: indexAudio(AUDIO), modelsData: {}, extraOperators: OPS, outfits: OUTFITS }).template;
  assert.deepEqual(t.audio.sfx.units, plain.audio.sfx.units, 'the operators\' entries do not depend on the outfits');
  const gd = t.audio.sfx.units.char_377_gdglow, out = t.audio.sfx.outfits['char_377_gdglow@sanrio#1'];
  assert.equal(rel(gd.attack), 'audio/sfx/player/p_atk/p_atk_sparklight_n.mp3');
  assert.equal(rel(out.attack), 'audio/sfx/player/p_atk/p_atk_sparklight_n_sanrio_1.mp3');
  assert.match(out.attack.alts[0].urls[0], /p_atk_sparklight_n_sanrio%231\.mp3$/, 'the source keeps the official \'#\'');
  assert.equal(rel(out.hit), 'audio/sfx/player/p_imp/p_imp_sparklight_n_sanrio_1.mp3');
  assert.equal(out.pools.hit, 'battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_sanrio#1');
  assert.ok(t.audio.sfx.pools[out.pools.hit], 'the twin\'s own pool is in sfx.pools');
  assert.equal(rel(out.fxSounds['drone|#0'].url), 'audio/sfx/player/p_imp/p_imp_sparklightfunnel_n_sanrio_1.mp3');
  assert.equal(rel(gd.fxSounds['drone|#0'].url), 'audio/sfx/player/p_imp/p_imp_sparklightfunnel_n.mp3');
  assert.deepEqual(out.skills, gd.skills, 'a role the outfit does not change stays the operator\'s');
  const goat = t.audio.sfx.outfits['char_180_amgoat@sanrio#2'];
  assert.equal(rel(goat.born), 'audio/sfx/battle/b_char/b_char_set.mp3', 'the outfit\'s added deploy sound');
  assert.equal(t.audio.sfx.units.char_180_amgoat.born, undefined);
  assert.equal(t.audio.sfx.outfits['char_377_gdglow@plain#3'], undefined, 'an outfit without banks of its own has no entry');
  assert.equal(plain.audio.sfx.outfits, undefined, 'no outfits: no key');
});

test('data/assets.json: the three Sanrio outfits carry their own files; Goldenglow\'s drones and Eyjafjalla\'s impacts play for both looks', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/assets.json'), 'utf8')).audio.sfx;
  const f = (u) => (typeof u === 'string' ? u : u?.url || '').split('/').pop();
  const gd = m.units.char_377_gdglow, gdo = m.outfits['char_377_gdglow@sanrio#1'];
  assert.deepEqual([f(gd.attack), f(gdo.attack)], ['p_atk_sparklight_n.mp3', 'p_atk_sparklight_n_sanrio_1.mp3']);
  assert.deepEqual([f(gd.hit), f(gdo.hit)], ['p_imp_sparklight_n.mp3', 'p_imp_sparklight_n_sanrio_1.mp3']);
  assert.deepEqual(['drone|#0', 'drone|#2', 'explode|gdglow:blast#0', 'explode|gdglow:blast#2', 'drones|#1', 'drones|#2'].map((k) => f(gd.fxSounds[k])),
    ['p_imp_sparklightfunnel_n.mp3', 'p_imp_sparklightfunnel_s.mp3', 'p_skill_sparklightfunnelexplo.mp3', 'p_skill_sparklightfunnelexplo.mp3', 'p_skill_sparklightboost.mp3', 'p_skill_sparklightboost1.mp3']);
  assert.deepEqual(['drone|#0', 'drone|#2', 'explode|gdglow:blast#2', 'drones|#1'].map((k) => f(gdo.fxSounds[k])),
    ['p_imp_sparklightfunnel_n_sanrio_1.mp3', 'p_imp_sparklightfunnel_s_sanrio_1.mp3', 'p_skill_sparklightfunnelexplo_sanrio_1.mp3', 'p_skill_sparklightboost_sanrio_1.mp3']);
  const ex = m.units.char_1032_excu2, exo = m.outfits['char_1032_excu2@sanrio#2'];
  assert.deepEqual([f(ex.attack), f(exo.attack)], ['p_atk_shotgunx_n.mp3', 'p_atk_shotgunx_n_sanrio_2.mp3']);
  assert.deepEqual([0, 1, 2].map((i) => f(exo.attacks[i])), ['p_atk_shotgunx_d_sanrio_2.mp3', 'p_atk_shotgunxfr_h_sanrio_2.mp3', 'p_atk_shotgunx_s_sanrio_2.mp3']);
  const go = m.units.char_180_amgoat, goo = m.outfits['char_180_amgoat@sanrio#2'];
  assert.deepEqual([f(go.hit), f(goo.hit)], ['p_imp_firemag_n.mp3', 'p_imp_firemag_n_sanrio_2.mp3'], 'her projectile\'s REACH is her impact');
  assert.deepEqual(Object.keys(go.hits), ['1'], 'her S3 projectile replays her normal impact: no S3 slot (#679)');
  assert.equal(f(goo.hits[2]), 'p_imp_firemag_s_sanrio_2.mp3', 'the outfit\'s S3 projectile has its own');
  // S2 (a ReplacementSkill): the skill's own swing and its projectile's hit
  assert.deepEqual([f(go.attacks[1]), f(go.hits[1])], ['p_atk_firemag_n.mp3', 'p_skill_firebuff.mp3']);
  assert.deepEqual([f(goo.attacks[1]), f(goo.hits[1])], ['p_atk_firemag_h_sanrio_2.mp3', 'p_skill_firebuff.mp3'], 'the hit has no outfit twin');
  // Goldenglow's drone launch: her own S1 / S2 shot, the funnel's signal 0.6 s later
  const parts = (e) => [f(e), ...(e.also || []).map((x) => `${f(x)}+${x.after}`)];
  assert.deepEqual(parts(gd.fxSounds['droneLock|#0']), ['p_imp_sparklight_d.mp3', 'p_imp_sparklightfunnel_end_n.mp3+0.6']);
  assert.deepEqual(parts(gdo.fxSounds['droneLock|#1']), ['p_imp_sparklight_h_sanrio_1.mp3', 'p_imp_sparklightfunnel_end_n_sanrio_1.mp3+0.6']);
  assert.equal(gd.fxSounds['droneLock|#2'].after, 0.6, 'S3 has no own projectile: the signal alone, late');
  // Executor: T1's double strike, its S3 twin, S3's final verdict; the outfit's S2 shot after the swing
  assert.deepEqual(parts(ex.fxSounds['extraAttack|']), ['p_atk_shotgunxdouble.mp3', 'p_atk_shotgunxdouble_2.mp3+0.1']);
  assert.deepEqual(parts(exo.fxSounds['extraAttack|#2']), ['p_atk_shotgunxdouble_sanrio_2.mp3', 'p_atk_shotgunxdouble3_sanrio_2.mp3+0.1']);
  assert.deepEqual(parts(exo.fxSounds['aoe|excu2']), ['p_atk_bngel_sanrio_2.mp3', 'p_imp_bngel_sanrio_2.mp3+0.1']);
  assert.equal(ex.attackAlso, undefined, 'the default S2 has one sound');
  assert.deepEqual(exo.attackAlso[1].map((x) => `${f(x)}+${x.after}`), ['p_atk_shotgunx_h_sanrio_2.mp3+0.15']);
  assert.equal(go.fxSounds, undefined, 'the S2 explosion bank is the outfit\'s only');
  assert.equal(f(goo.fxSounds['explosion|']), 'p_imp_firemag_h_sanrio_2.mp3');
  assert.deepEqual([go.born, f(goo.born)], [undefined, 'b_char_set.mp3']);
  assert.equal(f(goo.skills[2]), 'p_skill_volcano_loop_sanrio_2.mp3');
  for (const o of Object.values(m.outfits)) for (const p of Object.values(o.pools || {})) assert.ok(m.pools[p], p);
  assert.deepEqual(Object.keys(m.outfits).sort(), ['char_1032_excu2@sanrio#2', 'char_180_amgoat@sanrio#2', 'char_377_gdglow@sanrio#1']);
});

test('unitSfx: the outfit\'s entry when it has one, else the operator\'s', () => {
  const sfx = { units: { a: { attack: 'a.mp3' } }, outfits: { 'a@x#1': { attack: 'x.mp3' } } };
  assert.equal(unitSfx(sfx, 'a', 'a@x#1').attack, 'x.mp3');
  assert.equal(unitSfx(sfx, 'a', 'a@y#2').attack, 'a.mp3');
  assert.equal(unitSfx(sfx, 'a').attack, 'a.mp3');
  assert.equal(unitSfx({ units: {} }, 'a', 'a@x#1'), undefined);
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

test('AudioManager: a unit wearing an outfit with its own sounds requests the outfit\'s files (attack, impact, kit fx, deploy); another look the operator\'s', async () => {
  const fw = fakeWindow();
  const origFetch = globalThis.fetch;
  const requested = [];
  globalThis.fetch = async (url) => { requested.push(String(url).split('/').pop()); return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }; };
  const pool = { maxSoundAllowed: 4, popOldest: true, sounds: {} };
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: { deploy: '/s/deploy.mp3' }, pools: { d: pool, o: pool },
    units: { char_377_gdglow: { attack: '/s/atk.mp3', hit: '/s/imp.mp3', fxSounds: { 'drone|#0': { url: '/s/drone.mp3', pool: 'd' } } } },
    outfits: { 'char_377_gdglow@sanrio#1': { attack: '/s/atk_sanrio.mp3', hit: '/s/imp_sanrio.mp3', born: '/s/born_sanrio.mp3', fxSounds: { 'drone|#0': { url: '/s/drone_sanrio.mp3', pool: 'o' } } } } } } };
  const wears = new Map([[3, 'char_377_gdglow@sanrio#1'], [4, null], [5, 'char_377_gdglow@plain#3']]);
  setOutfitSfxResolver((u) => wears.get(u.id) ?? null);
  try {
    const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
    a.install();
    fw.fire('pointerdown');
    await new Promise((r) => setTimeout(r, 10));
    const gd = (id) => ({ id, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_377_gdglow', skillIndex: 0 });
    a.setFieldUnits([gd(3), gd(4), gd(5), { id: 9, kind: 'enemy', side: 'enemy', defId: 'enemy_1007_slime', spine: 'enemy_1007_slime' },
      { id: 10, kind: 'enemy', side: 'enemy', defId: 'enemy_1007_slime', spine: 'enemy_1007_slime' }]);
    // every play asks for its file's buffer (the first time from the network): the file each sound plays
    const buffer = a._buffer.bind(a);
    a._buffer = (url) => { requested.push(String(url).split('/').pop()); return buffer(url); };
    globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    const run = async (ev) => { requested.length = 0; a.handleBattleEvents(ev); await new Promise((r) => setTimeout(r, 10)); return [...requested]; };
    assert.deepEqual(await run([['atk', 3, 9], ['dmg', 9, 10, 'phys']]), ['atk_sanrio.mp3', 'imp_sanrio.mp3'], 'the outfit: its attack and impact');
    a.lastAttacker.clear();
    assert.deepEqual(await run([['atk', 4, 10], ['dmg', 10, 10, 'phys']]), ['atk.mp3', 'imp.mp3'], 'the default look');
    a.lastAttacker.clear();
    assert.deepEqual(await run([['fx', 'drone', 5, 9, { id: 3 }]]), ['drone_sanrio.mp3']);
    assert.deepEqual(await run([['fx', 'drone', 5, 9, { id: 4 }]]), ['drone.mp3']);
    assert.equal(a.units.get(5).outfit, 'char_377_gdglow@plain#3');
    assert.deepEqual(await run([['fx', 'drone', 5, 9, { id: 5 }]]), ['drone.mp3'], 'an outfit without sounds of its own: the operator\'s');
  } finally {
    setOutfitSfxResolver(null);
    globalThis.fetch = origFetch;
  }
});

test('AudioManager: a kit fx with several banks plays each on its pool, the late one after its delay; an attack follow-up after the swing', async () => {
  const fw = fakeWindow();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  const pool = { maxSoundAllowed: 4, popOldest: true, sounds: {} };
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: {}, pools: { a: pool, b: pool, s: pool, f: pool },
    units: { char_1032_excu2: { attacks: { 1: '/s/swing_h.mp3' }, attackPools: { 1: 's' }, attackAlso: { 1: [{ url: '/s/shot.mp3', pool: 'f', after: 0.05 }] },
      fxSounds: { 'extraAttack|': { url: '/s/t1.mp3', pool: 'a', also: [{ url: '/s/double.mp3', pool: 'b', after: 0.05 }] } } } } } } };
  try {
    const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
    a.install();
    fw.fire('pointerdown');
    await new Promise((r) => setTimeout(r, 10));
    a.setFieldUnits([{ id: 1, kind: 'op', side: 'ally', defId: 'char_1032_excu2', spine: 'char_1032_excu2', skillIndex: 1 },
      { id: 9, kind: 'enemy', side: 'enemy', defId: 'enemy_1007_slime', spine: 'enemy_1007_slime' }]);
    const plays = [];
    const play = a._playBank.bind(a);
    a._playBank = (url, p, vol) => { plays.push(url); return play(url, p, vol); };
    a.handleBattleEvents([['fx', 'extraAttack', 0, 0, { id: 1 }]]);
    assert.deepEqual(plays, ['/s/t1.mp3'], 'the lead at once');
    await new Promise((r) => setTimeout(r, 120));
    assert.deepEqual(plays, ['/s/t1.mp3', '/s/double.mp3'], 'the listed one after its delay');
    plays.length = 0;
    a.handleBattleEvents([['skill', 1, 1], ['atk', 1, 9]]);
    await new Promise((r) => setTimeout(r, 120));
    assert.deepEqual(plays, ['/s/shot.mp3'], 'the running skill\'s attack: its follow-up after the swing');
    plays.length = 0;
    a.handleBattleEvents([['fx', 'extraAttack', 0, 0, { id: 1 }]]);
    a.setFieldUnits([]);
    await new Promise((r) => setTimeout(r, 120));
    assert.deepEqual(plays, ['/s/t1.mp3'], 'a late sound of a field that changed is dropped');
  } finally {
    globalThis.fetch = origFetch;
  }
});
