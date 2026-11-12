// ui/largeRooms.js — (fork) Grand Alliance (大同盟, shared/largeRoom.js, DESIGN §91): the full-screen room browser of the
// open 8-seat rooms of this server and, with regions, of the servers it is linked to (server/peerLink.js; each card names
// its server and that server's ping; a key names its server, so Join reaches it — public/js/regions.js join), reached from Team Simulation (同盟模拟), the password prompt of a private room (公开 / 私密:
// the server's `locked`), and PrivacyFields, the 公开 / 私密 choice with the password field (the create screen and the
// room's access button). While the browser is open the page watches the list (rooms.watch on); the server sends
// rooms.list on every change. Matchmaking fills these rooms too when their host searches (DESIGN §90.4).
// One for All (一策同心, a Grand Alliance strategy mode: one secret room-wide strategy vote): StrategySwitch (the create
// screen and the room bar), OneForAllTag (the room title and the browser card) and the browser's filter chip.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { DIFFICULTY_NAMES } from '../../../shared/constants.js';
import { ROOM_PASSWORD_RE, SQUAD_SEATS } from '../../../shared/largeRoom.js';
import { html, Button, Icon, Spinner, DifficultyIcon, promptDialog } from './components.js';
import { net, regions } from '../net.js';
import { useStore } from '../store.js';
import { regionLabel } from './regionNames.js';
import { t, N_ } from '../../../shared/i18n.js';

/** A ping test of every server while the browser is open, this often (the server picker's pace, ui/regionPicker.js). */
const REMEASURE_MS = 10_000;
const REGION_ID_RE = /^[a-z][a-z0-9-]{0,15}$/;

/** Keep only well-formed rows of a rooms.list frame. @param {any} msg */
export function roomRows(msg) {
  const rows = Array.isArray(msg?.rooms) ? msg.rooms : [];
  return rows.filter((r) => r && typeof r.code === 'string' && Number.isInteger(r.seats) && Number.isInteger(r.capacity))
    .map((r) => ({
      code: r.code, host: typeof r.host === 'string' ? r.host : '', seats: r.seats, capacity: r.capacity, difficulty: r.difficulty,
      squads: Array.isArray(r.squads) && r.squads.length === 2 ? r.squads.map((n) => (Number.isInteger(n) ? n : 0)) : [r.seats, 0],
      locked: r.locked === true,
      oneForAll: r.oneForAll === true,
      // (fork) the server the room is on (server/regions.js id); null without regions
      region: typeof r.region === 'string' && REGION_ID_RE.test(r.region) ? r.region : null,
    }));
}

/** The same tiers as PingPill. @param {number | undefined} ms */
const tierOf = (ms) => (!Number.isFinite(ms) ? 'off' : ms < 60 ? 'low' : ms < 200 ? 'medium' : 'high');

/**
 * A card's server: its name and ping — the last ping test's, else the live socket's for the server this page is on; no
 * ping shown while none is known (no ping test yet, or the operator has not turned on SP_REGION_AUTO).
 * @param {{ id: string, here: boolean, ms: number | undefined }} p
 */
function RegionTag({ id, here, ms }) {
  // msgid 当前 — en: "Current" (the server picker's word for the server this page is on)
  return html`<span class=${`rbr-card__region${here ? ' is-here' : ''}`} data-testid="room-region" data-region=${id}
      title=${here ? `${regionLabel(id)} · ${t('当前')}` : regionLabel(id)}>
    <${Icon} name="signal" /><span class="rbr-card__region-name">${regionLabel(id)}</span>
    ${Number.isFinite(ms) ? html`<span class=${`rbr-card__region-ms num ping--${tierOf(ms)}`}>${Math.min(9999, Math.round(ms))}<small>ms</small></span>` : null}
  </span>`;
}

/**
 * (fork) A Grand Alliance's access: 公开 (en "Public") or 私密 (en "Private", the server's `locked`), and a private room's
 * 4-letter password. Controlled: `onPw` gets the letters in upper case. msgids — 房间权限 en: "Room access"; 密码 en:
 * "Password"; 4 个字母。设为私密后，加入房间（包括邀请链接）需要输入密码。 en: "4 letters. Once private, joining the room
 * (invite links too) needs the password."
 * @param {{ priv: boolean, pw: string, onPriv: (on: boolean) => void, onPw: (pw: string) => void, onEnter?: (() => void) | null,
 *   focus?: boolean }} p
 */
