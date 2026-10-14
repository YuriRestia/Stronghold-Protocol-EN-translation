import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';

test('a solo bot used for rehearsal has no AI teammate and gets no extra grace', () => {
  const h = makeMatch({ mode: 'solo', seats: [{ seat: 0, playerId: 'ai_0', name: 'AI', isBot: true }], fake: true, instant: false }).start();
  const m = h.m; m.setDeadline(0); m.order[0].lp = 40; m.round = m.gd.bossRound;
  m.startFinalAssault(false);
  assert.equal(m.bossOvertimeStartReal, m.gd.bossLevelTime(m.round)); m.dispose();
});

for (const hidden of [false, true]) for (const bots of [0, 1]) {
  test(`boss overtime follows the visible clock unless an AI teammate is present (hidden=${hidden}, bots=${bots})`, () => {
    const h = makeMatch({ mode: 'coop', humans: 2, bots, fake: true, instant: false }).start();
    const m = h.m;
    m.setDeadline(0);
    for (const p of m.order) p.lp = 40;
    m.round = hidden ? m.gd.hiddenRound : m.gd.bossRound;
    if (hidden) m.teamLp = 100;
    m.startFinalAssault(hidden);
    const level = m.gd.bossLevelTime(m.round);
    const after = bots ? m.gd.bossOvertimeAfterReal : level;
    assert.equal(m.overtimeAt, m.sched.now() + after * m.gd.combatTimeScale / m.gameSpeed * 1000);
    const lp = m.teamLp;
    m._applyOvertime((after + 0.9) * m.gd.combatTimeScale); assert.equal(m.teamLp, lp);
    m._applyOvertime((after + 1) * m.gd.combatTimeScale); assert.equal(m.teamLp, lp - 1);
    m._applyOvertime((after + 1) * m.gd.combatTimeScale); assert.equal(m.teamLp, lp - 1, 'no repeated deduction');
    m._applyOvertime((after + 3) * m.gd.combatTimeScale); assert.equal(m.teamLp, lp - 3);
    m.dispose();
  });
}
