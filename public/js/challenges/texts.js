// The words of a challenge: what each outcome and condition says (fish-edition/untracked/challenge-system-draft.md §3). A card shows
// the outcome as its title and every condition as a line under it. Msgids are Chinese like the rest of the UI (shared/i18n.js t());
// names (Alliances, Risk tags, difficulties) come from the game's own data, so they are the same words the player sees elsewhere.
//
// `describe(id)` is the text of one instance; null for an id the catalog does not know (a card saved by a newer build). Pure but
// for `data` (Alliance names) and `t`; tested with a stub for both.

import { t, N_ } from '../../../shared/i18n.js';
import { data } from '../data.js';
import { resolve } from './catalog.js';
import { riskText } from '../ui/lobbyRules.js';

const DIFF_NAME = ['', N_('标准模拟'), N_('险境模拟'), N_('绝境模拟'), N_('终极模拟')];
const opName = (id) => data.get('backups')?.diy?.operators?.[id]?.name || id;
const bondName = (id) => data.lookup('bonds', id)?.name || id;
/** A count as a person reads it: 5 000 000 → "5M" / "500万" (the browser's own compact form for the page's language). */
export function fmtCount(n, lang) {
  try { return new Intl.NumberFormat(lang || undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n); } catch { return String(n); }
}

/** @param {string} id an instance id of catalog.js */
export function describe(id, lang) {
  const c = resolve(id);
  if (!c) return null;
  const n = c.param;
  const num = fmtCount(n, lang);
  if (c.group === 'outcome') {
    if (id === 'win') return t('赢得一局');
    if (id === 'winHidden') return t('赢得一局并通关隐藏核心');
    return t('至少通过 {n} 个回合', { n });
  }
  if (c.group === 'difficulty') return t('难度不低于{name}', { name: t(DIFF_NAME[n]) });
  if (id === 'solo') return t('单人游玩');
  if (c.group === 'players') return t('至少 {n} 名真人玩家', { n });
  if (id === 'noCheats') return t('不使用作弊规则');
  if (c.group === 'risk') return t('风险值至少 {n}', { n });
  if (c.group === 'tag') { const key = c.key.slice(4); return t('启用标签：{tag}', { tag: riskText(key, n).short }); }
  if (id === 'nobodyOut') return t('没有人被淘汰');
  if (id === 'noLpLost') return t('不损失目标生命');
  if (c.key === 'perfectRounds') return t('至少 {n} 回合完美作战', { n });
  if (c.group === 'bond') return c.id.startsWith('bondActive:') ? t('激活{bond}', { bond: bondName(c.bond) }) : t('{bond}层数至少 {n}', { bond: bondName(c.bond), n });
  if (c.group === 'bondCount') return t('同时激活至少 {n} 个盟约', { n });
  if (c.group === 'stat') {
    switch (c.key.slice(5)) {
      case 'dmgDealt': return t('造成伤害至少 {n}', { n: num });
      case 'kills': return t('击倒至少 {n} 个敌人', { n: num });
      case 'gold': return t('消耗资金至少 {n}', { n: num });
      case 'refreshes': return t('刷新商店至少 {n} 次', { n });
      case 'merges': return t('晋升至少 {n} 次', { n });
      case 'itemsEquipped': return t('配发至少 {n} 件装备', { n });
      case 'bossDamage': return t('对领袖造成伤害至少 {n}', { n: num });
      case 'activatedLayers': return t('累计盟约层数至少 {n}', { n: num });
      case 'leaks': return n === 0 ? t('不漏过任何敌人') : t('漏过的敌人不超过 {n} 个', { n });
      default: return null;
    }
  }
  if (c.key === 'lineup:golden') return t('至少 {n} 名精英干员上场', { n });
  if (c.key === 'lineup:anyCustom') return t('在对局中使用其中一名自选干员：{names}', { names: c.param.map(opName).join(' / ') });
  if (c.key === 'lineup:custom') return t('使用自选干员');
  return null;
}

/** A card as words: the outcome (title) and the conditions (lines). Unknown ids are skipped. */
export function describeCard(card, lang) {
  const [outcome, ...rest] = card.parts;
  return { title: describe(outcome, lang) ?? '', lines: rest.map((id) => describe(id, lang)).filter(Boolean) };
}
