// 搜寻队友 UI (DESIGN §90): the room screen's search strip and status line, the 搜寻成功! toast, and the lobby's
// update announcement (shown until closed; one per release). (fork) The servers can replace the announcement without a
// release: the live news (sys.news, server/news.js, scripts/news.mjs) in the page's language, else its English, else
// the one built in below.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { MAX_SEATS } from '../../../shared/constants.js';
import { html, Button, Icon, Tooltip } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { serverNow, loadPref, savePref, useStore } from '../store.js';
import { t, tc, N_, getLang, langChain } from '../../../shared/i18n.js';
import { newsEntry } from '../../../shared/news.js';
import { RichText } from './gameComponents.js';

/** The built-in announcement's id. Closing a banner remembers its id (`news.<id>`), so a new id shows again to everyone
 * who closed the earlier one ('news.0.3.4-1'); the live news names its own id. */
export const UPDATE_NEWS_ID = '0.3.4-2';
export const UPDATE_NEWS_PREF = `news.${UPDATE_NEWS_ID}`;

/** The 0.3.4-2 announcement's emphasized lines (user wording and colours, 2026-11-12: the new line, then 0.3.4's), shown
 * above the points in the highlight style (msgids with the game's colour tags, ui/richText.js; sp.* are the fork's). */
const UPDATE_HIGHLIGHTS = [
  N_('离开的博士将<@sp.blood>永久退出</>，下一回合不再等待他们（断线不算离开）'), // en: "A Doctor who leaves is <@sp.blood>out for good</>, and the next round no longer waits for them (disconnecting is fine)"
  N_('<@sp.leaf>冻河</>、<@sp.leaf>国度</>与<@sp.leaf>塔露拉</>加入自选编队，特效还原原作'), // en: "<@sp.leaf>Toska</>, <@sp.leaf>Territoriya</> and <@sp.leaf>Talulah</> join the Custom Squad, with original effects"
  N_('全新干员调配'), // en: "New Operator Loadout"
  N_('对局聊天'), // en: "Match chat"
  N_('大同盟：最多 8 名博士，两个小队'), // en: "Grand Alliance: up to 8 Doctors in two squads"
  N_('新增美国东部服务器'), // en: "New US East server"
];

/** The 0.3.4-2 announcement's points (msgids): what is new since the 0.3.4 release, then 0.3.4's four main points. */
const UPDATE_POINTS = [
  N_('<@sp.leaf>房间界面加入聊天</>：座位下方显示聊天记录，每位博士的卡片上方弹出气泡'), // en: "<@sp.leaf>Chat in the room screen</>: a chat log under the seats and bubbles over each Doctor's card"
  N_('带有起手动画的技能现在会先完整播放动画再生效，与官方游戏一致'), // en: "Skills with a start animation now play it in full before they take effect, as in the official game"
  N_('每个技能都播放自己的官方音效，带专属战斗音效的时装现在也会使用它们'), // en: "Every skill plays its own official sounds, and outfits with their own battle sounds now use them"
  N_('更多官方特效：技能标记、持续伤害的命中与持续光效显示在正确的单位上'), // en: "More official effects: skill marks, damage-over-time hits and lasting glows show on the right units"
  N_('攻击慢的干员按自己的速度出手，攻击特效跟上攻击速度'), // en: "Slow attackers swing at their own speed, and attack effects keep pace with attack speed"
  N_('<@sp.leaf>蕾缪安</>、<@sp.leaf>烛煌</>、<@sp.leaf>塔露拉</>与<@sp.leaf>水月</>的特效和音效与官方一致'), // en: "<@sp.leaf>Lemuen</>, <@sp.leaf>Blaze the Igniting Spark</>, <@sp.leaf>Talulah</> and <@sp.leaf>Mizuki</> look and sound as in the official game"
  N_('新增个人头像'), // en: "Profile Icon added"
  N_('<@sp.leaf>凛御银灰</> S3 使用官方特效，20 多名干员的攻击动作与特效对齐'), // en: "Official effects for <@sp.leaf>SilverAsh the Reignfrost</>'s S3, and attack animations that match their effects for over 20 operators"
  N_('新增 7 套时装，包括<@sp.leaf>凛御银灰</>「雪覆伦城」与<@sp.leaf>薇薇安娜</>「还愿礼」'), // en: "7 new outfits, including <@sp.leaf>SilverAsh the Reignfrost</>'s Snowfall Over Londinium and <@sp.leaf>Viviana</>'s Votive Offering"
  N_('<@ba.kw>人机更聪明</>：围绕一个主盟约构筑，针对最终攻势的领袖布阵，并选择对全队有利的策略'), // en: "<@ba.kw>Smarter bots</>: they build around one main Alliance, plan the Final Assault around its Leader and pick Strategies that help the whole team"
];

