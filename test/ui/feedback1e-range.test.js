// Community report after 0.1.0 (batch 5, E1): "干员烛煌开启3技能时候攻击范围不会变". The sim attacked with S3's 4-11
// (test/sim/feedback1e-skillrange.test.js); the battle detail card did not — its 攻击范围 mini-map kept the base 3-1 grid
// while the live stats beside it showed S3's ATK and interval. The card now draws the live entry's `range`
// (shared/protocol.js unitStatsEntry: the grid the unit attacks with now) — in battle from the browser's own sim, in prep
// from the start-of-battle preview — names a whole-field range instead of drawing it, and draws a grid larger than its
// box (远牙 S3's 21-tile line) with smaller cells so the box keeps its size (review: the line squeezed the live stats
// from 326 px to 80 px).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeBattle, enemyRec, castNow } from '../helpers/battleHarness.js';
import { unitStatsEntry } from '../../shared/protocol.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// the browser data store reads the real data files from disk (the card renders below)
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const { ChessDetail, RangeGrid, cardRangeGrid, rangeGridStyle, FIELD_WIDE_CELLS, RANGE_FIT } = await import('../../public/js/ui/detailPanel.js');
const { rangeGridBox } = await import('../../public/js/ui/gameLogic.js');
const { data } = await import('../../public/js/data.js');

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  if (typeof v.type === 'function' && v.type.name === 'RangeGrid') { yield* walk(v.type(v.props)); return; }
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const onCells = (tree) => [...walk(tree)].filter((n) => n.type === 'i' && hasClass(n, 'on')).length;
const BLAZE = 'chess_char_5_03_a';

/** 烛煌's live entry from a real battle: before / during her S3. */
function blazeLive() {
  const h = makeBattle({
    defs: { enemies: { enemy_a: enemyRec({ key: 'enemy_a', hp: 1e7, speed: 0 }) } },
    units: [{ chessId: BLAZE, row: 10, col: 3, dir: 'RIGHT', skillIndex: 2 }], enemies: [{ key: 'enemy_a', pos: [10, 4] }],
    autoFinish: false, timeLimit: 60,
  });
  const u = h.unit(BLAZE);
  h.step();
  const before = { ...unitStatsEntry(u, u._s), src: 'battle' };
  u.skill.gainSp(1000);
  h.runUntil(() => u.skill.active, 5);
  const during = { ...unitStatsEntry(u, u._s), src: 'battle' };
  return { before, during };
}

test('the battle card\'s 攻击范围 follows 烛煌 S3: 10 tiles (3-1) before, 13 (4-11) while it runs', async () => {
  await data.loadAll('chess', 'garrisons', 'assets', 'bonds', 'items');
  const c = data.lookup('chess', BLAZE);
  const { before, during } = blazeLive();
  assert.equal(before.range.length, 10);
  assert.equal(during.range.length, 13);
  const stats = (live) => ChessDetail({ chess: c, piece: null, editable: false, bonds: [], loadout: null, live }).find((b) => b.key === 'stats');
  assert.equal(onCells(stats(before)), 10, 'the base range');
  assert.equal(onCells(stats(during)), 13, 'the S3 range on the card');
  assert.equal(onCells(stats(null)), 10, 'no live entry: the record\'s attack range');
});

test('cardRangeGrid: the live range first, else the loadout record\'s attack range; a whole-field range is named, not drawn', async () => {
  await data.loadAll('chess');
  const c = data.lookup('chess', BLAZE);
  assert.deepEqual(cardRangeGrid({ range: [[0, 0], [0, 1]] }, c, c), [[0, 0], [0, 1]]);
  assert.equal(cardRangeGrid({ range: [] }, c, c), c.rangeGrid, 'an empty live range is ignored');
  assert.equal(cardRangeGrid(null, c, c), c.rangeGrid);
  assert.equal(cardRangeGrid({ atk: 1 }, null, c), c.rangeGrid, 'an entry without range (an older server): the record');
  const whole = [];
  for (let dr = -18; dr <= 18; dr++) for (let dc = -20; dc <= 20; dc++) whole.push([dr, dc]);
  assert.ok(whole.length >= FIELD_WIDE_CELLS);
  const v = RangeGrid({ grid: whole });
  assert.ok(hasClass(v, 'rgrid-all'));
  assert.equal(v.props.children, '全场');
  assert.ok(!hasClass(RangeGrid({ grid: c.rangeGrid }), 'rgrid-all'));
});

