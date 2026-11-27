// 隐秘核心铳's 【末日布道】 (PR #347 by @CXUtk): every 碎铳之簧 chases the casting gun for the gain's whole 5 s — PRTS 末日布道
// "令全场的“碎铳之簧”获得5秒增益：移动速度+800%，无敌，增益期间切换为追逐模式", “碎铳之簧” 追逐模式 "持续追踪令其进入该形态的场上的
// 假想敌：铳移动" (no arrival clause). Until 0.2.1 reaching the gun (or 1 tile from it) ended the chase. Each gun casts on its
// own data timer (initCooldown 20, cooldown 45 — no lock while a chase runs: the data has none, and the handbook's
// 「向自身」 means the later call takes the springs). The pair's stagger is the spawn times: the branch gun at 0.1 s,
// the leader at 10 s (official level_act1autochess_h08_02.json; §37.109 — until then both came at 10 s).
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
    for (let i = 1; i < own.length; i++) assert.ok(Math.abs(own[i] - own[i - 1] - skill.cooldown - skill.bb.dog_duration) < h.TICK * 2, `then ${skill.cooldown} s after the cast ended`);
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
  const calls = recordCalls(h);
  h.run(100);
  assert.equal(calls.length, 2);
  const tpl = W.act1autochess_h08_02_s;
  const spawnTime = tpl.spawns.find((s) => s.tag === 'boss').time;
  const skill = (tpl.overrides[GUN]?.skills ?? E[GUN].skills).find((s) => s.prefabKey === '2');
  assert.ok(Math.abs(calls[0].time - spawnTime - skill.initCooldown) < h.TICK * 2);
  // the cooldown counts from the end of the 5 s cast (EnemySkill._OnCastFinish, §37.110)
  assert.ok(Math.abs(calls[1].time - calls[0].time - skill.cooldown - skill.bb.dog_duration) < h.TICK * 2);
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: the call is its own 5 s cast — no attack, no step, the stacks drop to one, then it shoots and walks on', () => {
  const h = arena({ solo: true });
  let gun = null;
  h.b.on('enemySpawn', (c) => { if (c.enemy.defId === GUN) gun = c.enemy; });
  const calls = recordCalls(h);
  h.runUntil(() => calls.length > 0, 60);
  assert.equal(calls.length, 1);
  const dur = E[GUN].skills.find((s) => s.prefabKey === '2').bb.dog_duration;
  assert.equal(dur, 5);
  assert.ok(gun.findBuff('ab:channel'), 'casting');
  assert.equal(gun.form, 'call');
  assert.equal(gun.s.aspd, 100, 'the stacks are down to one (base 20 + 80)');
  const x = gun.x, y = gun.y, shots = gun.stats.attacks;
  h.run(dur - 0.2);
  assert.equal(gun.stats.attacks, shots, 'no shot during the cast');
  assert.ok(gun.x === x && gun.y === y, 'no step during the cast');
  assert.equal(gun.s.aspd, 100);
  h.run(0.4);
  assert.ok(!gun.findBuff('ab:channel') && gun.form == null, 'the cast is over');
  h.run(12);
  assert.ok(gun.stats.attacks > shots, 'it shoots again after the call');
  assert.ok(Math.hypot(gun.x - x, gun.y - y) > 0, 'and it walks on between its shots');
  assert.equal(h.b.errorCount, 0);
});

// §37.111: what the client code and prefabs settle about the attack timer, the opening cast and the beams
const BAT = E[GUN].stats.bat, HIT = E[GUN].attackAnim.hit, STEP = E[GUN].talents.bb['2.attack_speed'];
const ivAt = (a) => BAT * 100 / a;
const skillOf = (g, key) => g.mem.ab.list.find((a) => a && a.fire && a.cd === E[GUN].skills.find((s) => s.prefabKey === key).cooldown);

