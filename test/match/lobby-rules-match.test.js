// test/match/lobby-rules-match.test.js — Lobby rules (Fish Edition, shared/constants.js RULE_KEYS): the host-set modifiers a match reads at start —
// extraDeploy (+2 deployment limit), extraFunds (+2 Funds every round start), untimed (no countdown outside battles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, DEFAULT_RULES, RULE_KEYS, RULE_EXTRA_DEPLOY, RULE_EXTRA_FUNDS, normalizeRules } from '../../shared/constants.js';
import { rulesInForce, ruleLabels, anyRule } from '../../shared/rules.js';
import { validateC2S } from '../../shared/protocol.js';
import { makeMatch } from './harness.js';

test('normalizeRules: known keys only, valid values only, missing keys from the base (default the original game), frozen', () => {
  assert.deepEqual(normalizeRules(null), DEFAULT_RULES);
  assert.deepEqual(Object.keys(normalizeRules({})), RULE_KEYS);
  assert.deepEqual(rulesInForce(DEFAULT_RULES), [], 'every rule is off by default');
  assert.deepEqual(normalizeRules({ extraFunds: true, bogus: true, untimed: 1, lateranoMod: 'Z', bans: ['b', 'a', 'a'] }),
    { ...DEFAULT_RULES, extraFunds: true, bans: ['a', 'b'] });
  const base = normalizeRules({ extraDeploy: true, victoriaMod: 'C', stage: 'act1autochess_m02' });
  assert.deepEqual(normalizeRules({ untimed: true }, base), { ...base, untimed: true });
  assert.deepEqual(normalizeRules({ extraDeploy: false, victoriaMod: 'A', stage: null }, base), DEFAULT_RULES);
  assert.ok(Object.isFrozen(base));
});

test('ruleLabels: cheats watermark (Risk 0), seeded for a chosen map or bans, neutral rules label nothing', () => {
  assert.deepEqual(ruleLabels(DEFAULT_RULES), { cheats: false, seeded: false, risk: 0 });
  assert.deepEqual(ruleLabels({ ...DEFAULT_RULES, lateranoMod: 'B', blaze: true }), { cheats: false, seeded: false, risk: 0 });
  assert.deepEqual(ruleLabels({ ...DEFAULT_RULES, bans: ['yanShip'] }), { cheats: false, seeded: true, risk: 0 });
  assert.deepEqual(ruleLabels({ ...DEFAULT_RULES, untimed: true, stage: 'act1autochess_m02' }), { cheats: true, seeded: true, risk: 0 });
  assert.equal(anyRule(DEFAULT_RULES), false);
  assert.equal(anyRule({ ...DEFAULT_RULES, virtuosaBonds: true }), true);
});

test('room.setRules: a non-empty partial map of known rule keys to values of their type', () => {
  assert.equal(validateC2S({ t: 'room.setRules', rules: { extraDeploy: true } }), null);
  assert.equal(validateC2S({ t: 'room.setRules', rules: { extraDeploy: true, lateranoMod: 'B', stage: null, bans: ['yanShip'] } }), null);
  for (const rules of [undefined, null, {}, [], { extraDeploy: 1 }, { bogus: true }, { extraDeploy: 'yes' }, { victoriaMod: 'B' },
    { stage: 3 }, { bans: ['x', 'x'] }, { bans: Array.from({ length: 13 }, (_, i) => `b${i}`) }]) {
    assert.notEqual(validateC2S({ t: 'room.setRules', rules }), null, JSON.stringify(rules));
  }
});

test('no rules: the match runs with every rule off and shows them in m.public', () => {
  const h = makeMatch({ mode: 'solo', seed: 2 }).start();
  h.toPrep(1);
  assert.deepEqual(h.m.lobbyRules, DEFAULT_RULES);
  assert.deepEqual(h.m.publicView().rules, DEFAULT_RULES);
  const ps = h.ps('p_0');
  assert.equal(ps.deployCap, 8);
  assert.equal(ps.funds, 4, 'R1 income 4');
  h.m.dispose();
});

test('extraFunds: +2 Funds at every round start, on top of the income', () => {
  const h = makeMatch({ mode: 'solo', seed: 2, lobbyRules: { extraFunds: true } }).start();
  h.toPrep(1);
  const ps = h.ps('p_0');
  assert.equal(ps.funds, 4 + RULE_EXTRA_FUNDS, 'R1: income 4 + 2');
  ps.funds = 3;
  h.drive(() => h.m.phase === PHASE.PREP && h.m.round === 2);
  assert.equal(ps.funds, 5 + RULE_EXTRA_FUNDS, 'R2: leftover lost, income 5 + 2');
  assert.deepEqual(h.m.publicView().rules, { ...DEFAULT_RULES, extraFunds: true });
  h.m.dispose();
});

test('extraDeploy: +2 deployment limit for every player, stacking with in-game bonuses', () => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 1, seed: 3, lobbyRules: { extraDeploy: true } }).start();
  h.toPrep(1);
  for (const ps of h.m.players.values()) {
    assert.equal(ps.deployCap, 8 + RULE_EXTRA_DEPLOY, ps.playerId);
    assert.equal(ps.privateView().deployCap, 8 + RULE_EXTRA_DEPLOY);
  }
  const ps = h.ps('p_0');
  ps.deployCapBonus += 1; // e.g. an item's addDeployCap
  assert.equal(ps.deployCap, 8 + RULE_EXTRA_DEPLOY + 1);
  h.m.dispose();
});

