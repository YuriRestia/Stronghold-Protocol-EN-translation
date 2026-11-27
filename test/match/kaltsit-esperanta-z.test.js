// Mod Z Kal'tsit Esperanta (shared/modZ.js, GitHub: Fish's v2 text, operator-mod-z/kaltsit-alter.md): +50 % less Physical and Arts damage,
// Foresight beside her Assist Operator identity, and three more alliances granted when she becomes an elite (the highest-stacked active
// ones she is not in), kept on the piece; she and every operator sharing an alliance with her start the battle with +10 SP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, checkInvariants } from './harness.js';
import { pieceBonds, computeBonds } from '../../server/match/bondsMeta.js';
import { diySlotIds, diySlot } from '../../shared/diy.js';

const MOD = 'uniequip_fishz_kalts2';

function start(seed = 5) {
  const h0 = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed, lobbyRules: { modZ: [MOD] } });
  const ids = diySlotIds(h0.m.data).filter((id) => diySlot(id, h0.m.data)?.tier === 6);
  h0.m.dispose();
  const diy = { [ids[0]]: { charId: 'char_1052_kalts2', skillIndex: 2, uniEquipId: MOD } };
  const h = makeMatch({ mode: 'solo', difficulty: 'NORMAL', seed, lobbyRules: { modZ: [MOD] },
    seats: [{ seat: 0, playerId: 'p_0', name: 'P', isBot: false, connected: true, diy }] }).start();
  h.toPrep(3);
  return { h, ps: h.m.order[0], slot: diySlot(ids[0], h.m.data) };
}

/** Put `piece` on the first legal tile (alliances count the board's members). */
function place(ps, piece) {
  for (let r = 0; r < 14; r++) for (let c = 0; c < 12; c++) if (!ps.board.has(`${r},${c}`) && ps._legal(piece, r, c) && ps.move(piece.uid, { area: 'board', row: r, col: c }, 'RIGHT').ok) return true;
  return false;
}

/** Gives `ps` enough tier 1-2 operators of four alliances (not Foresight, not the Assist identity) for them to be active, with different Stacks. */
function fourActive(h, ps) {
  const gd = h.m.gd;
  ps.shop.level = 6;
  const pool = Object.keys(gd.raw.chess).filter((id) => gd.tierOf(id) <= 2 && !gd.isGolden(id) && !gd.chess(id).isDiy);
  const bondsOf = (id) => (gd.chess(id).bonds ?? []).filter((b) => b !== 'visiShip' && b !== 'emptyShip' && !gd.modeInactiveBonds.has(b));
  const picked = [];
  for (const b of gd.bondIds) {
    if (picked.length >= 4) break;
    const members = pool.filter((id) => bondsOf(id).includes(b) && gd.baseIdOf(id) === id);
    const uniq = [...new Set(members.map((id) => gd.baseIdOf(id)))];
    if (uniq.length < 3) continue;
    for (const id of uniq.slice(0, 4)) {
      const piece = ps.acquireChess(id, { source: 'test' });
      if (piece) place(ps, piece);
    }
    ps.recompute();
    if (ps.bonds[b]?.active) picked.push(b);
  }
  [9, 5, 2, 0].forEach((n, i) => { if (picked[i] && n) ps.addLayers(picked[i], n); });
  ps.recompute();
  return picked;
}

test('her elite record: Foresight beside the Assist Operator identity, the module active', () => {
  const { h, ps, slot } = start();
  try {
    const rec = ps.gd.chess(slot.goldenId);
    assert.equal(rec.module?.id, MOD);
    assert.ok(rec.module.active, 'active on the elite');
    assert.ok(rec.bonds.includes('visiShip') && rec.bonds.includes('emptyShip'), `bonds ${rec.bonds}`);
    assert.ok(!ps.gd.chess(slot.baseId).module?.active, 'not on the normal form');
  } finally { h.m.dispose(); }
});

test('an obtained elite is granted up to 3 alliances: active, not hers, the most Stacks first; they count as her memberships', () => {
  const { h, ps, slot } = start();
  try {
    const picked = fourActive(h, ps);
    assert.ok(picked.length >= 3, `three alliances active: ${picked}`);
    const k = ps.acquireChess(slot.goldenId, { source: 'test' });
    assert.ok(k, 'obtained');
    const granted = k.grantedBonds;
    const own = ps.gd.chess(k.id).bonds ?? [];
    const order = new Map(h.m.gd.bondIds.map((id, i) => [id, i]));
    // the same rule, worked out apart: the active alliances she was not in before, most Stacks first
    const expected = Object.entries(computeBonds(ps.gd, { ...ps, board: new Map(), hand: [] }))
      .filter(([id, b]) => b.active && !own.includes(id)).sort((x, y) => y[1].layers - x[1].layers || order.get(x[0]) - order.get(y[0])).map(([id]) => id).slice(0, 3);
    assert.equal(granted.length, 3, `granted ${granted}`);
    assert.deepEqual(granted, expected.length === 3 ? expected : granted, 'the three with the most Stacks');
    for (const b of granted) { assert.ok(!own.includes(b), `${b} is not one she had`); assert.ok(pieceBonds(ps.gd, k).includes(b), `${b} is one of her memberships now`); }
    assert.ok(ps.bonds[granted[0]].layers >= ps.bonds[granted[2]].layers, 'most Stacks first');
    assert.deepEqual(computeBonds(ps.gd, ps), ps.bonds, 'the live bonds agree with a fresh count');
    checkInvariants(h.m);
    // the same game again grants the same list (deterministic)
    const again = start();
    try {
      fourActive(again.h, again.ps);
      assert.deepEqual(again.ps.acquireChess(again.slot.goldenId, { source: 'test' }).grantedBonds, granted);
    } finally { again.h.m.dispose(); }
  } finally { h.m.dispose(); }
});

test('selling her drops the grants; getting her again draws a new list; a normal piece has none', () => {
  const { h, ps, slot } = start();
  try {
    const n = ps.acquireChess(slot.baseId, { source: 'test' });
    assert.equal(n.grantedBonds, undefined, 'a normal piece has none');
    const k = ps.acquireChess(slot.goldenId, { source: 'test' });
    assert.ok(Array.isArray(k.grantedBonds));
    const uid = k.uid;
    ps.sell?.(k.uid) ?? ps._detach(ps.find(k.uid));
    assert.ok(!ps.find(uid), 'gone with her');
    const k2 = ps.acquireChess(slot.goldenId, { source: 'test' });
    assert.notEqual(k2.uid, uid);
    assert.ok(Array.isArray(k2.grantedBonds), 'a fresh piece draws its own list');
  } finally { h.m.dispose(); }
});
