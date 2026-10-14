// server/match/bondCall.js — the briefing's 核心盟约 call (remake feature): during INFO_CHECK a player taps a core bond
// to tell the teammates which strategy it is going for (g.bondCall { bondId? }). One call per player; the same bond
// again, or a missing / null bondId, clears it. m.public.players[].bondCall carries it (omitted while none), so every
// seat sees the P1–P4 markers on the bond discs and the red conflict marker when two players call the same bond; it
// stays in m.public through BAND_DRAFT (read-only there: the draft order shows each player's call).
// Only a core bond the mode activates can be called [ASSUMED: a 本局禁用 bond can never activate; a drawn (阵容不完整)
// one still can, through other bonds' operators or items, so it stays callable].

import { PHASE, ERR } from '../../shared/constants.js';
import { OK, fail } from './match/common.js';

/**
 * g.bondCall { bondId? } (Match._handle).
 * @param {any} m the match
 * @param {any} ps the caller's PlayerState
 * @param {string|null} bondId
 */
export function setBondCall(m, ps, bondId) {
  if (m.phase !== PHASE.INFO_CHECK) return fail(ERR.WRONG_PHASE);
  if (bondId == null || ps.bondCall === bondId) {
    if (ps.bondCall) { ps.bondCall = null; m.markPublic(); }
    return OK;
  }
  const bond = m.gd.bond(bondId);
  if (!bond || !bond.isCore || m.gd.modeInactiveBonds.has(bondId)) return fail(ERR.BAD_TARGET);
  ps.bondCall = bondId;
  m.markPublic();
  return OK;
}

/** The m.public.players[] field: `{ bondCall }` while the player has one, else nothing. */
export const bondCallView = (ps) => (ps.bondCall ? { bondCall: ps.bondCall } : {});
