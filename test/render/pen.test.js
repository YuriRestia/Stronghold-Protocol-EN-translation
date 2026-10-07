// test/render/pen.test.js — the enemy preview pen layout (render/pen.js, research 09 §2.2 / 08 §4.2) and the Final
// Assault prep field transform (render/prepfield.js, research 09 §1.2).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutPen, penZones, thinPreview, penEntries, penSignature, parsePenRect, MAX_PREVIEW, PER_TILE, inPen } from '../../public/js/render/pen.js';
import { bossPrepField, IDENTITY, mirrorDir, tilesToDisp } from '../../public/js/render/prepfield.js';
import { bossFieldPlacement } from '../../server/match/finalAssault.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const STAGES = JSON.parse(readFileSync(path.join(ROOT, 'data/stages.json'), 'utf8'));
// the battle stages (the escaped levels' two maps, kind 'unite', have no preview pen: nobody prepares on them)
const stageList = Object.values(STAGES.stages || STAGES).filter((s) => s.kind !== 'unite');
const stage = (STAGES.stages || STAGES).act2autochess_m01;

const E = (enemyKey, count, gate, t, extra = {}) => ({ enemyKey, count, gate, t, fly: false, elite: false, boss: false, source: 'wave', ...extra });

describe('enemy preview pen: zones', () => {
  test('every stage: two zones of 13 tiles (rows 14–15 / 17–18), anchors (15,7) and (18,7), row 16 never used', () => {
    for (const st of stageList) {
      const z = penZones(st);
      assert.deepEqual(z.rect, { r0: 14, r1: 18, c0: 7, c1: 13 }, st.id);
      assert.deepEqual(z.lower.anchor, [15, 7]);
      assert.deepEqual(z.upper.anchor, [18, 7]);
      assert.equal(z.lower.tiles.length, 13);
      assert.equal(z.upper.tiles.length, 13);
      for (const [r] of z.lower.tiles) assert.ok(r === 14 || r === 15);
      for (const [r] of z.upper.tiles) assert.ok(r === 17 || r === 18);
      // row-major, as the client lists them (research 08 §4.2 step 3 [DATA]: low row first, col 7 → 13)
      const rowMajor = (rows) => rows.flatMap((r) => [7, 8, 9, 10, 11, 12, 13].map((c) => [r, c])).filter(([r, c]) => !(c === 7 && (r === 15 || r === 18)));
      assert.deepEqual(z.lower.tiles, rowMajor([14, 15]), st.id);
      assert.deepEqual(z.upper.tiles, rowMajor([17, 18]), st.id);
    }
    assert.deepEqual(penZones(null).lower.tiles, penZones(stage).lower.tiles, 'defaults = the official layout');
    assert.deepEqual(parsePenRect('((14,7),(18,13))'), { r0: 14, r1: 18, c0: 7, c1: 13 });
    assert.equal(parsePenRect('nope'), null);
  });
});

