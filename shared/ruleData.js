// shared/ruleData.js — the game data changes of the Custom Lobby Modifications' rebalanced alliances (shared/rules.js):
// one pure function over raw data/*.json records, so the server (Match: its GameData), the sim (BattleSpec flags.rules:
// sim/spec.js createBattleFromSpec's data view) and the client (data.js, the match's rules) change exactly the same
// records. Data files are generated and never edited by hand: these records are made at run time.
//
//   virtuosaBonds  塑心 (Virtuosa, chess_char_6_09) is also in 迅捷 (Swift) and 助力 (Aid), besides 拉特兰
//   blaze          煌 (Blaze, char_017_huang) takes 凯瑟琳's shop slot (chess_char_4_11_a / _b): her tier, price, merge and
//                  training status, Blaze's own body and kit; the skill (and module) the player chose for 凯瑟琳 — the
//                  loadout belongs to the slot — by default S2 and the X module; in 炎 and 维多利亚; and her
//                  驻守 is "<售出时>获得1名【烛煌】" (an elite Blaze gives an elite one) instead of 凯瑟琳's. The record is
//                  composed like a 补位 stand-in's (shared/standIn.js) and marked `ruleBody`, so the sim takes its kit by
//                  charId (server/sim/content/index.js) without the stand-in's 「替补」 marks.

import { composeUnitRecord, unitForm } from './standIn.js';
import { N_ } from './i18n.js';
import { tagHas } from './rules.js';

export const VIRTUOSA = Object.freeze({ ids: Object.freeze(['chess_char_6_09_a', 'chess_char_6_09_b']), bonds: Object.freeze(['lateranoShip', 'swiftShip', 'deputShip']) });

export const BLAZE = Object.freeze({
  slot: Object.freeze({ a: 'chess_char_4_11_a', b: 'chess_char_4_11_b' }),
  charId: 'char_017_huang',
  bonds: Object.freeze(['yanShip', 'victoriaShip']),
  moduleId: 'uniequip_002_huang', // CEN-X, as 凯瑟琳's slot carries her X module
  /** 烛煌, what a sold Blaze gives (the elite for the elite). */
  product: Object.freeze({ a: 'chess_char_5_03_a', b: 'chess_char_5_03_b' }),
  garrison: Object.freeze({ a: 'fish_garrison_blaze_a', b: 'fish_garrison_blaze_b' }),
});

/** The effect key of Blaze's 驻守 (server/match/effectsMeta.js): when the piece is sold, gain bbStr.chessId. */
export const SOLD_GAIN_CHESS = 'FISH_SOLD_GAIN_CHESS';
/** msgids of Blaze's 驻守 (translated by the client's `text`; {name} = 烛煌's name in the data). */
export const BLAZE_GARRISON_DESC = N_('<售出时>获得1名【{name}】');
export const BLAZE_GARRISON_DESC_ELITE = N_('<售出时>获得1名精锐【{name}】');

const own = (o, k) => (o && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null);

