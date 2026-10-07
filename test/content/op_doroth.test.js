// test/content/op_doroth.test.js — the 自选 operator kit of 多萝西 (char_4048_doroth, 6★ 陷阱师; kit
// server/sim/content/kits/ops/op-doroth.js) and of her trap 共振装置 (token_10025_doroth_recttp), fielded the production
// way (a DIY slot + its `diy` pick, simdata getDiy; her traps as the placed hand pieces of her player) in every form:
// tiers 5 / 6, normal (E2 Lv1, skill rank 4, no module) and elite (E2 Lv60, rank 7) with no module, TRP-Y 童话书 or TRP-X
// 梦中人 at stage 1 (tier 5) / 3 (tier 6). Numbers from data/backups.json; the fidelity checklist of kits/README.md.
// Run: node --test test/content/op_doroth.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { KITTED_CHARS, OPERATOR_KITS, KITS } from '../../server/sim/content/kits/index.js';
import { diyPool, validateDiyPicks } from '../../shared/diy.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const DOR = 'char_4048_doroth';
const TRAP = 'token_10025_doroth_recttp';
const FORMS = BACKUPS.units[DOR].forms;
const TOKREC = BACKUPS.tokens[TRAP];
const SLOT = { 5: 'chess_char_5_diy1_a', 6: 'chess_char_6_diy1_a' };
const Y = 'uniequip_002_doroth', X = 'uniequip_003_doroth';
const S1 = 'skchr_doroth_1';
const statusOf = (tier, elite) => (elite ? (tier === 5 ? '2/60/7/1' : '2/60/7/3') : '2/1/4/0');
const formOf = (tier, elite) => FORMS[statusOf(tier, elite)];
const skillOf = (tier, elite, id) => formOf(tier, elite).skills.find((s) => s.skillId === id);
const modOf = (tier, mod) => (mod ? formOf(tier, true).modules.find((m) => m.uniEquipId === mod) : null);
const talentOf = (tier, elite, mod, i) => modOf(tier, mod)?.talentChanges.find((t) => t.talentIndex === i)?.bb ?? formOf(tier, elite).talents[i].bb;
/** The trap's variant of a form, with the pick's skill / module (getDiyToken). */
const tokOf = (tier, elite, skill, mod) => {
  let v = TOKREC.variants[`${DOR}@${statusOf(tier, elite)}`];
  if (v.bySkill?.[skill]) v = { ...v, ...v.bySkill[skill] };
  if (mod && v.byModule?.[mod]) v = { ...v, ...v.byModule[mod] };
  return v;
};
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
const FORMS_ALL = [[5, false, null], [6, false, null], ...[5, 6].flatMap((t) => [null, Y, X].map((m) => [t, true, m]))];
const label = ([tier, elite, mod]) => `T${tier} ${elite ? 'elite' : 'normal'} ${mod ?? 'none'}`;

