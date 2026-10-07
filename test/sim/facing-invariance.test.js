// Rotation invariance of the 4-direction facing (DESIGN §3 "Facing (corrected)", research 09 §1.2): on an open field an
// operator facing d, with every enemy / helper placed at the same offsets turned by d, must play exactly like the
// RIGHT-facing original — same damage on the same facing-RIGHT offsets, same pushes / pulls in its own frame, summons
// on the same local tiles. Catches any front / side / "first tile" logic that still assumes RIGHT (tie-breaks by the
// absolute tile key, walls along the column, …). Legit exceptions are board-position rules (DESIGN: deployment order
// top→bottom then left→right, "最右边" / "更靠左" orders), which the scenario avoids or lists explicitly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBattle, enemyRec, chessRec, checkInvariants } from '../helpers/battleHarness.js';
import { rotateOffset, toLocal, localOrder, localBefore } from '../../server/sim/dir.js';

const CHESS = JSON.parse(readFileSync(new URL('../../data/chess.json', import.meta.url), 'utf8'));
const LIST = Array.isArray(CHESS) ? CHESS : Object.values(CHESS);

// an all-road 19×21 field (no gates / paths near the unit: tactical points and summons choose by geometry only)
const ROWS = [];
for (let r = 0; r < 19; r++) ROWS.push('#' + 'r'.repeat(19) + '#');
const OPEN = { id: 'open', name: 'open', rows: ROWS, devices: [] };
const RECT = { r0: 0, r1: 18, c0: 0, c1: 20 };
const FAR_ROUTE = [{ motion: 'FLY', start: [18, 20], end: [18, 19], checkpoints: [] }];
const R0 = 9, C0 = 9;
// enemy offsets in the facing-RIGHT frame (a spread of ranges incl. behind / beside / far ahead); every 4th one flies
const OFFS = [];
for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 7; dc++) if ((dr || dc) && (dr * dr + dc * dc) % 3 !== 1) OFFS.push([dr, dc]);
// injured helpers (distinct max HP and HP ratio: heal / protect choices never fall back to the deployment order)
const HELP = [[1, 1], [0, -1], [-1, 0]];
const helpers = Object.fromEntries(HELP.map((_, i) => [`t_help${i}`, chessRec({ id: `t_help${i}`, profession: 'SNIPER', rangeGrid: [[0, 0]], skill: null, stats: { maxHp: 4000 + 500 * i, atk: 0, blockCnt: 0 } })]));
// 凯瑟琳 hands out her devices front-most operator first by board column — a board position (DESIGN), not a facing
const BOARD_POSITION_RULES = new Set(['chess_char_4_11_a', 'chess_char_4_11_b']);
const walkRoute = (pos) => ({ motion: 'WALK', start: pos, checkpoints: [{ type: 'WAIT', time: 1e4 }], end: pos });

