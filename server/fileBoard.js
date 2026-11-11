// server/fileBoard.js — (fork) the shared part of the boards that publish an operator's JSON file to every player: the
// notice (announce.js, logs/announce.json), the planned maintenance (maintenance.js, logs/maintenance.json) and the lobby's
// update news (news.js, logs/news.json). A board polls its file's mtime and size, reads and parses it only when they
// change, and sends its frame to every online session (broadcast) or one that just said hello (onHello). `logs/` is shared
// by every server generation (scripts/generations.mjs SHARED_LINKS), so a file written once reaches them all.

import fsp from 'node:fs/promises';
import { sendSession } from './net.js';

export class FileBoard {
  /**
   * @param {{
   *   file: string,
   *   registry: import('./net.js').SessionRegistry,
   *   pollMs: number,
   *   tag: string,
   *   log?: { info: Function, warn: Function },
   * }} opts
   */
  constructor({ file, registry, pollMs, tag, log }) {
    this.file = file;
    this.registry = registry;
    this.pollMs = pollMs;
    this.tag = tag;
    this.log = log || { info() {}, warn() {} };
    /** @type {string | null} mtime:size at the last read, null = no file */
    this.stamp = null;
    this.busy = false;
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.check(); }, this.pollMs);
    this.timer.unref?.();
    void this.check();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** One poll, never two at once: the subclass's poll(). */
  async check() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.poll();
    } finally {
      this.busy = false;
    }
  }

  /** @returns {Promise<void>} */
  async poll() {}

  /**
   * The file when it changed since the last call: null = unchanged; `{ present: false }` = gone; `{ present: true,
   * raw }` = its parsed JSON (`raw` undefined when it is not JSON).
   * @returns {Promise<null | { present: false } | { present: true, raw: unknown }>}
   */
  async readChanged() {
    let st = null;
    try {
      st = await fsp.stat(this.file);
    } catch (e) {
      if (e?.code !== 'ENOENT') this.log.warn(`[${this.tag}] cannot read ${this.file}: ${e?.code || e}`);
    }
    const stamp = st ? `${st.mtimeMs}:${st.size}` : null;
    if (stamp === this.stamp) return null;
    this.stamp = stamp;
    if (!st) return { present: false };
    let raw;
    try {
      raw = JSON.parse(await fsp.readFile(this.file, 'utf8'));
    } catch { /* not JSON: raw stays undefined */ }
    return { present: true, raw };
  }

  /** @param {object} msg @returns {number} sessions reached */
  sendAll(msg) {
    let sent = 0;
    for (const s of this.registry.all()) if (sendSession(s, msg)) sent++;
    return sent;
  }
}
