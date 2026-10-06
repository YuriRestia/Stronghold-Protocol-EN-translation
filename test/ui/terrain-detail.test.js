// GitHub issue #184 「建议加入对于特殊地形的单击信息提示」: the tap's target (`screens/game.js` tileClick hands over
// `{ kind: 'terrain', terrain }`, resolved from the stage the board on screen is built from) turns into the panel's
// terrain card — and a target that carries no tip resolves to nothing rather than opening an empty card.
// The words / numbers themselves are covered in test/ui/gameLogic.test.js (terrainInfo) and the tap itself reaches them
// in the browser (test/ui/terrain-tip.e2e.test.js); this is the link between the two.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { resolveDetail } = await import('../../public/js/ui/detailPanel.js');
const { terrainInfo } = await import('../../public/js/ui/gameLogic.js');

/** The first (row, col) of `glyph` in a stage of data/stages.json. */
function at(stage, glyph) {
  for (let row = 0; row < stage.rows.length; row++) {
    const col = stage.rows[row].indexOf(glyph);
    if (col >= 0) return { row, col };
  }
  throw new Error(`no ${glyph} in ${stage.id}`);
}

test('a terrain target resolves into the panel card; a tip-less target resolves to nothing', () => {
  const stages = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stages.json'), 'utf8'));
  const st = stages['act1autochess_m04'];
  const p = at(st, 'i');
  const info = terrainInfo(st, p.row, p.col);
  assert.equal(info.name, '活性源石');
  assert.deepEqual(resolveDetail({ kind: 'terrain', terrain: info }, new Map()), { type: 'terrain', terrain: info });
  // the screen never hands a tip-less tile over (terrainInfo returns null there), but a stray target must not throw or
  // open an empty card
  assert.equal(resolveDetail({ kind: 'terrain' }, new Map()), null);
  assert.equal(resolveDetail({ kind: 'terrain', terrain: null }, new Map()), null);
  assert.equal(resolveDetail({ kind: 'terrain', terrain: '活性源石' }, new Map()), null);
  assert.deepEqual(resolveDetail({ kind: 'terrain', terrain: {} }, new Map()), { type: 'terrain', terrain: {} },
    'a well-formed but empty tip still resolves (the screen filtered it before)');
  assert.equal(resolveDetail(null, new Map()), null);
});
