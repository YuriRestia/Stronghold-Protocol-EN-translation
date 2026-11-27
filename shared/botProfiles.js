// (fork, GitHub #107) The bot profiles a room's host can give an AI seat, and the presets of 「用 AI 填满空位」.
// Ids are registered strategies (server/match/botStrategies.js; a test checks each). `external` is never listed: it is
// a dev checkout's LLM host, not a room choice. The first entry is the default and is what an AI seat plays when the
// host picks nothing; room.state names a seat's bot only when it is another one, so a default room's state is unchanged.
import { N_ } from './i18n.js';

/** @typedef {{ id: string, label: string, desc: string }} RoomBot */

/** @type {readonly RoomBot[]} */
export const ROOM_BOTS = Object.freeze([
  { id: 'legacy', label: N_('基础 AI'), desc: N_('原版 AI，未选择时的默认') },
  { id: 'fish-level', label: N_('升级曲线'), desc: N_('按模式长度换算的升级曲线，其余同基础 AI') },
  { id: 'fish-tier6', label: N_('六星优先'), desc: N_('优先购买六星干员，升级到 6 级，其余同基础 AI') },
  { id: 'evobot', label: N_('进化 AI'), desc: N_('自动调参后的基础 AI：后期卖掉凑不成对的低星干员，并购买叠层与资金道具') },
  { id: 'ioleta', label: N_('伊奥莱塔开局'), desc: N_('开局有伊奥莱塔策略时优先选择它') },
  { id: 'adaptive', label: N_('自适应布阵'), desc: N_('按地图搜索部署位置') },
  { id: 'ioleta-adaptive', label: N_('伊奥莱塔开局 + 自适应布阵'), desc: N_('伊奥莱塔开局，并按地图搜索部署位置') },
].map((b) => Object.freeze(b)));

export const DEFAULT_ROOM_BOT = ROOM_BOTS[0].id;

/**
 * (fork, GitHub #87 / #124) The 「AI 方案」 popup (public/js/ui/botInfo.js): how each room bot plays, in players' words.
 * `about`: the bot's own way of playing; `tactics`: a tactic profile's tactics, top first (server/match/botTacticsBasic.js;
 * a test checks they match the registered profile); every bot but the base AI also plays like it where its own rules stop.
 * @type {Readonly<Record<string, { about: string[], tactics?: Array<{ id: string, text: string }> }>>}
 */
// `strength` (GitHub #124, level 1): the win rate in Ultimate solo × 100 — botbench solo:ABYSS, seeds 1–80, 2026-11-14
// (the numbers: PR #151). `team` (level 2): the win rate of 4 such bots in Ultimate, coop4:ABYSS seeds 1–40. The
// SPA-CC level: not yet (the issue's grinder). A bot measured on more matches says so in its own `n`: legacy and evobot
// pool those seeds with 300 more of each mode (shark on PR #168, 2026-11-18, commit 7f91ff66), which moved evobot's team
// number from 78 to 71.
/** The matches each number is measured on by default (botbench seeds 1–80 solo, 1–40 for the team of 4). */
export const STRENGTH_MATCHES = Object.freeze({ solo: 80, team: 40 });

/**
 * The matches behind one bot's two numbers: its own `n`, else the default.
 * @param {{ n?: { solo: number, team: number } } | null | undefined} info
 */
export const strengthMatches = (info) => info?.n ?? STRENGTH_MATCHES;

/**
 * (fork, Fish on GitHub #151, 2026-11-16) One strength score: the solo and team-of-4 Ultimate win rates (%) added up,
 * 0–200, with ± 1 standard deviation (the two binomial errors combined). Null when a number is missing.
 * @param {{ strength?: number, team?: number, n?: { solo: number, team: number } } | null | undefined} info
 * @returns {{ score: number, sd: number } | null}
 */
