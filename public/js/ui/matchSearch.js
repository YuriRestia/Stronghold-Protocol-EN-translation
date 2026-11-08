// 搜寻队友 UI (DESIGN §90): the room screen's search strip and status line, the 搜寻成功! toast, and the lobby's
// update announcement (shown until closed; one per release).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { MAX_SEATS } from '../../../shared/constants.js';
import { html, Button, Icon, Tooltip } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { serverNow, loadPref, savePref } from '../store.js';
import { t, tc, N_ } from '../../../shared/i18n.js';

// A new key per announcement, so everyone who closed the earlier one ('news.0.3.0') sees it again.
export const UPDATE_NEWS_PREF = 'news.0.3.4';

/** The 0.3.4 announcement's emphasized lines, shown above the points in the highlight style (msgids). */
const UPDATE_HIGHLIGHTS = [
  N_('冻河、国度与塔露拉加入自选编队，特效还原原作'), // en: "Toska, Territoriya and Talulah join the Custom Squad, with original effects"
  N_('全新干员调配'), // en: "New Operator Loadout"
  N_('对局聊天'), // en: "Match chat"
  N_('大同盟：最多 8 名博士，两个小队'), // en: "Grand Alliance: up to 8 Doctors in two squads"
  N_('新增美国东部服务器'), // en: "New US East server"
];

/** The 0.3.4 announcement's points (msgids). */
const UPDATE_POINTS = [
  N_('新增个人头像'), // en: "Profile Icon added"
  N_('凛御银灰 S3 使用官方特效，20 多名干员的攻击动作与特效对齐'), // en: "Official effects for SilverAsh the Reignfrost's S3, and attack animations that match their effects for over 20 operators"
  N_('替换普通攻击的技能（如维娜·维多利亚 S1）现在会播放完整动作'), // en: "Skills that replace an attack, such as Vina Victoria's S1, now play their full animation"
  N_('新增 7 套时装，包括凛御银灰「雪覆伦城」与薇薇安娜「还愿礼」'), // en: "7 new outfits, including SilverAsh the Reignfrost's Snowfall Over Londinium and Viviana's Votive Offering"
  N_('修复薇薇安娜的特效'), // en: "Fixed Viviana VFX"
  N_('技能施放音效现在跟随所装备的技能'), // en: "Skill cast sounds now follow the skill you equip"
  N_('人机更聪明：围绕一个主盟约构筑，针对最终攻势的领袖布阵，并选择对全队有利的策略'), // en: "Smarter bots: they build around one main Alliance, plan the Final Assault around its Leader and pick Strategies that help the whole team"
];

// '0.3.4 更新' — en: "Update 0.3.4"
export function UpdateNews() {
  const [hidden, setHidden] = useState(() => loadPref(UPDATE_NEWS_PREF, false) === true);
  if (hidden) return null;
  const dismiss = () => { savePref(UPDATE_NEWS_PREF, true); setHidden(true); };
  return html`<aside class="search-news brackets" role="note" aria-label=${t('0.3.4 更新')}>
    <div class="search-news__head">
      <${Icon} name="info" />
      <span class="search-news__tag">NEW</span>
      <span class="search-news__title">${t('0.3.4 更新')}</span>
      <${Button} variant="ghost" size="sm" square=${true} icon="close" class="search-news__close" onClick=${dismiss} aria-label=${t('关闭提示')} title=${t('关闭提示')} />
    </div>
    <div class="search-news__body" tabindex="0">
      <div class="search-news__highlight">
        ${UPDATE_HIGHLIGHTS.map((h) => html`<p key=${h}>${t(h)}</p>`)}
      </div>
      <ul class="search-news__list">
        ${UPDATE_POINTS.map((p) => html`<li key=${p}>${t(p)}</li>`)}
      </ul>
    </div>
  </aside>`;
}

