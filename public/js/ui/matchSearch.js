// 搜寻队友 UI (DESIGN §90): the room screen's search strip and status line, the 搜寻成功! toast, and the lobby's
// update announcement (shown until closed; one per release).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { MAX_SEATS } from '../../../shared/constants.js';
import { html, Button, Icon, Tooltip } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { serverNow, loadPref, savePref } from '../store.js';
import { t, tc, N_ } from '../../../shared/i18n.js';

// A new key per announcement, so everyone who closed the earlier one ('news.0.2.4.1') sees it again.
export const UPDATE_NEWS_PREF = 'news.0.2.5';

/** The 0.2.5 announcement's emphasized line, shown above the points (msgid). */
const UPDATE_HIGHLIGHT = N_('干员调配新增时装系统'); // en: "Added the Outfits system to Operator Loadout"

/** The 0.2.5 announcement's points (msgids). */
const UPDATE_POINTS = [
  N_('战场现使用官方3D场景（如沙地战场），取代金属棋盘'), // en: "Battlefields now use the official 3D scenes, such as the sand stages, in place of the metal board"
  N_('新增「官方伤害数字」设置（默认关闭）：只显示官方游戏会显示的伤害数字'), // en: "New \"Official Damage Numbers\" setting (off by default): shows only the damage numbers the official game shows"
  N_('盟约层数音效现会在回合开始、机变、休整期与战斗中播放'), // en: "Alliance stack sounds now play at round start, in Improv, in the Rest Phase and in combat"
  N_('结算前生命值保持当前数值，并在旁边显示待扣除的 −N'), // en: "HP keeps its current value until settlement, with the pending −N shown beside it"
  N_('干员模型在攻击或释放技能时不再被直线边缘截断'), // en: "Operator models no longer get cut off at a straight edge when they attack or use a skill"
  N_('号角与灰毫现使用正确的攻击动画'), // en: "Horn and Ashlock use the correct attack animations"
  N_('重炮手的炮弹以抛物线飞行并在落地时爆炸；领主近卫在近距离时使用近战动画'), // en: "Fortress Defenders shots fly in an artillery arc and burst on landing; Lord Guards use their melee animation up close"
  N_('大量问题修复'), // en: "Many fixes"
];

// '0.2.5 更新 - PRTS' — en: "Update 0.2.5 - PRTS"
export function UpdateNews() {
  const [hidden, setHidden] = useState(() => loadPref(UPDATE_NEWS_PREF, false) === true);
  if (hidden) return null;
  const dismiss = () => { savePref(UPDATE_NEWS_PREF, true); setHidden(true); };
  return html`<aside class="search-news brackets" role="note" aria-label=${t('0.2.5 更新 - PRTS')}>
    <span class="search-news__icon" aria-hidden="true"><${Icon} name="info" /></span>
    <div class="search-news__text">
      <span class="search-news__head"><span class="search-news__tag">NEW</span>${t('0.2.5 更新 - PRTS')}</span>
      <ul class="search-news__list">
        <li class="search-news__highlight"><strong>${t(UPDATE_HIGHLIGHT)}</strong></li>
        ${UPDATE_POINTS.map((p) => html`<li key=${p}>${t(p)}</li>`)}
      </ul>
    </div>
    <${Button} variant="ghost" size="sm" square=${true} icon="close" class="search-news__close" onClick=${dismiss} aria-label=${t('关闭提示')} title=${t('关闭提示')} />
  </aside>`;
}

