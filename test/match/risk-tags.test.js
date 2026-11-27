// test/match/risk-tags.test.js — the match side of the SPA-CC Risk tags (shared/rules.js 'risk', numbers in
// shared/ruleData.js CC): the first tier-1 operator bought each round from round 3 costs +1, shop upgrade prices, the
// final bosses' HP pool, Famiglia Cleaner's Silencers for the player with the fewest stacks on rounds 10–13 (ties: the
// earliest seat), 投资人 counting the board only, the Patriot and Delegation groups' cards and sub-waves, and the round's LP
// (Last Line of Defense, a leaked Patriot).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { bossPoolHp } from '../../server/match/finalAssault.js';
import { CC } from '../../shared/ruleData.js';

const tier1 = (gd) => gd.visibleChess.find((id) => gd.tierOf(id) === 1 && !gd.chess(id).isGolden);

test('ccTier1Price: +1 on the first tier-1 operator of a round from round 3, not after one is bought, not before round 3', () => {
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccTier1Price: 1 } }).start();
  try {
    const ps = h.ps('p_0');
    const id = tier1(ps.gd);
    const slot = { kind: 'chess', id, basePrice: ps.gd.chessPrice(id) };
    h.m.round = 2;
    assert.equal(ps.priceOf(slot), slot.basePrice, 'round 2');
    h.m.round = 3;
    assert.equal(ps.priceOf(slot), slot.basePrice + 1);
    ps.round.tier1Bought = true;
    assert.equal(ps.priceOf(slot), slot.basePrice, 'only the first');
    const other = ps.gd.visibleChess.find((x) => ps.gd.tierOf(x) === 2);
    ps.round.tier1Bought = false;
    assert.equal(ps.priceOf({ kind: 'chess', id: other, basePrice: 2 }), 2, 'tier 2 unchanged');
  } finally { h.m.dispose(); }
});

test('ccUpgrade: leaving shop level 4 costs +2 (level 2: +3, and level 5 too)', () => {
  for (const [lv, want] of [[0, { 4: 0, 5: 0 }], [1, { 4: 2, 5: 0 }], [2, { 4: 3, 5: 3 }]]) {
    const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccUpgrade: lv } });
    try {
      const ps = h.ps('p_0');
      for (const level of [3, 4, 5]) assert.equal(ps.upgradeBaseOf(level), (ps.gd.upgradeBase(level) ?? 0) + (want[level] ?? 0), `tag ${lv}, level ${level}`);
    } finally { h.m.dispose(); }
  }
});

test('ccBoss: the final boss pool +50 / 150 / 400 %', () => {
  const h = makeMatch({ mode: 'solo', seed: 3 });
  try {
    const base = bossPoolHp(h.m.gd, h.m.bossId, 1);
    for (const lv of [1, 2, 3]) assert.equal(bossPoolHp(h.m.gd, h.m.bossId, 1, { ccBoss: lv }), Math.round(base * (1 + CC.bossHp[lv])));
  } finally { h.m.dispose(); }
});

test('ccFamiglia Cleaner: rounds 10–13, the fewest stacks; a tie goes to the earliest seat; none on round 9 or without the tag', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccFamiglia: 1 } });
  try {
    const [p0, p1] = [h.ps('p_0'), h.ps('p_1')];
    h.m.round = 10;
    p0.layers = { yanShip: 30 }; p1.layers = { yanShip: 10, kjeragShip: 5 };
    assert.deepEqual(h.m.riskBounties(p0), []);
    const [b] = h.m.riskBounties(p1);
    assert.equal(b.card.enemyKey, CC.silencers.key);
    assert.equal(b.card.count, CC.silencers.count);
    assert.equal(CC.silencers.count, 3, 'co-op: 3 (Fish 2026-11-12)');
    assert.equal(b.card.coin, 0);
    assert.equal(h.m.waveBounties(p1).length, p1.bounties.length + 1);
    p1.layers = { yanShip: 30 };
    assert.equal(h.m.riskBounties(p0).length, 1, 'tie: the earliest seat');
    assert.equal(h.m.riskBounties(p1).length, 0);
    h.m.round = 9;
    assert.equal(h.m.riskBounties(p0).length, 0, 'round 9');
  } finally { h.m.dispose(); }
  const off = makeMatch({ mode: 'coop', humans: 2, seed: 4 });
  try { off.m.round = 10; assert.equal(off.m.riskBounties(off.ps('p_0')).length, 0); } finally { off.m.dispose(); }
});