/** 多萝西 as uid 1 at (10, 4) facing RIGHT; `pieces` = the tiles of her placed traps (uids 2…). */
function field({ tier = 5, elite = false, mod = null, skill = 0, pieces = [], dp = 0, seed = 5, others = [] } = {}) {
  const units = [{ uid: 1, diy: { slot: SLOT[tier], charId: DOR, skillIndex: skill, uniEquipId: mod }, elite, row: 10, col: 4 }];
  pieces.forEach(([r, c], i) => units.push({ uid: 2 + i, kind: 'token', tokenId: TRAP, ownerUid: 1, row: r, col: c }));
  const h = makeBattle({
    defs: { enemies: ENEMIES }, timeLimit: 900, autoFinish: false, seed,
    flags: { dpPerSec: 0, dpMax: 999, dpInit: dp }, hooks: ['damaged', 'skillStart', 'statusApplied', 'deploy', 'death'], captureNoisy: true,
    units: [...units, ...others],
  });
  h.step();
  return { h, u: h.unit(1) };
}
const traps = (h) => h.b.allyUnits.filter((t) => t.kind === 'token' && t.defId === TRAP);
const alive = (h) => traps(h).filter((t) => t.alive);
const piece = (h, uid) => traps(h).find((t) => t.uid === uid);
const trapHits = (h) => h.hooksOf('damaged').filter((c) => c.source?.defId === TRAP && c.type !== 'element');
const D = (u) => u.trait.doroth;
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('多萝西 in every 自选 form: her operator kit (all three skills authored, SP_FULL), the form\'s stats + module attributes, 3-3, ranged physical arrows that hit air units, blocks 1, ground-targetable, 空 bond, no 特质; her traps untargetable, blocking nothing, no attack', () => {
  assert.equal(OPERATOR_KITS[DOR], KITS[DOR]);
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    for (const skill of [0, 1, 2]) {
      const { h, u } = field({ tier, elite, mod, skill, pieces: [[9, 6]] });
      const form = formOf(tier, elite), m = elite ? modOf(tier, mod) : null;
      assert.deepEqual([u.def.charId, u.def.diyFor, u.skill.id, !!u.kit.generic, u.kit.skillSource], [DOR, SLOT[tier], form.skills[skill].skillId, false, 'skills'], label(f));
      assert.deepEqual([u.base.maxHp, u.base.atk, u.base.def], [form.stats.maxHp + (m?.attr.maxHp ?? 0), form.stats.atk + (m?.attr.atk ?? 0), form.stats.def + (m?.attr.def ?? 0)], `${label(f)}: stats`);
      assert.deepEqual([u.s.blockCnt, u.profile.attack, u.profile.dmgType, u.profile.canHitFly, u.profile.projectile, u.base.bat], [1, 'ranged', 'phys', true, 'arrow', 0.85], `${label(f)}: 陷阱师`);
      assert.deepEqual(u.liveRangeGrid, form.rangeGrid, `${label(f)}: 3-3`);
      assert.deepEqual([form.skills[skill].trigger.rule, u.skill.rule], ['DEFAULT', 'SP_FULL'], `${label(f)}: AUTO acting on herself — SP_FULL`);
      assert.deepEqual([u.def.bonds, u.def.raw.garrisonIds], [['emptyShip'], []], `${label(f)}: bonds / 特质`);
      assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${label(f)}: ground enemies target her`);
      const t = piece(h, 2);
      const v = tokOf(tier, elite, skill, mod);
      assert.ok(t.alive && !t.kit.generic, `${label(f)}: the placed trap deployed with its kit`);
      assert.deepEqual([t.def.skill.id, t.s.flags.untargetable, t.s.blockCnt, t.profile.noAttack, t.base.cost], [v.skill.skillId, true, 0, true, v.stats.cost], `${label(f)}: the trap`);
      done(h);
    }
  }
  // E2 Lv1 1186 / 503 / 142, E2 Lv60 1395 / 573 / 162; TRP-Y +120 / +42 → +155 / +57, TRP-X +36 / +12 → +60 / +30
  assert.deepEqual([FORMS['2/1/4/0'].stats.atk, FORMS['2/60/7/1'].stats.atk], [503, 573]);
  assert.deepEqual([modOf(5, Y).attr, modOf(6, Y).attr, modOf(5, X).attr, modOf(6, X).attr], [{ maxHp: 120, atk: 42 }, { maxHp: 155, atk: 57 }, { atk: 36, def: 12 }, { atk: 60, def: 30 }]);
  // the trap card: cost 3 (TRP-X 2), redeploy 5 s, deploy limit 10 (TRP-X 13)
  assert.deepEqual([tokOf(6, true, 0, null).stats.cost, tokOf(6, true, 0, X).stats.cost, tokOf(6, true, 0, null).stats.respawnTime, tokOf(6, true, 0, null).stats.deployLimit, tokOf(6, true, 0, X).stats.deployLimit], [3, 2, 5, 10, 13]);
});

test('a 自选 pick: 多萝西 is offered at tiers 5 and 6 (she has a kit) and a roster with her passes validateDiyPicks', () => {
  const data = { chess: CHESS, backups: BACKUPS };
  assert.ok(KITTED_CHARS.includes(DOR));
  for (const t of [5, 6]) assert.ok(diyPool(t, { data, kitted: KITTED_CHARS }).includes(DOR), `tier ${t}`);
  assert.deepEqual(validateDiyPicks({ [SLOT[6]]: { charId: DOR, skillIndex: 2, uniEquipId: X } }, { data, kitted: KITTED_CHARS }),
    { ok: true, picks: { [SLOT[6]]: { charId: DOR, skillIndex: 2, uniEquipId: X } } });
});

test('T1 共振装置: at her deployment her stock is cnt (10) and attack@max_cnt traps (2; TRP-X stage 3: 3) appear on free melee tiles of her range (the enemies\' ground paths first) — no stock spent, inside the limit (10; TRP-X 13) with room left for the placed pieces', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t0 = talentOf(tier, elite, mod, 0);
    const lim = tokOf(tier, elite, 0, mod).stats.deployLimit;
    assert.deepEqual([t0.cnt, t0['attack@max_cnt'], lim], [10, mod === X && tier === 6 ? 3 : 2, mod === X ? 13 : 10], label(f));
    {
      const { h, u } = field({ tier, elite, mod });
      const made = alive(h);
      assert.equal(made.length, t0['attack@max_cnt'], `${label(f)}: ${t0['attack@max_cnt']} at her deployment`);
      assert.deepEqual([D(u).stock, D(u).limit], [10, lim], `${label(f)}: stock 10, limit ${lim}`);
      const range = new Set(u.rangeKeys), path = h.b.groundPathTiles();
      for (const t of made) {
        const k = t.tileR * 21 + t.tileC;
        assert.ok(range.has(k) && path.has(k) && h.b.grid.canStand(t.tileR, t.tileC), `${label(f)}: on a path melee tile of her range`);
        assert.equal(t.uid, null);
      }
      done(h);
    }
    // nine placed pieces: the summons leave them their slots (limit 10 ⇒ one; 13 ⇒ all)
    {
      const tiles = [[9, 5], [9, 6], [9, 7], [9, 8], [9, 9], [12, 5], [12, 6], [12, 7], [12, 8]];
      const { h, u } = field({ tier, elite, mod, pieces: tiles });
      const summoned = alive(h).filter((t) => t.uid == null);
      assert.equal(alive(h).filter((t) => t.uid != null).length, 9, `${label(f)}: every piece deployed at the start`);
      if (!(mod === X && tier === 6)) assert.equal(summoned.length, Math.min(t0['attack@max_cnt'], lim - 9), `${label(f)}: summons within the limit`);
      assert.ok(alive(h).length <= lim, `${label(f)}: never past the limit`);
      assert.equal(D(u).stock, 10, `${label(f)}: the start deployment spends no trap`);
      done(h);
    }
  }
});

test('the skills\' 主动效果 "立即获得一个陷阱": +1 to her stock as soon as the SP is full (no enemy needed: SP_FULL); 阻回 while the stock is full (the deploy limit)', () => {
  for (const f of [[5, false, null], [6, true, X]]) {
    const [tier, elite, mod] = f;
    const sk = skillOf(tier, elite, S1);
    assert.deepEqual([sk.skillType, sk.spCost, sk.initSp, sk.bb.cnt], ['AUTO', elite ? 16 : 19, 0, 1], label(f));
    const { h, u } = field({ tier, elite, mod });
    const lim = D(u).limit;
    // full potential: her deployment stock (cnt 10) fills the limit 10 — 阻回 from the deployment until a trap is spent
    // (one spent here: 9); TRP-X's limit 13 leaves room (10)
    assert.deepEqual([D(u).stock, lim], [10, mod === X ? 13 : 10], `${label(f)}: stock 10, limit ${lim}`);
    if (mod !== X) {
      assert.ok(u.findBuff('talent:doroth:full') && u.s.flags.noSp, `${label(f)}: 阻回 from her deployment`);
      D(u).stock--;
      h.step();
    }
    const s0 = mod === X ? 10 : 9;
    assert.ok(h.runUntil(() => u.skill.activations === 1, sk.spCost + 1), `${label(f)}: cast at full SP`);
    assert.equal(D(u).stock, s0 + 1, `${label(f)}: +1`);
    h.run(sk.spCost * (lim - s0 - 1) + 1);
    assert.equal(D(u).stock, lim, `${label(f)}: full`);
    assert.ok(u.findBuff('talent:doroth:full') && u.s.flags.noSp, `${label(f)}: 阻回`);
    const sp = u.skill.sp, casts = u.skill.activations;
    h.run(sk.spCost + 2);
    assert.deepEqual([u.skill.sp, u.skill.activations], [sp, casts], `${label(f)}: no SP, no cast while full`);
    D(u).stock--;
    h.step();
    assert.ok(!u.s.flags.noSp, `${label(f)}: SP again below the limit`);
    done(h);
  }
});

test('the trap goes off under the first selectable ground enemy on its tile (flyers never), with her ATK, from the trap, and withdraws: S1 atk_scale × ATK physical on it + DEF ×(1 − 25 % / 30 %) 5 s', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const tb = tokOf(tier, elite, 0, mod).skill.bb;
    assert.deepEqual([tb.atk_scale, tb.def, tb.duration], [elite ? 3.7 : 3.3, elite ? -0.3 : -0.25, 5], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, pieces: [[9, 6]] });
    const t = piece(h, 2);
    h.spawn('enemy_fly', { pos: [9, 6] });
    h.run(0.5);
    assert.ok(t.alive, `${label(f)}: a flyer does not set it off`);
    const e = h.spawn('enemy_dummy', { pos: [9, 6] });
    const near = h.spawn('enemy_dummy', { pos: [9, 7] });
    h.step();
    assert.ok(!t.alive, `${label(f)}: used up`);
    const hits = trapHits(h);
    assert.deepEqual(hits.map((c) => c.target), [e], `${label(f)}: only the enemy on it`);
    assert.equal(hits[0].source, t);
    const dbl = t.mem.dorDouble ? modOf(tier, mod)?.traitOverride?.bb.atk_scale ?? 1 : 1;
    approx(hits[0].amount, u.s.atk * tb.atk_scale * dbl, `${label(f)}: ${tb.atk_scale} × her ATK${dbl > 1 ? ' × 2 (TRP-Y)' : ''}`, 1e-6);
    assert.equal(hits[0].type, 'phys');
    const dd = h.hooksOf('statusApplied').find((c) => c.target === e && c.status === 'defDown');
    assert.deepEqual([dd?.duration, dd?.value], [5, -tb.def], `${label(f)}: DEF cut`);
    assert.ok(!near.findBuff('defDown'));
    assert.ok(h.eventsOf('fx').some((x) => x[1] === 'explode' && x[4]?.consumed === true && x[4]?.id === t.id), `${label(f)}: the blast marks it consumed`);
    done(h);
  }
});

test('S2 流沙区域生成: every selectable ground enemy within 1.2 takes atk_scale × ATK physical and 束缚 duration s (2 / 2.5) — duration_2 (3.5 / 5) when it hits one', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const tb = tokOf(tier, elite, 1, mod).skill.bb;
    assert.deepEqual([tb.atk_scale, tb.duration, tb.duration_2, tb.cnt_2], [elite ? 2.6 : 2.3, elite ? 2.5 : 2, elite ? 5 : 3.5, 1], label(f));
    {
      const { h, u } = field({ tier, elite, mod, skill: 1, pieces: [[9, 6]] });
      const t = piece(h, 2);
      const a = h.spawn('enemy_dummy', { pos: [9, 6] });
      const b = h.spawn('enemy_dummy', { pos: [10, 6] });   // 1.0 away
      const c = h.spawn('enemy_dummy', { pos: [10, 7] });   // 1.41 away: outside
      const fl = h.spawn('enemy_fly', { pos: [9, 7] });
      h.step();
      const hits = trapHits(h);
      assert.deepEqual(hits.map((x) => x.target).sort((p, q) => p.id - q.id), [a, b], `${label(f)}: within 1.2, ground only`);
      const dbl = t.mem.dorDouble ? 2 : 1;
      for (const x of hits) approx(x.amount, u.s.atk * tb.atk_scale * dbl, `${label(f)}: damage`, 1e-6);
      for (const e of [a, b]) approx(h.hooksOf('statusApplied').find((x) => x.target === e && x.status === 'bind').duration, tb.duration, `${label(f)}: 束缚`);
      assert.ok(!c.findBuff('bind') && !fl.findBuff('bind'));
      done(h);
    }
    {
      const { h } = field({ tier, elite, mod, skill: 1, pieces: [[9, 6]] });
      const a = h.spawn('enemy_dummy', { pos: [9, 6] });
      h.step();
      approx(h.hooksOf('statusApplied').find((x) => x.target === a && x.status === 'bind').duration, tb.duration_2, `${label(f)}: one enemy ⇒ duration_2`);
      done(h);
    }
  }
});

test('S3 高速共振排障: every selectable ground enemy on its x-6 takes atk_scale × ATK arts and 停顿 3 / 3.5 s, and the other traps on that x-6 go off 2 s later (no enemy needed), chaining on', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const tv = tokOf(tier, elite, 2, mod).skill;
    assert.deepEqual([tv.bb.atk_scale, tv.bb.sluggish, tv.bb.interval, tv.rangeId], [elite ? 2.8 : 2.5, elite ? 3.5 : 3, 2, 'x-6'], label(f));
    // A (9, 5) — B (9, 7) on A's x-6 — C (11, 7) on B's x-6, not on A's
    const { h, u } = field({ tier, elite, mod, skill: 2, pieces: [[9, 5], [9, 7], [11, 7]] });
    for (const t of alive(h)) if (t.uid == null) h.b.retreat(t, { reason: 'expired', permanent: true });
    const [A, B, C] = [piece(h, 2), piece(h, 3), piece(h, 4)];
    const e = h.spawn('enemy_dummy', { pos: [9, 5] });
    const side = h.spawn('enemy_dummy', { pos: [11, 5] });   // A's x-6 ([2, 0] … facing RIGHT: (11, 5))
    const off = h.spawn('enemy_dummy', { pos: [10, 6] });    // diagonal: not on A's x-6
    h.step();
    const t0 = h.b.time;
    assert.ok(!A.alive && B.alive && C.alive, `${label(f)}: A went off`);
    const hitsA = trapHits(h).filter((x) => x.source === A);
    assert.deepEqual(hitsA.map((x) => x.target).sort((p, q) => p.id - q.id), [e, side], `${label(f)}: A's x-6`);
    const dbl = A.mem.dorDouble ? 2 : 1;
    approx(hitsA[0].amount, u.base.atk * tv.bb.atk_scale * dbl, `${label(f)}: arts damage with her ATK before the stack (S3)`, 1e-6);
    assert.ok(hitsA.every((x) => x.type === 'arts'));
    approx(h.hooksOf('statusApplied').find((x) => x.target === e && x.status === 'sluggish').duration, tv.bb.sluggish, `${label(f)}: 停顿`);
    assert.ok(!off.findBuff('sluggish'));
    assert.ok(h.runUntil(() => !B.alive, 3), `${label(f)}: B goes off`);
    approx(h.b.time - t0, 2, `${label(f)}: 2 s later`, 0.05);
    assert.ok(h.runUntil(() => !C.alive, 3), `${label(f)}: C after B`);
    approx(h.b.time - t0, 4, `${label(f)}: 2 s after B`, 0.05);
    done(h);
  }
});

