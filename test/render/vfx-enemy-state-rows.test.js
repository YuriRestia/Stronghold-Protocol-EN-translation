// test/render/vfx-enemy-state-rows.test.js — (fork) the enemies' official condition effects on the client (enemy VFX
// audit, S-M rows): a b.snap fxs row of a talent buff finds that buff's rows through TalentFx.targetRows, also when
// no binding holds them — a use on a child of its talent's node (an ActiveAbilityWrapper's inner ability) or one
// planned at an event the client never sees (plan.trigger) — and the STATE_BUFFS looks narrow them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TalentFx } from '../../public/js/render/vfx/talentfx.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';

const prefabs = Object.fromEntries(['guard_buff', 'guard_pass', 'fin_move', 'singer_warn', 'singer_song', 'singer_aspd']
  .map((k) => [k, { file: `prefabs/${k}.json`, looping: k !== 'singer_song' }]));
const loop = (k, buff, node, o = {}) => ({ role: 'loop', keys: [k], from: 'PassiveBuffAbility._buffs', on: 'owner', buff, node, template: 'empty', life: { type: 'INFINITY' }, ...o });
const idx = {
  units: {
    enemy_1174_duholy: { kind: 'enemy', modes: [{ name: 'Default' }], talents: {
      // its trait: the use sits on the wrapper's inner node; a passive beside it keeps the unit drawable
      traitAbility: { nodes: [{ node: 'Talent/traitAbility', class: 'Talent', ability: 'ActiveAbilityWrapper', when: null }],
        uses: [loop('guard_buff', 'duholy_traitAbility[TauntLevelUp]', 'Talent/traitAbility/TauntLevelUp')] },
      refracting: { nodes: [{ node: 'Talent/refracting', class: 'Talent', ability: 'PassiveBuffAbility', when: 'passive' }],
        uses: [loop('guard_pass', 'refract', 'Talent/refracting')] },
    } },
    enemy_10045_parrot: { kind: 'enemy', modes: [{ name: 'Fly' }], talents: {
      M0SpeedUp: { nodes: [{ node: 'Modes/Fly/Body/Talents/M0SpeedUp', class: 'Talent', ability: 'PassiveBuffAbility', mode: 'Fly', when: 'passive' }],
        uses: [loop('fin_move', 'parrot_m0_t[speed_up]', 'Modes/Fly/Body/Talents/M0SpeedUp', { event: 'ON_TAKE_DAMAGE', action: 'CreateBuff', from: 'PassiveBuffAbility._buffs → template parrot_m0_t[speed_up]', mode: 'Fly' })] },
      Other: { nodes: [{ node: 'Talents/Other', class: 'Talent', ability: 'PassiveBuffAbility', when: 'passive' }],
        uses: [loop('guard_pass', 'x', 'Talents/Other')] },
    } },
    enemy_2010_csdcr: { kind: 'enemy', modes: [{ name: 'Default' }], talents: {
      AttackSpeedUp: { nodes: [{ node: 'Talent/AttackSpeedUp', class: 'Talent', ability: 'PassiveBuffAbility', when: 'passive' }],
        uses: ['singer_warn', 'singer_song', 'singer_aspd'].map((k) => loop(k, 'csdcr_t', 'Talent/AttackSpeedUp', { event: 'ON_APPLIED_MODIFIER', action: 'CreateBuff', from: 'PassiveBuffAbility._buffs → template csdcr_t' })) },
      Other: { nodes: [{ node: 'Talents/Other', class: 'Talent', ability: 'PassiveBuffAbility', when: 'passive' }],
        uses: [loop('guard_pass', 'x', 'Talents/Other')] },
    } },
  },
  skills: {}, projectiles: {}, prefabs,
};
const fx = () => new TalentFx({ idx, ofx: { active: true }, opts: {}, unitKeyOf: (v) => v.key, funnels: null });
const view = (id, key) => ({ id, key, info: { kind: 'enemy', key } });
const keys = (rows) => rows.map((e) => e.key);

test("a use on a talent node's child: its rows for the signalled buff (Dublinn Companion Guard)", () => {
  assert.deepEqual(keys(fx().targetRows(view(1, 'enemy_1174_duholy'), 'duholy_traitAbility[TauntLevelUp]')), ['guard_buff']);
  assert.ok(STATE_BUFFS['duholy_traitAbility[TauntLevelUp]']);
});