describe('enemy preview pen: layout', () => {
  test('upper-gate enemies stand in rows 17–18, lower-gate ones in rows 14–15; one figure per enemy; row 16 empty', () => {
    const list = [E('enemy_a', 3, 'lower', 3), E('enemy_b', 2, 'upper', 5), E('enemy_c', 4, 'lower', 12, { fly: true })];
    const pen = layoutPen(list, { stage });
    assert.equal(pen.figures.length, 9);
    assert.equal(pen.total, 9);
    for (const f of pen.figures) {
      assert.ok(inPen(f.row, f.col), `${f.row},${f.col}`);
      assert.notEqual(f.row, 16);
      if (f.enemyKey === 'enemy_b') assert.ok(f.row >= 17, 'upper gate'); else assert.ok(f.row <= 15, 'lower gate');
      assert.ok(Math.abs(f.x - f.col) < 0.5 && Math.abs(f.y - f.row) < 0.5, 'stays on its tile');
    }
    assert.ok(pen.figures.filter((f) => f.enemyKey === 'enemy_c').every((f) => f.fly));
  });

  test('spawn-time order: earlier spawns stand nearer the gate (col 7)', () => {
    const list = [E('late', 4, 'lower', 40), E('early', 4, 'lower', 2)];
    const pen = layoutPen(list, { stage });
    const meanCol = (k) => { const f = pen.figures.filter((x) => x.enemyKey === k); return f.reduce((s, x) => s + x.col, 0) / f.length; };
    assert.ok(meanCol('early') < meanCol('late'), `${meanCol('early')} < ${meanCol('late')}`);
    assert.equal(pen.figures[0].enemyKey, 'early');
    // the client's index divisor is totalShowCnt = min(50, Σ count) (both zones): a small upper group of a big wave
    // stays at the start of its row-major list — row 17 next to the (18,7) gate — instead of spreading over the zone
    const small = layoutPen([E('n', 40, 'lower', 1), E('u', 5, 'upper', 2)], { stage });
    for (const f of small.figures.filter((x) => x.enemyKey === 'u')) assert.ok(f.row === 17 && f.col <= 9, `${f.row},${f.col}`);
  });

  test('at most 3 figures per tile, several may share one; deterministic for the same preview', () => {
    const list = [E('enemy_a', 30, 'lower', 1), E('enemy_b', 20, 'upper', 2)];
    const a = layoutPen(list, { stage }), b = layoutPen(JSON.parse(JSON.stringify(list)), { stage });
    assert.deepEqual(a, b);
    const load = new Map();
    for (const f of a.figures) load.set(`${f.row},${f.col}`, (load.get(`${f.row},${f.col}`) || 0) + 1);
    assert.ok(Math.max(...load.values()) <= PER_TILE);
    assert.ok([...load.values()].some((n) => n > 1), 'clusters');
    // figures on a shared tile do not stand on the same spot
    const pts = a.figures.map((f) => [f.x, f.y]);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) > 0.15, 'no exact overlap');
  });

  test('cap 50: thinning keeps the ratio, elites and bosses are always shown in full', () => {
    const list = [E('n1', 40, 'lower', 1), E('n2', 30, 'upper', 2), E('boss', 1, 'lower', 3, { boss: true, elite: true }), E('el', 4, 'upper', 9, { elite: true })];
    const pen = layoutPen(list, { stage });
    assert.equal(pen.total, 75);
    assert.ok(pen.figures.length <= MAX_PREVIEW + 5);
    assert.equal(pen.figures.filter((f) => f.enemyKey === 'boss').length, 1);
    assert.equal(pen.figures.filter((f) => f.enemyKey === 'el').length, 4);
    const n1 = pen.figures.filter((f) => f.enemyKey === 'n1').length, n2 = pen.figures.filter((f) => f.enemyKey === 'n2').length;
    assert.ok(n1 + n2 <= MAX_PREVIEW - 5 + 1e-9, `${n1} + ${n2}`);
    assert.ok(Math.abs(n1 / n2 - 40 / 30) < 0.35, 'ratio kept');
    // an entry never disappears through rounding
    const tiny = thinPreview(penEntries([E('a', 200, 'lower', 1), E('b', 1, 'lower', 2)]));
    assert.ok(tiny.find((p) => p.entry.enemyKey === 'b'), 'a single-enemy action still shows');
    // capacity overflow: a zone whose tiles all hold 3 stacks the rest on its own least-loaded tiles — never in the
    // other gate's zone (research 08 §4.2 step 6 "keep the grouping exact: one zone per gate"), never in row 16
    const big = layoutPen([E('x', 50, 'lower', 1)], { stage });
    assert.equal(big.figures.length, 50);
    for (const f of big.figures) assert.ok(f.row === 14 || f.row === 15, `lower gate only: ${f.row},${f.col}`);
    const perTile = new Map();
    for (const f of big.figures) perTile.set(`${f.row},${f.col}`, (perTile.get(`${f.row},${f.col}`) || 0) + 1);
    assert.equal(perTile.size, 13, 'every lower tile used');
    assert.ok(Math.max(...perTile.values()) <= 4, 'the overflow is spread evenly (≤ 4 per tile for 50 on 13 tiles)');
    const pts = big.figures.map((f) => [f.x, f.y]);
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) > 0.15, 'no exact overlap in a 4-figure cluster');
    const up = layoutPen([E('a', 10, 'lower', 1), E('u', 45, 'upper', 2)], { stage });
    for (const f of up.figures) if (f.enemyKey === 'u') assert.ok(f.row >= 17, `upper-gate overflow stays in rows 17–18: ${f.row}`);
  });

  test('garbage in: ignored entries, empty list, signature follows the content', () => {
    assert.deepEqual(layoutPen(null).figures, []);
    assert.deepEqual(layoutPen([null, 1, { count: 3 }, { enemyKey: '' }]).figures, []);
    assert.equal(penSignature([E('a', 2, 'lower', 1)]), penSignature([E('a', 2, 'lower', 1)]));
    assert.notEqual(penSignature([E('a', 2, 'lower', 1)]), penSignature([E('a', 3, 'lower', 1)]));
    assert.equal(layoutPen([{ enemyKey: 'a', count: 1e9 }]).figures.length, MAX_PREVIEW);
  });
});

