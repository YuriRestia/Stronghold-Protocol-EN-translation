// S.W.E.E.P.报告 → 干员调配 (fork): an operator of 对应干员 opens the loadout at its row, and the loadout's 返回 / Esc
// brings the report back where it was left.
//   - loadoutSlotOf: the member's own loadout row, or its operator's (a golden form → the base); null when the loadout
//     lists no such operator (the report then draws a plain picture); every bond member of the shipped data has a row
//   - openLoadout's onBack runs once, on 返回 / Esc only (backFromLoadout): a plain close (a match starting) or the next
//     plain open drops it; reveal asks the screen to bring the operator into view
//   - source contracts: the report's members are buttons only with a row, the report reopens with what it kept, the
//     loadout's 返回 and Esc go through backFromLoadout and the screen clears the filters that hide a revealed operator

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const CHESS = Object.values(JSON.parse(read('data/chess.json')));
const BONDS = Object.values(JSON.parse(read('data/bonds.json')));

const { loadoutSlotOf } = await import('../../public/js/screens/sweep.js');
const { loadoutStore, openLoadout, closeLoadout, backFromLoadout } = await import('../../public/js/ui/loadoutSync.js');
const { isLoadoutSlot } = await import('../../public/js/ui/loadoutModel.js');

test('loadoutSlotOf: a loadout row is itself, a golden form goes to its base row, an unlisted operator to null', () => {
  const base = CHESS.find((c) => isLoadoutSlot(c) && c.goldenId);
  const golden = CHESS.find((c) => c.chessId === base.goldenId);
  assert.ok(golden?.isGolden, 'the shipped data has a golden form');
  assert.equal(loadoutSlotOf(base, CHESS), base.chessId);
  assert.equal(loadoutSlotOf(golden, CHESS), base.chessId);
  assert.equal(loadoutSlotOf({ chessId: 'x', charId: 'char_none', isHidden: true }, CHESS), null);
  assert.equal(loadoutSlotOf({ chessId: 'x', isGolden: true }, CHESS), null, 'no charId, no row');
  assert.equal(loadoutSlotOf(null, CHESS), null);
});

test('every bond member the report shows opens a loadout row (shipped data)', () => {
  const byId = new Map(CHESS.map((c) => [c.chessId, c]));
  let n = 0;
  for (const b of BONDS) {
    if (!b?.bondId) continue;
    const ids = Array.isArray(b.visibleMembers) && b.visibleMembers.length ? b.visibleMembers : (b.members || []);
    for (const id of ids) {
      const c = byId.get(id);
      if (!c) continue;
      n++;
      assert.ok(loadoutSlotOf(c, CHESS), `${b.bondId}: ${id}`);
    }
  }
  assert.ok(n > 50, `members checked: ${n}`);
});

test('openLoadout onBack: once on 返回 / Esc, never on a plain close or after a plain open; reveal names the row', () => {
  const calls = [];
  const id = CHESS.find(isLoadoutSlot).chessId;
  openLoadout('lobby', id, 'loadout', { reveal: true, backLabel: 'S.W.E.E.P.报告', onBack: () => calls.push('back') });
  let s = loadoutStore.get();
  assert.equal(s.open, true);
  assert.equal(s.sel, id);
  assert.equal(s.tab, 'loadout');
  assert.equal(s.reveal, id);
  assert.equal(s.backLabel, 'S.W.E.E.P.报告');
  backFromLoadout();
  assert.deepEqual(calls, ['back']);
  s = loadoutStore.get();
  assert.equal(s.open, false);
  assert.equal(s.backLabel, null);
  assert.equal(s.reveal, null);
  backFromLoadout();
  assert.deepEqual(calls, ['back'], 'once');

  // a plain close (the match took over) drops it
  openLoadout('lobby', id, 'loadout', { onBack: () => calls.push('back2') });
  closeLoadout();
  backFromLoadout();
  assert.deepEqual(calls, ['back']);

  // the next plain open (the lobby's button) has no way back but the screen below
  openLoadout('lobby', id, 'loadout', { onBack: () => calls.push('back3') });
  closeLoadout();
  openLoadout('lobby');
  assert.equal(loadoutStore.get().backLabel, null);
  assert.equal(loadoutStore.get().reveal, null);
  backFromLoadout();
  assert.deepEqual(calls, ['back']);

  // a backLabel without onBack is not shown
  openLoadout('lobby', null, null, { backLabel: 'S.W.E.E.P.报告' });
  assert.equal(loadoutStore.get().backLabel, null);
  closeLoadout();
});

test('source contracts: report members link only with a row, the report restores itself, the loadout goes back', () => {
  const sweep = read('public/js/screens/sweep.js');
  assert.match(sweep, /const slot = onOperator \? loadoutSlotOf\(c, data\.list\('chess'\)\) : null;/);
  assert.match(sweep, /const Tag = slot \? 'button' : 'span';/);
  assert.match(sweep, /openLoadout\('lobby', slotId, 'loadout', \{ reveal: true, backLabel: N_\('S\.W\.E\.E\.P\.报告'\), onBack: \(\) => onReopen\(snap\) \}\)/);
  assert.match(sweep, /useState\(restore\?\.bondSel \?\? null\)/);
  const lobby = read('public/js/screens/lobby.js');
  assert.match(lobby, /<\$\{SweepReport\} restore=\$\{sweep\.restore\} onClose=\$\{\(\) => setSweep\(null\)\} onReopen=\$\{\(restore\) => setSweep\(\{ restore \}\)\} \/>/);
  const lo = read('public/js/screens/loadout.js');
  assert.match(lo, /class="lo-back" onClick=\$\{backFromLoadout\}/);
  assert.match(lo, /backFromLoadout\(\); return;/, 'Esc goes back too');
  assert.doesNotMatch(lo, /onClick=\$\{closeLoadout\}/);
  assert.match(lo, /if \(!list\.some\(\(c\) => c\.chessId === id\)\) clearFilters\(\);/);
  const css = read('public/css/screens/sweep.css');
  assert.match(css, /button\.sw-op \{[^}]*cursor: pointer;/);
  assert.match(css, /\.sw-op\.is-link:hover/);
});
