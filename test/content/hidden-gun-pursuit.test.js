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
const BAT = E[GUN].stats.bat, CLIP = E[GUN].attackAnim.dur, HIT = E[GUN].attackAnim.hit, STEP = E[GUN].talents.bb['2.attack_speed'];
/** The attack's interval at ASPD `a`, and the cooldown 【盲信之誓】's cast restarts as the gun appears (ASPD 20). */
const ivAt = (a) => BAT * 100 / a;
const OPENING = ivAt(20);
/** Keep the springs on the (first) gun: no beam meets an operator. */
const tuck = (h) => h.b.on('tick', () => {
  const g = h.enemies().find((e) => e.defId === GUN);
  if (g) for (const s of h.enemies()) if (/enemy_90(18|19|20)_actrp/.test(s.defId)) { s.x = g.x; s.y = g.y; }
});

/** The guns of `h` never use 【最终之罚】 (as on the pair field: h08_02's cooldown 999). */
const noCharges = (h) => h.b.on('tick', () => {
  for (const g of h.enemies()) if (g.defId === GUN && g.mem.ab) g.mem.ab.list.find((a) => a && a.sk && a.fire && a.cd === 30 || a && a.cd === 999).left = Infinity;
});

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
    // 【盲信之誓】's cast at its spawn took the attack's turn, so the call waits for the attack's cooldown (22.5 s at ASPD 20, sooner
    // when a beam met an operator)
    assert.ok(own[0] - t0 > skill.initCooldown - h.TICK * 2 && own[0] - t0 < OPENING + 0.2, `first call ${skill.initCooldown}–${OPENING} s after its spawn, got ${own[0] - t0}`);
    for (let i = 1; i < own.length; i++) assert.ok(Math.abs(own[i] - own[i - 1] - skill.cooldown - DOG) < h.TICK * 2, `then every ${skill.cooldown} s, from the end of the ${DOG} s cast`);
  }
  // the calls alternate between the two guns, the leader's one (preDelay − branch time) after the branch gun's: the
  // springs go to each gun in turn, not always to the one that calls a tick later
  assert.equal(calls.length, 6);
  for (let i = 1; i < calls.length; i++) assert.notEqual(calls[i].gun, calls[i - 1].gun, 'the guns take turns');
  for (let i = 1; i < calls.length; i += 2) assert.ok(Math.abs(calls[i].time - calls[i - 1].time - (leadAt - branchAt)) < OPENING - skill.initCooldown + 0.2, 'staggered by the preDelay');
  assert.equal(h.b.errorCount, 0);
  checkInvariants(h.b);
});

test('隐秘核心铳: reaching a moving gun keeps pursuit, invulnerability and disarm for the full 5 s', () => {
  const h = arena({ solo: true, manual: true, cooldown: 45 });
  h.step();
  const gun = h.spawn(GUN, { pos: [3, 5], tag: 'boss', mods: { speedMul: 0 } });
  const spring = h.spawn(SPRING, { pos: [3, 4.8], tag: 'part' });
  h.runUntil(() => spring.mem.ab.dash, OPENING + 1);
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
  const callOf = (g) => g.mem.ab.list.find((a) => a.cd === 45 && a.fire), call = callOf(right);
  call.left = 999;   // the right gun's call is not ready yet
  callOf(left).left = OPENING + 1;   // past the cooldown of 【盲信之誓】's cast (both guns' attacks are ready by then)
  const spring = h.spawn(SPRING, { pos: [3, 10], tag: 'part' });
  h.run(OPENING + 1);
  spring.x = 10; spring.y = 3;
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
  h.runUntil(() => spring.mem.ab.dash, OPENING + 1);
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
  noAttacks(h); noCharges(h); tuck(h);
  const calls = recordCalls(h);
  h.run(100);
  assert.equal(calls.length, 2);
  const tpl = W.act1autochess_h08_02_s;
  const spawnTime = tpl.spawns.find((s) => s.tag === 'boss').time;
  const skill = (tpl.overrides[GUN]?.skills ?? E[GUN].skills).find((s) => s.prefabKey === '2');
  assert.ok(OPENING > skill.initCooldown);
  assert.ok(Math.abs(calls[0].time - spawnTime - OPENING) < 0.03 + h.TICK * 3, `the attack's cooldown since 【盲信之誓】's cast: ${calls[0].time - spawnTime}`);
  assert.ok(Math.abs(calls[1].time - calls[0].time - skill.cooldown - DOG) < h.TICK * 2);
  assert.equal(h.b.errorCount, 0);
});

const skillOf = (g, key) => g.mem.ab.list.find((a) => a && a.fire && a.cd === E[GUN].skills.find((s) => s.prefabKey === key).cooldown);

