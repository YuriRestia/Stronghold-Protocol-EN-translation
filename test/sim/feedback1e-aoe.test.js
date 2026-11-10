// Community report E3 after the 0.1.0 release: "干员卡涅利安的攻击不是真群攻". The 阵法术师 trait "技能开启时攻击造成群体
// 法术伤害" is an attack on EVERY enemy inside the attack range (Arknights Terra Wiki, Phalanx Caster: "attacks hit all
// enemies within their range … equal damage to all enemies in range, regardless of distance"; PRTS 作战机制 §AOE伤害判定
// "对攻击范围内的每个可以被选中的敌人进行判定"; PRTS 林 S3 备注 "单次普攻最多触发1次效果" — one normal attack can kill
// several), not one target plus a 1.1-tile splash. The same holds for the 轰击术师 line ("超远距离的群体法术伤害": every
// enemy on the line — PRTS 作战机制: 伊芙利特's 炎爆, her next-attack skill, is a 锁定攻击范围 AoE; Terra Wiki Blast
// Caster), while the 扩散术师 "群体法术伤害" stays a splash of 1.1 tiles around the struck target (PRTS 溅射半径一览, which
// documents no splash radius for the 阵法术师 / 轰击术师 — supporting only — and Terra Wiki Splash Caster). Real
// battles with the real chess (every selectable attacking skill, normal + elite), counting the enemies each attack
// damages. Her kit per PRTS 卡涅利安 备注: a charged S1 keeps the skill-off trait
// (不攻击 + the guard), the charged S3 mark stacks before the damage and is one buff per enemy (the setter's bonus); a
// 流形 copy takes no attack shape ('beam' → bolt); `rangeAoe` from any source means every enemy in range, instant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { getDefaultSource, spawnsFromTemplate } from '../../server/sim/simdata.js';
import { TOKEN_IDS } from '../../server/sim/content/tokens.js';
import { effectiveProfile } from '../../server/sim/ai.js';
import { resolveProfile } from '../../server/sim/professions.js';
import { getData } from '../../server/data.js';

const ds = getDefaultSource();
const dummy = (o = {}) => enemyRec({ key: 'enemy_dummy', hp: 1e8, speed: 0, ...o });
const keyOf = (e) => Math.round(e.y) * 21 + Math.round(e.x);

/** attackId → Map(target → damage) of the normal attacks `u` landed. */
function perAttack(h, u) {
  const out = new Map();
  for (const c of h.hooksOf('damaged')) {
    if (c.source !== u || !c.dmg?.isAttack) continue;
    const k = c.dmg.attackId;
    if (!out.has(k)) out.set(k, new Map());
    const m = out.get(k);
    m.set(c.target, (m.get(c.target) ?? 0) + c.amount);
  }
  return out;
}

/** One phalanx / blast caster with its skill on and `pos` enemies around it: every attack hits all of them alike. */
function hitsAll(id, skillIndex, pos, { equal = true, row = 10, col = 5 } = {}) {
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: dummy() } },
    units: [{ chessId: id, row, col, ...(skillIndex != null ? { skillIndex } : {}) }],
    timeLimit: 120, hooks: ['damaged'], captureNoisy: true,
  });
  h.step();
  const u = h.unit(id);
  const es = pos.map((p) => h.spawn('enemy_dummy', { pos: p }));
  if (u.profile.noAttackUnlessSkill) {
    u.skill.gainSp(u.skill.spCost); // one charge: an uncharged cast (a charged 卡涅利安 S1 keeps the trait's 不攻击)
    assert.ok(h.runUntil(() => u.skill.active, 10), `${id}/${skillIndex}: skill on`);
  }
  for (const e of es) assert.ok(u.rangeKeys.includes(keyOf(e)), `${id}/${skillIndex}: enemy at ${e.y},${e.x} inside the range`);
  h.run(5);
  const atks = [...perAttack(h, u).values()];
  assert.ok(atks.length >= 2, `${id}/${skillIndex}: attacked (${atks.length})`);
  for (const m of atks) {
    assert.equal(m.size, es.length, `${id}/${skillIndex}: one attack damages every enemy in range (${m.size}/${es.length})`);
    if (!equal) continue;
    const v = [...m.values()];
    const lo = Math.min(...v), hi = Math.max(...v);
    assert.ok(hi - lo <= 1e-6 * hi, `${id}/${skillIndex}: the same damage near and far (${lo} … ${hi})`);
  }
  checkInvariants(h.b);
  return { h, u };
}

