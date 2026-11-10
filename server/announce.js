// server/announce.js — operator notices ("server restarting in 5 min"). scripts/announce.mjs writes
// logs/announce.json `{ id, text, createdAt, until }`; this polls it and sends `sys.notice { id, text, until }` to every
// connected session, and to each new session while it is active. A notice created before the server started is
// ignored, so a restart warning does not come back after the restart.

import { sendSession } from './net.js';
import { FileBoard } from './fileBoard.js';

/** Longest notice text (the client's toast() caps at 200 too). */
export const NOTICE_MAX_LEN = 200;
export const NOTICE_POLL_MS = 2000;

/**
 * A notice read from the file, or null when it is malformed.
 * @param {unknown} raw parsed JSON
 * @returns {{ id: number, text: string, createdAt: number, until: number } | null}
 */
export function parseNotice(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { id, text, createdAt, until } = /** @type {any} */ (raw);
  if (!Number.isFinite(id) || !Number.isFinite(createdAt) || !Number.isFinite(until)) return null;
  if (typeof text !== 'string') return null;
  const t = text.trim().slice(0, NOTICE_MAX_LEN);
  if (!t) return null;
  return { id, text: t, createdAt, until };
}

export class NoticeBoard extends FileBoard {
  /**
   * @param {{
   *   file: string,
   *   registry: import('./net.js').SessionRegistry,
   *   startedAt: number,
   *   pollMs?: number,
   *   now?: () => number,
   *   log?: { info: Function, warn: Function },
   * }} opts
   */
  constructor({ file, registry, startedAt, pollMs = NOTICE_POLL_MS, now = Date.now, log }) {
    super({ file, registry, pollMs, tag: 'notice', log });
    this.startedAt = startedAt;
    this.now = now;
    /** @type {{ id: number, text: string, createdAt: number, until: number } | null} */
    this.notice = null;
  }

  active() {
    const n = this.notice;
    if (!n || n.createdAt < this.startedAt || this.now() >= n.until) return null;
    return n;
  }

  frame(n) {
    return { t: 'sys.notice', id: n.id, text: n.text, until: n.until };
  }

  async poll() {
    const f = await this.readChanged();
    if (!f) return;
    if (!f.present) {
      if (this.notice) this.log.info('[notice] cleared');
      this.notice = null;
      return;
    }
    const parsed = parseNotice(f.raw);
    if (!parsed) {
      this.log.warn(`[notice] ignored malformed ${this.file}`);
      return;
    }
    const isNew = parsed.id !== this.notice?.id;
    this.notice = parsed;
    if (isNew && this.active()) this.log.info(`[notice] sent to ${this.broadcast()} player(s): ${parsed.text}`);
  }

  /** @returns {number} sessions reached */
  broadcast() {
    const n = this.active();
    return n ? this.sendAll(this.frame(n)) : 0;
  }

  /** The client ignores ids it already showed, so a reconnect does not repeat the toast. */
  onHello(session) {
    const n = this.active();
    if (n) sendSession(session, this.frame(n));
  }
}
