// (fork) Scenario tests for the bot bench (Fish's TODO, 2026-11-12: "Set up a scenario where the game already starts
// with 1 Muelsyse (or gifts it on round 7), to see if the bots know how to scale from there"; "Other scenario tests,
// which make it possible to test if a tactic is useful even if it would only be relevant to 5% of games happening by
// chance"). A scenario gives the bot seats operators, items or funds at the start of a round's prep, after the prep's
// own start effects and before any bot acts, through the game's own gain path (on-gain traits fire, pool copies are
// taken). botbench --scenario FILE; the same scenario on the same seeds makes paired comparisons of tactics in it.
//
// FILE (JSON):
//   { "id": "muelsyse-r7",
//     "gifts": [
//       { "round": 7, "chess": "chess_char_6_11_a" },          an operator (normal; an elite id gives the elite)
//       { "round": 5, "item": "chess_item_6_09_e_a", "count": 2 },  items
//       { "round": 3, "funds": 10 },                            funds
//       { "round": 7, "chess": "…", "seats": [0] } ] }          only these seats (default: every bot seat)
//
// Optional "diy": custom operators (自选) for the bot seats, which the bots never pick themselves. `{ "tier": 6, "index": 0,
// "charId": "char_2012_typhon", "skillIndex": 2, "uniEquipId": "uniequip_fishw_typhon" }` fills the tier's index-th slot
// (data order); a Mod Z / W id works as the module. A gift `{ "round": 6, "diy": 0, "elite": true }` then gives the
// first `diy` entry's piece (its promoted form with `elite`; the module only works on that form).

import { diySlotIds, diySlot } from '../shared/diy.js';
import { modZOf } from '../shared/modZ.js';
import { normalizeRules } from '../shared/rules.js';

const KINDS = ['chess', 'item', 'funds', 'diy'];

/** Checks a scenario object; throws on a mistake (so a typo never runs a whole bench as a plain one). */
export function parseScenario(raw, gd = null) {
  const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!s || typeof s !== 'object' || !Array.isArray(s.gifts) || !s.gifts.length) throw new Error('scenario: needs a non-empty "gifts" list');
  const gifts = s.gifts.map((g, i) => {
    const kinds = KINDS.filter((k) => g[k] != null);
    if (kinds.length !== 1) throw new Error(`scenario gift ${i}: give exactly one of ${KINDS.join(' / ')}`);
    const round = Number(g.round);
    if (!Number.isInteger(round) || round < 1 || round > 30) throw new Error(`scenario gift ${i}: bad round ${g.round}`);
    const count = g.count == null ? 1 : Number(g.count);
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error(`scenario gift ${i}: bad count ${g.count}`);
    const seats = g.seats == null || g.seats === 'all' ? 'all' : g.seats;
    if (seats !== 'all' && !(Array.isArray(seats) && seats.every((x) => Number.isInteger(x) && x >= 0))) throw new Error(`scenario gift ${i}: bad seats`);
    const kind = kinds[0];
    if (kind === 'diy') {
      if (!Number.isInteger(g.diy) || g.diy < 0 || g.diy >= (Array.isArray(s.diy) ? s.diy.length : 0)) throw new Error(`scenario gift ${i}: "diy" must index the scenario's diy list`);
    } else if (kind === 'funds') {
      if (!Number.isInteger(g.funds) || g.funds < 1 || g.funds > 200) throw new Error(`scenario gift ${i}: bad funds ${g.funds}`);
    } else if (gd) {
      if (kind === 'chess' && !gd.chess(g.chess)) throw new Error(`scenario gift ${i}: unknown operator ${g.chess}`);
      if (kind === 'item' && !gd.item(g.item)) throw new Error(`scenario gift ${i}: unknown item ${g.item}`);
    }
    return Object.freeze({ round, kind, id: kind === 'funds' ? null : g[kind], funds: kind === 'funds' ? g.funds : 0, count, seats, elite: g.elite === true });
  });
  const diy = (Array.isArray(s.diy) ? s.diy : []).map((d, i) => {
    if (!d || ![5, 6].includes(d.tier) || !Number.isInteger(d.index ?? 0) || typeof d.charId !== 'string') throw new Error(`scenario diy ${i}: needs tier 5 or 6, charId and (optionally) index`);
    return Object.freeze({ tier: d.tier, index: d.index ?? 0, charId: d.charId, skillIndex: Number.isInteger(d.skillIndex) ? d.skillIndex : 0, uniEquipId: d.uniEquipId ?? null });
  });
  return Object.freeze({ id: String(s.id || 'scenario'), gifts: Object.freeze(gifts), diy: Object.freeze(diy) });
}

