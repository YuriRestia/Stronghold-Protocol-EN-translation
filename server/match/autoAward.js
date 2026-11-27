// server/match/autoAward.js — (fork, GitHub #125) the watchers behind the `autoAward` lobby rule (shared/autoAward.js):
// each one marks a condition broken (m._awardBroken) at the first event that shows its tag could have mattered. They
// run only while the rule is on, read the match and never change it, so a match plays the same with the rule on or off.
//
//   investor     PlayerRound.recompute: a player's 投资人 (investShip) active (the bench counts: the tag is off)
//   investorOps  PlayerAcquire.acquireChess / transformChess: a player gains 缪尔赛思, 耶拉 or 焰尾 (elites too)
//   swift        a real field's battle (Match: normal, boss, unite): a player's 迅捷 (swiftShip) active in its spec
//   foresight    the same battles: a deployed operator of 远见 (visiShip)
//   strategy1/2  at the end: a player's Strategy is on the tag's list
//   intern       PlayerEconomy.buy: a tier-1 operator bought from round CC.tier1FromRound on (the price Intern raises)
//   barge        PlayerEconomy.levelUp: a Dispatch Center reaches level 5 (Barge 1 prices 4→5; Barge 2 also 5→6)
//   lastLine     settle: a player's LP minus Last Line's extra so far (CC.lastLineLp per round its own battle leaked)
//                would be 0; the boss rounds: the team LP minus the alive players' extra would be 0
//   lowEfficiency a field's result: a player's operator left the field in a battle (`downs` > 0: knocked out, retreated or
//                raided, so a redeploy timer started; nothing else reads the tag's ×1.75)
//   junk         every write into a hand (PlayerPieces.stow, the temp refill, placement, items): the hand is left with
//                no free slot, or a piece overflowed into the temp hand (the hammer would have taken that slot)
//
// AI seats (bots, 托管 at any time) are noted for the versions that need a lobby without them.

import { CC, strategyLateBandIds } from '../../shared/ruleData.js';
import { countFree } from './board.js';
import { awardedTags, awardNotes, STRATEGY2_BANDS } from '../../shared/autoAward.js';

const on = (m) => m?.lobbyRules?.autoAward === true;
const broken = (m) => (m._awardBroken ||= new Set());

/**
 * Mark condition `id` broken (no-op while the rule is off). The first break of each condition is kept for the end
 * screen's "why not" panel: the round, and `info.id` (the operator or Strategy involved) when there is one.
 */
export function breakAward(m, id, info = null) {
  if (!on(m)) return;
  broken(m).add(id);
  const why = (m._awardWhy ||= {});
  if (!why[id]) why[id] = { r: Number.isInteger(m.round) ? m.round : null, ...(info?.id ? { id: info.id } : {}) };
}

/** After a player's live bond recompute: 投资人 active breaks `investor`. */
export function noteBonds(m, ps) {
  if (on(m) && ps?.bonds?.investShip?.active) breakAward(m, 'investor');
}

const INVESTOR_OPS = new Set(CC.investorSold.ops);
/** A player gained `chessId` (bought, granted, transformed into): one of Investor 2's three breaks `investorOps`. */
export function noteGained(m, ps, chessId) {
  if (!on(m) || typeof chessId !== 'string') return;
  const base = ps?.gd?.baseIdOf ? ps.gd.baseIdOf(chessId) : chessId;
  if (INVESTOR_OPS.has(base) || INVESTOR_OPS.has(chessId)) breakAward(m, 'investorOps', { id: base });
}

/**
 * A real field's battle options (not a preview, not a bot rehearsal): its players' specs show the active bonds and
 * the deployed operators.
 * @param {any} m @param {{ players?: any[] }} opts
 */
