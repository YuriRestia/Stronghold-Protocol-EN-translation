// §35.63: 终极 cycle 2 — core-bond mains for carries, and the bots' level curve and layer trade. (fork, 2026-11-11: the
// example agent's calls, the digest rows and the executor's guards for plan seats are External AI, shelved:
// test/shelved/external-ai/abyss-advisor.shelved.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlaybook } from '../../server/ai/playbook.js';
import { strategyCandidates } from '../../server/ai/strategy.js';
import { buyLoopSteps, levelUp } from '../../server/match/bot.js';
import { DATA, makeMatch, give, legalTileFor } from './harness.js';

const run = gen => { for (const step of gen) void step; };
function legacySeat(t) {
  const h = makeMatch({ mode: 'solo', difficulty: 'ABYSS', seats: [{ seat: 0, playerId: 'ai_0', name: 'AI', isBot: true, connected: true }], seed: 3 });
  t.after(() => h.m.dispose()); h.start().toPrep();
  const m = h.m, ps = m.order[0];
  for (const p of ps.allChess()) ps.sell(p.uid);
  ps.funds = 0; ps.shop.freeRefreshes = 0; ps.shop.frozen = false;
  for (const slot of ps.shop.slots) if (slot) slot.sold = true;
  return { m, ps };
}

test('a carry candidate leads with a core bond; round 65: the announced leader adds nothing to finalAssault', () => {
  const book = buildPlaybook(DATA, { modeId: 'mode_single_abyss' });
  const core = new Set(book.bonds.filter(b => b.core).map(b => b.id));
  const prep = boss => strategyCandidates(book, { playerId: 'self', round: 4, band: { id: 'band_sarkazb' }, availability: {},
    board: [], bench: [], opponents: [], factions: [], economy: { level: 2 }, deployCap: 6, boss: { id: boss } }).candidates;
  const plain = prep('boss_1');
  assert.ok(plain.length >= 2);
  assert.ok(plain.filter(c => c.role === 'carry').every(c => core.has(c.main)), plain.map(c => c.main).join());
  // The maintainer rejected leader-specific drafting: no bossCounters, the same finalAssault against every leader.
  assert.equal(book.community.bossCounters, undefined);
  for (const boss of ['boss_2', 'boss_5']) for (const c of prep(boss)) {
    const same = plain.find(p => p.id === c.id);
    if (same) assert.equal(c.scoreParts.finalAssault, same.scoreParts.finalAssault, `${boss} ${c.id}`);
    assert.equal(c.scoreParts.survival, undefined);
  }
});

test('bots aim for level 5 at round 9 and stay there (§37.38: no level 6)', t => {
  const { m, ps } = legacySeat(t);
  const ids = DATA.chess ? Object.values(DATA.chess).filter(c => c.visible && !c.isGolden && c.tier <= 2).map(c => c.chessId) : [];
  for (const id of ids.slice(0, ps.deployCap)) give(m, ps, id, 'hand');
  for (const [round, from, to] of [[9, 4, 5], [11, 5, 5], [13, 5, 5], [8, 4, 4]]) {
    m.round = round; ps.shop.level = from; ps.shop.upgradePrice = 5; ps.funds = 6;
    levelUp(m, ps);
    assert.equal(ps.shop.level, to, `R${round}: level ${from} → ${to}`);
  }
  m.round = 12; ps.shop.level = 5; ps.shop.upgradePrice = 5; ps.funds = 100;
  levelUp(m, ps);
  assert.equal(ps.shop.level, 5, 'rich at level 5: still no level 6');
});

test('the layer trade buys a 获得时 layer unit of two active bonds and sells it again when the lineup does not take it', t => {
  const { m, ps } = legacySeat(t);
  m.round = 6;
  const KJERAG = ['chess_char_6_02_a', 'chess_char_5_14_a', 'chess_char_4_22_a'], STEAD = ['chess_char_6_03_a', 'chess_char_5_11_a', 'chess_char_4_01_a'];
  const OTHERS = Object.values(DATA.chess).filter(c => c.visible && !c.isGolden && c.tier >= 5 && !c.bonds.includes('kjeragShip')
    && !c.bonds.includes('steadShip')).map(c => c.chessId);
  for (const id of [...KJERAG, ...STEAD, ...OTHERS].slice(0, ps.deployCap)) give(m, ps, id, 'board', legalTileFor(m, ps, id));
  ps.recompute();
  assert.ok(ps.bonds.kjeragShip?.active && ps.bonds.steadShip?.active);
  const layers = { kjeragShip: ps.layers.kjeragShip || 0, steadShip: ps.layers.steadShip || 0 };
  ps.shop.slots[0] = { kind: 'chess', id: 'chess_char_1_02_a', basePrice: 2, sold: false, frozen: false }; // 角峰 +2
  ps.funds = 2;
  run(buyLoopSteps(m, ps, { maxRefreshes: 0 }));
  assert.equal(ps.shop.slots[0].sold, true);
  assert.ok(!ps.allChess().some(p => p.id === 'chess_char_1_02_a'), 'sold again');
  assert.equal(ps.funds, 1);
  assert.equal(ps.layers.kjeragShip, layers.kjeragShip + 2); assert.equal(ps.layers.steadShip, layers.steadShip + 2);
});
