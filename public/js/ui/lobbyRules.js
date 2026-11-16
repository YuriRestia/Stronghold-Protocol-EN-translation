// Custom Lobby Modifications in the room (shared/rules.js): the strip under the seats lists the rules in force and how a
// result will be labelled ("WITH CHEATS" for a cheat, "seeded" for a chosen map or chosen bans); the host's 调整 (others:
// 查看) opens the dialog, grouped by category:
//   作弊 (cheats)          +2 Deployment Limit, +2 Funds, untimed (co-op only)
//   盟约模组 (modules)      拉特兰 A / B, 维多利亚 A / C — A is the original effect
//   盟约调整 (rebalanced)   塑心 also in 迅捷 and 助力; 煌 in 凯瑟琳's shop slot
//   减少随机 (seeded)       the map (or random) and up to the difficulty's count of core / add-on bans (the rest random)
// Every change is one room.setRules partial update. Names of operators and alliances come from the game data (each
// language's official name). A room searching for teammates plays the original game (the server refuses rules then).

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal, Icon, MicroLabel, Tooltip } from './components.js';
import { BondGlyph } from './gameComponents.js';
import { data, useData } from '../data.js';
import { DEFAULT_RULES, RULE_EXTRA_DEPLOY, RULE_EXTRA_FUNDS, modeIdFor } from '../../../shared/constants.js';
import { rulesInForce, ruleLabels, ruleOf, RULES, ruleRisk, tagParent } from '../../../shared/rules.js';
import { VIRTUOSA, BLAZE, CC, LATERANO_B_TEXT, LATERANO_B_LIST, VICTORIA_C_TEXT, TOXIC_WASTE_NAME } from '../../../shared/ruleData.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const chessName = (id, fallback) => data.lookup('chess', id)?.name || fallback;
const bondName = (id) => data.lookup('bonds', id)?.name || id;
const bandName = (id) => data.lookup('bands', id)?.name || id;

/** The short label of a rule in force (the strip, the result screen). */
export function ruleLabel(key, rules) {
  const v = rules?.[key];
  switch (key) {
    case 'extraDeploy': return t('部署上限 +{n}', { n: RULE_EXTRA_DEPLOY });
    case 'extraFunds': return t('每回合资金 +{n}', { n: RULE_EXTRA_FUNDS });
    case 'untimed': return t('行动阶段不限时');
    case 'doubleLp': return t('初始目标生命翻倍');
    case 'tierStart': return t('开局获得各阶干员');
    case 'boosterPack': return t('开局获得补充包');
    case 'itemBoosterPack': return t('开局获得装备补充包');
    case 'transmitterPlus': return t('信标+');
    case 'lateranoMod': return t('{bond}模组 {m}', { bond: bondName('lateranoShip'), m: v });
    case 'victoriaMod': return t('{bond}模组 {m}', { bond: bondName('victoriaShip'), m: v });
    case 'virtuosaBonds': return t('{name}加入{a}与{b}', { name: chessName(VIRTUOSA.ids[0], VIRTUOSA.ids[0]), a: bondName('swiftShip'), b: bondName('deputShip') });
    case 'blaze': return t('{name}代替{old}', { name: data.get('backups')?.units?.[BLAZE.charId]?.name || BLAZE.charId, old: (data.lookupBase('chess', BLAZE.slot.a)?.name || BLAZE.slot.a) });
    case 'stage': return t('指定战场：{name}', { name: data.lookup('stages', v)?.name || v });
    case 'bans': return t('指定禁用盟约：{list}', { list: (v || []).map(bondName).join(t('、')) });
    default: return ruleOf(key)?.type === 'level' ? riskText(key, v).short : key;
  }
}

/**
 * The rules in force as chips, in RULES order: the result screen's list and the in-game 本局信息 tab's (GitHub #86). A Risk
 * tag's chip carries its effects (every level in force) as its tooltip.
 * @param {{ rules: any }} props
 */
export function RulesChips({ rules }) {
  return html`<ul class="rules-chips">${rulesInForce(rules).map((k) => {
    const r = ruleOf(k);
    const tip = r.type === 'level' ? levelsInForce(r, rules[k]).map((l) => riskText(k, l).full).join('\n') : undefined;
    return html`<li key=${k} class=${`rules-chip rules-chip--${r.category}`} title=${tip}>${ruleLabel(k, rules)}</li>`;
  })}</ul>`;
}

/** The result-title suffix and watermark of `rules`: `{ seeded, cheats, risk }` (null / 0 when not labelled). */
export function ruleBadges(rules) {
  const l = ruleLabels(rules);
  return { seeded: l.seeded ? 'seeded' : null, cheats: l.cheats ? 'WITH CHEATS' : null, risk: l.risk };
}

