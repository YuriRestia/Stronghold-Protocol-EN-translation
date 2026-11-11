// (fork) b.snap `fxs` on change (shared/fxsDiff.js): the server sends a field's effect rows only when they change, plus
// a full set once a second and to a watcher out of step; the client (net.js) puts the whole set back into every frame.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxsDiff, FxsResolver, FXS_FULL_EVERY, FXS_FIELDS_MAX } from '../../shared/fxsDiff.js';
import { FieldRunner, snapFrame } from '../../server/match/fields.js';
import { makeBattle } from '../helpers/battleHarness.js';
import { LIBRATOR_FX } from '../../server/sim/professions.js';

const frame = (gt, fxs) => ({ t: 'b.snap', fieldId: 'n:p1', gt, units: [], ...(fxs ? { fxs } : {}) });
const sorted = (rows) => [...(rows || [])].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

describe('FxsDiff / FxsResolver', () => {
  test('the first frame is full, an unchanged one carries nothing, a change only the rows that changed', () => {
    const d = new FxsDiff(), B = {};
    const a = [[1, 'zebra_s_2[aura]', null, null], [2, 'zebra_s_2[aura]', 1, null]];
    const f0 = d.frames(B, frame(0, a));
    assert.equal(f0.shared, f0.full);
    assert.deepEqual(f0.full.fxs, a);
    const f1 = d.frames(B, frame(0.1, a));
    assert.equal('fxs' in f1.shared, false);
    assert.equal('fxd' in f1.shared, false);
    assert.deepEqual(f1.full.fxs, a, 'a watcher out of step still gets the whole set');
    const f2 = d.frames(B, frame(0.2, [a[0], [3, 'billro_s_3[mark_effect]', 1, 'part']]));
    assert.deepEqual(f2.shared.fxd, [[[3, 'billro_s_3[mark_effect]', 1, 'part']], [[2, 'zebra_s_2[aura]', 1]]]);
    const f3 = d.frames(B, frame(0.3, []));
    assert.equal('fxs' in f3.full, true);
    assert.deepEqual(f3.full.fxs, [], 'a full frame says "none" with an empty list');
    assert.deepEqual(sorted(f3.shared.fxd[1]), sorted([[1, 'zebra_s_2[aura]', null], [3, 'billro_s_3[mark_effect]', 1]]));
  });

  test(`a full set every ${FXS_FULL_EVERY} frames, and a new battle starts over with one`, () => {
    const d = new FxsDiff(), B = {};
    const a = [[1, 'papyrs_s_1', null, null]];
    const full = [];
    for (let i = 0; i < FXS_FULL_EVERY * 2 + 1; i++) if (Array.isArray(d.frames(B, frame(i / 10, a)).shared.fxs)) full.push(i);
    assert.deepEqual(full, [0, FXS_FULL_EVERY, FXS_FULL_EVERY * 2]);
    d.synced.add('p1');
    assert.ok(Array.isArray(d.frames({}, frame(0, a)).shared.fxs), 'another battle object: full');
    assert.equal(d.synced.size, 0, 'nobody is in step with a new battle');
  });

  test('the resolver rebuilds every frame of a changing sequence; empty sets leave `fxs` out like a raw snapshot', () => {
    const d = new FxsDiff(), r = new FxsResolver(), B = {};
    const seq = [
      [[1, 'a', null, null]],
      [[1, 'a', null, null], [2, 'b', 1, 'x']],
      [[1, 'a', null, null], [2, 'b', 1, 'y']],
      [[2, 'b', 1, 'y'], [2, 'b', 3, 'y']],
      [],
      [],
      [[4, 'c', null, 2]],
    ];
    seq.forEach((rows, i) => {
      const got = r.apply(d.frames(B, frame(i / 10, rows)).shared);
      assert.equal('fxd' in got, false);
      assert.deepEqual(sorted(got.fxs), rows.length ? sorted(rows) : [], `frame ${i}`);
      if (!rows.length) assert.equal('fxs' in got, false);
    });
  });

  test(`the client keeps at most ${FXS_FIELDS_MAX} fields`, () => {
    const r = new FxsResolver();
    for (let i = 0; i < FXS_FIELDS_MAX + 5; i++) r.apply({ t: 'b.snap', fieldId: `f${i}`, gt: 0, fxs: [[1, 'a', null, null]] });
    assert.equal(r.fields.size, FXS_FIELDS_MAX);
    assert.ok(r.fields.has(`f${FXS_FIELDS_MAX + 4}`) && !r.fields.has('f0'));
  });
});

/** A FieldRunner over one stub battle whose rows a test sets, and a match stub that records (and can drop) sends. */
function harness() {
  const battle = { rows: [], time: 0, finished: false, drainEvents: () => [], snapshot() { return { t: this.time, units: [], ...(this.rows.length ? { fxs: this.rows } : {}) }; } };
  const f = { fieldId: 'n:p1', kind: 'normal', players: ['p1'], battle, live: true };
  const sent = [];
  const m = { watchers: ['p1'], drop: new Set(), reportError: (w, e) => { throw e; },
    watchersOf() { return this.watchers; },
    sendTo(pid, msg) { if (this.drop.has(pid)) return false; sent.push([pid, msg]); return true; } };
  const runner = new FieldRunner(m, [f], { onDone() {} });
  const emit = () => { battle.time += 0.1; sent.length = 0; runner._emit(f); return Object.fromEntries(sent.filter(([, s]) => s.t === 'b.snap')); };
  return { battle, f, m, emit };
}