/** m:ss since `since` (server time). */
export function searchClock(since, now = serverNow()) {
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** The host's 搜寻队友 switch, on by default (people should play with people): on, the big button searches. */
export const FIND_MATES_PREF = 'room.findMates';

/** @returns {[boolean, (on: boolean) => void]} */
export function useFindMates() {
  const [on, setOn] = useState(() => loadPref(FIND_MATES_PREF, true) !== false);
  return [on, (v) => { savePref(FIND_MATES_PREF, !!v); setOn(!!v); }];
}

/** The switch applies: a co-op room with a free seat, seen from a player seat. */
export function canFindMates(room, facts) {
  return room.mode !== 'solo' && !facts.spectating && facts.occupied.length < MAX_SEATS;
}

/**
 * The search strip above the room bar: the host's 搜寻队友 switch (it turns 开始模拟 into 搜寻队友, room.js) and what
 * the search does. No queue size: an empty-looking queue keeps people out of it.
 * @param {{ room: any, facts: any, findMates: boolean, setFindMates: (on: boolean) => void }} props
 */
export function SearchBar({ room, facts, findMates, setFindMates }) {
  if (!canFindMates(room, facts)) return null;
  const on = !!room.searching;
  if (!facts.isHost && !on) return null;
  const armed = on || findMates;
  const hint = on ? t('同盟满 4 人后将自动开始模拟')
    : !findMates ? t('关闭后可直接开始模拟') // en: "Off: you can start the simulation right away"
    : facts.othersReady ? t('与其他正在搜寻的同盟合并，补满 {n} 个空位', { n: facts.emptySeats }) : t('所有博士准备就绪后才能搜寻队友');
  return html`<section class=${`searchbar${on ? ' is-on' : ''}${armed ? ' is-armed' : ''}`} aria-label=${t('搜寻队友')}>
    ${/* title en: "Stop searching to turn this off" */ facts.isHost ? html`<button type="button" class=${`searchbar__switch${armed ? ' is-on' : ''}`} role="switch" aria-checked=${armed ? 'true' : 'false'}
        disabled=${on} title=${on ? t('停止搜寻后才能关闭') : null} onClick=${() => setFindMates(!findMates)}>
      <span class="searchbar__track" aria-hidden="true"><i></i></span>
      <${Icon} name="search" /><span class="searchbar__label">${t('搜寻队友')}</span>
      <b class="searchbar__state">${armed ? tc('toggle', '开启') : tc('toggle', '关闭')}</b>
    </button>` : null}
    <span class=${on ? 't-mint' : !findMates || facts.othersReady ? 't-lo' : 't-orange'}>${hint}</span>
  </section>`;
}

/** The host's big button while the switch is on: 搜寻队友 / 停止搜寻 (room.search). */
export function SearchButton({ room, facts, busy, online, run }) {
  const on = !!room.searching;
  const toggle = () => run('search', async () => {
    await net.request('room.search', { on: !on });
    if (on) toast(t('取消搜寻成功'), 'info');
  });
  return html`<${Tooltip} text=${on || facts.othersReady ? null : t('仍有博士未准备就绪')}>
    <${Button} variant=${on ? 'amber' : 'primary'} size="xl" icon=${on ? 'close' : 'search'} active=${on} loading=${busy === 'search'}
      disabled=${!online || (!on && !facts.othersReady)} onClick=${toggle}>${on ? t('停止搜寻') : t('搜寻队友')}<//>
  <//>`;
}

export function SearchStatus({ room, facts }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!room.searching) return undefined;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [room.searching]);
  if (!room.searching) return null;
  // groupReady: a merged-in guest would otherwise wait on the host, who never readies
  if (!facts.groupReady) return html`<span class="t-orange"><${Icon} name="hourglass" />${t('搜寻已暂停 · 等待所有博士准备就绪')}</span>`;
  const since = Number.isFinite(room.searchSince) ? room.searchSince : serverNow();
  return html`<span class="t-mint"><${Icon} name="search" />${t('搜寻中 · {time}', { time: searchClock(since) })}</span>`;
}

/**
 * 搜寻成功! when a merge grew the room: a new code, or Doctors arriving ready while searching (a join by code arrives
 * not ready).
 */
export function useSearchNotice(room, myId) {
  const prev = useRef(null);
  useEffect(() => {
    const before = prev.current;
    prev.current = room;
    if (!room || !before || room.inMatch) return;
    const ids = (r) => new Set((r.seats || []).filter((s) => s && !s.isBot).map((s) => s.playerId));
    const had = ids(before);
    const moved = before.code !== room.code;
    const arrived = (room.seats || []).some((s) => s && !s.isBot && s.playerId !== myId && !had.has(s.playerId) && s.ready);
    if (moved || (before.searching && arrived)) toast(t('搜寻成功!'), 'success');
  }, [room, myId]);
}