/** The solo gun on its real route, a wall it cannot kill in its reach, its charge off, its beams on nobody; the battle. */
function stalled({ left = 45, speedMul = 1 } = {}) {
  const h = arena({ solo: true, manual: true, extra: [{ uid: 2, chessId: 'pursuit_wall', row: 4, col: 8, abs: true }] });
  h.step();
  const spring = h.spawn(SPRING, { pos: [4, 10], tag: 'part', routeIndex: 1, mods: { speedMul: 0 } });
  const gun = h.spawn(GUN, { pos: [4, 10], tag: 'boss', routeIndex: 0, mods: { speedMul } });
  tuck(h);
  h.b.addBuff(gun, { key: 'test:hold', duration: OPENING + 1, flags: { noMove: true } });   // in reach until its attack is ready
  skillOf(gun, '1').left = Infinity;
  skillOf(gun, '2').left = left;
  return { h, gun, spring, wall: h.allies().find((u) => u.tileC === 8) };
}

/** Every shot from now: { t (from now), aspd at the strike, d to its target, wind, walked (s, since the shot before) }. */
function shots(h, gun) {
  const out = [], t0 = h.b.time;
  let n = gun.stats.attacks, x = gun.x, y = gun.y, walked = 0, aspd = gun.s.aspd, u = null;
  h.b.on('attack', (c) => { if (c.attacker === gun) u = c.targets[0]; });
  h.b.on('tick', () => {
    if (Math.hypot(gun.x - x, gun.y - y) > 1e-9) walked += h.TICK;
    x = gun.x; y = gun.y;
    if (gun.stats.attacks !== n) {
      n = gun.stats.attacks;
      out.push({ t: h.b.time - t0, aspd, d: Math.hypot(u.x - gun.x, u.y - gun.y), wind: HIT * Math.min(1, ivAt(aspd) / CLIP), walked });
      walked = 0;
    }
    aspd = gun.s.aspd;
  });
  return out;
}
const near = (h, a, b, msg) => assert.ok(Math.abs(a - b) < h.TICK * 3, `${msg}: ${a} ≈ ${b}`);

/** …until its first call. */
function toFirstCall() {
  const { h, gun, spring } = stalled();
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
  assert.equal(gun.s.aspd, 20 + STEP, 'one stack: 100, not 420');
  h.run(DOG);
  const walk = shots(h, gun);
  h.run(14);
  // the cooldown ran out during the cast (4.5 s < 5 s): it shoots at once, at ASPD 100, the stacks cleared again by the
  // operator (another target than the spring) as the shot lands
  assert.ok(walk[0].t < 0.2 + HIT, `shoots at once: ${walk[0].t}`);
  assert.equal(walk[0].aspd, 20 + STEP);
  near(h, walk[1].t - walk[0].t, ivAt(100), '4.5 s, not 1.07 s');
  near(h, walk[1].walked, ivAt(100) - CLIP, 'it walks while the 4.5 s interval outlasts the 2.5 s clip (the time walked)');
  // the second shot lands HIT + its flight into a 4.5 s cooldown: what is left is rescaled to ASPD 180's 2.5 s
  const hitAt = HIT + walk[1].d / 10;
  const second = hitAt + (1 - hitAt / ivAt(100)) * ivAt(180);
  near(h, walk[2].t - walk[1].t, second, 'the cooldown keeps its progress when the attack speed rises');
  near(h, walk[2].walked, second - CLIP, 'a second, short walk');
  // the third shot's cast lasts the clip, longer than what its cooldown has left: no step any more
  near(h, walk[3].t - walk[2].t, CLIP + (walk[3].wind - HIT), 'the cast outlasts the cooldown');
  assert.ok(walk.slice(3).every((s) => s.walked === 0), 'it stands from ASPD 180 on');
  assert.equal(h.b.errorCount, 0);
});