// pairwise ≥ 1.41 tiles apart — no 1.1-tile splash around one of them reaches another; all on her x-1 range (facing RIGHT)
const SPREAD = [[10, 7], [10, 3], [12, 5], [9, 5], [11, 6]];

test('E3 卡涅利安: every attack of each skill hits every enemy in her range, with equal damage (normal + elite)', () => {
  for (const id of ['chess_char_4_24_a', 'chess_char_4_24_b']) {
    hitsAll(id, 0, SPREAD); // S1 沙暴守卫
    hitsAll(id, 1, SPREAD); // S2 沙缚镣锁 (default)
    // S3 食噬之印 widens the range to x-2: an enemy on the wider range only is hit by the same attacks
    hitsAll(id, 2, [...SPREAD, [12, 6], [11, 3]]);
  }
});

test('E3 卡涅利安 S2: the 停顿 (charged: 束缚) lands on every enemy each attack hits', () => {
  const id = 'chess_char_4_24_a', bb = ds.getChess(id).skill.bb;
  const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: id, row: 10, col: 5 }], timeLimit: 60, hooks: ['statusApplied', 'damaged'], captureNoisy: true });
  h.step();
  const u = h.unit(id);
  const es = SPREAD.map((p) => h.spawn('enemy_dummy', { pos: p }));
  u.skill.gainSp(u.skill.spCost); // one charge: an uncharged cast
  assert.ok(h.runUntil(() => u.skill.active, 5));
  h.run(2);
  for (const e of es) assert.ok(h.hooksOf('statusApplied').some((c) => c.target === e && c.source === u && c.status === 'sluggish' && c.duration === bb['attack@sluggish']), `enemy at ${e.y},${e.x} slowed`);
});

test('E3 audit: every 阵法术师 of the pool (薄绿, 蜜蜡, 圣聆初雪) hits every enemy in range with each attack', () => {
  for (const id of ['chess_char_3_08_a', 'chess_char_3_08_b']) {
    hitsAll(id, 0, [...SPREAD, [12, 6]]); // S1 风语: x-2
    hitsAll(id, 1, SPREAD); // S2 聚能涡旋 (default): each struck enemy is pushed towards her, still in range
  }
  for (const id of ['chess_char_4_05_a', 'chess_char_4_05_b']) hitsAll(id, null, SPREAD); // S2 守卫尖碑 (hidden chess)
  for (const id of ['chess_char_6_02_a', 'chess_char_6_02_b']) {
    hitsAll(id, 1, SPREAD); // S2 霜涛覆岭 (toggle)
    hitsAll(id, 2, [...SPREAD, [12, 6]]); // S3 群山俯首 (default, x-2)
  }
});

test('E3 audit: the 轰击术师 (阿罗玛, 协律) hit every enemy on their line, not one target plus a splash', () => {
  const LINE = [[10, 3], [10, 5], [10, 7]]; // 2 tiles apart on the 5-1 line of an operator at (10, 2)
  hitsAll('chess_char_4_10_a', null, LINE, { col: 2 });
  hitsAll('chess_char_4_10_b', null, LINE, { col: 2, equal: false }); // BLA-X: farther targets take more
  hitsAll('chess_char_4_10_a', 0, LINE, { col: 2 }); // S1 强效清洁 (charges)
  hitsAll('chess_char_2_15_a', null, LINE, { col: 2 });
  hitsAll('chess_char_2_15_b', null, LINE, { col: 2, equal: false });
});