test('ccInvestorBench: 投资人 counts the board only', () => {
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccInvestorBench: 1 } });
  const plain = makeMatch({ mode: 'solo', seed: 3 });
  try {
    assert.equal(h.m.gd.bond('investShip').countMode, 'BOARD');
    assert.equal(plain.m.gd.bond('investShip').countMode, 'BOARD_AND_DECK');
  } finally { h.m.dispose(); plain.m.dispose(); }
});

test('ccInvestorBench 2: 缪尔赛思 / 耶拉 / 焰尾\'s 获得时 grants come when they are sold (level 1: when bought)', () => {
  const ICE = 'chess_item_5_02_e_a', KJERA = 'chess_char_3_20_a';
  const ice = (ps) => [...ps.hand, ...ps.temp, ...ps.board.values()].filter((p) => p && p.kind === 'item' && ps.gd.item(p.id)?.baseId === ICE).length;
  for (const level of [1, 2]) {
    const h = makeMatch({ mode: 'solo', seed: 3, fake: true, lobbyRules: { ccInvestorBench: level } }).start();
    try {
      h.toPrep(1);
      const ps = h.ps('p_0');
      for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
      ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0; ps.funds = 50; ps.recompute();
      for (const id of CC.investorSold.garrisons) {
        const g = h.m.gd.garrison(id);
        assert.equal(g.eventType, level >= 2 ? 'SERVER_CHESS_SOLD' : 'SERVER_GAIN', id);
        assert.ok(g.desc.startsWith(level >= 2 ? '<售出时>' : '<获得时>'), g.desc);
      }
      ps.shop.slots[0] = { kind: 'chess', id: KJERA, price: 1, basePrice: 1, sold: false, frozen: false };
      assert.deepEqual(h.m.handle('p_0', { t: 'g.buy', slot: 0 }), { ok: true });
      ps.shop.slots[0] = null;
      assert.equal(ice(ps), level >= 2 ? 0 : 1, `level ${level}: bought`);
      const kjera = ps.allChess().find((p) => p.id === KJERA);
      assert.deepEqual(h.m.handle('p_0', { t: 'g.sell', uid: kjera.uid }), { ok: true });
      assert.equal(ice(ps), 1, `level ${level}: sold`);
    } finally { h.m.dispose(); }
  }
});

test('ccPatriot Undying 1: a round-9 card worth 0 Funds; nobody taking it → the final boss +200 % HP (Undying 2: +100 % ATK)', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccPatriot: 1 } });
  try {
    h.m.round = 9;
    const c = h.m.riskPatriotCard();
    assert.equal(c.kind, 'bounty');
    assert.equal(c.enemyKey, CC.patriot.key);
    assert.equal(c.coin, 0);
    assert.ok(!c.skipAtk, 'Undying 1 only: no ATK in its text');
    assert.equal(h.m.riskBounties(h.ps('p_0')).length, 0, 'no Patriot without the card');
    h.m.round = 10;
    assert.equal(h.m.riskPatriotCard(), null, 'round 9 only');
    assert.equal(h.m.riskPatriotSkipped(), false, 'never offered: no penalty');
    h.m.ccPatriotOffered = true;
    assert.equal(h.m.riskPatriotSkipped(), true, 'nobody took him');
    h.m.ccPatriotTaken = true;
    assert.equal(h.m.riskPatriotSkipped(), false);
    const base = bossPoolHp(h.m.gd, h.m.bossId, 2, h.m.lobbyRules);
    assert.equal(bossPoolHp(h.m.gd, h.m.bossId, 2, h.m.lobbyRules, { patriotSkipped: true }), Math.round(base * (1 + CC.patriot.skipHp)));
  } finally { h.m.dispose(); }
  const two = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccPatriot: 2 } });
  try { two.m.round = 9; assert.equal(two.m.riskPatriotCard().skipAtk, true); } finally { two.m.dispose(); }
});

