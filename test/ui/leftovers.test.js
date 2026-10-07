// Client leftovers (unit level; the browser side is test/ui/leftovers.e2e.test.js):
//   1. a third item dropped on a full operator → the equip-replace dialog's data (ui/equipReplace.js) and the intent it
//      sends (g.equip {itemUid, targetUid, replaceUid}) — end to end against the real match engine: the picked item is
//      destroyed, the other stays; 销毁 is never offered for an equipped item (ui/facing.js itemDestroyable);
//   2. boss rounds: the level's 120 s countdown total (gameLogic phaseTotalSeconds) and the overtime DOT warning states
//      from m.public.overtimeAt (ui/matchStatus.js overtimeState);
//   3. a welcome with a new playerId while a room / match was on screen → 「服务器会话已重置…」 (store.js
//      sessionResetNotice), stale dialogs dismissed (components.js closeAllDialogs);
//   4. the solo pause control (pauseAvailable / pauseIntent / frozen clocks).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch, give, giveItem, legalTileFor } from '../match/harness.js';
import { placementContext, dropIntent, equipMerges, phaseTotalSeconds, countdownState } from '../../public/js/ui/gameLogic.js';
import { underframeActions, itemDestroyable } from '../../public/js/ui/facing.js';
import { replaceRequest, replaceIntent } from '../../public/js/ui/equipReplace.js';
import {
  overtimeState, bossLevelSeconds, overtimeDrainPerSec, pauseAvailable, pauseIntent, isPaused, frozenNow, remainAt, OVERTIME_WARN_BEFORE,
} from '../../public/js/ui/matchStatus.js';
import { sessionResetNotice, emptyMatch } from '../../public/js/store.js';
import { confirmDialog, alertDialog, closeAllDialogs } from '../../public/js/ui/components.js';
import { validateC2S } from '../../shared/protocol.js';
import { PHASE, GEO } from '../../shared/constants.js';

const getChess = (id) => DATA.chess[id] || null;
const getItem = (id) => DATA.items[id] || null;
const getToken = (id) => DATA.tokens[id] || null;
const STAGE = DATA.stages.act2autochess_m01;
const ctxOf = (priv) => placementContext({ priv, stage: STAGE, editable: true, getChess, getToken, getItem });
const EQUIP = Object.values(DATA.items).filter((i) => i.itemType === 'EQUIP' && !i.isGolden && !String(i.kind || '').startsWith('consume_on_equip'))
  .map((i) => i.id).sort();

