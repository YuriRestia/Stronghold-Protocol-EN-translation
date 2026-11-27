// RESULT: titles (评语) assignment, per-player rows, trophies, rewards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignTitles } from '../../server/match/results.js';
import { GameData } from '../../server/match/gamedata.js';
import { PHASE } from '../../shared/constants.js';
import { DATA, makeMatch } from './harness.js';

const gd = new GameData(DATA, 'mode_multi_hard');
const fake = (seat, s = {}, layers = 0, lp = 10) => ({
  playerId: `p${seat}`, seat, alive: true, lp, lpAtFinal: lp,
  stats: { bossDamage: 0, merges: 0, itemsEquipped: 0, gold: 0, ...s },
  activatedLayers: () => layers,
});

test('titles: each player ≤ 1 title, each title ≤ once, leaders first, 卫戍之星 only on a win', () => {
  const players = [
    fake(0, { bossDamage: 900, merges: 1, gold: 50 }, 100, 5),
    fake(1, { bossDamage: 100, merges: 6, gold: 20 }, 300, 9),
    fake(2, { itemsEquipped: 9, gold: 99 }, 10, 30),
    fake(3, { merges: 2, gold: 1 }, 50, 12),
  ];
  const win = assignTitles(gd, players, true);
  const ids = [...win.values()].map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'each title used once');
  assert.equal(win.get('p0').id, 'comment_1', 'top boss damage (win)');
  assert.ok(['comment_2', 'comment_4'].includes(win.get('p1').id));
  assert.ok(win.size === 4);
  const loss = assignTitles(gd, players, false);
  assert.ok(![...loss.values()].some((t) => t.id === 'comment_1'), '卫戍之星 needs a win');
  for (const t of [...win.values(), ...loss.values()]) assert.ok(t.name && t.text && t.picId);
  // nobody gets a 'max' title for a zero stat; the 'min' title 坚若磐石 (least LP lost) goes to a player who lost none
  const none = assignTitles(gd, [fake(0, {}, 0, 0)], false);
  assert.deepEqual([...none.values()].map((t) => t.id), ['comment_3']);
  const dead = assignTitles(gd, [{ ...fake(0, {}, 0, 0), alive: false }], false);
  assert.equal(dead.size, 0, 'an eliminated player gets nothing for zero stats');
});

test('m.result rows: lineup, bonds, stats, roundsPassed per player, trophies (co-op) and rewards', () => {
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, seed: 80, fake: true, script: (b) => (b.round !== 2 ? {} : b.kind === 'unite' ? { survivors: { p_1: 10 } } : { leaks: { p_1: 10 } }) }).start();
  const m = h.m;
  h.toPrep(1);
  h.ps('p_1').lp = 5;
  h.drive(() => m.phase === PHASE.PREP && m.round === 3);
  assert.equal(h.ps('p_1').alive, false);
  h.m.onLeave('p_1');
  assert.equal(h.ended, null, 'a human is still there');
  h.m.onLeave('p_0');
  const r = h.ended;
  assert.ok(r);
  assert.equal(r.reason, 'abandoned');
  assert.equal(r.victory, false);
  const rows = Object.fromEntries(r.players.map((p) => [p.playerId, p]));
  assert.equal(rows.p_1.roundsPassed, 1);
  assert.equal(rows.p_1.eliminatedRound, 2);
  assert.equal(rows.p_0.roundsPassed, 2);
  for (const p of r.players) {
    for (const k of ['playerId', 'seat', 'name', 'isBot', 'victory', 'roundsPassed', 'lineup', 'bonds', 'stats', 'title', 'trophies', 'reward']) assert.ok(k in p, k);
    for (const k of ['dmgDealt', 'kills', 'leaks', 'gold', 'refreshes', 'merges', 'itemsEquipped', 'bossDamage', 'activatedLayers', 'lpLost']) assert.ok(Number.isFinite(p.stats[k]), k);
  }
  assert.equal(rows.p_0.reward, Math.round(20 * 1.7 * 1.25), 'reward = base[rounds] × difficulty × mode');
  assert.equal(r.modeId, 'mode_multi_hard');
  assert.ok(Number.isFinite(r.durationMs));
  assert.equal('bossSeconds' in r, false, 'no Final Assault fought: the key is absent');
  assert.equal('faUnitStats' in rows.p_0.stats, false, '#197 I2: no Final Assault fought: the key is absent');
  m.dispose();
});

