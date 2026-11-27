// The Transmitter+ cheat (Fish, GitHub #133; shared/ruleData.js TRANSMITTER_PLUS, server/match/builtinMeta.js
// transmitterPlusOffer / transmitterPlusGifts): alone, the first use on a tier-6 operator offers Muelsyse, any other
// use an operator of the player's Alliance with the most stacks; with teammates and nobody needing the original,
// random teammates get an operator of their own top Alliance; rooms of 5 or more send one more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, giveItem, DATA, legalTileFor } from './harness.js';
import { createRegistry } from '../../server/match/effectsMeta.js';
import { TRANSMITTER_PLUS } from '../../shared/ruleData.js';

const QUIET = { warn() {}, error() {}, info() {} };
const REG = createRegistry({ log: QUIET });
const OK = { ok: true };
const BEACON = 'chess_item_5_04_e_a';
const MU = TRANSMITTER_PLUS.muelsyse;

function setup({ mode = 'solo', humans = 1, seed = 31, plus = true } = {}) {
  const h = makeMatch({ mode, humans, seed, registry: REG, fake: true, lobbyRules: plus ? { transmitterPlus: true } : {} }).start();
  h.toPrep(1);
  const m = h.m;
  for (const ps of m.players.values()) {
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
    ps.funds = 50; ps.layers = {}; ps.pendingFunds = 0; ps.shop.freeRefreshes = 0; ps.bandId = null;
    ps.recompute();
  }
  const equip = (item, target, pid = 'p_0') => m.handle(pid, { t: 'g.equip', itemUid: item.uid, targetUid: target.uid });
  return { h, m, equip };
}
const plain = (pred = () => true) => Object.values(DATA.chess)
  .filter((c) => c.visible && !c.isGolden && c.goldenId && (c.garrisonIds || []).every((g) => DATA.garrisons[g].eventType === 'IN_BATTLE') && pred(c))
  .map((c) => c.chessId).sort();
const offerIds = (ps) => ps.offers[0].slots.map((s) => s.id);
const gifts = (ps) => ps.effects.filter((e) => e.key === 'effect:builtin_gift');
const deploy = (m, ps, id) => give(m, ps, id, 'board', legalTileFor(m, ps, id));
/** `ps` gets an operator of `bond` on the board and `n` stacks of it. */
const stack = (m, ps, bond, n, skip = []) => {
  const id = plain((c) => c.bonds.includes(bond) && c.tier <= 2 && !skip.includes(c.chessId))[0];
  deploy(m, ps, id);
  ps.layers[bond] = n;
  ps.recompute();
  return id;
};

test('Transmitter+ is a cheat rule that renames the item and adds the note', async () => {
  const { RULES } = await import('../../shared/rules.js');
  const { rulesChangeData } = await import('../../shared/ruleData.js');
  assert.ok(rulesChangeData({ transmitterPlus: true }));
  assert.ok(!rulesChangeData({ transmitterPlus: false }));
  assert.equal(RULES.find((r) => r.key === 'transmitterPlus')?.category, 'cheat');
});

test('alone: the first use on a tier-6 operator offers Muelsyse; later ones an operator of the top-stack Alliance', () => {
  const { h, m, equip } = setup({ seed: 31 });
  const p0 = h.ps('p_0');
  const six = plain((c) => c.tier === 6 && c.chessId !== MU && c.bonds.length);
  assert.deepEqual(equip(giveItem(m, p0, BEACON), give(m, p0, six[0], 'hand')), OK);
  const ids = offerIds(p0);
  assert.equal(ids.length, 2);
  assert.ok(ids.some((x) => m.gd.baseIdOf(x) === MU), `Muelsyse offered: ${ids}`);
  p0.offers.length = 0;
  // second tier-6 use: no forced Muelsyse; the Alliance with the most stacks gets a card instead
  const bond = DATA.chess[plain((c) => c.tier === 6 && c.chessId !== MU && c.bonds.length)[1]].bonds[0];
  stack(m, p0, bond, 5);
  assert.deepEqual(equip(giveItem(m, p0, BEACON), give(m, p0, six[2], 'hand')), OK);
  const ids2 = offerIds(p0);
  assert.ok(ids2.some((x) => (DATA.chess[x].bonds || []).includes(bond)), `top Alliance ${bond} offered: ${ids2}`);
  h.invariants();
});

test('alone: any tier — the offer always holds an operator of the Alliance with the most stacks', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { h, m, equip } = setup({ seed });
    const p0 = h.ps('p_0');
    const t3 = plain((c) => c.tier === 3 && c.bonds.length);
    const target = t3[seed % t3.length];
    const bonds = Object.keys(DATA.bonds).filter((b) => plain((c) => c.bonds.includes(b) && c.tier === 3 && c.chessId !== target).length >= 2 && plain((c) => c.bonds.includes(b) && c.tier <= 2).length);
    const low = bonds[seed % bonds.length];
    const top = bonds[(seed + 1) % bonds.length];
    stack(m, p0, low, 1);
    stack(m, p0, top, 4);
    assert.deepEqual(equip(giveItem(m, p0, BEACON), give(m, p0, target, 'hand')), OK);
    const ids = offerIds(p0);
    assert.ok(ids.some((x) => (DATA.chess[x].bonds || []).includes(top)), `seed ${seed}: ${top} in ${ids}`);
    assert.equal(new Set(ids).size, ids.length);
    for (const x of ids) assert.ok(DATA.chess[x].tier <= 3);
    h.invariants();
  }
});

