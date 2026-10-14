// The low-time warning of the pre-match screens (remake feature): the same 'timer' tick the HUD plays in the last 10 s
// of a prep phase (screens/game.js), once per second while the player still has something to do — the briefing until
// 准备就绪 (screens/briefing.js), the strategy draft during the player's own turn (screens/bandDraft.js).

import { useEffect, useRef } from '../../vendor/hooks.module.js';
import { useTicker, secondsLeft } from './components.js';
import { audio } from '../audio.js';

export const TIMER_WARN_SECONDS = 10;

/**
 * Tick once per second in the last `warnAt` seconds before `deadline` while `active`.
 * @param {number|null|undefined} deadline server epoch ms (0 / null: untimed, silent)
 * @param {boolean} active the player still has to act
 * @param {number} [warnAt]
 */
export function useTimerWarning(deadline, active, warnAt = TIMER_WARN_SECONDS) {
  const secs = active ? secondsLeft(deadline) : null;
  // a slow tick until the window opens, then a fast one so no second is skipped
  useTicker(secs == null ? 0 : secs <= warnAt + 1 ? 250 : 1000);
  const last = useRef(null);
  useEffect(() => {
    if (secs == null || secs > warnAt || secs <= 0) return;
    const key = `${deadline}:${secs}`;
    if (last.current === key) return;
    last.current = key;
    audio.sfx('timer', { volume: 0.6 });
  });
}
