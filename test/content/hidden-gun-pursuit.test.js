// 隐秘核心铳's 【末日布道】 (PR #347 by @CXUtk): every 碎铳之簧 chases the casting gun for the gain's whole 5 s — PRTS 末日布道
// "令全场的“碎铳之簧”获得5秒增益：移动速度+800%，无敌，增益期间切换为追逐模式", “碎铳之簧” 追逐模式 "持续追踪令其进入该形态的场上的
// 假想敌：铳移动" (no arrival clause). Until 0.2.1 reaching the gun (or 1 tile from it) ended the chase. Each gun casts on its
// own data timer (initCooldown 20, cooldown 45 — no lock while a chase runs: the data has none, and the handbook's
// 「向自身」 means the later call takes the springs). The pair's stagger is the spawn times: the branch gun at 0.1 s,
// the leader at 10 s (official level_act1autochess_h08_02.json; §37.109 — until then both came at 10 s).
// §37.110: the call is the gun's own cast for the gain's 5 s — the attack's turn, no attack and no step meanwhile, the
// attack-speed stacks down to the one its spell on the springs adds, the attack cooldown restarted, its own cooldown from
// the cast's end (CN client enm_pfb_28.ab Skills/2, GameAssembly.dll; sources at bosses.js kitGun).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import * as enemies from '../../server/sim/content/enemies.js';
import * as bosses from '../../server/sim/content/bosses.js';

const W = JSON.parse(fs.readFileSync(new URL('../../data/waves.json', import.meta.url), 'utf8'));
const E = JSON.parse(fs.readFileSync(new URL('../../data/enemies.json', import.meta.url), 'utf8'));
const GUN = 'enemy_9017_achunt_2';
const SPRING = 'enemy_9020_actrpc';
const wall = chessRec({ id: 'pursuit_wall', profession: 'TANK', stats: { maxHp: 1e9, atk: 0, def: 1000, blockCnt: 3 }, rangeGrid: [[0, 0]], skill: null });

/** The real h08_02(_s) template (leader + parts only, or no spawns with `manual`), one non-attacking wall per side. */
function arena({ solo = false, manual = false, cooldown = null, extra = [] } = {}) {
  const tpl = structuredClone(W[solo ? 'act1autochess_h08_02_s' : 'act1autochess_h08_02']);
  tpl.spawns = manual ? [] : tpl.spawns.filter((s) => s.tag === 'boss' || s.tag === 'part');
  if (cooldown != null) {
    tpl.overrides[GUN] ??= { skills: structuredClone(E[GUN].skills) };
    const skill = tpl.overrides[GUN].skills.find((s) => s.prefabKey === '2');
    skill.initCooldown = 0;
    skill.cooldown = cooldown;
  }
  return makeBattle({
    kind: 'hidden', waveTemplate: tpl, content: 'generic', extraContent: [enemies, bosses], seed: 7,
    autoFinish: false, timeLimit: 300, recordEvents: false, hooks: [],
    defs: { chess: { pursuit_wall: wall } }, kits: { pursuit_wall: () => ({ trait: { noAttack: true } }) },
    sharedBoss: { hp: 1e12, maxHp: 1e12, damage(pid, n) { this.hp -= n; } },
    players: [
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, chessId: 'pursuit_wall', row: 3, col: 5, abs: true }, ...extra] },
      ...solo ? [] : [{ playerId: 'p2', seat: 1, side: 'R', colOffset: 8, units: [{ uid: 2, chessId: 'pursuit_wall', row: 3, col: 15, abs: true }] }],
    ],
    setup(b) { b.enemyOverrides = tpl.overrides; b.opts.waveTemplate = tpl; b.opts.bossMirror = !manual; },
  });
}

/** The guns of `h` make no normal attack: their calls never wait for one under way (the timing tests below). */
const noAttacks = (h) => h.b.on('enemySpawn', (c) => { if (c.enemy.defId === GUN) c.enemy.profile.noAttack = true; });
const DOG = E[GUN].skills.find((s) => s.prefabKey === '2').bb.dog_duration;

/** Every 【末日布道】 call (a new chase object on the spring): { time, gun }. */
function recordCalls(h) {
  const calls = [];
  let last = null;
  h.b.on('tick', () => {
    const d = h.enemies().find((e) => e.defId === SPRING)?.mem.ab.dash;
    if (!d || d === last) return;
    last = d;
    calls.push({ time: h.b.time, gun: d.gun });
  });
  return calls;
}