/** SPA-CC Risk tags' numbers (shared/rules.js; fish-edition/FINDINGS.md §5). */
export const CC = Object.freeze({
  swiftPerStack: 0.0025,                       // 迅捷 20 + 0.25 × stacks % (data: 0.0035)
  foresightAspd: -20,                          // 远见 operators, active or not
  tier1Extra: 1, tier1FromRound: 3,            // the first tier-1 operator bought each round from round 3
  // Investor 2: these operators' 获得时 grants (缪尔赛思's 变形同构体, 耶拉's 谢拉格不融冰, 焰尾's 野鬃 / 灰毫) come when they are
  // sold instead (Fish 2026-10-23); 投资人's repeat multiplies 获得时 only, so not these any more
  investorSold: Object.freeze({
    garrisons: Object.freeze(['garrison_76_a', 'garrison_76_b', 'garrison_92_a', 'garrison_92_b', 'garrison_149_a', 'garrison_149_b']),
    ops: Object.freeze(['chess_char_6_11_a', 'chess_char_3_20_a', 'chess_char_4_19_a']), // their names in the tag's text
  }),
  // Strategy 2 (Fish 2026-10-23): 伊奥莱塔·罗素's 统御号令 ATK / HP at most +50 %; 杜遥夜's 广交豪杰 the first refresh of a
  // round only (data: the first 2); 阿米娅's 众志合一 needs 1 more active alliance per tier (4 / 5 / 6)
  strategy2: Object.freeze({ ioletaCap: 0.5, duyaoyRefreshes: 1, amiyaExtra: 1 }),
  // Strategy 1: the Strategy handlers whose `round` comes one round later (server/sim/content/bands/meta.js namedRound),
  // and the Strategies that keep theirs, being by period (达马兹提: "every 5 rounds" in its text, Fish 2026-10-15)
  strategyLate: Object.freeze({
    keys: Object.freeze(['preparation_start_gain_chess_from_round', 'give_coin_in_round', 'prep_start_gain_chess_from_pool_in_round',
      'gain_bond_char_per_round', 'round_start_bond_check_gain_layer', 'round_start_all_player_change_enemy_2']),
    periodic: Object.freeze(['band_damaztic']),
  }),
  upgradeExtra: Object.freeze([null, Object.freeze({ 4: 2 }), Object.freeze({ 4: 3, 5: 3 })]), // shop level → +Funds
  spRecovery: Object.freeze([0, 0.2, 0.4, 0.6]), // time SP slower by … per s (Fish's balance draft 2026-11: was 0.2 / 0.5 / 0.8)
  bossHp: Object.freeze([0, 0.5, 1.5, 4]), bossAtk: Object.freeze([0, 0.15, 0.25, 0.5]),
  leaderDr: Object.freeze([0, 0.5, 0.9]),
  dpPerSecMul: 0.5,                            // Deep Infiltration
  redeployMul: 1.75,                           // Low Efficiency
  lastLineLp: 2,                               // Last Line of Defense: the first leak each round, past lpCapPerRound
  ozArts: Object.freeze({ share: 0.5, res: 50 }),     // the final boss, once 50 % of its pool is taken as Arts
  ozPhys: Object.freeze({ share: 0.5, def: 5000 }),   // … as Physical
  lockout: Object.freeze({ every: Object.freeze([0, 0.68, 0.28, 0.18]), seconds: 10 }), // invulnerable 10 game s per step
  // Famiglia: Cleaner — rounds 10–13, the fewest stacks
  // (Fish's balance draft 2026-11: was 5; 3 in co-op, 2 in solo)
  silencers: Object.freeze({ key: 'enemy_1283_sgkill_2', count: 3, soloCount: 2, rounds: Object.freeze([10, 11, 12, 13]) }),
  // Famiglia Unending / Seasonal — the Blood Ledger (血债账款) of every battle (arknights.wiki.gg Blood_Ledger): it fills
  // perSec per game second (+zaaroPerSec while Zaaro lives, + his Furious Howl, data skill WildCalling), and at max an
  // Asset Liquidation (清算时刻): every enemy ATK +atkPct, DEF +defPct; the Silencers also their data Passive (ATK / DEF
  // +15 %, +50 ASPD) per Liquidation so far in the battle, up to 5; one Shadow Silencer comes (Seasonal); the gauge drains
  // over drainSeconds and does not fill meanwhile. Unending: the whole battle is a Liquidation (no Silencer comes).
  // Seasonal: fresh every battle, it starts at startShare of max, from round lateFrom at lateShare; max 300 instead of the
  // official 500, empty at the start, half full from round 10 (Fish 2026-10-23; was 500, 25 %, 75 %; max 200 until the
  // balance draft of 2026-11). Tier 3: Zaaro joins Cleaner's sub-wave and
  // costs zaaro.leakLp when he leaks.
  // Junk 1: every player gets Toxic Waste at the start (a Fish Edition item, made by ruleDataPatch): it cannot be
  // destroyed — not sold, not destroyed by the player, never replaced away, never expiring in the temporary hand; its carrier ATK −50 %; no 变形同构体 pairing. Junk 2:
  // a round's income −1 while it is not equipped (Fish's spec 2026-10-15)
  // its icon: 源石溶剂 (Originium Solvent)'s vial, drawn colour-inverted — a cyan vial on white (Fish 2026-10-16)
  junk: Object.freeze({ itemId: 'fish_item_toxic_waste', atkPct: -0.5, incomeLoss: 1, iconId: 'trap_1125_acarm125' }),
  // Vengeance: Reid, "Hateful Avenger" (enemy_1539_reid, the leader; Fish 2026-10-15, spawns reworked 2026-10-23).
  // Invincible Blade 1: 1 Reid in a normal battle of a player with an active alliance at perStacks stacks or more; the
  // final boss rounds: always 1, once per field. 2: +50 % ATK, Status Resistance, 40 % less Physical / Arts damage below
  // 50 % HP, 15 s invulnerable after his revive. 3: 1 more per perStacks stacks above perStacks of the player's highest
  // active alliance (the final boss rounds: the highest of any alive player's); below 50 % HP 80 % less damage instead and
  // +100 ASPD. (Fish's balance draft 2026-11: 2 was +150 % HP and 30 %; 3 was 60 %, ASPD at any HP, and immune to
  // Slow, Stun, Bind, Cold, Freeze, Tremble, Sleep, Fear, Levitate and Lure below 50 % HP.)
  vengeance: Object.freeze({
    key: 'enemy_1539_reid', perStacks: 200, atkPct: 0.5, lowHp: 0.5, lowDr2: 0.4, lowDr3: 0.8,
    reviveInvincible: 15, aspd: 100,
  }),
  famiglia: Object.freeze({
    max: 300, perSec: 3, zaaroPerSec: 1, drainSeconds: 35, startShare: 0, lateFrom: 10, lateShare: 0.5,
    atkPct: 0.2, defPct: 0.15,
    silencerKeys: Object.freeze(['enemy_1283_sgkill', 'enemy_1283_sgkill_2']),
    silencer: Object.freeze({ atkPct: 0.15, defPct: 0.15, aspd: 50, maxStacks: 5 }),
    summonKey: 'enemy_1283_sgkill_2',
    zaaro: Object.freeze({ key: 'enemy_1535_wlfmster', leakLp: 5 }),
    // Furious Howl (WildCalling: cooldown 40 s, the first 5 s after his second form starts, duration 5.5 s, sp 35): the
    // data's numbers when his record has them; +35 per s while it lasts, outside a Liquidation only
    howl: Object.freeze({ icd: 5, cd: 40, duration: 5.5, perSec: 35 }),
  }),
  // Patriot: Undying 1 — the round-9 Improv always offers him (no bounty); nobody taking him: the final boss +200 % HP
  // (Undying 2: also +100 % ATK); he costs leakLp when he leaks. Undying 2 — 2 Guerrilla Shieldguards join him;
  // Marching Stance: 90 % less Physical / Arts damage from operators not blocking him. Undying 3 — +200 % HP, the listed
  // statuses cannot touch him in Marching Stance, never slower than his base speed; he and his escort come again in the
  // final boss rounds (once per field), whether he was taken or not. (Fish's balance draft 2026-11: the HP, the
  // immunities, the speed floor and the final-round sub-wave were Undying 2's; Undying 3 had 5 Shieldguards and every
  // enemy +40 % move speed, +40 ASPD while he lived.)
  patriot: Object.freeze({
    key: 'enemy_1506_patrt', round: 9, leakLp: 5, skipHp: 2, skipAtk: 1, // Level 1 stats (data enemies.json level1)
    marchDr: 0.9, hpPct: 2,
    // the sim's status keys of Slow, Stun, Bind, Cold, Frozen, Frighten (战栗 tremble), Sleep, Fear, Levitate, Lure (attract)
    marchImmune: Object.freeze(['slow', 'sluggish', 'stun', 'bind', 'cold', 'freeze', 'tremble', 'sleep', 'fear', 'levitate', 'attract']),
    escort: Object.freeze({ key: 'enemy_1081_sotisd', count: 2 }),
  }),
  // Delegation: the sub-wave of the final boss round(s), once per field; United 2 — the final boss cannot die while a
  // Degenbrecher lives, she has ATK × degenAtkMul, and she charges: move speed +up to chargePct while unblocked, reached
  // after chargeSeconds, reset when blocked or unable to move; United 3 — Momentum Murder every gateRatio of her HP
  // with a hard HP gate. The Degenbrecher's HP × hpMul per alive player (the minions keep the round's HP); she spawns at
  // the start of the round, and her HP and her gate are linked across the boss fields (server/sim/content/risk.js
  // installDegenLink: one field's finished cast opens the gate on every field). Fish's balance draft 2026-11: 1
  // Degenbrecher, 2 Shieldbearers, 2 Centurion Champions (was 5 and 5); HP was 200 / 300 / 500 % for the whole sub-wave;
  // Fish's playtest nerf of 2026-10-15 removed Cloned 3
  delegation: Object.freeze({
    wave: Object.freeze([
      Object.freeze({ key: 'enemy_1525_blkswb', count: 1 }),
      Object.freeze({ key: 'enemy_1387_winshd', count: 2 }),
      Object.freeze({ key: 'enemy_1389_winbab_2', count: 2 }),
    ]),
    degen: 'enemy_1525_blkswb', // the sub-wave's Degenbrecher uses her Level 1 stats (enemies.json level1)
    hpMul: Object.freeze({ united1: 1, united2: 2, united3: 3 }), // × the alive players, the Degenbrecher only
    degenAtkMul: 1.5, // United 2 and up, the Degenbrecher only
    chargePct: 3, chargeSeconds: 10,
    gateRatio: 0.15, castSeconds: 1, // [ASSUMED] Momentum Murder's cast: no HP lost meanwhile, the burst at its end
  }),
});

