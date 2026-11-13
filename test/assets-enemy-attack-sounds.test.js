// (fork) Enemy normal-attack sounds (tools/assets/audio.mjs pickEnemySfx; the 2026-11-13 enemy sound audit,
// crew-docs/enemy-sound-audit.md): a ranged enemy's impact is its shot's bank, the fire after the wind-up plays too
// (`next`), and an enemy with a ranged and a melee ability gets a melee set of its own. Bank names and files are the
// official CN audio_data ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEnemySfx } from '../tools/assets/audio.mjs';
import { AudioManager } from '../public/js/audio.js';

const f = (stem) => [`enemy/x/${stem}.mp3`];
/** unitBanks entry (event.ability → paths) + the bank lookup the shots go through */
function fake(unit, shots = {}) {
  const banks = new Map(Object.entries(unit).map(([k, v]) => [k, f(v)]));
  const all = new Map(Object.entries(shots).map(([k, v]) => [k, f(v)]));
  return { banks, bank: (name) => all.get(name) || [] };
}

test('假想敌：铳: charge, then the fire, and the bullet\'s own impact', () => {
  const { banks, bank } = fake({
    'ON_ABILITY_START.attack.0': 'e_atk_mchntr_n_u', 'ON_ABILITY_ON.attack.0': 'e_atk_mchntrfr_n_u',
    'ON_ABILITY_START.1': 'e_atk_mchntr_d_u', 'ON_ABILITY_START.2': 'e_atk_mchntr_h_u',
  }, { 'battle.ON_PROJECTILE_HIT.projectile_enemy_achunt': 'e_imp_mchntr_n_u' });
  const s = pickEnemySfx(banks, bank, 'achunt');
  assert.deepEqual(s.attack, f('e_atk_mchntr_n_u'));
  assert.deepEqual(s.next, [f('e_atk_mchntrfr_n_u')]);
  assert.deepEqual(s.hit, f('e_imp_mchntr_n_u'), 'the bullet impact, never a skill bank');
  assert.equal(s.melee, undefined);
});

test('自由: the cast (ON_ABILITY_HIT) sounds at the release, the shot\'s impact where it lands', () => {
  const { banks, bank } = fake({ 'ON_ABILITY_HIT.attack': 'e_atk_magic_ice', 'ON_ABILITY_ON.ShieldBurst': 'e_skill_dragonimp' },
    { 'battle.ON_PROJECTILE_HIT.projectile_enemy_xi': 'e_imp_magic_s' });
  const s = pickEnemySfx(banks, bank, 'xi');
  assert.deepEqual(s.attack, f('e_atk_magic_ice'));
  assert.deepEqual(s.hit, f('e_imp_magic_s'));
  assert.equal(s.next, undefined);
});

test('W: no ability bank, its grenade heard where it lands', () => {
  const { banks, bank } = fake({}, { 'battle.ON_PROJECTILE_REACH.projectile_enemy_cqbw': 'e_imp_grenade_n' });
  assert.deepEqual(pickEnemySfx(banks, bank, 'cqbw'), { hit: f('e_imp_grenade_n') });
});

test('a ranged + melee enemy: each attack keeps its own swing and impact (军团老兵盾卫 played a melee swing with a ranged impact)', () => {
  const { banks, bank } = fake({
    'ON_ABILITY_START.combat.0': 'e_atk_blunt_n', 'ON_ABILITY_HIT.combat.0': 'e_imp_berxplvbrl', 'ON_ABILITY_HIT.attack.0': 'e_imp_sword_h',
  });
  const s = pickEnemySfx(banks, bank, 'uashld');
  assert.deepEqual(s.hit, f('e_imp_sword_h'));
  assert.deepEqual(s.attack, f('e_atk_blunt_n'), 'its ranged ability has no swing bank: the melee one, as before');
  assert.deepEqual(s.melee, { attack: f('e_atk_blunt_n'), hit: f('e_imp_berxplvbrl') });
});

test('弩手: its ranged ability has no impact bank, so its bolts keep the melee impact they always had', () => {
  const { banks, bank } = fake({
    'ON_ABILITY_ON.attack': 'e_atk_arrow_n', 'ON_ABILITY_ON.combat': 'e_atk_arrow_n', 'ON_ABILITY_HIT.combat': 'e_imp_arrow_n',
  });
  assert.deepEqual(pickEnemySfx(banks, bank, 'jshoot'), { attack: f('e_atk_arrow_n'), hit: f('e_imp_arrow_n') });
});

