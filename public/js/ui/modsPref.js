// ui/modsPref.js — (fork) vanilla or modded (server/lobby.js Room.searchKind, issue #222): this browser's Preference (the
// lobby's small button: Vanilla only / Allow mods, kept in `lobby.allowMods`, off by default), and the dialog a host answers
// when a room opens to strangers (Find teammates, a Grand Alliance made public). Matchmaking is the original game unless a
// player allows mods: the preference decides which rooms the solo queue and the room browser offer.

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal, Tooltip } from './components.js';
import { loadPref, savePref } from '../store.js';
import { t } from '../../../shared/i18n.js';

export const ALLOW_MODS_PREF = 'lobby.allowMods';

const listeners = new Set();

/** Whether this browser allows mods in matchmaking (default: vanilla only). */
export function loadAllowMods() { return loadPref(ALLOW_MODS_PREF, false) === true; }

/** @returns {[boolean, (on: boolean) => void]} the preference, shared by every component that shows it */
export function useAllowMods() {
  const [on, setOn] = useState(loadAllowMods);
  useEffect(() => {
    listeners.add(setOn);
    return () => { listeners.delete(setOn); };
  }, []);
  return [on, (v) => { savePref(ALLOW_MODS_PREF, v === true); for (const fn of [...listeners]) fn(v === true); }];
}

/**
 * The lobby's small preference button: "Preference: Vanilla only" / "Preference: Allow mods"; a click toggles it.
 * msgids — 偏好：仅限原版 en: "Preference: Vanilla only"; 偏好：允许改动 en: "Preference: Allow mods".
 */
export function ModsPrefButton({ class: cls = '' }) {
  const [on, setOn] = useAllowMods();
  return html`<${Tooltip} text=${on
    ? t('允许改动：也会加入标记为改动的房间，房主之后可能修改房间规则。')
    : t('仅限原版：匹配时只会加入原版房间。')}>
    <button type="button" class=${`mods-pref${on ? ' is-on' : ''} ${cls}`.trim()} data-testid="mods-pref" role="switch" aria-checked=${on ? 'true' : 'false'}
      onClick=${() => setOn(!on)}>${on ? t('偏好：允许改动') : t('偏好：仅限原版')}</button>
  <//>`;
}

/**
 * The host's choice when a room opens to strangers: vanilla (rules cleared, locked) or modded (rules stay editable).
 * `onPick('vanilla' | 'modded')`; closing it picks nothing. The kind that matches the Preference leads.
 * msgids — 开放给陌生人 en: "Open to strangers"; 仅限原版（之后无法再修改）en: "This will be vanilla only (prevents further edits)";
 * 标记为改动房间（允许修改房间规则）en: "Mark this lobby as modded (allows editing lobby rules)"; 仅限原版会清除当前已选的房间规则；改动房间会保留它们。
 * en: "Vanilla only clears the lobby rules you have chosen; a modded lobby keeps them."; 有其他博士入座后无法撤销；在房间只剩你一人时停止搜寻即可解除。 en: "This cannot be undone once another Doctor is seated; stopping the search while you are alone in the lobby lifts it."; 改动房间只会匹配到允许改动的博士。 en: "A modded lobby only
 * meets Doctors who allow mods."
 * @param {{ open: boolean, hasRules: boolean, onPick: (kind: 'vanilla' | 'modded') => void, onClose: () => void }} props
 */
export function OpenKindDialog({ open, hasRules, onPick, onClose }) {
  const [allow] = useAllowMods();
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('开放给陌生人')} micro="MATCHMAKING" width="26rem" class="open-kind">
    <p class="open-kind__note t-dim">${t('改动房间只会匹配到允许改动的博士。')}</p>
    <div class="open-kind__opts">
      <${Button} variant=${allow ? 'secondary' : 'primary'} data-testid="open-vanilla" onClick=${() => onPick('vanilla')}>${t('仅限原版（之后无法再修改）')}<//>
      <${Button} variant=${allow ? 'primary' : 'secondary'} data-testid="open-modded" onClick=${() => onPick('modded')}>${t('标记为改动房间（允许修改房间规则）')}<//>
    </div>
    ${hasRules ? html`<p class="open-kind__note t-orange">${t('仅限原版会清除当前已选的房间规则；改动房间会保留它们。')}</p>` : null}
    <p class="open-kind__note t-dim">${t('有其他博士入座后无法撤销；在房间只剩你一人时停止搜寻即可解除。')}</p>
  <//>`;
}