describe('1. equip-replace dialog', () => {
  const RANGED = 'chess_char_1_01_a';
  const [A, B, C] = EQUIP;
  const priv = {
    alive: true, ready: false, funds: 10, deployCap: 8, deployCount: 1,
    board: [{ uid: 1, kind: 'chess', id: RANGED, row: 9, col: 3, items: [{ uid: 11, id: A }, { uid: 12, id: B }] }],
    hand: [{ uid: 3, kind: 'item', id: C }, ...new Array(GEO.HAND_SIZE - 1).fill(null)],
    temp: new Array(GEO.TEMP_SIZE).fill(null),
    shop: { slots: [] },
  };
  const ctx = ctxOf(priv);

  test('a third item on a full operator asks which equipped item to replace (both listed, with names)', () => {
    const intent = dropIntent(ctx, 3, { area: 'board', row: 9, col: 3 });
    assert.equal(intent.t, 'g.equip');
    assert.equal(intent.confirmReplace, true);
    const req = replaceRequest(ctx, intent, getChess, getItem);
    assert.equal(req.targetUid, 1);
    assert.equal(req.targetName, getChess(RANGED).name);
    assert.deepEqual(req.item, { uid: 3, id: C, name: getItem(C).name });
    assert.deepEqual(req.options.map((o) => [o.uid, o.id, o.name]), [[11, A, getItem(A).name], [12, B, getItem(B).name]]);
  });

  test('the picked item travels as replaceUid and the frame passes the protocol validator', () => {
    const intent = dropIntent(ctx, 3, { area: 'board', row: 9, col: 3 });
    const r = replaceIntent(intent, 12);
    assert.deepEqual(r, { t: 'g.equip', fields: { itemUid: 3, targetUid: 1, replaceUid: 12 } });
    assert.equal(validateC2S({ t: r.t, rid: 1, ...r.fields }), null);
    assert.deepEqual(replaceIntent(intent, null).fields, { itemUid: 3, targetUid: 1 }, 'no pick ⇒ no replaceUid');
  });

  test('no dialog when a slot is free or the equip completes an item merge', () => {
    const one = ctxOf({ ...priv, board: [{ ...priv.board[0], items: [{ uid: 11, id: A }] }] });
    const i1 = dropIntent(one, 3, { area: 'board', row: 9, col: 3 });
    assert.equal(i1.confirmReplace, false);
    assert.equal(replaceRequest(one, i1, getChess, getItem), null);
    // the same item as an equipped one (mergeable pair): the server merges instead of equipping
    const twin = ctxOf({ ...priv, hand: [{ uid: 3, kind: 'item', id: A }, ...priv.hand.slice(1)] });
    assert.equal(getItem(A).mergeable, true);
    assert.equal(equipMerges(twin, 3), true);
    assert.equal(dropIntent(twin, 3, { area: 'board', row: 9, col: 3 }).confirmReplace, false);
    assert.equal(equipMerges(ctx, 3), false);
  });

  test('a consume-on-equip item on a full operator opens the dialog too — all 24, 博士投影 included — except a 博士投影 on an elite (GitHub #263)', () => {
    // PRTS 卫戍协议/帮助 "达到上限强行佩戴会改为替换装备": the pick is destroyed, then the item resolves (a free slot is left)
    const consumables = Object.values(DATA.items).filter((x) => x.itemType === 'EQUIP' && String(x.kind).startsWith('consume_on_equip'));
    assert.equal(consumables.length, 24, '12 consume-on-equip items × normal / golden');
    const holo = ['chess_item_5_06_e_a', 'chess_item_5_06_e_b'];
    for (const it of consumables) {
      const hand = [{ uid: 3, kind: 'item', id: it.id }, ...priv.hand.slice(1)];
      const cx = ctxOf({ ...priv, hand });
      const intent = dropIntent(cx, 3, { area: 'board', row: 9, col: 3 });
      assert.equal(intent.confirmReplace, true, it.id);
      assert.deepEqual(replaceRequest(cx, intent, getChess, getItem).options.map((o) => o.uid), [11, 12], it.id);
      const one = ctxOf({ ...priv, board: [{ ...priv.board[0], items: [{ uid: 11, id: A }] }], hand });
      assert.equal(dropIntent(one, 3, { area: 'board', row: 9, col: 3 }).confirmReplace, false, `${it.id}: a free slot`);
      // an elite: the server refuses a 博士投影 (nothing would be replaced), every other consumable still replaces
      const elite = ctxOf({ ...priv, board: [{ ...priv.board[0], id: getChess(RANGED).goldenId, golden: true }], hand });
      assert.equal(dropIntent(elite, 3, { area: 'board', row: 9, col: 3 }).confirmReplace, !holo.includes(it.id), `${it.id} on an elite`);
    }
    // an operator in the hand (equippable since 下半) with two items: the same dialog
    const benchFull = ctxOf({ ...priv, board: [], hand: [{ uid: 3, kind: 'item', id: holo[0] }, { uid: 1, kind: 'chess', id: RANGED, items: [{ uid: 11, id: A }, { uid: 12, id: B }] }, ...priv.hand.slice(2)] });
    assert.equal(dropIntent(benchFull, 3, { area: 'hand', idx: 1 }).confirmReplace, true);
  });

  test('销毁 only for loose items: an equipped item is locked', () => {
    assert.deepEqual(underframeActions(ctx, 3), { retreat: false, sell: null, destroy: true });
    assert.equal(itemDestroyable(ctx, 3), true);
    assert.equal(itemDestroyable(ctx, 11), false, 'equipped (not an own piece entry)');
    // an index that lists equipped items (e.g. a future view) still never offers 销毁 for them
    const pieces = new Map(ctx.pieces);
    pieces.set(11, { piece: { uid: 11, kind: 'item', id: A }, area: 'equipped', equipped: true });
    pieces.set(12, { piece: { uid: 12, kind: 'item', id: B }, area: 'hand', idx: 5 }); // inconsistent: also on uid 1
    assert.equal(underframeActions({ ...ctx, pieces }, 11), null);
    assert.equal(itemDestroyable({ ...ctx, pieces }, 12), false, 'on an operator ⇒ locked');
  });

  test('real match engine: the replace intent destroys exactly the picked item (and a bad replaceUid is refused)', () => {
    const h = makeMatch({ mode: 'solo', difficulty: 'FUNNY', humans: 1, seed: 5 });
    h.start();
    h.toPrep(1);
    const m = h.m;
    const ps = h.ps('p_0');
    const chessId = Object.values(DATA.chess).find((c) => c.visible && !c.isGolden && c.tier === 1).chessId;
    const at = legalTileFor(m, ps, chessId);
    const unit = give(m, ps, chessId, 'board', at);
    const [a, b, c] = [giveItem(m, ps, A), giveItem(m, ps, B), giveItem(m, ps, C)];
    assert.equal(m.handle('p_0', { t: 'g.equip', itemUid: a.uid, targetUid: unit.uid }).error, undefined);
    assert.equal(m.handle('p_0', { t: 'g.equip', itemUid: b.uid, targetUid: unit.uid }).error, undefined);
    h.flushAll();
    const priv = h.lastTo('p_0', 'm.private');
    const cx = ctxOf(priv);
    const tile = { area: 'board', row: at[0], col: at[1] };
    const intent = dropIntent(cx, c.uid, tile);
    assert.equal(intent.confirmReplace, true, 'the client asks');
    const req = replaceRequest(cx, intent, getChess, getItem);
    assert.deepEqual(req.options.map((o) => o.uid), [a.uid, b.uid]);
    // refused: not one of the target's items (the item itself)
    const bad = replaceIntent(intent, c.uid);
    assert.ok(m.handle('p_0', { t: bad.t, ...bad.fields }).error, 'a replaceUid that is not equipped is refused');
    // the player picks the SECOND (newer) item: the server must not fall back to the oldest
    const r = replaceIntent(intent, b.uid);
    assert.equal(validateC2S({ t: r.t, rid: 7, ...r.fields }), null);
    assert.equal(m.handle('p_0', { t: r.t, ...r.fields }).error, undefined);
    h.flushAll();
    const after = h.lastTo('p_0', 'm.private');
    const u = after.board.find((p) => p.uid === unit.uid);
    assert.deepEqual(u.items.map((x) => x.uid).sort(), [a.uid, c.uid].sort(), 'b destroyed, a kept, c equipped');
    const everywhere = JSON.stringify([after.hand, after.temp, after.board]);
    assert.ok(!everywhere.includes(`"uid":${b.uid},`), 'the replaced item is gone');
    // g.destroy of an equipped item is refused by the server — the client never offers it
    assert.ok(m.handle('p_0', { t: 'g.destroy', uid: a.uid }).error);
    assert.equal(itemDestroyable(ctxOf(after), a.uid), false);
    h.invariants();
  });

  test('real match engine: 博士投影 and 盟约之币 on a full operator — the dialog asks and the picked item is the one destroyed (GitHub #263)', () => {
    const h = makeMatch({ mode: 'solo', difficulty: 'FUNNY', humans: 1, seed: 5 });
    h.start();
    h.toPrep(1);
    const m = h.m;
    const ps = h.ps('p_0');
    const chessId = Object.values(DATA.chess).find((c) => c.visible && !c.isGolden && c.tier === 1).chessId;
    const at = legalTileFor(m, ps, chessId);
    const unit = give(m, ps, chessId, 'board', at);
    const tile = { area: 'board', row: at[0], col: at[1] };
    const [a, b, c] = [giveItem(m, ps, A), giveItem(m, ps, B), giveItem(m, ps, C)];
    for (const it of [a, b]) assert.equal(m.handle('p_0', { t: 'g.equip', itemUid: it.uid, targetUid: unit.uid }).error, undefined);
    /** Drop `it` on the operator, pick `pick` in the dialog and send the intent; the operator's items after. */
    const dropAndPick = (it, pick) => {
      h.flushAll();
      const cx = ctxOf(h.lastTo('p_0', 'm.private'));
      const intent = dropIntent(cx, it.uid, tile);
      assert.equal(intent.confirmReplace, true, `${it.id}: the client asks`);
      const r = replaceIntent(intent, pick.uid);
      assert.equal(m.handle('p_0', { t: r.t, ...r.fields }).error, undefined);
      h.flushAll();
      return h.lastTo('p_0', 'm.private').board.find((p) => p.uid === unit.uid).items.map((x) => x.uid);
    };
    // 博士投影 (normal) takes the slot of the NEWER item the player picked — it used to push the oldest out unasked
    const holo = giveItem(m, ps, 'chess_item_5_06_e_a');
    assert.deepEqual(dropAndPick(holo, b), [a.uid, holo.uid], 'b destroyed, a kept, 博士投影 equipped');
    // 盟约之币 on [a, 博士投影]: the pick (a) is destroyed, the coin pays — 博士投影 and a free slot are left
    const coin = giveItem(m, ps, 'chess_item_1_03_e_a');
    const funds = ps.funds;
    assert.deepEqual(dropAndPick(coin, a), [holo.uid]);
    assert.equal(ps.funds, funds + 1);
    // the free slot takes the next item without a dialog
    h.flushAll();
    assert.equal(dropIntent(ctxOf(h.lastTo('p_0', 'm.private')), c.uid, tile).confirmReplace, false);
    for (const gone of [a, b, coin]) assert.equal(ps.find(gone.uid), null);
    h.invariants();
  });
});

