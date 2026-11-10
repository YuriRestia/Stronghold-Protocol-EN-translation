// test/sim/feedback5-mystic-store.test.js — the 秘术师 energy store at the attack check (GitHub #181; PRTS 分支特性信息 秘术师
// "能量储存与攻击占用相同的攻击间隔：在进行攻击判定时，若范围内存在有效目标，则进行普通攻击；若无有效目标且能量储存数未满，则改为储存
// 一份攻击能量（属于攻击行为）；仅没有有效目标，且能量储存数已满的情况下才进入待机状态", "攻击被打断且弹道未能成功生成的情况下，储存的
// 能量不会被消耗"; PRTS 异常效果 缴械 "秘术师储存能量同样无法进行") — server/sim/professions.js installMystic (storeEnergy /
// releaseEnergy / hitsFn), server/sim/ai.js updateAlly / performAttack, 深靛's kit (a bound enemy is no valid target).
// Run: node --test test/sim/feedback5-mystic-store.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource } from '../../server/sim/simdata.js';
import { allyCastWindup } from '../../server/sim/ai.js';

const ds = getDefaultSource();
const ID = 'chess_char_1_17_a';      // 深靛 (normal: trait times 3)
const ELITE = 'chess_char_1_17_b';   // 深靛 elite (MSC-X: times 4)
const TICK = 1 / 30;
const approx = (a, b, msg, eps = TICK + 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, ...o });
/** Her record without the talent's random bind (柔光缚目 prob 0): the binds of these tests are placed by hand. */
const noBind = (id) => {
  const r = ds.rawChess(id);
  return { [id]: { ...r, talents: r.talents.map((t) => ({ ...t, bb: { ...t.bb, prob: 0 } })) } };
};

function field({ id = ID, enemies = [], setup } = {}) {
  return makeBattle({
    seed: 3, autoFinish: false, timeLimit: 300, hooks: ['attack', 'damaged'], captureNoisy: true, setup,
    defs: { chess: noBind(id), enemies: { e: dummy('e') } }, units: [{ chessId: id, row: 10, col: 4 }], enemies,
  });
}
const attacksOf = (h, u) => h.hooksOf('attack').filter((c) => c.attacker === u);
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };

test('no target: her first attack check stores at once (an attack action: the interval restarts), then one energy per attack interval up to the trait times; full ⇒ idle with the attack ready', () => {
  for (const [id, max] of [[ID, 3], [ELITE, 4]]) {
    const h = field({ id });
    const u = h.unit(id);
    h.step();
    assert.equal(u.trait.stored, 1, `${id}: the attack is ready at deployment — stored at the first check`);
    const iv = u.s.interval;
    approx(u.atkCd, iv, `${id}: storing took the attack interval`, 1e-9);
    let last = h.b.time;
    for (let n = 2; n <= max; n++) {
      assert.ok(h.runUntil(() => u.trait.stored === n, iv + 1), `${id}: energy ${n}`);
      approx(h.b.time - last, iv, `${id}: energy ${n} one interval after the last`);
      last = h.b.time;
    }
    h.run(3 * iv);
    assert.equal(u.trait.stored, max, `${id}: at most ${max}`);
    assert.equal(u.atkCd, 0, `${id}: full — idle, the attack ready`);
    assert.equal(attacksOf(h, u).length, 0);
    done(h);
  }
});

test('a target in range while she holds energies: attacked at once, the energies leave with that attack and land with its main hit, one arts attack hit each', () => {
  const h = field({ enemies: [{ key: 'e', pos: [10, 6], time: 12 }] });
  const u = h.unit(ID);
  assert.ok(h.runUntil(() => attacksOf(h, u).length === 1, 15));
  // the cast starts in the tick the enemy appeared; its hit lands one wind-up later (official cast → hit, ai.js allyCastWindup)
  approx(h.b.time, 12 + allyCastWindup(u), 'attacked in the tick the enemy appeared (the full store idled with the attack ready)', 2 * TICK);
  assert.equal(u.trait.stored, 0, 'released with the attack (before the bolt lands)');
  h.run(1);
  const hits = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.isAttack);
  assert.equal(hits.length, 1 + 3, 'the main hit + 3 energies');
  assert.ok(hits.every((c) => c.type === 'arts' && c.dmg.attackId === hits[0].dmg.attackId), 'arts, one attack');
  assert.ok(hits.every((c) => Math.abs(c.amount - hits[0].amount) < 1e-6), 'each energy hits as the main hit');
  done(h);
});

test('a bind on her only target is no valid target: her next attack check stores an energy, and the freed enemy waits for the interval the store took (GitHub #181)', () => {
  const h = field({ enemies: [{ key: 'e', pos: [10, 6] }] });
  const u = h.unit(ID);
  assert.ok(h.runUntil(() => attacksOf(h, u).length === 1, 2));
  const t0 = h.b.time, iv = u.s.interval;
  assert.equal(u.trait.stored, 0);
  const [e] = h.enemies();
  h.b.applyStatus(e, 'bind', { duration: 4 });
  assert.ok(h.runUntil(() => u.trait.stored === 1, iv + 1));
  // t0 is the first hit, one wind-up after its cast started; the interval counts from the cast (official cast → hit)
  approx(h.b.time - t0, iv - allyCastWindup(u), 'stored at her next attack check, during the bind');
  assert.equal(attacksOf(h, u).length, 1, 'no attack at the bound enemy');
  assert.ok(h.runUntil(() => attacksOf(h, u).length === 2, iv + 1 + allyCastWindup(u)));   // the hit lands one wind-up after its cast
  approx(h.b.time - t0, 2 * iv, 'the bind ended at +4 s; her next check comes an interval after the store', 2 * TICK + 1e-6);
  assert.equal(u.trait.stored, 0, 'the energy left with that attack');
  h.run(1);
  const n = h.hooksOf('damaged').filter((c) => c.source === u && c.dmg.isAttack && c.t > t0 + 2 * iv - 0.1).length;
  assert.equal(n, 2, 'the main hit + the stored energy');
  done(h);
});

test('disarmed (缴械) or stunned: no storing; an attack cancelled before its shot keeps the energies; a redeployment holds none [ASSUMED]', () => {
  const h = field();
  const u = h.unit(ID);
  h.step();
  assert.equal(u.trait.stored, 1);
  h.b.addBuff(u, { key: 'test:disarm', duration: 10, flags: { disarm: true } });
  h.run(9.5);
  assert.equal(u.trait.stored, 1, 'disarmed: "秘术师储存能量同样无法进行"');
  h.run(1);
  assert.equal(u.trait.stored, 2, 'stored at the first check after the disarm');
  h.b.applyStatus(u, 'stun', { duration: 10 });
  h.run(9.5);
  assert.equal(u.trait.stored, 2, 'stunned: no attack check');
  h.run(4);
  assert.equal(u.trait.stored, 3);
  // an attack whose shot never forms (beforeAttack empties it): the energies stay
  let cancel = true;
  h.b.on('beforeAttack', (ctx) => { if (ctx.attacker === u && cancel) ctx.targets = []; });
  h.spawn('e', { pos: [10, 6] });
  h.run(0.5);
  assert.equal(attacksOf(h, u).length, 0);
  assert.equal(u.trait.stored, 3, '"攻击被打断且弹道未能成功生成的情况下，储存的能量不会被消耗"');
  cancel = false;
  // knocked out holding them: the redeployment starts empty
  h.b.retreat(u);
  h.b.redeploy(u, { free: true });
  assert.equal(u.trait.stored, 0, 'a redeployment holds no energy');
  done(h);
});
