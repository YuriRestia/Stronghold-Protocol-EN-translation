// (fork) The two damage meters' one metric at a time (ui/combatMetricsModel.js): the order, the bar lengths, the number,
// and the rows that used to break the chart: a healer-only row, a zero row, nothing recorded.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { METRICS, rankByMetric, typeAmounts, typesPresent, formatMetric, splitsDamage, statLine,
  rememberedMetric, rememberMetric } from '../../public/js/ui/combatMetricsModel.js';

const row = (key, damage, healing, types = {}) => ({ key, damage, healing, seconds: 10, dps: damage / 10, hps: healing / 10,
  types: { phys: 0, arts: 0, true: 0, elemental: 0, ...types } });
const dealer = row('dealer', 1000, 0, { phys: 750, arts: 250 });
const second = row('second', 250, 0, { arts: 250 });
const healer = row('healer', 0, 400);
const idle = row('idle', 0, 0);
const roster = [idle, healer, second, dealer];

describe('rankByMetric', () => {
  test('sorts by the picked metric and leaves the input alone', () => {
    const before = [...roster];
    assert.deepEqual(rankByMetric(roster, 'damage').rows.map((r) => r.row.key), ['dealer', 'second', 'healer', 'idle']);
    assert.deepEqual(rankByMetric(roster, 'healing').rows.map((r) => r.row.key), ['healer', 'dealer', 'second', 'idle']);
    assert.deepEqual(roster, before);
  });

  test('the top value fills its bar, the others in proportion, a zero row has none', () => {
    const { rows, total } = rankByMetric(roster, 'damage');
    assert.deepEqual(rows.map((r) => r.share), [100, 25, 0, 0]);
    assert.equal(total, 1250);
    assert.deepEqual(rankByMetric(roster, 'dps').rows.map((r) => r.share), [100, 25, 0, 0], 'a rate has the same shape');
    assert.deepEqual(rankByMetric(roster, 'hps').rows.map((r) => r.share), [100, 0, 0, 0]);
  });

  test('nothing to divide by: all rows zero, or no rows', () => {
    assert.deepEqual(rankByMetric([idle], 'healing').rows.map((r) => r.share), [0]);
    assert.deepEqual(rankByMetric([], 'damage'), { rows: [], total: 0 });
    assert.deepEqual(rankByMetric(undefined, 'damage'), { rows: [], total: 0 });
  });

  test('ties keep one order, so a row does not jump between updates', () => {
    const order = (list) => rankByMetric(list, 'healing').rows.map((r) => r.row.key);
    assert.deepEqual(order([second, dealer, idle]), order([idle, dealer, second]));
  });
});

test('a bar splits by damage type in the metric\'s own unit, a healing bar not at all', () => {
  assert.deepEqual(typeAmounts(dealer, 'damage').map((ty) => [ty.id, ty.amount]), [['phys', 750], ['arts', 250]]);
  assert.deepEqual(typeAmounts(dealer, 'dps').map((ty) => [ty.id, ty.amount]), [['phys', 75], ['arts', 25]]);
  assert.deepEqual(typeAmounts(healer, 'damage'), []);
  assert.deepEqual(typeAmounts(dealer, 'healing'), []);
  assert.equal(splitsDamage('dps'), true);
  assert.equal(splitsDamage('hps'), false);
});

test('the legend names only the damage types on screen', () => {
  assert.deepEqual(typesPresent(roster).map((ty) => ty.id), ['phys', 'arts']);
  assert.deepEqual(typesPresent([healer]), []);
});

test('counts stay whole, rates keep one decimal, a missing value reads 0', () => {
  assert.equal(formatMetric(48210.4, 'damage'), '48,210');
  assert.equal(formatMetric(117.04, 'dps'), '117');
  assert.equal(formatMetric(66.55, 'hps'), '66.6');
  assert.equal(formatMetric(undefined, 'healing'), '0');
  assert.equal(formatMetric(undefined, 'dps'), '0');
});

test('the hover text keeps all four numbers', () => {
  const line = statLine(row('x', 1000, 400));
  for (const m of METRICS) assert.ok(line.includes(m.label), `${m.id} in "${line}"`);
  assert.match(line, /1,000/);
  assert.match(line, /40/);
});

test('the choice lasts between mounts, an unknown one falls back to damage', () => {
  assert.equal(rememberedMetric(), 'damage');
  rememberMetric('hps');
  assert.equal(rememberedMetric(), 'hps');
  rememberMetric('nonsense');
  assert.equal(rememberedMetric(), 'damage');
});
