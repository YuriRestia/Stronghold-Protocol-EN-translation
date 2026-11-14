// GitHub issue #32 (after v0.1.1), items 7 and 1 — DESIGN §22.9 / §22.10.
// - Item 7 「易拉三技能浮游单元无法造成伤害，只能造成三技能自带dot伤害」: 荒芜拉普兰德 S3 终幕·浩劫. PRTS 荒芜拉普兰德 S3 备注
//   "技能流程": ① for attack@times (1.3) s the drones spread evenly from her, one along her facing (0.1 → 2.0 tiles/s at
//   1.9/s²); ② each then picks the target nearest to itself (ties: nearest to her) and chases it (2.0 → 4.0 at 1.0/s²);
//   ③ on the target it attacks like a normal drone ("此状态下的攻击行为同正常浮游单元"), a target lost → it reappears in
//   the 1.5-side square around it and picks again; nothing selectable → it circles (radius 0.9, 1.0 tiles/s, counter-
//   clockwise). The drones' damage is neither a normal attack nor skill damage ("该技能释放的浮游单元造成的伤害不属于普通
//   攻击/技能直接伤害"); every drone is out, so she makes no attack of her own. Before 0.1.2 the skill only dealt its
//   once-per-second aura.
// - Item 1 「余二技能有伤害和特效，但不能拉怪」: 余 S2 厚礼上宾 teleports the ground-reachable enemies of x-1 onto his tile —
//   leaders too unless 自缚 (PRTS 卢西恩 / 假想敌：铳 "传送抗性=无"; it skipped every leader), and its 'pull' fx plays only
//   when someone was teleported (it played with nobody pulled).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { TICK } from '../../server/sim/constants.js';
import { rotateOffset, toLocal } from '../../server/sim/dir.js';