const pct = (v) => Math.round(v * 100);
/** Last Line of Defense (GitHub #91: once per round, past the cap, so a round costs at most cap + n). */
function lastLineText() {
  const cap = data.get('config')?.lpCapPerRound ?? 10;
  return t('每回合自己的作战只要漏过敌人，结算时额外扣除{n}点目标生命（每回合一次，不论漏过几个；即使联防消灭了所有漏过的敌人也照扣；不计入每回合{cap}点的扣除上限，因此一回合最多扣除{max}点）', { n: CC.lastLineLp, cap, max: cap + CC.lastLineLp });
}
/**
 * The texts of SPA-CC Risk tag `key` at `level` (1 …): `short` (the grid tile, the strip) and `full` (the effects list).
 * Alliance and enemy names come from the data.
 */
export function riskText(key, level) {
  const out = riskTextOf(key, level);
  return balanceAlpha(key, level) ? { ...out, short: `${out.short} α` } : out;
}

/**
 * (Fish's balance update of 2026-11) the tag levels whose game it changed carry "α" after their name, so players see
 * which tags are new (Fish: "add α to the end of all tag names that were affected"). A level counts when what it puts
 * in force changed, its own effect or an included level's: every Famiglia level includes Cleaner 1 (fewer Silencers),
 * every Delegation level United 1 (a smaller sub-wave). Unchanged: Suffocation 1, Undying 1, Invincible Blade 1.
 */
const BALANCE_ALPHA = Object.freeze({
  ccSpRecovery: Object.freeze([2, 3]),
  ccVengeance: Object.freeze([2, 3]),
  ccFamiglia: Object.freeze(['cleaner', 'unending2', 'seasonal2', 'unending3', 'seasonal3']),
  ccPatriot: Object.freeze(['undying2', 'undying3']),
  ccDelegation: Object.freeze(['united1', 'united2', 'united3']),
});
export function balanceAlpha(key, level) {
  const list = BALANCE_ALPHA[key];
  if (!list) return false;
  return typeof list[0] === 'number' ? list.includes(level) : list.includes(nodeOf(key, level));
}

