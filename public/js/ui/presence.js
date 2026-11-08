// Players online and the 搜寻队友 queue sizes (sys.online, server/presence.js). (fork) With several servers linked the
// count is their sum, and the pill's tooltip lists each server's own (sys.online `regions`; hover, keyboard focus or a tap).

import { html, Icon, Tooltip } from './components.js';
import { regionLabel } from './regionNames.js';
import { createStore, useStore, shallowEqual } from '../store.js';
import { net } from '../net.js';
import { t } from '../../../shared/i18n.js';

/** { online: number | null, searching: { [difficulty]: number }, regions: { [region id]: number } | null } */
export const presence = createStore({ online: null, searching: {}, regions: null });

export function installPresence() {
  net.on('sys.online', (msg) => {
    if (!Number.isFinite(msg.online)) return;
    const regions = msg.regions && typeof msg.regions === 'object' && Object.keys(msg.regions).length > 1 ? msg.regions : null;
    presence.set({ online: msg.online, searching: msg.searching && typeof msg.searching === 'object' ? msg.searching : {}, regions });
  });
  // a stale count is worse than none once the socket is gone (a new socket gets the counts again; the hello
  // keeps the same socket, so handshaking keeps them)
  net.on('status', (snap) => {
    if (['idle', 'connecting', 'reconnecting', 'closed'].includes(snap.status)) presence.set({ online: null, searching: {}, regions: null });
  });
}

/** Humans in the 搜寻队友 queue at `difficulty`, minus `own` (the viewer's room when it is counted). */
export function queuedOthers(searching, difficulty, own = 0) {
  return Math.max(0, (Number(searching?.[difficulty]) || 0) - own);
}

export function OnlinePill({ class: cls }) {
  const online = useStore((s) => s.online, Object.is, presence);
  const byRegion = useStore((s) => s.regions, shallowEqual, presence);
  const region = useStore((s) => s.region);
  if (online == null) return null;
  const label = t('在线博士 {n}', { n: online }); // en: "{n} Doctors online"
  const pill = (title) => html`<span class=${`ping ping--low online-pill${cls ? ` ${cls}` : ''}`} title=${title}
      tabIndex=${title ? undefined : 0} aria-label=${title ? undefined : label} data-testid="online-pill">
    <${Icon} name="users" class="ping__icon" />
    <span class="ping__value">${online}</span><span class="ping__unit">${t('在线')}</span>
  </span>`;
  if (!byRegion) return pill(label);
  // the operator's order (SP_REGIONS), then any region this page does not know yet
  const known = Array.isArray(region?.list) ? region.list.filter((id) => id in byRegion) : [];
  const ids = [...known, ...Object.keys(byRegion).filter((id) => !known.includes(id)).sort()];
  const here = region?.enabled ? region.current : null;
  const head = t('各服务器在线'); // en: "Online per server"
  const tip = html`<div class="online-tip" data-testid="online-tip">
    <div class="online-tip__head">${head}</div>
    ${ids.map((id) => html`<div key=${id} class=${`online-tip__row${id === here ? ' is-here' : ''}`}>
      <span class="online-tip__name">${regionLabel(id)}</span>
      <span class="online-tip__n">${byRegion[id]}</span>
    </div>`)}
  </div>`;
  return html`<${Tooltip} text=${tip} placement="bottom" tap=${true} class="online-pill-tt">${pill(null)}<//>`;
}

/** The searching map, for components that need it. */
export function useSearching() {
  return useStore((s) => s.searching, shallowEqual, presence);
}