test('a use planned at an event the client never sees: its rows for the signalled buff (Lucky Flyfin)', () => {
  const rows = fx().targetRows(view(2, 'enemy_10045_parrot'), 'parrot_m0_t[speed_up]');
  assert.deepEqual(keys(rows), ['fin_move']);
  assert.equal(rows[0].loop, true);
});

test("a look narrows a buff's rows to its branch (Scarlet Singer: warn / song / aspd)", () => {
  const t = fx();
  const v = view(3, 'enemy_2010_csdcr');
  // the fake index's keys stand in for the official ones the STATE_BUFFS looks name
  const real = STATE_BUFFS.csdcr_t.looks;
  assert.deepEqual(Object.keys(real).sort(), ['aspd', 'song', 'warn']);
  assert.equal(keys(t.targetRows(v, 'csdcr_t')).length, 3, 'no look: every row');
  assert.deepEqual(keys(t.targetRows(v, 'csdcr_t', 'warn')), [], 'the look keeps the official keys only');
});

test('an unsignalled or unknown buff has no rows', () => {
  assert.deepEqual(fx().targetRows(view(4, 'enemy_1174_duholy'), 'nothing[here]'), []);
});

test("death bursts: Farseer's and Novice Acolyte's kit explode at a death plays their official die effect once (owner 'died')", async () => {
  const { ENEMY_FX_BINDINGS, ENEMY_FX_KINDS } = await import('../../public/js/render/vfx/skills.js');
  for (const [key, xkind, fx] of [['enemy_1407_hummbd', 'expose', 'enemy_hummbd_die_02'], ['enemy_10156_mncrer', 'heal', 'enemy_mncrer_die_start']]) {
    const b = ENEMY_FX_BINDINGS[key].explode;
    assert.deepEqual({ owner: b.owner, xkind: b.xkind, keys: [...b.keys], once: b.once }, { owner: 'died', xkind, keys: [fx], once: true });
    assert.ok(ENEMY_FX_KINDS.explode.includes(key));
  }
  // OpFor: Fissure: its kit's 'ability' fx of kind 'fissureDie' (killed by its target), beside its cloud's zone row
  const f = ENEMY_FX_BINDINGS.enemy_9006_actoxi;
  assert.deepEqual({ owner: f.ability.owner, xkind: f.ability.xkind, keys: [...f.ability.keys], once: f.ability.once }, { owner: 'died', xkind: 'fissureDie', keys: ['enemy_actoxi_die_2_start'], once: true });
  assert.equal(f.zone.xkind, 'poison', 'the zone row kept');
  assert.deepEqual(ENEMY_FX_KINDS.ability, ['enemy_9006_actoxi']);
  assert.ok(STATE_BUFFS['enemy_ftzlc[boom]'], 'Cabbage Seedling: its glow while ignited');
});

test("a kit 'ability' fx naming an ability binding by its key plays that ability's start rows once (Recidivist's LibertyOthersAbility)", () => {
  const ab = { name: 'LibertyOthersAbility', kind: 'general', node: 'Modes/L/LibertyOthersAbility', class: 'AnimatedActionToTargetAbility', modes: ['L'], when: null,
    uses: [{ role: 'start', keys: ['open_start'], from: 'UberEffectEmitter._castEffects', node: 'Modes/L/LibertyOthersAbility', ability: 'AnimatedActionToTargetAbility' }] };
  const i2 = { units: { enemy_1121_lifbos: { kind: 'enemy', modes: [{ name: 'Default' }, { name: 'L' }], abilities: [ab], talents: {
    Liberty: { nodes: [{ node: 'Modes/L/Talents/Liberty', class: 'Talent', ability: 'PassiveBuffAbility', mode: 'L', when: 'passive' }],
      uses: [loop('guard_pass', 'lifbos_liberty', 'Modes/L/Talents/Liberty', { mode: 'L' })] } } } },
  skills: {}, projectiles: {}, prefabs: { ...prefabs, open_start: { file: 'prefabs/open_start.json', looping: false } } };
  const v = view(7, 'enemy_1121_lifbos');
  const t = new TalentFx({ idx: i2, ofx: { active: true }, opts: {}, unitKeyOf: (x) => x.key, funnels: null, view: (id) => (id === 7 ? v : null) });
  const played = [];
  t._play = (e) => { played.push(e.key); return true; };
  assert.equal(t.fx('ability', { id: 7, name: 'LibertyOthersAbility' }, 5, 5), true);
  assert.deepEqual(played, ['open_start']);
  played.length = 0;
  assert.equal(t.fx('ability', { id: 7, name: 'SomethingElse' }, 5, 5), false);
  assert.deepEqual(played, []);
});
