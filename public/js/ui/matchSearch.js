// 搜寻队友 UI (DESIGN §27): the room screen's search strip and status line, the 搜寻成功! toast, and the lobby's
// update announcement (shown until closed; 0.2.1's replaced the 搜寻队友 one).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { MAX_SEATS } from '../../../shared/constants.js';
import { html, Button, Icon, Tooltip } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { serverNow, loadPref, savePref } from '../store.js';
import { t, tc, N_ } from '../../../shared/i18n.js';

// A new key per announcement: bumped for 单人匹配, so everyone who closed the 0.2.1 one ('news.0.2.1') sees it again.
export const UPDATE_NEWS_PREF = 'news.0.2.1.solo';

/** The 0.2.1 announcement's points (msgids). */
const UPDATE_POINTS = [
  N_('自选干员：在「干员调配 → 自选编队」为 5 阶、6 阶各选 2 名自己拥有的 6★ 干员，技能和模组任选'),
  N_('最终攻势与隐秘核心的领袖生命值按开战时存活的博士人数计算'),
  N_('语音语言：在「设置」或「干员调配」里为每名干员选择中文、日文、英文、韩文或本土语言配音'),
  N_('新增「单人匹配」模式：自动与服务器中的其他博士组队'), // en: "New Solo Matchmaking mode: Team up with other Doctors in the server automatically."
  N_('大量问题修复'),
];

export function UpdateNews() {
  const [hidden, setHidden] = useState(() => loadPref(UPDATE_NEWS_PREF, false) === true);
  if (hidden) return null;
  const dismiss = () => { savePref(UPDATE_NEWS_PREF, true); setHidden(true); };
  return html`<aside class="search-news brackets" role="note" aria-label=${t('0.2.1 重大更新')}>
    <span class="search-news__icon" aria-hidden="true"><${Icon} name="info" /></span>
    <div class="search-news__text">
      <span class="search-news__head"><span class="search-news__tag">NEW</span>${t('0.2.1 重大更新')}</span>
      <ul class="search-news__list">${UPDATE_POINTS.map((p) => html`<li key=${p}>${t(p)}</li>`)}</ul>
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