function scenario(chessId, dir, secs) {
  const enemies = OFFS.map(([dr, dc], i) => {
    const [ar, ac] = rotateOffset(dr, dc, dir);
    const pos = [R0 + ar, C0 + ac];
    const fly = i % 4 === 1;
    return { key: fly ? 'e_fly' : 'e_dummy', pos, route: fly ? { ...walkRoute(pos), motion: 'FLY' } : walkRoute(pos) };
  });
  const units = [{ chessId, row: R0, col: C0, dir, abs: true }];
  HELP.forEach(([dr, dc], i) => { const [ar, ac] = rotateOffset(dr, dc, dir); units.push({ uid: 100 + i, chessId: `t_help${i}`, row: R0 + ar, col: C0 + ac, dir, abs: true }); });
  const h = makeBattle({
    stage: OPEN, rect: RECT, seed: 5, routes: FAR_ROUTE, units, enemies, autoFinish: false, timeLimit: secs + 5, hooks: [],
    defs: {
      chess: helpers,
      enemies: {
        e_dummy: enemyRec({ key: 'e_dummy', hp: 1e6, speed: 0, def: 100, res: 10 }),
        e_fly: enemyRec({ key: 'e_fly', hp: 1e6, speed: 0, motion: 'FLY', def: 50, res: 30 }),
      },
    },
    setup: (b) => {
      b.on('deploy', ({ unit }) => { if (unit.uid >= 100) unit.hp = unit.s.maxHp * (0.3 + 0.1 * (unit.uid - 100)); });
      // the open field has no boards: "a tile of the player's own board" (Battle.onOwnBoard — 乌尔比安 S3's landing) is a
      // board-position rule (DESIGN), not a facing one — every tile counts here, so the anchor's landing turns with him
      b.onOwnBoard = () => true;
    },
  });
  h.run(secs);
  checkInvariants(h.b);
  const local = (u) => toLocal(u.y - R0, u.x - C0, dir).map((v) => Math.round(v * 10) / 10);
  return {
    enemies: h.b.enemies.slice(0, OFFS.length).map((e) => [Math.round(1e6 - e.hp), ...local(e)]),
    helpers: HELP.map((_, i) => Math.round(h.b.allyUnits.find((u) => u.uid === 100 + i).hp)),
    tokens: h.b.allyUnits.filter((u) => u.kind === 'token').map((t) => `${t.defId}@${toLocal(t.tileR - R0, t.tileC - C0, dir)}:${t.alive ? 1 : 0}`).sort(),
    extra: h.b.enemies.length - OFFS.length,
  };
}

const same = (a, b) => Math.abs(a - b) <= Math.max(2, 0.02 * Math.max(Math.abs(a), Math.abs(b)));