/**
 * The LP one leak of `enemyKey` costs in a normal round or a 联防 under `rules` (1; the SPA-CC tags' heavier leaks: a
 * Patriot under ccPatriot, Zaaro under ccFamiglia tier 3). One rule for the match's settlement (Match.riskLoss,
 * uniteSurvivors) and the battle's live count (server/sim/spec.js battleProgress `leaks`, the HUD's pending LP).
 */
export function riskLeakWeight(rules, enemyKey) {
  if (!rules || typeof enemyKey !== 'string') return 1;
  if (enemyKey === CC.patriot.key && tagHas(rules, 'ccPatriot', 'undying1')) return CC.patriot.leakLp;
  if (enemyKey === CC.famiglia.zaaro.key && (tagHas(rules, 'ccFamiglia', 'unending3') || tagHas(rules, 'ccFamiglia', 'seasonal3'))) return CC.famiglia.zaaro.leakLp;
  return 1;
}

/** msgid of the note added to 投资人's text when the bench no longer counts. */
export const INVESTOR_BENCH_NOTE = N_('（风险：整备区的干员不再计入）');
/** msgid of the trigger tag that replaces a 获得时 grant's own ("<获得时>") under Investor 2 (CC.investorSold). */
export const INVESTOR_SOLD_TAG = N_('<售出时>');