export function botScore(info) {
  const s = info?.strength, tm = info?.team;
  if (!Number.isFinite(s) || !Number.isFinite(tm)) return null;
  const v = (p, n) => (p / 100) * (1 - p / 100) / n;
  const n = strengthMatches(info);
  return { score: s + tm, sd: Math.round(100 * Math.sqrt(v(s, n.solo) + v(tm, n.team))) };
}

/**
 * (fork, GitHub #124 level 3; fish-edition/spacc/grinder-definition.md) The SPA-CC grinder: fixed lobby-rule sets (Risk tags) the bot
 * plays on Ultimate, one list for solo and one for the team of 4 (4 clones), 8 sets each, 4 of them shared. Each list is worth
 * `SPACC_WEIGHT` points per set × its win rate (so 50 + 50 per shared set: the definition's "100 per set, split 50/50"): 800 at most when all 16 are measured,
 * on top of the 0–200 of levels 1–2; the score's own `max` is what the sets measured so far can give (50 each). A bot's numbers are `spacc: { solo: { H5: [wins, matches], … }, team: { … } }`; sets it has not
 * been measured on are absent and the score says how many it covers.
 */
export const SPACC_SETS = Object.freeze({
  solo: Object.freeze(['H5', 'H10', 'F9', 'C3', 'H15', 'H18', 'S5', 'S6']),
  team: Object.freeze(['H5', 'H10', 'C3', 'S6', 'CB2', 'H10B', 'CO10', 'CO15']),
});
export const SPACC_WEIGHT = 50;
/**
 * The SPA-CC score of a bot over the sets it is measured on, with ± 1 standard deviation (binomial, per set). Null when it has none.
 * @param {{ spacc?: { solo?: Record<string, [number, number]>, team?: Record<string, [number, number]> } } | null | undefined} info
 * @returns {{ points: number, sd: number, max: number, sets: number, of: number, matches: number, rate: number } | null} `rate`: the mean win rate (%) over the sets measured
 */
export function spaccScore(info) {
  let points = 0, v = 0, sets = 0, matches = 0, rates = 0;
  for (const mode of ['solo', 'team']) {
    for (const id of SPACC_SETS[mode]) {
      const r = info?.spacc?.[mode]?.[id];
      if (!Array.isArray(r) || !(r[1] > 0) || !(r[0] >= 0) || r[0] > r[1]) continue;
      const p = r[0] / r[1];
      rates += p; points += SPACC_WEIGHT * p; v += (SPACC_WEIGHT ** 2) * p * (1 - p) / r[1]; sets++; matches += r[1];
    }
  }
  const of = SPACC_SETS.solo.length + SPACC_SETS.team.length;
  return sets ? { points: Math.round(points), sd: Math.round(Math.sqrt(v)), max: SPACC_WEIGHT * sets, sets, of, matches, rate: Math.round((100 * rates) / sets) } : null;
}

/** " (113)": the bot's strength score for a drop-down option or a seat label, "" for a bot without measured numbers (GitHub #172). */
export function botScoreSuffix(id) {
  const sc = botScore(BOT_INFO[id]);
  return sc ? ` (${sc.score})` : '';
}

