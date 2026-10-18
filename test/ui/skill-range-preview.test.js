// test/ui/skill-range-preview.test.js (fork) — the detail card's 技能 toggle: the attack range while the skill runs.
//   The record preview (shared/loadoutRecord.js skillAttackRangeGrid, from build-data's skill.activeRange /
//   activeExtend), the sim's own (unitStatsEntry `skillRange`, Battle._refreshRange skillRangeGrid) and the field
//   overlay (screens/game/range.js inspectRange `skill`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveRecordLoadout, loadoutRecord, attackRangeGrid, skillAttackRangeGrid, extendedGrid } from '../../shared/loadoutRecord.js';
import { unitStatsEntry } from '../../shared/protocol.js';
import { inspectRange } from '../../public/js/screens/game/range.js';
import { skillRangeGrid } from '../../public/js/ui/rangePreview.js';
import { makeBattle } from '../helpers/battleHarness.js';

const chess = JSON.parse(readFileSync(new URL('../../data/chess.json', import.meta.url), 'utf8'));
const getChess = (id) => chess[id];
const BLAZE = 'chess_char_5_03_a', SILENCE = 'chess_char_3_21_a', LAPPLAND = 'chess_char_6_18_a', FANG = 'chess_char_4_20_a';
const recAt = (id, skillIndex) => loadoutRecord(chess[id], resolveRecordLoadout(chess[id], { skillIndex }));
const cells = (g) => (g ? g.map(([r, c]) => `${r},${c}`).sort().join(' ') : null);
const unitAt = (id, skillIndex) => {
  const h = makeBattle({ units: [{ chessId: id, row: 10, col: 3, dir: 'RIGHT', skillIndex }], enemies: [], autoFinish: false, timeLimit: 5 });
  h.step();
  return { h, u: h.b.allyUnits.find((x) => x.kind === 'op') };
};

test('record: 烛煌 S3 previews its 4-11 grid, 空弦 S3 her range +1, a skill without a range change nothing', () => {
  const blaze = chess[BLAZE].skills.find((s) => s.index === 2);
  assert.equal(blaze.activeRange, true);
  assert.equal(cells(skillAttackRangeGrid(recAt(BLAZE, 2))), cells(blaze.rangeGrid));
  const s3 = chess[SILENCE].skills.find((s) => s.index === 2);
  assert.equal(s3.activeExtend, 1);
  assert.equal(cells(skillAttackRangeGrid(recAt(SILENCE, 2))), cells(extendedGrid(attackRangeGrid(recAt(SILENCE, 2)), 1)));
  assert.equal(skillAttackRangeGrid(recAt(SILENCE, 0)), null);
  assert.equal(skillAttackRangeGrid(null), null);
});

test('sim: the battle entry carries the running range before the skill runs, and none for a target-only grid', () => {
  const { u } = unitAt(BLAZE, 2);
  assert.equal(u.skill.active, false);
  const e = unitStatsEntry(u, u.s);
  assert.equal(cells(e.skillRange), cells(chess[BLAZE].skills[2].rangeGrid));
  assert.equal(cells(e.range), cells(chess[BLAZE].rangeGrid), 'the range now stays the base one');
  // 荒芜拉普兰德 S1: a whole-field grid that only selects targets (showOwnRange) — the card keeps her own range
  const lap = unitAt(LAPPLAND, 0).u;
  assert.equal(unitStatsEntry(lap, lap.s).skillRange, undefined);
});

test('sim: a kit-only range (远牙 S3 "前方无限长的直线", no rangeId) reaches the live entry the record cannot know', () => {
  assert.equal(skillAttackRangeGrid(recAt(FANG, 2)), null);
  const { u } = unitAt(FANG, 2);
  const live = unitStatsEntry(u, u.s);
  assert.ok(live.skillRange?.length > chess[FANG].rangeGrid.length);
  assert.equal(skillRangeGrid(live, recAt(FANG, 2)), live.skillRange, 'the live entry wins');
  assert.equal(skillRangeGrid({ range: live.range }, recAt(BLAZE, 2)), null, 'a live entry without skillRange: no toggle');
  assert.equal(cells(skillRangeGrid(null, recAt(BLAZE, 2))), cells(chess[BLAZE].skills[2].rangeGrid), 'no live entry: the record');
});

test('overlay: the field range follows the 技能 button for an operator card, never for a summon', () => {
  const piece = { uid: 7, kind: 'chess', id: BLAZE, row: 4, col: 2, dir: 'RIGHT' };
  const pieces = new Map([[7, { piece, area: 'board', row: 4, col: 2 }]]);
  const base = { target: { kind: 'piece', uid: 7 }, detail: { type: 'chess', chess: chess[BLAZE] }, pieces, showPrep: true, field: { prep: true },
    loadout: { [chess[BLAZE].baseId || BLAZE]: { skill: 2 } }, getChess };
  assert.equal(cells(inspectRange(base).grid), cells(chess[BLAZE].rangeGrid));
  assert.equal(cells(inspectRange({ ...base, skill: true }).grid), cells(chess[BLAZE].skills[2].rangeGrid));
  // a skill that keeps the range: the toggle changes nothing
  const s1 = { ...base, loadout: { [chess[BLAZE].baseId || BLAZE]: { skill: 0 } } };
  assert.equal(cells(inspectRange({ ...s1, skill: true }).grid), cells(inspectRange(s1).grid));
});