/**
 * The boosterPack cheat (Fish, GitHub #35): every player starts with a Booster Pack, a Fish Edition item made by
 * ruleDataPatch. Equipped on an operator it is not attached: it offers a free pick of `choices` operators of that
 * operator's tier, in a fixed order (the tier's base chess ids sorted), and stays where it was. Each player's place in
 * every tier's order is kept, so using it again shows the next `choices`, and the whole tier comes round in turn.
 * AI players neither use nor drop it. Its icon: 商业包装方案 (Commercial Packaging Plan)'s.
 */
export const BOOSTER = Object.freeze({ itemId: 'fish_item_booster_pack', iconId: 'trap_1074_acarm074', choices: 6 });
/** msgids of the Booster Pack (translated by the client's `text`; the name is also the offer's header). */
export const BOOSTER_NAME = N_('补充包');
export const BOOSTER_DESC = N_('装备到干员上：免费选择一名同阶干员（按固定顺序轮换，每次6名），补充包留在手牌');

/**
 * The itemBoosterPack cheat (Fish, GitHub #56): the Booster Pack's twin for equipment, a separate item with its own
 * toggle. Equipped on any operator it is not attached either: it offers a free pick of `choices` items, the next ones of
 * one fixed order through every shop item (tier 1 → 6, ids sorted within a tier), and stays where it was. Each player's
 * place in the order is kept. AI players neither use nor drop it. Its icon: 紧急调度券 (Emergency Dispatch Voucher)'s.
 */
export const ITEM_BOOSTER = Object.freeze({ itemId: 'fish_item_booster_pack_equip', iconId: 'trap_1115_acarm115', choices: 6 });
/** msgids of the Equipment Booster Pack (the name is also the offer's header). */
export const ITEM_BOOSTER_NAME = N_('装备补充包');
export const ITEM_BOOSTER_DESC = N_('装备到任意干员上：免费选择一件装备（按固定顺序轮换全部装备，每次6件），装备补充包留在手牌');

/** A booster's item record in data/items.json's shape: the Booster Pack (boosterPack) or the Equipment Booster Pack
 *  (itemBoosterPack, `boosts: 'items'`). */
