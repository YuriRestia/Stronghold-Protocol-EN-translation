// 外勤医疗: the official preparation field already shows 预备干员-医疗; Touch replaces it at battle start.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';

const MEDIC = 'char_605_cmedic';
const STAGE = 'act2autochess_m01';

test('外勤医疗 shows the reserve medic on every prep board and in prep scouting, without adding a movable piece', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 6301, fake: true }).start().toPrep();
  h.setStage(STAGE);
  const [holder, teammate] = [h.ps('p_0'), h.ps('p_1')];
  assert.deepEqual(holder.privateView().prepMapChars, [], 'no medic without the strategy');
  holder.bandId = 'band_amedic';
  for (const ps of [holder, teammate]) {
    const priv = ps.privateView();
    assert.equal(priv.prepMapChars.length, 1);
    const medic = priv.prepMapChars[0];
    assert.deepEqual([medic.defId, medic.kind, medic.x, medic.y, medic.dir, medic.ownerId],
      [MEDIC, 'token', 2, 10, 'RIGHT', ps.playerId]);
    assert.ok(medic.uid < 0 && !priv.board.some((p) => p.uid === medic.uid), 'display only: no board piece to move or sell');
    assert.equal(h.m.prepFieldMeta(ps).units.find((u) => u.uid === medic.uid)?.defId, MEDIC);
  }
  holder.bandId = null;
  assert.deepEqual(teammate.privateView().prepMapChars, [], 'the preview goes away when nobody holds the strategy');
  h.m.dispose();
});

test('外勤医疗 boss preparation shows both reserve medics on their matching halves, mirrored for the right player', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 6302, fake: true }).start().toPrep();
  h.setStage(STAGE);
  const m = h.m;
  m.bossWaves = [{ players: ['p_0', 'p_1'], wave: { spawns: [] } }];
  h.ps('p_0').bandId = 'band_amedic';
  const [left, right] = [h.ps('p_0'), h.ps('p_1')];
  const own = left.privateView().prepMapChars[0];
  const mate = left.privateView().bossMate.units.find((u) => u.defId === MEDIC);
  assert.deepEqual([own.y, own.x, own.dir], [10, 2, 'RIGHT'], 'own prep uses board coordinates');
  assert.deepEqual([mate.y, mate.x, mate.dir, mate.ownerId], [3, 18, 'LEFT', 'p_1']);
  const scout = m.prepFieldMeta(right);
  assert.equal(scout.kind, 'boss');
  const medics = scout.units.filter((u) => u.defId === MEDIC).sort((a, b) => a.x - b.x);
  assert.deepEqual(medics.map((u) => [u.y, u.x, u.dir, u.ownerId]),
    [[3, 2, 'RIGHT', 'p_0'], [3, 18, 'LEFT', 'p_1']]);
  assert.notEqual(medics[0].uid, medics[1].uid, 'both model IDs remain distinct on the shared field');
  m.dispose();
});
