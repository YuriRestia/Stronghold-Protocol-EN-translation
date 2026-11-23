// Content tests for user playtest #4 items 11 and 12 (server/sim/content/tokens.js, kits/ops/…2_02-silent.js):
//   #11 赫默's 医疗无人机 comes with her S2 — since user playtest #6 it is a hand piece the player places, it deploys
//       once on that tile at the battle start (PRTS 卫戍协议/帮助 §作战阶段; settled by the user after playtest #6 —
//       shared/constants.js SKILL_SUMMON_START_DEPLOY) and re-appears there each time S2 fires
//       (test/content/playtest6_summons.test.js, the prep side test/match/playtest6_summons.test.js);
//   #12 the 炎 bond's “炎佑” (PRTS “炎佑” 级别0(卫戍协议)): follows the highest-aggro enemy of the whole field and stays
//       where it is without one (no fixed return point); 祛恶之焰 [模式乙] locks one target, channels up to 20 s (no normal
//       attacks meanwhile), ends when the lock is lost or on silence; burn on every damage it deals; 元素脆弱 aura
//       (radius 1.5); immune to element damage; bond stats = template + 30 % of the 炎 sums.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { hasGeneratedData } from '../../server/sim/simdata.js';
import { spawnYanyou, TOKEN_IDS } from '../../server/sim/content/tokens.js';
import { fxStateView } from '../../server/sim/snapshot.js';

const REAL = { skip: !hasGeneratedData() };
const dummy = (o = {}) => enemyRec({ key: o.key ?? 'enemy_dummy', hp: 1e7, speed: 0, ...o });
const guard = (o = {}) => chessRec({ id: 'test_guard', profession: 'WARRIOR', skill: null, stats: { atk: 0, maxHp: 1e5, def: 0 }, ...o });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const flameRec = (h) => h.b.data.rawToken(TOKEN_IDS.yanyou).skills.find((s) => s.prefabKey === 'Skill_2');

// =====================================================================================================================
// #11 赫默

test('#11 赫默 (full kit, default S2): the placed 医疗探机 deploys once at battle start (10 s), then again when 医疗无人机 fires', REAL, () => {
  const h = makeBattle({
    defs: { chess: { test_guard: guard() } },
    units: [{ chessId: 'chess_char_2_02_a', row: 10, col: 3, uid: 1 }, { chessId: 'test_guard', row: 10, col: 4, uid: 2 }, { kind: 'token', tokenId: TOKEN_IDS.healDrone, ownerUid: 1, row: 9, col: 4, uid: 3 }],
    autoFinish: false, timeLimit: 90,
  });
  h.step();
  const hm = h.unit('chess_char_2_02_a');
  assert.equal(hm.skill.id, 'skchr_silent_2');
  const drones = () => h.b.allyUnits.filter((u) => u.defId === TOKEN_IDS.healDrone && u.alive);
  assert.equal(drones().length, 1, 'the free start deploy (PRTS: "作战开始时无视持有状态自动部署1个")');
  assert.deepEqual([drones()[0].tileR, drones()[0].tileC], [9, 4], 'on its piece\'s tile');
  h.unit('test_guard').hp = 1000;
  h.run(10.5);
  assert.equal(hm.skill.activations, 0);
  assert.equal(drones().length, 0, 'gone after its 10 s; no second one before the skill');
  assert.ok(h.runUntil(() => hm.skill.activations >= 1, 30), 'S2 fires once its SP is full (initSp 0)');
  h.step();
  assert.equal(drones().length, 1, 'the drone comes with the skill');
  assert.equal(drones()[0].ownerUnit, hm);
  checkInvariants(h.b);
});

// =====================================================================================================================
// #12 炎佑