/**
 * Installs the scenario on a match: its gifts land in each round's prep right after Match.enterPrep (the prep's start
 * effects ran; the bots' preps are only scheduled). Returns a log array of what was given ({ round, seat, kind, id, ok }).
 */
export function applyScenario(m, scenario) {
  const log = [];
  // the custom operators: the slots (data order within a tier), set before the first prep like a human's picks
  const slotOf = new Map();
  if (scenario.diy.length) {
    const ids = diySlotIds(m.data);
    const picks = {};
    scenario.diy.forEach((d, i) => {
      const inTier = ids.filter((id) => diySlot(id, m.data)?.tier === d.tier);
      const slot = inTier[d.index];
      if (!slot) throw new Error(`scenario diy ${i}: no tier ${d.tier} slot ${d.index}`);
      picks[slot] = { charId: d.charId, skillIndex: d.skillIndex, uniEquipId: d.uniEquipId };
      slotOf.set(i, diySlot(slot, m.data));
    });
    const off = new Set([...(m.disabledBonds || []), ...(m.staticInactiveBonds || [])]);
    // a Mod Z / W is equipped by the room's `modZ` rule (a pick naming one the room has not turned on gets the operator's first module)
    const mz = [...new Set(scenario.diy.map((d) => d.uniEquipId).filter((id) => modZOf(id)))];
    if (mz.length) m.lobbyRules = normalizeRules({ ...m.lobbyRules, modZ: [...new Set([...(m.lobbyRules.modZ || []), ...mz])] });
    for (const ps of m.order) {
      if (!ps.isBot) continue;
      // setDiy refuses bot seats (bots field no custom piece in the game); the bench lifts that for this one call
      const was = ps.isBot;
      ps.isBot = false;
      try { if (!ps.setDiy(picks, m.diyKitted ? { kitted: m.diyKitted } : undefined)) throw new Error('scenario diy: the picks were refused (see the match log)'); } finally { ps.isBot = was; }
      ps.initDiyStock(off);
    }
  }
  const enterPrep = m.enterPrep.bind(m);
  m.enterPrep = (...a) => {
    const r = enterPrep(...a);
    for (const g of scenario.gifts) {
      if (g.round !== m.round) continue;
      for (const ps of m.alivePlayers()) {
        if (!ps.isBot || (g.seats !== 'all' && !g.seats.includes(ps.seat))) continue;
        for (let k = 0; k < g.count; k++) {
          let ok;
          if (g.kind === 'funds') { ps.funds += g.funds; ok = true; }
          else if (g.kind === 'chess') ok = !!ps.acquireChess(g.id, { source: 'scenario' });
          else if (g.kind === 'diy') { const sl = slotOf.get(g.id); ok = !!(sl && ps.acquireChess(g.elite ? sl.goldenId : sl.baseId, { source: 'scenario' })); }
          else ok = !!ps.acquireItem(g.id, { source: 'scenario', requirePool: false });
          log.push({ round: m.round, seat: ps.seat, kind: g.kind, id: g.id, ok });
        }
        ps.recompute();
      }
    }
    return r;
  };
  return log;
}
