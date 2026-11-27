// test/content/standin_acspec.test.js — the 补位 stand-in Misery (char_615_acspec, 6★ 特种·处决者; kit
// server/sim/content/kits/ops/standin-acspec.js) on every chess she replaces: 缄默德克萨斯 (tier 4, S2), 山 (tier 5, S3 +
// EXE-X), 新约能天使 / 锏 (tier 6, S3 + EXE-X), normal (E2 Lv1, skill 4) and elite (E2 Lv60, skill 7). Her three skills
// are ON_DEPLOY passives: they start at every deployment — at the battle start no enemy is on the field yet, so S3 hits
// nothing there and matters on a redeploy (再部署时间大幅度减少: 18 s). S1 / S2 last 10 s: since 0.2.0 they are duration skills
// started by every deployment (activateOnDeploy — PR #109's deploy-timed contract, their own skillStart / skillEnd), no
// longer a passive holding a 10 s buff. Numbers are read back from data/backups.json.
// Run: node --test test/content/standin_acspec.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { unitForm } from '../../shared/standIn.js';
import { PULL_STOP_RADIUS, TICK } from '../../server/sim/constants.js';

const load = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const CHESS = load('chess');
const BACKUPS = load('backups');
const CHAR = 'char_615_acspec';
const UNIT = BACKUPS.units[CHAR];
const formOf = (id) => unitForm(BACKUPS, CHAR, CHESS[id].status);
const approx = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${msg}: ${a} vs ${b}`);
const dummy = (key, o = {}) => enemyRec({ key, hp: 1e9, speed: 0, mass: 0, ...o });
const ENEMIES = { enemy_dummy: dummy('enemy_dummy'), enemy_fly: dummy('enemy_fly', { motion: 'FLY' }) };
const ALLY = 'chess_char_1_02_a'; // 角峰, a melee blocker

function battle(units, o = {}) {
  return makeBattle({
    defs: { enemies: ENEMIES }, units, timeLimit: o.timeLimit ?? 400, autoFinish: false, seed: o.seed ?? 5,
    flags: { dpPerSec: 0 }, hooks: ['damaged', 'deploy', 'death', 'skillStart', 'skillEnd'], captureNoisy: true,
  });
}
const MISERY = (id, standIn = true) => ({ chessId: id, row: 10, col: 4, standIn });
const atkHits = (h, u) => h.hooksOf('damaged').filter((c) => c.source === u && c.dmg?.isAttack);
const tagged = (h, u, tag) => h.hooksOf('damaged').filter((c) => c.source === u && (c.dmg?.tags || []).includes(tag));
const talentBb = (u, i) => u.def.raw.talents.find((t) => t.index === i)?.bb ?? {};
function done(h) {
  checkInvariants(h.b);
  assert.equal(h.b.errors.length, 0, JSON.stringify(h.b.errors[0]));
}

test('Misery on every chess she replaces (normal + elite): her body (再部署 18 s), the backup skill (S2 a deploy-timed duration skill, S3 a passive), this kit; EXE-X on the tier-5 / 6 elites only', () => {
  const ids = UNIT.standsIn.flatMap((a) => [a, a.replace(/_a$/, '_b')]);
  assert.equal(ids.length, 8);
  const withModule = [];
  for (const id of ids) {
    const c = CHESS[id], form = formOf(id);
    const h = battle([MISERY(id)]);
    h.step();
    const u = h.unit(1);
    const sk = form.skills.find((s) => s.index === c.backup.skillIndex);
    const kind = sk.skillId === 'skchr_acspec_3' ? 'passive' : 'duration';
    assert.deepEqual([u.def.charId, u.def.standInFor, u.skill.id, u.skill.kind, !!u.kit.generic, u.kit.skillSource], [CHAR, c.charId, sk.skillId, kind, false, 'skills'], id);
    assert.deepEqual([sk.skillType, sk.spType], ['PASSIVE', 'ON_DEPLOY'], id);
    const mod = c.backup.uniEquipId && c.status.equipLevel > 0 ? form.modules.find((m) => m.uniEquipId === c.backup.uniEquipId) : null;
    assert.equal(!!u.def.raw.module?.active, !!mod, `${id}: module`);
    if (mod) withModule.push(`${id} L${mod.level}`);
    assert.equal(u.base.atk, form.stats.atk + (mod?.attr.atk ?? 0), `${id}: ATK`);
    assert.equal(u.base.def, form.stats.def + (mod?.attr.def ?? 0), `${id}: DEF`);
    assert.equal(u.base.respawnTime, 18, `${id}: 再部署时间大幅度减少`);
    assert.deepEqual([u.profile.attack, u.profile.canHitFly, u.s.blockCnt], ['melee', false, 1], `${id}: melee, ground only, blocks 1`);
    assert.ok(!u.s.flags.liftoff && !u.s.flags.camou && !u.s.flags.stealth, `${id}: ground enemies can target her`);
    done(h);
  }
  assert.deepEqual(withModule, ['chess_char_5_17_b L1', 'chess_char_6_13_b L3', 'chess_char_6_19_b L3']);
  assert.deepEqual(ids.map((id) => CHESS[id].backup.skillIndex), [1, 1, 2, 2, 2, 2, 2, 2]);
});

test('Misery 二象命末: each attack is a double hit with attack@prob (10 %; EXE-X level 3: 15 % and ATK +5 %)', () => {
  for (const [id, prob, atk] of [['chess_char_5_17_a', 0.1, 0], ['chess_char_5_17_b', 0.1, 0], ['chess_char_6_19_b', 0.15, 0.05]]) {
    const h = battle([MISERY(id)]);
    h.step();
    const u = h.unit(1);
    const seen = [];
    assert.equal(u.profile.hitsFn({ rng: { chance: (p) => { seen.push(p); return true; } } }, u), 2);
    assert.equal(u.profile.hitsFn({ rng: { chance: (p) => { seen.push(p); return false; } } }, u), 1);
    assert.deepEqual(seen, [prob, prob], `${id}: one draw per attack at ${prob}`);
    assert.equal(u.findBuff('acspec:t1')?.mods.atkPct, atk || undefined, `${id}: talent ATK`);
    h.spawn('enemy_dummy', { pos: [10, 4] });
    h.run(300);
    const per = new Map();
    for (const c of atkHits(h, u)) per.set(c.dmg.attackId, (per.get(c.dmg.attackId) ?? 0) + 1);
    const counts = [...per.values()], doubles = counts.filter((n) => n === 2).length;
    assert.ok(counts.length > 250 && counts.every((n) => n === 1 || n === 2), `${id}: ${counts.length} attacks of one or two hits`);
    assert.ok(Math.abs(doubles / counts.length - prob) < 0.06, `${id}: ${doubles} / ${counts.length} doubles ≈ ${prob}`);
    done(h);
  }
});

test('Misery 四维分离: ATK +10 % while exactly one enemy stands on her tile or the four beside it (a diagonal one does not count; an air unit does)', () => {
  const h = battle([MISERY('chess_char_5_17_a')]);
  h.step();
  const u = h.unit(1);
  const t1 = talentBb(u, 1);
  assert.deepEqual([t1.atk, t1.cnt], [0.1, 1]);
  const on = () => !!u.findBuff('acspec:t2');
  const check = (want, msg) => {
    h.step();
    assert.equal(on(), want, msg);
    approx(u.s.atk, u.base.atk * (1 + (want ? t1.atk : 0)), `${msg}: ATK`);
  };
  check(false, 'no enemy');
  h.spawn('enemy_dummy', { pos: [10, 5] });
  check(true, 'one in front');
  h.spawn('enemy_dummy', { pos: [11, 5] });
  check(true, 'plus a diagonal one');
  const f = h.spawn('enemy_fly', { pos: [9, 4], route: 2 });
  check(false, 'plus an air unit above her: two');
  h.b.kill(f);
  check(true, 'the air unit gone');
  h.spawn('enemy_dummy', { pos: [10, 4] });
  check(false, 'plus one on her tile: two');
  done(h);
});

test('Misery EXE-X (山 精锐): ATK +10 % while no ally stands on the four tiles beside her (diagonal allies do not count); module \'none\' and the normal chess: never', () => {
  const run = (standIn, allyAt, id = 'chess_char_5_17_b') => {
    const units = [MISERY(id, standIn)];
    if (allyAt) units.push({ chessId: ALLY, row: allyAt[0], col: allyAt[1] });
    const h = battle(units);
    h.run(0.5);
    const u = h.unit(1);
    const on = !!u.findBuff('acspec:module');
    approx(u.s.atk, u.base.atk * (1 + (on ? 0.1 : 0)), `${id} ${allyAt}: ATK`);
    done(h);
    return on;
  };
  assert.equal(run(true, null), true, 'alone');
  assert.equal(run(true, [10, 5]), false, 'an ally in front');
  assert.equal(run(true, [11, 4]), false, 'an ally below');
  assert.equal(run(true, [11, 5]), true, 'an ally on a diagonal');
  assert.equal(run({ moduleId: 'none' }, null), false, 'module none');
  assert.equal(run(true, null, 'chess_char_5_17_a'), false, 'normal chess');
});

test('Misery S1 物理的服从 (no chess names it — a 自选 slot may): for 10 s from every deployment, physical dodge 45 % / 60 % and the talent-1 chance 25 %', () => {
  for (const id of ['chess_char_4_16_a', 'chess_char_4_16_b']) {
    const sk = formOf(id).skills[0], bb = sk.bb;
    const h = battle([MISERY(id, { skillIndex: 0 })]);
    h.step();
    const u = h.unit(1);
    assert.deepEqual([u.skill.id, u.skill.kind, u.skill.duration, sk.duration], ['skchr_acspec_1', 'duration', 10, 10]);
    const prob = () => { let p = null; u.profile.hitsFn({ rng: { chance: (x) => { p = x; return false; } } }, u); return p; };
    const on = () => { approx(u.s.dodgePhys, bb.prob, `${id}: dodge ${bb.prob}`); assert.equal(prob(), bb['attack@prob'], `${id}: chance ${bb['attack@prob']}`); };
    const off = () => { assert.equal(u.s.dodgePhys, 0, `${id}: no dodge`); assert.equal(prob(), talentBb(u, 0)['attack@prob'], `${id}: the talent's chance`); };
    on();
    h.run(9.8);
    on();
    h.run(0.3);
    off();
    h.b.retreat(u);
    assert.ok(h.b.redeploy(u));
    h.step();
    on();
    h.run(10.1);
    off();
    done(h);
  }
});

