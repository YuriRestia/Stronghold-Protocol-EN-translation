// (fork) The first tactics and profiles (botTactics.js), from the hypothesis tests of fish-edition/ai-players.md:
// humans level from round 1 and by the mode's own boss round (H4, H7), and their boards beat the bot's mainly by the
// tier-6 operators they field (the tier-6 dose-response). Each acts through PlayerState's validated intents only.
import { defineTactic, defineProfile, PASS } from './botTactics.js';
import { freeSlot } from './board.js';

const ok = (fn) => { try { const r = fn(); return !!(r && r.ok); } catch { return false; } };

/**
 * The shop level wanted by round in a 14-round mode: legacy's curve (bot.js LEVEL_TARGET) as 0.3.3 had it, level 6
 * from round 11 (§35.63; sganggs dev dropped level 6 from legacy). `maxLevel` caps it.
 */
const CURVE = [1, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 6, 6, 6];

/**
 * Level the 调度中心 to the curve's level of the round, the curve read on the mode's own length when `scale` is 'boss'
 * (round × 14 / boss round: FUNNY's round-9 boss meets level 5, H4), `shift` rounds early, up to `maxLevel`, keeping
 * `reserve` funds. Before legacy, and legacy's own level-ups follow.
 */
export const LEVEL_CURVE = defineTactic({
  id: 'level-curve',
  describe: "level by legacy's curve, read on the mode's length; then legacy's level-ups",
  params: {
    scale: { type: 'choice', choices: ['round', 'boss'], default: 'boss' },
    shift: { type: 'int', min: -2, max: 4, default: 0 },
    maxLevel: { type: 'int', min: 2, max: 6, default: 5 },
    reserve: { type: 'int', min: 0, max: 20, default: 0 },
  },
  at: {
    levelUp(ctx) {
      const { match: m, player: ps, params: p } = ctx;
      const gd = ps.gd || m.gd;
      const r = (p.scale === 'boss' && gd.bossRound > 0 ? m.round * 14 / gd.bossRound : m.round) + p.shift;
      const target = Math.min(p.maxLevel, gd.maxShopLevel, CURVE[Math.max(0, Math.min(CURVE.length - 1, Math.floor(r)))]);
      for (let guard = 0; guard < 6 && !ps.offers.length && ps.shop.level < target; guard++) {
        if (ps.funds - Math.max(0, ps.shop.upgradePrice) < p.reserve || !ok(() => ps.levelUp())) break;
      }
      return ctx.next();
    },
  },
});

/**
 * Buy the shop's operators of tier `minTier` and up before legacy's buying, while funds stay at `reserve` or more and
 * the hand has room (or the copy merges). Then legacy's buy loop.
 */
export const BUY_TIER = defineTactic({
  id: 'buy-tier',
  describe: 'buy high-tier operators first; then legacy buys',
  params: {
    minTier: { type: 'int', min: 3, max: 6, default: 6 },
    reserve: { type: 'int', min: 0, max: 20, default: 0 },
  },
  at: {
    *buyLoopSteps(ctx) {
      const { match: m, player: ps, params: p } = ctx;
      const gd = ps.gd || m.gd;
      for (let i = 0; i < ps.shop.slots.length; i++) {
        const s = ps.shop.slots[i];
        if (!s || s.sold || s.kind !== 'chess' || (gd.chess(s.id)?.tier || 0) < p.minTier) continue;
        if (ps.priceOf(s) > ps.funds - p.reserve) continue;
        if (freeSlot(ps.hand) < 0 && !ps.completesChessMerge(s.id)) continue;
        if (ok(() => ps.buy(i))) yield;
      }
      return yield* ctx.next();
    },
  },
});

/**
 * SPA-CC ccPatriot Undying 1: take the round-9 Improv's Patriot card whenever it is offered (match/infra.js
 * riskPatriotCard: id 'risk:patriot', worth 0 Funds), so a bench measures Patriot when he is taken, not only the
 * skip penalty (legacy prices him as an ordinary bounty and nearly always leaves him). Any other pick: legacy's, with
 * legacy's RNG draws.
 */
export const TAKE_PATRIOT = defineTactic({
  id: 'take-patriot',
  describe: "take the Patriot card (SPA-CC Undying 1) when offered; else legacy's pick",
  at: {
    pickCard(ctx) {
      const [cards, available] = ctx.args;
      const i = (available || []).find((j) => cards && cards[j] && cards[j].id === 'risk:patriot');
      return i === undefined ? PASS : i;
    },
  },
});

export const BASIC_TACTICS = Object.freeze([LEVEL_CURVE, BUY_TIER, TAKE_PATRIOT]);

/** Opt-in profiles, by `SP_BOT_STRATEGY` / `SP_BOT_STRATEGY_SEATS` / `botbench --bot`. legacy below each. */
export const FISH_PROFILES = Object.freeze([
  // H4: the scaled curve alone
  defineProfile({ id: 'fish-level', tactics: [LEVEL_CURVE] }),
  // the tier-6 finding: level 6 when the curve gets there, and tier-6 operators bought first
  defineProfile({ id: 'fish-tier6', tactics: [BUY_TIER, { tactic: LEVEL_CURVE, params: { maxLevel: 6 } }] }),
  // SPA-CC balance benches: legacy that always takes Patriot (not a room choice)
  defineProfile({ id: 'fish-patriot', tactics: [TAKE_PATRIOT] }),
]);