function riskTextOf(key, level) {
  const enemyName = (k) => data.lookup('enemies', k)?.name || k;
  switch (key) {
    case 'ccInvestorBench': return level >= 2
      ? { short: t('目标：投资人 {n}', { n: level }), full: t('{list}的获得时效果改为售出时触发（因此不再受【{bond}】加倍）', { list: CC.investorSold.ops.map((id) => chessName(id, id)).join(t('、')), bond: bondName('investShip') }) }
      : { short: t('目标：投资人 {n}', { n: level }), full: t('整备区的干员不再计入【{bond}】', { bond: bondName('investShip') }) };
    case 'ccSwift': return { short: t('目标：迅捷'), full: t('【{bond}】回复技力的概率改为20% + 0.25%×层数（原为0.35%×层数）', { bond: bondName('swiftShip') }) };
    case 'ccForesight': return { short: t('目标：远见'), full: t('【{bond}】干员攻击速度-{n}（无论盟约是否激活）', { bond: bondName('visiShip'), n: -CC.foresightAspd }) };
    case 'ccStrategyLate': return level >= 2
      ? { short: t('目标：策略 {n}', { n: level }), full: t('【{ioleta}】的攻击力与生命值加成最多+{cap}%；【{duyaoy}】每回合只有第{r}次主动刷新为特殊刷新；【{amiya}】每档需要多{n}种激活盟约', { ioleta: bandName('band_ioleta'), cap: pct(CC.strategy2.ioletaCap), duyaoy: bandName('band_duyaoy'), r: CC.strategy2.duyaoyRefreshes, amiya: bandName('band_amiya'), n: CC.strategy2.amiyaExtra }) }
      : { short: t('目标：策略 {n}', { n: level }), full: t('指定回合数的策略推迟1回合生效（按奇偶或每N回合生效的策略不受影响）') };
    case 'ccTier1Price': return { short: t('目标：实习'), full: t('从第{r}回合起，每回合购买的第一名I阶干员价格+{n}', { r: CC.tier1FromRound, n: CC.tier1Extra }) };
    case 'ccUpgrade': return level >= 2
      ? { short: t('目标：驳船 {n}', { n: level }), full: t('调度中心从4级升到5级、从5级升到6级的价格各+{n}', { n: CC.upgradeExtra[2][4] }) }
      : { short: t('目标：驳船 {n}', { n: level }), full: t('调度中心从4级升到5级的价格+{n}', { n: CC.upgradeExtra[1][4] }) };
    case 'ccSpRecovery': return { short: t('环境：窒息 {n}', { n: level }), full: t('干员的自动技力回复每秒-{n}', { n: CC.spRecovery[level] }) };
    case 'ccBoss': return { short: t('源石区域：激活 {n}', { n: level }), full: t('最终领袖（含隐秘核心）最大生命值+{hp}%，攻击力+{atk}%', { hp: pct(CC.bossHp[level]), atk: pct(CC.bossAtk[level]) }) };
    case 'ccLeaderDr': return { short: t('源石区域：元素 {n}', { n: level }), full: t('领袖（最终领袖与领袖级悬赏敌人）受到的物理与法术伤害-{n}%，处于元素爆发效果时除外', { n: pct(CC.leaderDr[level]) }) };
    case 'ccDeepInfiltration': return { short: t('目标：深入敌阵'), full: t('部署费用的回复速度-{n}%', { n: pct(1 - CC.dpPerSecMul) }) };
    case 'ccLowEfficiency': return { short: t('目标：低效'), full: t('我方单位的再部署时间+{n}%', { n: pct(CC.redeployMul - 1) }) };
    case 'ccLastLine': return { short: t('目标：最后防线'), full: lastLineText() };
    case 'ccOzArts': return { short: t('源石区域：法术'), full: t('最终领袖受到的法术伤害累计达到其最大生命值的{p}%后，法术抗性+{n}', { p: pct(CC.ozArts.share), n: CC.ozArts.res }) };
    case 'ccOzPhys': return { short: t('源石区域：物理'), full: t('最终领袖受到的物理伤害累计达到其最大生命值的{p}%后，防御力+{n}', { p: pct(CC.ozPhys.share), n: CC.ozPhys.def }) };
    case 'ccLockout': return { short: t('源石区域：封锁 {n}', { n: level }), full: t('最终领袖每损失{p}%最大生命值，获得{s}秒无敌（期间生命值不会继续减少）', { p: pct(CC.lockout.every[level]), s: CC.lockout.seconds }) };
    case 'ccJunk': return level >= 2
      ? { short: t('目标：垃圾 {n}', { n: level }), full: t('未装备【{item}】时每回合收入-{n}', { item: t(TOXIC_WASTE_NAME), n: CC.junk.incomeLoss }) }
      : { short: t('目标：垃圾 {n}', { n: level }), full: t('开局时每名博士获得【{item}】：携带者攻击力-{n}%，无法被销毁，与变形同构体没有互动', { item: t(TOXIC_WASTE_NAME), n: pct(-CC.junk.atkPct) }) };
    case 'ccVengeance': return vengeanceText(level, enemyName);
    case 'ccFamiglia': return famigliaText(nodeOf(key, level), enemyName);
    case 'ccPatriot': return patriotText(nodeOf(key, level), enemyName);
    case 'ccDelegation': return delegationText(nodeOf(key, level), enemyName);
    default: return { short: key, full: key };
  }
}

const nodeOf = (key, level) => ruleOf(key)?.nodes?.[level] ?? null;

function vengeanceText(level, enemyName) {
  const V = CC.vengeance;
  const name = t('里德，{name}', { name: enemyName(V.key) });
  switch (level) {
    case 1: return { short: t('复仇：无敌之刃 1'), full: t('每场作战开始时，若博士有一个已激活盟约达到{n}层，作战中额外出现1名【{name}】；最终领袖回合必定出现1名（每个战场1组）', { n: V.perStacks, name }) };
    case 2: return { short: t('复仇：无敌之刃 2'), full: t('【{name}】攻击力+{atk}%，获得抵抗；生命值低于{low}%时受到的物理与法术伤害-{dr}%；重生后{s}秒内无敌', { name, atk: pct(V.atkPct), low: pct(V.lowHp), dr: pct(V.lowDr2), s: V.reviveInvincible }) };
    case 3: return { short: t('复仇：无敌之刃 3'), full: t('层数最高的已激活盟约在{n}层以上每多{n}层，额外出现1名【{name}】（最终领袖回合按所有博士中最高的计算）；【{name}】生命值低于{low}%时受到的物理与法术伤害改为-{dr}%，攻击速度+{aspd}', { n: V.perStacks, name, aspd: V.aspd, low: pct(V.lowHp), dr: pct(V.lowDr3) }) };
    default: return { short: '?', full: '?' };
  }
}

