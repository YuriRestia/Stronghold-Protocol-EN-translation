// server/match/records.js — (fork, GitHub #32) the anonymous match record: what one finished match leaves for analysis
// when the server owner turns records on (SP_RECORDS, server/records.js writes the file). Built inside the match (a match
// host has no file access) and handed to the lobby as `summary.record` (settle.js finish); never sent to a client.
//
// installRecorder(m) observes the match without changing it (no rng draw, no state written; off ⇒ not installed at all):
//   * actions — every state change a seat made, human or bot (`bot: 1` for an AI seat, a human under AI 托管 or one who
//     left), in order: buy / refresh / freeze / levelUp / sell / move / equip / art / destroy / unequip / reward (the
//     PlayerState actions), card (机变), band, choice (教鞭), offer / offerRefresh (plugin windows), autoplay. A refused
//     action is not recorded. No time and no clicks: only the order (the owner's call on #32).
//   * observations in the same list — `shop` (every roll of a seat's shop: round start, refresh, effects) and `gain` (a
//     piece a seat got outside its own action: round rewards, cards, bands, items; inside an action it is the action's `got`).
//   * rounds — at each SETTLE, per seat: LP, shop level, funds, board value, units, elites, bonds and tiers, layers, items,
//     leaks (botbench's row, tools/botbench.mjs); a round without a SETTLE gets one too: `noSettle: true` when the next
//     round starts (the Final Assault won goes straight to the Hidden Core), `final: true` for the round the match ended in
//     (a final boss or hidden round ends without a SETTLE; GitHub #59).
//   * setup — per seat, what the seat brought into the match (GitHub #104: a replay rebuilds the match from its seed and
//     these): the operator loadout and 潜能 / 练度 (`loadout`, `ops`), the 补位 list (`notOwned`) and the 自选 picks
//     (`diy`); empty ones left out. A loadout changed in the match (Match.setLoadout) is an action, `loadout`.
//   * battles — every field's BattleSpec (server/sim/spec.js: deterministic, so the spec replays the battle) with the
//     digest of the result the match used (resultDigest) and each seat's killed / total / leaks / perfect.
// finishRecord(m, summary) returns the record with every playerId replaced by its seat id (`s0`…`s3`).
// Never in a record: names, playerIds, room code, IP addresses, tokens, device details, times of day, emotes, chat, the
// "report a problem" text (test/match/records.test.js checks the record of a match for them).

import { resultDigest } from '../sim/spec.js';

export const RECORD_VERSION = 1;

/** PlayerState actions: name → (ps, args) → fields to record, read BEFORE the call (ids that the action may consume). */
const PS_ACTIONS = {
  buy: (ps, [slot]) => { const s = ps.shop.slots[slot]; return { a: 'buy', slot, id: s ? s.id : null, price: s ? ps.priceOf(s) : null }; },
  refresh: (ps) => ({ a: 'refresh', free: ps.shop.freeRefreshes > 0 }),
  freeze: (ps) => ({ a: 'freeze', on: !ps.shop.frozen }),
  levelUp: (ps) => ({ a: 'levelUp', to: ps.shop.level + 1 }),
  sell: (ps, [uid]) => ({ a: 'sell', uid, id: pieceId(ps, uid) }),
  move: (ps, [uid, to, dir]) => ({ a: 'move', uid, id: pieceId(ps, uid), to: to ?? null, ...(dir != null ? { dir } : {}) }),
  equip: (ps, [itemUid, targetUid, replaceUid]) => ({ a: 'equip', item: pieceId(ps, itemUid), itemUid, uid: targetUid, id: pieceId(ps, targetUid), ...(replaceUid != null ? { replace: replaceUid } : {}) }),
  useArt: (ps, [itemUid, row, col, dir]) => ({ a: 'art', item: pieceId(ps, itemUid), itemUid, row, col, ...(dir != null ? { dir } : {}) }),
  destroy: (ps, [uid]) => ({ a: 'destroy', uid, id: pieceId(ps, uid) }),
  unequip: (ps, [itemUid]) => ({ a: 'unequip', item: pieceId(ps, itemUid), itemUid }),
  pickReward: (ps, [idx]) => { const o = ps.offers[0]; return { a: 'reward', idx, offer: o ? o.slots.map((s) => (s ? s.id : null)) : null, source: o?.source ?? null }; },
};