describe('2. boss-round countdown and the overtime (DOT) warning', () => {
  const T0 = 1_000_000;
  const fa = { phase: PHASE.FINAL_ASSAULT, round: 14, modeId: 'mode_multi_hard', deadline: T0 + 120_000, overtimeAt: T0 + 150_000 };

  test("the countdown total is the level's maxPlayTime (120 s) in 最终攻势 and 隐秘核心", () => {
    assert.equal(bossLevelSeconds(fa, DATA.config), 120);
    assert.equal(phaseTotalSeconds(fa, DATA.config), 120);
    assert.equal(phaseTotalSeconds({ ...fa, phase: PHASE.HIDDEN_CORE, round: 15 }, DATA.config), 120);
    assert.equal(phaseTotalSeconds({ ...fa, modeId: 'mode_single_funny', round: 9 }, DATA.config), 120);
    assert.equal(phaseTotalSeconds(fa, null), 120, 'config not loaded yet: the official 120 s');
    assert.equal(bossLevelSeconds({ ...fa, phase: PHASE.COMBAT }, DATA.config), null);
    // the gauge: full at the start, 3/5 at 70 s left, empty at 0
    assert.equal(countdownState(fa.deadline, T0, 120).bars, 5);
    assert.equal(countdownState(fa.deadline, T0 + 50_000, 120).bars, 3);
    assert.equal(countdownState(fa.deadline, T0 + 121_000, 120).bars, 0);
  });

  test('no warning early on; pending once the level time ran out (or within 30 s); draining from overtimeAt', () => {
    assert.equal(overtimeState(fa, T0 + 10_000), null);
    assert.equal(overtimeState(fa, T0 + 150_000 - (OVERTIME_WARN_BEFORE + 1) * 1000), null);
    assert.deepEqual(overtimeState(fa, T0 + 121_000), { state: 'pending', secs: 29 });
    assert.deepEqual(overtimeState({ ...fa, deadline: 0 }, T0 + 125_000), { state: 'pending', secs: 25 }, 'no level countdown: 30 s before');
    assert.deepEqual(overtimeState(fa, T0 + 150_000), { state: 'drain', secs: 0, lost: 0, perSec: 1 });
    // server gamedata.js bossOvertimeDue: 1 LP per whole real second past overtimeAt
    assert.deepEqual(overtimeState(fa, T0 + 157_400), { state: 'drain', secs: 7, lost: 7, perSec: 1 });
    assert.deepEqual(overtimeState(fa, T0 + 157_400, { perSec: 2 }), { state: 'drain', secs: 7, lost: 14, perSec: 2 });
    assert.equal(overtimeDrainPerSec(DATA.config), DATA.config.bossOvertimeDrainPerSec ?? 1);
  });

  test('only boss rounds with an overtimeAt show it', () => {
    assert.equal(overtimeState({ ...fa, phase: PHASE.COMBAT }, T0 + 160_000), null);
    assert.equal(overtimeState({ ...fa, overtimeAt: undefined }, T0 + 160_000), null);
    assert.equal(overtimeState({ ...fa, phase: PHASE.RESULT }, T0 + 160_000), null);
    assert.equal(overtimeState(null, T0), null);
    assert.equal(overtimeState(fa, NaN), null);
    assert.ok(overtimeState({ ...fa, phase: PHASE.HIDDEN_CORE }, T0 + 160_000));
  });
});

