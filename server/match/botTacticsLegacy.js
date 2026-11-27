// (fork) The layered legacy bot (fish-edition/ai-players/02-architecture.md): legacy rebuilt as one tactic per decision
// point. Each tactic hands its decision to legacy's own function and carries the tunables legacy reads there as its
// parameters (bot.js LEGACY_TUNABLES), with upstream's values as the defaults. So `legacy-layered` plays exactly like
// legacy, RNG draws included, and is the baseline for the tactics research: a tuning run varies these parameters, and a
// new tactic goes above the legacy-* tactic of its decision point.
//
// The tunables apply to the whole seat (botTactics.js defineProfile): a constant that legacy also reads at another
// decision point follows this parameter there too. The grouping by decision point is where each one mainly acts.
import { defineTactic, defineProfile } from './botTactics.js';
import { LEGACY_TUNABLES as L } from './bot.js';

const num = (min, max, def) => ({ type: 'number', min, max, default: def });
const int = (min, max, def) => ({ type: 'int', min, max, default: def });
/** The round each shop level is first wanted (bot.js LEVEL_TARGET): the first index holding level n. */
const levelFrom = (n) => L.LEVEL_TARGET.indexOf(n);

/** A pass-through to legacy at `point`: the decision is legacy's, with these tunables. */
const pass = (point, gen) => (gen
  ? { *[point](ctx) { return yield* ctx.next(); } }
  : { [point]: (ctx) => ctx.next() });

export const LEGACY_BAND = defineTactic({
  id: 'legacy-band',
  describe: "legacy's band pick: band strength shrunk toward the mean, then raised to a power; reserved and burdening bands weighed down",
  params: {
    strengthShrink: num(0, 1, L.BAND_STRENGTH_SHRINK),
    strengthPower: num(0, 12, L.BAND_STRENGTH_POWER),
    softReserve: num(0, 1, L.SOFT_BAND_RESERVE),
    mateBurden: num(0, 1, L.MATE_BURDEN),
  },
  at: pass('pickBand'),
  tunables: (p) => ({ BAND_STRENGTH_SHRINK: p.strengthShrink, BAND_STRENGTH_POWER: p.strengthPower,
    SOFT_BAND_RESERVE: p.softReserve, MATE_BURDEN: p.mateBurden }),
});

export const LEGACY_CARD = defineTactic({ id: 'legacy-card', describe: "legacy's card pick", at: pass('pickCard') });

export const LEGACY_BOUNTY = defineTactic({
  id: 'legacy-bounty',
  describe: "legacy's bounty kill chance: the exposure (× the enemy's HP) for a 63 % kill",
  params: { kill: num(0.5, 6, L.BOUNTY_KILL) },
  at: pass('bountyKillChance'),
  tunables: (p) => ({ BOUNTY_KILL: p.kill }),
});

export const LEGACY_OFFERS = defineTactic({ id: 'legacy-offers', describe: "legacy's offers", at: pass('takeOffers') });

export const LEGACY_SELL = defineTactic({
  id: 'legacy-sell',
  describe: "legacy's selling and layer trades: layers per net fund a trade needs (co-op / solo), and the round trades start",
  params: {
    tradeMin: num(0, 10, L.TRADE_MIN),
    soloTradeMin: num(0, 10, L.SOLO_TRADE_MIN),
    tradeFrom: int(0, 15, L.TRADE_FROM),
  },
  at: pass('sellJunk'),
  tunables: (p) => ({ TRADE_MIN: p.tradeMin, SOLO_TRADE_MIN: p.soloTradeMin, TRADE_FROM: p.tradeFrom }),
});

export const LEGACY_BUY = defineTactic({
  id: 'legacy-buy',
  describe: "legacy's buying: the purchase and lineup weights, the bench budget and the refresh cap",
  params: {
    buyFullMin: num(0, 40, L.BUY_FULL_MIN),
    mergeHit: num(0, 100, L.MERGE_HIT),
    pairHit: num(0, 40, L.PAIR_HIT),
    maxPairs: int(0, 8, L.MAX_PAIRS),
    maxRefreshes: int(0, 40, L.MAX_REFRESHES),
    benchBudget: int(0, 10, L.BENCH_BUDGET),
    coopBenchBudget: int(0, 10, L.COOP_BENCH_BUDGET),
    diyPieceBonus: num(0, 40, L.DIY_PIECE_BONUS),
    engineBonus: num(0, 40, L.ENGINE_BONUS),
    armorWeight: num(0, 40, L.ARMOR_WEIGHT),
    planUnitShare: num(0, 1, L.PLAN_UNIT_SHARE),
    focusMember: num(0, 20, L.FOCUS_MEMBER),
    coreTopTier: num(0, 80, L.CORE_TOP_TIER),
    topAboveCap: num(0, 150, L.TOP_ABOVE_CAP),
    coreKeepOwned: int(0, 9, L.CORE_KEEP_OWNED),
    coreLock: num(0, 40, L.CORE_LOCK),
    coreMember: num(0, 40, L.CORE_MEMBER),
    coreHit: num(0, 60, L.CORE_HIT),
    healFrom: int(0, 15, L.HEAL_FROM),
    healFirst: num(0, 40, L.HEAL_FIRST),
    healSecond: num(0, 30, L.HEAL_SECOND),
  },
  at: pass('buyLoopSteps', true),
  tunables: (p) => ({
    BUY_FULL_MIN: p.buyFullMin, MERGE_HIT: p.mergeHit, PAIR_HIT: p.pairHit, MAX_PAIRS: p.maxPairs,
    MAX_REFRESHES: p.maxRefreshes, BENCH_BUDGET: p.benchBudget, COOP_BENCH_BUDGET: p.coopBenchBudget,
    DIY_PIECE_BONUS: p.diyPieceBonus, ENGINE_BONUS: p.engineBonus, ARMOR_WEIGHT: p.armorWeight,
    PLAN_UNIT_SHARE: p.planUnitShare, FOCUS_MEMBER: p.focusMember, CORE_TOP_TIER: p.coreTopTier,
    TOP_ABOVE_CAP: p.topAboveCap, CORE_KEEP_OWNED: p.coreKeepOwned, CORE_LOCK: p.coreLock, CORE_MEMBER: p.coreMember,
    CORE_HIT: p.coreHit, HEAL_FROM: p.healFrom, HEAL_FIRST: p.healFirst, HEAL_SECOND: p.healSecond,
  }),
});

