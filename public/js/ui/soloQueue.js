// 单人匹配 UI (DESIGN §90): the client side of queue.join / queue.leave / queue.ai. The Doctor stays on the lobby screen
// while queued; the server places them only into a room that starts at once, so the next screen is the match. No
// queue size is shown (an empty-looking queue keeps people from joining it).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Icon } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { createStore, useStore, shallowEqual, serverNow } from '../store.js';
import { t, getLang } from '../../../shared/i18n.js';
import { searchClock } from './matchSearch.js';
import { DIFFICULTIES, DIFFICULTY_NAMES } from '../../../shared/constants.js';
import { versionLabel } from '../versions.js';

/** { queued, difficulty, since, aiAt } as queue.state last said (server time). */
export const soloQueue = createStore({ queued: false, difficulty: null, since: null, aiAt: null });

/**
 * (fork, the user's decision of 2026-11-15) queue.state `at`: the ticked versions that lack the difficulty picked and
 * wait at their own fallback (server/lobby.js queueJoin, the room.create rule: 终极 → 绝境). Shown once per join as a
 * warn toast, one line per difficulty used; the dialog itself is unchanged. Junk keys and values are dropped.
 * @param {unknown} at @param {string | null} wanted
 */
export function fallbackLines(at, wanted) {
  if (!at || typeof at !== 'object' || !DIFFICULTIES.includes(/** @type {any} */ (wanted))) return [];
  /** @type {Map<string, string[]>} */
  const byUsed = new Map();
  for (const [v, d] of Object.entries(at)) {
    if (typeof d !== 'string' || !DIFFICULTIES.includes(/** @type {any} */ (d)) || d === wanted) continue;
    byUsed.set(d, [...(byUsed.get(d) ?? []), v]);
  }
  // en: "No {wanted} in {versions}: matched at {used} instead"
  return [...byUsed].map(([used, vs]) => t('{versions}没有{wanted}，将以{used}匹配', {
    versions: vs.map((v) => versionLabel(v)), wanted: t(DIFFICULTY_NAMES[wanted]), used: t(DIFFICULTY_NAMES[used]) }));
}

export function installSoloQueue() {
  net.on('queue.state', (msg) => {
    const was = soloQueue.get().queued;
    if (msg.queued) {
      soloQueue.set({
        queued: true, difficulty: typeof msg.difficulty === 'string' ? msg.difficulty : null,
        since: Number.isFinite(msg.since) ? msg.since : serverNow(), aiAt: Number.isFinite(msg.aiAt) ? msg.aiAt : null,
      });
      if (!was) for (const line of fallbackLines(msg.at, soloQueue.get().difficulty)) toast(line, 'warn');
      return;
    }
    soloQueue.set({ queued: false, difficulty: null, since: null, aiAt: null });
    if (was && msg.placed) toast(t('搜寻成功!'), 'success');
  });
  // the server drops a closed socket from the queue
  net.on('status', (snap) => {
    if (!soloQueue.get().queued || !['idle', 'connecting', 'reconnecting', 'closed'].includes(snap.status)) return;
    soloQueue.set({ queued: false, difficulty: null, since: null, aiAt: null });
    toast(t('连接中断，已退出单人匹配'), 'warn'); // en: "Connection lost, you left Solo Matchmaking"
  });
}

export function useSoloQueue() {
  return useStore((s) => s, shallowEqual, soloQueue);
}

/**
 * The lobby's create box while queued: the wait, 取消匹配, and after soloAiAfterMs 改为与 AI 队友模拟.
 * @param {{ busy: any, online: boolean, run: (kind: string, fn: () => Promise<any>) => any }} props
 */
export function QueuePanel({ busy, online, run }) {
  const q = useSoloQueue();
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!q.queued) return null;
  const now = serverNow();
  const aiReady = Number.isFinite(q.aiAt) && now >= q.aiAt;
  const cancel = () => run('queue', () => net.request('queue.leave', {}));
  // (fork) the AI is named in this client's language (GitHub #89)
  const withAi = () => run('ai', () => net.request('queue.ai', { lang: getLang() }));
  // en: 正在搜寻博士… "Searching for Doctors…" · 已等待 {time} "Waited {time}" · 凑齐 4 名博士后立即开始模拟 "The simulation
  // starts as soon as 4 Doctors are found" · 取消匹配 "Cancel Matchmaking" · 改为与 AI 队友模拟 "Play with AI Teammates instead"
  return html`<div class="queue-panel brackets" role="status" aria-live="polite">
    <div class="queue-panel__head">
      <span class="queue-panel__radar" aria-hidden="true"></span>
      <span class="queue-panel__title">${t('正在搜寻博士…')}</span>
      <span class="queue-panel__clock num" aria-label=${t('已等待 {time}', { time: searchClock(q.since, now) })}>${searchClock(q.since, now)}</span>
    </div>
    <span class="queue-panel__hint t-lo">${t('凑齐 4 名博士后立即开始模拟')}</span>
    <div class="queue-panel__btns">
      <${Button} variant="secondary" size="lg" icon="close" loading=${busy === 'queue'} disabled=${!online} onClick=${cancel}>${t('取消匹配')}<//>
      ${aiReady ? html`<${Button} variant="amber" size="lg" icon="robot" loading=${busy === 'ai'} disabled=${!online} onClick=${withAi}>${t('改为与 AI 队友模拟')}<//>` : null}
    </div>
  </div>`;
}
