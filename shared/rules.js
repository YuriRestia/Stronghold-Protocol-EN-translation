// shared/rules.js — Custom Lobby Modifications (Fish Edition): the host-set rules of a room, all off by default. Pure ESM
// shared by the server (lobby, match), the sim (BattleSpec flags.rules) and the client (room screen, result screen).
//
// Every rule has a category (fish-edition/ROADMAP.md "SPA-CC"), which decides how a result is labelled:
//   neutral  free to take: Alliance Modules, rebalanced alliances
//   cheat    the end screen carries a "WITH CHEATS" watermark (+2 Deployment Limit, +2 Funds, untimed)
//   seeded   less luck: "seeded" after the result title (the chosen map, chosen alliance bans)
//   risk     SPA-CC difficulty tags worth Risk ("Ultimate+5"; fish-edition/ROADMAP.md "SPA-CC"); with a cheat on
//            the Risk still shows — the "WITH CHEATS" watermark tells (Fish 2026-10-16)
// A rule's value type:
//   bool     true / false (default false)
//   choice   one of `options` (default options[0], the original game)
//   stage    a stage id of the match's mode, or null = random (the match drops one its mode does not have)
//   bans     a list of bond ids to ban, at most `max`; the match keeps the valid ones up to the difficulty's counts and
//            draws the rest at random as usual
//   level    a Risk tag: 0 = off, 1 … `risk.length - 1`; `risk[level]` is its Risk. A sequence (1 / 2 / 3 Risk) is one
//            rule, so its levels exclude each other. A tag group (Famiglia, Patriot, Delegation) is a tree: `nodes` names
//            each level and `parent` gives the level it builds on (0 = none); a level includes its ancestors' effects
//            (Seasonal 3 = Seasonal 2 + Cleaner) and excludes its siblings' (tagNodes). Without `parent` the levels are a
//            chain (each includes the ones above it only by its own numbers, as before)
// room.setRules merges a partial { [key]: value } into the room's rules; the match reads them once at start
// (Match opts.rules). Rooms searching for teammates and the solo queue play the original game: a room with any rule
// set cannot search (Lobby.search).

export const RULE_CATEGORIES = Object.freeze(['neutral', 'cheat', 'seeded', 'risk']);

export const RULE_EXTRA_DEPLOY = 2;
export const RULE_EXTRA_FUNDS = 2;
/** The most ban picks a rules object keeps (the difficulties draw at most 3 core + 4 add-on). */
export const RULE_BANS_MAX = 12;

/**
 * The rules, in the order the room screen lists them. `stacks` (a Risk tag chain): each level adds to the ones below it,
 * which stay in force (the sim reads `> 0` for level 1's part); otherwise a chain's level replaces the ones below.
 * @type {ReadonlyArray<{ key: string, type: string, category: string, options?: string[], risk?: number[], nodes?: (string|null)[], parent?: number[], stacks?: boolean }>}
 */