test('铳: a shot\'s target is the highest DEF as its cast starts; the hit counts as the projectile lands', () => {
  const { h, gun, wall } = stalled({ speedMul: 0 });
  assert.ok(h.runUntil(() => gun.swing, 30));
  assert.ok(h.b.time > OPENING - 0.2, '【盲信之誓】\'s cast at the start took the attack\'s turn');
  const other = h.allies().find((u) => u !== wall);
  other.base.def += 500; other.markDirty?.();
  other.x = other.tileC = 10; other.y = other.tileR = 5;
  assert.ok(h.runUntil(() => gun.stats.attacks === 1, 3));
  assert.equal(gun.s.aspd, 20, 'not yet landed');
  h.run(Math.hypot(wall.x - gun.x, wall.y - gun.y) / 10 + h.TICK * 2);
  assert.equal(gun.s.aspd, 20 + STEP);
  assert.ok(wall.stats.taken > 0 && other.stats.taken === 0, 'the swing under way keeps its target');
  assert.ok(h.runUntil(() => other.stats.taken > 0, 8), 'the next one takes the higher DEF');
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: losing its target keeps the stacks; nothing but a hit on another one clears them', () => {
  const { h, gun, wall } = stalled({ left: Infinity });
  assert.ok(h.runUntil(() => gun.s.aspd === 20 + 5 * STEP, 60));
  const n = gun.stats.attacks, x = gun.x;
  h.b.retreat(wall, { permanent: true });
  h.run(6);
  assert.ok(gun.stats.attacks <= n + 1);
  assert.ok(Math.abs(gun.x - x) > 0.5, 'free: it walks on');
  assert.equal(gun.s.aspd, 20 + 5 * STEP, 'the stacks stay');
});

test('隐秘核心铳: an operator that enters a 盲信之誓 beam counts as a hit for the attack-speed stacks, each time it enters', () => {
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

test('隐秘核心铳: 最终之罚 takes the attack\'s turn, keeps the stacks, and the attack is ready again as it ends', () => {
  const { h, gun, spring, wall } = stalled({ left: Infinity });
  const charge = skillOf(gun, '1');
  assert.ok(h.runUntil(() => gun.s.aspd === 20 + 5 * STEP, 60));
  h.b.kill(spring, null);   // no beam: it would meet the operators the gun runs past
  assert.ok(h.runUntil(() => gun.swing, 3));
  charge.left = 0;
  const n = gun.stats.attacks;
  h.step();
  assert.ok(!gun.findBuff('boss:charge'), 'it waits for the swing under way');
  assert.ok(h.runUntil(() => gun.findBuff('boss:charge'), 3));
  assert.equal(gun.stats.attacks, n + 1, 'after that shot');
  assert.ok(h.runUntil(() => !gun.findBuff('boss:charge'), 16));
  assert.equal(gun.s.aspd, 20 + 5 * STEP, 'the charge is no hit for the stacks');
  assert.ok(wall.alive);
  const t = h.b.time;
  assert.ok(h.runUntil(() => gun.swing, 1) && h.b.time - t < h.TICK * 3, 'the re-attached attack is ready');
  assert.equal(h.b.errorCount, 0);
});

test('隐秘核心铳: a call that outlasts the charge\'s 15 s is cut as the charge ends', () => {
  const { h, gun, spring } = stalled({ left: Infinity, speedMul: 0 });
  assert.ok(h.runUntil(() => gun.s.aspd === 20 + 5 * STEP, 60));
  skillOf(gun, '1').left = 0;
  assert.ok(h.runUntil(() => gun.findBuff('boss:charge'), 5));
  const t0 = h.b.time, dur = E[GUN].talents.bb['3.duration'];
  gun.unbalanceUntil = t0 + dur - 3;                                          // held back, the charge is still on its way…
  h.run(dur - 3 + h.TICK);
  skillOf(gun, '2').left = 0;                                                 // …when a call comes 3 s before its end
  h.step(2);
  assert.ok(gun.findBuff('ab:channel') && spring.mem.ab.dash, 'the call is cast during the charge');
  h.run(t0 + dur - h.b.time - 0.1);
  assert.ok(gun.findBuff('ab:channel'));
  h.run(0.3);
  assert.ok(!gun.findBuff('ab:channel') && !gun.findBuff('boss:charge'), 'both over');
  assert.equal(gun.form, null);
  assert.ok(spring.mem.ab.dash, 'the spring keeps its own 5 s');
  const cd = E[GUN].skills.find((s) => s.prefabKey === '2').cooldown;
  assert.ok(Math.abs(skillOf(gun, '2').left - cd) < 0.4, 'the call\'s cooldown runs from the cut');
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
  charge.left = call.left = Infinity;
  h.run(OPENING + 0.5);
  charge.left = 0.5; call.left = 0;
  h.step(2);
  assert.ok(gun.findBuff('ab:channel'));
  h.run(DOG - 0.2);
  assert.ok(!gun.findBuff('boss:charge'), 'the charge waits for the cast');
  h.run(0.4);
  assert.ok(gun.findBuff('boss:charge'), 'then it starts');
  call.left = 0;
  h.step();
  assert.ok(gun.findBuff('ab:channel'), 'a call during the charge needs no attack turn');
  const x = gun.x;
  h.run(1);
  assert.equal(gun.x, x, 'it stands while it calls');
  assert.equal(h.b.errorCount, 0);
});