test('ccPatriot Undying 1: the round-9 Improv shows the card (in place of the 6th in co-op), and taking it brings him', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccPatriot: 1 } });
  try {
    h.m.round = 9;
    h.m.enterSpDraft();
    const cards = h.m.sp.cards;
    assert.ok(cards.length <= 6);
    const idx = cards.findIndex((c) => c.risk);
    assert.ok(idx >= 0, 'the Patriot card is offered');
    assert.equal(cards[idx].idx, idx);
    const who = h.m.spTurn();
    assert.equal(h.m.pickCard(h.ps(who), idx).ok !== false, true);
    assert.equal(h.m.ccPatriotTaken, true);
    assert.equal(h.m.ccPatriotOffered, true);
    assert.equal(h.m.riskPatriotSkipped(), false);
    assert.ok(h.ps(who).bounties.some((b) => b.card.enemyKey === CC.patriot.key && b.card.coin === 0));
  } finally { h.m.dispose(); }
});

test('ccPatriot Undying 2: the Shieldguards with the Patriot taken on round 9; Undying 3: the final rounds\' sub-wave once per field, taken or not', () => {
  for (const level of [1, 2]) {
    const none = makeMatch({ mode: 'solo', seed: 4, lobbyRules: { ccPatriot: level } });
    try { none.m.round = 15; assert.equal(none.m.bossSubWave(['p_0']).size, 0, `Undying ${level}: no final-round sub-wave`); } finally { none.m.dispose(); }
  }
  const h2 = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccPatriot: 2 } });
  try {
    h2.m.round = 9;
    const [p0, p1] = [h2.ps('p_0'), h2.ps('p_1')];
    h2.m.addBounty(p0, h2.m.riskPatriotCard());
    const escort = (ps) => h2.m.riskBounties(ps).filter((b) => b.card.enemyKey === CC.patriot.escort.key);
    assert.equal(escort(p0)[0].card.count, CC.patriot.escort.count);
    assert.equal(escort(p1).length, 0, 'only with the one who took him');
  } finally { h2.m.dispose(); }
  // Undying 3, nobody took him: the sub-wave still comes
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccPatriot: 3 } });
  try {
    assert.ok(!h.m.ccPatriotTaken);
    const sub = h.m.bossSubWave(['p_0', 'p_1']);
    assert.deepEqual([...sub.keys()], ['p_0'], 'one group per field, with its left player');
    const cards = sub.get('p_0');
    assert.deepEqual(cards.map((b) => [b.card.enemyKey, b.card.count]), [[CC.patriot.key, 1], [CC.patriot.escort.key, CC.patriot.escort.count]]);
    assert.ok(cards.every((b) => b.card.leftFirst));
  } finally { h.m.dispose(); }
});