describe('Final Assault prep field (board ⇄ boss field)', () => {
  test('matches the sim mapping (finalAssault.bossFieldPlacement) for every board / bench / temp tile, both sides', () => {
    for (const side of ['L', 'R']) {
      const xf = bossPrepField(side);
      for (let r = 7; r <= 12; r++) for (let c = 0; c <= 10; c++) {
        for (const dir of ['UP', 'RIGHT', 'DOWN', 'LEFT']) {
          const want = bossFieldPlacement(side, r, c, dir);
          const got = xf.toDisp(r, c);
          assert.deepEqual([got.row, got.col, xf.dirToDisp(dir)], [want.row, want.col, want.dir], `${side} ${r},${c} ${dir}`);
          assert.equal(xf.dirToBoard(xf.dirToDisp(dir)), dir);
        }
        const d = xf.toDisp(r, c);
        assert.deepEqual(xf.toBoard(d.row, d.col), { row: r, col: c }, 'round trip');
      }
    }
  });

  test('board rows 9–12 land on boss rows 2–5; bench row 7 → 0, temp row 8 → 1; the right side is mirrored', () => {
    const L = bossPrepField('L'), R = bossPrepField('R');
    assert.deepEqual(L.toDisp(9, 2), { row: 2, col: 2 });
    assert.deepEqual(L.toDisp(12, 8), { row: 5, col: 8 });
    assert.deepEqual(R.toDisp(12, 8), { row: 5, col: 12 });
    assert.deepEqual(R.toDisp(7, 0), { row: 0, col: 20 });
    assert.deepEqual(R.toDisp(8, 4), { row: 1, col: 16 });
    assert.equal(R.mirror, true);
    assert.equal(L.mirror, false);
    assert.equal(R.toBoard(3, 5), null, 'the left half is not the right-hand player’s');
    assert.equal(L.toBoard(8, 4), null, 'rows beyond the boss field');
    assert.equal(mirrorDir('RIGHT'), 'LEFT');
    assert.equal(mirrorDir('up'), 'UP');
    assert.deepEqual(tilesToDisp(R, [[9, 2], { row: 10, col: 3 }, null]), [[2, 18], [3, 17]]);
    assert.deepEqual(IDENTITY.toDisp(9, 2), { row: 9, col: 2 });
  });

  test('range tiles past the field: a DOWN range below the bench never lands on the boss rows; an UP range past the top wall is dropped', () => {
    for (const side of ['L', 'R']) {
      const xf = bossPrepField(side);
      const m = (c) => (side === 'R' ? 20 - c : c);
      // a DOWN-facing sniper on board row 9: range rows 8, 7 (bench / temp: filtered by the view), 6 and 5 — on the
      // boss field those are rows −1 / −2 (off the grid), not the boss rows 6 / 5 (the wall and the own top row)
      assert.deepEqual(xf.toDisp(6, 4), { row: -1, col: m(4) });
      assert.deepEqual(tilesToDisp(xf, [[9, 4], [6, 4], [5, 4]]), [[2, m(4)]], side);
      // UP from board row 12: 13 (the wall above the field → boss wall row 6) is kept, 14 / 15 (the pen → the normal
      // board's bench / temp rows 7 / 8 of the boss view) are not
      assert.deepEqual(tilesToDisp(xf, [[12, 7], [13, 7], [14, 7], [15, 7]]), [[5, m(7)], [6, m(7)]], side);
      // a range reaching into the partner's half stays (the boss field is shared in battle)
      assert.deepEqual(tilesToDisp(xf, [[10, 12]]), [[3, m(12)]]);
    }
    assert.deepEqual(tilesToDisp(IDENTITY, [[6, 4], [14, 7]]), [[6, 4], [14, 7]], 'the own board keeps every tile');
  });
});