const pieceId = (ps, uid) => { try { const loc = ps.find(uid); return loc ? loc.piece.id : null; } catch { return null; } };
const ok = (res) => !(res && typeof res === 'object' && res.error);

/** @param {any} m the Match */
export function installRecorder(m) {
  const rec = { actions: [], rounds: [], battles: [], setup: new Map() };
  m._record = rec;
  for (const ps of m.players.values()) rec.setup.set(ps.playerId, seatSetup(ps));
  const base = (ps) => ({ r: m.round, s: `s${ps.seat}`, ...(ps.botControlled ? { bot: 1 } : {}) });
  // one action at a time per seat: an action's nested calls (a buy that merges, a sell that stows) are part of it
  const open = new Map();
  const act = (ps, entry, run) => {
    if (open.has(ps)) return run();
    const e = { ...base(ps), ...entry };
    const at = rec.actions.length;
    rec.actions.push(e);
    open.set(ps, e);
    let res;
    try { res = run(); } finally { open.delete(ps); }
    if (!ok(res) && rec.actions[at] === e) rec.actions.splice(at, 1);
    return res;
  };
  for (const ps of m.players.values()) {
    for (const [name, read] of Object.entries(PS_ACTIONS)) {
      const fn = ps[name];
      if (typeof fn !== 'function') continue;
      ps[name] = function (...args) {
        // a preview copy (preview.js: Object.create(ps)) inherits the wrapper; only the seat itself is recorded
        if (this !== ps) return fn.apply(this, args);
        let entry;
        try { entry = read(ps, args); } catch { entry = { a: name }; }
        return act(ps, entry, () => fn.apply(this, args));
      };
    }
    const roll = ps.rollShop;
    ps.rollShop = function (...args) {
      const res = roll.apply(this, args);
      if (this === ps) rec.actions.push({ ...base(ps), a: 'shop', lvl: ps.shop.level, ids: ps.shop.slots.map((s) => (s ? s.id : null)) });
      return res;
    };
    for (const name of ['acquireChess', 'acquireItem']) {
      const fn = ps[name];
      ps[name] = function (id, o = {}) {
        const piece = fn.call(this, id, o);
        if (this !== ps || !piece) return piece;
        const got = { id: piece.id ?? id, uid: piece.uid ?? null };
        const e = open.get(ps);
        if (e) (e.got ||= []).push(got);
        else rec.actions.push({ ...base(ps), a: 'gain', ...got, src: o.source ?? null });
        return piece;
      };
    }
  }
  const wrapM = (name, read) => {
    const fn = m[name];
    if (typeof fn !== 'function') return;
    m[name] = function (ps, ...args) {
      if (this !== m || !ps || !m.players.has(ps.playerId)) return fn.call(this, ps, ...args);
      return act(ps, read(ps, args), () => fn.call(this, ps, ...args));
    };
  };
  // the drafts: the appliers, so a timed-out turn and a bot's pick are recorded like a human's
  const applied = (name, entry, picked) => {
    const fn = m[name];
    if (typeof fn !== 'function') return;
    m[name] = function (ps, ...args) {
      if (this !== m || !ps || !m.players.has(ps.playerId)) return fn.call(this, ps, ...args);
      const e = { ...base(ps), ...entry(ps, args) };
      const at = rec.actions.length;
      rec.actions.push(e);
      open.set(ps, e);
      try { return fn.call(this, ps, ...args); } finally {
        open.delete(ps);
        const p = picked(ps);
        if (p == null) { if (rec.actions[at] === e) rec.actions.splice(at, 1); } else Object.assign(e, p);
      }
    };
  };
  applied('_applyCard', (ps, [idx]) => { const c = m.sp?.cards?.[idx]; return { a: 'card', idx, id: c?.id ?? null, kind: c?.kind ?? null, ...(c?.enemyKey ? { enemyKey: c.enemyKey } : {}) }; },
    (ps) => (m.sp && m.sp.picks[ps.playerId] != null ? {} : null));
  applied('_applyBand', () => ({ a: 'band' }), (ps) => (m.draft && m.draft.picks[ps.playerId] ? { id: m.draft.picks[ps.playerId] } : null));
  wrapM('pickPersonalChoice', (ps, [idx]) => { const c = ps.personalChoice?.cards?.[idx]; return { a: 'choice', idx, id: c ? (c.effectId ?? c.id ?? null) : null }; });
  wrapM('requestOffer', (ps, [offerId, idx]) => ({ a: 'offer', offerId, idx }));
  wrapM('requestOfferRefresh', (ps, [offerId, idx]) => ({ a: 'offerRefresh', offerId, idx }));
  wrapM('setAutoplay', (ps, [on]) => ({ a: 'autoplay', on: !!on }));
  // the loadout set in the match (INFO_CHECK, or PREP with prepLoadout): the arguments as sent (GitHub #104)
  const setLoadout = m.setLoadout;
  if (typeof setLoadout === 'function') {
    m.setLoadout = function (playerId, loadout, ops) {
      const ps = this === m ? m.players.get(playerId) : null;
      if (!ps) return setLoadout.apply(this, arguments);
      return act(ps, { a: 'loadout', loadout: loadout ?? null, ...(ops !== undefined ? { ops } : {}) }, () => setLoadout.apply(this, arguments));
    };
  }

  // every field: its spec when it is made, its outcome when it is done
  const ccField = m._ccField;
  const byField = new WeakMap();
  m._ccField = function (o) {
    const f = ccField.call(this, o);
    const b = { r: m.round, kind: f.kind, field: f.fieldId, spec: f.spec, digest: null, out: null };
    rec.battles.push(b);
    byField.set(f, b);
    return f;
  };
  const fieldDone = m._fieldDone;
  m._fieldDone = function (f) {
    const res = fieldDone.call(this, f);
    const b = f && byField.get(f);
    if (b && f.result && b.out == null) {
      b.result = f.result; // digested after the ids become seat ids (finishRecord): a replay of the record runs with those
      b.synthetic = !!f.result.synthetic;
      const out = {};
      for (const [pid, p] of Object.entries(f.result.perPlayer || {})) {
        const leaked = (p.leaked || []).filter((l) => l && l.counted !== false);
        out[pid] = { killed: p.killed | 0, total: p.total | 0, leaks: leaked.length, perfect: !!p.perfect };
      }
      b.out = out;
    }
    return res;
  };

  const settle = m.settle;
  m.settle = function (...args) {
    const res = settle.apply(this, args);
    try { rec.rounds.push(roundRow(m)); } catch (e) { m.reportError?.('record round', e); }
    return res;
  };
  // a round left without a SETTLE when the next one starts (the Final Assault won: straight to the Hidden Core, bossRounds.js)
  const startRound = m.startRound;
  m.startRound = function (...args) {
    if (m.round >= 1 && (!rec.rounds.length || rec.rounds[rec.rounds.length - 1].r !== m.round)) {
      try { rec.rounds.push({ ...roundRow(m), noSettle: true }); } catch (e) { m.reportError?.('record round', e); }
    }
    return startRound.apply(this, args);
  };
  return rec;
}

