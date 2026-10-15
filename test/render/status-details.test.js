// test/render/status-details.test.js — the time left and the strength of a status icon: server/sim/snapshot.js statusView
// puts b.snap `st` [[id, status, endsAt, duration, value]] beside the unit tuples, render/interp.js carries it per unit and
// render/units.js draws a ring (time left / duration) around the icon and its number (render/style.js statusValueLabel).
// Same-name statuses ("同名效果取最高", Battle._applyValuedStatus) never add up: the icon follows the strongest one in
// force, and a weaker one that outlasts it takes over when it ends.
// Run: node --test test/render/status-details.test.js

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { SnapshotBuffer, normalizeSnapshot } from '../../public/js/render/interp.js';
import { statusValueLabel } from '../../public/js/render/style.js';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

let fake, UnitView;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const wall = () => makeBattle({
  defs: { enemies: { enemy_t_wall: enemyRec({ key: 'enemy_t_wall', hp: 1e9, speed: 0 }) } },
  enemies: [{ key: 'enemy_t_wall', pos: [10, 5] }], content: 'none', autoFinish: false, timeLimit: 60,
});
const rowsOf = (snap, id) => (snap.st || []).filter((r) => r[0] === id).map((r) => r.slice(1));

test('statusView: a weaker 脆弱 waits under a stronger one and takes over the icon when it ends', () => {
  const h = wall();
  h.b.start();
  h.run(0.2);
  const e = h.enemies()[0];
  const t0 = h.b.time;
  h.b.applyStatus(e, 'fragile', { duration: 5, value: 0.3 });
  h.b.applyStatus(e, 'fragile', { duration: 2, value: 0.4 });
  let [row] = rowsOf(h.b.snapshot(), e.id);
  assert.equal(row[0], 'fragile');
  assert.equal(row[3], 0.4, 'the stronger one is in force');
  assert.ok(Math.abs(row[1] - (t0 + 2)) < 0.05, `ends with the stronger one: ${row[1]}`);
  assert.ok(Math.abs(row[2] - 2) < 0.05);
  h.run(2.2);
  [row] = rowsOf(h.b.snapshot(), e.id);
  assert.equal(row[3], 0.3, 'the weaker one resumes');
  assert.ok(Math.abs(row[1] - (t0 + 5)) < 0.05, `until its own end: ${row[1]}`);
  h.run(3);
  assert.deepEqual(rowsOf(h.b.snapshot(), e.id), [], 'gone with the last one');
});

test('statusView: a timed status without a value, 麻痹 stacks, and a status that never ends has no row', () => {
  const h = wall();
  h.b.start();
  h.run(0.2);
  const e = h.enemies()[0];
  h.b.applyStatus(e, 'slow', { duration: 4, value: 0.5 });
  h.b.applyStatus(e, 'bind', { duration: 3 });
  h.b.applyStatus(e, 'sluggish'); // no duration: runs until removed, no value
  const rows = new Map(rowsOf(h.b.snapshot(), e.id).map((r) => [r[0], r]));
  assert.equal(rows.get('slow')[3], 0.5);
  assert.equal(rows.get('bind')[3], null);
  assert.ok(rows.get('bind')[1] > h.b.time);
  assert.equal(rows.has('sluggish'), false);
});

test('normalizeSnapshot keeps well-formed st rows per unit; the buffer samples them from the older snapshot', () => {
  const tuple = (id) => [id, 5, 10, 1000, 1000, 0, 0, 0, 0];
  const n = normalizeSnapshot({ t: 1, units: [tuple(1), tuple(2)], st: [
    [1, 'fragile', 3, 2, 0.4], [1, 'stun', 2.5, 1.5, null], [2, 'sluggish', null, null, null], [3, 'stun', 2, 1, null],
    [1, 'slow', 'x', 2, 0.5], [2, 7, 2, 1, null],
  ] });
  assert.deepEqual(n.st.get(1), [['fragile', 3, 2, 0.4], ['stun', 2.5, 1.5, null], ['slow', null, null, 0.5]]);
  assert.equal(n.st.has(2), false, 'neither an end nor a value');
  assert.equal(n.st.has(3), false, 'not in the snapshot');
  const b = new SnapshotBuffer();
  b.push({ t: 0, units: [tuple(1)], st: [[1, 'fragile', 3, 2, 0.4]] });
  b.push({ t: 1, units: [tuple(1)] });
  assert.deepEqual(b.sample(0).get(1).st, [['fragile', 3, 2, 0.4]]);
  assert.equal(b.sample(1).get(1).st, null);
});

test('statusValueLabel: shares as percent, points as numbers, 麻痹 as stacks', () => {
  assert.equal(statusValueLabel('fragile', 0.3), '30%');
  assert.equal(statusValueLabel('artsFragile', 0.35), '35%');
  assert.equal(statusValueLabel('slow', 0.5), '50%');
  assert.equal(statusValueLabel('aspdDown', -30), '30');
  assert.equal(statusValueLabel('resDown', 20), '20');
  assert.equal(statusValueLabel('palsy', 3), '3');
  assert.equal(statusValueLabel('stun', 1), null);
  assert.equal(statusValueLabel('fragile', null), null);
});

test('the icon gets a ring for the time left and its number; both go when the status does', () => {
  const cam = () => presetCamera('normal', { width: 1280, height: 720 });
  const v = new UnitView(fakeViewCtx(fake.P, { cam }),
    { id: 1, side: 'enemy', kind: 'enemy', defId: 'enemy_x', x: 5, y: 10, maxHp: 1000 });
  const sample = (o = {}) => ({ x: 5, y: 10, hp: 1000, maxHp: 1000, sp: 0, spMax: 0, flags: 0, anim: 0, vx: 0, vy: 0, ...o });
  try {
    v.onStatus('fragile', true);
    v.sync(sample({ st: [['fragile', 4, 4, 0.4]] }), 2);
    v.update(0.02, cam(), 2);
    const i = v.icons.findIndex((ic) => ic.visible);
    assert.ok(i >= 0, 'the 脆弱 icon shows');
    const mark = v.iconMarks[i];
    assert.equal(mark.arc.visible, true);
    assert.equal(mark.track.visible, true);
    assert.equal(mark.label.visible, true);
    assert.equal(mark.text, '40%');
    // 攻击速度降低 draws the 减速 icon too: the icon keeps its own status's number, never a mix of units
    v.onStatus('slow', true);
    v.onStatus('aspdDown', true);
    v.sync(sample({ st: [['aspdDown', 4, 4, -30], ['slow', 4, 4, 0.5]] }), 2);
    v.update(0.02, cam(), 2);
    assert.ok(v.iconMarks.some((m) => m.label.visible && m.text === '50%'), 'slow shows its own 50%');
    v.onStatus('slow', false);
    v.onStatus('aspdDown', false);
    v.sync(sample(), 5);
    v.update(0.02, cam(), 5);
    assert.equal(mark.arc.visible, false);
    assert.equal(mark.label.visible, false);
  } finally { v.destroy(); }
});