export const BOT_INFO = Object.freeze({
  legacy: {
    strength: 36, team: 63, n: { solo: 380, team: 340 },
    spacc: { solo: { H5: [272, 1000], H10: [176, 1000], F9: [178, 1000], C3: [171, 1000] } }, // #124, 2026-11-18, commit 3b00c4e42
    about: [
      N_('选择一个主盟约，围绕它购买、合成并升级干员，按回合推进调度中心等级'),
      N_('避免购买队友正在收集的盟约干员（高星干员更是如此），不与队友争抢'),
      N_('也会买入能与已有干员合成的干员'),
      N_('每回合部署前在后台试演几种布阵，选漏怪最少的一种；漏怪相同时，选对首领伤害更高、获得层数更多、击杀更多的一种'),
    ],
  },
  'fish-level': {
    // plays legacy's exact games on Ultimate (its curve is legacy's there: ai-players/05), so legacy's pooled numbers
    strength: 36, team: 63, n: { solo: 380, team: 340 },
    spacc: { solo: { H5: [272, 1000], H10: [176, 1000], F9: [178, 1000], C3: [171, 1000] } }, // #124, 2026-11-18, commit 3b00c4e42
    about: [N_('按升级曲线提升调度中心等级，曲线按模式长度换算（较短的模式升级更早）'), N_('其余同基础 AI'),
      N_('终极难度下它的升级曲线与基础 AI 的升级相同，所以对局完全一样，强度数字也相同；区别只在较短的模式中')],
    tactics: [{ id: 'level-curve', text: N_('升级曲线：每回合把调度中心升到曲线的等级，然后由基础 AI 继续升级') }],
  },
  'fish-tier6': {
    strength: 25, team: 33,
    about: [N_('优先买入商店里的六星干员，调度中心升到 6 级'), N_('其余同基础 AI')],
    tactics: [
      { id: 'buy-tier', text: N_('高星优先：在基础 AI 购买之前，先买商店里的六星干员，同时保留一些资金') },
      { id: 'level-curve', text: N_('升级曲线（最高 6 级）：每回合把调度中心升到曲线的等级') },
    ],
  },
  ioleta: {
    strength: 1, team: 60,
    about: [
      N_('开局有伊奥莱塔策略时优先选择它，并按它的合成计划分阶段采购核心干员'),
      N_('核心盟约被关闭时改为收集奥术或迅捷；其他策略的回合同基础 AI'),
    ],
  },
  adaptive: {
    strength: 20, team: 28,
    about: [
      N_('采购同基础 AI'),
      N_('布阵时按当前地图的路线、可部署格和攻击范围搜索，最多比较 8 种布阵（包括正面接敌的方案），试演后选最好的一种'),
    ],
  },
  evobot: {
    strength: 42, team: 71, n: { solo: 380, team: 340 },
    spacc: { solo: { H5: [294, 1000], H10: [199, 1000], F9: [222, 1000], C3: [203, 1000] } }, // #124, 2026-11-18, commit 3b00c4e42
    about: [
      N_('在基础 AI 之上自动调参得到，在 2000 局对比测试中胜过基础 AI'),
      N_('从第 9 回合起，卖掉手牌中凑不成对的一、二星干员'),
      N_('从第 5 回合到最终攻势前，购买增加层数的道具和资金道具，并留下约 9 点资金'),
      N_('其余同基础 AI'),
    ],
  },
  'ioleta-adaptive': {
    strength: 0, team: 23,
    about: [N_('伊奥莱塔开局（同「伊奥莱塔开局」），布阵同「自适应布阵」')],
  },
});

/** @param {unknown} id @returns {boolean} */
export const isRoomBot = (id) => typeof id === 'string' && ROOM_BOTS.some((b) => b.id === id);

/** @param {string | undefined | null} id @returns {RoomBot} the entry, or the default's for an unknown / missing id */
export const roomBot = (id) => ROOM_BOTS.find((b) => b.id === id) || ROOM_BOTS[0];

/**
 * 「用 AI 填满空位」: each preset gives the bot id of every seat it fills. More are planned (#107): 「推荐」, a stable set
 * with a high win rate, and 「最强」, a team from the bot research.
 * @typedef {{ id: string, label: string, bots: (count: number) => string[] }} FillPreset
 * @type {readonly FillPreset[]}
 */
export const FILL_PRESETS = Object.freeze([
  { id: 'basic', label: N_('全部基础 AI'), bots: (count) => Array.from({ length: count }, () => DEFAULT_ROOM_BOT) },
].map((p) => Object.freeze(p)));

/** @param {unknown} id @returns {boolean} */
export const isFillPreset = (id) => typeof id === 'string' && FILL_PRESETS.some((p) => p.id === id);