test('a whole-field skill (纯烬艾雅法拉 S3 "攻击范围扩大至整个战场") reaches the card as such', async () => {
  await data.loadAll('chess', 'garrisons', 'assets', 'bonds', 'items');
  const id = 'chess_char_6_20_a';
  const h = makeBattle({ units: [{ chessId: id, row: 10, col: 5, dir: 'RIGHT', skillIndex: 2 }], autoFinish: false, timeLimit: 30 });
  const u = h.unit(id);
  h.step();
  assert.ok(castNow(u, 'test', { free: true }));
  h.step();
  const live = { ...unitStatsEntry(u, u._s), src: 'battle' };
  assert.ok(live.range.length >= FIELD_WIDE_CELLS);
  const stats = ChessDetail({ chess: data.lookup('chess', id), piece: null, editable: false, bonds: [], loadout: null, live }).find((b) => b.key === 'stats');
  assert.ok([...walk(stats)].some((n) => hasClass(n, 'rgrid-all')), '全场');
});

test('the game screen hands the card the live entry it already reads (battle runner / m.unitStats)', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/ui/detailPanel.js'), 'utf8');
  // (the stats block moved into the shared chessStatsBlock — also the 干员调配 screen's 局内数值, GitHub issue #64)
  assert.match(src, /grid=\$\{cardRangeGrid\(live, rec, chess\)\}/);
  assert.match(src, /blocks\.stats = chessStatsBlock\(\{ rec: fr, chess: c, live \}\)/, 'the card draws it through the shared block');
  const game = readFileSync(path.join(ROOT, 'public/js/screens/game.js'), 'utf8');
  assert.match(game, /battleRunner\.unitStats\(uid, fid\)/);
});