test('E3 audit: a 扩散术师 still splashes 1.1 tiles around its target — not every enemy in range', () => {
  for (const id of ['chess_char_1_14_a', 'chess_char_4_02_a']) {
    const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: id, row: 10, col: 3 }], timeLimit: 60, hooks: ['damaged'], captureNoisy: true });
    h.step();
    const u = h.unit(id);
    // A and B 1 tile apart (one splash), C 1.41 / 2.24 tiles from them — all three on the 3 × 3 range ahead
    const [A, B, C] = [[10, 4], [10, 5], [11, 3]].map((p) => h.spawn('enemy_dummy', { pos: p }));
    for (const e of [A, B, C]) assert.ok(u.rangeKeys.includes(keyOf(e)), `${id}: ${e.y},${e.x} in range`);
    h.run(8);
    const atks = [...perAttack(h, u).values()];
    assert.ok(atks.length >= 2, id);
    for (const m of atks) {
      const hit = new Set(m.keys());
      assert.ok(hit.size < 3, `${id}: never every enemy in range`);
      if (hit.has(A) || hit.has(B)) assert.ok(hit.has(A) && hit.has(B) && !hit.has(C), `${id}: A and B splash each other, C is out of the splash`);
    }
  }
});

test('E3 real stage + real wave: 卡涅利安 targets AND damages every enemy on her range with each attack (act2 m01, round 10)', () => {
  const data = getData({ log: { warn() {}, error() {}, info() {} } });
  const mode = data.config.modes.mode_multi_normal;
  const round = '10';
  const rc = mode.rounds[round];
  const tpl = ds.getWave(rc.template);
  const sc = mode.enemyScale?.[round] ?? {};
  const mods = { hpMul: (sc.hp ?? 1) ** (sc.kHp ?? 0), atkMul: (sc.atk ?? 1) ** (sc.kAtk ?? 0), speedMul: sc.speed ?? 1 };
  assert.ok(spawnsFromTemplate(tpl, { mods }).spawns.length > 0);
  for (const skillIndex of [1, 2]) {
    const id = 'chess_char_4_24_b';
    const h = makeBattle({
      stageId: 'act2autochess_m01', waveTemplate: tpl, mods, timeLimit: rc.combatTimeLimit, seed: 11, flags: { startOpCooldown: 3 },
      units: [
        { chessId: id, row: 10, col: 6, skillIndex },
        { chessId: 'chess_char_1_02_a', row: 10, col: 7 }, { chessId: 'chess_char_1_02_a', row: 11, col: 7 },
        { chessId: 'chess_char_1_01_a', row: 9, col: 7 }, { chessId: 'chess_char_2_14_a', row: 12, col: 6 },
      ],
      hooks: [],
    });
    const u = h.unit(id);
    const rows = [];
    let castWant = null, lastCast = null;
    const hit = new Map(); // attackId → the enemies its damage reached
    // (beforeAttack, after every content hook: the targets of the attack and the enemies on her range at that moment;
    // the attack that follows takes the next attackId)
    h.b.on('beforeAttack', (c) => {
      if (c.attacker !== u) return;
      const p = effectiveProfile(u);
      // official cast → hit: the targets were locked when the cast started, so the enemies on her range are those of the
      // cast start (kept below), less the ones that died during the wind-up; with no cast (no clip), those of now
      let want = new Set(h.b.enemiesInKeys(u.rangeKeys, u, p));
      for (const e of h.b.blockedTargets(u, p)) want.add(e);
      if (castWant) want = new Set([...castWant].filter((e) => e.alive && e.deployed !== false));
      rows.push({ attackId: h.b._attackSeq + 1, got: c.targets.length, want, all: [...want].every((e) => c.targets.includes(e)) });
    }, { priority: -2000 });
    h.b.on('damaged', (c) => {
      if (c.source !== u || !c.dmg?.isAttack) return;
      if (!hit.has(c.dmg.attackId)) hit.set(c.dmg.attackId, new Set());
      hit.get(c.dmg.attackId).add(c.target);
    }, { priority: -2000 });
    for (let limit = h.b.time + rc.combatTimeLimit + 5; !h.b.finished && h.b.time < limit;) {
      h.step();
      if (u.cast && u.cast !== lastCast) {   // a cast just started: the enemies on her range now
        const p = effectiveProfile(u);
        castWant = new Set(h.b.enemiesInKeys(u.rangeKeys, u, p));
        for (const e of h.b.blockedTargets(u, p)) castWant.add(e);
      } else if (!u.cast) castWant = null;
      lastCast = u.cast;
    }
    assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
    const crowded = rows.filter((r) => r.want.size >= 3);
    assert.ok(crowded.length >= 1, `S${skillIndex + 1}: attacks into a crowd (${crowded.length}/${rows.length})`);
    for (const r of rows) {
      assert.ok(r.all && r.got === r.want.size, `S${skillIndex + 1}: ${r.got} targets of ${r.want.size} enemies on her range`);
      // the damage itself: one instant hit on every one of them, in the same attack (no projectile, no splash)
      const got = hit.get(r.attackId) ?? new Set();
      assert.ok(got.size === r.want.size && [...r.want].every((e) => got.has(e)), `S${skillIndex + 1}: attack ${r.attackId} damaged ${got.size} of the ${r.want.size} enemies on her range`);
    }
  }
});