test('Misery S2 战争的恭顺 (缄默德克萨斯): for 10 s from every deployment ATK +30 % / +45 % and ASPD +15', () => {
  for (const id of ['chess_char_4_16_a', 'chess_char_4_16_b']) {
    const sk = formOf(id).skills[1], bb = sk.bb;
    const h = battle([MISERY(id)]);
    h.step();
    const u = h.unit(1);
    assert.deepEqual([u.skill.id, u.skill.kind, u.skill.duration, sk.duration], ['skchr_acspec_2', 'duration', 10, 10]);
    // the deploy-timed contract (PR #109): the skill runs — skillStart now, skillEnd 10 s later — and then is off
    const on = () => { approx(u.s.atk, u.base.atk * (1 + bb.atk), `${id}: ATK +${bb.atk}`); assert.equal(u.s.aspd, 100 + bb.attack_speed, `${id}: ASPD`); assert.ok(u.skill.active, `${id}: running`); };
    const off = () => { approx(u.s.atk, u.base.atk, `${id}: ATK back`); assert.equal(u.s.aspd, 100, `${id}: ASPD back`); assert.ok(!u.skill.active, `${id}: over`); };
    const starts = () => h.hooksOf('skillStart').filter((c) => c.unit === u).length;
    const ends = () => h.hooksOf('skillEnd').filter((c) => c.unit === u).length;
    assert.deepEqual([starts(), ends()], [1, 0], `${id}: started by the deployment`);
    on();
    h.run(9.8);
    on();
    h.run(0.3);
    off();
    h.b.retreat(u);
    assert.ok(h.b.redeploy(u));
    h.step();
    on();
    h.run(10.1);
    off();
    assert.deepEqual([starts(), ends()], [2, 2], `${id}: one window per deployment (the retreat ends none — it had ended)`);
    done(h);
  }
});