export function PrivacyFields({ priv, pw, onPriv, onPw, onEnter = null, focus = false }) {
  const clean = (v) => v.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 4);
  const opt = (on, icon, label, id) => html`<button type="button" role="radio" aria-checked=${priv === on ? 'true' : 'false'}
      class=${`privacy__opt${priv === on ? ' is-on' : ''}`} data-testid=${id} onClick=${() => onPriv(on)}><${Icon} name=${icon} />${label}</button>`;
  return html`<div class="privacy">
    <div class="privacy__seg" role="radiogroup" aria-label=${t('房间权限')}>
      ${opt(false, 'users', t('公开'), 'privacy-public')}${opt(true, 'lock', t('私密'), 'privacy-private')}
    </div>
    ${priv ? html`<label class="privacy__pw"><span>${t('密码')}</span>
        <input class="num" data-testid="privacy-password" value=${pw} maxLength=${4} placeholder="ABCD" autoComplete="off" spellCheck=${false}
          ref=${(el) => { if (focus && el && !el.dataset.f) { el.dataset.f = '1'; setTimeout(() => el.focus(), 40); } }}
          onInput=${(e) => onPw(clean(e.currentTarget.value))} onKeyDown=${(e) => { if (e.key === 'Enter' && onEnter) { e.preventDefault(); onEnter(); } }} /></label>
      <small class="privacy__hint">${t('4 个字母。设为私密后，加入房间（包括邀请链接）需要输入密码。')}</small>` : null}
  </div>`;
}

/** The rows a filter keeps: 'all', 'open' (公开), 'locked' (私密) or 'oneForAll' (一策同心). */
export function filterRows(rows, filter) {
  return filter === 'open' ? rows.filter((r) => !r.locked) : filter === 'locked' ? rows.filter((r) => r.locked)
    : filter === 'oneForAll' ? rows.filter((r) => r.oneForAll) : rows;
}

/** The One for All rule in one line: the switch's tooltip and the room browser's note. */
// en: "One for All: every Doctor votes for a strategy at once, in secret, and the most-voted one goes to everyone."
const ONE_FOR_ALL_RULE = N_('一策同心：所有博士同时秘密投票选择策略，得票最多的策略由全体使用。');

/** (fork) The ONE FOR ALL tag: beside a One for All room's 大同盟 title and on its room browser card. */
export function OneForAllTag({ class: cls = '' }) {
  // 一策同心 en: "One for All"
  return html`<span class=${`ofa-tag${cls ? ` ${cls}` : ''}`} data-testid="one-for-all-tag" title=${t(ONE_FOR_ALL_RULE)}>${t('一策同心')}</span>`;
}

/**
 * (fork) A Grand Alliance's strategy mode, 策略：自由选择 | 一策同心 (en "Strategy: Free pick | One for All"): the create
 * screen (PrivacyFields' neighbour) and the room bar (screens/room.js, room.setOneForAll). `editable` false: a read-only
 * label of the current one (everyone but the host). msgid 自由选择 en: "Free pick".
 * @param {{ on: boolean, onPick?: (on: boolean) => void, editable?: boolean, busy?: boolean, class?: string }} p
 */
export function StrategySwitch({ on, onPick = null, editable = true, busy = false, class: cls = '' }) {
  const box = `ofa-switch${on ? ' is-ofa' : ''}${editable ? '' : ' ofa-switch--ro'}${cls ? ` ${cls}` : ''}`;
  if (!editable) {
    return html`<div class=${box} data-testid="strategy-switch" title=${t(ONE_FOR_ALL_RULE)}>
      <span class="ofa-switch__k">${t('策略')}</span><b>${on ? t('一策同心') : t('自由选择')}</b>
    </div>`;
  }
  const opt = (v, label, id) => html`<button type="button" role="radio" aria-checked=${on === v ? 'true' : 'false'} data-testid=${id}
      class=${`ofa-switch__opt${on === v ? ' is-on' : ''}`} disabled=${!!busy} onClick=${() => { if (!busy && on !== v) onPick?.(v); }}>${label}</button>`;
  return html`<div class=${box} data-testid="strategy-switch" title=${t(ONE_FOR_ALL_RULE)}>
    <span class="ofa-switch__k">${t('策略')}</span>
    <div class="ofa-switch__seg" role="radiogroup" aria-label=${t('策略')}>
      ${opt(false, t('自由选择'), 'strategy-free')}${opt(true, t('一策同心'), 'strategy-one-for-all')}
    </div>
  </div>`;
}

