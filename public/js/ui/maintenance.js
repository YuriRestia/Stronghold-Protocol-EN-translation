// Planned maintenance bar: `sys.maintenance` (server/maintenance.js, set by the operator with scripts/maintenance.mjs)
// shows a bar at the top of every screen: a live countdown to the maintenance time on the server's clock (store.js
// serverNow, corrected from the ping samples), "restarts when the current matches end", "no new simulations" while the
// server is closed, the expected downtime, and the operator's message. The server's last frame before it stops
// (`stopping`) stays while the page reconnects ("back around 21:45"); the next welcome clears it (clearMaintenance),
// and a server still in maintenance sends it again right after.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { store, useStore, serverNow } from '../store.js';
import { t } from '../../../shared/i18n.js';

const num = (v) => (Number.isFinite(v) ? v : null);

/** Store the latest sys.maintenance (null when cleared). */
export function applyMaintenance(msg) {
  const m = {
    at: num(msg?.at), closed: msg?.closed === true, stopWhenIdle: msg?.stopWhenIdle === true, stopping: msg?.stopping === true,
    backIn: num(msg?.backIn), backAt: num(msg?.backAt), message: typeof msg?.message === 'string' && msg.message ? msg.message : null,
  };
  const any = m.at != null || m.closed || m.stopWhenIdle || m.stopping || m.message;
  store.set({ maintenance: any ? m : null });
}

/** A new welcome: the previous server's state is gone (a server still in maintenance sends it again). */
export function clearMaintenance() {
  if (store.get().maintenance) store.set({ maintenance: null });
}

/** "21:45" in the player's own time zone. */
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** "1:05:09" / "9:42" / "0:07" for a remaining time in ms (rounded up to the second). */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/**
 * The bar's text for a state at server time `now` (`backAt` is shown in the player's local time).
 * @param {{ at?: number | null, closed?: boolean, stopWhenIdle?: boolean, stopping?: boolean, backIn?: number | null,
 *   backAt?: number | null, message?: string | null } | null} m
 * @param {number} now
 * @returns {string | null}
 */
export function maintenanceText(m, now) {
  if (!m) return null;
  const parts = [];
  if (m.stopping) {
    parts.push(m.backAt != null ? t('服务器正在重启，预计 {time} 恢复', { time: clock(m.backAt) }) : t('服务器正在重启'));
  } else {
    if (m.at != null) {
      parts.push(m.at > now ? t('服务器将在 {time} 后维护', { time: formatCountdown(m.at - now) }) : t('服务器维护即将开始'));
    }
    if (m.stopWhenIdle) parts.push(t('当前对局结束后服务器将重启'));
    if (!parts.length && (m.closed || m.message)) parts.push(t('服务器即将维护'));
    if (m.closed) parts.push(t('暂不开始新的模拟'));
    if (m.backAt != null) parts.push(t('预计 {time} 恢复', { time: clock(m.backAt) }));
    else if (m.backIn != null) parts.push(t('预计停机约 {n} 分钟', { n: m.backIn }));
  }
  if (m.message) parts.push(m.message);
  return parts.length ? parts.join(' · ') : null;
}

/** Mount once near the root (main.js App). */
export function MaintenanceBar() {
  const m = useStore((s) => s.maintenance);
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (!m?.at) return undefined;
    setNow(serverNow());
    const id = setInterval(() => setNow(serverNow()), 1000);
    return () => clearInterval(id);
  }, [m?.at]);
  const text = maintenanceText(m, now);
  // the bar takes the top edge where toasts start: css/components.css moves them below it while it shows
  useEffect(() => {
    const root = globalThis.document?.documentElement;
    root?.classList.toggle('has-maint-bar', !!text);
    return () => root?.classList.remove('has-maint-bar');
  }, [!!text]);
  if (!text) return null;
  return html`<div class="maint-bar" role="status"><${Icon} name="warn" /><span class="num">${text}</span></div>`;
}