test('隐秘核心铳 pair: the branch gun starts with the battle, the leader after its preDelay; their calls alternate, so the springs chase to both halves', () => {
  const h = arena();
  noAttacks(h);
  const spawned = new Map();
  h.b.on('enemySpawn', (c) => { if (c.enemy.defId === GUN) spawned.set(c.enemy, { t: h.b.time }); });
  const calls = recordCalls(h);
  h.run(150);
  assert.equal(spawned.size, 2, 'the pair field has two guns (the mirrored one)');
  const tpl = W.act1autochess_h08_02;
  const leadAt = tpl.spawns.find((s) => s.tag === 'boss' && (s.key ?? s.enemyKey) === GUN).time;
  const branchAt = tpl.branches.boss_battle_multi_player[0].find((s) => (s.key ?? s.enemyKey) === GUN).time;
  assert.ok(branchAt < leadAt, 'official h08_02: the branch gun is timed before the leader');
  // official: MainGameInBossBattle._OnBossBattleStart moves to the branch when the battle starts (bosses.js branchAtStart)
  for (const [gun, { t }] of spawned) {
    const mirror = !!gun.mem.mirror; // set once spawnEnemy returns, after the enemySpawn event
    assert.ok(Math.abs(t - (mirror ? branchAt : leadAt)) < h.TICK * 2, `${mirror ? 'branch' : 'leader'} gun at ${mirror ? branchAt : leadAt} s, got ${t}`);
  }
  const skill = tpl.overrides[GUN].skills.find((s) => s.prefabKey === '2');
  for (const [gun, { t: t0 }] of spawned) {
    const own = calls.filter((c) => c.gun === gun).map((c) => c.time);
    assert.equal(own.length, 3, 'three calls each in 150 s');
    assert.ok(Math.abs(own[0] - t0 - skill.initCooldown) < h.TICK * 2, `first call ${skill.initCooldown} s after its spawn`);
    for (let i = 1; i < own.length; i++) assert.ok(Math.abs(own[i] - own[i - 1] - skill.cooldown - DOG) < h.TICK * 2, `then every ${skill.cooldown} s, from the end of the ${DOG} s cast`);
  }
  // the calls alternate between the two guns, the leader's one (preDelay − branch time) after the branch gun's: the
  // springs go to each gun in turn, not always to the one that calls a tick later
  assert.equal(calls.length, 6);
  for (let i = 1; i < calls.length; i++) assert.notEqual(calls[i].gun, calls[i - 1].gun, 'the guns take turns');
  for (let i = 1; i < calls.length; i += 2) assert.ok(Math.abs(calls[i].time - calls[i - 1].time - (leadAt - branchAt)) < h.TICK * 3, 'staggered by the preDelay');
  assert.equal(h.b.errorCount, 0);
  checkInvariants(h.b);
});