test('ccDelegation: the final rounds\' sub-wave once per field (1 + 2 + 2); the Degenbrecher alone: HP × 1 / 2 / 3 per alive player, ATK × 1.5 from United 2, at the start', () => {
  const wave = (level, dead = 0) => {
    const h = makeMatch({ mode: 'coop', humans: 2, seed: 3, lobbyRules: { ccDelegation: level } });
    try {
      if (dead) h.ps('p_1').alive = false;
      return h.m.bossSubWave(['p_0', 'p_1']);
    } finally { h.m.dispose(); }
  };
  const dg = CC.delegation;
  const byKey = (m) => { assert.deepEqual([...m.keys()], ['p_0']); return Object.fromEntries(m.get('p_0').map((b) => [b.card.enemyKey, b.card])); };
  const u1 = byKey(wave(1));
  assert.equal(u1[dg.degen].count, 1);
  assert.equal(u1[dg.wave[1].key].count, 2);
  assert.equal(u1[dg.wave[2].key].count, 2);
  assert.deepEqual(u1[dg.degen].riskMods, { hpMul: 2 }, '2 alive players × 1');
  assert.deepEqual(byKey(wave(2))[dg.degen].riskMods, { hpMul: 4, atkMul: 1.5 });
  assert.deepEqual(byKey(wave(3))[dg.degen].riskMods, { hpMul: 6, atkMul: 1.5 });
  assert.deepEqual(byKey(wave(3, 1))[dg.degen].riskMods, { hpMul: 3, atkMul: 1.5 }, 'one alive player');
  assert.equal(u1[dg.wave[1].key].riskMods, undefined, 'the minions keep the round\'s HP');
  assert.equal(u1[dg.wave[2].key].riskMods, undefined);
  assert.equal(u1[dg.degen].atStart, true, 'the Degenbrecher spawns at the start');
  assert.ok(!u1[dg.wave[1].key].atStart && !u1[dg.wave[2].key].atStart, 'her escort joins the wave as before');
  assert.equal(byKey(wave(3))[dg.degen].count, 1, 'no clones');
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccDelegation: 1 } });
  try { h.m.round = 10; assert.equal(h.m.riskBounties(h.ps('p_0')).length, 0, 'not in a normal round'); } finally { h.m.dispose(); }
});

test('the sub-wave never takes a leader\'s standing route (the Hidden Core\'s 500 s wait): it walks in both final rounds', async () => {
  const { buildBossWave, bountySpawns, leftFirstRoute } = await import('../../server/match/waves.js');
  const stand = { motion: 'WALK', start: [3, 9], end: [2, 2], steps: [{ t: 'wait', s: 500 }] };
  const walk = { motion: 'WALK', start: [2, 10], end: [1, 3], steps: [] };
  assert.equal(leftFirstRoute([stand, walk], false), 1);
  assert.equal(leftFirstRoute([stand], false), -1);
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccDelegation: 1, ccVengeance: 1 } }).start();
  try {
    h.toPrep(2);
    const m = h.m;
    for (const round of [m.gd.bossRound, m.gd.hiddenRound].filter(Boolean)) {
      const bossId = round === m.gd.hiddenRound ? m.hiddenBossId || m.bossId : m.bossId;
      for (let i = 0; i < 6; i++) {
        const wave = buildBossWave(m.gd, m.rngWaves, m.factions, round, { bossId, solo: true });
        const specs = bountySpawns(m.gd, round, wave, m.bossSubWave(['p_0']).get('p_0'), 'p_0', { side: 'L' });
        assert.ok(specs.length > 0);
        for (const sp of specs) {
          const r = wave.routes[sp.routeIndex];
          assert.ok(!(r.steps || []).some((x) => x.t === 'wait' && x.s >= 60), `${wave.templateId} route ${sp.routeIndex} stands`);
        }
      }
    }
  } finally { h.m.dispose(); }
});

test('the sub-wave takes the left-first route of a pair field (left portal, then right), the left one of a one-player field', async () => {
  const { buildBossWave, bountySpawns, leftFirstRoute } = await import('../../server/match/waves.js');
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccDelegation: 1, ccPatriot: 3 } }).start();
  try {
    h.toPrep(2);
    const m = h.m;
    for (const solo of [false, true]) {
      const wave = buildBossWave(m.gd, m.rngWaves, m.factions, 14, { bossId: m.bossId, solo });
      const specs = bountySpawns(m.gd, 14, wave, m.bossSubWave(solo ? ['p_0'] : ['p_0', 'p_1']).get('p_0'), 'p_0', { side: 'L' });
      const lf = leftFirstRoute(wave.routes, false);
      assert.ok(lf >= 0);
      assert.ok(specs.length > 0 && specs.every((s) => s.routeIndex === lf), wave.templateId);
      const r = wave.routes[lf];
      if (!solo) {
        assert.ok(r.steps.find((x) => x.t === 'move').p[1] < 10, 'to the left first');
        assert.ok(r.end[1] > 10, 'then to the right');
      } else assert.ok(r.end[1] < 10, 'the left route');
    }
  } finally { h.m.dispose(); }
});