test('rule off: the Transmitter is unchanged (no forced Muelsyse on the first tier-6 use for every seed)', () => {
  let without = 0;
  for (let seed = 1; seed <= 8; seed++) {
    const { h, m, equip } = setup({ seed, plus: false });
    const p0 = h.ps('p_0');
    const six = plain((c) => c.tier === 6 && c.chessId !== MU && c.bonds.length);
    assert.deepEqual(equip(giveItem(m, p0, BEACON), give(m, p0, six[0], 'hand')), OK);
    if (!offerIds(p0).some((x) => m.gd.baseIdOf(x) === MU)) without++;
  }
  assert.ok(without > 0);
});

test('co-op, nobody needs the original: a teammate gets an operator of its own top-stack Alliance instead', () => {
  const { h, m, equip } = setup({ mode: 'coop', humans: 2, seed: 33 });
  const p0 = h.ps('p_0'), p1 = h.ps('p_1');
  const target = plain((c) => c.tier === 3 && c.bonds.length)[0];
  const tb = DATA.chess[target].bonds;
  const mine = Object.keys(DATA.bonds).find((b) => !tb.includes(b) && plain((c) => c.bonds.includes(b) && c.tier === 3 && !c.bonds.some((x) => tb.includes(x))).length && plain((c) => c.bonds.includes(b) && c.tier <= 2 && !c.bonds.some((x) => tb.includes(x))).length);
  const own = plain((c) => c.bonds.includes(mine) && c.tier <= 2 && !c.bonds.some((x) => tb.includes(x)))[0];
  deploy(m, p1, own); p1.layers[mine] = 3; p1.recompute();
  assert.deepEqual(equip(giveItem(m, p0, BEACON), give(m, p0, target, 'hand')), OK);
  const g = gifts(p0);
  assert.equal(g.length, 1);
  assert.equal(g[0].params.toPlayerId, 'p_1');
  assert.notEqual(m.gd.baseIdOf(g[0].params.chessId), target, 'not the original');
  assert.ok(DATA.chess[g[0].params.chessId].bonds.includes(mine), 'from the teammate\'s top Alliance');
  assert.equal(DATA.chess[g[0].params.chessId].tier, 3, 'same tier');
  h.toPrep(2);
  assert.ok([...p1.hand, ...p1.temp, ...p1.board.values()].some((p) => p && p.id === g[0].params.chessId), 'delivered');
  h.invariants();
});

test('co-op, a teammate needs the original: the official gift', () => {
  const { h, m, equip } = setup({ mode: 'coop', humans: 2, seed: 35 });
  const p0 = h.ps('p_0'), p1 = h.ps('p_1');
  const target = plain((c) => c.tier === 3 && c.bonds.length)[0];
  deploy(m, p1, plain((c) => c.bonds.includes(DATA.chess[target].bonds[0]) && c.chessId !== target)[0]);
  assert.deepEqual(equip(giveItem(m, p0, BEACON), give(m, p0, target, 'hand')), OK);
  assert.deepEqual(gifts(p0).map((e) => [e.params.toPlayerId, e.params.chessId]), [['p_1', target]]);
  h.invariants();
});

test('5 or more players: two teammates needing the original both get it; none needing it, 3 teammates get one', () => {
  let { h, m, equip } = setup({ mode: 'coop', humans: 5, seed: 37 });
  const target = plain((c) => c.tier === 3 && c.bonds.length)[0];
  const mate = plain((c) => c.bonds.includes(DATA.chess[target].bonds[0]) && c.chessId !== target)[0];
  deploy(m, h.ps('p_2'), mate);
  deploy(m, h.ps('p_3'), mate);
  assert.deepEqual(equip(giveItem(m, h.ps('p_0'), BEACON), give(m, h.ps('p_0'), target, 'hand')), OK);
  assert.deepEqual(gifts(h.ps('p_0')).map((e) => [e.params.toPlayerId, e.params.chessId]).sort(), [['p_2', target], ['p_3', target]]);
  ({ h, m, equip } = setup({ mode: 'coop', humans: 5, seed: 39 }));
  assert.deepEqual(equip(giveItem(m, h.ps('p_0'), BEACON), give(m, h.ps('p_0'), target, 'hand')), OK);
  const g = gifts(h.ps('p_0'));
  assert.equal(g.length, 3);
  assert.equal(new Set(g.map((e) => e.params.toPlayerId)).size, 3, 'three different teammates');
  for (const e of g) assert.notEqual(e.params.toPlayerId, 'p_0');
  h.invariants();
});
