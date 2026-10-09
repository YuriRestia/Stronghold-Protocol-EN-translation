// 敌人普攻后摇：可选快照元数据的生产、校验与位置插值；不改动战斗规则。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotBuffer, normalizeSnapshot } from '../../public/js/render/interp.js';
import { ANIM, UF } from '../../shared/constants.js';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { snapFrame } from '../../server/match/fields.js';
import { TICK } from '../../server/sim/constants.js';
import { rupture } from '../../server/sim/content/kits/ops/op-weedy.js';

const tuple = (x, anim = ANIM.ATTACK) => [1, x, 9, 100, 100, 0, 0, 0, anim];
const frame = (t, x, until, anim) => ({ t, units: [tuple(x, anim)], ...(until === undefined ? {} : { stand: [[1, until]] }) });
const near = (got, want) => assert.ok(Math.abs(got - want) < 1e-8, `${got} ≠ ${want}`);

test('stand：仅保留快照中存在的单位与有限、未来的结束时间', () => {
  const valid = normalizeSnapshot({ t: 'b.snap', gt: 1, units: [tuple(0)], stand: [
    null, 'x', [1], [2, 2], [1, '2'], [1, NaN], [1, Infinity], [1, 1], [1, 0.9], [1, 1.08],
  ] });
  assert.deepEqual([...valid.stand], [[1, 1.08]]);
  for (const stand of [undefined, null, {}, [], [[1, 1]], [[2, 2]]]) {
    assert.equal(normalizeSnapshot({ t: 1, units: [tuple(0)], stand }).stand, null);
  }
});

test('standCut：仅保留已有单位的有限、非负且不晚于快照的时间', () => {
  const valid = normalizeSnapshot({ t: 'b.snap', gt: 1, units: [tuple(0)], standCut: [
    null, 'x', [1], [2, 0.9], [1, '0.9'], [1, NaN], [1, Infinity], [1, -1], [1, 1.01], [1, 0.9],
  ] });
  assert.deepEqual([...valid.standCut], [[1, 0.9]]);
  for (const standCut of [undefined, null, {}, [], [[1, -1]], [[2, 0]], [[1, 1.01]]]) {
    assert.equal(normalizeSnapshot({ t: 1, units: [tuple(0)], standCut }).standCut, null);
  }
  assert.equal(normalizeSnapshot({ t: 1, units: [tuple(0)], standCut: [[1, 0], [1, 1]] }).standCut.get(1), 1);
});

test('后摇结束前保持位置，结束后插值剩余区间；HP/SP 仍按整段时间插值', () => {
  const b = new SnapshotBuffer();
  b.push(frame(1, 0, 1.08), 0);
  const next = frame(1.1, 0.02, undefined, ANIM.MOVE);
  next.units[0][3] = 50;
  next.units[0][5] = 10;
  b.push(next, 0.05);
  for (const t of [1, 1.04, 1.079]) {
    const s = b.sample(t).get(1);
    assert.equal(s.x, 0);
    assert.equal(s.vx, 0);
    assert.equal(s.anim, ANIM.ATTACK);
  }
  const middle = b.sample(1.05).get(1);
  near(middle.hp, 75);
  near(middle.sp, 5);
  near(b.sample(1.09).get(1).x, 0.01);
  near(b.sample(1.09).get(1).vx, 1);
  near(b.sample(1.1).get(1).x, 0.02);
});

test('旧快照、过期元数据及攻击→移动动画不推断停步', () => {
  for (const until of [undefined, 0.9, 1, NaN, Infinity]) {
    const b = new SnapshotBuffer();
    b.push(frame(1, 0, until), 0);
    b.push(frame(1.1, 0.1, undefined, ANIM.MOVE), 0.05);
    near(b.sample(1.05).get(1).x, 0.05);
    near(b.sample(1.05).get(1).vx, 1);
  }
});