/** legacy's LEVEL_TARGET from the round each level is first wanted (out-of-order rounds are sorted). */
export function levelTarget(from, length = L.LEVEL_TARGET.length) {
  const rounds = [...from].sort((a, b) => a - b);
  return Object.freeze(Array.from({ length }, (_, r) => 1 + rounds.filter((f) => f <= r).length));
}

export const LEGACY_LEVEL = defineTactic({
  id: 'legacy-level',
  describe: "legacy's levelling: the round each shop level is first wanted, and the bot's level cap",
  params: {
    level2From: int(0, 15, levelFrom(2)),
    level3From: int(0, 15, levelFrom(3)),
    level4From: int(0, 15, levelFrom(4)),
    level5From: int(0, 15, levelFrom(5)),
    maxLevel: int(2, 6, L.BOT_MAX_LEVEL),
  },
  at: pass('levelUp'),
  tunables: (p) => ({ LEVEL_TARGET: levelTarget([p.level2From, p.level3From, p.level4From, p.level5From]), BOT_MAX_LEVEL: p.maxLevel }),
});

export const LEGACY_SPEND = defineTactic({ id: 'legacy-spend', describe: "legacy's end-of-prep spending", at: pass('spendDown') });
export const LEGACY_FREEZE = defineTactic({ id: 'legacy-freeze', describe: "legacy's shop freeze", at: pass('maybeFreeze') });

export const LEGACY_EQUIP = defineTactic({
  id: 'legacy-equip',
  describe: "legacy's items: the weight of a wanted item, and the tier an elite item waits for",
  params: { wantedItem: num(0, 100, L.WANTED_ITEM), eliteItemTier: int(1, 6, L.ELITE_ITEM_TIER) },
  at: pass('equipItems'),
  tunables: (p) => ({ WANTED_ITEM: p.wantedItem, ELITE_ITEM_TIER: p.eliteItemTier }),
});

export const LEGACY_ARRANGE = defineTactic({
  id: 'legacy-arrange',
  describe: "legacy's placement: the exposure model's weights (LAYOUT_PARAMS), and the Final Assault lineups rehearsed",
  params: {
    hold: num(0, 12, L.LAYOUT_PARAMS.hold),
    kill: num(0, 6, L.LAYOUT_PARAMS.kill),
    secondHold: num(0, 4, L.LAYOUT_PARAMS.secondHold),
    healHold: num(0, 4, L.LAYOUT_PARAMS.healHold),
    roadPenalty: num(0, 1, L.LAYOUT_PARAMS.roadPenalty),
    spread: int(1, 99, L.LAYOUT_PARAMS.spread),
    faLineups: int(0, 4, L.FA_LINEUPS),
  },
  at: pass('arrangeSteps', true),
  tunables: (p) => ({
    LAYOUT_PARAMS: Object.freeze({ ...L.LAYOUT_PARAMS, hold: p.hold, kill: p.kill, secondHold: p.secondHold,
      healHold: p.healHold, roadPenalty: p.roadPenalty, spread: p.spread }),
    FA_LINEUPS: p.faLineups,
  }),
});

/** legacy's decision points in its own order: draft, economy, placement. */
export const LEGACY_TACTICS = Object.freeze([LEGACY_BAND, LEGACY_CARD, LEGACY_BOUNTY, LEGACY_OFFERS, LEGACY_SELL,
  LEGACY_BUY, LEGACY_LEVEL, LEGACY_SPEND, LEGACY_FREEZE, LEGACY_EQUIP, LEGACY_ARRANGE]);

/** The registered id of the layered legacy bot (SP_BOT_STRATEGY, botbench --bot). */
export const LEGACY_PROFILE_ID = 'legacy-layered';

export const LEGACY_LAYERED = defineProfile({ id: LEGACY_PROFILE_ID, tactics: LEGACY_TACTICS });