test('T2 梦想家: every trap that goes off gives her ATK +2 % (TRP-Y stage 3: 4 %), up to 12 stacks, until she leaves — with S1 / S2 before the trap\'s damage, with S3 after it', () => {
  for (const f of FORMS_ALL) {
    const [tier, elite, mod] = f;
    const t1 = talentOf(tier, elite, mod, 1);
    assert.deepEqual([t1.atk, t1.max_stack_cnt], [mod === Y && tier === 6 ? 0.04 : 0.02, 12], label(f));
    for (const skill of [0, 2]) {
      const { h, u } = field({ tier, elite, mod, skill, pieces: [[9, 6]] });
      for (const t of alive(h)) if (t.uid == null) h.b.retreat(t, { reason: 'expired', permanent: true });
      const t = piece(h, 2);
      const atk0 = u.s.atk;
      h.spawn('enemy_dummy', { pos: [9, 6] });
      h.step();
      const b = u.findBuff('talent:doroth:dream');
      assert.deepEqual([b?.stacks, b?.mods], [1, { atkPct: t1.atk }], `${label(f)} S${skill + 1}: one stack`);
      const hit = trapHits(h).find((x) => x.source === t);
      const scale = tokOf(tier, elite, skill, mod).skill.bb.atk_scale * (t.mem.dorDouble ? 2 : 1);
      const atkUsed = skill === 0 ? u.base.atk * (1 + t1.atk) : atk0;
      approx(hit.amount, atkUsed * scale, `${label(f)} S${skill + 1}: the ATK ${skill === 0 ? 'with' : 'before'} the new stack`, 1e-6);
      done(h);
    }
  }
  // twelve at most, gone when she leaves
  const { h, u } = field({ tier: 5, skill: 0, pieces: [[9, 6]] });
  const trap = piece(h, 2);
  for (let i = 0; i < 14; i++) {
    const e = h.spawn('enemy_dummy', { pos: [9, 6] });
    h.step();
    h.b.kill(e, null);
    trap.mem.dorFired = false;
    if (!trap.alive) h.b.redeploy(trap, { free: true });
  }
  assert.equal(u.findBuff('talent:doroth:dream').stacks, 12, 'twelve stacks at most');
  h.b.retreat(u);
  assert.equal(u.findBuff('talent:doroth:dream'), null, 'gone when she leaves');
  done(h);
});

