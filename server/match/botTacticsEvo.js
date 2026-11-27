// (fork) evobot (Fish, 2026-11-17): the winner of the weekend evolution race (fish-edition/ai-players/10 "The weekend
// race"; tools/evolve.mjs on the research branch, #137): legacy with two research tactics on top,
//   sell-singles(fromRound 9, maxTier 2) > plan-items(set both, fromRound 5, reserve 9).
// The tactics are copied unchanged from server/match/botTacticsResearch.js (feature/bot-plan-tactics). Like every
// tactic they act through PlayerState's validated intents only, draw no RNG and run no rehearsal: browser-safe and
// deterministic (a seat played in a browser keeps its profile).
import { defineTactic, defineProfile } from './botTactics.js';
import { freeSlot } from './board.js';

const ok = (fn) => { try { const r = fn(); return !!(r && r.ok); } catch { return false; } };
const gdOf = (m, ps) => ps.gd || m.gd;
const int = (min, max, def) => ({ type: 'int', min, max, default: def });

/** Copies of each base id the seat holds (board, hand, temp), elites apart. */
function copiesOf(m, ps) {
  const gd = gdOf(m, ps), out = new Map();
  for (const p of ps.allChess()) {
    if (gd.isGolden(p.id)) continue;
    const b = gd.baseIdOf(p.id);
    out.set(b, (out.get(b) || 0) + 1);
  }
  return out;
}

/** After legacy's selling, from `fromRound`: the hand's single copies of tier `maxTier` and below are sold. */
export const SELL_SINGLES = defineTactic({
  id: 'sell-singles',
  describe: "supplement: after legacy's selling, sell the hand's low-tier single copies",
  params: { fromRound: int(0, 14, 6), maxTier: int(1, 5, 2) },
  at: {
    sellJunk(ctx) {
      const r = ctx.next();
      const { match: m, player: ps, params: p } = ctx;
      if (m.round < p.fromRound) return r;
      const gd = gdOf(m, ps), copies = copiesOf(m, ps);
      for (const piece of ps.hand) {
        if (!piece || piece.kind !== 'chess' || gd.isGolden(piece.id)) continue;
        if ((gd.tierOf(piece.id) || 0) > p.maxTier || (copies.get(gd.baseIdOf(piece.id)) || 0) >= 2) continue;
        ok(() => ps.sell(piece.uid));
      }
      return r;
    },
  },
});

/** The plan's listed shop items (items.buy) the shop shows, bought before legacy's buy loop (above params.reserve). */
export function* listedItemsFirst(ctx) {
  const { match: m, player: ps, params: p, args: [opts] } = ctx;
  const want = ps._botSelf?.round === m.round ? ps._botSelf.plan?.items?.buy : null;
  if (!opts?.fillOnly && want?.length && ps.isBot && !ps.autoplay) {
    for (let guard = 0; guard < 4; guard++) {
      const i = ps.shop.slots.findIndex((sl) => sl && !sl.sold && sl.kind === 'item' && want.includes(sl.id)
        && ps.funds - ps.priceOf(sl) >= (p.reserve || 0));
      if (i < 0 || freeSlot(ps.hand) < 0 || !ok(() => ps.buy(i))) break;
      yield;
    }
  }
  return yield* ctx.next();
}

/**
 * Writes legacy's own plan: from `fromRound` to the Final Assault prep, shop consumables into the plan's `items.buy`.
 * The tactic buys the listed items the shop shows before legacy's buy loop; legacy's own plan step (planSpendSteps) buys
 * them too, and legacy equips them (equipItems). §37.39 stopped legacy buying shop equipment; it never buys these
 * (fish-edition/ai-players/08: per human seat 1.5 简易通讯机, 1.0 寻呼模块, 1.4 见钱眼开玩偶, 1.3 骑士储蓄罐 and 0.5
 * 精打细算玩偶 against ≤ 0.02 per bot seat).
 *   - stack: 随身身份牌 (1: +3 stacks), 简易通讯机 (2: an operator of the bearer's Alliances), 寻呼模块 (4: a free pick of 3);
 *   - coin: 见钱眼开玩偶 (1: +2 funds next round), 骑士储蓄罐 (3: 1–6 funds), and 精打细算玩偶 (3: +1 fund every later round)
 *     while 5 rounds or more remain before the Final Assault (legacy's own solo doll rule, §37.41).
 * Data, plus that one buy step.
 */
const ITEM_SETS = Object.freeze(['stack', 'coin', 'both']);
const STACK_ITEMS = Object.freeze(['chess_item_1_04_e_a', 'chess_item_2_06_e_a', 'chess_item_4_01_e_a']);
const COIN_ITEMS = Object.freeze(['chess_item_2_07_e_a', 'chess_item_3_12_e_a']);
const EARLY_DOLL = 'chess_item_2_05_e_a';
export const PLAN_ITEMS = defineTactic({
  id: 'plan-items',
  describe: "writes legacy's plan: shop consumables (stack items, funds dolls) into its items.buy list from a round on",
  params: {
    set: { type: 'choice', choices: ITEM_SETS, default: 'both' },
    fromRound: int(1, 14, 4),
    reserve: int(0, 30, 0),
  },
  at: {
    sellJunk(ctx) {
      const { match: m, player: ps, params: p } = ctx;
      const own = ps._botSelf;
      const boss = (ps.gd || m.gd).bossRound;
      if (m.round >= p.fromRound && m.round < boss && ps.isBot && !ps.autoplay && (!own || own.round === m.round)) {
        const add = [];
        if (p.set !== 'coin') add.push(...STACK_ITEMS);
        if (p.set !== 'stack') add.push(...COIN_ITEMS, ...(boss - m.round >= 5 ? [EARLY_DOLL] : []));
        const plan = own?.plan || {};
        const items = plan.items || {};
        const buy = Object.freeze([...new Set([...(items.buy || []), ...add])].slice(0, 8));
        ps._botSelf = { round: m.round, plan: Object.freeze({ ...plan, items: Object.freeze({ ...items, buy }) }) };
      }
      return ctx.next();
    },
    // Legacy's buy loop spends on operators and refreshes before a listed item wins a step, so the shop's listed items
    // are bought first (above `reserve`, with a free hand slot); legacy's equipItems uses them later in the prep.
    *buyLoopSteps(ctx) { return yield* listedItemsFirst(ctx); },
  },
});

export const EVO_TACTICS = Object.freeze([SELL_SINGLES, PLAN_ITEMS]);

/** The room profile: the race's best (best.json, evo-99f84d0e339c); legacy below. */
export const EVO_PROFILES = Object.freeze([
  defineProfile({ id: 'evobot', tactics: [
    { tactic: SELL_SINGLES, params: { fromRound: 9, maxTier: 2 } },
    { tactic: PLAN_ITEMS, params: { set: 'both', fromRound: 5, reserve: 9 } },
  ] }),
]);