describe('3. server session reset', () => {
  const base = { me: { playerId: 'p_old' }, room: null, match: emptyMatch() };
  test('a new playerId while a match / room was on screen says why the screen went back to the lobby', () => {
    assert.equal(sessionResetNotice({ ...base, match: { ...emptyMatch(), public: { phase: 'PREP' } } }, 'p_new'), '服务器会话已重置，上一局模拟已结束');
    assert.equal(sessionResetNotice({ ...base, room: { code: 'ABCD', inMatch: true } }, 'p_new'), '服务器会话已重置，上一局模拟已结束');
    assert.equal(sessionResetNotice({ ...base, room: { code: 'ABCD', inMatch: false } }, 'p_new'), '服务器会话已重置，已返回大厅');
  });
  test('nothing to say: first welcome, resumed session, lobby / title only', () => {
    assert.equal(sessionResetNotice({ ...base, me: { playerId: null }, room: { code: 'X' } }, 'p_new'), null);
    assert.equal(sessionResetNotice({ ...base, room: { code: 'X' } }, 'p_old'), null);
    assert.equal(sessionResetNotice(base, 'p_new'), null);
    assert.equal(sessionResetNotice(undefined, 'p_new'), null);
  });
  test('stale imperative dialogs are dismissed (confirm → false, alert → true)', async () => {
    const c = confirmDialog({ title: 'x' });
    const a = alertDialog({ title: 'y' });
    closeAllDialogs();
    assert.equal(await c, false);
    assert.equal(await a, true);
    closeAllDialogs(); // nothing queued: no-op
  });
});

