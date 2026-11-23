// shared/autoAward.js — (fork, GitHub #125) the "auto-award free Risk tags" lobby rule (`autoAward`, shared/rules.js):
// at the end of a match, a Risk tag the room did not take is added to the result's Risk when the match shows it would
// have changed nothing: replaying the match with the tag on gives the same match. Not a cheat.
//
// Each awardable tag version names the conditions it needs (`needs`); a condition is "broken" by the first event that
// shows the tag could have mattered (server/match/autoAward.js watches them). A higher level needs its lower levels'
// conditions too when the tag stacks (Investor 2 includes Investor 1). A version marked `aiOk: false` is awarded only
// in a lobby without AI seats (bots and 托管): a bot reads prices, free slots, LP and rehearsal battles, so the tag can
// change what a bot does even when the condition held (the conditions and why: the analysis comment on #125).
//
// Only tags the room did not take at all are awarded (a tag taken at level 1 is not raised to 2).

import { N_ } from './i18n.js';

/**
 * The end screen's "why not" panel: what broke each condition, said as what happened in the match and how the tag
 * would have touched it (Fish, 2026-11-19: the condition texts read as rules, not as what happened). `{name}` is the
 * Operator or Strategy involved, `{bond}` the Alliance, `{item}` Junk's item; the panel puts "Round N:" in front.
 */
export const AWARD_EVENTS = Object.freeze({
  investor: N_('有博士的【{bond}】生效了（这个标签会让整备区的干员不再计入它）'),
  investorOps: N_('有博士获得了干员{name}（这个标签会改变{name}获得时的效果）'),
  swift: N_('有博士的【{bond}】在作战中生效了（这个标签会改变它回复技力的方式）'),
  foresight: N_('【{bond}】干员{name}参加了作战（这个标签会降低它的攻击速度）'),
  strategy1: N_('有博士选择了策略{name}，它在指定回合生效（这个标签会把它推迟1回合）'),
  strategy2: N_('有博士选择了策略{name}（这个标签会削弱它）'),
  intern: N_('有博士购买了I阶干员{name}（这个标签会让每回合第一名I阶干员更贵）'),
  barge: N_('有博士的调度中心升到了5级（这个标签会让这次升级更贵）'),
  lastLine: N_('如果每回合多扣2点目标生命值，会有博士被淘汰，或最终攻势提前失败'),
  junk: N_('有博士的手牌区满了（这个标签的【{item}】会占用一个位置）'),
});

/** The conditions, by id: their text (msgid) for the room dialog's list. */
export const AWARD_CONDITIONS = Object.freeze({
  investor: N_('没有博士的【投资人】生效过（候补区计入，任何时刻）'),
  investorOps: N_('没有博士获得过缪尔赛思、耶拉或焰尾（含精锐）'),
  swift: N_('没有博士的【迅捷】在任何作战中生效过'),
  foresight: N_('没有【远见】干员参加过任何作战'),
  strategy1: N_('没有博士选择受影响的策略（策略在第N回合生效的那些）'),
  strategy2: N_('也没有博士选择伊奥莱塔·罗素、杜遥夜或阿米娅'),
  intern: N_('没有博士在第3回合及之后购买过1阶干员'),
  barge: N_('没有博士的调度中心升到过5级'),
  lastLine: N_('每回合多扣2点目标生命值也不会淘汰任何博士，也不会让最终攻势提前失败'),
  junk: N_('每位博士的手牌区始终至少有1个空位'),
});

/**
 * The awardable tag versions, in RULES order. `needs`: condition ids (all must hold); `aiOk`: also with AI seats.
 * @type {ReadonlyArray<Readonly<{ key: string, level: number, needs: readonly string[], aiOk: boolean }>>}
 */
export const AWARDABLE = Object.freeze([
  { key: 'ccInvestorBench', level: 1, needs: ['investor'], aiOk: true },
  { key: 'ccInvestorBench', level: 2, needs: ['investor', 'investorOps'], aiOk: true },
  { key: 'ccSwift', level: 1, needs: ['swift'], aiOk: true },
  { key: 'ccForesight', level: 1, needs: ['foresight'], aiOk: true },
  { key: 'ccStrategyLate', level: 1, needs: ['strategy1'], aiOk: true },
  { key: 'ccStrategyLate', level: 2, needs: ['strategy1', 'strategy2'], aiOk: true },
  { key: 'ccTier1Price', level: 1, needs: ['intern'], aiOk: false },
  { key: 'ccUpgrade', level: 1, needs: ['barge'], aiOk: false },
  { key: 'ccUpgrade', level: 2, needs: ['barge'], aiOk: false },
  { key: 'ccLastLine', level: 1, needs: ['lastLine'], aiOk: false },
  { key: 'ccJunk', level: 1, needs: ['junk'], aiOk: false },
].map((a) => Object.freeze({ ...a, needs: Object.freeze(a.needs) })));

/** The Strategies Strategy 2 adds to Strategy 1's (shared/ruleData.js CC.strategy2: their own changes). */
export const STRATEGY2_BANDS = Object.freeze(['band_ioleta', 'band_duyaoy', 'band_amiya']);

/** Whether a Risk tag version can be awarded at all (the room's Risk grid marks those). */
export const isAwardable = (key, level) => AWARDABLE.some((a) => a.key === key && a.level === level);

/**
 * Why each awardable version the room didn't take wasn't awarded (the end screen's panel): its broken conditions with
 * the first break's round (null: at the end, e.g. a Strategy) and operator / Strategy id, and `ai` when it needs a
 * lobby without AI seats. A version below an awarded level of the same tag is left out.
 * @param {Record<string, any>} rules @param {Record<string, number>} awarded
 * @param {Record<string, { r: number|null, id?: string }>} why condition id → its first break
 * @param {{ aiSeats: boolean }} opts
 * @returns {Array<{ key: string, level: number, ai: boolean, broken: Array<{ c: string, r: number|null, id?: string }> }>}
 */
export function awardNotes(rules, awarded, why, { aiSeats }) {
  const out = [];
  if (rules?.autoAward !== true) return out;
  for (const a of AWARDABLE) {
    if ((Number(rules[a.key]) || 0) > 0 || (awarded[a.key] || 0) >= a.level) continue;
    const brokenList = a.needs.filter((c) => why[c]).map((c) => ({ c, ...why[c] }));
    const ai = !a.aiOk && aiSeats;
    if (brokenList.length || ai) out.push({ key: a.key, level: a.level, ai, broken: brokenList });
  }
  return out;
}

/**
 * The tags to award: for each tag the room did not take, the highest awardable level whose conditions all held.
 * @param {Record<string, any>} rules the lobby rules (autoAward must be on)
 * @param {Set<string>} broken the condition ids some event broke
 * @param {{ aiSeats: boolean }} opts whether the lobby had AI seats (bots, 托管)
 * @returns {Record<string, number>} tag key → level; empty when none (or the rule is off)
 */
export function awardedTags(rules, broken, { aiSeats }) {
  /** @type {Record<string, number>} */
  const out = {};
  if (rules?.autoAward !== true) return out;
  for (const a of AWARDABLE) {
    if ((Number(rules[a.key]) || 0) > 0) continue;
    if (!a.aiOk && aiSeats) continue;
    if (a.needs.some((c) => broken.has(c))) continue;
    if (!(out[a.key] >= a.level)) out[a.key] = a.level;
  }
  return out;
}