test('E3 卡涅利安 S3 食噬之印 values: ATK climbs from +0 % in 1 s steps to the full bonus at 20 s (PRTS 备注), normal + elite', () => {
  for (const id of ['chess_char_4_24_a', 'chess_char_4_24_b']) {
    const bb = ds.getChess(id, { skillIndex: 2 }).skill.bb;
    const h = makeBattle({ units: [{ chessId: id, row: 10, col: 5, skillIndex: 2 }], timeLimit: 60, hooks: [] });
    h.step();
    const u = h.unit(id);
    u.skill.addCharge(1);
    assert.ok(u.skill.activate('test'));
    const t0 = h.b.time;
    const bonus = () => u.s.atk / u.base.atk - 1;
    // PRTS 卡涅利安 S3 备注 "攻击力从+0%开始在20秒内线性增加，攻击力每1秒更新1次，在第20秒达到最大值"
    for (const [at, steps] of [[0.5, 0], [1.5, 1], [10.5, 10], [19.5, 19], [20.5, 20]]) {
      h.run(t0 + at - h.b.time);
      assert.ok(u.skill.active, `${id}: still on at ${at} s`);
      const want = bb.atk * steps / 20;
      assert.ok(Math.abs(bonus() - want) < 1e-9, `${id}: +${(bonus() * 100).toFixed(2)} % at ${at} s, want +${(want * 100).toFixed(2)} %`);
    }
  }
});

test('E3 卡涅利安 S1 沙暴守卫 charged: the skill-off trait stays in force — the DEF/RES guard AND 不攻击 (PRTS 备注 "应用蓄力时：应用技能未开启时的特性"); uncharged she strikes every enemy in range', () => {
  for (const id of ['chess_char_4_24_a', 'chess_char_4_24_b']) {
    const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy() } }, units: [{ chessId: id, row: 10, col: 5, skillIndex: 0 }], timeLimit: 120, hooks: ['damaged'], captureNoisy: true });
    h.step();
    const u = h.unit(id);
    const es = SPREAD.map((p) => h.spawn('enemy_dummy', { pos: p }));
    assert.equal(u.skill.maxCharges, 2, `${id}: S1 stores 2 charges`);
    u.skill.gainSp(u.skill.spCost * u.skill.maxCharges); // every charge stored: the SEARCH cast is a charged one
    assert.ok(h.runUntil(() => u.skill.active, 10), `${id}: charged S1 on`);
    u.skill.charges = 0; // (the spare charge would re-cast as soon as it ends)
    u.skill.sp = 0;
    assert.ok(u.findBuff('billro:s1guard'), `${id}: charged — the trait guard stays`);
    const t0 = h.b.time, dur = u.skill.timeLeft;
    assert.ok(h.runUntil(() => !u.skill.active, dur + 1), `${id}: the charged S1 ends`);
    assert.ok(h.b.time - t0 > dur - 0.1, `${id}: ran its ${dur} s`);
    assert.equal(perAttack(h, u).size, 0, `${id}: no attack during a charged S1`);
    // uncharged: the guard goes, every attack strikes all five enemies
    u.skill.gainSp(u.skill.spCost);
    assert.ok(h.runUntil(() => u.skill.active, 10), `${id}: uncharged S1 on`);
    assert.ok(!u.findBuff('billro:s1guard'), `${id}: uncharged — no trait guard`);
    h.run(5);
    const atks = [...perAttack(h, u).values()];
    assert.ok(atks.length >= 2, `${id}: uncharged S1 attacks (${atks.length})`);
    for (const m of atks) assert.equal(m.size, es.length, `${id}: uncharged S1 strikes every enemy in range (${m.size}/${es.length})`);
    checkInvariants(h.b);
  }
});