test('远牙 S3 光羽箭 (default, "攻击范围改为前方无限长的直线"): the 21-tile line is drawn whole, in the box\'s own space', async () => {
  await data.loadAll('chess', 'garrisons', 'assets', 'bonds', 'items');
  const id = 'chess_char_4_20_a';
  const h = makeBattle({ units: [{ chessId: id, row: 10, col: 0, dir: 'RIGHT', skillIndex: 2 }], autoFinish: false, timeLimit: 30 });
  const u = h.unit(id);
  h.step();
  assert.ok(castNow(u, 'test', { free: true }));
  h.step();
  const live = { ...unitStatsEntry(u, u._s), src: 'battle' };
  const box = rangeGridBox(live.range);
  assert.equal(box.cols, 21);
  assert.equal(box.rows, 1);
  const stats = ChessDetail({ chess: data.lookup('chess', id), piece: null, editable: false, bonds: [], loadout: null, live }).find((b) => b.key === 'stats');
  const grid = [...walk(stats)].find((n) => hasClass(n, 'rgrid'));
  assert.ok(grid, 'drawn, not named');
  assert.equal(onCells(stats), 21, 'the whole line, her own tile included');
  assert.match(grid.props.style, /--rg:max\(1px, min\(\.14rem, calc\(\(6 \* \.14rem \+ 10px\) \/ 21\)/, 'cells shrunk to the 6-column width');
  assert.match(grid.props.style, /gap:0/);
});

test('rangeGridStyle: the attack ranges of the records keep the .14rem cells; only a grid beyond RANGE_FIT (6 columns, 7 rows) shrinks them', async () => {
  await data.loadAll('chess');
  const plain = (b) => rangeGridStyle(b) === `grid-template-columns:repeat(${b.cols}, var(--rg))`;
  assert.deepEqual(RANGE_FIT, { cols: 6, rows: 7 });
  // every attack range a record gives the card (the unit's own, a module's) — the widest 灰毫 / 协律 / 阿罗玛 (6 columns)
  let n = 0;
  for (const c of data.list('chess')) {
    const grids = [c.rangeGrid, ...(c.modules || []).flatMap((m) => (m.talentChanges || []).map((t) => t.rangeGrid))];
    for (const g of grids) if (Array.isArray(g) && g.length) { n++; assert.ok(plain(rangeGridBox(g)), `${c.name}: ${rangeGridBox(g).cols} cols`); }
  }
  assert.ok(n > 250, `record grids (${n})`);
  // the tallest live skill range (银灰 S3 真银斩 3-7: 7 rows × 4 columns) too
  assert.ok(plain(rangeGridBox(data.lookup('chess', 'chess_char_4_22_a').skills[2].rangeGrid)), '银灰 S3');
  assert.ok(!plain({ cols: 7, rows: 1 }) && !plain({ cols: 1, rows: 8 }));
  assert.match(rangeGridStyle({ cols: 3, rows: 9 }), /calc\(\(7 \* \.14rem \+ 12px\) \/ 9\)/, 'a tall grid fits the 7 rows');
});

test('prep: the record\'s attack range (card without a live entry, board overlay, deploy wheel) = the unit\'s range at deployment — every loadout', async () => {
  // review of round 2: the prep card drew the live entry (信仰搅拌机 SPT-Y "攻击距离+1", 引星棘刺 S3 "被动效果：攻击范围扩大")
  // while the board overlay and the deploy wheel of the same unit drew the record's grid without them
  const { getDefaultSource } = await import('../../server/sim/simdata.js');
  const { resolveRecordLoadout, loadoutRecord, attackRangeGrid, traitRangeExtend } = await import('../../shared/loadoutRecord.js');
  const { previewGrid } = await import('../../public/js/ui/facing.js');
  const C = getDefaultSource().raw.chess;
  const key = (g) => (g || []).map(([r, c]) => `${r},${c}`).sort().join(' ');
  let runs = 0;
  const wider = new Set();
  for (const c of Object.values(C)) {
    if (!(c.visible || (c.isGolden && C[c.baseId]?.visible))) continue;
    const skills = (c.skills || []).length ? c.skills.map((s) => s.index) : [null];
    const mods = [null, ...(Array.isArray(c.modules) && c.modules.length ? ['none', ...c.modules.map((m) => m.uniEquipId)] : [])];
    for (const si of skills) for (const mid of mods) {
      const lo = { ...(si != null ? { skillIndex: si } : {}), ...(mid ? { moduleId: mid } : {}) };
      const rec = loadoutRecord(c, resolveRecordLoadout(c, lo));
      const h = makeBattle({ units: [{ chessId: c.chessId, row: 10, col: 5, dir: 'RIGHT', ...lo }], autoFinish: false, timeLimit: 5 });
      h.step();
      const u = h.unit(c.chessId);
      const live = key(unitStatsEntry(u, u._s).range);
      const tag = `${c.chessId} ${c.name} S${si == null ? '-' : si + 1} ${mid ?? 'default'}`;
      assert.equal(key(attackRangeGrid(rec)), live, `${tag}: record range = range at deployment`);
      const wheel = previewGrid({ getChess: (id) => C[id] || null, chessRecord: (r) => loadoutRecord(r, resolveRecordLoadout(r, lo)) }, { kind: 'chess', id: c.chessId });
      assert.equal(key(wheel), live, `${tag}: overlay / wheel = range at deployment`);
      if (traitRangeExtend(rec) || /被动效果：攻击范围扩大/.test(rec.skill?.desc ?? '')) { assert.notEqual(live, key(rec.rangeGrid), tag); wider.add(c.name); }
      runs++;
    }
  }
  assert.ok(runs > 1000, `loadouts (${runs})`);
  assert.deepEqual([...wider].sort(), ['信仰搅拌机', '引星棘刺'].sort(), 'the permanent 攻击距离 (SPT-Y) and the passive range skill (S3) of the mode');
  // 空弦 ISW-A "在集成战略中，…攻击距离+1": none in this mode
  const arch = C.chess_char_3_21_b;
  const isw = loadoutRecord(arch, resolveRecordLoadout(arch, { moduleId: 'uniequip_004_archet' }));
  assert.equal(isw.trait.bb.ability_range_forward_extend, 1);
  assert.equal(traitRangeExtend(isw), 0);
  assert.equal(key(attackRangeGrid(isw)), key(arch.rangeGrid));
  // the two by hand: SPT-Y 2-2 + 1 (every skill — S3's 3-13 replaces it only while it runs); 引星棘刺 S3 3-9
  const rmx = C.chess_char_4_01_b;
  for (const skillIndex of [0, 1, 2]) {
    assert.equal(attackRangeGrid(loadoutRecord(rmx, resolveRecordLoadout(rmx, { skillIndex, moduleId: 'uniequip_003_rmixer' }))).length, rmx.rangeGrid.length + 1);
    assert.equal(key(attackRangeGrid(loadoutRecord(rmx, resolveRecordLoadout(rmx, { skillIndex, moduleId: 'uniequip_002_rmixer' })))), key(rmx.rangeGrid));
  }
  const thorn = C.chess_char_5_15_a;
  assert.equal(key(attackRangeGrid(loadoutRecord(thorn, resolveRecordLoadout(thorn, { skillIndex: 2 })))), key(thorn.skills[2].rangeGrid));
  assert.equal(key(attackRangeGrid(loadoutRecord(thorn, resolveRecordLoadout(thorn, { skillIndex: 0 })))), key(thorn.rangeGrid));
});
