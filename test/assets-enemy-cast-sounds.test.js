// (fork) Enemy skill-cast sounds (the 2026-11-13 enemy sound audit, chunk 2; crew-docs/enemy-sound-audit.md): an enemy
// skill's official ability banks ring at the sim's ['cast', id, slot] (tools/assets/audio.mjs pickEnemyCastSfx), and its
// impact bank when the skill's own impact effect spawns (tools/assets/plan.mjs enemyCastsFromIndex, audio.js fxKey).
// Bank names and files are the official CN audio_data ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pickEnemyCastSfx } from '../tools/assets/audio.mjs';
import { enemyCastsFromIndex } from '../tools/assets/plan.mjs';
import { AudioManager } from '../public/js/audio.js';

const f = (stem) => [`enemy/x/${stem}.mp3`];
function fake(unit, shots = {}, loops = []) {
  const banks = new Map(Object.entries(unit).map(([k, v]) => [k, f(v)]));
  const all = new Map(Object.entries(shots).map(([k, v]) => [k, f(v)]));
  const loopSet = new Set(loops.map((k) => banks.get(k)).filter(Boolean));
  return { banks, bank: (name) => all.get(name) || [], loopOf: (p) => loopSet.has(p) };
}

test('防御粉碎者 StunCombat: the swing at the cast, the axe impact as the skill\'s hit (ability HIT)', () => {
  const { banks, bank } = fake({ 'ON_ABILITY_ON.StunCombat': 'e_atk_bigaxe_d', 'ON_ABILITY_HIT.StunCombat': 'e_imp_bigaxe_d',
    'ON_ABILITY_START.attack': 'e_atk_other' });
  const s = pickEnemyCastSfx(banks, bank, { nodes: ['stuncombat'] });
  assert.deepEqual(s.start, [f('e_atk_bigaxe_d')], 'case-insensitive node; the normal attack bank stays out');
  assert.deepEqual(s.hit, f('e_imp_bigaxe_d'));
  assert.deepEqual(s.hitFrom, { ev: 'ON_ABILITY_HIT' });
});

test('numbered ability banks (DeathEye.1) and a projectile skill (W\'s C4 lands: REACH)', () => {
  const a = fake({ 'ON_ABILITY_START.DeathEye.1': 'e_atk_rayrot' }, { 'battle.ON_PROJECTILE_HIT.projectile_enemy_dwlock_charge': 'e_imp_staffrot_d' });
  const s = pickEnemyCastSfx(a.banks, a.bank, { nodes: ['DeathEye'], projectiles: ['projectile_enemy_dwlock_charge'] });
  assert.deepEqual(s.start, [f('e_atk_rayrot')]);
  assert.deepEqual(s.hitFrom, { ev: 'ON_PROJECTILE_HIT', projectile: 'projectile_enemy_dwlock_charge' });
  const w = fake({}, { 'battle.ON_PROJECTILE_REACH.projectile_enemy_cqbw_s1': 'e_skill_wc4explo' });
  const c4 = pickEnemyCastSfx(w.banks, w.bank, { nodes: ['C4'], projectiles: ['projectile_enemy_cqbw_s1'] });
  assert.deepEqual(c4.start, []);
  assert.deepEqual(c4.hit, f('e_skill_wc4explo'));
  assert.equal(c4.hitFrom.ev, 'ON_PROJECTILE_REACH');
});

test('a looping bank (炎魔 Skill_2\'s held loop) is left out; no bank at all → null', () => {
  const { banks, bank, loopOf } = fake({ 'ON_ABILITY_START.Skill_2': 'e_atk_frlgblckh', 'ON_ABILITY_ON.Skill_2': 'e_atk_frlgblcklp' }, {},
    ['ON_ABILITY_ON.Skill_2']);
  assert.deepEqual(pickEnemyCastSfx(banks, bank, { nodes: ['Skill_2'] }, loopOf).start, [f('e_atk_frlgblckh')]);
  assert.equal(pickEnemyCastSfx(banks, bank, { nodes: ['nothing'] }, loopOf), null);
});

