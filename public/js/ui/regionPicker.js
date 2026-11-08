// public/js/ui/regionPicker.js — (fork) the lobby's server picker (public/js/regions.js; DESIGN §8.7): the ping pill at
// the lobby's top left, which names the server, opens a small list under it on a click, a tap, Enter or Space — 自动 (Auto)
// and each server, with its ping and the one this page is on (当前, Current); the player's choice is marked. A pick is the same
// setting Settings had before (regions.setPreference, kept in localStorage): out of a room it moves the socket now, in a
// room or a queue once the player leaves it. Only the lobby has the picker, so a match never moves. Without regions, or
// when the operator has not turned the choice on, the pill is the plain PingPill, as on every other screen.
// Opening the list pings every server (regions.measure), again every 10 s while it stays open. Esc, a press outside or
// a pick closes it; ↑ / ↓ move between the choices.

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, PingPill } from './components.js';
import { useStore } from '../store.js';
import { regions } from '../net.js';
import { regionLabel } from './regionNames.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const REMEASURE_MS = 10_000;

/** The same tiers as PingPill. @param {number | undefined} ms */
const tierOf = (ms) => (!Number.isFinite(ms) ? 'off' : ms < 60 ? 'low' : ms < 200 ? 'medium' : 'high');

/** A row's ping: the last ping test's, else the live socket's for the server it is on; '…' while measuring. */
function PingText({ ms, measuring }) {
  if (ms === undefined) return html`<span class="regpick__ms ping--off">${measuring ? '…' : '--'}</span>`;
  return html`<span class=${cx('regpick__ms', `ping--${tierOf(ms)}`)}>${Number.isFinite(ms)
    ? html`${Math.min(9999, Math.round(ms))}<small>ms</small>` : '--'}</span>`;
}

/** @param {{ ms?: number|null, online?: boolean }} props the live ping, as PingPill takes it */
export function RegionPing({ ms, online = true }) {
  const region = useStore((s) => s.region);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const offered = !!(region?.enabled && region.auto && region.list?.length > 1);

  useEffect(() => {
    if (!open) return undefined;
    void regions.measure();
    const timer = setInterval(() => { void regions.measure(); }, REMEASURE_MS);
    const onDown = (e) => { if (!(e.target instanceof Element) || !wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); return; }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const opts = [...(wrapRef.current?.querySelectorAll('.regpick__opt') || [])];
      if (!opts.length) return;
      e.preventDefault();
      const at = opts.indexOf(document.activeElement);
      const next = at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : -1) + opts.length) % opts.length;
      opts[next].focus();
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey, true);
    // the choice that is on gets the focus, so the keyboard starts there
    wrapRef.current?.querySelector('.regpick__opt.is-on')?.focus();
    return () => {
      clearInterval(timer);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);
  // regions turned off while the list is open (a /healthz without them): nothing left to choose
  useEffect(() => { if (!offered && open) setOpen(false); }, [offered, open]);

  if (!offered) return html`<${PingPill} ms=${ms} online=${online} />`;

  const rtts = region.rtts || {};
  const msOf = (id) => (id in rtts ? rtts[id] : id === region.current && online && Number.isFinite(ms) ? ms : undefined);
  const pick = (id) => { regions.setPreference(id); setOpen(false); btnRef.current?.focus(); };
  const choices = [
    { id: 'auto', name: t('自动'), sub: region.best ? regionLabel(region.best) : null, ms: region.best ? msOf(region.best) : undefined }, // en: "Auto"
    ...region.list.map((id) => ({ id, name: regionLabel(id), sub: null, ms: msOf(id) })),
  ];
  const label = t('切换服务器'); // en: "Switch server"
  const hint = t('自动选择延迟最低的服务器。更改会在你离开同盟后生效。'); // en: "Auto picks the server with the lowest ping. A change applies after you leave your alliance."
  const listName = t('服务器'); // en: "Server"
  const hereText = t('当前'); // en: "Current"

  return html`<span class=${cx('regpick', open && 'is-open')} ref=${wrapRef}>
    <button type="button" class="regpick__btn" ref=${btnRef} data-testid="region-picker" title=${label} aria-label=${label}
        aria-haspopup="true" aria-expanded=${open ? 'true' : 'false'} onClick=${() => setOpen(!open)}>
      <${PingPill} ms=${ms} online=${online}><${Icon} name="chevronRight" class="regpick__caret" /><//>
    </button>
    ${open ? html`<div class="regpick__pop" role="radiogroup" aria-label=${listName} data-testid="region-pref">
      ${choices.map((c) => {
        const on = region.preference === c.id;
        const here = c.id !== 'auto' && c.id === region.current;
        return html`<button type="button" key=${c.id} role="radio" aria-checked=${on ? 'true' : 'false'} data-region=${c.id}
            class=${cx('regpick__opt', on && 'is-on')} onClick=${() => pick(c.id)}>
          <span class="regpick__mark">${on ? html`<${Icon} name="check" />` : null}</span>
          <span class="regpick__name">${c.name}${c.sub ? html`<small class="regpick__sub">${c.sub}</small>` : null}</span>
          <span class="regpick__here-slot">${here ? html`<span class="regpick__here">${hereText}</span>` : null}</span>
          <${PingText} ms=${c.ms} measuring=${region.measuring} />
        </button>`;
      })}
      <p class="regpick__hint">${hint}</p>
    </div>` : null}
  </span>`;
}
