// Community report F4 after 0.1.0 — "干员深巡放在围栏围着的地块里不会主动攻击" (深巡, 哨戒铁卫, on a fenced tile).
//
// The fenced tiles are the official 围墙 (tile_fence_bound; gamedata stage_table tileInfo "可放置近战单位，敌方无法进入"):
// low ground, deployable, passable to flyers only, drawn with an orange railing around each fenced region (the normal
// fields of act1 m01–m04 / act2 m02–m04, the Final Assault halves, act2 m01's 1×3 pipe tiles).
//
// Not reproduced: 深巡's trait "能够阻挡三个敌人，可以进行远程攻击" (character_table char_4137_udflow, range 2-2 = her tile and
// the two in front) — she attacks every enemy on those tiles from a fenced tile like from any other: the sim targets by
// range tiles (no line-of-sight, path or blocking requirement for an attack). Locked below on every deployable fenced
// tile of every active stage, every direction that looks at walkable ground, normal and elite.
//
// Nearby rule fixed: PRTS 围墙 / 围栏 地形机制 "部署在其中的单位，若当前阻挡类型为'地面阻挡'则无法阻挡敌人" — a unit on a fenced
// tile blocks no ground enemy (Battle._blockerFor). Nothing walks onto such a tile, but a push / pull stops an enemy at
// the tile edge, 0.5 from the fenced unit — inside the ground block radius 0.7071 — and 0.1.0 let the fenced unit block
// it there (found while checking F4, with 薄绿 S2). Air blocking (blockFly against flyers) stays [ASSUMED: PRTS restricts
// the rule to 地面阻挡].

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeBattle } from '../helpers/battleHarness.js';
import { canTargetEnemy } from '../../server/sim/targeting.js';
import { bodyInKeys } from '../../server/sim/body.js';
import { effectiveProfile, allyCastWindup } from '../../server/sim/ai.js';
import { rotateOffset } from '../../server/sim/dir.js';

const STAGES = JSON.parse(fs.readFileSync(new URL('../../data/stages.json', import.meta.url), 'utf8'));
const ACTIVE = Object.keys(STAGES).filter((id) => STAGES[id].active && STAGES[id].weight > 0);
const UDFLOW = 'chess_char_1_04_a', UDFLOW_E = 'chess_char_1_04_b';
const DIRS = ['RIGHT', 'UP', 'LEFT', 'DOWN'];
const glyph = (st, r, c) => st.rows[r]?.[c];
const walkable = (st, r, c) => r >= 9 && r <= 12 && c >= 0 && c <= 10 && !!st.tiles[glyph(st, r, c)]?.groundPassable;

/** Deployable fenced tiles of a stage's normal field (board = field coordinates there). */
const fencedTiles = (st) => st.deployTiles.normal.melee.filter(([r, c]) => glyph(st, r, c) === 'b');

/** Directions whose 2-2 line (her tile + two ahead) reaches walkable ground from (r, c). */
const laneDirs = (st, r, c) => DIRS.filter((d) => [[0, 1], [0, 2]].some(([dr, dc]) => { const [a, b] = rotateOffset(dr, dc, d); return walkable(st, r + a, c + b); }));

/**
 * One battle: the operator alone on (r, c) facing `dir` against a real round template. Returns its attacks, the ticks a
 * targetable enemy stood on its range tiles, the longest wait for an attack while one did and it could act (seconds
 * beyond its attack interval — the longer of the interval when the wait began and now: her S2 casts on its 3-2 between
 * two attacks since 0.2.0, the owner's ACTIVE_RANGE rule, and its ASPD shortens the interval while the cooldown the
 * last attack set still runs) and the ticks it blocked anything.
 */