function boosterRecord(text, items = false) {
  const B = items ? ITEM_BOOSTER : BOOSTER;
  const desc = text(items ? ITEM_BOOSTER_DESC : BOOSTER_DESC);
  return {
    id: B.itemId, baseId: B.itemId, goldenId: null, isGolden: false, trapId: B.iconId, iconId: B.iconId,
    identifier: null, name: text(items ? ITEM_BOOSTER_NAME : BOOSTER_NAME), itemType: 'EQUIP', tier: 1, shopSortId: 999, price: 0, hideInShop: true,
    shopExcluded: true, shopExcludedBy: null, mergeable: false, upgradeNum: 0, upgradeChessId: null, duration: -1,
    giveBondId: null, givePowerId: null, canGiveBond: false, requiresBondId: null, effectId: null, effectName: null, desc,
    descRaw: desc, buffs: [], params: {}, category: 'STAT', kind: 'passive', family: null,
    implFormula: items ? 'a pick-one offer of the next shop items (server/match/player/items.js openItemBooster)'
      : 'a pick-one offer of its target\'s tier (server/match/player/items.js openBooster)',
    fork: true, booster: true, boosts: items ? 'items' : 'chess',
  };
}

/** msgids of the Toxic Waste (Junk; translated by the client's `text`). */
export const TOXIC_WASTE_NAME = N_('有毒废料');
export const TOXIC_WASTE_DESC = N_('攻击力-50%。无法被销毁');
export const TOXIC_WASTE_DESC_2 = N_('攻击力-50%。无法被销毁；未装备时每回合收入-1');

/** The Toxic Waste's item record (ccJunk) in data/items.json's shape. */
function cursedHammerRecord(level, text) {
  const J = CC.junk;
  const desc = text(level >= 2 ? TOXIC_WASTE_DESC_2 : TOXIC_WASTE_DESC);
  return {
    id: J.itemId, baseId: J.itemId, goldenId: null, isGolden: false, trapId: J.iconId, iconId: J.iconId, identifier: null,
    name: text(TOXIC_WASTE_NAME), itemType: 'EQUIP', tier: 1, shopSortId: 999, price: 0, hideInShop: true, shopExcluded: true,
    shopExcludedBy: null, mergeable: false, upgradeNum: 0, upgradeChessId: null, duration: -1, giveBondId: null, givePowerId: null,
    canGiveBond: false, requiresBondId: null, effectId: null, effectName: null, desc, descRaw: desc, buffs: [], params: {},
    category: 'STAT', kind: 'passive', family: null, implFormula: 'ATK% += −0.5 (server/sim/content/risk.js)', fork: true,
    // drawn cursed: the icon colour-inverted and a sinking dark-blue flame (ui/gameComponents.js UnitThumb, render/units.js
    // ItemView)
    cursed: true,
  };
}

/** The Alliance Modules' texts (the rules dialog, and the alliance's own text while the module is on): {bond} = the
 *  alliance's name, {list} = the names of LATERANO_B_LIST. */
export const LATERANO_B_TEXT = N_('【{bond}】干员开启技能获得的弹药量提升min(5 + 1×层数, 75 + 0.3×层数)%（原版：5 + 1.5×层数）。<达到100层>【{bond}】干员造成的伤害提升至200%；消耗弹药时触发的特质（{list}）触发两次，两次均计入该特质每场战斗的触发次数上限。<在场6名不同【{bond}】干员>与原版相同（不会触发两次）');
export const LATERANO_B_LIST = Object.freeze(['chess_char_4_02_a', 'chess_char_5_01_a', 'chess_char_6_01_a']);
/** Laterano Mod B's ammo: +min(base + perStack × L, capBase + capPerStack × L) (server/sim/content/bonds/core.js). */
export const LATERANO_B_AMMO = Object.freeze({ base: 0.05, perStack: 0.01, capBase: 0.75, capPerStack: 0.003 });
/** Mod B's own line of the alliance's text, between Mod A's ammo line and its 6-member line (GitHub #75). */
export const LATERANO_B_100 = N_('<达到<@autochess.dgreen>100</>层>【{bond}】干员造成的伤害提升至<@ba.vup>200%</>；消耗弹药时触发的特质（{list}）触发两次，两次均计入该特质每场战斗的触发次数上限');
export const VICTORIA_C_TEXT = N_('【{bond}】干员技能结束时，每携带1件维式重锤回复8点技力；【{bond}】激活时调度中心的维式重锤为进阶版且免费。<休整期结束时>携带维式重锤的【{bond}】干员使【{bond}】层数+其阶级。<在场6名不同【{bond}】干员>上述干员还使自身其他已激活盟约的层数+2×其阶级；战斗开始时【{bond}】干员攻击力+(200 + 1.2×层数)%，获得最大生命值200%的屏障与抵抗。不再每25层获得维式重锤');