test('untimed: a co-op match with two humans publishes no countdown outside battles and waits for Ready', () => {
  const timed = makeMatch({ mode: 'coop', humans: 2, seed: 5 }).start();
  timed.toPrep(1);
  assert.ok(timed.m.deadline > 0, 'without the rule, co-op prep has a countdown');
  timed.m.dispose();

  const h = makeMatch({ mode: 'coop', humans: 2, seed: 5, lobbyRules: { untimed: true } }).start();
  const m = h.m;
  m.handle('p_0', { t: 'g.infoReady' });
  m.handle('p_1', { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  assert.equal(m.publicView().draft.untimed, true, 'strategy draft untimed');
  assert.equal(m.publicView().draft.turnDeadline, 0);
  h.sched.advance(10 * 60 * 1000);
  assert.equal(m.phase, PHASE.BAND_DRAFT, 'no draft turn times out');
  // each human picks a strategy nobody holds yet (the harness's fixed pick would wait forever on the second turn)
  while (m.phase === PHASE.BAND_DRAFT) {
    const taken = new Set(Object.values(m.draft.picks));
    assert.deepEqual(m.handle(m.draftTurn(), { t: 'g.band', bandId: m.gd.bandIds().find((b) => !taken.has(b)) }), { ok: true });
    h.sched.advance(1);
  }
  h.toPrep(1);
  assert.equal(m.deadline, 0, 'no prep countdown');
  h.sched.advance(10 * 60 * 1000);
  assert.equal(m.phase, PHASE.PREP, 'prep does not time out');
  assert.equal(m.round, 1);
  m.handle('p_0', { t: 'g.ready', ready: true });
  m.handle('p_1', { t: 'g.ready', ready: true });
  h.sched.advance(1);
  assert.notEqual(m.phase, PHASE.PREP, 'prep ends once every player is ready');
  m.dispose();
});

test('seeded: a chosen map and chosen bans are used; the rest is drawn as usual, the same seed without picks unchanged', () => {
  const plain = makeMatch({ mode: 'solo', seed: 7 });
  const base = { stageId: plain.m.stageId, bossId: plain.m.bossId, factions: [...plain.m.factions], drawn: plain.m.disabledBonds };
  const otherStage = plain.m.gd.mode.stages.find((id) => id !== base.stageId);
  const coreIds = plain.m.gd.bondIds.filter((b) => plain.m.gd.bond(b).isCore && Number(plain.m.gd.bond(b).weight) > 0);
  const notDrawn = coreIds.filter((b) => !base.drawn.includes(b)).slice(0, 2);
  const h = makeMatch({ mode: 'solo', seed: 7, lobbyRules: { stage: otherStage, bans: notDrawn } });
  const m = h.m;
  assert.equal(m.stageId, otherStage);
  assert.equal(m.bossId, base.bossId, 'the same seed keeps its bosses');
  assert.deepEqual([...m.factions], base.factions, '… and its factions');
  for (const b of notDrawn) assert.ok(m.disabledBonds.includes(b), `${b} banned`);
  const { core, addon } = m.gd.bans(m.gd.difficulty);
  assert.equal(m.disabledBonds.length, core + addon, 'as many bans as the difficulty draws');
  assert.equal(m.disabledBonds.filter((b) => m.gd.bond(b).isCore).length, core);
  // a setup reroll keeps the choices and redraws only what is still random
  m.completeSetupReroll();
  assert.equal(m.setupRevision, 1);
  assert.equal(m.stageId, otherStage);
  for (const b of notDrawn) assert.ok(m.disabledBonds.includes(b), `${b} still banned after the reroll`);
  assert.equal(m.disabledBonds.length, core + addon);
  // a map the mode does not have, and bonds that cannot be banned, are ignored
  const odd = makeMatch({ mode: 'solo', seed: 7, lobbyRules: { stage: 'nope_stage', bans: ['nopeShip'] } });
  assert.equal(odd.m.stageId, base.stageId);
  assert.deepEqual(odd.m.disabledBonds, base.drawn);
  plain.m.dispose(); h.m.dispose(); odd.m.dispose();
});

test('cheats keep the Risk (the "WITH CHEATS" watermark tells; Fish 2026-10-16)', async () => {
  const { ruleLabels } = await import('../../shared/rules.js');
  assert.deepEqual(ruleLabels({ ccBoss: 2, extraFunds: true }), { cheats: true, seeded: false, risk: 2 });
});

test('doubleLp: every player starts with twice its strategy\'s LP', () => {
  const lp = (rules) => {
    const h = makeMatch({ mode: 'coop', humans: 2, seed: 7, lobbyRules: rules }).start();
    try { h.toPrep(1); return h.m.order.map((p) => [p.lp, h.m.gd.startLp(p.bandId)]); } finally { h.m.dispose(); }
  };
  for (const [now, band] of lp({})) assert.equal(now, band);
  for (const [now, band] of lp({ doubleLp: true })) assert.equal(now, band * 2);
});

test('tierStart: one random operator of each tier I–VI at the start, the same draw for the same seed, from the pool', () => {
  const grant = () => {
    const h = makeMatch({ mode: 'solo', seed: 7, lobbyRules: { tierStart: true } }).start();
    try {
      h.toPrep(1);
      const ps = h.ps('p_0');
      const ops = [...ps.hand, ...ps.temp, ...ps.board.values()].filter((p) => p && p.kind === 'chess');
      return ops.map((p) => [h.m.gd.tierOf(p.id), p.id]).sort((a, b) => a[0] - b[0]);
    } finally { h.m.dispose(); }
  };
  const a = grant();
  const tiers = [1, 2, 3, 4, 5, 6].map((t) => a.filter(([x]) => x === t).length);
  assert.ok(tiers.every((n) => n >= 1), `one per tier at least: ${JSON.stringify(a)}`);
  assert.deepEqual(grant(), a, 'deterministic for the seed');
});
