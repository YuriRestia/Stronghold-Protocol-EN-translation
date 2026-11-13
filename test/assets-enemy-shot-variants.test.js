// (fork) Enemy sound leftovers job 1 (crew-docs/enemy-sound-audit.md): shot banks named for another enemy or a kit moment
// (tools/assets/audio.mjs ENEMY_SHOT_SOUNDS) and the attacks of other official modes (ENEMY_ATTACK_VARIANTS), from the
// generator (pickEnemySfx) to the client (public/js/audio.js). Bank names and files are the official CN audio_data ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { pickEnemySfx, ENEMY_SHOT_SOUNDS, ENEMY_ATTACK_VARIANTS } from '../tools/assets/audio.mjs';
import { AudioManager } from '../public/js/audio.js';

const f = (stem) => [`enemy/x/${stem}.mp3`];
function fake(unit, shots = {}) {
  const banks = new Map(Object.entries(unit).map(([k, v]) => [k, f(v)]));
  const all = new Map(Object.entries(shots).map(([k, v]) => [k, f(v)]));
  return { banks, bank: (name) => all.get(name) || [] };
}
const opts = (id) => ({ shots: ENEMY_SHOT_SOUNDS[id], variants: ENEMY_ATTACK_VARIANTS[id] });

test('高能源石虫 / 卷心籽: the death blast is a shot of another name, heard at the sim\'s deathBoom fx', () => {
  let { banks, bank } = fake({ 'ON_ABILITY_HIT.combat': 'e_imp_general_n' }, { 'battle.ON_PROJECTILE_REACH.projectile_bslime': 'e_skill_bslimeexplo_n' });
  let s = pickEnemySfx(banks, bank, 'bslime', opts('enemy_1021_bslime'));
  assert.deepEqual(s.hit, f('e_imp_general_n'), 'its attack unchanged');
  assert.deepEqual(s.fx, { 'explode|': [f('e_skill_bslimeexplo_n')] });
  ({ banks, bank } = fake({ 'ON_ABILITY_START.combat': 'e_atk_wlgrsckft', 'ON_ABILITY_HIT.combat': 'e_imp_wlgrsckft' },
    { 'battle.ON_PROJECTILE_BORN.projectile_enemy_ftzlc': 'e_imp_wlgrsckxpl' }));
  s = pickEnemySfx(banks, bank, 'ftzlc', opts('enemy_10065_ftzlc'));
  assert.deepEqual(s.fx, { 'explode|': [f('e_imp_wlgrsckxpl')] });
  assert.equal(s.next, undefined, 'a melee enemy: its shot is not part of its attack');
});

test('假想敌：蚀裂: the lob at its killer launches with the fissureDie fx', () => {
  const { banks, bank } = fake({ 'ON_ABILITY_START.combat.0': 'e_atk_vnmsct', 'ON_ABILITY_HIT.combat.0': 'e_imp_vnmsct' },
    { 'battle.ON_PROJECTILE_BORN.projectile_enemy_actoxi': 'e_atk_vnmsctfr', 'battle.ON_PROJECTILE_REACH.projectile_enemy_actoxi': 'e_imp_vnmsctfr' });
  const s = pickEnemySfx(banks, bank, 'actoxi', opts('enemy_9006_actoxi'));
  assert.deepEqual([s.attack, s.hit], [f('e_atk_vnmsct'), f('e_imp_vnmsct')]);
  assert.deepEqual(s.fx, { 'ability|': [f('e_atk_vnmsctfr')] });
});