function famigliaText(node, enemyName) {
  const F = CC.famiglia;
  const zaaro = enemyName(F.zaaro.key), silencer = enemyName(F.summonKey);
  switch (node) {
    case 'cleaner': return { short: t('家族：清道夫 1'), full: t('第10~13回合，盟约层数之和最少的博士（并列时座位靠前者）的作战中额外出现{n}名【{name}】（单人模式{m}名）', { n: CC.silencers.count, m: CC.silencers.soloCount, name: enemyName(CC.silencers.key) }) };
    case 'unending2': return { short: t('家族：无尽 2'), full: t('每场作战全程处于清算时刻：敌人攻击力+{atk}%，防御力+{def}%（不会因此出现【{silencer}】）', { atk: pct(F.atkPct), def: pct(F.defPct), silencer }) };
    case 'seasonal2': return { short: t('家族：季节 2'), full: t('每场作战都有血债账款：从0开始，每秒+{n}，达到{max}时触发清算时刻（敌人攻击力+{atk}%，防御力+{def}%，出现1名【{silencer}】，{s}秒内归零）；从第{r}回合起开始时为{late}%', { n: F.perSec, max: F.max, atk: pct(F.atkPct), def: pct(F.defPct), silencer, s: F.drainSeconds, r: F.lateFrom, late: pct(F.lateShare) }) };
    case 'unending3':
    case 'seasonal3': return { short: node === 'unending3' ? t('家族：无尽 3') : t('家族：季节 3'), full: t('【{zaaro}】加入上述额外敌人，漏过时扣除{lp}点目标生命', { zaaro, lp: F.zaaro.leakLp }) };
    default: return { short: '?', full: '?' };
  }
}

function patriotText(node, enemyName) {
  const pt = CC.patriot;
  const name = enemyName(pt.key), escort = enemyName(pt.escort.key);
  switch (node) {
    case 'undying1': return { short: t('爱国者：不死 1'), full: t('第{r}回合的机变必定提供【{name}】（1级属性，无赏金，漏过时扣除{lp}点目标生命）；若无人选择，最终领袖最大生命值+{hp}%', { r: pt.round, name, lp: pt.leakLp, hp: pct(pt.skipHp) }) };
    case 'undying2': return { short: t('爱国者：不死 2'), full: t('{n}名【{escort}】随【{name}】出现；【{name}】处于行军姿态时，受到未阻挡他的单位造成的物理与法术伤害-{dr}%；若无人选择【{name}】，最终领袖攻击力还+{atk}%', { n: pt.escort.count, escort, name, dr: pct(pt.marchDr), atk: pct(pt.skipAtk) }) };
    case 'undying3': return { short: t('爱国者：不死 3'), full: t('【{name}】最大生命值+{hp}%，处于行军姿态时免疫减速、晕眩、束缚、寒冷、冻结、战栗、沉睡、恐惧、浮空与诱导，移动速度不会低于基础值；无论是否有人选择，【{name}】与{n}名【{escort}】都会在最终领袖回合出现（每个战场1组）', { name, hp: pct(pt.hpPct), n: pt.escort.count, escort }) };
    default: return { short: '?', full: '?' };
  }
}

function delegationText(node, enemyName) {
  const dg = CC.delegation;
  const [degen, shield, champ] = dg.wave.map((w) => enemyName(w.key));
  switch (node) {
    case 'united1': return { short: t('访问团：联合 1'), full: t('最终领袖回合，每个战场额外出现1名【{degen}】（1级属性，回合开始时即出现，各战场的【{degen}】共享生命值）、{n}名【{shield}】与{m}名【{champ}】；【{degen}】最大生命值为每名存活玩家{hp}%', { degen, shield, champ, n: dg.wave[1].count, m: dg.wave[2].count, hp: pct(dg.hpMul.united1) }) };
    case 'united2': return { short: t('访问团：联合 2'), full: t('【{degen}】存活时最终领袖不会死亡；【{degen}】最大生命值为每名存活玩家{hp}%，攻击力+{atk}%；【{degen}】未被阻挡时移动速度逐渐提升，{s}秒后达到+{c}%，被阻挡或无法移动时重置', { degen, hp: pct(dg.hpMul.united2), atk: pct(dg.degenAtkMul - 1), s: dg.chargeSeconds, c: pct(dg.chargePct) }) };
    case 'united3': return { short: t('访问团：联合 3'), full: t('【{degen}】最大生命值为每名存活玩家{hp}%；每损失{p}%最大生命值释放【瞬息杀机】，释放完成前生命值不会继续减少（任一战场的【{degen}】释放完成即可）', { hp: pct(dg.hpMul.united3), degen, p: pct(dg.gateRatio) }) };
    default: return { short: '?', full: '?' };
  }
}