/** `damage / ATK` of every normal attack `u` lands on `e` (0-RES dummy, ATK read at the hit). */
function ratios(h, u, e) {
  const out = [];
  h.b.on('damaged', (c) => { if (c.source === u && c.target === e && c.dmg?.isAttack) out.push(c.amount / u.s.atk); }, { priority: -1000 });
  return out;
}

test('E3 卡涅利安 S3 食噬之印 charged: each attack stacks the mark BEFORE its damage — ×1.2 on the first hit, ×2.0 from the 5th (PRTS 备注), normal + elite', () => {
  for (const id of ['chess_char_4_24_a', 'chess_char_4_24_b']) {
    const per = ds.getChess(id, { skillIndex: 2 }).skill.bb['attack@damage_scale'];
    const h = makeBattle({ defs: { enemies: { enemy_dummy: dummy({ res: 0 }) } }, units: [{ chessId: id, row: 10, col: 5, skillIndex: 2 }], timeLimit: 120, hooks: [], captureNoisy: true });
    h.step();
    const u = h.unit(id);
    const e = h.spawn('enemy_dummy', { pos: [10, 6] });
    const r = ratios(h, u, e);
    u.skill.addCharge(2);
    assert.ok(u.skill.activate('test'));
    u.skill.charges = 0;
    u.skill.sp = 0;
    assert.ok(h.runUntil(() => r.length >= 7, 20), `${id}: 7 hits (${r.length})`);
    const want = [1, 2, 3, 4, 5, 5, 5].map((n) => 1 + per * n);
    for (let i = 0; i < want.length; i++) assert.ok(Math.abs(r[i] - want[i]) < 1e-6, `${id}: hit ${i + 1} ×${r[i].toFixed(4)}, want ×${want[i].toFixed(2)}`);
    assert.equal(e.findBuff('billro:mark').stacks, 5);
    h.runUntil(() => !u.skill.active, 25);
    assert.ok(!e.findBuff('billro:mark'), `${id}: the mark ends with her skill`);
    // uncharged: no mark, no bonus
    u.skill.gainSp(u.skill.spCost);
    assert.ok(h.runUntil(() => u.skill.active, 10));
    const n0 = r.length;
    assert.ok(h.runUntil(() => r.length >= n0 + 2, 10));
    for (const x of r.slice(n0)) assert.ok(Math.abs(x - 1) < 1e-6, `${id}: uncharged ×${x}`);
    assert.ok(!e.findBuff('billro:mark'));
  }
});