describe('4. solo pause', () => {
  const pub = (phase, extra = {}) => ({ phase, ...extra });
  test('offered in solo battles only (hidden in co-op, in prep and for an eliminated player)', () => {
    for (const ph of [PHASE.COMBAT, PHASE.FINAL_ASSAULT, PHASE.HIDDEN_CORE]) assert.equal(pauseAvailable(pub(ph), { solo: true }), true, ph);
    for (const ph of [PHASE.PREP, PHASE.SP_DRAFT, PHASE.SETTLE, PHASE.RESULT, PHASE.INFO_CHECK]) assert.equal(pauseAvailable(pub(ph), { solo: true }), false, ph);
    assert.equal(pauseAvailable(pub(PHASE.COMBAT), { solo: false }), false, 'co-op');
    assert.equal(pauseAvailable(pub(PHASE.UNITE), { solo: false }), false);
    assert.equal(pauseAvailable(pub(PHASE.COMBAT), { solo: true, alive: false }), false);
    assert.equal(pauseAvailable(null, { solo: true }), false);
    assert.equal(pauseAvailable(pub(PHASE.COMBAT), { solo: true, done: true }), false, 'the own battle is over: nothing to pause');
    assert.equal(pauseAvailable(pub(PHASE.COMBAT, { paused: true }), { solo: true, done: true }), true, 'paused: still resumable');
  });
  test('g.pause {on} and the paused flag', () => {
    assert.deepEqual(pauseIntent(1), { t: 'g.pause', fields: { on: true } });
    assert.deepEqual(pauseIntent(false), { t: 'g.pause', fields: { on: false } });
    assert.equal(isPaused(pub(PHASE.COMBAT, { paused: true })), true);
    assert.equal(isPaused(pub(PHASE.COMBAT)), false);
  });
  test('while paused the HUD clocks stop at the pause moment', () => {
    const p = pub(PHASE.COMBAT, { paused: true, deadline: 50_000 });
    assert.equal(frozenNow(p, 30_000, 20_000), 20_000, 'first seen by this client');
    assert.equal(frozenNow({ ...p, pausedAt: 18_000 }, 30_000, 20_000), 18_000, 'the server says when');
    assert.equal(frozenNow(pub(PHASE.COMBAT), 30_000, 20_000), 30_000, 'not paused: live');
    assert.equal(remainAt(p.deadline, frozenNow(p, 45_000, 20_000)), 30);
    assert.equal(remainAt(0, 1), null);
  });
});
