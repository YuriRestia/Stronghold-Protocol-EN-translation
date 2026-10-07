// Players online and the 搜寻队友 queue sizes (sys.online, server/presence.js).

import { html, Icon } from './components.js';
import { createStore, useStore, shallowEqual } from '../store.js';
import { net } from '../net.js';
import { t } from '../../../shared/i18n.js';

/** { online: number | null, searching: { [difficulty]: number } } */
export const presence = createStore({ online: null, searching: {} });

export function installPresence() {
  net.on('sys.online', (msg) => {
    if (!Number.isFinite(msg.online)) return;
    presence.set({ online: msg.online, searching: msg.searching && typeof msg.searching === 'object' ? msg.searching : {} });
  });
  // a stale count is worse than none once the socket is gone (a new socket gets the counts again; the hello
  // keeps the same socket, so handshaking keeps them)
  net.on('status', (snap) => {
    if (['idle', 'connecting', 'reconnecting', 'closed'].includes(snap.status)) presence.set({ online: null, searching: {} });
  });
}

/** Humans in the 搜寻队友 queue at `difficulty`, minus `own` (the viewer's room when it is counted). */
export function queuedOthers(searching, difficulty, own = 0) {
  return Math.max(0, (Number(searching?.[difficulty]) || 0) - own);
}

export function OnlinePill({ class: cls }) {
  const online = useStore((s) => s.online, Object.is, presence);
  if (online == null) return null;
  return html`<span class=${`ping ping--low online-pill${cls ? ` ${cls}` : ''}`} title=${t('在线博士 {n}', { n: online })}>
    <${Icon} name="users" class="ping__icon" />
    <span class="ping__value">${online}</span><span class="ping__unit">${t('在线')}</span>
  </span>`;
}

/** The searching map, for components that need it. */
export function useSearching() {
  return useStore((s) => s.searching, shallowEqual, presence);
}
