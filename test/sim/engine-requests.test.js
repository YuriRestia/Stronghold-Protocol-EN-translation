// Engine change requests of the content review (docs/SIM.md): permanent rangeExtend in the initial range, forceAttack
// noAmmo, the massFlat mod, the attract (诱导) and resist (抵抗) statuses, extra range keys, content trigger ranges,
// skill onEnd order, redeploy { tile, keepSp }, path-first tactical points, statusApplied `entered`, layerGain `tile`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants, flatRoutes } from '../helpers/battleHarness.js';
import { COLS } from '../../server/sim/constants.js';
import { RESIST_STATUSES } from '../../server/sim/buffs.js';

const approx = (a, b, eps = 1e-6, msg = '') => assert.ok(Math.abs(a - b) <= eps, `${msg} ${a} ≈ ${b}`);
const K = (r, c) => r * COLS + c;
const RANGE3 = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [-1, 0], [-1, 1], [-1, 2], [-1, 3]];
const AROUND = [[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]];
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0, ...o });
const sniper = (skill = {}, o = {}) => chessRec({ id: 't_sn', profession: 'SNIPER', subProfessionId: 'closerange', rangeGrid: RANGE3, stats: { atk: 100, bat: 1, ...(o.stats || {}) }, skill: { spCost: 5, initSp: 0, duration: 2, ...skill }, ...o });
const guard = (o = {}) => chessRec({ id: 't_gd', profession: 'WARRIOR', rangeGrid: [[0, 0], [0, 1]], stats: { atk: 100, maxHp: 1e6, blockCnt: 3, cost: 10, respawnTime: 5, ...(o.stats || {}) }, skill: { spCost: 10, initSp: 0, duration: 5, ...(o.skill || {}) }, ...o });

// ---------------------------------------------------------------------------------------------------------------
// 1) baseRangeKeys = own grid + permanent rangeExtend

test('baseRangeKeys: the initial range includes permanent rangeExtend (persist, never-expiring) — DEFAULT trigger sees the module tile', () => {
  const h = makeBattle({
    defs: { chess: { t_sn: sniper({ spCost: 1, initSp: 1 }) }, enemies: { enemy_dummy: dummy() } },
    units: [{ chessId: 't_sn', row: 10, col: 4 }], content: 'generic', autoFinish: false, hooks: ['skillStart'],
    kits: { t_sn: () => ({ skill: { kind: 'duration', duration: 2 }, install(b, u) { b.addBuff(u, { key: 'module', mods: { rangeExtend: 1 }, persist: true, allowDead: true }); } }) },
  });
  const u = h.unit('t_sn');
  h.step();
  assert.ok(u.baseRangeKeys.includes(K(10, 8)), 'module tile (col +4) in the initial range');
  assert.ok(u.rangeKeySet.has(K(10, 8)));
  h.spawn('enemy_dummy', { pos: [10, 8] });
  assert.ok(h.runUntil(() => u.skill.activations === 1, 1), 'DEFAULT fires for an enemy on the module tile only');
  // relocation rebuilds it around the new tile
  h.b.relocate(u, 11, 3);
  assert.ok(u.baseRangeKeys.includes(K(11, 7)) && !u.baseRangeKeys.includes(K(11, 8)));
  checkInvariants(h.b);
});