/**
 * Ask for a locked room's password: its 4 letters in upper case, or null when the player cancels.
 * @param {string} code @param {boolean} [retry] the last one was wrong
 */
export function askRoomPassword(code, retry = false) {
  return promptDialog({
    title: t('私密房间'), // en: "Private Room"
    micro: 'LOCKED',
    text: t('房间 {code} 为私密房间。请向房主索取 4 个字母的密码。', { code }), // en: "Room {code} is private. Ask the host for its 4-letter password."
    error: retry ? t('密码不正确，请重试') : '', // en: "Wrong password, try again"
    placeholder: 'ABCD', maxLength: 4, pattern: ROOM_PASSWORD_RE, transform: (v) => v.replace(/[^A-Za-z]/g, '').toUpperCase(),
    okText: t('加入'),
  });
}

/** A squad's 4 seats as pips: filled ones lit. */
function SquadPips({ name, filled, tone }) {
  // msgid {n}/{max} 人 — en: "{n}/{max} Doctors"
  return html`<div class=${`rbr-squad rbr-squad--${tone}`}>
    <span class="rbr-squad__k">${name}</span>
    <span class="rbr-squad__pips" aria-label=${t('{n}/{max} 人', { n: filled, max: SQUAD_SEATS })}>
      ${Array.from({ length: SQUAD_SEATS }, (_, i) => html`<i key=${i} class=${i < filled ? 'is-on' : ''}></i>`)}
    </span>
  </div>`;
}

/**
 * The room browser, full screen.
 * msgids — 大同盟 en: "Grand Alliance"; 创建大同盟 en: "Create Grand Alliance"; 全部 en: "All"; 开放 en: "Open";
 * 公开 en: "Public"; 私密 en: "Private"; 加入 en: "Join"; 房间列表 en: "Room Browser"; 筛选 en: "Filter";
 * 最多 8 名真人博士… en: "Up to 8 human Doctors in two squads: seats 1–4 are Squad A, 5–8 Squad B. Each squad drafts on its own,
 * everyone fights over one operator pool, and the whole room faces one shared Enemy Leader at the end.";
 * 暂时没有开放的大同盟房间… en: "No open Grand Alliance rooms right now. Create one and send the key to your friends.";
 * 没有符合条件的房间 en: "No rooms match this filter"
 * @param {{ onClose: () => void, onCreate: () => void, onJoin: (code: string) => void, busy: string | null, online: boolean }} p
 */