export const RULES = Object.freeze([
  // cheats
  { key: 'extraDeploy', type: 'bool', category: 'cheat' },      // +RULE_EXTRA_DEPLOY deployment limit for every player
  { key: 'extraFunds', type: 'bool', category: 'cheat' },       // +RULE_EXTRA_FUNDS Funds at every round start
  { key: 'untimed', type: 'bool', category: 'cheat' },          // no countdown on the screens players act on (battles keep theirs)
  { key: 'doubleLp', type: 'bool', category: 'cheat' },         // every player starts with twice its strategy's LP
  { key: 'tierStart', type: 'bool', category: 'cheat' },        // every player starts with one random operator of each tier
  { key: 'boosterPack', type: 'bool', category: 'cheat' },      // every player starts with a Booster Pack (shared/ruleData.js BOOSTER)
  { key: 'itemBoosterPack', type: 'bool', category: 'cheat' },  // … and an Equipment Booster Pack (shared/ruleData.js ITEM_BOOSTER)
  { key: 'transmitterPlus', type: 'bool', category: 'cheat' },  // (GitHub #133) Transmitter+ (shared/ruleData.js TRANSMITTER_PLUS)
  // Alliance Modules: A = the original effect
  { key: 'lateranoMod', type: 'choice', options: ['A', 'B'], category: 'neutral' },
  { key: 'victoriaMod', type: 'choice', options: ['A', 'C'], category: 'neutral' },
  // rebalanced alliances
  { key: 'virtuosaBonds', type: 'bool', category: 'neutral' },  // 塑心 also in 迅捷 and 助力
  { key: 'blaze', type: 'bool', category: 'neutral' },          // 煌 replaces 凯瑟琳 in her shop slot
  // less luck
  { key: 'stage', type: 'stage', category: 'seeded' },
  { key: 'bans', type: 'bans', category: 'seeded' },
  // SPA-CC Risk tags (FINDINGS.md §5)
  { key: 'ccInvestorBench', type: 'level', risk: [0, 1, 2], stacks: true, category: 'risk' }, // 投资人: the bench no longer counts (2: 缪尔赛思 / 耶拉 / 焰尾 grant when sold)
  { key: 'ccSwift', type: 'level', risk: [0, 1], category: 'risk' },         // 迅捷: 20 + 0.25 × stacks % (was 0.35)
  { key: 'ccForesight', type: 'level', risk: [0, 1], category: 'risk' },     // 远见 operators −20 ASPD, active or not
  { key: 'ccStrategyLate', type: 'level', risk: [0, 1, 2], stacks: true, category: 'risk' }, // Strategies' named rounds one round later (2: 伊奥莱塔 ≤ 50 %, 杜遥夜 1 refresh, 阿米娅 +1 alliance)
  { key: 'ccTier1Price', type: 'level', risk: [0, 1], category: 'risk' },    // from round 3, the first tier-1 operator +1
  { key: 'ccUpgrade', type: 'level', risk: [0, 1, 2], category: 'risk' },    // shop upgrade 4→5 +2 (2: and 5→6 +3)
  { key: 'ccSpRecovery', type: 'level', risk: [0, 1, 2, 3], category: 'risk' }, // time SP −0.2 / 0.5 / 0.8 per s
  { key: 'ccBoss', type: 'level', risk: [0, 1, 2, 3], category: 'risk' },    // final boss +50/150/400 % HP, +15/25/50 % ATK
  { key: 'ccLeaderDr', type: 'level', risk: [0, 1, 2], category: 'risk' },   // leaders 50 / 90 % DR outside a burst
  { key: 'ccDeepInfiltration', type: 'level', risk: [0, 1], category: 'risk' }, // DP generation −50 %
  { key: 'ccLowEfficiency', type: 'level', risk: [0, 1], category: 'risk' },  // redeployment time +75 %
  { key: 'ccLastLine', type: 'level', risk: [0, 1], category: 'risk' },       // the first leak each round: +2 LP, past the cap
  { key: 'ccJunk', type: 'level', risk: [0, 1, 2], stacks: true, category: 'risk' },       // Toxic Waste for everyone (2: −1 income unequipped)
  { key: 'ccOzArts', type: 'level', risk: [0, 1], category: 'risk' },         // final boss +50 RES after 50 % of its pool as Arts
  { key: 'ccOzPhys', type: 'level', risk: [0, 1], category: 'risk' },         // final boss +5000 DEF after 50 % as Physical
  { key: 'ccLockout', type: 'level', risk: [0, 1, 2, 3], category: 'risk' },  // final boss invulnerable 10 s every 68/28/18 %
  // tag groups (trees: see `level` above)
  { key: 'ccFamiglia', type: 'level', risk: [0, 1, 2, 3, 2, 3], nodes: [null, 'cleaner', 'unending2', 'unending3', 'seasonal2', 'seasonal3'], parent: [0, 0, 1, 2, 1, 4], category: 'risk' },
  { key: 'ccPatriot', type: 'level', risk: [0, 1, 2, 3], nodes: [null, 'undying1', 'undying2', 'undying3'], parent: [0, 0, 1, 2], category: 'risk' },
  { key: 'ccDelegation', type: 'level', risk: [0, 1, 2, 3], nodes: [null, 'united1', 'united2', 'united3'], parent: [0, 0, 1, 2], category: 'risk' },
  { key: 'ccVengeance', type: 'level', risk: [0, 1, 2, 3], nodes: [null, 'blade1', 'blade2', 'blade3'], parent: [0, 0, 1, 2], category: 'risk' },
].map((r) => Object.freeze(r)));

const BY_KEY = new Map(RULES.map((r) => [r.key, r]));
export const RULE_KEYS = Object.freeze(RULES.map((r) => r.key));

const ID = /^[A-Za-z0-9_\-]{1,64}$/;

/** The default (original game) value of a rule. */
export function ruleDefault(rule) {
  if (rule.type === 'bool') return false;
  if (rule.type === 'level') return 0;
  if (rule.type === 'choice') return rule.options[0];
  if (rule.type === 'bans') return Object.freeze([]);
  return null;
}

export const DEFAULT_RULES = Object.freeze(Object.fromEntries(RULES.map((r) => [r.key, ruleDefault(r)])));