/** m:ss since `since` (server time). */
export function searchClock(since, now = serverNow()) {
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** The host's 搜寻队友 switch, on by default (people should play with people): on, the big button searches. */
export const FIND_MATES_PREF = 'room.findMates';

/** (fork) A Grand Alliance's switch, remembered apart: on by default whatever a normal room's says (DESIGN §90.4). */
export const FIND_MATES_LARGE_PREF = 'room.findMatesLarge';

/** @param {boolean} [large] a Grand Alliance @returns {[boolean, (on: boolean) => void]} */
export function useFindMates(large = false) {
  const key = large ? FIND_MATES_LARGE_PREF : FIND_MATES_PREF;
  const [state, setState] = useState(() => ({ key, on: loadPref(key, true) !== false }));
  // the room became (or stopped being) a Grand Alliance: that one's pref
  const cur = state.key === key ? state : { key, on: loadPref(key, true) !== false };
  if (cur !== state) setState(cur);
  return [cur.on, (v) => { savePref(key, !!v); setState({ key, on: !!v }); }];
}

/**
 * A room that can search at all: co-op, seen from a player seat — and (fork) no gameplay plugins and no test room: such a
 * room is joined by its code only (room.state.content.vanilla false / test; the server refuses room.search for them too).
 * (fork) A room of any version searches among rooms of its version, and a Grand Alliance (locked or not) among Grand
 * Alliances and queued Doctors who opted in (server/matchmaker.js).
 */
function searchableRoom(room, facts) {
  return room.mode !== 'solo' && !facts.spectating && room.content?.vanilla !== false && room.test !== true;
}

/** The switch applies: a room that can search, with a free seat (a Grand Alliance has 8). */
export function canFindMates(room, facts) {
  return searchableRoom(room, facts) && facts.occupied.length < (room.capacity > MAX_SEATS ? room.capacity : MAX_SEATS);
}

/**
 * The host's 搜寻队友 switch, right above the big button (it turns 开始模拟 into 搜寻队友, room.js). Its label and 开启 /
 * 关闭 are all it shows, so the room's centre stays clear; what the state means is its tooltip. No queue size: an
 * empty-looking queue keeps people out of it.
 * @param {{ room: any, facts: any, findMates: boolean, setFindMates: (on: boolean) => void }} props
 */
export function SearchBar({ room, facts, findMates, setFindMates }) {
  if (!facts.isHost || !searchableRoom(room, facts)) return null;
  // a full room has no use for the switch but keeps its place, so filling the last seat does not stretch the seat cards
  if (!canFindMates(room, facts)) {
    return html`<div class="searchbar__switch searchbar__switch--gap" aria-hidden="true">
      <span class="searchbar__track"></span><${Icon} name="search" /><span class="searchbar__label">${t('搜寻队友')}</span>
      <b class="searchbar__state">${tc('toggle', '开启')}</b>
    </div>`;
  }
  const on = !!room.searching;
  const armed = on || findMates;
  // en: "Stop searching to turn this off" / "Off: you can start the simulation right away"
  const why = on ? t('停止搜寻后才能关闭') : !findMates ? t('关闭后可直接开始模拟')
    : facts.othersReady ? null : t('所有博士准备就绪后才能搜寻队友');
  return html`<button type="button" class=${`searchbar__switch${armed ? ' is-on' : ''}`} role="switch" aria-checked=${armed ? 'true' : 'false'}
      aria-label=${t('搜寻队友')} disabled=${on} title=${why} onClick=${() => setFindMates(!findMates)}>
    <span class="searchbar__track" aria-hidden="true"><i></i></span>
    <${Icon} name="search" /><span class="searchbar__label">${t('搜寻队友')}</span>
    <b class="searchbar__state">${armed ? tc('toggle', '开启') : tc('toggle', '关闭')}</b>
  </button>`;
}

/** The host's big button while the switch is on: 搜寻队友 / 停止搜寻 (room.search), in the look of 开始模拟 (`Go`: room.js GoButton). */
export function SearchButton({ room, facts, busy, online, run, Go }) {
  const on = !!room.searching;
  const toggle = () => run('search', async () => {
    await net.request('room.search', { on: !on });
    if (on) toast(t('取消搜寻成功'), 'info');
  });
  return html`<${Tooltip} text=${on || facts.othersReady ? null : t('仍有博士未准备就绪')}>
    <${Go} label=${on ? t('停止搜寻') : t('搜寻队友')} icon=${on ? 'close' : 'search'} tone=${on ? 'stop' : null} loading=${busy === 'search'}
      disabled=${!online || (!on && !facts.othersReady)} onClick=${toggle} />
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
  return html`<span class="t-mint" title=${t('同盟满 4 人后将自动开始模拟')}><${Icon} name="search" />${t('搜寻中 · {time}', { time: searchClock(since) })}</span>`;
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