test('baseRangeKeys: temporary / skill rangeExtend never counts; a permanent one added after deployment is picked up', () => {
  const h = makeBattle({
    defs: { chess: { t_sn: sniper({ spCost: 100 }) }, enemies: { enemy_dummy: dummy() } },
    units: [{ chessId: 't_sn', row: 10, col: 4 }], content: 'generic', autoFinish: false,
    kits: { t_sn: () => ({ skill: { kind: 'duration', duration: 2, targeting: { rangeExtend: 2 } } }) },
  });
  const u = h.unit('t_sn');
  h.step();
  h.b.addBuff(u, { key: 'temp', mods: { rangeExtend: 1 }, duration: 5 });
  h.step();
  assert.ok(u.rangeKeySet.has(K(10, 8)), 'temporary extend: current range');
  assert.ok(!u.baseRangeKeys.includes(K(10, 8)), 'not the initial range');
  u.skill.activate('test', { free: true });
  assert.ok(u.rangeKeySet.has(K(10, 10)), 'skill extend: current range');
  assert.ok(!u.baseRangeKeys.includes(K(10, 8)), 'skill range never the initial range');
  u.skill.end('test');
  h.b.removeBuff(u, 'temp');
  h.b.addBuff(u, { key: 'late', mods: { rangeExtend: 1 }, persist: true, allowDead: true });
  h.step();
  assert.ok(u.baseRangeKeys.includes(K(10, 8)), 'permanent extend added later: rebuilt on the next tick');
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 2) forceAttack noAmmo / onAttack ctx.noAmmo

test('forceAttack(u, targets, { noAmmo }): an extra attack that spends no bullet and emits no ammoUsed', () => {
  const h = makeBattle({
    defs: { chess: { t_sn: sniper({ spCost: 100 }) }, enemies: { enemy_dummy: dummy() } },
    units: [{ chessId: 't_sn', row: 10, col: 4 }], content: 'generic', autoFinish: false, hooks: ['ammoUsed', 'attack'], captureNoisy: true,
    kits: { t_sn: () => ({ skill: { kind: 'ammo', ammo: 5, onAttack(ctx) { if (ctx.unit.mem.freeShot) ctx.noAmmo = true; } } }) },
  });
  const u = h.unit('t_sn');
  h.step();
  const e = h.spawn('enemy_dummy', { pos: [10, 6] });
  h.b._buildEnemyIndex();
  u.skill.activate('test', { free: true });
  const n0 = u.stats.attacks;
  assert.equal(h.b.forceAttack(u, [e], { noAmmo: true }), true);
  assert.equal(u.stats.attacks, n0 + 1, 'it is an attack');
  assert.equal(u.skill.ammoLeft, 5, 'no bullet spent');
  assert.equal(h.hooksOf('ammoUsed').length, 0, 'no ammoUsed');
  h.b.forceAttack(u, [e]);
  assert.equal(u.skill.ammoLeft, 4, 'a plain forced attack spends one');
  assert.equal(h.hooksOf('ammoUsed').length, 1);
  u.mem.freeShot = true; // SkillSpec onAttack: ctx.noAmmo = true
  h.b.forceAttack(u, [e]);
  assert.equal(u.skill.ammoLeft, 4, 'onAttack ctx.noAmmo');
  assert.equal(h.hooksOf('ammoUsed').length, 1);
  u.mem.freeShot = false;
  // the last bullets: a noAmmo attack never ends the skill
  u.skill.ammoLeft = 1;
  h.b.forceAttack(u, [e], { noAmmo: true });
  assert.ok(u.skill.active && u.skill.ammoLeft === 1);
  h.b.forceAttack(u, [e]);
  assert.ok(!u.skill.active, 'the last real bullet ends it');
  // no target ⇒ false
  const far = makeBattle({ defs: { chess: { t_sn: sniper() } }, units: [{ chessId: 't_sn', row: 10, col: 4 }], content: 'generic', autoFinish: false });
  far.step();
  assert.equal(far.b.forceAttack(far.unit('t_sn'), null, { noAmmo: true }), false);
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 3) massFlat

test('massFlat: current massLevel (weight) for displacement and 浮空 halving; base untouched; floored at 0', () => {
  const h = makeBattle({ defs: { enemies: { enemy_heavy: enemyRec({ key: 'enemy_heavy', hp: 1e7, speed: 0, mass: 4 }) } }, units: [], content: 'none', autoFinish: false });
  h.step();
  const e = h.spawn('enemy_heavy', { pos: [10, 5] });
  assert.equal(e.s.massLevel, 4);
  // official 力度 − 重量 (PRTS 游戏数据基础 §重量公式): a 中力 push (1) on weight 4 = 受力等级 −3 ⇒ nothing
  const d1 = h.b.push(e, 1, { from: { x: 4, y: 10 } });
  assert.equal(d1, 0, 'weight 4 vs 中力: not moved');
  h.b.addBuff(e, { key: 'weightless', mods: { massFlat: -1 }, duration: 10 });
  assert.equal(e.s.massLevel, 3);
  assert.equal(e.weight, 3);
  assert.equal(e.base.massLevel, 4, 'base untouched');
  e.x = 5; e.y = 10;
  const d2 = h.b.push(e, 1, { from: { x: 4, y: 10 } });
  approx(d2, 0.12, 0.01, '失重 weight 3 vs 中力: 受力等级 −2 ⇒ 0.12 tiles (0.119 at 30 fps: a slide, GitHub #60)');
  h.b.applyStatus(e, 'levitate', { duration: 4 });
  approx(e.findBuff('levitate').timeLeft, 4, 1e-9, 'weight 3: full 浮空');
  h.b.removeStatus(e, 'levitate');
  h.b.removeBuff(e, 'weightless');
  h.b.applyStatus(e, 'levitate', { duration: 4 });
  approx(e.findBuff('levitate').timeLeft, 2, 1e-9, 'weight 4: halved');
  h.b.addBuff(e, { key: 'feather', mods: { massFlat: -10 } });
  assert.equal(e.s.massLevel, 0, 'never below 0');
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 4) attract (诱导)

test('attract: the enemy is released, walks (own speed) to the point, waits there, then resumes its route', () => {
  const h = makeBattle({
    defs: { chess: { t_gd: guard() }, enemies: { enemy_walker: enemyRec({ key: 'enemy_walker', hp: 1e7, speed: 1 }) } },
    units: [{ chessId: 't_gd', row: 9, col: 6 }], content: 'generic', autoFinish: false, hooks: ['statusApplied'],
    enemies: [{ key: 'enemy_walker', route: 0 }],
  });
  const g = h.unit('t_gd');
  const e = () => h.enemy('enemy_walker');
  assert.ok(h.runUntil(() => e() && e().blockedBy === g, 20), 'blocked first');
  assert.equal(h.b.applyStatus(e(), 'attract', { duration: 8, source: g, point: [11, 6] }), true);
  assert.equal(e().blockedBy, null, 'released');
  assert.ok(e().s.flags.unblockable && e().s.flags.attract);
  assert.equal(h.hooksOf('statusApplied').at(-1).entered, true);
  // grid path: back to the centre of the tile it stands on, then on to the point (it was blocked 0.71 tile in front of
  // the guard — the block radius — i.e. on (9,7))
  let walked = 0, [px, py] = [e().x, e().y];
  for (let i = 0; i < 30; i++) { h.step(); walked += Math.hypot(e().x - px, e().y - py); [px, py] = [e().x, e().y]; }
  approx(walked, 0.5, 0.02, 'own speed (1 × MOVE_SCALE) along the path');
  h.run(5);
  approx(e().x, 6, 1e-6); approx(e().y, 11, 1e-6, 'arrived');
  h.run(1);
  approx(e().y, 11, 1e-6, 'waits there');
  assert.ok(h.runUntil(() => !e().findBuff('attract'), 2), 'lasts its duration');
  const x1 = e().x;
  h.run(1.5);
  assert.ok(e().x < x1 - 0.3, 'resumes its route (toward the goal on the left)');
  checkInvariants(h.b);
});

test('attract: default point = the source tile; a new application moves the point; stun/bind stop it; flyers fly straight; resisted', () => {
  const h = makeBattle({
    defs: {
      chess: { t_gd: guard() },
      enemies: { enemy_walker: enemyRec({ key: 'enemy_walker', hp: 1e7, speed: 2 }), enemy_fly: enemyRec({ key: 'enemy_fly', hp: 1e7, speed: 2, motion: 'FLY' }) },
    },
    units: [{ chessId: 't_gd', row: 12, col: 3 }], content: 'generic', autoFinish: false,
  });
  h.step();
  const g = h.unit('t_gd');
  const w = h.spawn('enemy_walker', { pos: [9, 8], routeIndex: 0 });
  h.b.applyStatus(w, 'attract', { duration: 10, source: g });
  const A = w.findBuff('attract').data.attract;
  assert.deepEqual([A.r, A.c], [12, 3], 'default: the source tile');
  h.b.applyStatus(w, 'stun', { duration: 1 });
  const p0 = [w.x, w.y];
  h.run(0.9);
  assert.deepEqual([w.x, w.y], p0, 'stunned: no movement');
  h.run(0.5);
  assert.ok(w.x < p0[0] || w.y > p0[1], 'walks once the stun ended');
  h.b.applyStatus(w, 'attract', { duration: 10, source: g, point: [9, 9] });
  assert.deepEqual([w.findBuff('attract').data.attract.r, w.findBuff('attract').data.attract.c], [9, 9], 're-application moves the point');
  h.run(4);
  approx(w.x, 9, 1e-6); approx(w.y, 9, 1e-6);
  // flyer: straight line
  const f = h.spawn('enemy_fly', { pos: [9, 9], routeIndex: 2 });
  h.b.applyStatus(f, 'attract', { duration: 5, point: [11, 7] });
  h.run(0.5);
  const dx = 9 - f.x, dy = f.y - 9;
  approx(dx, dy, 1e-6, 'diagonal straight flight');
  // 抵抗 halves 诱导
  h.b.applyStatus(w, 'resist', { duration: 30 });
  h.b.removeStatus(w, 'attract');
  h.b.applyStatus(w, 'attract', { duration: 4, point: [10, 9] });
  approx(w.findBuff('attract').timeLeft, 2, 1e-9);
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 5) resist (抵抗)

test('resist: halves control statuses (not stat debuffs), never compounds, keeps a longer running status; statusApplied reports it', () => {
  const h = makeBattle({ defs: { chess: { t_gd: guard() } }, units: [{ chessId: 't_gd', row: 10, col: 4 }], content: 'generic', autoFinish: false, hooks: ['statusApplied'] });
  h.step();
  const u = h.unit('t_gd');
  assert.ok(RESIST_STATUSES.has('stun') && RESIST_STATUSES.has('attract') && !RESIST_STATUSES.has('weaken'));
  assert.equal(h.b.resistOf(u), 0);
  h.b.applyStatus(u, 'resist', { duration: 60 });
  approx(h.b.resistOf(u), 0.5, 1e-12, 'default value: half');
  h.b.applyStatus(u, 'stun', { duration: 4 });
  approx(u.findBuff('stun').timeLeft, 2, 1e-9);
  assert.equal(h.hooksOf('statusApplied').at(-1).duration, 2, 'statusApplied reports the resisted duration');
  h.b.applyStatus(u, 'weaken', { duration: 4 });
  approx(u.findBuff('weaken').timeLeft, 4, 1e-9, 'stat debuffs are not resisted');
  // several sources: never compound (same-name: strongest applies)
  h.b.applyStatus(u, 'resist', { duration: 60, value: 0.5 });
  h.b.addBuff(u, { key: 'module:resist', status: 'resist', data: { value: 0.3 }, persist: true, allowDead: true });
  approx(h.b.resistOf(u), 0.5, 1e-12);
  assert.equal(u.buffs.filter((b) => b.key === 'resist').length, 1, 'one resist status');
  h.b.removeStatus(u, 'stun');
  h.b.applyStatus(u, 'stun', { duration: 10 });
  approx(u.findBuff('stun').timeLeft, 5, 1e-9, '×0.5 once');
  h.run(1);
  h.b.applyStatus(u, 'stun', { duration: 8 }); // → 4 s < 4 s left… equal/shorter: the running one is kept
  approx(u.findBuff('stun').timeLeft, 4, 1e-6, 'a shorter resisted re-application never cuts the running one');
  // the permanent (persist) resist buff survives a knock-out; the status does not
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  approx(h.b.resistOf(u), 0.3, 1e-12);
  checkInvariants(h.b);
});

test('resist: a resisting enemy loses one 麻痹 stack every 5 s; the value scales the cut', () => {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [], content: 'none', autoFinish: false });
  h.step();
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  h.b.applyStatus(e, 'resist', { value: 0.25 });
  h.b.applyStatus(e, 'palsy', { value: 3 });
  assert.equal(e.findBuff('palsy').stacks, 3);
  h.run(5.05);
  assert.equal(e.findBuff('palsy').stacks, 2);
  h.run(5);
  assert.equal(e.findBuff('palsy').stacks, 1);
  h.run(5);
  assert.equal(e.findBuff('palsy'), null);
  h.b.applyStatus(e, 'cold', { duration: 4 });
  approx(e.findBuff('cold').timeLeft, 3, 1e-9, 'value 0.25 ⇒ ×0.75');
  h.b.applyStatus(e, 'resist', { value: 0.5, duration: 1 }); // stronger: takes over, the weaker one resumes after
  approx(h.b.resistOf(e), 0.5, 1e-12);
  h.run(1.1);
  approx(h.b.resistOf(e), 0.25, 1e-12, 'weaker resumes');
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 6) extra range keys

test('setExtraRange: extra tiles join the range across every rebuild (skill, relocate), never the initial range', () => {
  const h = makeBattle({
    defs: { chess: { t_sn: sniper({ spCost: 100 }) }, enemies: { enemy_dummy: dummy() } },
    units: [{ chessId: 't_sn', row: 10, col: 4 }], content: 'generic', autoFinish: false, hooks: ['attack'], captureNoisy: true,
    kits: { t_sn: () => ({ skill: { kind: 'duration', duration: 1, targeting: { rangeGrid: [[0, 0], [0, 1]] } } }) },
  });
  h.step();
  const u = h.unit('t_sn');
  const e = h.spawn('enemy_dummy', { pos: [10, 9] });
  h.run(1);
  assert.equal(h.hooksOf('attack').length, 0, 'out of range');
  assert.equal(h.b.setExtraRange(u, [K(10, 9), K(10, 9), -3, 1.5, 'x']), true);
  assert.deepEqual(u.extraRangeKeys, [K(10, 9)], 'junk filtered');
  assert.ok(u.rangeKeySet.has(K(10, 9)) && !u.baseRangeKeys.includes(K(10, 9)));
  h.run(1);
  assert.ok(h.hooksOf('attack').some((c) => c.targets.includes(e)), 'attacks the extra target');
  u.skill.activate('test', { free: true });
  assert.ok(u.rangeKeySet.has(K(10, 9)) && u.rangeKeySet.has(K(10, 5)) && !u.rangeKeySet.has(K(10, 6)), 'skill range ∪ extra');
  h.run(1.1);
  assert.ok(!u.skill.active && u.rangeKeySet.has(K(10, 9)) && u.rangeKeySet.has(K(10, 7)), 'normal range ∪ extra after the skill');
  h.b.relocate(u, 11, 4);
  assert.ok(u.rangeKeySet.has(K(10, 9)), 'absolute keys survive a relocation');
  h.b.setExtraRange(u, null);
  assert.equal(u.extraRangeKeys, null);
  assert.ok(!u.rangeKeySet.has(K(10, 9)));
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 7) content trigger ranges

test('addTriggerRange: an enemy in a content trigger range fires DEFAULT (attackers and non-attackers), not heal skills; unregister', () => {
  const far = [K(10, 9)];
  const h = makeBattle({
    defs: {
      chess: {
        t_sn: sniper({ spCost: 1, initSp: 1 }),
        t_bd: chessRec({ id: 't_bd', profession: 'SUPPORT', subProfessionId: 'bard', rangeGrid: [[0, 0]], skill: { spCost: 1, initSp: 1, duration: 2 } }),
        t_md: chessRec({ id: 't_md', profession: 'MEDIC', subProfessionId: 'physician', rangeGrid: [[0, 0]], skill: { spCost: 1, initSp: 1, duration: 2 } }),
        t_gd: guard(),
      },
      enemies: { enemy_dummy: dummy() },
    },
    units: [{ chessId: 't_sn', row: 10, col: 3 }, { chessId: 't_bd', row: 12, col: 3 }, { chessId: 't_md', row: 11, col: 2 }, { chessId: 't_gd', row: 11, col: 6 }],
    content: 'generic', autoFinish: false,
  });
  h.step();
  const sn = h.unit('t_sn'), bd = h.unit('t_bd'), md = h.unit('t_md'), gd = h.unit('t_gd');
  const offSn = sn.skill.addTriggerRange(() => [far]);
  bd.skill.addTriggerRange(() => [gd]);            // a unit entry: its current range counts
  md.skill.addTriggerRange(() => [far]);
  h.run(0.5);
  assert.equal(sn.skill.activations + bd.skill.activations + md.skill.activations, 0, 'nothing in any range yet');
  h.spawn('enemy_dummy', { pos: [11, 7] });       // in the guard's range only
  h.run(0.2);
  assert.equal(bd.skill.activations, 1, 'bard: enemy in the ally unit\'s range');
  assert.equal(sn.skill.activations, 0);
  offSn();
  h.spawn('enemy_dummy', { pos: [10, 9] });
  h.run(0.2);
  assert.equal(sn.skill.activations, 0, 'unregistered');
  sn.skill.addTriggerRange(() => [far]);
  h.run(0.2);
  assert.equal(sn.skill.activations, 1, 'attacker: fires although nothing is in its own range');
  assert.equal(sn.stats.attacks, 0);
  assert.equal(md.skill.activations, 0, 'heal skills ignore enemy trigger ranges');
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 8) onEnd order

test('skill end: onEnd runs with the skill mods and range still applied, then they are removed; re-activation in onEnd keeps them', () => {
  const seen = [];
  const h = makeBattle({
    defs: { chess: { t_sn: sniper({ spCost: 100 }) } },
    units: [{ chessId: 't_sn', row: 10, col: 4 }], content: 'generic', autoFinish: false, hooks: ['skillEnd'],
    kits: {
      t_sn: () => ({
        skill: {
          kind: 'duration', duration: 1, mods: { atkPct: 1 }, targeting: { rangeGrid: AROUND },
          onEnd({ unit, skill }) {
            seen.push({ atk: unit.s.atk, around: unit.rangeKeySet.has(K(unit.tileR, unit.tileC - 1)), active: skill.active });
            if (unit.mem.again) { unit.mem.again = false; skill.activate('again', { free: true }); }
          },
        },
      }),
    },
  });
  h.step();
  const u = h.unit('t_sn');
  u.skill.activate('test', { free: true });
  approx(u.s.atk, 200);
  h.run(1.1);
  assert.deepEqual(seen[0], { atk: 200, around: true, active: false }, 'skill ATK and range during onEnd');
  approx(u.s.atk, 100, 1e-9, 'removed afterwards');
  assert.ok(!u.rangeKeySet.has(K(10, 3)), 'normal range restored');
  assert.equal(h.hooksOf('skillEnd').length, 1);
  u.mem.again = true;
  u.skill.activate('test', { free: true });
  h.run(1.05);
  assert.equal(seen.length, 2);
  assert.ok(u.skill.active, 're-activated from onEnd');
  approx(u.s.atk, 200, 1e-9, 'the new activation keeps its mods');
  assert.ok(u.rangeKeySet.has(K(10, 3)));
  h.run(1.1);
  approx(u.s.atk, 100, 1e-9);
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 9) redeploy { free, tile, keepSp }

test('redeploy: { tile } lands on another tile (home unchanged; knocked out there, it comes back there); { keepSp } restores SP before deploy fires', () => {
  let atDeploy = null;
  const h = makeBattle({
    defs: { chess: { t_gd: guard({ skill: { spCost: 10, initSp: 2 } }), t_x: guard({ id: 't_x' }) } },
    units: [{ chessId: 't_gd', row: 10, col: 4 }, { chessId: 't_x', row: 11, col: 6 }], content: 'generic', autoFinish: false, hooks: ['deploy'],
    setup: (b) => b.on('deploy', (c) => { if (c.unit.defId === 't_gd' && !c.initial) atDeploy = c.unit.skill.sp; }),
  });
  h.step();
  const u = h.unit('t_gd');
  h.run(3);
  const sp = u.skill.sp;
  assert.ok(sp > 4.9 && sp < 5.1);
  h.b.retreat(u);
  assert.equal(h.b.redeploy(u, { tile: [11, 6] }), false, 'occupied landing tile: refused, no fallback');
  assert.ok(!u.alive);
  assert.equal(h.b.redeploy(u, { tile: [3, 3] }), false, 'outside the rect');
  assert.equal(h.b.redeploy(u, { tile: [10.5, 3] }), false, 'not a tile');
  assert.equal(h.b.redeploy(u, { tile: [12, 8], keepSp: true }), true);
  assert.deepEqual([u.tileR, u.tileC, u.homeR, u.homeC], [12, 8, 10, 4], 'landed; home unchanged');
  assert.equal(h.b.unitAt(12, 8), u);
  approx(atDeploy, sp, 1e-9, 'SP restored before the deploy hook');
  approx(u.hp, u.s.maxHp);
  // plain redeploy: initSp; knocked out there later → the auto-redeploy comes back on that tile (PRTS 卫戍协议/帮助
  // "…原地留下一个“倒地干员”…满足再部署条件时…自动部署至该位置"; player report F5 after 0.1.0); a retreat too (every 退场:
  // GitHub #60)
  h.b.retreat(u);
  h.b.redeploy(u, { tile: [12, 8] });
  approx(u.skill.sp, 2, 1e-9, 'without keepSp: initial SP');
  const p = h.b.getPlayer('p1');
  p.dp = 50;
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.ok(h.runUntil(() => u.alive, u.base.respawnTime + 1));
  assert.deepEqual([u.tileR, u.tileC], [12, 8], 'auto-redeploy on the tile it lay on');
  h.b.retreat(u);
  assert.deepEqual(h.b.snapshot().down?.map((d) => d.slice(4)), [[12, 8]], 'a retreated operator lies where it stood');
  assert.equal(h.b.redeploy(u), true);
  assert.deepEqual([u.tileR, u.tileC], [12, 8], 'and comes back there, not on its home tile (GitHub #60)');
  // paid redeploy on a tile
  h.b.retreat(u);
  const dp = p.dp;
  assert.equal(h.b.redeploy(u, { free: false, tile: [9, 5] }), true);
  approx(p.dp, dp - u.base.cost, 1e-9, 'paid');
  checkInvariants(h.b);
});

test('redeploy keepSp: charges survive too', () => {
  const h = makeBattle({
    defs: { chess: { t_gd: guard({ skill: { spCost: 2, initSp: 0, maxChargeTime: 3, durationType: 'NONE', duration: 0 } }) } },
    units: [{ chessId: 't_gd', row: 10, col: 4 }], content: 'generic', autoFinish: false,
    kits: { t_gd: () => ({ skill: { kind: 'charges', trigger: 'NEVER' } }) },
  });
  h.step();
  const u = h.unit('t_gd');
  h.run(5);
  assert.equal(u.skill.charges, 2);
  const sp = u.skill.sp;
  h.b.retreat(u);
  h.b.redeploy(u, { keepSp: true });
  assert.equal(u.skill.charges, 2);
  approx(u.skill.sp, sp, 1e-9);
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 10) tactical point

test('findTacticalPoint: a free walkable tile of the initial range on an enemy ground path first, then the nearest', () => {
  const h = makeBattle({
    defs: { chess: { t_gd: guard({ rangeGrid: AROUND.concat([[0, 2], [1, 2], [-1, 2]]) }), t_x: guard({ id: 't_x' }) } },
    units: [{ chessId: 't_gd', row: 10, col: 4 }, { chessId: 't_x', row: 12, col: 9 }], content: 'generic', autoFinish: false,
    // the row-9 lane only (the upper gate's official smoothed route is a diagonal through (10,4)/(10,5), see grid.js)
    routes: flatRoutes().filter((r) => r.start[0] === 9),
  });
  h.step();
  const u = h.unit('t_gd');
  const path = h.b.groundPathTiles();
  assert.ok(path.has(K(9, 4)) && path.has(K(9, 10)) && !path.has(K(10, 4)), 'flat stage route 0 runs along row 9');
  const tok = (r, c) => assert.ok(h.b.spawnToken(u, 'tok', r, c, { def: { name: 'x', stats: { maxHp: 10 } } }));
  // (9,3) (9,4) (9,5) are on the path at the same distance: the lowest tile key wins
  assert.deepEqual(h.b.findTacticalPoint(u), [9, 3], 'on the path (row 9) before the tiles of its own row');
  tok(9, 3);
  assert.deepEqual(h.b.findTacticalPoint(u), [9, 4], 'taken tiles are skipped');
  tok(9, 4); tok(9, 5);
  assert.deepEqual(h.b.findTacticalPoint(u), [9, 6], 'a farther path tile beats a nearer off-path one');
  tok(9, 6);
  assert.deepEqual(h.b.findTacticalPoint(u), [10, 3], 'no path tile left: the nearest (same row first), lowest key');
  // the home tile of a piece waiting to (re)deploy is reserved
  const x = h.unit('t_x');
  h.b.relocate(x, 10, 3);
  h.b.retreat(x);
  x.homeR = 10; x.homeC = 3;
  assert.deepEqual(h.b.findTacticalPoint(u), [10, 5]);
  // the path cache follows obstacles
  const v = h.b.grid.version;
  h.b.setObstacle(9, 7, true);
  assert.notEqual(h.b.grid.version, v);
  assert.ok(!h.b.groundPathTiles().has(K(9, 7)), 're-pathed around the obstacle');
  checkInvariants(h.b);
});

// ---------------------------------------------------------------------------------------------------------------
// 11) statusApplied `entered`, 12) layerGain `tile`

test('statusApplied ctx.entered: true only when the status newly started (refreshes, weaker valued applications: false)', () => {
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [], content: 'none', autoFinish: false, hooks: ['statusApplied'] });
  h.step();
  const e = h.spawn('enemy_dummy', { pos: [10, 5] });
  const last = () => h.hooksOf('statusApplied').at(-1).entered;
  h.b.applyStatus(e, 'freeze', { duration: 1 });
  assert.equal(last(), true);
  h.b.applyStatus(e, 'freeze', { duration: 2 });
  assert.equal(last(), false, 'refresh of a running freeze');
  h.run(2.1);
  h.b.applyStatus(e, 'freeze', { duration: 1 });
  assert.equal(last(), true, 'after it ended');
  h.b.applyStatus(e, 'slow', { duration: 5, value: 0.5 });
  assert.equal(last(), true);
  h.b.applyStatus(e, 'slow', { duration: 9, value: 0.2 });
  assert.equal(last(), false, 'weaker valued application');
  h.b.addBuff(e, { key: 'custom:sleep', flags: { sleep: true }, status: 'sleep' });
  h.b.applyStatus(e, 'sleep', { duration: 1 });
  assert.equal(last(), false, 'a custom buff carrying the status counts');
});

test('layerGain ctx.tile: the source\'s tile — or where it was knocked out this instant; null afterwards; explicit opts.tile', () => {
  const h = makeBattle({
    defs: { chess: { t_gd: guard() } }, units: [{ chessId: 't_gd', row: 10, col: 4 }], content: 'generic', autoFinish: false, hooks: ['layerGain'],
    setup: (b) => b.on('death', (c) => { if (c.unit.defId === 't_gd') b.addLayers('p1', 'test', 1, 'garrison', { source: c.unit }); }),
  });
  h.step();
  const u = h.unit('t_gd');
  h.b.relocate(u, 11, 5);
  h.b.addLayers('p1', 'test', 1, 'garrison', { source: u });
  assert.deepEqual(h.hooksOf('layerGain').at(-1).tile, [11, 5]);
  h.b.dealDamage(null, u, { amount: 1e9, type: 'true' });
  assert.deepEqual(h.hooksOf('layerGain').at(-1).tile, [11, 5], 'knocked out this instant');
  h.step();
  h.b.addLayers('p1', 'test', 1, 'garrison', { source: u });
  assert.equal(h.hooksOf('layerGain').at(-1).tile, null, 'long gone');
  h.b.addLayers('p1', 'test', 1, 'x', { tile: [9, 9] });
  assert.deepEqual(h.hooksOf('layerGain').at(-1).tile, [9, 9]);
  h.b.addLayers('p1', 'test', 1, 'x');
  assert.equal(h.hooksOf('layerGain').at(-1).tile, null);
});