test('重弩手伏击者: the bolt\'s impact, the melee sword impact only for its melee set', () => {
  const { banks, bank } = fake({
    'ON_ABILITY_START.CrossAttack': 'e_atk_mgcsnper', 'ON_ABILITY_ON.CrossAttack': 'e_atk_mgcsnpersht', 'ON_ABILITY_HIT.combat.0': 'e_imp_sword_n',
  }, { 'battle.ON_PROJECTILE_HIT.projectile_enemy_msnip': 'e_imp_mgcsnper' });
  const s = pickEnemySfx(banks, bank, 'msnip');
  assert.deepEqual(s.attack, f('e_atk_mgcsnper'));
  assert.deepEqual(s.next, [f('e_atk_mgcsnpersht')]);
  assert.deepEqual(s.hit, f('e_imp_mgcsnper'));
  assert.deepEqual(s.melee, { attack: f('e_atk_mgcsnper'), hit: f('e_imp_sword_n') }, 'its melee swing: the CrossAttack one, as before');
});

test('腐败骑士: a named skill (ChargeAttack, an e_skill_ file) never stands for its attack', () => {
  const { banks, bank } = fake({
    'ON_ABILITY_START.combat': 'e_skill_hugeaxe_cast', 'ON_ABILITY_HIT.combat': 'e_skill_hugeaxe_hit', 'ON_ABILITY_START.ChargeAttack': 'e_skill_charge',
  }, { 'battle.ON_PROJECTILE_HIT.projectile_enemy_dekght': 'e_imp_blade_n' });
  assert.deepEqual(pickEnemySfx(banks, bank, 'dekght'), { attack: f('e_skill_hugeaxe_cast'), hit: f('e_skill_hugeaxe_hit') });
});

test('a melee-only enemy keeps its one set; death and birth as before', () => {
  const { banks, bank } = fake({
    'ON_ABILITY_START.attack': 'e_atk_bigaxe_h', 'ON_ABILITY_HIT.attack': 'e_imp_bigaxe_h', 'ON_ABILITY_START.attack.4': 'e_atk_bigaxe_d',
    ON_UNIT_DEAD: 'b_enemy_dead_n',
  });
  assert.deepEqual(pickEnemySfx(banks, bank, 'mdrock'), { attack: f('e_atk_bigaxe_h'), hit: f('e_imp_bigaxe_h'), die: f('b_enemy_dead_n') });
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

test('client: an enemy shot plays its swing + fire and the shot impact; its melee strike its melee set', async () => {
  const fw = fakeWindow();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  const pool = { maxSoundAllowed: 4, popOldest: true, sounds: {} };
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: { enemyHit: '/s/generic.mp3' }, pools: { p: pool }, units: {
    enemy_1404_msnip: { attack: '/s/atk.mp3', hit: '/s/shot_imp.mp3', attackNext: [{ url: '/s/fire.mp3', pool: 'p' }],
      melee: { attack: '/s/melee_atk.mp3', hit: '/s/sword_imp.mp3' } } } } } };
  try {
    const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
    a.install();
    fw.fire('pointerdown');
    await new Promise((r) => setTimeout(r, 10));
    a.setFieldUnits([{ id: 9, kind: 'enemy', side: 'enemy', defId: 'enemy_1404_msnip', spine: 'enemy_1404_msnip' },
      { id: 3, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_102_texas' }]);
    const requested = [];
    const buffer = a._buffer.bind(a);
    a._buffer = (url) => { requested.push(String(url).split('/').pop()); return buffer(url); };
    const run = async (ev) => { requested.length = 0; a.handleBattleEvents(ev); await new Promise((r) => setTimeout(r, 10)); return [...requested]; };
    assert.deepEqual(await run([['atk', 9, 3, 'enemy'], ['dmg', 3, 10, 'phys']]), ['atk.mp3', 'fire.mp3', 'shot_imp.mp3'], 'a shot');
    a.lastAttacker.clear();
    a.limiter.lastByUnit.clear();
    a.setFieldUnits([{ id: 9, kind: 'enemy', side: 'enemy', defId: 'enemy_1404_msnip', spine: 'enemy_1404_msnip' },
      { id: 3, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_102_texas' }, { id: 4, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_102_texas' }]);
    await new Promise((r) => setTimeout(r, 200));
    const two = await run([['atk', 9, 3, 'enemy'], ['atk', 9, 4, 'enemy']]);
    assert.equal(two.filter((x) => x === 'fire.mp3').length, 1, `one shot on two targets fires once: ${two}`);
    a.lastAttacker.clear();
    a.limiter.lastByUnit.clear();
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(await run([['atk', 9, 3, 'none'], ['dmg', 3, 10, 'phys']]), ['melee_atk.mp3', 'sword_imp.mp3'],
      'blocked: its melee set (no fire after the swing), the sword impact');
  } finally {
    globalThis.fetch = origFetch;
  }
});