test('a used-up piece comes back on its tile once the card is ready (5 s after the last trap deployment), a trap is in stock and its cost is paid — never on a ground enemy, past the limit or while she is off the field; her traps leave with her', () => {
  for (const f of [[5, false, null], [6, true, X]]) {
    const [tier, elite, mod] = f;
    const cost = tokOf(tier, elite, 0, mod).stats.cost;
    const { h, u } = field({ tier, elite, mod, skill: 0, pieces: [[9, 6], [9, 8]], dp: 0 });
    for (const t of alive(h)) if (t.uid == null) h.b.retreat(t, { reason: 'expired', permanent: true });
    const p = piece(h, 2);
    const e = h.spawn('enemy_dummy', { pos: [9, 6] });
    h.step();
    assert.ok(!p.alive && !p.removed, `${label(f)}: used up, still its tile's piece`);
    h.run(6);
    assert.ok(!p.alive, `${label(f)}: not on a ground enemy (and no DP)`);
    h.b.kill(e, null);
    h.run(2);
    assert.ok(!p.alive, `${label(f)}: no DP yet`);
    h.b.players[0].dp = 10;
    const stock = D(u).stock;
    h.run(0.3);
    assert.ok(p.alive && p.tileR === 9 && p.tileC === 6, `${label(f)}: back on its tile`);
    approx(h.b.players[0].dp, 10 - cost, `${label(f)}: paid ${cost} DP`);
    assert.equal(D(u).stock, stock - 1, `${label(f)}: one trap spent`);
    // the card's redeploy time: a second used-up piece waits 5 s from that deployment
    const q = piece(h, 3);
    const e2 = h.spawn('enemy_dummy', { pos: [9, 8] });
    h.step();
    h.b.kill(e2, null);
    const back = h.b.time;
    h.runUntil(() => q.alive, 10);
    assert.ok(h.b.time - back >= 5 - 0.35 - 1e-9 && q.alive, `${label(f)}: after the card's 5 s`);
    // her traps leave with her; the pieces come back after her redeploy
    h.b.retreat(u);
    assert.equal(alive(h).length, 0, `${label(f)}: her traps leave with her`);
    h.b.players[0].dp = 99;
    h.run(8);
    assert.equal(alive(h).filter((t) => t.uid != null).length, 0, `${label(f)}: not while she is off the field`);
    h.b.redeploy(u, { free: true });
    assert.equal(D(u).stock, 10, `${label(f)}: the stock refilled at her deployment`);
    h.runUntil(() => alive(h).filter((t) => t.uid != null).length === 2, 20);
    assert.equal(alive(h).filter((t) => t.uid != null).length, 2, `${label(f)}: both pieces back`);
    done(h);
  }
});