test('E3 卡涅利安 S3 charged: one mark per enemy — a second 卡涅利安 adds stacks without the bonus, the setter keeps it (PRTS 备注 popup)', () => {
  const A = 'chess_char_4_24_a', B = 'chess_char_4_24_b';
  const h = makeBattle({
    defs: { enemies: { enemy_dummy: dummy({ res: 0 }) } }, timeLimit: 120, hooks: [], captureNoisy: true,
    units: [{ chessId: A, row: 10, col: 5, skillIndex: 2 }, { chessId: B, row: 10, col: 7, skillIndex: 2 }],
  });
  h.step();
  const a = h.unit(A), b = h.unit(B);
  const e = h.spawn('enemy_dummy', { pos: [10, 6] }); // on both ranges
  const ra = ratios(h, a, e), rb = ratios(h, b, e);
  const charge = (u) => { u.skill.addCharge(2); assert.ok(u.skill.activate('test')); u.skill.charges = 0; u.skill.sp = 0; };
  charge(a);
  assert.ok(h.runUntil(() => ra.length >= 1, 5));
  assert.equal(e.findBuff('billro:mark').source, a, 'set by the first');
  charge(b);
  assert.ok(h.runUntil(() => rb.length >= 4 && ra.length >= 4, 15));
  const m = e.findBuff('billro:mark');
  assert.equal(e.buffs.filter((x) => x.key === 'billro:mark').length, 1, 'one mark');
  assert.equal(m.source, a, 'still the setter\'s');
  assert.equal(m.stacks, 5, 'both stacked it');
  for (const x of rb) assert.ok(Math.abs(x - 1) < 1e-6, `the second 卡涅利安 gets no bonus (×${x})`);
  assert.ok(Math.abs(ra[ra.length - 1] - 2) < 1e-6, `the setter ×${ra[ra.length - 1]} with 5 stacks`);
  // the setter's skill ends: her mark goes; the next charged hit of the other sets a mark of its own
  a.skill.stop();
  assert.ok(!e.findBuff('billro:mark'), 'the mark ends with the setter\'s skill');
  const n0 = rb.length;
  assert.ok(h.runUntil(() => rb.length > n0, 5));
  assert.equal(e.findBuff('billro:mark').source, b);
  assert.ok(Math.abs(rb[n0] - 1.2) < 1e-6, `its own mark ×${rb[n0]}`);
  checkInvariants(h.b);
});

test('E3 audit: a 流形 copying a 阵法术师 / 轰击术师 fires a single-target bolt — the copy takes no attack shape (tokens.js and the 缪尔赛思 kit)', () => {
  const MF = TOKEN_IDS.manifold;
  for (const kit of ['managed', 'token']) {
    for (const src of ['chess_char_4_10_a', 'chess_char_4_24_a']) {
      const h = makeBattle({
        defs: { enemies: { enemy_dummy: dummy() } }, timeLimit: 60, autoFinish: false, hooks: ['damaged'], captureNoisy: true,
        ...(kit === 'token' ? { kits: { chess_char_6_11_a: () => ({ skill: null, talents: [], generic: true }) } } : {}),
        units: [{ chessId: 'chess_char_6_11_a', row: 12, col: 2, uid: 1 }, { chessId: src, row: 12, col: 6, uid: 2 }, { kind: 'token', tokenId: MF, row: 9, col: 6, uid: 3, ownerUid: 1 }],
      });
      h.step();
      const m = h.b.allyUnits.find((u) => u.defId === MF && u.alive);
      assert.ok(h.runUntil(() => m.mem.mlyss || m.mem.copy, 10), `${kit}/${src}: copied`);
      assert.equal((m.mem.mlyss || m.mem.copy).from ?? m.mem.copy?.id, h.unit(src).id);
      assert.equal(m.profile.projectile, 'bolt', `${kit}/${src}: a bolt, not the instant 'beam'`);
      assert.ok(!m.profile.allInRange && !m.profile.rangeAoe, `${kit}/${src}: single target`);
    }
  }
});

test('E3 profile: rangeAoe is applied after every override — from a kit trait too it means every enemy in range with instant hits', () => {
  const def = { profession: 'CASTER', subProf: 'corecaster', attackKind: 'ranged', projectile: 'bolt', dmgType: 'arts', stats: { atk: 100 } };
  const plain = resolveProfile(def);
  assert.equal(plain.allInRange, false);
  assert.equal(plain.projectile, 'bolt');
  const aoe = resolveProfile(def, { rangeAoe: true });
  assert.equal(aoe.allInRange, true);
  assert.equal(aoe.projectile, 'beam');
  for (const sub of ['phalanx', 'blastcaster']) {
    const p = resolveProfile({ ...def, subProf: sub, attackKind: sub === 'phalanx' ? 'none' : 'ranged', projectile: sub === 'phalanx' ? 'none' : 'bolt' });
    assert.deepEqual([p.rangeAoe, p.allInRange, p.projectile, p.splashRadius], [true, true, 'beam', 0], sub);
  }
});
