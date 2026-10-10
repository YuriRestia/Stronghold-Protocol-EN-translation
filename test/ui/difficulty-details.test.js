// The lobby's difficulty details (public/js/ui/difficultyDetails.js difficultyTable) on the real data/*.json: the numbers
// it shows are the ones the match uses (server/match/gamedata.js baseEnemyScale reads the same enemyScale table).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { difficultyTable, lastWaveRound } from '../../public/js/ui/difficultyDetails.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../../data/${f}.json`, import.meta.url), 'utf8'));
const src = { config: read('config'), bosses: read('bosses') };
const COL = { FUNNY: 0, NORMAL: 1, HARD: 2, ABYSS: 3 };
const rowOf = (tb, key) => tb.rows.find((r) => r.key === key);
const cell = (tb, key, d) => rowOf(tb, key).values[COL[d]];

test('co-op: the enemy multipliers run from round 1 to round 14 (the Leader round\'s escorts included)', () => {
  const tb = difficultyTable('coop', src);
  assert.equal(tb.rangeEnd, 14);
  assert.equal(cell(tb, 'hp', 'HARD'), '×1.20 → ×4.30');
  assert.equal(cell(tb, 'hp', 'ABYSS'), '×1.20 → ×6.69');
  assert.equal(cell(tb, 'atk', 'ABYSS'), '×1.10 → ×2.14');
  assert.match(cell(tb, 'speed', 'ABYSS'), /×1\.15/);
  assert.equal(cell(tb, 'speed', 'HARD'), '×1.00');
});

test('every round: the per-round table is the official one (community chart of 绝境 / 终极 co-op), Hidden Core last', () => {
  const tb = difficultyTable('coop', src);
  const hp = (r, d) => tb.perRound.find((x) => x.round === r).hp[COL[d]];
  const DIRE = ['1.20', '1.44', '1.44', '1.73', '1.73', '1.73', '1.73', '1.73', '2.07', '2.49', '2.99', '2.99', '3.58', '4.30', '4.30'];
  const ULT = ['1.20', '1.44', '1.44', '1.73', '2.07', '2.24', '3.58', '4.30', '4.30', '4.30', '5.16', '6.19', '6.69', '6.69', '6.69'];
  for (let r = 1; r <= 15; r++) {
    assert.equal(hp(r, 'HARD'), `×${DIRE[r - 1]}`, `绝境 R${r}`);
    assert.equal(hp(r, 'ABYSS'), `×${ULT[r - 1]}`, `终极 R${r}`);
  }
  assert.equal(tb.perRound.at(-1).hidden, true);
  assert.equal(tb.perRound.at(-1).hp[COL.FUNNY], '—', '标准 has no Hidden Core');
});

test('solo has its own tables: 终极 Hidden Core ×3.58, 标准 ends at round 9', () => {
  const tb = difficultyTable('solo', src);
  assert.equal(tb.perRound.find((x) => x.hidden).hp[COL.ABYSS], '×3.58');
  assert.match(cell(tb, 'hp', 'FUNNY'), /9/, 'the 9-round mode names its own last round');
  assert.equal(lastWaveRound(src.config.modes.mode_single_funny), 9);
  assert.match(cell(tb, 'hidden', 'ABYSS'), /350/);
  assert.match(difficultyTable('coop', src).rows.find((r) => r.key === 'hidden').values[COL.ABYSS], /1200/);
});

test('Leaders: a range per pool, every Leader listed with its draw chance and its own HP per difficulty', () => {
  const tb = difficultyTable('coop', src);
  assert.match(cell(tb, 'leader', 'ABYSS'), /^3,000,000–4,200,000/);
  assert.match(cell(tb, 'hiddenLeader', 'ABYSS'), /^3,950,000–7,600,000/);
  assert.equal(cell(tb, 'hiddenLeader', 'FUNNY'), '—');
  const finals = tb.leaders.filter((l) => !l.hidden);
  const hidden = tb.leaders.filter((l) => l.hidden);
  assert.equal(finals.length, 7);
  assert.equal(hidden.length, 3);
  for (const pool of [finals, hidden]) assert.ok(Math.abs(pool.reduce((s, l) => s + parseInt(l.chance, 10), 0) - 100) <= 2, 'chances add up to ~100%');
  const armor = finals.find((l) => l.id === 'boss_1');
  assert.deepEqual(armor.hp, ['247,500', '675,000', '1,800,000', '3,600,000']);
  assert.equal(hidden.find((l) => l.id === 'boss_8').hp[COL.FUNNY], '—', 'no Hidden Core on 标准');
});