test('TRP-Y 童话书: each trap deployment has a 20 % chance to be a ×2 trap (the red "!"), the double applied to its damage; none without the module', () => {
  for (const f of [[5, true, Y], [6, true, Y], [6, true, X], [6, false, null]]) {
    const [tier, elite, mod] = f;
    const tb = modOf(tier, mod)?.traitOverride?.bb ?? {};
    const y = mod === Y;
    if (y) assert.deepEqual([tb.prob, tb.atk_scale], [0.2, 2], label(f));
    const { h, u } = field({ tier, elite, mod, skill: 0, seed: 11 });
    let n = 0, d = 0;
    for (let i = 0; i < 60; i++) {
      for (const t of alive(h)) { n++; if (t.mem.dorDouble) d++; }
      h.b.retreat(u);
      h.b.redeploy(u, { free: true });
    }
    if (y) assert.ok(d / n > 0.1 && d / n < 0.32, `${label(f)}: ${d} / ${n} doubles ≈ 20 %`);
    else assert.equal(d, 0, `${label(f)}: no double trap`);
    // a double trap's damage ×2
    if (y) {
      const t = alive(h).find((x) => x.mem.dorDouble) ?? alive(h)[0];
      const e = h.spawn('enemy_dummy', { pos: [t.tileR, t.tileC] });
      h.step();
      const hit = trapHits(h).find((x) => x.source === t && x.target === e);
      approx(hit.amount, u.base.atk * (1 + talentOf(tier, elite, mod, 1).atk) * tokOf(tier, elite, 0, mod).skill.bb.atk_scale * (t.mem.dorDouble ? 2 : 1), `${label(f)}: ×2`, 1e-6);
      assert.ok(h.eventsOf('fx').some((x) => x[1] === 'mark' && x[4]?.kind === 'doroth:double'));
    }
    done(h);
  }
});