test('后摇结束时间恰为下一帧时，位置在该帧之前保持不动', () => {
  const b = new SnapshotBuffer();
  b.push(frame(1, 0, 1.1), 0);
  b.push(frame(1.1, 0.02), 0.05);
  assert.equal(b.sample(1.09).get(1).x, 0);
  near(b.sample(1.1).get(1).x, 0.02);
});

test('后摇尚未到期但新帧已移动时，不阻止权威位置更新', () => {
  const b = new SnapshotBuffer();
  b.push(frame(1, 0, 2), 0);
  b.push(frame(1.1, 0.1, undefined, ANIM.MOVE), 0.05);
  near(b.sample(1.05).get(1).x, 0.05);
});

test('后摇结束时间落在两帧之间，但该区间有打断时，插值和外推均使用完整区间', () => {
  for (const cutAt of [1, 1.04, 1.1]) {
    const b = new SnapshotBuffer();
    b.push(frame(1, 0, 1.08), 0);
    b.push({ ...frame(1.1, 0.1, undefined, ANIM.MOVE), standCut: [[1, cutAt]] }, 0.05);
    near(b.sample(1.05).get(1).x, 0.05);
    near(b.sample(1.099).get(1).vx, 1);
    near(b.sample(1.101).get(1).vx, 1);
    near(b.sample(1.15).get(1).x, 0.15);
  }
});

test('旧的打断记录不影响后续未被打断的后摇', () => {
  const b = new SnapshotBuffer();
  b.push(frame(1, 0, 1.08), 0);
  b.push({ ...frame(1.1, 0.02), standCut: [[1, 0.9]] }, 0.05);
  assert.equal(b.sample(1.04).get(1).x, 0);
  near(b.sample(1.09).get(1).vx, 1);
  near(b.sample(1.15).get(1).vx, 1);
});

test('后摇恢复段进入外推时速度连续，零长度移动区间不产生无穷速度', () => {
  const b = new SnapshotBuffer();
  b.push(frame(1, 0, 1.08), 0);
  b.push(frame(1.1, 0.02, undefined, ANIM.MOVE), 0.05);
  near(b.sample(1.099).get(1).vx, 1);
  near(b.sample(1.101).get(1).vx, 1);
  near(b.sample(1.15).get(1).x, 0.07);
  const edge = new SnapshotBuffer();
  edge.push(frame(1, 0, 1.1), 0);
  edge.push(frame(1.1, 0.02), 0.05);
  near(edge.sample(1.15).get(1).x, 0.02);
  assert.equal(edge.sample(1.15).get(1).vx, 0);
});

test('停步期间及网络停顿越过结束时间后，都不使用攻击前的速度外推', () => {
  const b = new SnapshotBuffer({ maxExtrapolate: 0.2 });
  b.push(frame(0.9, -0.1), 0);
  b.push(frame(1, 0, 1.08), 0.05);
  for (const t of [1.04, 1.09, 5]) {
    const s = b.sample(t).get(1);
    assert.equal(s.x, 0);
    assert.equal(s.vx, 0);
  }
  b.push(frame(1.1, 0.02, undefined, ANIM.MOVE), 0.1);
  assert.ok(b.sample(1.15).get(1).x > 0.02, '新位置确认后恢复原有外推');
});

test('瞬移与重新部署的跳转优先于后摇插值', () => {
  for (const [x, anim] of [[8, ANIM.MOVE], [0.1, ANIM.DEPLOY]]) {
    const b = new SnapshotBuffer({ teleport: 2 });
    b.push(frame(1, 0, 1.04), 0);
    b.push(frame(1.1, x, undefined, anim), 0.05);
    assert.equal(b.sample(1.09).get(1).x, 0);
    near(b.sample(1.1).get(1).x, x);
    assert.equal(b.sample(1.09).get(1).vx, 0);
    near(b.sample(1.15).get(1).x, x);
    assert.equal(b.sample(1.15).get(1).vx, 0);
  }
});

