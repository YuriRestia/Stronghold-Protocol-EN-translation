// 隐秘核心铳's 【末日布道】 (PR #347 by @CXUtk): every 碎铳之簧 chases the casting gun for the gain's whole 5 s — PRTS 末日布道
// "令全场的“碎铳之簧”获得5秒增益：移动速度+800%，无敌，增益期间切换为追逐模式", “碎铳之簧” 追逐模式 "持续追踪令其进入该形态的场上的
// 假想敌：铳移动" (no arrival clause). Until 0.2.1 reaching the gun (or 1 tile from it) ended the chase. Each gun casts on its
// own data timer (initCooldown 20, cooldown 45 — no stagger between the two guns of a pair field, no lock while a chase
// runs: the data has neither, and the handbook's 「向自身」 means the later call takes the springs).
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
function arena({ solo = false, manual = false, cooldown = null } = {}) {
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
      { playerId: 'p1', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, chessId: 'pursuit_wall', row: 3, col: 5, abs: true }] },
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

test('隐秘核心铳 pair: each gun calls on its own data timer (20 s after it spawns, then every 45 s); the later call takes the springs', () => {
  const h = arena();
  const spawned = new Map();
  h.b.on('enemySpawn', (c) => { if (c.enemy.defId === GUN) spawned.set(c.enemy, h.b.time); });
  const calls = recordCalls(h);
  h.run(150);
  assert.equal(spawned.size, 2, 'the pair field has two guns (the mirrored one)');
  const skill = W.act1autochess_h08_02.overrides[GUN].skills.find((s) => s.prefabKey === '2');
  for (const [gun, t0] of spawned) {
    const own = calls.filter((c) => c.gun === gun).map((c) => c.time);
    assert.equal(own.length, 3, 'three calls each in 150 s');
    assert.ok(Math.abs(own[0] - t0 - skill.initCooldown) < h.TICK * 2, `first call ${skill.initCooldown} s after its spawn`);
    for (let i = 1; i < own.length; i++) assert.ok(Math.abs(own[i] - own[i - 1] - skill.cooldown) < h.TICK * 2, `then every ${skill.cooldown} s`);
  }
  // the two mirrored guns call within a tick or two of each other (no half-cooldown stagger), the later one wins
  for (let i = 1; i < calls.length; i += 2) assert.ok(calls[i].time - calls[i - 1].time < h.TICK * 3, 'the two calls come together');
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
  assert.ok(Math.abs(calls[1].time - calls[0].time - skill.cooldown) < h.TICK * 2);
  assert.equal(h.b.errorCount, 0);
});