test('TRP-X 梦中人: traps cost 2, limit / stock 13; stage 3: 3 traps at her deployment and, at every deployment of a placed piece, 50 % to summon one more in her range (no trap spent, inside the limit) — rolled again for each placed piece standing when her T2 stacks fill', () => {
  for (const tier of [5, 6]) {
    const hb = Object.assign({}, ...modOf(tier, X).talentChanges.filter((t) => t.talentIndex === -1).map((t) => t.bb));
    if (tier === 5) { assert.deepEqual(hb, {}, 'stage 1: no extra summon'); continue; }
    assert.deepEqual([hb.prob, hb.max_cnt], [0.5, 1]);
    // force the 50 % rolls to succeed: one extra per placed piece
    {
      const units = [[9, 6], [9, 8], [12, 6]];
      const h0 = makeBattle({ defs: { enemies: ENEMIES }, timeLimit: 300, autoFinish: false, seed: 5, flags: { dpPerSec: 0, dpMax: 999 },
        units: [{ uid: 1, diy: { slot: SLOT[6], charId: DOR, skillIndex: 0, uniEquipId: X }, elite: true, row: 10, col: 4 },
          ...units.map(([r, c], i) => ({ uid: 2 + i, kind: 'token', tokenId: TRAP, ownerUid: 1, row: r, col: c }))],
        setup(b) { const ch = b.rng.chance.bind(b.rng); b.rng.chance = (p) => (p === 0.5 ? true : ch(p)); } });
      h0.step();
      assert.equal(alive(h0).filter((t) => t.uid == null).length, 3 + 3, 'three at her deployment + one per placed piece');
      assert.ok(alive(h0).length <= 13);
      // her T2 full: every placed piece standing rolls again
      const u0 = h0.unit(1);
      const before = alive(h0).filter((t) => t.uid == null).length;
      for (let i = 0; i < 11; i++) h0.b.addBuff(u0, { key: 'talent:doroth:dream', refresh: 'stack', stacks: 1, maxStacks: 12, mods: { atkPct: 0.02 } });
      const spare = alive(h0).find((t) => t.uid == null);
      h0.spawn('enemy_dummy', { pos: [spare.tileR, spare.tileC] });
      h0.step();
      assert.equal(u0.findBuff('talent:doroth:dream').stacks, 12);
      const after = alive(h0).filter((t) => t.uid == null).length;
      assert.equal(after, Math.min(13 - 3, before - 1 + 3), 'one more per placed piece standing (inside the limit)');
      checkInvariants(h0.b);
      assert.equal(h0.b.errors.length, 0);
    }
    // the plain roll ≈ 50 % (summons only for placed pieces)
    let rolls = 0, extras = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { h } = field({ tier: 6, elite: true, mod: X, skill: 0, seed, pieces: [[9, 6], [9, 8], [12, 6], [12, 8]] });
      rolls += 4;
      extras += alive(h).filter((t) => t.uid == null).length - 3;
      done(h);
    }
    assert.ok(extras / rolls > 0.3 && extras / rolls < 0.7, `${extras} / ${rolls} ≈ 50 %`);
  }
});