export function RoomBrowser({ onClose, onCreate, onJoin, busy, online }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('all');
  const region = useStore((s) => s.region);
  const livePing = useStore((s) => s.connection?.ping);
  const multi = !!(region?.enabled && region.list?.length > 1);
  // (fork) the servers' pings for the cards' server tags, measured while the browser is open
  useEffect(() => {
    if (!multi) return undefined;
    void regions.measure();
    const timer = setInterval(() => { void regions.measure(); }, REMEASURE_MS);
    return () => clearInterval(timer);
  }, [multi]);
  const here = multi ? region.current : null;
  const rtts = region?.rtts || {};
  const msOf = (id) => (id in rtts && Number.isFinite(rtts[id]) ? rtts[id] : id === here && online && Number.isFinite(livePing) ? livePing : rtts[id]);
  useEffect(() => {
    const off = net.on('rooms.list', (msg) => setRows(roomRows(msg)));
    net.request('rooms.watch', { on: true }).catch(() => setRows([]));
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', onKey);
    return () => { off?.(); removeEventListener('keydown', onKey); net.request('rooms.watch', { on: false }).catch(() => {}); };
  }, []);
  const shown = rows ? filterRows(rows, filter) : null;
  const count = (f) => (rows ? filterRows(rows, f).length : 0);
  return html`<div class="rbr" role="dialog" aria-modal="true" aria-label=${t('大同盟')} data-testid="room-browser">
    <div class="rbr__bg" aria-hidden="true"></div>
    <header class="rbr__top">
      <button type="button" class="rbr__back" onClick=${onClose} title=${t('返回')} aria-label=${t('返回')}><${Icon} name="chevronLeft" /></button>
      <div class="rbr__title">
        <h2>${t('大同盟')}</h2>
        <span class="rbr__micro">GRAND ALLIANCE · ${t('房间列表')}</span>
      </div>
      <${Button} icon="plus" class="rbr__create" data-testid="grand-create" loading=${busy === 'create'} disabled=${!online} onClick=${onCreate}>${t('创建大同盟')}<//>
    </header>
    <p class="rbr__intro">${t('最多 8 名真人博士，分为两个小队：1–4 号座位为小队 A，5–8 号为小队 B。每个小队各自轮选，全房间争夺同一个干员池，最终一起对抗同一个敌方领袖。')}</p>
    <p class="rbr__intro rbr__intro--ofa">${t(ONE_FOR_ALL_RULE)}</p>
    <nav class="rbr__filters" aria-label=${t('筛选')}>
      ${[['all', t('全部')], ['open', t('公开')], ['locked', t('私密')], ['oneForAll', t('一策同心')]].map(([id, label]) => html`<button type="button" key=${id}
        class=${`rbr__chip${filter === id ? ' is-on' : ''}`} data-testid=${`grand-filter-${id}`} aria-pressed=${filter === id ? 'true' : 'false'} onClick=${() => setFilter(id)}>
        ${id === 'locked' ? html`<${Icon} name="lock" />` : null}${label}<span class="num">${count(id)}</span></button>`)}
    </nav>
    <main class="rbr__body">
      ${shown == null ? html`<div class="rbr__empty"><${Spinner} /></div>`
        : !rows.length ? html`<div class="rbr__empty" data-testid="grand-empty"><p>${t('暂时没有开放的大同盟房间。创建一个，并把密钥发给你的朋友吧。')}</p>
            <${Button} icon="plus" loading=${busy === 'create'} disabled=${!online} onClick=${onCreate}>${t('创建大同盟')}<//></div>`
        : !shown.length ? html`<div class="rbr__empty"><p>${t('没有符合条件的房间')}</p></div>`
        : html`<ul class="rbr__grid" data-testid="grand-list">
          ${shown.map((r) => html`<li key=${r.code} class=${`rbr-card${r.locked ? ' is-locked' : ''}${r.oneForAll ? ' is-ofa' : ''}`}>
            <div class="rbr-card__head">
              <span class="rbr-card__host"><${Icon} name="crown" /><b>${r.host || t('博士')}</b></span>
              <span class="rbr-card__tags">${r.oneForAll ? html`<${OneForAllTag} class="rbr-card__ofa" />` : null}
                ${r.locked ? html`<span class="rbr-card__lock" title=${t('私密')}><${Icon} name="lock" />${t('私密')}</span>` : null}</span>
            </div>
            <div class="rbr-card__diff"><${DifficultyIcon} difficulty=${r.difficulty} />${DIFFICULTY_NAMES[r.difficulty] ? t(DIFFICULTY_NAMES[r.difficulty]) : ''}
              ${multi && r.region ? html`<${RegionTag} id=${r.region} here=${r.region === here} ms=${msOf(r.region)} />` : null}</div>
            <div class="rbr-card__squads">
              <${SquadPips} name="A" filled=${r.squads[0]} tone="a" />
              <${SquadPips} name="B" filled=${r.squads[1]} tone="b" />
            </div>
            <div class="rbr-card__foot">
              <span class="rbr-card__seats num">${r.seats}<small>/${r.capacity}</small></span>
              <span class="rbr-card__code num">${r.code}</span>
              <${Button} size="sm" icon=${r.locked ? 'lock' : null} loading=${busy === 'join'} disabled=${!online} onClick=${() => onJoin(r.code)}>${t('加入')}<//>
            </div>
          </li>`)}
        </ul>`}
    </main>
  </div>`;
}