test('enemyCastsFromIndex: slots in data order; impact keys minus the normal attack\'s own effects', () => {
  const index = {
    prefabs: { a_hit: {}, s_hit: {}, s_range: {}, p_hit: {}, p_reach: {} },
    units: { enemy_1_x: { modes: [{ combat: { hit: [{ effects: ['a_hit'] }] } }],
      skills: { stun: { abilities: [{ node: 'StunCombat', projectileKey: 'projectile_x' }], projectiles: [], roles: { hit: ['a_hit', 's_range'] } } } } },
    projectiles: { projectile_x: { onHit: ['p_hit'], onReached: ['p_reach'] } },
  };
  const m = enemyCastsFromIndex(index, { enemy_1_x: { skills: [{ prefabKey: 'nope' }, { prefabKey: 'stun' }] } });
  const [a, b] = m.get('enemy_1_x');
  assert.deepEqual(a, { slot: 0, pk: 'nope', nodes: ['nope'], projectiles: [], hitKeys: [], proj: {} });
  assert.equal(b.slot, 1);
  assert.deepEqual(b.nodes, ['stun', 'StunCombat']);
  assert.deepEqual(b.hitKeys, ['s_range'], 'a_hit rings on every normal attack: never a skill impact');
  assert.deepEqual(b.proj, { projectile_x: { hit: ['p_hit'], reach: ['p_reach'] } });
  assert.deepEqual(enemyCastsFromIndex(null, { enemy_1_x: { skills: [{ prefabKey: 'stun' }] } }).get('enemy_1_x')[0].nodes, ['stun']);
});

test('manifest: every enemy cast slot names the prefabKey of that slot in each version\'s data', () => {
  const units = JSON.parse(fs.readFileSync('data/assets.json', 'utf8')).audio.sfx.units;
  const sets = ['data/enemies.json', ...fs.readdirSync('data/versions').map((v) => `data/versions/${v}/enemies.json`)]
    .filter((p) => fs.existsSync(p)).map((p) => JSON.parse(fs.readFileSync(p, 'utf8')));
  let n = 0;
  for (const [id, u] of Object.entries(units)) {
    for (const [slot, c] of Object.entries(u.casts || {})) {
      n++;
      for (const d of sets) if (d[id]) assert.equal(d[id].skills?.[Number(slot)]?.prefabKey, c.pk, `${id} slot ${slot}`);
      assert.ok(Array.isArray(c.start) || c.hit, `${id} slot ${slot}: a sound`);
    }
  }
  assert.ok(n > 0, 'the manifest has enemy cast sounds');
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

test('client: an enemy cast plays its start sounds; each impact effect spawning plays the impact, held only by the bank cap', async () => {
  const fw = fakeWindow();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: {}, pools: {}, units: {
    enemy_1504_cqbw: { attack: '/s/atk.mp3', casts: { 0: { pk: 'C4', start: [{ url: '/s/c4_throw.mp3' }, { url: '/s/c4_fuse.mp3' }],
      hit: { url: '/s/c4_boom.mp3' }, keys: ['enemy_cqbw_skill_02_hit'] } } } } } } };
  try {
    const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
    a.install();
    fw.fire('pointerdown');
    await new Promise((r) => setTimeout(r, 10));
    a.setFieldUnits([{ id: 9, kind: 'enemy', side: 'enemy', defId: 'enemy_1504_cqbw', spine: 'enemy_1504_cqbw' },
      { id: 3, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_102_texas' }]);
    const requested = [];
    const buffer = a._buffer.bind(a);
    a._buffer = (url) => { requested.push(String(url).split('/').pop()); return buffer(url); };
    const settle = () => new Promise((r) => setTimeout(r, 10));
    a.handleBattleEvents([['cast', 9, 0, 0]]);
    await settle();
    assert.deepEqual(requested, ['c4_throw.mp3', 'c4_fuse.mp3'], 'the cast');
    requested.length = 0;
    a.handleBattleEvents([['cast', 3, 0]]);   // an operator's slot: not an enemy cast
    a.handleBattleEvents([['cast', 9, 4]]);   // a slot without sounds
    a.fxKey('enemy_cqbw_attack_01_hit');      // its normal attack's effect: not a skill impact
    await settle();
    assert.deepEqual(requested, []);
    a.fxKey('ENEMY_CQBW_SKILL_02_HIT');
    a.fxKey('enemy_cqbw_skill_02_hit');       // the same moment's second target: its own effect, its own sound (no remake gap)
    await settle();
    assert.deepEqual(requested, ['c4_boom.mp3', 'c4_boom.mp3'], 'each impact effect plays (official SoundFXBank: no time between plays)');
  } finally {
    globalThis.fetch = origFetch;
  }
});