const BOTH = ['chess_char_6_18_a', 'chess_char_6_18_b'];
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e7, speed: 0, ...o });
const approx = (a, b, msg = '', eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg} ${a} ≈ ${b}`);
const done = (h) => { checkInvariants(h.b); assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0])); };
/** 荒芜拉普兰德 on (10,4) facing RIGHT with S3 (her default) ready; `enemies` parked. */
function wolf(id, enemies, o = {}) {
  return makeBattle({
    seed: 3, timeLimit: 400, autoFinish: false, captureNoisy: true, hooks: ['damaged', 'attack', 'statusApplied', 'death', 'skillStart'],
    defs: { enemies: Object.fromEntries(enemies.map((e) => [e.key, e.rec ?? dummy(e.key)])) },
    units: [{ chessId: id, row: 10, col: 4, dir: 'RIGHT', carryState: o.carry ?? { sp: 999 } }],
    enemies: enemies.map((e) => ({ key: e.key, pos: e.pos })), ...o.battle,
  });
}
const droneHits = (h, u, f = () => true) => h.hooksOf('damaged').filter((c) => c.source === u && (c.dmg?.tags || []).includes('droneAttack') && f(c));
/** Each drone's attacks, seen from its attack clock (reset to her interval when it attacks): [[{ t, ramp, target }]]. */
function watchDrones(h, u) {
  const log = [];
  let last = [];
  h.b.on('tick', () => {
    const D = u.mem.drones || [];
    D.forEach((d, i) => {
      log[i] ??= [];
      if (d.cd > (last[i] ?? 0) + 1e-9) log[i].push({ t: h.b.time, ramp: d.ramp, target: d.t });
    });
    last = D.map((d) => d.cd);
  });
  return log;
}

// =====================================================================================================================
// item 7 — 荒芜拉普兰德 S3 终幕·浩劫

test('荒芜拉普兰德 S3 ① ②: the drones spread attack@times s (evenly, one along her facing, 0.1 → 2.0 tiles/s), then chase at 2.0 → 4.0 tiles/s', () => {
  for (const id of BOTH) {
    // 联防 field (21 columns): room for a chase long enough to reach 4.0
    const h = wolf(id, [{ key: 'far', pos: [10, 17] }], { battle: { kind: 'unite' } });
    const u = h.unit(id), bb = u.def.skill.bb;
    assert.ok(h.runUntil(() => u.skill.active, 5), 'S3 fires with an enemy anywhere on the field (GDGLOW_SKILL_2)');
    const t0 = h.b.time;
    const D = u.mem.drones;
    assert.equal(D.length, 1 + bb['attack@cnt'], '浮游单元+attack@cnt (one drone of her own)');
    for (let i = 0; i < D.length; i++) {
      const a = (2 * Math.PI * i) / D.length; // RIGHT = +col; row 0 is the bottom row, so the angles run counter-clockwise
      approx(D[i].hx, Math.cos(a), `drone ${i} heading x`, 1e-12);
      approx(D[i].hy, Math.sin(a), `drone ${i} heading y`, 1e-12);
    }
    const ticks = Math.round(bb['attack@times'] / TICK);
    assert.equal(ticks, 39, 'attack@times = 1.3 s (PRTS ① "1.3s内")');
    h.step(ticks - 1);
    const t = (ticks - 1) * TICK;
    const spread = t <= 1 ? 0.1 * t + 0.95 * t * t : 1.05 + 2 * (t - 1); // v = min(2.0, 0.1 + 1.9 t)
    for (const d of D) {
      assert.equal(d.phase, 'spread');
      approx(Math.hypot(d.x - u.x, d.y - u.y), spread, 'spread distance', 1e-9);
    }
    h.step(1);
    const far = h.enemies()[0];
    for (const d of D) assert.ok(d.phase === 'chase' && d.t === far, 'then every drone chases the one enemy');
    const d0 = D[0];
    approx(d0.v, 2 + TICK, 'chase: 初速度 2.0, 加速度 1.0', 1e-9);
    h.step(Math.round(2 / TICK));
    approx(d0.v, 4, '最大速度 4.0', 1e-12);
    // drone 0 flies straight on: 1.65 tiles of spread, then 11.35 more to the enemy (2 s to reach 4.0 covering 6 tiles,
    // 5.35 at 4.0) → it lands its first hit ≈ 1.3 + 2 + 1.3375 s after the cast
    assert.ok(h.runUntil(() => droneHits(h, u).length > 0, 5));
    const first = droneHits(h, u)[0];
    assert.ok(Math.abs(first.t - t0 - 4.6375) <= 2 * TICK, `first drone hit at ${(first.t - t0).toFixed(3)} s`);
    done(h);
  }
});

test('荒芜拉普兰德 S3 ③: a drone on its target attacks every attack interval of hers for ATK × its own funnel ramp; she makes no attack; neither attack nor skill damage; 缴械 does not stop it', () => {
  for (const id of BOTH) {
    const h = wolf(id, [{ key: 'e', pos: [10, 6] }]);
    const u = h.unit(id), bb = u.def.skill.bb;
    const log = watchDrones(h, u);
    assert.ok(h.runUntil(() => u.skill.active, 5));
    const t0 = h.b.time;
    h.run(6);
    h.b.applyStatus(u, 'disarm', { duration: 3, source: null });
    assert.ok(u.s.flags.disarm, 'disarmed');
    const td = h.b.time;
    h.run(8);
    assert.ok(u.skill.active);
    const f = u.profile.funnel, e = h.enemies()[0];
    assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u && c.t >= t0).length, 0, 'no normal attack of hers during S3');
    const hits = droneHits(h, u);
    assert.ok(hits.length >= 3 * 8, `${hits.length} drone hits in 14 s`);
    for (const c of hits) {
      assert.equal(c.type, 'arts');
      assert.equal(c.target, e);
      assert.ok(!c.dmg.isAttack && !c.dmg.isSkill, 'PRTS: 不属于普通攻击/技能直接伤害');
    }
    const scale = (c) => c.amount / (u.s.atk * u.s.dmgDealtMul);
    assert.equal(hits.filter((c) => Math.abs(scale(c) - f.init) < 1e-6).length, u.mem.drones.length, 'each drone starts its own ramp at init');
    assert.ok(hits.every((c) => scale(c) <= f.max + 1e-9) && hits.some((c) => Math.abs(scale(c) - f.max) < 1e-6), 'up to the trait cap');
    assert.ok(hits.some((c) => c.t > td && c.t < td + 3), '缴械 does not stop the drones');
    // per drone: init, +delta per hit (capped), one hit per attack interval of hers (rounded up to whole ticks)
    const gap = Math.ceil(u.s.interval / TICK - 1e-9) * TICK;
    assert.equal(log.length, 1 + bb['attack@cnt']);
    for (const L of log) {
      assert.ok(L.length >= 8);
      L.forEach((a, k) => {
        approx(a.ramp, Math.min(f.max, f.init + k * f.delta), `hit ${k} ramp`, 1e-9);
        if (k) approx(a.t - L[k - 1].t, gap, `hit ${k} gap`, 1e-6);
      });
    }
    // the aura stays: attack@magic_atk_scale × ATK arts once per second on the enemies around the drones
    const aura = h.hooksOf('damaged').filter((c) => c.source === u && (c.dmg?.tags || []).includes('drone'));
    assert.ok(aura.length >= 10 && aura.every((c) => Math.abs(c.amount - u.s.atk * u.s.dmgDealtMul * bb['attack@magic_atk_scale']) < 1e-6));
    assert.ok(h.hooksOf('statusApplied').filter((c) => c.status === 'fear' && c.target === e).length >= 1, '恐惧 on the catch');
    done(h);
  }
});

test('荒芜拉普兰德 S3: every drone picks the enemy nearest to itself; a dead target sends it to the 1.5 square around it, the next lock restarts its ramp; nothing left → it circles (0.9, 1 tile/s, counter-clockwise)', () => {
  for (const id of BOTH) {
    const h = wolf(id, [{ key: 'weak', pos: [10, 6], rec: dummy('weak', { hp: 900 }) }, { key: 'e', pos: [12, 9] }]);
    const u = h.unit(id);
    const log = watchDrones(h, u);
    let deadAt = null, deadPos = null;
    h.b.on('death', (c) => { if (c.unit.defId === 'enemy_weak' || c.unit.defId === 'weak') { deadAt = h.b.time; deadPos = { x: c.unit.x, y: c.unit.y }; } });
    assert.ok(h.runUntil(() => u.skill.active, 5));
    const D = u.mem.drones;
    const weak = h.enemies().find((x) => /weak/.test(x.defId)), far = h.enemies().find((x) => !/weak/.test(x.defId));
    h.step(Math.round(u.def.skill.bb['attack@times'] / TICK));
    assert.ok(D.every((d) => d.t === weak), 'PRTS ②: the nearest to each drone — all three take the weak one (no spreading over free targets)');
    assert.ok(h.runUntil(() => deadAt != null, 20), 'the weak one falls');
    h.step(1);
    const f = u.profile.funnel;
    for (const d of D) {
      assert.equal(d.t, far, 'then the remaining enemy');
      // reappeared in the square around the fallen target, then one chase step (< 4 tiles/s × 1 tick)
      assert.ok(Math.max(Math.abs(d.x - deadPos.x), Math.abs(d.y - deadPos.y)) <= 0.75 + 4 * TICK + 1e-9, `drone at (${d.y.toFixed(2)}, ${d.x.toFixed(2)})`);
    }
    assert.ok(h.runUntil(() => log.every((L) => L.some((a) => a.target === far)), 20));
    for (const L of log) approx(L.find((a) => a.target === far).ramp, f.init, 'a new target: back to init', 1e-9);
    // nothing selectable: circle on its left
    h.b.dealDamage(null, far, { amount: 1e9, type: 'true' });
    h.step(2);
    for (const d of D) {
      assert.ok(d.orbit && d.phase === 'seek');
      const a0 = Math.atan2(d.y - d.orbit.cy, d.x - d.orbit.cx);
      approx(Math.hypot(d.x - d.orbit.cx, d.y - d.orbit.cy), 0.9, 'radius', 1e-9);
      h.step(3);
      const a1 = Math.atan2(d.y - d.orbit.cy, d.x - d.orbit.cx);
      const turn = ((a1 - a0) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      approx(turn, (3 * TICK * 1) / 0.9, 'counter-clockwise at 1.0 tiles/s', 1e-9);
    }
    done(h);
  }
});

test('荒芜拉普兰德 S3: 头狼 stage 3 reached while the skill runs releases one more drone (PRTS ① "补充浮游单元"), which spreads along her facing and attacks too', () => {
  const id = 'chess_char_6_18_a';
  const h = wolf(id, [{ key: 'e', pos: [10, 6] }], { carry: {} });
  const u = h.unit(id), bb = u.def.skill.bb;
  // hold her SP until 头狼 stage 2 (2 × interval s on the field), then cast
  let armed = false;
  h.b.on('tick', () => {
    if (armed || !u.skill || u.skill.active) return;
    if ((u.mem.wolfStage || 0) >= 2) { armed = true; u.skill.gainSp(u.skill.spCost, 'init', true); } else u.skill.sp = 0;
  });
  const iv = u.def.talents[0].bb.interval;
  assert.ok(h.runUntil(() => u.skill.active, 2 * iv + 3));
  assert.equal(u.mem.drones.length, 1 + bb['attack@cnt']);
  assert.ok(h.runUntil(() => u.mem.wolfStage === 3, iv + 2));
  h.step(1);
  assert.ok(u.skill.active, 'stage 3 inside the skill');
  const D = u.mem.drones;
  assert.equal(D.length, 2 + bb['attack@cnt'], '数量+1');
  const nd = D.at(-1);
  assert.equal(nd.phase, 'spread');
  approx(nd.hx, 1, 'along her facing', 1e-12);
  assert.ok(Math.hypot(nd.x - u.x, nd.y - u.y) < 0.1, 'from her');
  const tn = h.b.time;
  assert.ok(h.runUntil(() => nd.rampId != null, 10), 'the new drone reaches the enemy and attacks');
  assert.ok(droneHits(h, u, (c) => c.t >= tn).length >= 1);
  done(h);
});

test('荒芜拉普兰德 S3: knocked out in the middle of a tick (here by a kill hook), she deals nothing more in that tick', () => {
  // the weak one dies to a drone hit with the strong one on the same spot; its death hook knocks her out at once
  const h = wolf('chess_char_6_18_a', [{ key: 'w', pos: [10, 7], rec: dummy('w', { hp: 300 }) }, { key: 'e', pos: [10, 7] }]);
  const u = h.unit('chess_char_6_18_a');
  let ko = false;
  const late = [];
  h.b.on('damaged', (c) => { if (c.source === u && !u.alive) late.push((c.dmg?.tags || []).join('+')); });
  h.b.on('death', (c) => { if (c.unit.side === 'enemy' && !ko) { ko = true; h.b.dealDamage(null, u, { amount: 1e9, type: 'true' }); } });
  assert.ok(h.runUntil(() => ko, 30), 'a drone hit kills the weak one');
  assert.equal(u.alive, false);
  assert.equal(u.mem.drones, null, 'the skill ended with her');
  assert.deepEqual(late, [], 'no drone / area hit from the knocked-out wolf');
  done(h);
});

test('荒芜拉普兰德 S3 facing UP / LEFT / DOWN plays like facing RIGHT (enemies at turned offsets; a target falls, so the drones reappear)', () => {
  const OPEN = { id: 'open', name: 'open', rows: Array.from({ length: 19 }, () => '#' + 'r'.repeat(19) + '#'), devices: [] };
  const R0 = 9, C0 = 9;
  const OFFS = [[0, 2, 'weak'], [1, 4, 'e'], [-2, 3, 'e'], [3, -1, 'e']]; // facing-RIGHT offsets, no distance ties
  const run = (dir) => {
    const h = makeBattle({
      stage: OPEN, rect: { r0: 0, r1: 18, c0: 0, c1: 20 }, seed: 5, autoFinish: false, timeLimit: 60, hooks: [],
      routes: [{ motion: 'FLY', start: [18, 20], end: [18, 19], checkpoints: [] }],
      defs: { enemies: { weak: dummy('weak', { hp: 900 }), e: dummy('e') } },
      units: [{ chessId: 'chess_char_6_18_a', row: R0, col: C0, dir, abs: true, carryState: { sp: 999 } }],
      enemies: OFFS.map(([dr, dc, key]) => {
        const [ar, ac] = rotateOffset(dr, dc, dir), pos = [R0 + ar, C0 + ac];
        return { key, pos, route: { motion: 'WALK', start: pos, checkpoints: [{ type: 'WAIT', time: 1e4 }], end: pos } };
      }),
    });
    const u = h.unit('chess_char_6_18_a');
    h.step(1);
    const foes = h.b.enemies.slice(); // in OFFS order (a fallen one leaves battle.enemies)
    assert.equal(foes.length, OFFS.length);
    assert.ok(h.runUntil(() => u.skill.active, 5));
    h.run(12);
    done(h);
    return { hp: foes.map((e) => (e.alive ? e.hp : 0)), drones: u.mem.drones.map((d) => toLocal(d.y - R0, d.x - C0, dir)) };
  };
  const base = run('RIGHT');
  assert.equal(base.hp[0], 0, 'the weak one fell: its drones reappeared around it and picked again');
  for (const dir of ['UP', 'LEFT', 'DOWN']) {
    const o = run(dir);
    base.hp.forEach((hp, i) => approx(o.hp[i], hp, `${dir}: enemy ${OFFS[i]} HP`, 1e-9));
    base.drones.forEach(([lr, lc], i) => {
      approx(o.drones[i][0], lr, `${dir}: drone ${i} local row`, 1e-6);
      approx(o.drones[i][1], lc, `${dir}: drone ${i} local col`, 1e-6);
    });
  }
});

// =====================================================================================================================
// item 1 — 余 S2 厚礼上宾

/** 余 on (10,5) with S2 (`sp` carried in); parked enemies (`[key, row, col, tag?, motion?]`). */
function yuS2(chessId, foes, sp = 999, defs = undefined) {
  const hold = (r, c, motion = 'WALK') => ({ motion, start: [r, c], end: [9, 2], checkpoints: [{ type: 'WAIT', time: 99 }] });
  const h = makeBattle({
    seed: 5, timeLimit: 120, autoFinish: false, defs,
    units: [{ chessId, row: 10, col: 5, dir: 'RIGHT', skillIndex: 1, carryState: { sp } }],
    enemies: foes.map(([key, r, c, tag, motion]) => ({ key, route: hold(r, c, motion), time: 0, tag })),
  });
  h.step(1);
  return h;
}
const castOf = (h, u) => h.hooksOf('skillStart').find((c) => c.unit === u);

test('余 S2 (deliberate deviation, DESIGN §22.10): it fires with a ground enemy two tiles away and nobody hitting him — SKILL_RANGE on x-1 — and the enemy lands on his tile', () => {
  for (const id of ['chess_char_6_03_a', 'chess_char_6_03_b']) {
    const h = yuS2(id, [['e', 10, 7]], 999, { enemies: { e: enemyRec({ key: 'e', hp: 1e6, speed: 0, atk: 0 }) } });
    const yu = h.unit(id);
    assert.equal(yu.skill.rule, 'SKILL_RANGE', 'the data rule (rawRule TAKE_DAMAGE)');
    const e = h.b.enemies[0];
    assert.ok(yu.skill.active, 'cast in the first tick');
    assert.equal(castOf(h, yu).reason, 'SKILL_RANGE');
    assert.equal(yu.stats.taken, 0, 'nothing hit him');
    assert.deepEqual([e.y, e.x], [yu.tileR, yu.tileC], 'pulled onto his tile');
    h.step(1);
    assert.equal(e.blockedBy, yu, 'and blocked there');
    done(h);
  }
});

test('余 S2: a ranged enemy hitting him from outside x-1 no longer casts it (it was the official TAKE_DAMAGE); it fires once someone stands on x-1', () => {
  // 深池暗影术师 (range 2.5) on (9,7): outside x-1 (|Δrow| + |Δcol| = 3) but in reach of him
  const h = yuS2('chess_char_6_03_a', [['enemy_1168_dumage', 9, 7]]);
  const yu = h.unit('chess_char_6_03_a');
  assert.ok(h.runUntil(() => yu.stats.taken > 0, 10), 'it hits him');
  h.run(3);
  assert.equal(yu.skill.activations, 0, 'no cast from the hit');
  h.spawn('enemy_1422_lrsldr', { pos: [10, 6] });
  h.step(2);
  assert.equal(yu.skill.activations, 1, 'an enemy steps onto x-1: cast');
  done(h);
});

test('余 S2: a leader inside x-1 is teleported onto his tile like any ground enemy (PRTS 卢西恩 / 假想敌：铳 传送抗性 无); a 自缚 leader stays', () => {
  for (const id of ['chess_char_6_03_a', 'chess_char_6_03_b']) {
    // (S2 empty at first: it casts the tick its SP is filled, the three leaders already on x-1)
    const h = yuS2(id, [['enemy_2016_csphtm', 10, 7, 'boss'], ['enemy_9017_achunt', 11, 6, 'boss'], ['enemy_9033_acdeer', 9, 4, 'boss']], 0);
    const yu = h.unit(id);
    assert.ok(!yu.skill.active && !yu.skill.ready);
    const [lucien, gun, sami] = ['enemy_2016_csphtm', 'enemy_9017_achunt', 'enemy_9033_acdeer'].map((k) => h.b.enemies.find((e) => e.defId === k));
    assert.ok(lucien.isBoss && gun.isBoss && sami.isBoss, 'three leaders');
    assert.ok(sami.s.flags.selfBound && !lucien.s.flags.selfBound && !gun.s.flags.selfBound, '“萨米的意志” is 自缚 (content/bosses.js SELF_BOUND)');
    const samiAt = [sami.x, sami.y];
    const fx0 = h.eventsOf('fx').length;
    yu.skill.gainSp(yu.skill.spCost, 'init', true);
    h.step(1);
    assert.ok(yu.skill.active && yu.skill.id === 'skchr_yu_2' && castOf(h, yu).reason === 'SKILL_RANGE', 'S2 cast (SKILL_RANGE)');
    for (const e of [lucien, gun]) assert.deepEqual([e.y, e.x], [yu.tileR, yu.tileC], `${e.name} teleported onto 余`);
    assert.deepEqual([sami.x, sami.y], samiAt, '自缚: not a reachable target (PRTS 余 S2 备注)');
    const fx = h.eventsOf('fx').slice(fx0);
    assert.deepEqual(fx.filter((e) => e[1] === 'teleport').map((e) => e[4].id).sort(), [lucien.id, gun.id].sort());
    assert.deepEqual(fx.filter((e) => e[1] === 'pull').map((e) => e[4].n), [2], 'one pull fx: two teleported');
    h.step(1);
    assert.equal(lucien.blockedBy, yu, '卢西恩 (blockable) is blocked on his tile; 铳 is 不可阻挡');
    assert.equal(gun.blockedBy, null);
    done(h);
  }
});

test('余 S2 with nobody to pull (a flyer on x-1 sets it off): the burst hits it, no teleport and no pull fx', () => {
  const h = yuS2('chess_char_6_03_a', [['fly', 10, 6, null, 'FLY']], 999, { enemies: { fly: enemyRec({ key: 'fly', hp: 1e6, speed: 0, motion: 'FLY' }) } });
  const yu = h.unit('chess_char_6_03_a');
  const fly = h.b.enemies[0];
  assert.ok(fly.isFlying && yu.skill.active, 'cast: SKILL_RANGE counts any enemy on x-1');
  assert.ok(fly.hp < fly.s.maxHp, 'the burst hits air units [ASSUMED]');
  const fx = h.eventsOf('fx').filter((e) => e[1] === 'teleport' || e[1] === 'pull');
  assert.deepEqual(fx, [], 'a flyer is no 地面可达目标: no teleport, no pull fx');
  assert.ok(!(Math.round(fly.y) === yu.tileR && Math.round(fly.x) === yu.tileC), 'it stays');
  done(h);
});

test('余 S2 on the real leader rounds: 假想敌：铳 teleported onto 余 walks on to its next patrol checkpoint; 卢西恩 is blocked there, then resumes its loop', () => {
  const W = JSON.parse(fs.readFileSync(new URL('../../data/waves.json', import.meta.url), 'utf8'));
  const pool = (hp) => ({ hp, maxHp: hp, damage(pid, a) { this.hp = Math.max(0, this.hp - a); } });
  const X1 = [[2, 0], [1, -1], [1, 0], [1, 1], [0, -2], [0, -1], [0, 1], [0, 2], [-1, -1], [-1, 0], [-1, 1], [-2, 0]];
  for (const [tplId, key, board] of [['act1autochess_h07_02', 'enemy_9017_achunt', [11, 5]], ['act2autochess_h07_05', 'enemy_2016_csphtm', [10, 7]]]) {
    const tpl = W[tplId];
    const h = makeBattle({ kind: 'boss', stageId: 'act2autochess_m01', waveTemplate: tpl, sharedBoss: pool(3e6), seed: 9, autoFinish: false,
      units: [{ chessId: 'chess_char_6_03_a', row: board[0], col: board[1], dir: 'RIGHT', skillIndex: 1 }], setup(b) { b.enemyOverrides = tpl.overrides; } });
    h.step(1);
    const yu = h.unit('chess_char_6_03_a');
    const L = () => h.b.enemies.find((e) => e.defId === key && e.alive);
    const inX1At = (y, x) => X1.some(([dr, dc]) => Math.round(y) === yu.tileR + dr && Math.round(x) === yu.tileC + dc);
    // well inside x-1 (0.1 tiles of margin: the next tick's step cannot take it out before the cast)
    const deep = (e) => [[0, 0], [0.1, 0], [-0.1, 0], [0, 0.1], [0, -0.1]].every(([a, b]) => inX1At(e.y + a, e.x + b));
    h.b.on('tick', () => { if (!yu.skill.active && !L()?.mem.yuTest) yu.skill.sp = 0; }); // keep S2 for the leader
    // 假想敌：铳 holds its fire here: with its official ramp (from its first hit, docs/history/0.3.4.md §37.104) it
    // either kills 余 before it reaches x-1 or, at 420 ASPD, shoots faster than its clip and so stands for good
    // (ai.js attackStand); this test is about the teleport and the route, not the gun's attacks
    h.b.on('tick', () => { const g = L(); if (g && key === 'enemy_9017_achunt') g.profile.noAttack = true; });
    assert.ok(h.runUntil(() => L() && deep(L()), 90), `${key} walks into x-1`);
    const e = L();
    assert.ok(e.isBoss && !e.s.flags.selfBound && e.route.legs.length > 1, 'a patrolling leader');
    e.mem.yuTest = true;
    const leg0 = e.route.legIdx;
    yu.skill.gainSp(yu.skill.spCost, 'init', true);
    h.step(1);
    assert.ok(yu.skill.active, 'S2 (SKILL_RANGE)');
    assert.deepEqual([e.y, e.x], [yu.tileR, yu.tileC], 'teleported onto 余');
    assert.equal(e.route.pts, null, 'its path is re-planned from there');
    if (key === 'enemy_9017_achunt') {
      assert.ok(h.runUntil(() => e.route.legIdx !== leg0, 25), '不可阻挡: walks on to its next patrol checkpoint');
    } else {
      h.step(1);
      assert.equal(e.blockedBy, yu, 'blocked by 余 (block +2)');
      assert.ok(h.runUntil(() => e.route.legIdx !== leg0 && !(Math.round(e.y) === yu.tileR && Math.round(e.x) === yu.tileC), 30), 'blinks past and resumes its loop');
    }
    assert.ok(e.alive && !h.b.enemies.some((x) => x === e && x.leaked), 'never leaks');
    done(h);
  }
});