test('潜水员 / 腐败骑士: a second impact bank rings with the impact (hitNext)', () => {
  let { banks, bank } = fake({ 'ON_ABILITY_ON.attack': 'e_atk_arrow_h' },
    { 'battle.ON_PROJECTILE_HIT.projectile_enemy_divman': 'e_imp_arrow_d', 'battle.ON_PROJECTILE_REACH.projectile_enemy_divman': 'e_imp_watersplash_n' });
  let s = pickEnemySfx(banks, bank, 'divman', opts('enemy_1158_divman'));
  assert.deepEqual([s.attack, s.hit, s.hitNext], [f('e_atk_arrow_h'), f('e_imp_arrow_d'), [f('e_imp_watersplash_n')]]);
  ({ banks, bank } = fake({ 'ON_ABILITY_START.combat': 'e_skill_hugeaxe_cast', 'ON_ABILITY_HIT.combat': 'e_skill_hugeaxe_hit', 'ON_ABILITY_START.ChargeAttack': 'e_skill_charge' },
    { 'battle.ON_PROJECTILE_HIT.projectile_enemy_dekght': 'e_imp_blade_n' }));
  s = pickEnemySfx(banks, bank, 'dekght', opts('enemy_1513_dekght'));
  assert.deepEqual([s.attack, s.hit, s.hitNext], [f('e_skill_hugeaxe_cast'), f('e_skill_hugeaxe_hit'), [f('e_imp_blade_n')]]);
});

