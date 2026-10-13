// server/altArt.js — (fork) the bookkeeping of the alternate result background (results.js altArtResult).
// scripts/announce.mjs --pick writes logs/alt-art-rooms.json `{ rooms: [{ code, until }] }`: a match started in a listed room
// gets the chance like every ALT_ART_EVERY-th match does. Every match with the chance gets a `start` line in
// logs/alt-art.jsonl and, once it ends, an `end` line with the outcome; `scripts/announce.mjs --stats` sums them up.
// The room file is read when a match starts (tiny, rare), so a pick needs no restart and covers every generation.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const ALT_ART_ROOMS_FILE = 'alt-art-rooms.json';
export const ALT_ART_JOURNAL_FILE = 'alt-art.jsonl';
/** a room code as the lobby makes it (lobby.js CODE_ALPHABET, ROOM_CODE_LEN) */
export const ALT_ART_CODE_RE = /^[A-HJ-NP-Z]{4}$/;

/**
 * The picks still active at `now`; malformed entries are dropped.
 * @param {unknown} raw parsed JSON
 * @param {number} now
 * @returns {{ code: string, until: number }[]}
 */
export function parsePicks(raw, now) {
  const rooms = raw && typeof raw === 'object' && Array.isArray(/** @type {any} */ (raw).rooms) ? /** @type {any} */ (raw).rooms : [];
  return rooms.filter((r) => r && typeof r.code === 'string' && ALT_ART_CODE_RE.test(r.code) && Number.isFinite(r.until) && r.until > now);
}

/**
 * The journal lines grouped per match: `{ id, start, end }`, oldest first. A start without an end = a match that was
 * still running or was dropped (room disposed, server stopped).
 * @param {string} text the journal
 * @param {number} [since] only matches started at or after this time (ms)
 */
export function summarizeJournal(text, since = 0) {
  /** @type {Map<string, { id: string, start: any, end: any }>} */
  const byId = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e.id !== 'string') continue;
    const row = byId.get(e.id) || { id: e.id, start: null, end: null };
    if (e.ev === 'start') row.start = e;
    else if (e.ev === 'end') row.end = e;
    byId.set(e.id, row);
  }
  return [...byId.values()].filter((r) => r.start && r.start.at >= since).sort((a, b) => a.start.at - b.start.at);
}

export class AltArtLedger {
  /** @param {{ dir: string, log?: any, now?: () => number, gen?: string | null }} opts */
  constructor({ dir, log, now = Date.now, gen = null }) {
    this.roomsFile = path.join(dir, ALT_ART_ROOMS_FILE);
    this.journalFile = path.join(dir, ALT_ART_JOURNAL_FILE);
    this.log = log;
    this.now = now;
    this.gen = gen;
  }

  /** @param {string} code */
  isPicked(code) {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(this.roomsFile, 'utf8')); } catch { return false; }
    return parsePicks(raw, this.now()).some((r) => r.code === code);
  }

  /**
   * A match with the chance started. Returns the context `end()` takes.
   * @param {{ code: string, matchNo: number, serverMatchNo: number, chance: 'every' | 'picked', players: string[] }} info
   */
  start({ code, matchNo, serverMatchNo, chance, players }) {
    const id = randomBytes(4).toString('hex');
    const why = chance === 'picked' ? 'picked room' : `server match #${serverMatchNo}`;
    this.log?.info?.(`[alt-art] ${code} match #${matchNo} has the chance (${why}, id ${id})`);
    this.append({ ev: 'start', id, at: this.now(), gen: this.gen, code, matchNo, serverMatchNo, chance, players });
    return { id, code, matchNo };
  }

  /**
   * @param {{ id: string, code: string, matchNo: number }} ctx from start()
   * @param {{ altArt?: boolean, hiddenReached?: boolean } | null} summary the match's onEnd summary
   */
  end(ctx, summary) {
    const outcome = summary?.altArt ? 'shown' : summary?.hiddenReached ? 'no-unit' : 'no-core';
    const why = { shown: 'shown', 'no-unit': 'not shown (no matching unit on a final board)', 'no-core': 'not shown (Hidden Core not reached)' }[outcome];
    this.log?.info?.(`[alt-art] ${ctx.code} match #${ctx.matchNo} ${why} (id ${ctx.id})`);
    this.append({ ev: 'end', id: ctx.id, at: this.now(), outcome });
  }

  /** @param {object} entry */
  append(entry) {
    const line = JSON.stringify(entry) + '\n';
    fs.promises.mkdir(path.dirname(this.journalFile), { recursive: true })
      .then(() => fs.promises.appendFile(this.journalFile, line))
      .catch((e) => this.log?.error?.('[alt-art] journal write failed', e));
  }
}
