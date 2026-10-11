// 变形同构体 and the bond member count on the real match paths (player report after 0.1.0: "缪尔赛思的变形同构体配上对应
// 职业转职的装备能使装备的干员吃到对应盟约的加成，但是那个盟约的人口数量没有把转职之后的干员算进去").
// Official rule: band 变形者集群 "与特定装备一同装备时装备者将视为特定盟约成员"; the item's talent (character_table
// trap_1073_acarm073) lists the 14 pairings ("“维式重锤”系列装备→【维多利亚】盟约" …); 缪尔赛思's 特质 garrison_76
// "<获得时>获得1个“变形同构体”". The wearer is a member: it counts for the bond's activation like any member — on the
// board only for these BOARD bonds, once per operator (distinct members, normal and elite alike).
// The server already counted it (prep, battle input, views, the battle); what the player saw was the client's bond
// popup and card (test/ui/morph-bonds.test.js). This suite pins the count on every path, and the item ids the
// client now gets with a teammate's units (prep scouting UnitInfo, the battle's UnitInfo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, give, giveItem, DATA, legalTileFor } from './harness.js';
import { unitBonds, isMember } from '../../server/sim/content/support/index.js';
import { unitInfo } from '../../server/sim/snapshot.js';

const ISO = 'chess_item_6_09_e_a';
const ISO_B = 'chess_item_6_09_e_b';
const HAMMER = 'chess_item_1_01_e_a';
const GRANTS = Object.values(DATA.items).filter((r) => r.giveBondId).map((r) => r.id).sort();

/** A target chess outside `bond` (and not 调和: its +1 would blur the count). */
const outsider = (bond) => Object.values(DATA.chess).find((c) => c.visible && !c.isGolden && c.tier <= 2 && !c.bonds.includes(bond) && !c.bonds.includes('maniShip')).chessId;
const members = (bond) => Object.values(DATA.chess).filter((c) => c.visible && !c.isGolden && c.bonds.includes(bond) && !c.bonds.includes('maniShip')).map((c) => c.chessId).sort();

/** PREP R1 of a real match (all 23 bonds: 绝境), the player's pieces cleared. */
function prep({ mode = 'solo', humans = 1, fake = false, seed = 21 } = {}) {
  const h = makeMatch({ mode, difficulty: 'HARD', humans, seed, fake }).start();
  h.toPrep(1);
  for (const ps of h.m.players.values()) {
    for (const p of [...ps.board.values(), ...ps.hand.filter(Boolean), ...ps.temp.filter(Boolean)]) if (p.kind === 'chess') ps.returnCopies(p);
    ps.board.clear(); ps.hand.fill(null); ps.temp.fill(null); ps.offers.length = 0;
    ps.funds = 50; ps.bandId = null;
    ps.recompute();
  }
  return h;
}
const ok = (r) => assert.deepEqual(r, { ok: true });
/** A chess with `items` (equipped through g.equip, in this order), from the hand, then onto the board when `board`. */
function wearer(h, pid, chessId, itemIds, { board = true } = {}) {
  const { m } = h; const ps = h.ps(pid);
  const p = give(m, ps, chessId, 'hand');
  for (const id of itemIds) ok(m.handle(pid, { t: 'g.equip', itemUid: giveItem(m, ps, id).uid, targetUid: p.uid }));
  if (board) {
    const at = legalTileFor(m, ps, chessId);
    ok(m.handle(pid, { t: 'g.move', uid: p.uid, to: { area: 'board', row: at[0], col: at[1] } }));
  }
  return p;
}
const place = (h, pid, chessId) => {
  const { m } = h; const ps = h.ps(pid);
  const p = give(m, ps, chessId, 'hand');
  const at = legalTileFor(m, ps, chessId);
  ok(m.handle(pid, { t: 'g.move', uid: p.uid, to: { area: 'board', row: at[0], col: at[1] } }));
  return p;
};
const count = (ps, bond) => ps.bonds[bond]?.count ?? 0;