test('attack variants: 锏\'s second form, “余音”\'s dark form, 萨卡兹枯朽前锋\'s arts strike', () => {
  let { banks, bank } = fake({ 'ON_ABILITY_ON.attack': 'e_imp_blkswd_n', 'ON_ABILITY_ON.attack.1': 'e_imp_blkswd_h', 'ON_ABILITY_START.CircleAttack': 'e_atk_circleatk_n' });
  let s = pickEnemySfx(banks, bank, 'blkswb', opts('enemy_1525_blkswb'));
  assert.deepEqual(s.attack, f('e_imp_blkswd_n'));
  assert.deepEqual(s.variants, { form2: { attack: f('e_imp_blkswd_h') } });
  ({ banks, bank } = fake({ 'ON_ABILITY_HIT.combat.0': 'e_imp_slstrmnhg_n_u', 'ON_ABILITY_HIT.combat.1': 'e_imp_slstrmnlw_n_u' }));
  s = pickEnemySfx(banks, bank, 'acdums', opts('enemy_9023_acdums'));
  assert.deepEqual([s.hit, s.variants], [f('e_imp_slstrmnhg_n_u'), { echo_dark: { hit: f('e_imp_slstrmnlw_n_u') } }]);
  ({ banks, bank } = fake({ 'ON_ABILITY_HIT.combat.0': 'e_imp_sword_n', 'ON_ABILITY_HIT.combat.1': 'e_imp_sword_longmen' }));
  s = pickEnemySfx(banks, bank, 'lrsldr', opts('enemy_1422_lrsldr_2'));
  assert.deepEqual([s.hit, s.variants], [f('e_imp_sword_n'), { 'dmg:arts': { hit: f('e_imp_sword_longmen') } }]);
  // no table entry, or the ability missing: nothing new
  assert.equal(pickEnemySfx(banks, bank, 'lrsldr').variants, undefined);
  assert.equal(pickEnemySfx(banks, bank, 'lrsldr', { variants: { x: 'combat.7' } }).variants, undefined);
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

test('client: forms pick the variant, an arts impact its dmg variant, hitNext with the impact, the death blast at its fx', async () => {
  const fw = fakeWindow();
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  const vm = { audio: { bgm: {}, sfx: { ui: {}, battle: { enemyHit: '/s/generic.mp3' }, pools: {}, units: {
    enemy_1525_blkswb: { attack: '/s/blkswd_n.mp3', variants: { form2: { attack: '/s/blkswd_h.mp3' } } },
    enemy_9023_acdums: { hit: '/s/hg.mp3', variants: { echo_dark: { hit: '/s/lw.mp3' } } },
    enemy_1422_lrsldr: { hit: '/s/sword_n.mp3', variants: { 'dmg:arts': { hit: '/s/longmen.mp3' } } },
    enemy_1158_divman: { attack: '/s/arrow_h.mp3', hit: '/s/arrow_d.mp3', hitNext: [{ url: '/s/splash.mp3' }] },
    enemy_1021_bslime: { hit: '/s/general_n.mp3', fxSounds: { 'explode|': { url: '/s/explo.mp3' } } },
  } } } };
  try {
    const a = new AudioManager({ win: fw.win, getManifest: () => vm, random: () => 0 });
    a.install();
    fw.fire('pointerdown');
    await new Promise((r) => setTimeout(r, 10));
    const field = () => a.setFieldUnits([
      { id: 1, kind: 'enemy', side: 'enemy', defId: 'enemy_1525_blkswb', spine: 'enemy_1525_blkswb' },
      { id: 2, kind: 'enemy', side: 'enemy', defId: 'enemy_9023_acdums', spine: 'enemy_9023_acdums' },
      { id: 4, kind: 'enemy', side: 'enemy', defId: 'enemy_1422_lrsldr', spine: 'enemy_1422_lrsldr' },
      { id: 5, kind: 'enemy', side: 'enemy', defId: 'enemy_1158_divman', spine: 'enemy_1158_divman' },
      { id: 6, kind: 'enemy', side: 'enemy', defId: 'enemy_1021_bslime', spine: 'enemy_1021_bslime' },
      { id: 30, kind: 'op', side: 'ally', defId: 'chess_x', spine: 'char_102_texas' }]);
    field();
    const requested = [];
    // what plays (_play: the unit sounds; _playBank: hitNext / fxSounds parts), not what loads (a file loads once)
    const play = a._play.bind(a), bankPlay = a._playBank.bind(a);
    a._play = (url, o) => { requested.push(String(url).split('/').pop()); return play(url, o); };
    a._playBank = (url, pool, v) => { requested.push(String(url).split('/').pop()); return bankPlay(url, pool, v); };
    const run = async (ev) => {
      a.lastAttacker.clear();
      a.limiter.lastByUnit.clear();
      requested.length = 0;
      a.handleBattleEvents(ev);
      await new Promise((r) => setTimeout(r, 10));
      // an enemy with no swing of its own plays the generic one (battle enemyHit), as before; its own sounds are checked here
      return requested.filter((x) => x !== 'generic.mp3');
    };
    assert.deepEqual(await run([['atk', 1, 30, 'none']]), ['blkswd_n.mp3'], '锏, first form');
    assert.deepEqual(await run([['fx', 'revive', 0, 0, { id: 1, form: 'form2', kind: 'reborn' }], ['atk', 1, 30, 'none']]), ['blkswd_h.mp3'], 'second form');
    assert.deepEqual(await run([['atk', 2, 30, 'none'], ['dmg', 30, 10, 'arts']]), ['hg.mp3'], '“余音”, gold form');
    assert.deepEqual(await run([['fx', 'phase', 0, 0, { id: 2, kind: 'echo_dark' }], ['atk', 2, 30, 'none'], ['dmg', 30, 10, 'arts']]), ['lw.mp3'], 'dark form');
    assert.deepEqual(await run([['fx', 'phase', 0, 0, { id: 2, kind: 'echo_gold' }], ['atk', 2, 30, 'none'], ['dmg', 30, 10, 'arts']]), ['hg.mp3'], 'gold again');
    assert.deepEqual(await run([['atk', 4, 30, 'none'], ['dmg', 30, 10, 'phys']]), ['sword_n.mp3'], '枯朽前锋 off the infection tile');
    assert.deepEqual(await run([['atk', 4, 30, 'none'], ['dmg', 30, 10, 'arts']]), ['longmen.mp3'], 'on it: an arts strike');
    assert.deepEqual(await run([['atk', 5, 30, 'enemy'], ['dmg', 30, 10, 'phys']]), ['arrow_h.mp3', 'arrow_d.mp3', 'splash.mp3'], '潜水员');
    assert.deepEqual(await run([['fx', 'explode', 0, 0, { id: 6, kind: 'deathBoom', r: 1 }]]), ['explo.mp3'], '高能源石虫\'s death blast');
    // a new field: the forms are gone
    field();
    assert.deepEqual(await run([['atk', 1, 30, 'none']]), ['blkswd_n.mp3']);
  } finally {
    globalThis.fetch = origFetch;
  }
});