test('ccDelegation: the Degenbrecher spawns at 0 s in both final rounds, apart from the wave; her escort joins it', async () => {
  const { buildBossWave, bountySpawns } = await import('../../server/match/waves.js');
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccDelegation: 2 } }).start();
  try {
    h.toPrep(2);
    const m = h.m;
    for (const round of [14, 15]) for (const solo of [false, true]) {
      const wave = buildBossWave(m.gd, m.rngWaves, m.factions, round, { bossId: round === 15 ? m.hiddenBossId || m.bossId : m.bossId, solo });
      const specs = bountySpawns(m.gd, round, wave, m.bossSubWave(solo ? ['p_0'] : ['p_0', 'p_1']).get('p_0'), 'p_0', { side: 'L' });
      const her = specs.filter((s) => s.enemyKey === CC.delegation.degen);
      assert.equal(her.length, 1, `round ${round}`);
      assert.equal(her[0].time, 0, `round ${round}`);
      assert.equal(her[0].actionIndex, undefined, 'joins no action');
      assert.ok(specs.some((s) => s.enemyKey !== CC.delegation.degen), 'the escort is there');
    }
  } finally { h.m.dispose(); }
});

test('a sub-wave riskMods multiply the round spawn mods', async () => {
  const { bountySpawns } = await import('../../server/match/waves.js');
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccDelegation: 2 } });
  try {
    const ps = h.ps('p_0');
    const list = h.m.bossSubWave(['p_0']).get('p_0');
    const plain = list.map((b) => ({ ...b, card: { ...b.card, riskMods: undefined } }));
    const a = bountySpawns(h.m.gd, h.m.round, h.m.wave, list, ps.playerId);
    const b = bountySpawns(h.m.gd, h.m.round, h.m.wave, plain, ps.playerId);
    assert.ok(a.length > 0 && a.length === b.length);
    for (let i = 0; i < a.length; i++) {
      const degen = a[i].enemyKey === CC.delegation.degen;
      assert.ok(Math.abs(a[i].mods.hpMul - b[i].mods.hpMul * (degen ? CC.delegation.hpMul.united2 : 1)) < 1e-9);
      assert.ok(Math.abs(a[i].mods.atkMul - b[i].mods.atkMul * (degen ? CC.delegation.degenAtkMul : 1)) < 1e-9);
    }
  } finally { h.m.dispose(); }
});

test('round LP: ccLastLine +2 past the cap when the own battle leaked; a leaked Patriot costs 5 (within the cap)', () => {
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccLastLine: 1, ccPatriot: 1 } });
  try {
    const cap = h.m.gd.lpCapPerRound;
    assert.equal(h.m.riskLoss([], 0), 0);
    assert.equal(h.m.riskLoss([{ enemyKey: 'x', counted: true }], 1), 1 + CC.lastLineLp);
    assert.equal(h.m.riskLoss(Array(12).fill({ enemyKey: 'x', counted: true }), cap), cap + CC.lastLineLp, 'past the cap');
    assert.equal(h.m.riskLoss([{ enemyKey: 'x', counted: false }], 0), 0, 'an uncounted leak');
    assert.equal(h.m.riskLoss([{ enemyKey: CC.patriot.key, counted: true }], 1), CC.patriot.leakLp + CC.lastLineLp);
    assert.equal(h.m.riskLoss([{ enemyKey: 'x', counted: true }], 0, false), CC.lastLineLp, '联防 caught it: still +2');
  } finally { h.m.dispose(); }
  const off = makeMatch({ mode: 'solo', seed: 3 });
  try { assert.equal(off.m.riskLoss([{ enemyKey: CC.patriot.key, counted: true }], 1), 1); } finally { off.m.dispose(); }
});