/**
 * The Transmitter+ cheat (Fish, GitHub #133): the Transmitter (信标) gets "+" and these extra effects
 * (server/match/builtinMeta.js transmitterPlus):
 * - alone (no living teammate): the first Transmitter put on a tier-6 operator in the match always offers Muelsyse;
 *   any other use always offers an operator of the player's Alliance with the most stacks, when the pool has one;
 * - with teammates, when none has members of the operator's Alliances: 2 random teammates each get an operator of the
 *   same tier from their own Alliance with the most stacks, instead of the original;
 * - 5 or more players: one teammate more (two that have members both get the original; one: it and one random teammate
 *   an operator for its Alliance; none: 3 random teammates).
 * "The Alliance with the most stacks": the most layers, then the most members [ASSUMED: Fish's issue names stacks].
 */
export const TRANSMITTER_PLUS = Object.freeze({
  itemIds: Object.freeze(['chess_item_5_04_e_a', 'chess_item_5_04_e_b']),
  muelsyse: 'chess_char_6_11_a',
  bigRoom: 5,
});
export const TRANSMITTER_PLUS_NOTE = N_('【信标+】独自一人时：本局第一次装备给六星干员时，候选中必定有缪尔赛思；其他时候，候选中必定有一名你层数最多的盟约的干员（如果还有）。有队友但没有队友拥有原干员的盟约成员时：改为向2名随机队友各发送1名同阶、属于其层数最多盟约的干员。5人及以上的房间多送1名队友。');

/** Whether `rules` change any data record (the callers can skip the patch). */
export const rulesChangeData = (rules) => !!(rules && (rules.virtuosaBonds === true || rules.blaze === true
  || rules.lateranoMod === 'B' || rules.victoriaMod === 'C' || rules.ccInvestorBench > 0 || rules.ccSwift > 0 || rules.ccJunk > 0 || rules.boosterPack === true || rules.itemBoosterPack === true
  || rules.ccStrategyLate > 0 || rules.transmitterPlus === true));

// The round numbers a Strategy's text names, in each language's data: zh / zh-TW 第4、7、10回合, en "Round(s) 4, 7 and 10",
// ja 第4/7/10ラウンド (not "2ラウンドごと", every 2 rounds), ko 4/7/10라운드 (not "2라운드마다"). Each match is a group of numbers.
const ROUND_GROUPS = [/第\d+(?:、\d+)*回合/g, /\b[Rr]ounds? \d+(?:(?:, | and |, and )\d+)*/g, /\d+(?:[/、]\d+)*ラウンド(?!ごと)/g, /\d+(?:\/\d+)*라운드(?!마다)/g];
/**
 * Strategy 1 (GitHub #88): `text` with each of `rounds` it names as a round moved one round later, through `mark` (the
 * rich text highlights it). Other numbers (tiers, counts, "every 2 rounds") stay.
 */
function shiftRounds(text, rounds, mark) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const re of ROUND_GROUPS) out = out.replace(re, (g) => g.replace(/\d+/g, (n) => (rounds.has(Number(n)) ? mark(Number(n) + 1) : n)));
  return out;
}
/**
 * Strategy 1: the Strategy records whose named rounds come one round later (CC.strategyLate), their texts with the
 * new rounds, highlighted in `descRaw`. A record whose text names none of them is left out.
 */
function strategyLateBands(bands) {
  const out = {};
  if (!bands || typeof bands !== 'object') return out;
  for (const [id, b] of Object.entries(bands)) {
    if (!b || CC.strategyLate.periodic.includes(id) || !Array.isArray(b.buffs)) continue;
    const rounds = new Set(b.buffs.filter((x) => x && CC.strategyLate.keys.includes(x.key) && Number.isInteger(x.bb?.round)).map((x) => x.bb.round));
    if (!rounds.size) continue;
    const desc = shiftRounds(b.desc, rounds, String);
    const descRaw = shiftRounds(b.descRaw ?? b.desc, rounds, (n) => `<@ba.vup>${n}</>`);
    if (desc !== b.desc || descRaw !== (b.descRaw ?? b.desc)) out[id] = { ...b, desc, descRaw };
  }
  return out;
}

