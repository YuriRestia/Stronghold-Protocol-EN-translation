// test/content/achunt-hit.test.js — (fork) OpFor: Gun (enemy_9017_achunt, bosses.js kitGun): its charge's hit on each unit.
// The client's talent 3 (AuraAbility in mode S1) gives every unit it hits achunt_s_1[damage], whose ON_BUFF_START plays
// enemy_achunt_skill_1_hit on it once (life IMMEDIATELY). The sim signals it display only (Battle.fxState → b.snap fxs,
// src the gun, for HIT_ROW_S); the client's talent plan holds that hit row as a state row of the buff (skills.js place).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import * as enemiesMod from '../../server/sim/content/enemies.js';
import * as bossesMod from '../../server/sim/content/bosses.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { STATE_BUFFS } from '../../public/js/render/vfx/skills.js';
import { talentBindings } from '../../public/js/render/vfx/talents.js';

const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const HIT = 'achunt_s_1[damage]';
const WALL = (id, def = 0) => chessRec({ id, profession: 'TANK', stats: { atk: 0, maxHp: 1e7, def, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });
const NOATK = () => ({ trait: { noAttack: true } });
const pool = (hp) => ({ hp, maxHp: hp, damage(pid, a) { this.hp = Math.max(0, this.hp - a); } });
const hitRows = (u, t) => (fxStateView(u, t) || []).filter((r) => r[0] === HIT);

test("the charge's hit: each unit it tramples carries achunt_s_1[damage] from the gun, once, for a moment", () => {
  const h = makeBattle({
    content: 'generic', extraContent: [enemiesMod, bossesMod], seed: 7, autoFinish: false, timeLimit: 600,
    kind: 'boss', sharedBoss: pool(1e6),
    defs: { chess: { t_wall: WALL('t_wall', 300), t_wall2: WALL('t_wall2') } }, kits: { t_wall: NOATK, t_wall2: NOATK },
    units: [{ chessId: 't_wall', row: 10, col: 5 }, { chessId: 't_wall2', row: 10, col: 7 }],
  });
  h.step();
  const e = h.spawn('enemy_9017_achunt', { pos: [3, 10], routeIndex: 0, mods: { speedMul: 0 }, tag: 'boss' });
  const s = E.enemy_9017_achunt.skills.find((x) => x.prefabKey === '1');
  const trampled = h.unit('t_wall2');
  h.run(s.initCooldown);
  assert.deepEqual(hitRows(trampled, h.b.time), [], 'nothing before the charge');
  assert.ok(h.runUntil(() => trampled.stats.taken > 0, 10), 'the charge reaches it');
  assert.deepEqual(hitRows(trampled, h.b.time), [[HIT, e.id, null]], 'the hit, src the gun');
  h.run(1.1);
  assert.deepEqual(hitRows(trampled, h.b.time), [], 'gone after HIT_ROW_S: played once');
  checkInvariants(h.b); assert.deepEqual(h.b.errors, []);
});

test('the client: the hit row is a state row of the buff, played once (operators keep their hit rows on attacks)', () => {
  assert.ok(STATE_BUFFS[HIT]);
  const use = (unit, buff, key) => ({ role: 'hit', keys: [key], from: 'AuraAbility._buffs → template t', event: 'ON_BUFF_START',
    action: 'CreateEffect', on: 'targets', buff, node: 'T', life: { type: 'IMMEDIATELY' } });
  const unit = (buff, key) => ({ kind: 'enemy', modes: [], talents: { 3: { nodes: [{ node: 'T', class: 'Talent', ability: 'AuraAbility', when: 'passive' }], uses: [use(null, buff, key)] } } });
  const idx = { units: { enemy_x: unit(HIT, 'enemy_achunt_skill_1_hit'), char_x: unit(HIT, 'enemy_achunt_skill_1_hit') },
    prefabs: { enemy_achunt_skill_1_hit: { looping: false } } };
  const [en] = talentBindings(idx, 'enemy_x');
  assert.deepEqual(en.plan.state.map((e) => [e.key, e.buff, e.loop]), [['enemy_achunt_skill_1_hit', HIT, false]]);
  const [op] = talentBindings(idx, 'char_x');
  assert.deepEqual(op.plan.state, [], 'not for an operator');
});