/**
 * The levels a tag's chosen level includes, top first: a tag group's ancestors; a `stacks` chain's levels up to it
 * (GitHub #84: Investor 2 lists Investor 1's effect too); another chain's level alone.
 */
export function levelsInForce(r, level) {
  if (!Array.isArray(r.parent)) return level > 0 ? (r.stacks ? Array.from({ length: Math.min(level, 16) }, (_, i) => i + 1) : [level]) : [];
  const out = [];
  for (let l = level; l > 0 && out.length < 16; l = tagParent(r.key, l)) out.unshift(l);
  return out;
}

/**
 * Where each level of a tag sits in the grid: `{ level, row, col, span }` (col 0-based within the tag's columns), and
 * `width` (its columns: a tag group's leaves side by side, its shared tiers spanning them).
 */
function tagLayout(r) {
  const n = r.risk.length;
  const kids = Array.from({ length: n }, () => []);
  for (let l = 1; l < n; l++) kids[tagParent(r.key, l)].push(l);
  const cells = [];
  let col = 0;
  const place = (l, depth) => {
    const start = col;
    if (!kids[l].length) col++;
    for (const k of kids[l]) place(k, depth + 1);
    if (l > 0) cells.push({ level: l, row: depth, col: start, span: Math.max(1, col - start) });
  };
  place(0, 0);
  return { cells, width: Math.max(1, col) };
}