test('缪尔赛思 hands out 变形同构体 on purchase (garrison_76), the bought copy pairs with any bond item', () => {
  const h = prep();
  const { m } = h; const ps = h.ps('p_0');
  ps.shop.slots[0] = { kind: 'chess', id: 'chess_char_6_11_a', price: 6, basePrice: 6, sold: false, frozen: false };
  ok(m.handle('p_0', { t: 'g.buy', slot: 0 }));
  const iso = ps.hand.find((p) => p && p.id === ISO);
  assert.ok(iso, 'the 变形同构体 is in the hand');
  const t = give(m, ps, outsider('victoriaShip'), 'hand');
  ok(m.handle('p_0', { t: 'g.equip', itemUid: iso.uid, targetUid: t.uid }));
  ok(m.handle('p_0', { t: 'g.equip', itemUid: giveItem(m, ps, HAMMER).uid, targetUid: t.uid }));
  assert.equal(count(ps, 'victoriaShip'), 0, 'on the bench: BOARD bonds count the board only');
  const at = legalTileFor(m, ps, t.id);
  ok(m.handle('p_0', { t: 'g.move', uid: t.uid, to: { area: 'board', row: at[0], col: at[1] } }));
  assert.equal(count(ps, 'victoriaShip'), 1);
  h.invariants();
});

test('every pairing (18 bond items × normal / golden, both 变形同构体): the wearer counts in prep, in the views, in the battle input and in the real battle', () => {
  const grants = Object.values(DATA.items).filter((r) => r.giveBondId);
  assert.equal(grants.length, 36);
  assert.equal(new Set(grants.map((r) => r.giveBondId)).size, 14, '14 bonds have a bond item (the official talent\'s list)');
  for (const r of grants) {
    const bond = r.giveBondId;
    const iso = r.isGolden ? ISO_B : ISO; // golden bond items with the golden 变形同构体, normal with normal
    const h = prep({ seed: 31 });
    const { m } = h; const ps = h.ps('p_0');
    const [a, b] = members(bond);
    place(h, 'p_0', a); place(h, 'p_0', b);
    assert.equal(count(ps, bond), 2, `${bond}: two members`);
    // the bond item first, then the 变形同构体 (the other order: the next test)
    const w = wearer(h, 'p_0', outsider(bond), [r.id, iso]);
    assert.equal(count(ps, bond), 3, `${r.id}: the wearer is the third member`);
    assert.equal(ps.bonds[bond].active, true, `${r.id}: the threshold of 3 (2 for add-on bonds) is reached with it`);
    assert.equal(ps.battleInput().bonds[bond].count, 3, `${r.id}: battle input`);
    assert.equal(ps.privateView().bonds.find((x) => x.bondId === bond).count, 3, `${r.id}: m.private`);
    let battle = null;
    const orig = m.newBattle.bind(m);
    m.newBattle = (o) => { const bt = orig(o); battle ??= bt; return bt; };
    assert.ok(h.drive(() => battle != null), 'combat starts');
    assert.equal(battle.getPlayer('p_0').bonds[bond].count, 3, `${r.id}: the battle's count`);
    const u = battle.allyUnits.find((x) => x.kind === 'op' && x.uid === w.uid);
    assert.ok(unitBonds(u).includes(bond) && isMember(battle, u, bond), `${r.id}: the battle's member`);
  }
});