test('#197 I2: faUnitStats carries each board unit\'s Final Assault damage, round by round', () => {
  // same setup as the Final Assault defeat test above: the boss is still fought (and still has a per-round
  // result with unitStats) even though bossDps: 0 means it's never hurt and the team loses on the overtime drain.
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed: 4, fake: true, script: (b) => (b.kind === 'boss' ? { bossDps: 0 } : {}) }).start();
  h.autoHumans();
  const end = h.runToEnd();
  assert.equal(end.reason, 'defeat');
  const p = end.players[0];
  assert.ok(Array.isArray(p.stats.faUnitStats) && p.stats.faUnitStats.length >= 1, 'at least one boss round captured');
  const round = p.stats.faUnitStats[0];
  assert.equal(round.hidden, false);
  assert.ok(Number.isInteger(round.round));
  assert.ok(round.units.length > 0, 'has per-unit entries');
  for (const u of round.units) {
    assert.ok(Number.isFinite(u.dmg) && u.dmg >= 0, 'dmg');
    assert.ok(typeof u.defId === 'string', 'defId');
    assert.ok(Number.isInteger(u.uid), 'uid');
  }
  h.m.dispose();
});

test('Final Assault: the result LP are the alive players\' shares of the merged team LP (a team beaten to 0 shows 0)', () => {
  // defeat: the boss is never hurt, the overtime drain empties the team pool
  const h = makeMatch({ mode: 'coop', difficulty: 'NORMAL', humans: 2, seed: 4, fake: true, script: (b) => (b.kind === 'boss' ? { bossDps: 0 } : {}) }).start();
  h.autoHumans();
  const end = h.runToEnd();
  assert.equal(h.m.teamLp, 0);
  assert.equal(end.reason, 'defeat');
  assert.equal(end.teamLp, 0);
  assert.ok(Number.isFinite(end.bossSeconds) && end.bossSeconds > 0, '#192: the Final Assault fight\'s length (game seconds) is in the result');
  for (const p of end.players) {
    assert.equal(p.alive, true);
    assert.equal(p.roundsPassed, 13);
    assert.equal(p.lp, 0, `${p.playerId}: a team beaten to 0 LP shows 0, not its pre-merge LP`);
    assert.equal(h.lastTo(p.playerId, 'm.private').lp, 0, 'm.private follows');
  }
  assert.ok(h.lastBc('m.public').players.every((p) => p.lp === 0), 'm.public follows');
  h.m.dispose();

  // victory after losing LP in the boss fight: Σ shares = team LP, each share ∝ the LP the player brought in
  const h2 = makeMatch({
    mode: 'coop', difficulty: 'FUNNY', humans: 3, seed: 7, fake: true,
    script: (b) => (b.kind === 'boss' ? { bossDps: b.sharedBoss.maxHp / 8, leakEvents: b.fieldId === 'b1' ? [{ at: 1, lpr: 5 }, { at: 2, lpr: 6 }] : [] } : {}),
  }).start();
  h2.autoHumans();
  h2.drive(() => h2.m.phase === PHASE.PREP && h2.m.round === 14);
  const [a, b, c] = ['p_0', 'p_1', 'p_2'].map((id) => h2.ps(id));
  a.lp = 30; b.lp = 21; c.lp = 9;
  const r2 = h2.runToEnd();
  assert.equal(r2.victory, true);
  assert.equal(h2.m.teamLp, 60 - 11);
  assert.equal(r2.teamLp, 49);
  const lp = Object.fromEntries(r2.players.map((p) => [p.playerId, p.lp]));
  assert.equal(lp.p_0 + lp.p_1 + lp.p_2, 49);
  for (const [id, brought] of [['p_0', 30], ['p_1', 21], ['p_2', 9]]) {
    assert.ok(Math.abs(lp[id] - (49 * brought) / 60) < 1, `${id}: share ${lp[id]} of 49 for ${brought}/60`);
    assert.ok(lp[id] <= brought);
  }
  h2.m.dispose();
});

test('co-op trophies / victory follow each player\'s OWN rounds passed: a teammate eliminated in R6 gets the table value of 5 rounds, not the Hidden-Core row', async () => {
  const { buildResult } = await import('../../server/match/results.js');
  const h = makeMatch({ mode: 'coop', difficulty: 'HARD', humans: 2, seed: 5, fake: true }).start();
  h.toPrep(6);
  const m = h.m;
  const out = h.ps('p_1');
  out.lp = 0;
  out.eliminate(6);
  m.round = 15;
  m.hiddenReached = true;
  const res = buildResult(m, { victory: true, hiddenReached: true, hiddenCleared: true, reason: 'victory' });
  const tr = m.gd.config.trophies;
  const row = (pid) => res.players.find((p) => p.playerId === pid);
  assert.equal(row('p_0').roundsPassed, 15);
  assert.equal(row('p_0').trophies, tr.hiddenCore.HARD, 'the survivor cleared the Hidden Core');
  assert.equal(row('p_0').victory, true);
  assert.equal(row('p_1').roundsPassed, 5);
  assert.equal(row('p_1').trophies, tr.byRoundsPassed.find((x) => 5 <= x.maxRound).HARD, 'own 5 rounds, not the Hidden-Core row');
  assert.notEqual(row('p_1').trophies, tr.hiddenCore.HARD);
  assert.equal(row('p_1').victory, false, 'eliminated before the boss round: the clear is not its own');
  assert.equal(res.victory, true, 'the team result is still a win');
  m.dispose();
});