test('隐秘核心铳: reaching a moving gun keeps pursuit, invulnerability and disarm for the full 5 s', () => {
  const h = arena({ solo: true, manual: true, cooldown: 45 });
  h.step();
  const gun = h.spawn(GUN, { pos: [3, 5], tag: 'boss', mods: { speedMul: 0 } });
  const spring = h.spawn(SPRING, { pos: [3, 4.8], tag: 'part' });
  h.step(2);
  const d = spring.mem.ab.dash;
  assert.ok(d, 'arriving next to the gun does not end the chase');
  h.run(1);
  gun.x = 6;
  const oldX = spring.x;
  h.run(1);
  assert.ok(spring.x > oldX, 'it keeps following the gun when the gun moves');
  assert.equal(spring.mem.ab.dash, d);
  assert.ok(spring.s.flags.invulnerable && spring.s.flags.disarm);
  h.run(d.until - h.b.time - h.TICK * 2);
  assert.equal(spring.mem.ab.dash, d, 'still chasing just before the 5 s are over');
  assert.ok(spring.s.flags.invulnerable && spring.s.flags.disarm);
  h.run(h.TICK * 4);
  assert.equal(spring.mem.ab.dash, null, 'over once the gain ends');
  assert.ok(!spring.s.flags.invulnerable && !spring.s.flags.disarm);
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: the other gun\'s call during a chase retargets every spring to that gun for a new 5 s', () => {
  const h = arena({ manual: true, cooldown: 45 });
  noAttacks(h);
  h.step();
  const left = h.spawn(GUN, { pos: [3, 5], tag: 'boss', mods: { speedMul: 0 } });
  const right = h.spawn(GUN, { pos: [3, 15], tag: 'boss', mods: { speedMul: 0 } });
  const call = right.mem.ab.list.find((a) => a.cd === 45 && a.fire);
  call.left = 999;   // the right gun's call is not ready yet
  const spring = h.spawn(SPRING, { pos: [3, 10], tag: 'part' });
  h.step(2);
  const first = spring.mem.ab.dash;
  assert.ok(first && first.gun === left, 'the first call takes the spring to the left gun');
  h.run(1);
  assert.equal(spring.mem.ab.dash, first, 'chasing the left gun');
  call.left = 0;     // the right gun's call comes ready mid-chase
  h.step(2);
  const second = spring.mem.ab.dash;
  assert.ok(second && second !== first && second.gun === right, 'the later call takes the spring at once');
  assert.ok(Math.abs(second.until - h.b.time - 5) < h.TICK * 3, 'for a new 5 s');
  const oldX = spring.x;
  h.run(1);
  assert.ok(spring.x > oldX, 'it now runs to the right gun');
  assert.ok(spring.s.flags.invulnerable && spring.s.flags.disarm);
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: with no gun left on the field the spring holds still, invulnerable and disarmed, until the gain ends', () => {
  const h = arena({ solo: true, manual: true, cooldown: 45 });
  h.step();
  const gun = h.spawn(GUN, { pos: [3, 5], tag: 'boss', mods: { speedMul: 0 } });
  const spring = h.spawn(SPRING, { pos: [3, 1], tag: 'part' });
  h.step(2);
  const d = spring.mem.ab.dash;
  assert.ok(d, 'chasing');
  h.b.kill(gun, null);
  h.step();
  const at = [spring.x, spring.y];
  h.run(1);
  assert.deepEqual([spring.x, spring.y], at, 'no gun to follow: it stands');
  assert.equal(spring.mem.ab.dash, d, 'the chase is not over');
  assert.ok(spring.s.flags.invulnerable && spring.s.flags.disarm);
  h.run(d.until - h.b.time + h.TICK * 2);
  assert.equal(spring.mem.ab.dash, null);
  assert.ok(!spring.s.flags.invulnerable);
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: solo keeps the template initial cooldown and repeated call timing', () => {
  const h = arena({ solo: true });
  noAttacks(h);
  const calls = recordCalls(h);
  h.run(100);
  assert.equal(calls.length, 2);
  const tpl = W.act1autochess_h08_02_s;
  const spawnTime = tpl.spawns.find((s) => s.tag === 'boss').time;
  const skill = (tpl.overrides[GUN]?.skills ?? E[GUN].skills).find((s) => s.prefabKey === '2');
  assert.ok(Math.abs(calls[0].time - spawnTime - skill.initCooldown) < h.TICK * 2);
  assert.ok(Math.abs(calls[1].time - calls[0].time - skill.cooldown - DOG) < h.TICK * 2);
  assert.equal(h.b.errorCount, 0);
});

/** The solo gun on its real route, a wall in its reach, its charge off; stops on the tick of its first call. */
function toFirstCall(extra = [{ uid: 2, chessId: 'pursuit_wall', row: 4, col: 8, abs: true }]) {
  const h = arena({ solo: true, extra });
  let gun = null;
  h.b.on('enemySpawn', (c) => { if (c.enemy.defId === GUN) gun = c.enemy; });
  h.runUntil(() => gun && gun.mem.ab, 12);
  gun.mem.ab.list.find((a) => a && a.cd === E[GUN].skills.find((s) => s.prefabKey === '1').cooldown).left = Infinity;
  const spring = h.enemies().find((e) => e.defId === SPRING);
  const at = [];
  h.b.on('tick', () => { at.push({ t: h.b.time, x: gun.x, y: gun.y, n: gun.stats.attacks, aspd: gun.s.aspd, calling: !!gun.findBuff('ab:channel') }); });
  assert.ok(h.runUntil(() => spring.mem.ab.dash, 60), 'the first call');
  return { h, gun, spring, at };
}

test('隐秘核心铳: the call takes the attack\'s turn — it waits for the swing under way, then the gun neither attacks nor walks for the 5 s cast', () => {
  const { h, gun, at } = toFirstCall();
  const s2 = E[GUN].skills.find((s) => s.prefabKey === '2');
  const before = at.filter((p) => !p.calling);
  // standing shot after shot on one target: at 420 ASPD the interval (1.07 s) is shorter than its attack clip
  assert.equal(gun.mem.ab.list.some((a) => a && a.cd === s2.cooldown && a.casts === 1), true);
  assert.equal(before.at(-2).aspd, 20 + 5 * E[GUN].talents.bb['2.attack_speed'], 'at its top attack speed when the call came due');
  assert.ok(Math.abs(before.at(-1).x - before.at(-60).x) < 1e-9 && Math.abs(before.at(-1).y - before.at(-60).y) < 1e-9, 'stalled on its target');
  const n = gun.stats.attacks, x = gun.x, y = gun.y, t0 = h.b.time;
  assert.equal(gun.swing, false, 'between two attacks');
  assert.equal(gun.form, 'call', 'the model plays its Skill_2 clips (units.js FORMS)');
  h.run(DOG - h.TICK * 2);
  assert.equal(gun.stats.attacks, n, 'no attack during the cast');
  assert.deepEqual([gun.x, gun.y], [x, y], 'no step during the cast');
  assert.ok(gun.findBuff('ab:channel'));
  h.run(h.TICK * 4);
  assert.ok(!gun.findBuff('ab:channel'), `over after ${DOG} s (from ${t0})`);
  assert.equal(gun.form, null);
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: the call clears the attack-speed stacks (its spell hits the springs: one stack left), restarts the attack cooldown, and the gun walks on between its next shots', () => {
  const { h, gun } = toFirstCall();
  const step = E[GUN].talents.bb['2.attack_speed'];
  assert.equal(gun.s.aspd, 20 + step, 'one stack: 100, not 420');
  assert.ok(Math.abs(gun.s.interval - 4.5) < 1e-9);
  h.run(DOG);
  const n = gun.stats.attacks, x = gun.x, y = gun.y;
  assert.ok(h.runUntil(() => gun.stats.attacks === n + 1, 3), 'the cooldown ran out during the cast (4.5 s < 5 s): it shoots at once');
  assert.equal(gun.s.aspd, 20 + step, 'another target than the spring: cleared again, then one stack');
  const t1 = h.b.time;
  assert.ok(h.runUntil(() => gun.stats.attacks === n + 2, 10));
  assert.ok(Math.abs(h.b.time - t1 - 4.5) < h.TICK * 2, 'a 4.5 s interval, not 1.07 s');
  assert.ok(Math.hypot(gun.x - x, gun.y - y) > 0.3, 'it walked on between them');
  assert.equal(gun.s.aspd, 20 + 2 * step, 'and ramps anew');
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: after the call it takes a new target when a higher-DEF operator came into reach', () => {
  const { h, gun } = toFirstCall();
  assert.equal(h.allies().filter((u) => u.stats.taken > 0).length, 1, 'one target so far');
  // walk the gun's other wall into reach: the next shot is at the highest DEF in range
  const other = h.allies().find((u) => u.stats.taken === 0);
  other.base.def += 500; other.markDirty?.();
  other.x = other.tileC = Math.round(gun.x); other.y = other.tileR = Math.round(gun.y) + 1;
  const n = gun.stats.attacks;
  h.runUntil(() => gun.stats.attacks === n + 1, DOG + 3);
  assert.ok(h.runUntil(() => other.stats.taken > 0, 3), 'the new target was shot');
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: no charge starts during the call; a call during a charge holds it and leaves the attack cooldown alone', () => {
  const h = arena({ solo: true, manual: true, cooldown: 45 });
  h.step();
  const gun = h.spawn(GUN, { pos: [3, 8], tag: 'boss' });
  gun.profile.noAttack = true;
  h.spawn(SPRING, { pos: [3, 12], tag: 'part' });
  const charge = gun.mem.ab.list.find((a) => a && a.cd === 30), call = gun.mem.ab.list.find((a) => a && a.cd === 45 && a.fire);
  charge.left = 0.5;
  h.step(2);
  assert.ok(gun.findBuff('ab:channel'));
  h.run(DOG - 0.2);
  assert.ok(!gun.findBuff('boss:charge'), 'the charge waits for the cast');
  h.run(0.4);
  assert.ok(gun.findBuff('boss:charge'), 'then it starts');
  gun.atkCd = 3;
  call.left = 0;
  h.step();
  assert.ok(gun.findBuff('ab:channel'));
  assert.ok(gun.atkCd <= 3, 'the charge\'s mode has its own (empty) main attack');
  const x = gun.x;
  h.run(1);
  assert.equal(gun.x, x, 'it stands while it calls');
  assert.equal(h.b.errorCount, 0);
});