describe('FieldRunner streams fxs on change', () => {
  test('a late watcher gets the whole set on its first frame, then the changes', () => {
    const h = harness();
    h.battle.rows = [[1, 'zebra_s_2[aura]', null, null]];
    h.emit();
    h.emit();
    h.m.watchers = ['p1', 'p2'];
    h.battle.rows = [[1, 'zebra_s_2[aura]', null, null], [2, 'zebra_s_2[aura]', 1, null]];
    let got = h.emit();
    assert.deepEqual(got.p2.fxs, h.battle.rows, 'the late watcher: full');
    assert.deepEqual(got.p1.fxd, [[[2, 'zebra_s_2[aura]', 1, null]], []], 'the one in step: the change');
    got = h.emit();
    assert.equal('fxs' in got.p2 || 'fxd' in got.p2, false, 'then nothing while nothing changes');
  });

  test('a dropped frame puts that watcher out of step: its next delivered frame is full', () => {
    const h = harness();
    h.m.watchers = ['p1', 'p2'];
    h.battle.rows = [[1, 'a', null, null]];
    h.emit();
    h.m.drop.add('p2');
    h.battle.rows = [[1, 'a', null, null], [2, 'b', null, null]];
    assert.equal(h.emit().p2, undefined, 'dropped');
    h.m.drop.clear();
    const got = h.emit();
    assert.deepEqual(got.p2.fxs, h.battle.rows, 'the change it missed comes with the whole set');
    assert.equal('fxs' in got.p1 || 'fxd' in got.p1, false, 'p1 stays on changes');
  });

  test('a field nobody watches keeps nobody in step; the watch frame (watch.js) carries a whole set', () => {
    const h = harness();
    h.battle.rows = [[1, 'a', null, null]];
    h.emit();
    h.m.watchers = [];
    h.emit();
    h.m.watchers = ['p1'];
    assert.deepEqual(h.emit().p1.fxs, h.battle.rows);
    h.battle.rows = [];
    const s = snapFrame('n:p1', h.battle.snapshot());
    assert.deepEqual({ ...s, fxs: s.fxs || [] }.fxs, [], 'what _sendField sends: an empty set is said, not left out');
  });

  test('a librator\'s ramp stage change travels as a changed row, and the client shows the new stage', () => {
    const buff = LIBRATOR_FX.char_1043_leizi2;
    const h = makeBattle({ autoFinish: false, flags: { dpPerSec: 0, dpMax: 999 },
      units: [{ uid: 1, diy: { slot: 'chess_char_6_diy1_a', charId: 'char_1043_leizi2', skillIndex: 0 }, elite: true, row: 10, col: 5 }] });
    h.step();
    const u = h.unit(1);
    const d = new FxsDiff(), r = new FxsResolver();
    const send = () => { const s = d.frames(h.b, snapFrame('n:p1', h.b.snapshot())).shared; return { s, got: r.apply(s) }; };
    const rowOf = (fxs) => (fxs || []).find((x) => x[0] === u.id && x[1] === buff);
    u.trait.ramp = 0.4;
    assert.equal(rowOf(send().got.fxs)?.[3], 'low');
    u.trait.ramp = 1.2;
    const { s, got } = send();
    assert.deepEqual(s.fxd, [[[u.id, buff, null, 'mid']], []], 'only the stage that changed is sent');
    assert.equal(rowOf(got.fxs)?.[3], 'mid');
    assert.equal(rowOf(send().got.fxs)?.[3], 'mid', 'kept while nothing changes');
    u.trait.ramp = 2;
    assert.equal(rowOf(send().got.fxs)?.[3], 'max');
  });
});

test('the browser Net puts the whole fxs set back into every b.snap, and forgets it on a room change', async () => {
  const { Net } = await import('../../public/js/net.js');
  const net = new Net(), got = [];
  net.on('b.snap', (m) => got.push(m));
  const message = (m) => net._onMessage(JSON.stringify(m));
  message({ t: 'room.state', code: 'AAAA' });
  message({ t: 'b.snap', fieldId: 'u', gt: 1, units: [], fxs: [[1, 'a', null, null]] });
  message({ t: 'b.snap', fieldId: 'u', gt: 1.1, units: [] });
  message({ t: 'b.snap', fieldId: 'u', gt: 1.2, units: [], fxd: [[[2, 'b', 1, 'x']], [[1, 'a', null]]] });
  assert.deepEqual(got.map((m) => m.fxs), [[[1, 'a', null, null]], [[1, 'a', null, null]], [[2, 'b', 1, 'x']]]);
  assert.equal(got.some((m) => 'fxd' in m), false);
  message({ t: 'room.state', code: 'BBBB' });
  assert.equal(net._fxs.fields.size, 0);
});