test('rotation invariance: every chess (normal + elite) facing UP / LEFT / DOWN plays like its RIGHT-facing original', () => {
  const bad = [];
  for (const rec of LIST) {
    if (BOARD_POSITION_RULES.has(rec.chessId)) continue;
    const base = scenario(rec.chessId, 'RIGHT', 20);
    for (const d of ['UP', 'LEFT', 'DOWN']) {
      const o = scenario(rec.chessId, d, 20);
      const diffs = [];
      base.enemies.forEach(([dmg, lr, lc], i) => {
        const [dmg2, lr2, lc2] = o.enemies[i];
        if (!same(dmg, dmg2) || Math.abs(lr - lr2) > 0.15 || Math.abs(lc - lc2) > 0.15) diffs.push(`enemy ${OFFS[i]}: ${dmg}@${lr},${lc} vs ${dmg2}@${lr2},${lc2}`);
      });
      base.helpers.forEach((hp, i) => { if (!same(hp, o.helpers[i])) diffs.push(`helper ${HELP[i]}: hp ${hp} vs ${o.helpers[i]}`); });
      if (base.tokens.join() !== o.tokens.join()) diffs.push(`summons [${base.tokens}] vs [${o.tokens}]`);
      if (base.extra !== o.extra) diffs.push(`extra enemies ${base.extra} vs ${o.extra}`);
      if (diffs.length) bad.push(`${rec.chessId} ${rec.name} ${d}: ${diffs.slice(0, 3).join(' | ')}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('localOrder / localBefore: the facing-RIGHT frame tie-break equals the tile-key order for RIGHT and turns with the direction', () => {
  // RIGHT: (row, col) order = tile-key order
  const offs = [[-1, 0], [0, -1], [0, 1], [1, 0], [1, 1], [-1, -1]];
  const byKey = offs.slice().sort((a, b) => (a[0] * 21 + a[1]) - (b[0] * 21 + b[1]));
  const byLocal = offs.slice().sort((a, b) => (localBefore(localOrder(a[0], a[1], 'RIGHT'), localOrder(b[0], b[1], 'RIGHT')) ? -1 : 1));
  assert.deepEqual(byLocal, byKey);
  // the first of the 4 neighbours is the right hand (local (−1, 0)) whatever the direction
  for (const d of ['UP', 'RIGHT', 'DOWN', 'LEFT']) {
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = null, bo = null;
    for (const [r, c] of n4) { const o = localOrder(r, c, d); if (localBefore(o, bo)) { bo = o; best = [r, c]; } }
    assert.deepEqual(best, rotateOffset(-1, 0, d), d);
  }
});

test('战术家 援军 (伺夜): the tactical point is the tile in FRONT along the direction (not the one beside it)', () => {
  for (const dir of ['RIGHT', 'UP', 'DOWN', 'LEFT']) {
    const h = makeBattle({ stage: OPEN, rect: RECT, routes: FAR_ROUTE, units: [{ chessId: 'chess_char_3_19_a', row: R0, col: C0, dir, abs: true }], autoFinish: false, timeLimit: 30 });
    h.run(2);
    const wolf = h.b.allyUnits.find((u) => u.kind === 'token' && u.alive);
    assert.ok(wolf, `${dir}: the pack is summoned`);
    assert.deepEqual([wolf.tileR - R0, wolf.tileC - C0], rotateOffset(0, 1, dir), `${dir}: in front of 伺夜`);
    assert.equal(wolf.dir, dir, 'the summon takes the owner direction');
  }
});

test('突袭 (raidShip): the landing tile beside the enemy turns with the member direction (equal candidates)', () => {
  // a diagonal-only range: two equally near landing tiles cover the enemy — the tie resolves in the member's frame. The
  // enemy stands inside the player's own board (rows 9–12, cols 2–10): a member lands only on a board of its field since
  // 0.2.0 (Battle.onFieldBoard — on a one-player field its own; DESIGN §25.18, §26.1), so all four diagonal tiles around
  // (10, 6) are candidates in every direction
  const ER = 10, EC = 6;
  const rec = chessRec({ id: 'r_diag', bonds: ['raidShip'], profession: 'WARRIOR', skill: null, rangeGrid: [[1, 1], [-1, 1]] });
  const land = (dir) => {
    const h = makeBattle({
      stage: OPEN, rect: RECT, routes: FAR_ROUTE, defs: { chess: { r_diag: rec }, enemies: { e_d: enemyRec({ key: 'e_d', hp: 1e6, speed: 0 }) } },
      bonds: { raidShip: { count: 1, active: true, tier: 1, layers: 0 } },
      units: [{ chessId: 'r_diag', row: 15, col: 3, dir, abs: true }],
      enemies: [{ key: 'e_d', pos: [ER, EC], route: walkRoute([ER, EC]) }], autoFinish: false, timeLimit: 60,
    });
    const u = h.unit('r_diag');
    assert.ok(h.runUntil(() => u.alive && u.deployed && Math.max(Math.abs(u.tileR - ER), Math.abs(u.tileC - EC)) <= 2, 30), `${dir}: jumped next to the enemy`);
    return toLocal(u.tileR - ER, u.tileC - EC, dir);
  };
  const right = land('RIGHT');
  assert.deepEqual(right, [-1, -1], 'RIGHT: the lower of the two diagonal tiles behind the enemy (tile-key order, as before)');
  for (const d of ['UP', 'LEFT', 'DOWN']) assert.deepEqual(land(d), right, d);
});

test('findSummonTile: equal candidates resolve in the owner\'s facing-RIGHT frame (RIGHT: the tile-key order, as before)', async () => {
  const { findSummonTile } = await import('../../server/sim/content/tokens.js');
  const rec = chessRec({ id: 't_own', profession: 'SUPPORT', rangeGrid: [[0, 0]], skill: null });
  for (const dir of ['RIGHT', 'UP', 'DOWN', 'LEFT']) {
    const h = makeBattle({ stage: OPEN, rect: RECT, routes: FAR_ROUTE, defs: { chess: { t_own: rec } }, units: [{ chessId: 't_own', row: R0, col: C0, dir, abs: true }], autoFinish: false, timeLimit: 10 });
    h.step();
    const o = h.unit('t_own');
    // no enemies: the 4 orthogonal neighbours tie on distance — the owner's right hand (local (−1, 0)) comes first
    const [r, c] = findSummonTile(h.b, o, 'adjacent');
    assert.deepEqual([r - R0, c - C0], rotateOffset(-1, 0, dir), dir);
  }
});