test('ccFamiglia tier 3: Zaaro joins Cleaner\'s sub-wave and costs 5 LP when he leaks; tier 2 adds no one', () => {
  const z = CC.famiglia.zaaro.key;
  for (const [level, want] of [[2, false], [3, true], [4, false], [5, true]]) {
    const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { ccFamiglia: level } });
    try {
      h.m.round = 10;
      const keys = h.m.riskBounties(h.ps('p_0')).map((b) => b.card.enemyKey);
      assert.ok(keys.includes(CC.silencers.key), `level ${level}: Cleaner is included`);
      assert.equal(keys.includes(z), want, `level ${level}`);
      if (want) assert.equal(h.m.riskLoss([{ enemyKey: z, counted: true }], 1), CC.famiglia.zaaro.leakLp);
      else assert.equal(h.m.riskLoss([{ enemyKey: z, counted: true }], 1), 1);
    } finally { h.m.dispose(); }
  }
});

test('a Patriot who leaks and survives the Unite Phase still costs his leaker 5 LP (and 1 without the tag)', () => {
  for (const [rules, want] of [[{ ccPatriot: 1 }, CC.patriot.leakLp], [{}, 1]]) {
    const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: rules }).start();
    try {
      h.toPrep(2);
      h.m.round = 9;
      const [p0, p1] = [h.ps('p_0'), h.ps('p_1')];
      const clean = () => ({ leaked: [], perfect: true, coins: 0, layerGains: {}, killed: 0, damageDealt: 0 });
      h.m.lastResults = new Map([[p0.playerId, { ...clean(), perfect: false, leaked: [{ enemyKey: CC.patriot.key, counted: true }] }], [p1.playerId, clean()]]);
      const plan = { helpers: [p1], leakers: [p0], leaked: [{ enemyKey: CC.patriot.key, sourcePlayerId: p0.playerId }], notReentered: new Map() };
      const unite = { perPlayer: { [p1.playerId]: { leaked: [{ enemyKey: CC.patriot.key, counted: true, sourcePlayerId: p0.playerId }] } }, unspawned: [] };
      const before = p0.lp;
      h.m.settle(plan, unite);
      assert.equal(before - p0.lp, want, JSON.stringify(rules));
    } finally { h.m.dispose(); }
  }
});

test('while the Unite Phase runs, a leaker\'s pending LP weighs a Patriot like the settlement (GitHub #76)', () => {
  for (const [rules, want] of [[{ ccPatriot: 1 }, CC.patriot.leakLp + 1], [{ ccPatriot: 1, ccLastLine: 1 }, CC.patriot.leakLp + 1 + CC.lastLineLp], [{}, 2]]) {
    const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: rules }).start();
    try {
      h.toPrep(2);
      const [p0, p1] = [h.ps('p_0'), h.ps('p_1')];
      const clean = () => ({ leaked: [], perfect: true, coins: 0, layerGains: {}, killed: 0, damageDealt: 0 });
      const leaks = [{ enemyKey: CC.patriot.key, counted: true }, { enemyKey: 'enemy_1007_slime', counted: true }];
      h.m.lastResults = new Map([[p0.playerId, { ...clean(), perfect: false, leaked: leaks }], [p1.playerId, clean()]]);
      h.m.unitePlan = { helpers: [p1], leakers: [p0], leaked: leaks.map((l) => ({ enemyKey: l.enemyKey, sourcePlayerId: p0.playerId })), notReentered: new Map() };
      h.m.phase = 'UNITE';
      h.m.fields = [];
      // nothing killed yet: both still stand (the enemy count stays 2; the LP is what settle() would bill)
      assert.deepEqual(h.m._pendingLpView(p0), { uniteLeft: 2, pendingLp: want }, JSON.stringify(rules));
      // the result is in: the helpers killed the other one, the Patriot got through
      h.m.fields = [{ kind: 'unite', cc: true, done: true, result: { perPlayer: { [p1.playerId]: { leaked: [{ ...leaks[0], sourcePlayerId: p0.playerId }] } }, unspawned: [] } }];
      const one = rules.ccPatriot ? CC.patriot.leakLp + (rules.ccLastLine ? CC.lastLineLp : 0) : 1;
      assert.deepEqual(h.m._pendingLpView(p0), { uniteLeft: 1, pendingLp: one }, JSON.stringify(rules));
      h.m.phase = 'PREP';
    } finally { h.m.dispose(); }
  }
});