function watch(stageId, chessId, r, c, dir, { template = 'act1autochess_02', seconds = 45 } = {}) {
  const h = makeBattle({ stageId, waveTemplate: template, units: [{ chessId, row: r, col: c, dir }], seed: 5 });
  h.step(1);
  const u = h.unit(chessId);
  assert.ok(u && u.deployed && u.tileR === r && u.tileC === c, `${stageId} (${r},${c}) deployed`);
  let attacks = 0, inRange = 0, blocked = 0, waitFrom = null, waitIv = 0, worst = 0;
  h.b.on('attack', (ctx) => { if (ctx.attacker === u) { attacks++; waitFrom = null; } });
  for (let i = 0; i < seconds * 30 && !h.b.finished; i++) {
    h.step(1);
    if (u.blocking.length) blocked++;
    if (!u.alive || !u.deployed || !u.canAct || u.s.flags.disarm) { waitFrom = null; continue; }
    const prof = effectiveProfile(u);
    const set = u.rangeKeySet || new Set(u.rangeKeys);
    const target = h.b.enemies.some((e) => e.alive && e.deployed && canTargetEnemy(u, e, prof) && bodyInKeys(e, set));
    if (!target) { waitFrom = null; continue; }
    inRange++;
    if (waitFrom == null) { waitFrom = h.b.time; waitIv = u.s.interval; }
    // the attack is counted at its hit, one wind-up after its cast (official cast → hit, ai.js allyCastWindup)
    worst = Math.max(worst, h.b.time - waitFrom - Math.max(waitIv, u.s.interval) - allyCastWindup(u));
  }
  return { attacks, inRange, blocked, worst };
}

test('F4 (not reproduced): 深巡 on every deployable fenced tile of every active stage attacks the enemies on her range tiles', () => {
  let cases = 0, withTargets = 0;
  for (const id of ACTIVE) {
    const st = STAGES[id];
    for (const [r, c] of fencedTiles(st)) {
      for (const dir of laneDirs(st, r, c)) {
        for (const chessId of [UDFLOW, UDFLOW_E]) {
          const w = watch(id, chessId, r, c, dir);
          const where = `${chessId} ${id} (${r},${c}) ${dir}: ${JSON.stringify(w)}`;
          cases++;
          // never idle with a target: an attack at the latest one interval (+ 0.2 s) after an enemy is on her tiles
          assert.ok(w.worst <= 0.2, `idle with a target in range — ${where}`);
          if (w.inRange > 0) { withTargets++; assert.ok(w.attacks > 0, `no attack — ${where}`); }
          // nothing walks onto a fenced tile or within her reach there
          assert.equal(w.blocked, 0, `blocked from a fenced tile — ${where}`);
        }
      }
    }
  }
  assert.ok(cases >= 150, `${cases} placements`);
  assert.ok(withTargets >= cases * 0.8, `${withTargets} of ${cases} placements saw enemies on her range tiles`);
});

test('F4: the Final Assault fenced tiles (act2 m01 boss (3–5, 8), act1 m01 boss (4,7)) — 深巡 attacks the leaders and their escorts', () => {
  const W = JSON.parse(fs.readFileSync(new URL('../../data/waves.json', import.meta.url), 'utf8'));
  const run = (stageId, tpl, r, c, dir) => {
    const h = makeBattle({ kind: W[tpl].kind, stageId, waveTemplate: tpl, timeLimit: 20, autoFinish: false,
      sharedBoss: { hp: 1e9, maxHp: 1e9, damage() {} },
      players: [{ playerId: 'p1', seat: 0, side: 'L', coords: 'field', colOffset: 0, units: [{ uid: 1, kind: 'chess', chessId: UDFLOW, row: r, col: c, dir }], bonds: {} }] });
    h.step(1);
    const u = h.unit(UDFLOW);
    let n = 0;
    h.b.on('attack', (ctx) => { if (ctx.attacker === u) n++; });
    h.run(20);
    return n;
  };
  for (const r of [3, 4, 5]) assert.ok(run('act2autochess_m01', 'act1autochess_h07_01', r, 8, 'RIGHT') > 0, `act2 m01 (${r},8): the huge leader on her line`);
  assert.equal(glyph(STAGES.act1autochess_m01, 4, 7), 'b');
  assert.ok(run('act1autochess_m01', 'act1autochess_h07_03', 4, 7, 'RIGHT') > 0, 'act1 m01 boss (4,7)');
});

