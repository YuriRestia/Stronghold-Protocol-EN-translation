// PHASE.PREP double-click on a teammate avatar opens their field (GitHub #131, PR #374).
// 「前往查看」 stays. Two guards: a teammate with no field is not forced open, and a click while that
// teammate is already on screen does not open the view again (a double-click fires click first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE } from '../../shared/constants.js';
import { prepDblClickWatches, teammateClickWatches, teammateFieldShown } from '../../public/js/ui/teamPanel.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = readFileSync(path.join(ROOT, 'public/js/ui/teamPanel.js'), 'utf8');

const mate = { playerId: 'p_1', fieldId: 'f1', name: '队友' };
const observeOf = (fieldId) => ({ canObserve: () => (fieldId ? { fieldId } : { reason: '该队友当前没有战场' }) });

test('a prep double-click watches once when the teammate has a field and is not already on screen', () => {
  const o = { phase: PHASE.PREP, self: false, observe: observeOf('n:p_1'), watching: null, player: mate };
  assert.equal(prepDblClickWatches(o), true);
  assert.equal(prepDblClickWatches({ ...o, watching: 'n:p_1' }), false, 'already the prep scout');
  assert.equal(prepDblClickWatches({ ...o, watching: 'f1' }), false, 'already their live field');
  assert.equal(prepDblClickWatches({ ...o, askedRecently: true }), false, 'the click of this double-click already opened it');
});

test('no field: the double-click does not watch; the single click still toasts through onWatch', () => {
  const o = { phase: PHASE.PREP, self: false, observe: observeOf(null), watching: null, player: mate };
  assert.equal(prepDblClickWatches(o), false);
  assert.equal(prepDblClickWatches({ ...o, observe: { canObserve: () => null } }), false);
  assert.equal(prepDblClickWatches({ ...o, observe: {} }), false);
});

test('outside PREP, on your own row, or without client-combat observe, a double-click does not watch', () => {
  const base = { phase: PHASE.PREP, self: false, observe: observeOf('n:p_1'), watching: null, player: mate };
  assert.equal(prepDblClickWatches({ ...base, phase: PHASE.COMBAT }), false);
  assert.equal(prepDblClickWatches({ ...base, phase: PHASE.FINAL_ASSAULT }), false, '最终攻势 prep is not PHASE.PREP');
  assert.equal(prepDblClickWatches({ ...base, phase: PHASE.HIDDEN_CORE }), false, '隐秘核心 prep is not PHASE.PREP');
  assert.equal(prepDblClickWatches({ ...base, self: true }), false);
  assert.equal(prepDblClickWatches({ ...base, observe: null }), false, 'the click already watches in server-run combat');
  assert.equal(prepDblClickWatches({ ...base, player: null }), false);
});

test('a single click while already watching that teammate does not open the view again', () => {
  assert.equal(teammateClickWatches({ watching: null, player: mate }), true, 'server-run combat: the first click watches');
  assert.equal(teammateClickWatches({ watching: 'f1', player: mate }), false);
  assert.equal(teammateClickWatches({ watching: 'n:p_1', player: mate }), false);
  assert.equal(teammateClickWatches({ watching: 'other', player: mate }), true);
  assert.equal(teammateClickWatches({ watching: null, player: mate, askedRecently: true }), false, 'the other click of a double-click');
  assert.equal(teammateClickWatches({ observe: observeOf('n:p_1'), watching: null, player: mate }), false, 'client combat opens 「前往查看」, it does not watch on click');
  assert.equal(teammateFieldShown('n:p_1', mate), true);
  assert.equal(teammateFieldShown(null, mate), false);
});

test('the panel wires both guards and keeps 「前往查看」', () => {
  assert.ok(SRC.includes('onDblClick=${(e) => dblClick(e, p, self)}'));
  assert.ok(SRC.includes('prepDblClickWatches('));
  assert.ok(SRC.includes('teammateClickWatches('));
  assert.ok(SRC.includes("${t('前往查看')}"));
});