test('the battle\'s live leak count weighs a Patriot like the settlement (the HUD\'s pending LP)', async () => {
  const { battleProgress } = await import('../../server/sim/spec.js');
  const fake = (rules) => ({ flags: { rules }, _perPlayer: { p_0: { leaked: [{ enemyKey: CC.patriot.key, counted: true }, { enemyKey: 'enemy_x', counted: true }] } } });
  assert.equal(battleProgress(fake({ ccPatriot: 1 })).leaks, CC.patriot.leakLp + 1);
  assert.equal(battleProgress(fake({})).leaks, 2);
});

const cursedIn = (ps) => [...ps.hand, ...ps.temp].filter((p) => p && p.kind === 'item' && p.id === CC.junk.itemId);

test('ccJunk 1: everyone starts with Toxic Waste; it never expires in the temp hand and is never replaced away', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccJunk: 1 } }).start();
  try {
    h.toPrep(1);
    for (const id of ['p_0', 'p_1']) assert.equal(cursedIn(h.ps(id)).length, 1, id);
    const ps = h.ps('p_0');
    const rec = h.m.gd.item(CC.junk.itemId);
    assert.equal(rec.giveBondId, null, 'no 变形同构体 pairing');
    assert.equal(rec.hideInShop, true);
    // in the temp hand past its deadline: kept
    const [hammer] = cursedIn(ps);
    const loc = ps.find(hammer.uid);
    ps._detach(loc);
    const slot = ps.temp.indexOf(null) >= 0 ? ps.temp.indexOf(null) : 0;
    ps.temp[slot] = hammer;
    ps.prepsEnded = 1e6;
    ps.resolveTemp();
    assert.ok(ps.find(hammer.uid), 'still there after the temp deadline');
    // equipped next to another item, then a third item: the other one goes, the hammer stays
    const opId = h.m.gd.visibleChess.find((id) => h.m.gd.tierOf(id) === 1 && !h.m.gd.chess(id).isGolden);
    const op = ps.newPiece('chess', opId);
    assert.ok(ps.stow(op, { allowTemp: true }));
    const items = Object.keys(h.m.data.items).filter((id) => h.m.gd.item(id)?.itemType === 'EQUIP' && !h.m.gd.item(id).isGolden && id !== CC.junk.itemId && !String(h.m.gd.item(id).kind).startsWith('consume'));
    const [a, b] = [items[0], items[5]].map((id) => { const p = ps.newPiece('item', id); ps.stow(p, { allowTemp: true }); return p; });
    assert.equal(ps.equip(hammer.uid, op.uid).ok, true);
    assert.equal(ps.equip(a.uid, op.uid).ok, true);
    assert.ok(ps.equip(b.uid, op.uid, hammer.uid).error, 'picking the hammer to replace is refused');
    assert.equal(ps.equip(b.uid, op.uid).ok, true, 'the default replaces the other item');
    assert.ok(!op.items.some((x) => x.uid === a.uid), 'the other item went');
    assert.ok(op.items.some((x) => x.id === CC.junk.itemId), 'the hammer stays on');
    // and the player cannot destroy it in the hand (g.destroy): sell its carrier to get it back there
    const h2 = ps.newPiece('item', CC.junk.itemId);
    ps.stow(h2, { allowTemp: true });
    assert.ok(ps.destroy(h2.uid).error, 'destroying the Toxic Waste is refused');
    assert.ok(ps.find(h2.uid), 'still there');
  } finally { h.m.dispose(); }
});