test('死亡或眩晕的最新帧不沿用旧速度外推；恢复移动后仍可外推', () => {
  for (const anim of [ANIM.DIE, ANIM.STUN]) {
    const b = new SnapshotBuffer();
    b.push(frame(0.9, -0.1, undefined, ANIM.MOVE), 0);
    const stopped = frame(1, 0, undefined, anim);
    if (anim === ANIM.DIE) stopped.units[0][3] = 0;
    b.push(stopped, 0.05);
    for (const t of [1.01, 1.24, 5]) {
      assert.equal(b.sample(t).get(1).x, 0);
      assert.equal(b.sample(t).get(1).vx, 0);
    }
    b.push(frame(1.1, 0.02, undefined, ANIM.MOVE), 0.1);
    near(b.sample(1.15).get(1).x, 0.03);
  }
});

test('最新帧中已消失的单位不外推，并从复用的采样结果中删除', () => {
  const b = new SnapshotBuffer(), out = new Map();
  b.push(frame(0.9, -0.1, undefined, ANIM.MOVE), 0);
  b.push(frame(1, 0, 1.08), 0.05);
  b.push({ t: 1.1, units: [] }, 0.1);
  assert.equal(b.sample(1.05, out).get(1).x, 0);
  assert.equal(b.sample(1.05, out).get(1).vx, 0);
  assert.equal(b.sample(1.2, out).has(1), false);
});

function arena(key, wallRow = 10) {
  return makeBattle({
    defs: { chess: { t_wall: chessRec({ id: 't_wall', stats: { maxHp: 1e9, atk: 0, def: 1e6 }, skill: null }) } },
    units: [{ chessId: 't_wall', row: wallRow, col: 6 }],
    enemies: [{ key, time: 0, route: 0 }],
    content: 'none', autoFinish: false, timeLimit: 60,
  });
}