/**
 * The records `rules` change: `{ chess, garrisons, bonds, items, bands: { [id]: record } }` — new objects, the inputs are not
 * touched; empty maps when nothing changes (or the data lacks what a change needs).
 * @param {{ chess?: object, garrisons?: object, backups?: object, bonds?: object, bands?: object, items?: object }} raw the raw data maps (id → record)
 * @param {object} rules a shared/rules.js rules object
 * @param {{ text?: (msgid: string, params?: object) => string }} [opts] translates the made-up texts (the client passes t)
 */
export function ruleDataPatch(raw, rules, { text = (s, p) => s.replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m)) } = {}) {
  const chess = {}, garrisons = {}, bonds = {}, items = {};
  if (!rulesChangeData(rules) || !raw) return { chess, garrisons, bonds, items, bands: {} };
  // SPA-CC Strategy 1: the Strategies' texts name their rounds one round later (only the client passes `bands`)
  const bands = rules.ccStrategyLate > 0 ? strategyLateBands(raw.bands) : {};
  // SPA-CC Junk: the Toxic Waste
  if (rules.ccJunk > 0) items[CC.junk.itemId] = cursedHammerRecord(rules.ccJunk, text);
  // the boosterPack cheat: the Booster Pack
  if (rules.boosterPack === true) items[BOOSTER.itemId] = boosterRecord(text);
  // the itemBoosterPack cheat: the Equipment Booster Pack
  if (rules.itemBoosterPack === true) items[ITEM_BOOSTER.itemId] = boosterRecord(text, true);
  // the Transmitter+ cheat (GitHub #133): "+" on the name, its extra effects under the official text
  if (rules.transmitterPlus === true) {
    const note = text(TRANSMITTER_PLUS_NOTE);
    for (const id of TRANSMITTER_PLUS.itemIds) {
      const rec = own(raw.items, id);
      if (!rec) continue;
      const add = (d) => (typeof d === 'string' ? `${d}\n${note}` : d);
      items[id] = { ...rec, name: typeof rec.name === 'string' ? `${rec.name}+` : rec.name, desc: add(rec.desc), descRaw: add(rec.descRaw ?? rec.desc) };
    }
  }
  // SPA-CC: 投资人 counts the board only; 迅捷's chance per stack (the popup's number; the sim reads the rule itself)
  const investor = rules.ccInvestorBench > 0 ? own(raw.bonds, 'investShip') : null;
  if (investor) {
    const note = text(INVESTOR_BENCH_NOTE);
    bonds.investShip = { ...investor, countMode: 'BOARD', countsHand: false, desc: `${investor.desc ?? ''}${note}`, descRaw: `${investor.descRaw ?? investor.desc ?? ''}${note}` };
  }
  // Investor 2: the 获得时 grants of CC.investorSold come when the operator is sold (the dispatcher fires a garrison on
  // its eventType's hook only, server/match/effectsMeta.js); the text's leading trigger tag becomes 售出时's
  if (rules.ccInvestorBench >= 2) {
    const tag = text(INVESTOR_SOLD_TAG);
    const swap = (d) => (typeof d === 'string' ? d.replace(/^<[^>]*>/, tag) : d);
    for (const id of CC.investorSold.garrisons) {
      const rec = own(raw.garrisons, id);
      if (rec && rec.eventType === 'SERVER_GAIN') garrisons[id] = { ...rec, eventType: 'SERVER_CHESS_SOLD', desc: swap(rec.desc), descRaw: swap(rec.descRaw) };
    }
  }
  const swift = rules.ccSwift > 0 ? own(raw.bonds, 'swiftShip') : null;
  if (swift) {
    const bb = (o) => (o && typeof o === 'object' ? { ...o, prob_per_stack: CC.swiftPerStack } : o);
    bonds.swiftShip = { ...swift, bb: bb(swift.bb), buffs: Array.isArray(swift.buffs) ? swift.buffs.map((x) => ({ ...x, bb: bb(x.bb) })) : swift.buffs };
  }
  // the Alliance Modules: the alliance's text is the module's (its "current effect" line, Mod A's numbers, goes)
  const listNames = LATERANO_B_LIST.map((id) => own(raw.chess, id)?.name ?? id).join(text('、'));
  // Laterano Mod B (GitHub #75): Mod A's own lines (in the player's language, rich text kept) around Mod B's 100-stack
  // line, and the "current effect" line's ammo at Mod B's numbers (formatBondEffect's `min`; the keys are Mod B's own)
  const lat = rules.lateranoMod === 'B' ? own(raw.bonds, 'lateranoShip') : null;
  if (lat && typeof lat.descRaw === 'string' && lat.descRaw.includes('\n')) {
    const line = text(LATERANO_B_100, { bond: lat.name ?? 'lateranoShip', list: listNames });
    const plain = (s) => s.replace(/<@[^>]*>|<\/>/g, '');
    const splice = (s) => { const [first, ...rest] = s.split('\n'); return [first, line, ...rest].join('\n'); };
    const A = LATERANO_B_AMMO;
    const effect = typeof lat.effectDescRaw === 'string' && lat.effectDescRaw.includes('\n') ? splice(lat.effectDescRaw) : null;
    bonds.lateranoShip = {
      ...lat, desc: plain(splice(lat.descRaw)), descRaw: splice(lat.descRaw),
      bb: { ...lat.bb, fish_b_ammo: A.base, fish_b_ammo_per_stack: A.perStack, fish_b_ammo_cap: A.capBase, fish_b_ammo_cap_per_stack: A.capPerStack },
      ...(effect ? {
        effectDesc: plain(effect), effectDescRaw: effect,
        effectDescParams: [{ index: 0, format: '0%', base: 'fish_b_ammo', perStack: 'fish_b_ammo_per_stack', min: { base: 'fish_b_ammo_cap', perStack: 'fish_b_ammo_cap_per_stack' } }],
      } : { effectDesc: undefined, effectDescRaw: undefined, effectDescParams: undefined }),
    };
  }
  for (const { key, bondId, msg, params } of [
    ...(bonds.lateranoShip ? [] : [{ key: 'lateranoMod', bondId: 'lateranoShip', msg: LATERANO_B_TEXT, params: { list: listNames } }]),
    { key: 'victoriaMod', bondId: 'victoriaShip', msg: VICTORIA_C_TEXT, params: {} },
  ]) {
    const rec = rules[key] && rules[key] !== 'A' ? own(raw.bonds, bondId) : null;
    if (!rec) continue;
    const desc = text(msg, { bond: rec.name ?? bondId, ...params });
    const { effectDesc, effectDescRaw, effectDescParams, ...rest } = rec;
    bonds[bondId] = { ...rest, desc, descRaw: desc };
  }
  if (rules.virtuosaBonds === true) {
    for (const id of VIRTUOSA.ids) {
      const rec = own(raw.chess, id);
      if (rec) chess[id] = { ...rec, bonds: [...VIRTUOSA.bonds] };
    }
  }
  if (rules.blaze === true) {
    const unit = raw.backups?.units?.[BLAZE.charId];
    for (const form of ['a', 'b']) {
      const slot = own(raw.chess, BLAZE.slot[form]);
      const body = slot && unit ? unitForm(raw.backups, BLAZE.charId, slot.status) : null;
      if (!body) continue;
      const skillIndex = Number.isInteger(slot.backup?.skillIndex) ? slot.backup.skillIndex : 1;
      const identity = {
        ...slot,
        garrisonIds: [BLAZE.garrison[form]],
        backup: { charId: BLAZE.charId, tmplId: null, skillIndex, uniEquipId: BLAZE.moduleId, potRank: 0 },
      };
      const rec = composeUnitRecord(identity, unit, body, { skillIndex, moduleId: slot.status?.equipLevel ? BLAZE.moduleId : null, bonds: [...BLAZE.bonds] });
      if (!rec) continue;
      chess[BLAZE.slot[form]] = { ...rec, ruleBody: 'blaze' };
      const desc = text(form === 'b' ? BLAZE_GARRISON_DESC_ELITE : BLAZE_GARRISON_DESC, { name: own(raw.chess, BLAZE.product[form])?.name ?? BLAZE.product[form] });
      garrisons[BLAZE.garrison[form]] = {
        garrisonId: BLAZE.garrison[form],
        desc,
        descRaw: desc,
        eventType: 'SERVER_CHESS_SOLD', eventTypeDesc: text(N_('整备能力')), eventTypeIcon: 'icon_gold',
        effectType: SOLD_GAIN_CHESS, effectKey: SOLD_GAIN_CHESS, battleRuneKey: null, charLevel: 0,
        bb: {}, bbStr: { chessId: BLAZE.product[form] },
      };
    }
  }
  return { chess, garrisons, bonds, items, bands };
}