test('fix: a unit on a fenced tile (围墙) blocks no ground enemy pushed against the fence; on a road tile it does', () => {
  const push = (stage) => {
    const h = makeBattle({ stage, units: [{ chessId: UDFLOW, row: 11, col: 7, dir: 'RIGHT' }], autoFinish: false, timeLimit: 60, seed: 3 });
    h.step(1);
    const u = h.unit(UDFLOW);
    const e = h.spawn('enemy_1007_slime', { pos: [11, 8], routeIndex: 0 });
    h.step(2);
    assert.equal(e.blockedBy, null, 'one tile away: not in contact');
    const moved = h.b.displace(e, { x: -1, y: 0 }, 0.6);
    assert.ok(Math.hypot(e.x - 7, e.y - 11) < 0.7071, `within the ground block radius (${e.x.toFixed(3)})`);
    h.step(1);
    return { h, u, e, moved };
  };
  // act1 m01: (11,7) is a 围墙 tile of the fenced block, (11,8) the col-8 road beside it
  const fenced = STAGES.act1autochess_m01;
  assert.equal(glyph(fenced, 11, 7), 'b');
  assert.equal(fenced.tiles.b.tileKey, 'tile_fence_bound');
  const a = push(fenced);
  assert.ok(a.moved > 0.4 && a.moved < 0.6 && Math.round(a.e.x) === 8, `stopped at the fence edge (moved ${a.moved})`);
  assert.equal(a.e.blockedBy, null, 'the enemy against the fence is not blocked by the unit on the fenced tile');
  assert.equal(a.u.blocking.length, 0);
  a.h.step(30);
  assert.ok(a.e.alive && a.e.blockedBy === null && Math.hypot(a.e.x - 7.5, a.e.y - 11.05) > 0.2, 'it walks on');
  // control: the same tile made a road — the pushed enemy is blocked as before
  const road = { ...fenced, rows: fenced.rows.map((row, r) => (r === 11 ? `${row.slice(0, 7)}r${row.slice(8)}` : row)) };
  const b = push(road);
  assert.equal(b.e.blockedBy, b.u, 'on a road tile the same contact blocks');
});

test('fix, real kit: 薄绿 on a 围墙 tile drags enemies against the fence and blocks none of them (0.1.0: held them there)', () => {
  // 薄绿 S2 聚能涡旋 drags enemies towards her (Battle.push inward); from act1 m01's fenced (11,7) facing the col-8 road the
  // dragged enemies end at the fence edge, in contact with her — 0.1.0 blocked them there for most of the round
  const BOLV = 'chess_char_3_08_a';
  const h = makeBattle({ stageId: 'act1autochess_m01', waveTemplate: 'act1autochess_02', units: [{ chessId: BOLV, row: 11, col: 7, dir: 'RIGHT' }], seed: 9 });
  h.step(1);
  const u = h.unit(BOLV);
  let casts = 0, contact = 0, blocked = 0;
  h.b.on('skillStart', (ctx) => { if (ctx.unit === u) casts++; });
  for (let i = 0; i < 45 * 30 && !h.b.finished; i++) {
    h.step(1);
    if (h.b.enemies.some((e) => e.alive && !e.isFlying && Math.hypot(e.x - 7, e.y - 11) < 0.7071)) contact++;
    if (u.blocking.length) blocked++;
  }
  assert.ok(casts > 0 && contact > 30, `the drag brought ground enemies into contact (${casts} casts, ${contact} ticks)`);
  assert.equal(blocked, 0, 'she blocks nothing from the fenced tile');
});

test('fix: air blocking stays — a blockFly unit on a fenced tile blocks a flyer over the fence', () => {
  // [ASSUMED] PRTS's rule names only 地面阻挡 ("若当前阻挡类型为'地面阻挡'则无法阻挡敌人"), so air blocking is kept
  const h = makeBattle({ stageId: 'act1autochess_m01', units: [{ chessId: UDFLOW, row: 11, col: 7, dir: 'RIGHT' }], autoFinish: false, timeLimit: 60, seed: 3 });
  h.step(1);
  const u = h.unit(UDFLOW);
  h.b.addBuff(u, { key: 'test:blockFly', duration: Infinity, flags: { blockFly: true } });
  const e = h.spawn('enemy_1005_yokai', { pos: [11, 7], routeIndex: 2 });
  h.step(2);
  assert.ok(e.isFlying);
  assert.equal(e.blockedBy, u, 'the flyer over the fenced tile is blocked by the air blocker standing on it');
});
