// server/generation.js — this process as one "generation" behind scripts/router.mjs (zero-downtime restarts; the URL
// layout is shared/gen.js, the operator side scripts/generations.mjs).
//
// SP_GEN names the generation, SP_GEN_FILE is the router's generations.json `{ current, gens: { [id]: { port, … } } }`.
// This polls the file like announce.js polls its notice. Once `current` names ANOTHER generation, this one retires —
// for good, a rollback starts a fresh generation instead:
//   * lobby.retire(): no new room, queue or match (ERR.RETIRING); running matches play to their end;
//   * `sys.retire { gen }` to every session now and after every later hello. The client goes to `/` (the router sends it
//     to the new generation) once no match is on screen; a waiting room is lost on purpose (the operator's decision).
// A missing or unreadable file never retires: only a file that names another generation does.
// scripts/generations.mjs reap stops the process at 0 human matches (/healthz `humanMatches`) or after an hour.

import fsp from 'node:fs/promises';
import { sendSession } from './net.js';

export const GEN_POLL_MS = 2000;

export class GenerationWatch {
  /**
   * @param {{ gen: string, file: string, registry: import('./net.js').SessionRegistry, lobby: import('./lobby.js').Lobby,
   *           pollMs?: number, log?: { info: Function, warn: Function } }} opts
   */
  constructor({ gen, file, registry, lobby, pollMs = GEN_POLL_MS, log }) {
    this.gen = gen;
    this.file = file;
    this.registry = registry;
    this.lobby = lobby;
    this.pollMs = pollMs;
    this.log = log || { info() {}, warn() {} };
    this.retiring = false;
    /** @type {string | null} mtime:size at the last read */
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

  frame() { return { t: 'sys.retire', gen: this.gen }; }

  async check() {
    if (this.busy || this.retiring) return;
    this.busy = true;
    try {
      let st = null;
      try { st = await fsp.stat(this.file); } catch (e) {
        if (e?.code !== 'ENOENT') this.log.warn(`[gen] cannot read ${this.file}: ${e?.code || e}`);
      }
      const stamp = st ? `${st.mtimeMs}:${st.size}` : null;
      if (!st || stamp === this.stamp) return;
      this.stamp = stamp;
      let current = null;
      try { current = JSON.parse(await fsp.readFile(this.file, 'utf8'))?.current; } catch { /* half-written: next poll */ this.stamp = null; }
      if (typeof current === 'string' && current && current !== this.gen) this.retire(current);
    } finally {
      this.busy = false;
    }
  }

  /** @param {string} [next] the generation that took over (for the log) @returns {number} sessions told */
  retire(next = '?') {
    if (this.retiring) return 0;
    this.retiring = true;
    this.stop();
    this.lobby.retire();
    const msg = this.frame();
    let sent = 0;
    for (const s of this.registry.all()) if (sendSession(s, msg)) sent++;
    const { humanMatches } = this.lobby.stats();
    this.log.info(`[gen] ${this.gen} retiring (current: ${next}): told ${sent} session(s), ${humanMatches} human match(es) running`);
    return sent;
  }

  /** A session that says hello to a retiring generation hears it too (a reconnect, a reload into a running match). */
  onHello(session) {
    if (this.retiring) sendSession(session, this.frame());
  }
}