/** One SETTLE row: each seat's state after the round's LP loss (botbench's per-round row plus funds and bond ids). */
function roundRow(m) {
  const seats = {};
  for (const ps of m.order) {
    let value = 0, elites = 0, items = 0;
    const units = [];
    for (const p of ps.board.values()) {
      if (p.kind !== 'chess') continue;
      const golden = m.gd.isGolden(p.id);
      if (golden) elites++;
      value += m.gd.chessPrice(m.gd.baseIdOf(p.id)) * (golden ? m.gd.goldenCopies : 1);
      items += (p.items || []).length;
      units.push(p.id);
    }
    const bonds = Object.entries(ps.bonds || {}).filter(([, b]) => b && b.active).map(([id, b]) => ({ id, tier: b.tier || 0 }));
    seats[ps.playerId] = {
      lp: ps.lp, alive: ps.alive, level: ps.shop.level, funds: ps.funds, deployed: ps.deployCount, value, elites, items,
      units: units.sort(), bonds, layers: ps.activatedLayers(), band: ps.bandId ?? null,
    };
  }
  return { r: m.round, ...(m.teamLp != null ? { teamLp: m.teamLp } : {}), seats };
}

/**
 * The finished record (settle.js finish): the match's own fields, the outcome, and the observations above — every
 * playerId replaced by its seat id. Null when the match did not record.
 * @param {any} m @param {any} summary the onEnd summary (results.js buildResult minus `t`)
 */