test('ccJunk 2: a round\'s income −1 while the Toxic Waste is not equipped', () => {
  const income = (rules, equip) => {
    const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: rules }).start();
    try {
      h.toPrep(1);
      const ps = h.ps('p_0');
      if (equip) {
        const op = ps.newPiece('chess', h.m.gd.visibleChess.find((id) => h.m.gd.tierOf(id) === 1 && !h.m.gd.chess(id).isGolden));
        ps.stow(op, { allowTemp: true });
        const [hammer] = cursedIn(ps);
        if (hammer) assert.equal(ps.equip(hammer.uid, op.uid).ok, true);
      }
      const before = ps.funds;
      ps.startRound(2);
      return ps.funds - before;
    } finally { h.m.dispose(); }
  };
  const base = income({}, false);
  assert.equal(income({ ccJunk: 1 }, false), base, 'Junk 1: no income loss');
  assert.equal(income({ ccJunk: 2 }, false), base - CC.junk.incomeLoss);
  assert.equal(income({ ccJunk: 2 }, true), base, 'equipped: no loss');
  // round 1: no loss (the hammer has just arrived)
  const first = (rules) => { const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: rules }).start(); try { h.toPrep(1); return h.ps('p_0').funds; } finally { h.m.dispose(); } };
  assert.equal(first({ ccJunk: 2 }), first({}), 'round 1 starts with the usual Funds');
});

test('ccVengeance: Reids by the highest active alliance — 1 at 200 stacks, +1 per 200 above at level 3; the final rounds always 1 (the highest of anyone\'s), once per field', () => {
  const V = CC.vengeance;
  for (const [level, top] of [[1, 1], [3, 3]]) {
    const h = makeMatch({ mode: 'coop', humans: 2, seed: 4, lobbyRules: { ccVengeance: level } });
    try {
      h.m.round = 5;
      const [p0, p1] = [h.ps('p_0'), h.ps('p_1')];
      const reids = (ps) => h.m.riskBounties(ps).filter((b) => b.card.enemyKey === V.key).reduce((n, b) => n + b.card.count, 0);
      const boss = () => h.m.bossSubWave(['p_0', 'p_1']).get('p_0').filter((b) => b.card.enemyKey === V.key);
      // p_0: 650 stacks of an active alliance (level 3: 1 + 2 for the 450 above 200); p_1: 150 active, 500 inactive
      p0.layers = { yanShip: 650, kjeragShip: 200 }; p0.bonds = { yanShip: { active: true }, kjeragShip: { active: true } };
      p1.layers = { yanShip: 150, kjeragShip: 500 }; p1.bonds = { yanShip: { active: true }, kjeragShip: { active: false } };
      assert.equal(reids(p0), top, `level ${level}: 650 stacks`);
      assert.equal(reids(p1), 0, `level ${level}: 150 active (500 inactive)`);
      assert.equal(boss()[0].card.count, top, 'the final rounds: the highest of anyone\'s');
      assert.ok(boss()[0].card.leftFirst);
      p0.layers = { yanShip: 399 };
      assert.equal(reids(p0), 1, `level ${level}: 399 stacks`);
      p0.layers = { yanShip: 120 };
      assert.equal(reids(p0), 0, `level ${level}: below 200`);
      assert.equal(boss()[0].card.count, 1, 'the final rounds: always 1');
    } finally { h.m.dispose(); }
  }
});

test('ccFamiglia Cleaner in solo: CC.silencers.soloCount (2) Silencers', () => {
  const h = makeMatch({ mode: 'solo', seed: 4, lobbyRules: { ccFamiglia: 1 } });
  try {
    h.m.round = 10;
    const [b] = h.m.riskBounties(h.ps('p_0'));
    assert.equal(b.card.enemyKey, CC.silencers.key);
    assert.equal(b.card.count, 2);
  } finally { h.m.dispose(); }
});