/** `v` as a valid value of `rule`, or undefined. */
function cleanValue(rule, v) {
  switch (rule.type) {
    case 'bool': return typeof v === 'boolean' ? v : undefined;
    case 'choice': return rule.options.includes(v) ? v : undefined;
    case 'level': return Number.isInteger(v) && v >= 0 && v < rule.risk.length ? v : undefined;
    case 'stage': return v === null || (typeof v === 'string' && ID.test(v)) ? v : undefined;
    case 'bans': {
      if (!Array.isArray(v)) return undefined;
      const out = [];
      for (const id of v) if (typeof id === 'string' && ID.test(id) && !out.includes(id) && out.length < RULE_BANS_MAX) out.push(id);
      return Object.freeze(out.sort());
    }
    default: return undefined;
  }
}

/** Whether `v` is a valid value of rule `key` as sent by a client (room.setRules; shared/protocol.js). */
export function isRuleValue(key, v) {
  const r = BY_KEY.get(key);
  if (!r || cleanValue(r, v) === undefined) return false;
  return r.type !== 'bans' || (v.length <= RULE_BANS_MAX && new Set(v).size === v.length && v.every((id) => typeof id === 'string' && ID.test(id)));
}

/** Whether two values of one rule are the same (a bans list by its ids). */
export function sameRuleValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
  return a === b;
}

/** A complete, frozen rules object: known keys only, valid values only, the rest from `base` (default: all off). */
export function normalizeRules(rules, base = DEFAULT_RULES) {
  const out = {};
  for (const r of RULES) {
    const v = rules && typeof rules === 'object' ? cleanValue(r, rules[r.key]) : undefined;
    const b = base && typeof base === 'object' ? cleanValue(r, base[r.key]) : undefined;
    out[r.key] = v !== undefined ? v : b !== undefined ? b : ruleDefault(r);
  }
  return Object.freeze(out);
}

/** Whether a rule's value differs from the original game. */
export function ruleSet(key, value) {
  const r = BY_KEY.get(key);
  if (!r) return false;
  if (r.type === 'bans') return Array.isArray(value) && value.length > 0;
  return value !== undefined && value !== ruleDefault(r);
}

/** The keys of the rules in force (not at their default), in RULES order. */
export function rulesInForce(rules) {
  return RULE_KEYS.filter((k) => ruleSet(k, rules?.[k]));
}

/** Whether a rules object changes anything (a room with one cannot search for teammates). */
export const anyRule = (rules) => rulesInForce(rules).length > 0;

/**
 * How a result with these rules is labelled: `cheats` (the "WITH CHEATS" watermark), `seeded`, and `risk` (the sum of
 * the risk tags, cheats or not).
 * @returns {{ cheats: boolean, seeded: boolean, risk: number }}
 */
export function ruleLabels(rules) {
  const on = rulesInForce(rules).map((k) => BY_KEY.get(k));
  const cheats = on.some((r) => r.category === 'cheat');
  const seeded = on.some((r) => r.category === 'seeded');
  // with cheats too: the "WITH CHEATS" watermark says so, the end screen still shows the Risk (Fish 2026-10-16)
  const risk = on.reduce((n, r) => n + (r.category === 'risk' ? ruleRisk(r.key, rules[r.key]) : 0), 0);
  return { cheats, seeded, risk };
}

/** The Risk of a rule at `value` (0 for anything but a Risk tag). */
export function ruleRisk(key, value) {
  const r = BY_KEY.get(key);
  return r && r.type === 'level' && Number.isInteger(value) ? Number(r.risk[value]) || 0 : 0;
}

/** The level of a Risk tag in `rules` (0 = off). */
export const tagLevel = (rules, key) => (Number.isInteger(rules?.[key]) ? rules[key] : 0);

/** The level `level` of Risk tag `key` builds on (0 = none): its tree parent, else the chain's previous level. */
export function tagParent(key, level) {
  const r = BY_KEY.get(key);
  if (!r || r.type !== 'level' || !(level > 0)) return 0;
  return Array.isArray(r.parent) ? r.parent[level] || 0 : level - 1;
}

/** The depth of a level of Risk tag `key` (1 = the top row of its column). */
export function tagDepth(key, level) {
  let d = 0;
  for (let l = level; l > 0 && d < 16; l = tagParent(key, l)) d++;
  return d;
}

/**
 * The node names in force for a tag group in `rules`: the chosen level's and its ancestors' (a Set; empty when off or
 * for a tag without `nodes`).
 */
export function tagNodes(rules, key) {
  const r = BY_KEY.get(key);
  const out = new Set();
  if (!r || !Array.isArray(r.nodes)) return out;
  for (let l = tagLevel(rules, key), n = 0; l > 0 && n < 16; l = tagParent(key, l), n++) if (r.nodes[l]) out.add(r.nodes[l]);
  return out;
}

/** Whether node `node` of tag group `key` is in force in `rules` (chosen, or under a chosen level). */
export const tagHas = (rules, key, node) => tagNodes(rules, key).has(node);

/** The rule record of `key`, or null. */
export const ruleOf = (key) => BY_KEY.get(key) || null;