test('#12 炎佑 stays where it is when no enemy is on the field (no fixed return point)', REAL, () => {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [], enemies: [{ key: 'enemy_dummy', pos: [9, 4] }], autoFinish: false, timeLimit: 90 });
  h.step();
  const [y] = spawnYanyou(h.b, 'p1', { atk: 1000, hp: 5000 });
  const home = { x: y.x, y: y.y };
  const e = h.enemy('enemy_dummy');
  assert.ok(h.runUntil(() => dist(y, e) <= 0.3, 30), 'flies over the enemy');
  h.b.dealDamage(null, e, { amount: 1e9, type: 'true' });
  assert.equal(e.alive, false);
  h.step();
  const at = { x: y.x, y: y.y };
  assert.ok(Math.hypot(at.x - home.x, at.y - home.y) > 1, 'it had left its spawn point');
  h.run(10);
  assert.ok(Math.abs(y.x - at.x) < 1e-9 && Math.abs(y.y - at.y) < 1e-9, `hovers in place (${y.x.toFixed(2)},${y.y.toFixed(2)} vs ${at.x.toFixed(2)},${at.y.toFixed(2)})`);
  // an empty field from the start: it never moves
  const h2 = makeBattle({ units: [], autoFinish: false, timeLimit: 30 });
  h2.step();
  const [y2] = spawnYanyou(h2.b, 'p1', { atk: 1000, hp: 5000 });
  const p0 = { x: y2.x, y: y2.y };
  h2.run(10);
  assert.deepEqual({ x: y2.x, y: y2.y }, p0);
  checkInvariants(h.b);
});

test('#12 炎佑 tracks the highest-aggro enemy of the whole field (least remaining path), not the nearest one', REAL, () => {
  // two standing enemies on the walk route to the goal (9,2): (9,4) is 2 tiles from it, (12,9) far away
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [], enemies: [{ key: 'enemy_dummy', pos: [12, 9] }, { key: 'enemy_dummy', pos: [9, 4] }], autoFinish: false, timeLimit: 90 });
  h.step();
  const [y] = spawnYanyou(h.b, 'p1', { atk: 0, hp: 5000 });
  const [far, lead] = h.enemies();
  assert.ok(h.b.remainingDistance(lead) < h.b.remainingDistance(far), 'fixture: (9,4) leads');
  // start next to the far enemy: it still leaves it for the leader
  y.x = far.x; y.y = far.y;
  assert.ok(h.runUntil(() => dist(y, lead) <= 0.3, 40), 'flies over the leading enemy');
  h.run(3);
  assert.ok(dist(y, lead) <= 0.3, 'and keeps hovering over it');
});

test('#12 祛恶之焰 [模式乙]: locks the normal attack target, no normal attacks while channelling, ends when the target dies', REAL, () => {
  const burn = [];
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: dummy(), enemy_frail: dummy({ key: 'enemy_frail', hp: 1e7 }) } }, units: [],
    enemies: [{ key: 'enemy_frail', pos: [10, 6] }, { key: 'enemy_dummy', pos: [10, 6] }], autoFinish: false, timeLimit: 120, captureNoisy: true, hooks: ['damaged'],
    setup: (b) => b.on('damaged', (c) => { if (c.type === 'element' && c.dmg?.tags?.includes('yanyou')) burn.push({ t: b.time, id: c.target.id }); }),
  });
  h.step();
  const [y] = spawnYanyou(h.b, 'p1', { atk: 0, hp: 50000 });   // ATK 600 (template): no burn burst in the test window
  const sk = flameRec(h);
  assert.deepEqual([sk.cooldown, sk.initCooldown, sk.bb.atk_scale, sk.bb.hit_duration, sk.bb.range_radius], [15, 15, 0.6, 20, 1], 'official Skill_2 blackboard');
  assert.ok(h.runUntil(() => y.skill.active, 25), '祛恶之焰');
  const t = y.mem.flame.target;
  assert.ok(t && t.alive, 'locked target');
  // (fork) the official channel buff's range effect on the locked target only (b.snap fxs), given by 炎佑
  const flameRows = (u) => (fxStateView(u, h.b.time) || []).filter((r) => r[0] === 'acloon_s_2');
  assert.deepEqual(h.enemies().map((e) => flameRows(e).length), h.enemies().map((e) => (e === t ? 1 : 0)));
  assert.deepEqual(flameRows(t), [['acloon_s_2', y.id, null]]);
  const attacks = y.stats.attacks;
  for (const e of h.enemies()) e.elem.burn = 0;               // the normal attacks' burn so far: keep the gauges unburst
  const burnBefore = burn.length;
  h.run(4.05);
  assert.equal(y.stats.attacks, attacks, 'no normal attack while channelling');
  assert.equal(y.mem.flame.target, t, 'the lock holds');
  // 5 ticks (at once, then every second): both enemies (same tile) burn from every flame tick
  assert.ok(burn.length - burnBefore >= 2 * 5, `burn from the flame ticks (${burn.length - burnBefore})`);
  assert.ok(y.skill.active);
  // the locked target dies → the channel ends at once (no retarget), long before its 20 s
  h.b.dealDamage(null, t, { amount: 1e12, type: 'true' });
  h.step();
  assert.equal(y.skill.active, false, 'ends with its target');
  assert.ok(h.b.time - y.skill.lastStart < sk.bb.hit_duration - 5);
  assert.equal(y.mem.flame, null);
  // normal attacks resume; the next flame needs the whole cooldown again
  const t1 = h.b.time;
  assert.ok(h.runUntil(() => y.stats.attacks > attacks, 5), 'attacks again');
  assert.ok(h.runUntil(() => y.skill.activations >= 2, 20));
  assert.ok(h.b.time - t1 >= sk.cooldown - 0.5, `cooldown after the channel (${(h.b.time - t1).toFixed(2)} s)`);
  checkInvariants(h.b);
});