test('Misery S3 空间的归依 (山 / 锏): nothing at the battle start; knocked out, back after 18 s: 210 % / 240 % ATK to the ground enemies around her, then those nobody blocks dragged to her front with 2.5 s 停顿', () => {
  for (const id of ['chess_char_5_17_a', 'chess_char_6_19_b']) {
    const sk = formOf(id).skills[2], bb = sk.bb;
    assert.deepEqual([sk.rangeId, bb.force, bb.sluggish], ['x-4', 0, 2.5]);
    const h = battle([MISERY(id), { chessId: ALLY, row: 11, col: 4 }]);
    h.step();
    const u = h.unit(1);
    assert.equal(tagged(h, u, 'acspec:burst').length, 0, `${id}: the battle-start deployment meets no enemy`);
    const at = (pos, key = 'enemy_dummy') => h.spawn(key, { pos, ...(key === 'enemy_fly' ? { route: 2 } : {}) });
    const diag = at([11, 5]), above = at([9, 4]), held = at([11, 4]), far = at([10, 6]), fly = at([9, 3], 'enemy_fly');
    h.step();
    assert.equal(held.blockedBy?.defId, ALLY, `${id}: one enemy held by the operator below her`);
    const start = new Map([diag, above, held, far, fly].map((e) => [e, [e.x, e.y]]));
    h.b.players[0].dp = 99;
    h.b.kill(u);
    const tk = h.b.time;
    assert.ok(h.runUntil(() => u.alive && u.deployed, 30), `${id}: redeployed`);
    assert.ok(h.b.time - tk >= 18 - 1e-9 && h.b.time - tk <= 18 + 2 * TICK, `${id}: back after 18 s (${h.b.time - tk})`);
    // the burst: three ground enemies around her (the held one included); no air unit, nothing two tiles away
    const burst = tagged(h, u, 'acspec:burst');
    assert.deepEqual(new Set(burst.map((c) => c.target)), new Set([diag, above, held]), `${id}: the enemies around her`);
    const atk = u.base.atk * (1 + (talentBb(u, 0).atk ?? 0)); // not alone (the operator below), two enemies beside her
    for (const c of burst) { approx(c.amount, atk * bb.atk_scale, `${id}: ${bb.atk_scale * 100} % ATK`); assert.equal(c.type, 'phys'); assert.ok(c.dmg.isSkill); }
    // the drag and the 停顿 ride a 0-damage hit on the ones nobody blocks
    assert.deepEqual(new Set(tagged(h, u, 'acspec:pull').map((c) => c.target)), new Set([diag, above]));
    for (const e of [diag, above]) {
      // where the drag's slide ends (battle/displacement.js; GitHub #60)
      const end = e.shift ? h.b._shiftPredict(e, e.shift) : e;
      approx(Math.hypot(end.x - u.x, end.y - u.y), PULL_STOP_RADIUS, `${id}: dragged to her front (weight 0, 小力)`, 1e-3);
      assert.ok(Math.hypot(end.x - start.get(e)[0], end.y - start.get(e)[1]) > 0.2, `${id}: it moved`);
      const s = e.findBuff('sluggish');
      assert.ok(s && s.timeLeft > bb.sluggish - 0.1 && s.timeLeft <= bb.sluggish + 1e-9, `${id}: 停顿 ${bb.sluggish} s`);
    }
    for (const e of [held, far, fly]) {
      assert.deepEqual([e.x, e.y], start.get(e), `${id}: ${e.defId} stays`);
      assert.equal(e.findBuff('sluggish'), null, `${id}: ${e.defId} no 停顿`);
    }
    done(h);
  }
});
