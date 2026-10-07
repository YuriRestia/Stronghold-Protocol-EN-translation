// 搜寻队友 UI (DESIGN §27): the room screen's search strip and status line, the 搜寻成功! toast, and the lobby's
// update announcement (shown until closed; 0.2.1's replaced the 搜寻队友 one).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { MAX_SEATS } from '../../../shared/constants.js';
import { html, Button, Icon } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { serverNow, loadPref, savePref } from '../store.js';
import { t, N_ } from '../../../shared/i18n.js';
import { useSearching, queuedOthers } from './presence.js';

// A new key per announcement: the 0.2.1 one shows again to everyone who closed the 搜寻队友 one ('news.matchSearch').
export const UPDATE_NEWS_PREF = 'news.0.2.1';

/** The 0.2.1 announcement's points (msgids). */
const UPDATE_POINTS = [
  N_('自选干员：在「干员调配 → 自选编队」为 5 阶、6 阶各选 2 名自己拥有的 6★ 干员，技能和模组任选'),
  N_('最终攻势与隐秘核心的领袖生命值按开战时存活的博士人数计算'),
  N_('语音语言：在「设置」或「干员调配」里为每名干员选择中文、日文、英文、韩文或本土语言配音'),
  N_('大厅和搜寻队友时显示在线与正在搜寻的博士人数'),
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

/**
 * The search strip, above the room bar because the bar has no room for a third big button: the host's button, and for
 * every member while the room searches, how many others are in the queue.
 * @param {{ room: any, facts: any, busy: any, online: boolean, run: (kind: string, fn: () => Promise<any>) => any }} props
 */
export function SearchBar({ room, facts, busy, online, run }) {
  const searching = useSearching();
  if (room.mode === 'solo' || facts.spectating || facts.occupied.length >= MAX_SEATS) return null;
  const on = !!room.searching;
  if (!facts.isHost && !on) return null;
  const toggle = () => run('search', async () => {
    await net.request('room.search', { on: !on });
    if (on) toast(t('取消搜寻成功'), 'info');
  });
  const hint = on ? t('同盟满 4 人后将自动开始模拟')
    : facts.othersReady ? t('与其他正在搜寻的同盟合并，补满 {n} 个空位', { n: facts.emptySeats }) : t('所有博士准备就绪后才能搜寻队友');
  return html`<section class=${`searchbar${on ? ' is-on' : ''}`} aria-label=${t('搜寻队友')}>
    ${facts.isHost ? html`<${Button} variant=${on ? 'amber' : 'secondary'} size="md" icon=${on ? 'close' : 'search'} active=${on} loading=${busy === 'search'}
      disabled=${!online || (!on && !facts.othersReady)} onClick=${toggle}>${on ? t('停止搜寻') : t('搜寻队友')}<//>` : null}
    <span class=${on ? 't-mint' : facts.othersReady ? 't-lo' : 't-orange'}>${hint}</span>
    <span class="searchbar__queue t-lo"><${Icon} name="users" />${on
      // the server counts this room too while it is ready
      ? t('另有 {n} 名博士在搜寻', { n: queuedOthers(searching, room.difficulty, facts.groupReady ? facts.humans.length : 0) })
      : t('此难度有 {n} 名博士正在搜寻', { n: queuedOthers(searching, room.difficulty) })}</span>
  </section>`;
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