/**
 * What the banner shows: the live news' entry for this page's language (its id, its lines as written, with the game's
 * colour tags), else the built-in announcement (msgids, translated here).
 * @param {ReturnType<typeof import('../../../shared/news.js').parseNews>} live
 * @param {string} [lang]
 */
export function updateNewsView(live, lang = getLang()) {
  const entry = newsEntry(live, [lang, ...langChain(lang)]);
  if (entry) return { id: live.id, title: entry.title, highlights: entry.highlights, points: entry.points, rich: true };
  // '0.3.4-2 更新' — en: "Update 0.3.4-2"; its lines carry colour tags, so they render as rich text like the live news
  return { id: UPDATE_NEWS_ID, title: t('0.3.4-2 更新'), highlights: UPDATE_HIGHLIGHTS.map((h) => t(h)), points: UPDATE_POINTS.map((p) => t(p)), rich: true };
}

export function UpdateNews() {
  const live = useStore((st) => st.liveNews);
  const view = updateNewsView(live);
  const pref = `news.${view.id}`;
  // closing remembers this id: the banner comes back only for a new one
  const [, setClosed] = useState(0);
  if (loadPref(pref, false) === true) return null;
  const dismiss = () => { savePref(pref, true); setClosed((n) => n + 1); };
  const line = (text) => (view.rich ? html`<${RichText} text=${text} />` : text);
  return html`<aside class="search-news brackets" role="note" aria-label=${view.title}>
    <div class="search-news__head">
      <${Icon} name="info" />
      <span class="search-news__tag">NEW</span>
      <span class="search-news__title">${view.rich ? line(view.title) : view.title}</span>
      <${Button} variant="ghost" size="sm" square=${true} icon="close" class="search-news__close" onClick=${dismiss} aria-label=${t('关闭提示')} title=${t('关闭提示')} />
    </div>
    <div class="search-news__body" tabindex="0">
      ${view.highlights.length ? html`<div class="search-news__highlight">
        ${view.highlights.map((h, i) => html`<p key=${i}>${line(h)}</p>`)}
      </div>` : null}
      ${view.points.length ? html`<ul class="search-news__list">
        ${view.points.map((p, i) => html`<li key=${i}>${line(p)}</li>`)}
      </ul>` : null}
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
  const why = on ? t('停止搜寻后才能关闭') : !findMates ? `${t('关闭后可直接开始模拟')}
${t('房间公开或搜寻队友后，不能再重刷本局。' /* en: "Once a room is public or uses Find Teammates, it has no stage setup reroll." */)}`
    : facts.othersReady ? t('房间公开或搜寻队友后，不能再重刷本局。') : t('所有博士准备就绪后才能搜寻队友');
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
  // (fork) before the search starts: rerolls stay off for this room from then on (server/lobby.js rerollLock)
  return html`<${Tooltip} text=${on ? null : facts.othersReady ? t('房间公开或搜寻队友后，不能再重刷本局。' /* en: "Once a room is public or uses Find Teammates, it has no stage setup reroll." */) : t('仍有博士未准备就绪')}>
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