export function noteBattle(m, opts) {
  if (!on(m)) return;
  for (const pl of Array.isArray(opts?.players) ? opts.players : []) {
    if (pl?.bonds?.swiftShip?.active) breakAward(m, 'swift');
    for (const u of Array.isArray(pl?.units) ? pl.units : []) {
      const c = m.gd?.chess ? m.gd.chess(u?.chessId) : null;
      if (c && Array.isArray(c.bonds) && c.bonds.includes('visiShip')) breakAward(m, 'foresight', { id: u.chessId });
    }
  }
}

/** A purchase of `chessId`: a tier-1 operator from round CC.tier1FromRound on breaks `intern`. */
export function noteBuy(m, ps, chessId) {
  if (on(m) && m.round >= CC.tier1FromRound && ps?.gd?.tierOf?.(chessId) === 1) breakAward(m, 'intern', { id: chessId });
}

/** After a level-up: a Dispatch Center at level 5 or more breaks `barge`. */
export function noteLevel(m, ps) {
  if (on(m) && (ps?.shop?.level ?? 0) >= 5) breakAward(m, 'barge');
}

/** After a write into `ps`'s hand: no free slot left breaks `junk` (`overflow`: a piece went to the temp hand instead). */
export function noteHand(m, ps, overflow = false) {
  if (on(m) && (overflow || (Array.isArray(ps?.hand) && countFree(ps.hand) === 0))) breakAward(m, 'junk');
}

const lastLineExtra = (m) => (m._awardLastLine ||= new Map());
/** After a player's settle (`leaked`: its own battle leaked): would Last Line's extra so far have eliminated it? */
export function noteSettle(m, ps, leaked) {
  if (!on(m) || !ps) return;
  const ex = (lastLineExtra(m).get(ps.playerId) || 0) + (leaked ? CC.lastLineLp : 0);
  lastLineExtra(m).set(ps.playerId, ex);
  if (ps.lp > 0 && ps.lp - ex <= 0) breakAward(m, 'lastLine');
}

/** After a team LP loss in the boss rounds: would the team LP, less the alive players' extra, be gone? */
export function noteTeamLp(m) {
  if (!on(m) || !(m.teamLp > 0)) return;
  let ex = 0;
  for (const ps of m.alivePlayers?.() ?? []) ex += lastLineExtra(m).get(ps.playerId) || 0;
  if (m.teamLp - ex <= 0) breakAward(m, 'lastLine');
}

/** A field's result is in: any player's operator that left the field (`downs`; a result without the count counts as one) breaks `lowEfficiency`. */
export function noteDowns(m, res) {
  if (!on(m) || !res || !res.perPlayer) return;
  for (const pp of Object.values(res.perPlayer)) {
    if (pp && !(pp.downs === 0)) breakAward(m, 'lowEfficiency');
  }
}

/** A seat was played by the AI at some point (a bot, or 托管). */
export function noteAiSeat(m) {
  if (on(m)) m._awardAiSeat = true;
}

/** The tags to award at the end of the match (tag key → level); null when none. */
export function finishAwards(m) {
  if (!on(m)) return null;
  const b = new Set(broken(m));
  const late = new Set(strategyLateBandIds(m.gd?.raw?.bands ?? m.gd?.bands ?? {}));
  const players = [...(m.players?.values?.() ?? [])];
  const why = { ...(m._awardWhy || {}) };
  for (const ps of players) {
    if (late.has(ps.bandId)) { b.add('strategy1'); why.strategy1 ||= { r: null, id: ps.bandId }; }
    if (STRATEGY2_BANDS.includes(ps.bandId)) { b.add('strategy2'); why.strategy2 ||= { r: null, id: ps.bandId }; }
  }
  const aiSeats = !!m._awardAiSeat || players.some((ps) => ps.isBot || ps.autoplay);
  const out = awardedTags(m.lobbyRules, b, { aiSeats });
  // the end screen's "why not" panel (closed by default): every awardable version the room didn't take and didn't get
  const notes = awardNotes(m.lobbyRules, out, why, { aiSeats });
  m.awardNotes = notes.length ? notes : null;
  return Object.keys(out).length ? out : null;
}
