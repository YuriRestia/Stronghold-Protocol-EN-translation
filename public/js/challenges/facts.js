// What a challenge is checked against: the FACTS of one finished match from one player's point of view. Two adapters build
// them — factsFromClientRecord here (the browser's own stored record, ui/stats.js) and, for deriving the ratings prior,
// the server's match record (tools/challenge-prior.mjs). Everything a condition (catalog.js) reads is a field below; a
// field the record does not hold is `null` and a condition on it is "unknown", never failed and never counted as zero.
//
//   win            the player won (the team won and the player was still in)
//   difficulty     1 Standard, 2 Perilous, 3 Dire, 4 Ultimate (0 unknown)
//   humans, bots   seats of each kind; solo = a one-human room
//   cheats, risk, seeded, tags   from the lobby rules: any cheat rule, the Risk total, a fixed stage / bans, { ccKey: level }
//   rounds, hiddenCleared        rounds passed, the hidden core cleared
//   durationMin    match length in minutes (null unknown)
//   bossSeconds    the Final Assault fight's length in game seconds (null: not recorded / not fought)
//   nobodyOut      every player was still alive at the end (null unknown)
//   lpLost, perfectRounds        the player's own counters (null unknown)
//   stats          { dmgDealt, kills, leaks, gold (funds spent), refreshes, merges, itemsEquipped, bossDamage, activatedLayers }
//   band           strategy id
//   layers         { bondId: layers } at the end (null when the record kept no bonds); active: [bondId]
//   customIds      charIds of the custom operators fielded at any point of the match (null unknown)
//   golden, custom elite operators / custom (自选) operators on the final board (null unknown)

import { normalizeRules, ruleLabels } from '../../../shared/rules.js';

const DIFF = { FUNNY: 1, NORMAL: 2, HARD: 3, ABYSS: 4 };
export const difficultyLevel = (d) => DIFF[d] ?? 0;
const num = (v) => (Number.isFinite(v) ? v : null);

/** @returns {{ cheats: boolean, risk: number, seeded: boolean, tags: Record<string, number> }} */
export function ruleFacts(rawRules) {
  const rules = normalizeRules(rawRules ?? {});
  const l = ruleLabels(rules);
  const tags = {};
  for (const [k, v] of Object.entries(rules)) if (k.startsWith('cc') && Number.isInteger(v) && v > 0) tags[k] = v;
  return { cheats: l.cheats, risk: l.risk, seeded: l.seeded, tags };
}

/**
 * The facts of the local player in a stored match record (ui/stats.js normalizeRecord shape), or null when the record has
 * no row for the player. A quit record has no settlement: it is never a finished match, so null.
 */
export function factsFromClientRecord(rec) {
  if (!rec || rec.end === 'quit' || !Array.isArray(rec.players)) return null;
  const me = rec.players.find((p) => p.playerId === rec.selfId) ?? (rec.players.filter((p) => !p.isBot).length === 1 ? rec.players.find((p) => !p.isBot) : null);
  if (!me) return null;
  const humans = rec.players.filter((p) => !p.isBot).length;
  const st = me.stats ?? {};
  const bonds = Array.isArray(me.bonds) && me.bonds.length ? me.bonds : null;
  const layers = bonds ? Object.fromEntries(bonds.map((b) => [b.bondId, b.layers ?? 0])) : null;
  const active = bonds ? bonds.filter((b) => b.active).map((b) => b.bondId) : Array.isArray(me.usedBondIds) ? [...me.usedBondIds] : null;
  const lineup = Array.isArray(me.lineup) && me.lineup.length ? me.lineup : null;
  return {
    win: !!me.victory,
    difficulty: difficultyLevel(rec.difficulty),
    humans, bots: rec.players.length - humans, solo: rec.roomMode ? rec.roomMode === 'solo' : humans === 1 && rec.players.length === 1,
    ...ruleFacts(rec.rules),
    rounds: Number.isFinite(me.roundsPassed) ? me.roundsPassed : rec.roundsPassed ?? 0,
    hiddenCleared: !!rec.hiddenCleared,
    bossSeconds: Number.isFinite(rec.bossSeconds) ? rec.bossSeconds : null,
    durationMin: Number.isFinite(rec.durationMs) && rec.durationMs > 0 ? rec.durationMs / 60000 : null,
    nobodyOut: rec.players.every((p) => p.alive !== false),
    lpLost: num(st.lpLost), perfectRounds: num(st.perfectRounds),
    stats: { dmgDealt: num(st.dmgDealt), kills: num(st.kills), leaks: num(st.leaks), gold: num(st.gold), refreshes: num(st.refreshes), merges: num(st.merges), itemsEquipped: num(st.itemsEquipped), bossDamage: num(st.bossDamage), activatedLayers: num(st.activatedLayers) },
    band: me.bandId || null,
    layers, active,
    golden: lineup ? lineup.filter((u) => u.golden).length : null,
    custom: lineup ? lineup.filter((u) => u.diy).length : null,
    // the custom operators fielded at ANY point of the match (Fish, 2026-11-27: Ascalon farms stacks and leaves for the boss): the server's
    // `customSeen` plus the final board; null when neither is known
    customIds: lineup || me.customSeen ? [...new Set([...(me.customSeen ?? []), ...(lineup ? lineup.filter((u) => u.diy?.charId).map((u) => u.diy.charId) : [])])] : null,
  };
}