test('bench vs board, half pairs, two 变形同构体, the equip order, distinct members', () => {
  const h = prep({ fake: true });
  const { m } = h; const ps = h.ps('p_0');
  const bond = 'victoriaShip';
  const target = outsider(bond);
  // half pairs grant nothing
  wearer(h, 'p_0', target, [HAMMER]);
  assert.equal(count(ps, bond), 0, 'the bond item alone');
  // A normal plus its golden occupy 3 of the tier-VI cap. The lone copy is a separate match so the pair can sit at that cap.
  const alone = prep({ fake: true });
  wearer(alone, 'p_0', target, [ISO]);
  assert.equal(count(alone.ps('p_0'), bond), 0, '变形同构体 alone');
  const h2 = prep({ fake: true });
  const other = Object.values(DATA.chess).find((c) => c.visible && !c.isGolden && c.tier <= 2 && !c.bonds.includes(bond) && c.chessId !== target).chessId;
  wearer(h2, 'p_0', other, [ISO, ISO_B]);
  assert.equal(count(h2.ps('p_0'), bond), 0, 'two of them');
  // order: 变形同构体 first
  const h3 = prep({ fake: true });
  const w = wearer(h3, 'p_0', target, [ISO, HAMMER], { board: false });
  assert.equal(count(h3.ps('p_0'), bond), 0, 'the pair on the bench');
  const at = legalTileFor(h3.m, h3.ps('p_0'), target);
  ok(h3.m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'board', row: at[0], col: at[1] } }));
  assert.equal(count(h3.ps('p_0'), bond), 1, 'deployed');
  ok(h3.m.handle('p_0', { t: 'g.move', uid: w.uid, to: { area: 'hand', idx: 9 } }));
  assert.equal(count(h3.ps('p_0'), bond), 0, 'back to the bench');
  // distinct members: two converted copies of one operator, or a converted copy beside a plain one, are one member
  const h4 = prep({ fake: true });
  const ps4 = h4.ps('p_0');
  wearer(h4, 'p_0', target, [ISO, HAMMER]);
  const plain = place(h4, 'p_0', target); // (a third copy would merge into the elite, the items back to the hand)
  assert.equal(count(ps4, bond), 1, 'converted + plain copy: one member');
  // (another 维式重锤 would merge with the equipped one into the golden hammer: the 战栗 one of the series)
  for (const id of [ISO_B, 'chess_item_2_03_e_a']) ok(h4.m.handle('p_0', { t: 'g.equip', itemUid: giveItem(h4.m, ps4, id).uid, targetUid: plain.uid }));
  assert.equal(plain.items.length, 2);
  assert.equal(count(ps4, bond), 1, 'two converted copies: one member');
  // and it never doubles a real member: a member wearing the pair still counts once
  const h5 = prep({ fake: true });
  wearer(h5, 'p_0', members(bond)[0], [ISO, HAMMER]);
  assert.equal(count(h5.ps('p_0'), bond), 1);
  for (const x of [h, alone, h2, h3, h4, h5]) x.invariants();
});

test('a teammate\'s views: m.public counts the wearer; the scouting UnitInfo and the battle\'s UnitInfo carry the items', () => {
  const h = prep({ mode: 'coop', humans: 2, seed: 41 });
  const { m } = h;
  const ps = h.ps('p_0');
  const bond = 'victoriaShip';
  const [a, b] = members(bond);
  place(h, 'p_0', a); place(h, 'p_0', b);
  const w = wearer(h, 'p_0', outsider(bond), [ISO, HAMMER]);
  const pub = m.publicView().players.find((p) => p.playerId === 'p_0');
  assert.equal(pub.bonds.find((x) => x.bondId === bond).count, 3, 'm.public players[].bonds');
  const meta = m.prepFieldMeta(ps);
  const u = meta.units.find((x) => x.uid === w.uid);
  assert.deepEqual(u.items, [ISO, HAMMER], 'prep scouting UnitInfo');
  assert.equal(meta.units.find((x) => x.defId === a).items, undefined, 'no items: no field');
  let battle = null;
  const orig = m.newBattle.bind(m);
  m.newBattle = (o) => { const bt = orig(o); if (o.players?.some((p) => p.playerId === 'p_0')) battle ??= bt; return bt; };
  assert.ok(h.drive(() => battle != null), 'combat starts');
  const su = battle.allyUnits.find((x) => x.kind === 'op' && x.uid === w.uid);
  assert.deepEqual(unitInfo(su).items, [ISO, HAMMER], 'the battle\'s UnitInfo (m.field / spawn events)');
  const plain = battle.allyUnits.find((x) => x.kind === 'op' && x.defId === a);
  assert.equal(unitInfo(plain).items, undefined, 'no items: no field');
  assert.equal(battle.enemies.every((e) => unitInfo(e).items === undefined), true, 'enemies: never');
});