test('真实隐形弩手：Battle → b.snap → SnapshotBuffer 在后摇结束前不滑动', () => {
  const h = arena('enemy_1019_jshoot');
  let prev, pair;
  for (let i = 0; i < 1200 && !pair; i++) {
    h.step();
    if (i % 3 !== 2) continue;
    const next = h.b.snapshot();
    const e = h.enemy('enemy_1019_jshoot');
    const a = prev?.units.find((u) => u[0] === e.id), z = next.units.find((u) => u[0] === e.id);
    const until = prev?.stand?.find((v) => v[0] === e.id)?.[1];
    if (a && z && until > prev.t && until < next.t && (a[1] !== z[1] || a[2] !== z[2])) pair = { a, z, until, prev, next };
    prev = next;
  }
  assert.ok(pair, '真实攻击后摇跨越两帧且随后恢复移动');
  const { a, z, until, prev: A, next: B } = pair;
  const b = new SnapshotBuffer();
  b.push(snapFrame('test', A), 0);
  b.push(snapFrame('test', B), 0.05);
  const held = b.sample((A.t + until) / 2).get(a[0]);
  assert.equal(held.x, a[1]);
  assert.equal(held.y, a[2]);
  assert.equal(held.vx, 0);
  const moved = b.sample((until + B.t) / 2).get(a[0]);
  near(moved.x, (a[1] + z[1]) / 2);
  near(moved.y, (a[2] + z[2]) / 2);
  near(b.sample(B.t - 1e-6).get(a[0]).vx, b.sample(B.t + 1e-6).get(a[0]).vx);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('真实隐形弩手：失衡跨帧打断时不按旧后摇时间冻结和集中追赶', () => {
  const h = arena('enemy_1019_jshoot');
  assert.ok(h.runUntil(() => {
    const e = h.enemy('enemy_1019_jshoot');
    return e && e.atkStandUntil - h.b.time > TICK && e.atkStandUntil - h.b.time < 3 * TICK;
  }, 10));
  const e = h.enemy('enemy_1019_jshoot'), A = h.b.snapshot();
  const until = A.stand.find((s) => s[0] === e.id)[1];
  h.step();
  const cutAt = Math.round(h.b.time * 1000) / 1000;
  assert.ok(h.b.displace(e, { x: -1, y: 0 }, 0.6) > 0);
  h.step(2);
  const B = h.b.snapshot();
  assert.ok(until > A.t && until < B.t);
  assert.equal(B.standCut.find((s) => s[0] === e.id)[1], cutAt);
  const b = new SnapshotBuffer();
  b.push(snapFrame('test', A), 0);
  b.push(snapFrame('test', B), 0.05);
  const a = A.units.find((u) => u[0] === e.id), z = B.units.find((u) => u[0] === e.id);
  near(b.sample((A.t + B.t) / 2).get(e.id).x, (a[1] + z[1]) / 2);
  near(b.sample(B.t + 1e-6).get(e.id).vx, (z[1] - a[1]) / (B.t - A.t));
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('真实隐形弩手：后摇中击退并被移动创伤击杀，死亡帧保留打断且尸体不外推', () => {
  const h = arena('enemy_1019_jshoot');
  assert.ok(h.runUntil(() => {
    const e = h.enemy('enemy_1019_jshoot');
    return e && e.atkStandUntil - h.b.time > TICK && e.atkStandUntil - h.b.time < 3 * TICK;
  }, 10));
  const e = h.enemy('enemy_1019_jshoot'), A = h.b.snapshot();
  const until = A.stand.find((s) => s[0] === e.id)[1];
  h.step();
  const cutAt = Math.round(h.b.time * 1000) / 1000;
  // 温蒂的真实移动创伤实现：击退后下一次伤害结算在同一个快照间隔内击杀目标。
  rupture(h.b, h.unit('t_wall'), e, { duration: 5, perTile: 1e6, interval: TICK });
  near(h.b.push(e, e.s.massLevel + 1, { dir: { x: -1, y: 0 }, fixed: true }), 2.14);
  h.step(2);
  const B = h.b.snapshot();
  assert.equal(e.alive, false);
  assert.ok(until > A.t && until < B.t);
  assert.equal(B.standCut?.find((s) => s[0] === e.id)?.[1], cutAt);
  assert.equal(B.stand?.some((s) => s[0] === e.id) ?? false, false);
  const a = A.units.find((u) => u[0] === e.id), z = B.units.find((u) => u[0] === e.id);
  assert.equal(z[8], ANIM.DIE);
  const b = new SnapshotBuffer();
  b.push(snapFrame('test', A), 0);
  b.push(snapFrame('test', B), 0.05);
  near(b.sample((A.t + B.t) / 2).get(e.id).x, (a[1] + z[1]) / 2);
  for (const t of [B.t, B.t + 0.01, B.t + 0.24, B.t + 1]) {
    assert.equal(b.sample(t).get(e.id).x, z[1]);
    assert.equal(b.sample(t).get(e.id).vx, 0);
  }
  b.update(0.05);
  for (let i = 1; i <= 90; i++) b.update(0.05 + i / 120);
  assert.ok(b.renderT > B.t);
  assert.equal(b.sample().get(e.id).x, z[1]);
  h.run(0.9);
  const C = h.b.snapshot();
  assert.equal(C.units.some((u) => u[0] === e.id), false);
  assert.equal(C.standCut?.some((s) => s[0] === e.id) ?? false, false);
  b.push(snapFrame('test', C), 0.5);
  assert.equal(b.sample(C.t + 0.1).has(e.id), false);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('真实隐形弩手：AI 更新前死亡也记录后摇终止，隐藏和死亡窗口外不发送记录', () => {
  const h = arena('enemy_1019_jshoot');
  assert.ok(h.runUntil(() => h.enemy('enemy_1019_jshoot')?.atkStandUntil > h.b.time + 0.1, 10));
  const e = h.enemy('enemy_1019_jshoot');
  const at = Math.round(h.b.time * 1000) / 1000;
  h.b.kill(e, h.unit('t_wall'));
  assert.equal(Math.round(e.atkStandCutAt * 1000) / 1000, at);
  assert.deepEqual(h.b.snapshot().standCut, [[e.id, at]]);
  e.hidden = true;
  assert.equal(h.b.snapshot().standCut, undefined);
  e.hidden = false;
  h.run(0.9);
  assert.equal(h.b.snapshot().standCut, undefined);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

for (const status of ['stun', 'freeze', 'sleep', 'levitate']) {
  test(`真实隐形弩手：移动后${status}的最新帧不继续滑动，解除后恢复移动`, () => {
    const h = arena('enemy_1019_jshoot');
    h.step(3);
    const e = h.enemy('enemy_1019_jshoot'), A = h.b.snapshot();
    h.step();
    assert.equal(h.b.applyStatus(e, status, { duration: 1, force: true, source: h.unit('t_wall') }), true);
    h.step(2);
    const B = h.b.snapshot(), z = B.units.find((u) => u[0] === e.id);
    assert.equal(z[8], ANIM.STUN);
    assert.notEqual(A.units.find((u) => u[0] === e.id)[1], z[1]);
    const b = new SnapshotBuffer();
    b.push(snapFrame('test', A), 0);
    b.push(snapFrame('test', B), 0.05);
    assert.equal(b.sample(B.t + 0.1).get(e.id).x, z[1]);
    assert.equal(b.sample(B.t + 0.1).get(e.id).vx, 0);
    h.run(1.1);
    const C = h.b.snapshot();
    assert.equal(e.s.flags.stun, false);
    assert.ok(C.units.find((u) => u[0] === e.id)[1] < z[1]);
    b.push(snapFrame('test', C), 0.6);
    assert.ok(b.sample(C.t + 0.1).get(e.id).vx < 0);
    checkInvariants(h.b);
    assert.equal(h.b.errors.length, 0);
  });
}

test('真实隐形弩手：刚被阻挡的最新帧不继续滑动，阻挡者离场后恢复移动', () => {
  const h = arena('enemy_1019_jshoot', 9);
  let prev, pair;
  for (let i = 0; i < 1200 && !pair; i++) {
    h.step();
    if (i % 3 !== 2) continue;
    const next = h.b.snapshot(), e = h.enemy('enemy_1019_jshoot');
    const a = prev?.units.find((u) => u[0] === e.id), z = next.units.find((u) => u[0] === e.id);
    if (a && z && (z[7] & UF.BLOCKED) && a[1] !== z[1] && !next.stand?.some((s) => s[0] === e.id)) pair = { A: prev, B: next, e, z };
    prev = next;
  }
  assert.ok(pair, '移动与首次阻挡发生于同一个快照间隔，且没有后摇元数据');
  const { A, B, e, z } = pair;
  const b = new SnapshotBuffer();
  b.push(snapFrame('test', A), 0);
  b.push(snapFrame('test', B), 0.05);
  assert.equal(b.sample(B.t + 0.24).get(e.id).x, z[1]);
  assert.equal(b.sample(B.t + 0.24).get(e.id).vx, 0);
  h.b.retreat(h.unit('t_wall'), { permanent: true });
  h.step(3);
  const C = h.b.snapshot();
  assert.equal(e.blockedBy, null);
  assert.ok(C.units.find((u) => u[0] === e.id)[1] < z[1]);
  b.push(snapFrame('test', C), 0.1);
  assert.ok(b.sample(C.t + 0.1).get(e.id).vx < 0);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('真实隐形弩手：恐惧打断在延迟帧之后仍恢复线性插值', () => {
  const h = arena('enemy_1019_jshoot');
  assert.ok(h.runUntil(() => {
    const e = h.enemy('enemy_1019_jshoot');
    return e && e.atkStandUntil - h.b.time > 4 * TICK && e.atkStandUntil - h.b.time < 5 * TICK;
  }, 10));
  const e = h.enemy('enemy_1019_jshoot'), A = h.b.snapshot();
  const until = A.stand.find((s) => s[0] === e.id)[1];
  h.step();
  assert.equal(h.b.applyStatus(e, 'fear', { duration: 1, source: h.unit('t_wall') }), true);
  // 本地 runner 在卡帧时会推进多个 tick 后再发出一帧。
  h.step(5);
  const B = h.b.snapshot();
  assert.ok(e.s.flags.fear && until > A.t && until < B.t);
  assert.ok(B.standCut.some((s) => s[0] === e.id && s[1] >= A.t));
  const b = new SnapshotBuffer();
  b.push(snapFrame('test', A), 0);
  b.push(snapFrame('test', B), (B.t - A.t) / 2);
  const a = A.units.find((u) => u[0] === e.id), z = B.units.find((u) => u[0] === e.id);
  const s = b.sample((A.t + until) / 2).get(e.id);
  const alpha = (until - A.t) / (2 * (B.t - A.t));
  near(s.x, a[1] + (z[1] - a[1]) * alpha);
  assert.ok(s.x > a[1]);
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0);
});

test('真实枯朽之种：命中帧即动画末尾，没有后摇时仍连续移动', () => {
  const h = arena('enemy_1269_nhfly');
  let prev, checked = false;
  for (let i = 0; i < 1200 && !checked; i++) {
    h.step();
    if (i % 3 !== 2) continue;
    const next = h.b.snapshot();
    const e = h.enemy('enemy_1269_nhfly');
    assert.ok(!next.stand?.some((s) => s[0] === e.id), '零后摇不发送 stand');
    const a = prev?.units.find((u) => u[0] === e.id), z = next.units.find((u) => u[0] === e.id);
    if (a && z && a[8] === ANIM.ATTACK && z[8] === ANIM.MOVE && (a[1] !== z[1] || a[2] !== z[2])) {
      const b = new SnapshotBuffer();
      b.push(prev, 0);
      b.push(next, 0.05);
      const s = b.sample((prev.t + next.t) / 2).get(e.id);
      near(s.x, (a[1] + z[1]) / 2);
      near(s.y, (a[2] + z[2]) / 2);
      checked = true;
    }
    prev = next;
  }
  assert.ok(checked, '真实攻击→移动帧对');
  assert.equal(h.b.errors.length, 0);
});

test('快照不泄漏无效后摇：盟友、隐藏、未部署、死亡、恐惧、眩晕、到期及失衡打断', () => {
  const h = arena('enemy_1019_jshoot');
  assert.ok(h.runUntil(() => h.enemy('enemy_1019_jshoot')?.atkStandUntil > h.b.time + 0.1, 10));
  const e = h.enemy('enemy_1019_jshoot');
  const has = () => h.b.snapshot().stand?.some((s) => s[0] === e.id) ?? false;
  assert.ok(has());
  const ally = h.unit('t_wall');
  ally.atkStandUntil = e.atkStandUntil;
  assert.ok(!h.b.snapshot().stand.some((s) => s[0] === ally.id));
  for (const key of ['hidden', 'alive', 'deployed']) {
    const old = e[key];
    e[key] = key === 'hidden';
    assert.equal(has(), false, key);
    e[key] = old;
  }
  for (const key of ['fear', 'stun']) {
    e.s.flags[key] = true;
    assert.equal(has(), false, key);
    e.s.flags[key] = false;
  }
  for (const until of [h.b.time, -Infinity, NaN, Infinity]) {
    e.atkStandUntil = until;
    assert.equal(has(), false);
  }
  e.atkStandUntil = h.b.time + 1;
  assert.ok(h.b.displace(e, { x: -1, y: 0 }, 0.2) > 0, '实际发生位移');
  assert.equal(has(), false, '失衡已清除后摇');
});
