// server/news.js — (fork) the lobby's live update news. scripts/news.mjs writes logs/news.json (shared/news.js says
// what it holds); this board polls it (fileBoard.js) and sends `sys.news { news }` to each player after hello and to
// every online player when it changes, so the banner changes without a new release. `news: null` = none: the page
// shows the news built into the release. A file that fails the check keeps the last good news (the script checks
// before it writes, so that is a hand edit gone wrong) and is logged.

import { sendSession } from './net.js';
import { FileBoard } from './fileBoard.js';
import { parseNews, newsProblems } from '../shared/news.js';

export const NEWS_POLL_MS = 10000;

export class NewsBoard extends FileBoard {
  /**
   * @param {{
   *   file: string,
   *   registry: import('./net.js').SessionRegistry,
   *   pollMs?: number,
   *   log?: { info: Function, warn: Function },
   * }} opts
   */
  constructor({ file, registry, pollMs = NEWS_POLL_MS, log }) {
    super({ file, registry, pollMs, tag: 'news', log });
    /** @type {ReturnType<typeof parseNews>} */
    this.news = null;
  }

  frame() {
    return { t: 'sys.news', news: this.news };
  }

  async poll() {
    const f = await this.readChanged();
    if (!f) return;
    if (!f.present) {
      if (!this.news) return;
      this.news = null;
      this.log.info(`[news] cleared (the release's own news) — sent to ${this.broadcast()} player(s)`);
      return;
    }
    const parsed = f.raw === undefined ? null : parseNews(f.raw);
    if (!parsed) {
      const why = f.raw === undefined ? ['not JSON'] : newsProblems(f.raw);
      this.log.warn(`[news] ignored ${this.file} (kept the last good news): ${why.slice(0, 3).join('; ')}`);
      return;
    }
    if (JSON.stringify(parsed) === JSON.stringify(this.news)) return;
    this.news = parsed;
    this.log.info(`[news] "${parsed.id}" (${Object.keys(parsed.langs).join(', ')}) — sent to ${this.broadcast()} player(s)`);
  }

  /** @returns {number} sessions reached */
  broadcast() {
    return this.sendAll(this.frame());
  }

  /** A player who says hello gets the news in force, if any (the page drops its copy on every welcome: main.js). */
  onHello(session) {
    if (this.news) sendSession(session, this.frame());
  }
}
