// test/content/feedback7-ines-raid.test.js — 伊内丝 S3 独影归途 under 突袭 (community report: 伊内丝激活突袭瞬移以后3技能被吞).
// S3 costs no SP and runs from every deployment but the first (skill_table skchr_ines_3: PASSIVE, spCost 0, "部署后…";
// her kit casts it in its deploy hook). The 突袭 jump (activity_table bondeffect_raid "保留技力立即再部署") retreats her —
// ending the running S3 — and redeploys her with the SP kept (Battle.redeploy keepSp): that snapshot held 0 charges and
// overwrote the charge reset() gives a free skill at every deployment, so the landing could not recast S3. A skill that
// costs SP still keeps its SP / charges.
// Run: node --test test/content/feedback7-ines-raid.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec, checkInvariants } from '../helpers/battleHarness.js';

function field(skillIndex) {
  const landings = [];
  const h = makeBattle({
    defs: { enemies: { e_walk: enemyRec({ key: 'e_walk', hp: 1e7, speed: 0.5, atk: 0 }) } },
    timeLimit: 20, autoFinish: false, seed: 1, flags: { dpInit: 99, dpPerSec: 0, dpMax: 999 },
    bonds: { raidShip: { count: 2, active: true, tier: 1, layers: 0 } },
    units: [{ uid: 1, chessId: 'chess_char_4_04_a', row: 12, col: 3, dir: 'RIGHT', skillIndex }],
    enemies: [{ key: 'e_walk', time: 1.2, routeIndex: 0, count: 1 }],
    hooks: ['skillStart', 'skillEnd', 'death'],
    setup: (b) => {
      // priority 1000: after the keepSp restore, before her kit's deploy hook (which casts S3)
      b.on('deploy', ({ unit }) => {
        if (unit.uid !== 1 || b.time < 0.5) return;
        const sk = unit.skill;
        landings.push({ t: b.time, tile: [unit.tileR, unit.tileC], charges: sk.charges, sp: sk.sp, active: sk.active });
      }, { priority: 1000 });
    },
  });
  h.step();
  return { h, landings, u: h.b.allyUnits.find((x) => x.uid === 1) };
}

test('伊内丝 S3 starts again on the 突袭 landing: the free charge reset() gave is not overwritten by the kept 0', () => {
  const { h, landings, u } = field(2);
  assert.equal(u.skill.id, 'skchr_ines_3');
  h.run(4);
  assert.ok(h.hooksOf('death').some((c) => c.unit === u && c.reason === 'raid'), 'she jumped');
  assert.equal(landings.length, 1);
  assert.notDeepEqual(landings[0].tile, [12, 3], 'landed beside the enemy');
  assert.equal(landings[0].charges, 1, 'armed at the landing');
  const starts = h.hooksOf('skillStart').filter((c) => c.unit === u);
  assert.equal(starts.length, 2, 'the second deployment and the landing');
  assert.ok(Math.abs(starts[1].t - landings[0].t) < 1e-9);
  assert.equal(u.skill.active, true);
  assert.ok(u.skill.timeLeft > 5, `a fresh S3 (${u.skill.timeLeft.toFixed(2)} s left)`);
  assert.ok(u.findBuff('ines:s3'), 'its ATK buff');
  checkInvariants(h.b);
});

test('突袭 still keeps the SP of a skill that costs SP (伊内丝 S2: a full charge, and a partial bar)', () => {
  const full = field(1);
  assert.equal(full.u.skill.id, 'skchr_ines_2');
  full.u.skill.gainSp(999, 'test');
  full.h.run(4);
  assert.equal(full.landings.length, 1);
  assert.equal(full.landings[0].charges, 1);
  assert.equal(full.landings[0].sp, full.u.skill.spCost);
  checkInvariants(full.h.b);

  const part = field(1);
  const initSp = part.u.skill.sp;
  part.h.run(12);
  assert.equal(part.landings.length, 1, 'the idle trigger');
  assert.equal(part.landings[0].charges, 0);
  assert.ok(part.landings[0].sp > initSp + 5, `kept ${part.landings[0].sp} (a bar that started at ${initSp})`);
  checkInvariants(part.h.b);
});