test('#12 祛恶之焰 lasts at most hit_duration on a surviving target, and silence ends it at once', REAL, () => {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [], enemies: [{ key: 'enemy_dummy', pos: [10, 6] }], autoFinish: false, timeLimit: 120 });
  h.step();
  const [y] = spawnYanyou(h.b, 'p1', { atk: 100, hp: 50000 });
  assert.ok(h.runUntil(() => y.skill.active, 25));
  const t0 = y.skill.lastStart;
  assert.ok(h.runUntil(() => !y.skill.active, 25));
  const len = h.b.time - t0;
  assert.ok(Math.abs(len - flameRec(h).bb.hit_duration) < 0.1, `20 s channel (${len.toFixed(2)})`);
  assert.ok(h.runUntil(() => y.skill.active, 20), 'next flame');
  const t = y.mem.flame.target;
  h.b.applyStatus(y, 'silence', { duration: 3, source: null });
  h.step();
  assert.equal(y.skill.active, false, 'silenced: the channel ends');
  assert.deepEqual((fxStateView(t, h.b.time) || []).filter((r) => r[0] === 'acloon_s_2'), [], '(fork) its official range effect ends with it');
});

test('#12 炎佑: 元素脆弱 aura within 1.5 of itself, immune to element damage, burn = 20 % ATK on normal hits', REAL, () => {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [], enemies: [{ key: 'enemy_dummy', pos: [10, 6] }, { key: 'enemy_dummy', pos: [10, 8] }], autoFinish: false, timeLimit: 60 });
  h.step();
  const [y] = spawnYanyou(h.b, 'p1', { atk: 400, hp: 5000 });
  // pin it at (10, 4.8): the enemy at (10,6) is 1.2 away, the one at (10,8) 3.2
  h.b.addBuff(y, { key: 'test:pin', persist: true, flags: { noMove: true } });
  y.x = 4.8; y.y = 10;
  h.run(0.5);
  const [near, far] = h.enemies();
  assert.ok(near.findBuff('elemFragile'), '1.2 away: 元素脆弱');
  assert.ok(!far.findBuff('elemFragile'), '3.2 away: none');
  assert.ok(Math.abs(near.s.elementalTakenMul - 1.2) < 1e-9, '元素伤害 ×1.2');
  // element damage on the dragon is cancelled
  h.b.dealDamage(near, y, { type: 'element', element: 'burn', amount: 800 });
  assert.equal(y.elem.burn, 0, 'no burn gauge on 炎佑');
  // normal hits: burn = ATK × 0.2 per hit — the 1.2 元素脆弱 (2.damage_scale) raises 元素伤害, never the gauge fill
  const before = near.elem.burn;
  assert.ok(h.runUntil(() => near.elem.burn > before, 5));
  const tal = h.b.data.rawToken(TOKEN_IDS.yanyou).talents.bb;
  assert.ok(Math.abs(near.elem.burn - before - y.s.atk * tal['2.ep_damage_ratio']) < 1e-6, `burn per hit ${near.elem.burn - before}`);
  checkInvariants(h.b);
});
