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
  assert.ok(STATE_BUFFS['enemy_ftzlc[boom]'], 'Cabbage Seedling: its glow while ignited');
});
