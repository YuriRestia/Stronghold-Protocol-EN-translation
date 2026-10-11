import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

const done = (h) => { checkInvariants(h.b); assert.deepEqual(h.b.errors, []); };
test('six Kazimierz stuns a nearby hovering enemy while blocking ground enemies (#463)', () => {
  const h = makeBattle({ autoFinish: false, hooks: ['status'],
    defs: { chess: { wall: chessRec({ id: 'wall', bonds: ['kazimierzShip'], skill: null, stats: { maxHp: 1e7, atk: 10, block: 3 } }) },
      enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    bonds: { kazimierzShip: { count: 6, active: true, tier: 3, layers: 1 } },
    units: [{ uid: 1, chessId: 'wall', row: 10, col: 4 }] });
  h.step(); const u = h.unit(1);
  const ground = h.spawn('dummy', { pos: [10, 4], routeIndex: 0 });
  const near = h.spawn('enemy_2025_syufo', { pos: [10, 4.5], routeIndex: 0 });
  const far = h.spawn('enemy_2025_syufo', { pos: [10, 7], routeIndex: 0 });
  for (const e of [near, far]) h.b.addBuff(e, { key: 'test:stationary', flags: { noMove: true, disarm: true } });
  assert.ok(near.s.flags.unblockable);
  h.step(2); assert.equal(ground.blockedBy, u);
  assert.ok(h.runUntil(() => near.s.flags.stun, 4), 'the pulse can stun hovering targets');
  assert.ok(!near.s.flags.unblockable, 'hovering ends while stunned');
  assert.ok(!far.s.flags.stun, '周围 is the official 0.8 radius, not the whole field');
  done(h);
});
test('a Raid revive inside the tick hook stays on the enemy tile instead of the taunt', () => {
  const h = makeBattle({ autoFinish: false,
    defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    bonds: { raidShip: { count: 2, active: true, tier: 1, layers: 5 } },
    units: [{ uid: 1, chessId: 'chess_char_4_16_a', skillIndex: 1, row: 10, col: 4 }] });
  h.step(); const u = h.unit(1);
  const local = h.spawn('dummy', { pos: [10, 4], routeIndex: 0 });
  const far = h.spawn('dummy', { pos: [10, 8], routeIndex: 0 });
  h.b.addBuff(far, { key: 'test:taunt', mods: { taunt: 10 } });
  let did = false;
  h.b.on('tick', () => {
    if (did || h.b.time < 7 / 30 - 1e-9 || u.blocking.length < 1) return;
    did = true;
    h.b.kill(u, null);
    assert.ok(h.b.redeploy(u, { free: true }));
    assert.equal(u.blocking.length, 0, 'redeploy clears the block list before the next tick');
  });
  h.step(8);
  assert.equal(did, true);
  h.step(1);
  assert.deepEqual([u.tileR, u.tileC], [10, 4], 'the enemy is still on this tile when the revive poll runs');
  assert.equal(local.blockedBy, u);
  done(h);
});
test('an ordinary Raid poll prefers the nearer gate over a farther taunt', () => {
  const probe = chessRec({ id: 'probe', position: 'MELEE', bonds: ['raidShip'], rangeGrid: [[0, 0]], skill: null, stats: { maxHp: 5000, atk: 10, block: 2, def: 0 } });
  const h = makeBattle({ autoFinish: false,
    defs: { chess: { probe }, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    bonds: { raidShip: { count: 2, active: true, tier: 1, layers: 5 } },
    units: [{ uid: 1, chessId: 'probe', row: 10, col: 5 }] });
  h.step(); const u = h.unit(1);
  const near = h.spawn('dummy', { pos: [9, 3], routeIndex: 0 });
  const far = h.spawn('dummy', { pos: [9, 8], routeIndex: 0 });
  h.b.addBuff(far, { key: 'test:taunt', mods: { taunt: 10 } });
  assert.ok(h.b.remainingDistance(near) < h.b.remainingDistance(far));
  h.run(10.5);
  assert.ok(h.b.enemiesInKeys(u.rangeKeys, u, u.profile).includes(near), 'ordinary order is remaining distance, then id');
  assert.ok(!h.b.enemiesInKeys(u.rangeKeys, u, u.profile).includes(far));
  done(h);
});
test('a retreat redeploy does not arm the Raid revive reselect', () => {
  const wide = chessRec({ id: 'wide', position: 'RANGED', bonds: ['raidShip'], rangeGrid: [[0, 0], [0, 1], [0, -1]], skill: null, stats: { maxHp: 5000, atk: 10, block: 0 } });
  const h = makeBattle({ autoFinish: false,
    defs: { chess: { wide }, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    bonds: { raidShip: { count: 2, active: true, tier: 1, layers: 5 } },
    units: [{ uid: 1, chessId: 'wide', row: 10, col: 5 }] });
  h.step(); const u = h.unit(1);
  const e = h.spawn('dummy', { pos: [10, 6], routeIndex: 0 });
  h.run(0.4);
  assert.ok(h.b.enemiesInKeys(u.rangeKeys, u, u.profile).includes(e));
  const tile = [u.tileR, u.tileC];
  h.b.retreat(u, { reason: 'retreat' });
  assert.ok(h.b.redeploy(u, { free: true }));
  const seq = u.deploySeq;
  h.run(0.3);
  assert.deepEqual([u.tileR, u.tileC], tile, 'an enemy already in range keeps the old poll from jumping');
  assert.equal(u.deploySeq, seq);
  done(h);
});
test('a revived Raid operator that has already blocked an enemy stays in place', () => {
  const h = makeBattle({ autoFinish: false,
    defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    bonds: { raidShip: { count: 2, active: true, tier: 1, layers: 5 } },
    units: [{ uid: 1, chessId: 'chess_char_4_16_a', skillIndex: 1, row: 10, col: 4 }] });
  h.step(); const u = h.unit(1);
  const local = h.spawn('dummy', { pos: [10, 4], routeIndex: 0 });
  const far = h.spawn('dummy', { pos: [10, 8], routeIndex: 0 });
  h.b.addBuff(far, { key: 'test:taunt', mods: { taunt: 10 } });
  h.b.kill(u, null); assert.ok(h.b.redeploy(u, { free: true }));
  h.step(2); assert.equal(local.blockedBy, u);
  h.run(0.3); assert.deepEqual([u.tileR, u.tileC], [10, 4]); done(h);
});
for (const taunt of [false, true]) test(`revived unblocked Texas S2 reselects a Raid target by taunt then remaining route (${taunt})`, () => {
  const h = makeBattle({ autoFinish: false, hooks: ['deploy'],
    defs: { enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    bonds: { raidShip: { count: 2, active: true, tier: 1, layers: 5 } },
    units: [{ uid: 1, chessId: 'chess_char_4_16_a', skillIndex: 1, row: 10, col: 4 }] });
  h.step(); const u = h.unit(1);
  h.spawn('dummy', { pos: [10, 5.2], routeIndex: 0 });
  const nearGate = h.spawn('dummy', { pos: [9, 3], routeIndex: 0 });
  const far = h.spawn('dummy', { pos: [10, 8], routeIndex: 0 });
  if (taunt) h.b.addBuff(far, { key: 'test:taunt', mods: { taunt: 10 } });
  h.run(0.3); assert.deepEqual([u.tileR, u.tileC], [10, 4], 'initial deployment still uses the ordinary range gate');
  h.b.kill(u, null); assert.ok(h.b.redeploy(u, { free: true }));
  assert.equal(u.blocking.length, 0);
  h.run(0.3);
  const target = taunt ? far : nearGate;
  assert.ok(h.b.enemiesInKeys(u.rangeKeys, u, u.profile).includes(target), 'the higher-priority target is in the new range');
  assert.notDeepEqual([u.tileR, u.tileC], [10, 4]);
  const count = u.deploySeq; h.run(0.3); assert.equal(u.deploySeq, count, 'Raid itself cannot continuously rearm the revival check');
  done(h);
});
test('Skadi S1 and 坚守 sharing retain transfer ancestry and do not revisit either sharing effect', () => {
  const op = (id, bonds) => chessRec({ id, bonds, skill: null, stats: { maxHp: 1e7, atk: 0, def: 0 } });
  const h = makeBattle({ autoFinish: false, defs: { chess: {
    a: op('a', ['steadShip']), b: op('b', ['steadShip']), c: op('c', ['steadShip']), d: op('d', []),
  } }, bonds: { steadShip: { count: 3, active: true, tier: 2, layers: 10 } },
  units: [{ uid: 1, chessId: 'chess_char_6_04_a', row: 10, col: 4, skillIndex: 0 },
    { chessId: 'a', row: 9, col: 4 }, { chessId: 'b', row: 11, col: 4 },
    { chessId: 'c', row: 10, col: 3 }, { chessId: 'd', row: 10, col: 5 }] });
  h.step(); assert.ok(h.unit(1).skill.activate('test', { free: true }));
  let attempts = 0;
  // Fail fast on the broken implementation without letting the branching recursion freeze the test worker.
  h.b.on('hit', (c) => { if (++attempts > 64) c.dmg.cancel = true; }, { priority: 1000 });
  h.b.dealDamage(null, h.unit('d'), { amount: 1000, type: 'true' });
  assert.ok(attempts <= 12, `bounded transfer tree, got ${attempts} hits`);
  assert.ok(h.unit('d').hp < h.unit('d').s.maxHp); done(h);
});
for (const mode of ['both', 'stead', 'skadi']) test(`Skadi S1 and 坚守 conserve a 1000 true hit (${mode})`, () => {
  const op = (id, bonds) => chessRec({ id, bonds, skill: null, stats: { maxHp: 1e7, atk: 0, def: 0 } });
  const both = mode === 'both';
  const units = [];
  if (mode !== 'stead') units.push({ uid: 1, chessId: 'chess_char_6_04_a', row: 10, col: 4, skillIndex: 0 });
  units.push({ chessId: 'a', row: 9, col: 4 }, { chessId: 'b', row: 11, col: 4 }, { chessId: 'c', row: 10, col: 3 }, { chessId: 'd', row: 10, col: 5 });
  const h = makeBattle({ autoFinish: false, defs: { chess: {
    a: op('a', ['steadShip']), b: op('b', ['steadShip']), c: op('c', ['steadShip']), d: op('d', []),
  } }, bonds: mode === 'skadi' ? {} : { steadShip: { count: 3, active: true, tier: 2, layers: 10 } }, units });
  h.step();
  if (mode !== 'stead') assert.ok(h.unit(1).skill.activate('test', { free: true }));
  let attempts = 0;
  h.b.on('hit', (c) => { if (++attempts > 64) c.dmg.cancel = true; }, { priority: 1000 });
  const loss = (id) => { const u = h.unit(id); return u.s.maxHp - u.hp; };
  h.b.dealDamage(null, h.unit('d'), { amount: 1000, type: 'true' });
  const parts = [loss('d'), loss('a'), loss('b'), loss('c')];
  if (mode !== 'stead') parts.push(loss(1));
  const sum = parts.reduce((s, n) => s + n, 0);
  const near = (got, want) => Math.abs(got - want) < 1e-3;
  assert.ok(near(sum, 1000), `total ${sum}`);
  if (both) {
    assert.ok(near(loss('d'), 100), `victim ${loss('d')}`);
    for (const id of ['a', 'b', 'c']) assert.ok(near(loss(id), 400 / 3), `${id} ${loss(id)}`);
    assert.ok(near(loss(1), 500), `skadi ${loss(1)}`);
    assert.ok(attempts <= 12, `bounded transfer tree, got ${attempts} hits`);
    const before = attempts;
    h.b.dealDamage(null, h.unit('d'), { amount: 1000, type: 'true' });
    assert.ok(attempts - before <= 12, `second hit stayed bounded, got ${attempts - before}`);
    assert.ok(near(loss('d'), 200) && near(loss(1), 1000), 'the second hit conserves the same split');
  } else if (mode === 'stead') {
    assert.ok(near(loss('d'), 600), `victim ${loss('d')}`);
    for (const id of ['a', 'b', 'c']) assert.ok(near(loss(id), 400 / 3), `${id} ${loss(id)}`);
    assert.ok(attempts <= 4, `stead-only hits ${attempts}`);
  } else {
    assert.ok(near(loss('d'), 500) && near(loss(1), 500));
    assert.ok(near(loss('a'), 0) && near(loss('b'), 0) && near(loss('c'), 0));
    assert.ok(attempts <= 2, `skadi-only hits ${attempts}`);
  }
  done(h);
});
for (const combo of [false, true]) test(`家族徽章 consumes its bonus on the first damage immediately after stealth ends (combo=${combo})`, () => {
  const op = chessRec({ id: 'op', bonds: ['siracusaShip'], skill: null, rangeGrid: [[0, 0]], stats: { atk: 1000 } });
  const h = makeBattle({ autoFinish: false, defs: { chess: { op }, enemies: { dummy: enemyRec({ key: 'dummy', hp: 1e9, atk: 0, speed: 0 }) } },
    units: [{ uid: 1, chessId: 'op', row: 10, col: 4, items: ['chess_item_6_11_e_b', ...(combo ? ['chess_item_3_01_e_a'] : [])] }] });
  h.step(); const u = h.unit(1), base = u.s.atk;
  h.b.addBuff(u, { key: 'test:hidden', flags: { stealth: true } }); h.run(2);
  const boosted = u.s.atk; assert.ok(boosted > base);
  h.b.removeBuff(u, 'test:hidden'); const e = h.spawn('dummy', { pos: [10, 9] }); const hp = e.hp;
  h.b.dealDamage(u, e, { amount: 100, type: 'true', isAttack: true });
  assert.equal(u.s.atk, base, 'no waiting for the next 0.25-second growth poll');
  assert.ok(Math.abs(hp - e.hp - (100 + (combo ? boosted * 8 : 0))) < 1e-6);
  const hp2 = e.hp; h.b.dealDamage(u, e, { amount: 100, type: 'true', isAttack: true });
  assert.equal(hp2 - e.hp, 100, 'bonus consumed once'); done(h);
});
for (const elite of [false, true]) test(`松果 S2 growth restarts on redeployment without resetting the lifetime activation sequence (${elite})`, () => {
  const id = `chess_char_3_10_${elite ? 'b' : 'a'}`;
  const h = makeBattle({ autoFinish: false, units: [{ uid: 1, chessId: id, skillIndex: 1, row: 10, col: 4 }] });
  h.step(); const u = h.unit(1), values = [];
  for (let i = 0; i < 3; i++) {
    assert.ok(u.skill.activate('test', { free: true })); values.push(u.findBuff('skill:pinecn_atk').mods.atkPct); u.skill.end('test');
  }
  assert.ok(values[2] > values[0]); const activations = u.skill.activations;
  h.b.retreat(u, { reason: 'test' }); assert.ok(h.b.redeploy(u, { free: true }));
  assert.ok(u.skill.activate('test', { free: true }));
  assert.equal(u.findBuff('skill:pinecn_atk').mods.atkPct, values[0]);
  assert.equal(u.skill.activations, activations + 1); done(h);
});

for (const elite of [false, true]) test(`哈洛德 S2 starts for an ally at full HP with only elemental injury (${elite})`, () => {
  const wall = chessRec({ id: 'wall', skill: null, stats: { maxHp: 1e6, atk: 0 } });
  const h = makeBattle({ autoFinish: false, defs: { chess: { wall } },
    units: [{ uid: 1, chessId: `chess_char_2_05_${elite ? 'b' : 'a'}`, skillIndex: 1, row: 10, col: 4 },
      { uid: 2, chessId: 'wall', row: 10, col: 5 }] });
  h.step(); const u = h.unit(1), a = h.unit(2); assert.equal(u.skill.id, 'skchr_harold_2');
  u.skill.gainSp(999, 'init'); h.run(0.5); assert.equal(u.skill.activations, 0, 'no injury means no cast');
  h.b.dealDamage(null, a, { type: 'element', element: 'burn', amount: 600 }); assert.equal(a.hp, a.s.maxHp);
  assert.ok(h.runUntil(() => u.skill.activations > 0, 4)); assert.ok(a.elem.burn < 600); done(h);
});
