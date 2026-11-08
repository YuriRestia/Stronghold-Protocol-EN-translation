// (fork) The profile icon picker (ui/avatars.js), two tabs:
//   干员 — the operators a seat card may show (ui/seatArt.js cardOperators: search by name, rarity tabs), each worn in this
//          browser's outfit like the seat card, after 'Assistant Operator' (ASSISTANT_AVATAR: the room card's operator,
//          the official 名片形象 icon);
//   头像 — the official icons, grouped as the official 头像 page groups them (display_meta_table avatarTypeData, official
//          order); absent while this server has not extracted their art.
// The current pick is marked; a tap picks and closes. Opened from the lobby's profile chip (screens/lobby.js) and from
// one's own seat card in a room (screens/room.js). The name line shows the icon under the pointer / focus, else the
// current one; an English name of our own (an icon the EN client does not have yet, tools/i18n/fallback-avatars-en.json)
// carries the 非官方译名 tag.

import { useMemo, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon, Modal, TextField } from './components.js';
import { data, useData } from '../data.js';
import { useStore } from '../store.js';
import { t, getLang } from '../../../shared/i18n.js';
import { ASSISTANT_AVATAR, isOperatorAvatar, knownAvatar } from '../../../shared/avatars.js';
import { chessAvatarUrl } from './assetUrls.js';
import { CARD_KEY, cardStore, cardOperators } from './seatArt.js';
import { SKINS_KEY, skinsStore, ownerSkin } from './skins.js';
import { AVATAR_KEY, avatarStore, assistantCharId, pickerGroups, setAvatar } from './avatars.js';

/** Whether this server can offer the picker: the operator list (every server) or the official icons' art. Hook. */
export function useAvatarPickerReady() {
  useData('avatars', 'local', 'chess', 'backups');
  const chess = data.get('chess');
  const catalog = data.get('avatars');
  const local = data.get('local');
  return useMemo(() => !!chess || pickerGroups(catalog).length > 0, [chess, catalog, local]);
}