export function finishRecord(m, summary) {
  const rec = m._record;
  if (!rec) return null;
  // the round the match ended in: a final boss / hidden round finishes without a SETTLE, and a match can end mid-round
  if (m.round >= 1 && (!rec.rounds.length || rec.rounds[rec.rounds.length - 1].r !== m.round)) {
    try { rec.rounds.push({ ...roundRow(m), final: true }); } catch (e) { m.reportError?.('record round', e); }
  }
  const seatOf = new Map([...m.players.values()].map((ps) => [ps.playerId, `s${ps.seat}`]));
  const players = (summary && Array.isArray(summary.players) ? summary.players : []);
  const raw = {
    v: RECORD_VERSION,
    mode: m.mode, difficulty: m.difficulty, modeId: m.modeId,
    lobbyRules: m.lobbyRules ?? {},
    rules: m.rules ?? null,
    cs: m.cs ?? null,
    seed: m.seed >>> 0,
    bossRound: m.gd.bossRound, hiddenRound: m.gd.hiddenRound ?? null,
    seats: [...m.players.values()].sort((a, b) => a.seat - b.seat).map((ps) => {
      const row = players.find((p) => p.playerId === ps.playerId);
      return {
        seat: `s${ps.seat}`, human: !ps.isBot, band: ps.bandId ?? null, roundsPassed: row ? row.roundsPassed : null,
        left: !!ps.left, autoplay: !!ps.autoplay, title: row?.title?.id ?? null, stats: row?.stats ?? null,
        ...(rec.setup?.get(ps.playerId) ? { setup: rec.setup.get(ps.playerId) } : {}),
      };
    }),
    result: summary ? { victory: !!summary.victory, reason: summary.reason ?? null, roundsPassed: summary.roundsPassed ?? 0, hiddenReached: !!summary.hiddenReached, hiddenCleared: !!summary.hiddenCleared, teamLp: summary.teamLp ?? null } : null,
    rounds: rec.rounds,
    actions: rec.actions,
    battles: rec.battles,
  };
  const anon = anonymize(raw, seatOf);
  for (const b of anon.battles) {
    if (b.result) b.digest = resultDigest(b.result).hash;
    delete b.result;
  }
  return anon;
}

/** A seat's setup (GitHub #104): its loadout, 潜能 / 练度, 补位 list and 自选 picks as the match accepted them; null when all are empty (bots). */
function seatSetup(ps) {
  const out = {};
  const put = (k, v) => { if (v && (Array.isArray(v) ? v.length : Object.keys(v).length)) out[k] = JSON.parse(JSON.stringify(v)); };
  put('loadout', ps.loadout);
  put('ops', ps.ops);
  put('notOwned', ps.standIns);
  put('diy', ps.diy);
  return Object.keys(out).length ? out : null;
}

/** A JSON copy of `value` with each playerId (`p_` + 10 hex, `ai_` + 8 hex: never part of other text) replaced. */
export function anonymize(value, seatOf) {
  let json = JSON.stringify(value);
  for (const [pid, seat] of seatOf) json = json.split(pid).join(seat);
  return JSON.parse(json);
}