test('隐秘核心铳: 【盲信之誓】\'s opening cast restarts the attack timer: the first shot comes a whole period after it, not at once', () => {
  const h = arena({ solo: true, manual: true, extra: [{ uid: 2, chessId: 'pursuit_wall', row: 4, col: 8, abs: true }] });
  h.step();
  const spring = h.spawn(SPRING, { pos: [4, 10], tag: 'part', routeIndex: 1, mods: { speedMul: 0 } });
  const gun = h.spawn(GUN, { pos: [4, 10], tag: 'boss', routeIndex: 0, mods: { speedMul: 0 } });
  for (const k of ['1', '2']) skillOf(gun, k).left = Infinity;
  for (const s of h.enemies()) if (s === spring) { s.x = gun.x; s.y = gun.y; }          // the beam meets nobody
  const t0 = h.b.time;
  assert.ok(h.runUntil(() => gun.stats.attacks > 0, 60), 'it shoots');
  const first = h.b.time - t0;
  // the cast comes 0.03 s after it appears and the timer waits a full period at the start's ASPD 20 (22.5 s); the strike comes
  // the clip's hit frame later. Not known from any file: the observed second of the first shot.
  const period = ivAt(20);
  assert.ok(first > period - 1, `first strike ${first} s after the spring's appearance`);
  assert.ok(first < period + 0.03 + HIT + 0.5, `and not later than the period + the hit frame: ${first}`);
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: an operator that enters a 盲信之誓 beam counts as a hit for the attack-speed stacks, each time it enters; linking to the spring is none', () => {
  const h = arena({ solo: true, manual: true });
  h.step();
  const gun = h.spawn(GUN, { pos: [3, 8], tag: 'boss', mods: { speedMul: 0 } });
  const spring = h.spawn(SPRING, { pos: [5, 12], tag: 'part', mods: { speedMul: 0 } });
  for (const o of [gun, spring]) o.profile.noAttack = true;
  for (const k of ['1', '2']) skillOf(gun, k).left = Infinity;
  const other = h.allies()[0];
  h.run(1);
  assert.equal(gun.s.aspd, 20, 'the beam is linked, nobody in it: linking to the spring itself is no hit');
  other.x = 10; other.y = 4;
  h.step(2);
  assert.equal(gun.s.aspd, 20 + STEP, 'it entered');
  h.run(2);
  assert.equal(gun.s.aspd, 20 + STEP, 'standing in it adds nothing');
  other.y = 8; h.step(2);
  other.y = 4; h.step(2);
  assert.equal(gun.s.aspd, 20 + 2 * STEP, 'entered again: the same operator, one more');
  assert.equal(h.b.errorCount, 0);
});

test('铳: a hit that raises the attack speed rescales the cooldown it keeps (progress kept); the stack counts as the shot lands', () => {
  const h = arena({ solo: true, manual: true, extra: [{ uid: 2, chessId: 'pursuit_wall', row: 4, col: 8, abs: true }] });
  h.step();
  const spring = h.spawn(SPRING, { pos: [4, 10], tag: 'part', routeIndex: 1, mods: { speedMul: 0 } });
  const gun = h.spawn(GUN, { pos: [4, 10], tag: 'boss', routeIndex: 0, mods: { speedMul: 0 } });   // 2 tiles from the wall: in reach, no walking
  for (const k of ['1', '2']) skillOf(gun, k).left = Infinity;
  h.b.on('tick', () => { spring.x = gun.x; spring.y = gun.y; });                         // the beam meets nobody
  const strikes = [];
  h.b.on('attack', (c) => { if (c.attacker === gun) strikes.push({ t: h.b.time, aspd: gun.s.aspd, d: Math.hypot(c.targets[0].x - gun.x, c.targets[0].y - gun.y) }); });
  h.run(60);
  assert.ok(strikes.length > 5);
  assert.ok(strikes[0].d > 0.75, 'the target is far enough for a flight');
  for (let i = 0; i + 1 < 5; i++) {
    const a = strikes[i], b = strikes[i + 1];
    // a shot lands after its hit frame and its flight (speed 10 [src: projectile_enemy_achunt `_speed`]); that raises the attack speed one
    // stack, and what is left of the cooldown is rescaled to the new period with the progress kept (ResetButKeepProgress)
    const hitAt = HIT + a.d / 10;
    const expected = hitAt + (1 - hitAt / ivAt(a.aspd)) * ivAt(a.aspd + STEP);
    assert.equal(b.aspd, a.aspd + STEP, `strike ${i + 1} is one stack faster`);
    assert.ok(Math.abs(b.t - a.t - expected) < h.TICK * 3, `gap ${b.t - a.t} ≈ ${expected}`);
  }
  assert.equal(h.b.errorCount, 0);
});