/** @param {{ onClose: () => void }} props */
export function AvatarPicker({ onClose }) {
  useData('avatars', 'local', 'assets', 'chess', 'backups');
  const catalog = data.get('avatars');
  const local = data.get('local');
  const assets = data.get('assets');
  const chess = data.get('chess');
  const backups = data.get('backups');
  const mine = useStore((s) => s[AVATAR_KEY], Object.is, avatarStore);
  const card = useStore((s) => s[CARD_KEY], Object.is, cardStore);
  const localSkins = useStore((s) => s[SKINS_KEY], Object.is, skinsStore);
  const myId = useStore((s) => s.me?.playerId ?? null);
  const groups = useMemo(() => pickerGroups(catalog), [catalog, local]);
  const ops = useMemo(() => cardOperators(data.list('chess'), backups), [chess, backups]);
  const opIcons = useMemo(() => ops.map((c) => ({ id: c.charId, name: String(c.name || c.charId), rarity: c.rarity ?? 0,
    appellation: c.appellation, src: chessAvatarUrl(assets, c, { skin: ownerSkin(c.charId, { localSkins }) }) })), [ops, assets, localSkins]);
  const assistantId = assistantCharId({ card, playerId: myId, list: ops });
  const assistant = { id: ASSISTANT_AVATAR, name: t('助理干员') /* en: "Assistant Operator" */,
    src: assistantId ? chessAvatarUrl(assets, { charId: assistantId }, { skin: ownerSkin(assistantId, { localSkins }) }) : null };
  const current = mine === ASSISTANT_AVATAR || isOperatorAvatar(mine) || knownAvatar(mine, catalog) ? mine : (knownAvatar(catalog?.defaultId, catalog) || '');
  const [tab, setTab] = useState(() => (!groups.length || current === ASSISTANT_AVATAR || isOperatorAvatar(current) ? 'ops' : 'icons'));
  const [q, setQ] = useState('');
  const [star, setStar] = useState(0);
  const [hover, setHover] = useState(null);
  const stars = useMemo(() => [...new Set(opIcons.map((c) => c.rarity).filter((r) => r > 0))].sort((a, b) => b - a), [opIcons]);
  const needle = q.trim().toLowerCase();
  const shownOps = opIcons.filter((c) => (!star || c.rarity === star)
    && (!needle || [c.name, c.appellation].some((v) => String(v || '').toLowerCase().includes(needle))));
  const byId = useMemo(() => {
    const m = new Map(groups.flatMap((g) => g.icons.map((i) => [i.id, { ...i, group: g.name }])));
    for (const c of opIcons) m.set(c.id, { ...c, group: t('干员') });
    return m;
  }, [groups, opIcons]);
  const shown = hover === ASSISTANT_AVATAR || (!hover && current === ASSISTANT_AVATAR)
    ? { ...assistant, group: t('干员') } : byId.get(hover || current) || null;
  // our own English names only exist in the English pack; every other language shows an official or the Chinese name
  const ownName = shown?.unofficial && getLang() === 'en';
  const pick = (id) => { setAvatar(id); onClose(); };
  const tile = (i, { name = false } = {}) => {
    const on = i.id === current;
    return html`<button key=${i.id} type="button" role="radio" aria-checked=${on ? 'true' : 'false'} aria-label=${i.name}
        class=${`avpick__icon${on ? ' is-on' : ''}${name ? ' has-name' : ''}`} data-avatar=${i.id} data-autofocus=${on ? '' : undefined} title=${i.name}
        onPointerEnter=${() => setHover(i.id)} onFocus=${() => setHover(i.id)} onClick=${() => pick(i.id)}>
      <span class="avpick__pic">${i.src ? html`<img src=${i.src} alt="" loading="lazy" decoding="async" draggable=${false} />`
        : html`<${Icon} name="user" />`}</span>
      ${name ? html`<span class="avpick__label">${i.name}</span>` : null}
      ${on ? html`<span class="avpick__tick" aria-hidden="true"><${Icon} name="check" /></span>` : null}
    </button>`;
  };
  return html`<${Modal} open=${true} class="avpick" micro="PROFILE ICON" title=${t('个人头像') /* en: "Profile Icon" */}
      width="min(12rem, 96vw)" onClose=${onClose} actions=${html`<${Button} variant="ghost" onClick=${onClose}>${t('关闭')}<//>`}>
    <div class="avpick__now" aria-live="polite">
      ${shown?.src ? html`<img class="avpick__big" src=${shown.src} alt="" draggable=${false} />` : html`<span class="avpick__big"></span>`}
      <span class="avpick__what">
        <b class="avpick__name">${shown?.name || ''}</b>
        <small class="avpick__group">${shown?.group || ''}${(hover || current) === current && shown ? html`<span class="avpick__cur">${t('当前')}</span>` : null}</small>
        ${ownName ? html`<span class="avpick__unofficial" title=${t('该头像尚未在国际服推出，名称为非官方翻译') /* en: "This icon is not on the Global server yet: the name is an unofficial translation" */}>
          ${t('非官方译名') /* en: "Unofficial translation" */}</span>` : null}
      </span>
      <div class="avpick__tabs" role="tablist">
        <button type="button" role="tab" aria-selected=${tab === 'ops' ? 'true' : 'false'} class=${tab === 'ops' ? 'is-on' : ''}
          data-testid="avatar-tab-ops" onClick=${() => setTab('ops')}>${t('干员头像') /* en: "Operators" */}</button>
        ${groups.length ? html`<button type="button" role="tab" aria-selected=${tab === 'icons' ? 'true' : 'false'} class=${tab === 'icons' ? 'is-on' : ''}
          data-testid="avatar-tab-icons" onClick=${() => setTab('icons')}>${t('头像图标') /* en: "Icons" */}</button>` : null}
      </div>
    </div>
    ${tab === 'ops' ? html`<div class="avpick__bar">
      <${TextField} class="avpick__search" size="sm" icon="search" value=${q} onInput=${setQ} placeholder=${t('搜索干员')} />
      <div class="avpick__stars" role="radiogroup" aria-label=${t('稀有度')}>
        ${[0, ...stars].map((v) => html`<button key=${v} type="button" role="radio" aria-checked=${star === v ? 'true' : 'false'}
          class=${star === v ? 'is-on' : ''} onClick=${() => setStar(v)}>${v ? html`<span class="num">${v}★</span>` : t('全部')}</button>`)}
      </div>
    </div>` : null}
    <div key=${tab} class="avpick__scroll" data-testid="avatar-picker" onPointerLeave=${() => setHover(null)}>
      ${tab === 'ops'
        ? html`<div class="avpick__grid avpick__grid--ops" role="radiogroup" aria-label=${t('干员')}>
            ${!needle && !star ? tile(assistant, { name: true }) : null}
            ${shownOps.map((c) => tile(c, { name: true }))}
          </div>
          ${shownOps.length ? null : html`<p class="avpick__empty">${t('没有符合条件的干员')}</p>`}`
        : groups.map((g) => html`<section key=${g.type} class="avpick__group-box" aria-label=${g.name}>
            <h3 class="avpick__head">${g.name}<span class="num">${g.icons.length}</span></h3>
            <div class="avpick__grid" role="radiogroup" aria-label=${g.name}>${g.icons.map((i) => tile(i))}</div>
          </section>`)}
    </div>
    <p class="avpick__note"><${Icon} name="info" />${t('选择后，同盟里的博士都会看到这个头像') /* en: "Once chosen, every Doctor in your Alliance sees this icon" */}</p>
  <//>`;
}
