// 搜寻队友 (matchmaking, a remake feature; server/matchmaker.js): the room screen's search button, the searching status
// line and the "found teammates" toast. The host of a co-op room searches while every other Doctor is ready; searching
// rooms of the same difficulty merge whole and a full one starts by itself (room.state `searching` / `searchSince`).
// The lobby announces the feature once (SearchNews, dismissible).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { MAX_SEATS } from '../../../shared/constants.js';
import { html, Button, Icon } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { serverNow, loadPref, savePref } from '../store.js';
import { T } from '../i18n.js';

/** localStorage pref: the lobby's matchmaking announcement was dismissed. */
export const SEARCH_NEWS_PREF = 'news.matchSearch';

/** The lobby's "new: 搜寻队友" announcement (dismissible, remembered per browser; the same in both modes). */
export function SearchNews() {
  const [hidden, setHidden] = useState(() => loadPref(SEARCH_NEWS_PREF, false) === true);
  if (hidden) return null;
  const dismiss = () => { savePref(SEARCH_NEWS_PREF, true); setHidden(true); };
  return html`<aside class="search-news brackets" role="note" aria-label=${T('新功能：搜寻队友')}>
    <span class="search-news__icon" aria-hidden="true"><${Icon} name="search" /></span>
    <div class="search-news__text">
      <span class="search-news__head"><span class="search-news__tag">NEW</span>${T('新功能：搜寻队友')}</span>
      <p>${T('创建同盟后，无论同盟中有几名博士，创建者都可以点击「搜寻队友」，与其他正在搜寻的同盟合并补满空位，满 4 人后自动开始模拟。')}</p>
    </div>
    <${Button} variant="ghost" size="sm" square=${true} icon="close" class="search-news__close" onClick=${dismiss} aria-label=${T('关闭提示')} title=${T('关闭提示')} />
  </aside>`;
}

/** m:ss since `since` (server ms). */
export function searchClock(since, now = serverNow()) {
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/**
 * The host's 搜寻队友 strip above the room bar (co-op, not full; the bar has no room for a third big button): the
 * 搜寻队友 / 停止搜寻 button and what it does. Disabled while a pre-made Doctor is not ready (server: NOT_READY).
 * @param {{ room: any, facts: any, busy: any, online: boolean, run: (kind: string, fn: () => Promise<any>) => any }} props
 */
export function SearchBar({ room, facts, busy, online, run }) {
  if (room.mode === 'solo' || !facts.isHost || facts.spectating || facts.occupied.length >= MAX_SEATS) return null;
  const on = !!room.searching;
  const toggle = () => run('search', async () => {
    await net.request('room.search', { on: !on });
    if (on) toast(T('取消搜寻成功'), 'info');
  });
  const hint = on ? T('同盟满 4 人后将自动开始模拟')
    : facts.othersReady ? T('与其他正在搜寻的同盟合并，补满 {0} 个空位', facts.emptySeats) : T('所有博士准备就绪后才能搜寻队友');
  return html`<section class=${`searchbar${on ? ' is-on' : ''}`} aria-label=${T('搜寻队友')}>
    <${Button} variant=${on ? 'amber' : 'secondary'} size="md" icon=${on ? 'close' : 'search'} active=${on} loading=${busy === 'search'}
      disabled=${!online || (!on && !facts.othersReady)} onClick=${toggle}>${on ? T('停止搜寻') : T('搜寻队友')}<//>
    <span class=${on ? 't-mint' : facts.othersReady ? 't-lo' : 't-orange'}>${hint}</span>
  </section>`;
}

/** Status line while the room searches: elapsed time, or paused until everyone is ready. */
export function SearchStatus({ room, facts }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!room.searching) return undefined;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [room.searching]);
  if (!room.searching) return null;
  if (!facts.othersReady) return html`<span class="t-orange"><${Icon} name="hourglass" />${T('搜寻已暂停 · 等待所有博士准备就绪')}</span>`;
  const since = Number.isFinite(room.searchSince) ? room.searchSince : serverNow();
  return html`<span class="t-mint"><${Icon} name="search" />${T('搜寻中 · {0}', searchClock(since))}</span>`;
}

/**
 * Toast 搜寻成功! when the room grew by a merge: a new room code, or Doctors arriving ready while searching (a join by
 * code arrives not ready).
 * @param {any} room room.state payload (or null)
 * @param {any} myId
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
    if (moved || (before.searching && arrived)) toast(T('搜寻成功!'), 'success');
  }, [room, myId]);
}
