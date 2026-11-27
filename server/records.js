// server/records.js — (fork, GitHub #32) opt-in anonymous match records: the server owner sets SP_RECORDS, and every
// finished match writes one gzipped JSON file `<dir>/<YYYY-MM-DD>/<random id>.json.gz` (the record server/match/records.js
// builds, plus the app version and the date; the file and folder times are set to that day's midnight UTC). Off by default: nothing is recorded or written. `tools/records.mjs` reads
// a folder of them. Any subset of the files is a valid data set: an admin can zip a day's folder and send it.
//   SP_RECORDS unset, '', 0, off, false, no → off
//   SP_RECORDS 1, on, true, yes             → logs/records/ of the install directory (gitignored, like all of logs/)
//   SP_RECORDS <path>                       → that folder (relative to the install directory)

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const gzip = promisify(zlib.gzip);

export const RECORDS_DEFAULT_DIR = path.join('logs', 'records');

/**
 * The records folder SP_RECORDS names, or null (off).
 * @param {string | undefined} value @param {string} root the install directory
 */
export function recordsDirFrom(value, root) {
  const v = String(value ?? '').trim();
  if (!v || /^(0|off|false|no)$/i.test(v)) return null;
  if (/^(1|on|true|yes)$/i.test(v)) return path.join(root, RECORDS_DEFAULT_DIR);
  return path.resolve(root, v);
}

/** The app version of package.json (the record's `app`); null when unreadable. */
function appVersion() {
  try { return JSON.parse(fs.readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version ?? null; } catch { return null; }
}

/** The UTC date of `ms` as YYYY-MM-DD: a record names its day, never a time. */
export const recordDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export class RecordStore {
  /** @param {{ dir: string, log?: any, now?: () => number, app?: string | null }} opts */
  constructor({ dir, log, now = Date.now, app = appVersion() }) {
    this.dir = dir;
    this.log = log;
    this.now = now;
    this.app = app;
  }

  /**
   * Write one match record. Resolves to the file path, or null when the write failed (logged, never thrown).
   * @param {object} record server/match/records.js finishRecord
   * @returns {Promise<string | null>}
   */
  async write(record) {
    const day = recordDay(this.now());
    const file = path.join(this.dir, day, `${randomBytes(6).toString('hex')}.json.gz`);
    try {
      const body = await gzip(JSON.stringify({ app: this.app, date: day, ...record }));
      await fs.promises.mkdir(path.dirname(file), { recursive: true });
      await fs.promises.writeFile(file, body, { flag: 'wx' });
      // the file times say the day only: a modification time would date the match to the second (and an archive of the
      // folder keeps it)
      const midnight = new Date(`${day}T00:00:00Z`);
      await fs.promises.utimes(file, midnight, midnight);
      await fs.promises.utimes(path.dirname(file), midnight, midnight).catch(() => {}); // a folder's times: best effort
      return file;
    } catch (e) {
      this.log?.error?.('[records] write failed', e);
      return null;
    }
  }
}