/** The Risk tags (SPA-CC) as Contingency Contract lays them out: one column per tag, its levels top (1) to bottom. */
function RiskGrid({ rules, editable, onSet }) {
  useData('bonds', 'enemies', 'chess', 'bands'); // names in the texts: alliances, enemies, operators (Investor 2), Strategies (Strategy 2)
  const tags = RULES.filter((r) => r.type === 'level');
  const labels = ruleLabels(rules);
  const on = tags.filter((r) => rules[r.key] > 0);
  // a column per tag; a tag group (Famiglia, Patriot, Delegation) takes a column per branch, its shared tiers spanning
  // them; a level the chosen one builds on is lit too (it is in force)
  let col = 1;
  const cells = [];
  for (const r of tags) {
    const { cells: own, width } = tagLayout(r);
    const inForce = new Set(levelsInForce(r, rules[r.key]));
    for (const c of own) cells.push({ r, ...c, col: col + c.col, inForce: inForce.has(c.level) });
    col += width;
  }
  return html`<div class="risk">
    <div class="risk__total"><b class="num">${t('风险 {n}', { n: labels.risk })}</b>
      </div>
    <div class="risk__grid" style=${`--risk-cols:${col - 1}`}>
      ${cells.map(({ r, level, row, col: c, span, inForce }) => {
        const active = rules[r.key] === level;
        return html`<${Tooltip} key=${`${r.key}:${level}`} text=${riskText(r.key, level).full} style=${`grid-row:${row};grid-column:${c} / span ${span}`}>
          <button type="button" class=${cx('risk__tile', active && 'is-active', !active && inForce && 'is-included')} aria-pressed=${active ? 'true' : 'false'}
            data-risk=${r.key} data-level=${level} disabled=${!editable} onClick=${() => onSet({ [r.key]: active ? 0 : level })}>
            <span class="risk__lv num">${ruleRisk(r.key, level)}</span><span>${riskText(r.key, level).short}</span>
          </button>
        <//>`;
      })}
    </div>
    ${on.length ? html`<ul class="risk__effects">${on.flatMap((r) => levelsInForce(r, rules[r.key]).map((l) => html`<li key=${`${r.key}:${l}`}>${riskText(r.key, l).full}</li>`))}</ul>` : null}
  </div>`;
}

/** The strip between the seats and the bottom bar: the rules in force, the labels, and the button to the dialog. */
export function RulesBar({ room, isHost, busy, onSet }) {
  const [open, setOpen] = useState(false);
  useData('chess', 'bonds', 'stages', 'backups');
  const rules = { ...DEFAULT_RULES, ...(room.rules || {}) };
  const on = rulesInForce(rules);
  const badges = ruleBadges(rules);
  return html`<div class="room-rules">
    <span class="room-bar__label">${t('自定义房间改动')}<${MicroLabel}>CUSTOM<//></span>
    <${Button} variant="secondary" class="rules-open" onClick=${() => setOpen(true)}>${isHost ? t('调整') : t('查看')}<//>
    <div class="rules-summary">
      ${on.length ? on.map((k) => html`<span key=${k} class=${cx('rules-chip', `rules-chip--${ruleOf(k).category}`)}>${ruleLabel(k, rules)}</span>`)
        : html`<span class="t-dim">${t('原版规则')}</span>`}
      ${badges.cheats ? html`<span class="rules-badge rules-badge--cheat">${badges.cheats}</span>` : null}
      ${badges.seeded ? html`<span class="rules-badge rules-badge--seeded">${badges.seeded}</span>` : null}
      ${badges.risk > 0 ? html`<span class="rules-badge rules-badge--risk num">+${badges.risk}</span>` : null}
    </div>
    <${RulesDialog} open=${open} onClose=${() => setOpen(false)} room=${room} rules=${rules} editable=${isHost && !busy} onSet=${onSet} />
  </div>`;
}

/** One rule row: an on/off switch with its explanation. */
function Toggle({ k, rules, editable, onSet, label, desc }) {
  const v = rules[k] === true;
  return html`<div class="rules-row">
    <button type="button" role="switch" aria-checked=${v ? 'true' : 'false'} class=${cx('rules-pick__opt', v && 'is-active')}
      data-rule=${k} disabled=${!editable} onClick=${() => onSet({ [k]: !v })}>
      <${Icon} name=${v ? 'check' : 'plus'} />${label}
    </button>
    ${desc ? html`<p class="rules-row__desc">${desc}</p>` : null}
  </div>`;
}

/** A module choice (A = the original effect) and the text of the chosen one. */
function ModuleChoice({ k, bondId, rules, editable, onSet, texts }) {
  const rule = ruleOf(k);
  const v = rules[k];
  return html`<div class="rules-row">
    <div class="rules-mod">
      <${BondGlyph} bondId=${bondId} /><b>${bondName(bondId)}</b>
      <div class="rules-seg" role="radiogroup" aria-label=${bondName(bondId)}>
        ${rule.options.map((o) => html`<button key=${o} type="button" role="radio" aria-checked=${v === o ? 'true' : 'false'}
          class=${cx('rules-seg__opt', v === o && 'is-active')} data-rule=${k} data-value=${o} disabled=${!editable}
          onClick=${() => onSet({ [k]: o })}>${o === rule.options[0] ? t('模组 {m}（原版）', { m: o }) : t('模组 {m}', { m: o })}</button>`)}
      </div>
    </div>
    <p class="rules-row__desc">${texts[v] || ''}</p>
  </div>`;
}

function Section({ title, note, children }) {
  return html`<section class="rules-sec"><h3>${title}${note ? html`<span class="t-dim"> · ${note}</span>` : null}</h3>${children}</section>`;
}

/** The map choice and the ban picks of the room's difficulty. */
function Seeded({ room, rules, editable, onSet }) {
  useData('config', 'stages', 'bonds');
  const config = data.get('config');
  const mode = config?.modes?.[modeIdFor(room.mode, room.difficulty)] || null;
  const stages = Array.isArray(mode?.stages) ? mode.stages : [];
  const counts = config?.bans?.[room.difficulty] || { core: 0, addon: 0 };
  const inactive = new Set(Array.isArray(mode?.inactiveBondIds) ? mode.inactiveBondIds : []);
  const bonds = (data.list('bonds') || []).filter((b) => b && Number(b.weight) > 0 && !inactive.has(b.bondId));
  const picks = new Set(rules.bans || []);
  const group = (isCore, max) => {
    const list = bonds.filter((b) => !!b.isCore === isCore);
    const n = list.filter((b) => picks.has(b.bondId)).length;
    const toggle = (id) => {
      const next = new Set(picks);
      if (next.has(id)) next.delete(id);
      else if (n < max) next.add(id);
      else return;
      onSet({ bans: [...next].sort() });
    };
    return html`<div class="rules-bans">
      <div class="rules-bans__head"><b>${isCore ? t('禁用核心盟约') : t('禁用附加盟约')}</b>
        <span class="t-dim">${t('已选 {n}/{max}，其余随机', { n, max })}</span></div>
      <div class="rules-bans__grid">
        ${list.map((b) => html`<${Tooltip} key=${b.bondId} text=${b.name}>
          <button type="button" class=${cx('rules-ban', picks.has(b.bondId) && 'is-active')} aria-pressed=${picks.has(b.bondId) ? 'true' : 'false'}
            data-ban=${b.bondId} disabled=${!editable || (!picks.has(b.bondId) && n >= max)} onClick=${() => toggle(b.bondId)}>
            <${BondGlyph} bondId=${b.bondId} /><span>${b.name}</span>
            ${picks.has(b.bondId) ? html`<${Icon} name="close" class="rules-ban__x" />` : null}
          </button>
        <//>`)}
      </div>
    </div>`;
  };
  return html`
    <div class="rules-row rules-map">
      <div class="rules-map__pick">
        <b>${t('战场')}</b>
        <div class="rules-seg rules-seg--wrap" role="radiogroup" aria-label=${t('战场')}>
          <button type="button" role="radio" aria-checked=${rules.stage == null ? 'true' : 'false'} class=${cx('rules-seg__opt', rules.stage == null && 'is-active')}
            data-stage="" disabled=${!editable} onClick=${() => onSet({ stage: null })}>${t('随机')}</button>
          ${stages.map((id, i) => html`<${Tooltip} key=${id} text=${data.lookup('stages', id)?.name || id}>
            <button type="button" role="radio" aria-checked=${rules.stage === id ? 'true' : 'false'}
              class=${cx('rules-seg__opt rules-seg__opt--num num', rules.stage === id && 'is-active')} data-stage=${id} disabled=${!editable}
              onClick=${() => onSet({ stage: id })}>${stageNumber(id, i)}</button>
          <//>`)}
        </div>
      </div>
      <${StagePreview} stageId=${rules.stage} />
    </div>
    <p class="rules-row__desc">${t('选择要禁用的盟约；未选满的名额仍随机抽取')}</p>
    ${counts.core > 0 ? group(true, counts.core) : null}
    ${counts.addon > 0 ? group(false, counts.addon) : null}`;
}

/** A battlefield's own number from its name ("战场#04 活性源石" → 4), else its place in the list (1-based). */
function stageNumber(id, i) {
  const m = /#\s*0*(\d+)/.exec(data.getRaw('stages')?.[id]?.name || data.lookup('stages', id)?.name || '');
  return m ? Number(m[1]) : i + 1;
}

/** Colour class of a stage tile (data/stages.json `tiles` legend) in the map preview; null = not drawn. */
function tileClass(tile) {
  if (!tile) return null;
  const k = tile.tileKey;
  if (k === 'tile_forbidden' || k === 'tile_achand') return null;
  if (k === 'tile_start') return 'gate';
  if (k === 'tile_end') return 'goal';
  if (k === 'tile_telin' || k === 'tile_telout') return 'tele';
  if (k === 'tile_wall') return 'high';
  if (k === 'tile_fence_bound') return 'fence';
  if (k === 'tile_deepsea') return 'deep';
  if (k === 'tile_smog') return 'smog';
  if (k === 'tile_infection') return 'infect';
  if (k === 'tile_mire') return 'mire';
  if (k === 'tile_floor') return 'floor';
  return 'road';
}

/** The player's field of a stage (rows 9–12, GEO.NORMAL_RECT; drawn far row on top) as a small tile map; "?" for random. */
export function StagePreview({ stageId }) {
  useData('stages');
  const st = stageId ? data.lookup('stages', stageId) : null;
  const name = st?.name || (stageId ? stageId : t('随机'));
  if (!st || !Array.isArray(st.rows)) {
    return html`<figure class="stage-prev stage-prev--random"><div class="stage-prev__q">?</div><figcaption>${name}</figcaption></figure>`;
  }
  const rows = [12, 11, 10, 9];
  const cells = [];
  let c0 = Infinity, c1 = -Infinity;
  rows.forEach((r, y) => [...(st.rows[r] || '')].forEach((g, c) => {
    const cls = tileClass(st.tiles?.[g]);
    if (!cls) return;
    c0 = Math.min(c0, c); c1 = Math.max(c1, c);
    cells.push({ x: c, y, cls });
  }));
  if (!cells.length) return html`<figure class="stage-prev"><figcaption>${name}</figcaption></figure>`;
  const w = c1 - c0 + 1;
  return html`<figure class="stage-prev" data-stage-preview=${stageId}>
    <svg viewBox=${`0 0 ${w} ${rows.length}`} role="img" aria-label=${name}>
      ${cells.map((q) => html`<rect key=${`${q.x}:${q.y}`} class=${`stage-prev__t stage-prev__t--${q.cls}`} x=${q.x - c0 + 0.04} y=${q.y + 0.04} width="0.92" height="0.92" rx="0.08" />`)}
    </svg>
    <figcaption>${name}</figcaption>
  </figure>`;
}

/** The dialog: every rule, grouped by category; read-only for everybody but the host. */
export function RulesDialog({ open, onClose, room, rules, editable, onSet }) {
  useData('chess', 'bonds', 'backups');
  const lat = bondName('lateranoShip'), vic = bondName('victoriaShip');
  const blazeName = data.get('backups')?.units?.[BLAZE.charId]?.name || BLAZE.charId;
  const spark = chessName(BLAZE.product.a, BLAZE.product.a);
  const lateranoTexts = {
    A: t('原版效果'),
    B: t(LATERANO_B_TEXT, { bond: lat, list: LATERANO_B_LIST.map((id) => chessName(id, id)).join(t('、')) }),
  };
  const victoriaTexts = {
    A: t('原版效果'),
    C: t(VICTORIA_C_TEXT, { bond: vic }),
  };
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('自定义房间改动')} micro="CUSTOM" width="13rem" class="rules-dialog"
    actions=${html`<${Button} variant="secondary" onClick=${onClose}>${t('关闭')}<//>`}>
    ${room.searching ? html`<p class="rules-note">${t('搜寻队友时使用原版规则')}</p>` : null}
    ${editable ? null : html`<p class="rules-note">${t('由创建者设置')}</p>`}
    <${Section} title=${t('作弊')} note=${t('结算画面将显示「{mark}」', { mark: 'WITH CHEATS' })}>
      <${Toggle} k="extraDeploy" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('extraDeploy', rules)} desc=${t('所有博士的部署上限 +{n}', { n: RULE_EXTRA_DEPLOY })} />
      <${Toggle} k="extraFunds" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('extraFunds', rules)} desc=${t('每回合开始时额外获得 {n} 资金', { n: RULE_EXTRA_FUNDS })} />
      <${Toggle} k="doubleLp" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('doubleLp', rules)} desc=${t('所有博士的初始目标生命翻倍')} />
      <${Toggle} k="tierStart" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('tierStart', rules)} desc=${t('开局时所有博士各获得每个阶级的随机干员1名（1~6阶）')} />
      <${Toggle} k="boosterPack" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('boosterPack', rules)} desc=${t('开局时所有博士各获得1个补充包：装备到干员上即可免费选择同阶干员，每次6名，按固定顺序轮换；补充包留在手牌（AI不会使用）')} />
      <${Toggle} k="itemBoosterPack" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('itemBoosterPack', rules)} desc=${t('开局时所有博士各获得1个装备补充包：装备到任意干员上即可免费选择一件装备，每次6件，按固定顺序轮换全部装备；装备补充包留在手牌（AI不会使用）')} />
      <${Toggle} k="transmitterPlus" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('transmitterPlus', rules)} desc=${t('信标更好用：独自一人时，第一次装备给六星干员必出缪尔赛思，其他时候必出一名你层数最多的盟约的干员；有队友但没人需要原干员时，改为给2名随机队友各送1名其主盟约的同阶干员；5人及以上的房间多送1人')} />
      ${room.mode === 'solo' ? null : html`<${Toggle} k="untimed" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('untimed', rules)} desc=${t('选择策略、机变阶段与休整期不限时（作战仍有时间限制）')} />`}
    <//>
    <${Section} title=${t('盟约模组')} note=${t('不影响结算标签')}>
      <${ModuleChoice} k="lateranoMod" bondId="lateranoShip" rules=${rules} editable=${editable} onSet=${onSet} texts=${lateranoTexts} />
      <${ModuleChoice} k="victoriaMod" bondId="victoriaShip" rules=${rules} editable=${editable} onSet=${onSet} texts=${victoriaTexts} />
    <//>
    <${Section} title=${t('盟约调整')} note=${t('不影响结算标签')}>
      <${Toggle} k="virtuosaBonds" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('virtuosaBonds', rules)}
        desc=${t('{name}同时属于【{a}】【{b}】【{c}】', { name: chessName(VIRTUOSA.ids[0], VIRTUOSA.ids[0]), a: lat, b: bondName('swiftShip'), c: bondName('deputShip') })} />
      <${Toggle} k="blaze" rules=${rules} editable=${editable} onSet=${onSet} label=${ruleLabel('blaze', rules)}
        desc=${t('{name}占据{old}在调度中心的位置（相同的阶级与价格，使用为{old}选择的技能），属于【{a}】【{b}】；<售出时>获得1名【{spark}】', { name: blazeName, old: (data.lookupBase('chess', BLAZE.slot.a)?.name || BLAZE.slot.a), a: bondName('yanShip'), b: vic, spark })} />
    <//>
    <${Section} title=${t('减少随机')} note=${t('结算标题将带有「{mark}」', { mark: 'seeded' })}>
      <${Seeded} room=${room} rules=${rules} editable=${editable} onSet=${onSet} />
    <//>
    <${Section} title=${t('风险')} note=${t('结算标题将带有「+风险」')}>
      <${RiskGrid} rules=${rules} editable=${editable} onSet=${onSet} />
    <//>
  <//>`;
}
