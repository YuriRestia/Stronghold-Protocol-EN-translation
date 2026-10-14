// Operator notice for every online player: a one-off message (see server/announce.js). For a planned restart use
// scripts/maintenance.mjs instead: a live countdown, no new matches, and a stop once the matches end (docs/DEPLOY.md §1.6).
//
//   node scripts/announce.mjs "Server restarting in 5 min for an update"   (active 10 min)
//   node scripts/announce.mjs --minutes 15 "Restarting at 12:00 UTC"
//   node scripts/announce.mjs --show        what is active now
//   node scripts/announce.mjs --clear       stop sending it to players who join from now on
//
// Writes logs/announce.json; the server picks it up within ~2 s. On the VPS, run it as the service user:
//   cd /opt/stronghold/app && sudo -u stronghold node scripts/announce.mjs "…"
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { ALT_ART_CODE_RE, ALT_ART_JOURNAL_FILE, ALT_ART_ROOMS_FILE, parsePicks, summarizeJournal } from '../server/altArt.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LEN = 200; // server/announce.js NOTICE_MAX_LEN
const DEFAULT_MINUTES = 10;
const MAX_MINUTES = 24 * 60;

const USAGE = `Usage:
  node scripts/announce.mjs [--minutes N] "message"   send a notice (active ${DEFAULT_MINUTES} min by default, max ${MAX_MINUTES})
  node scripts/announce.mjs --show                    show the active notice
  node scripts/announce.mjs --clear                   remove the notice
For a planned restart (countdown, no new matches, stop when idle) see: node scripts/maintenance.mjs --help`;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function readNotice(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

const time = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

function writeFailed(e, file) {
  if (e?.code === 'EACCES' || e?.code === 'EPERM') {
    fail(`Permission denied writing ${file}.\nOn the server run it as the service user: sudo -u stronghold node scripts/announce.mjs …`);
  }
  fail(`Could not write ${file}: ${e?.message || e}`);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      minutes: { type: 'string', short: 'm' },
      show: { type: 'boolean' },
      clear: { type: 'boolean' },
      file: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      // (fork) server/altArt.js picked rooms + journal, kept next to the notice file
      pick: { type: 'string' },
      unpick: { type: 'string' },
      picks: { type: 'boolean' },
      stats: { type: 'boolean' },
      hours: { type: 'string' },
      days: { type: 'string' },
    },
  });
} catch (e) {
  fail(`${e.message}\n\n${USAGE}`);
}
const { values: opt, positionals } = args;
const file = path.resolve(opt.file || path.join(ROOT, 'logs', 'announce.json'));

if (opt.help) {
  console.log(USAGE);
} else if (opt.pick != null || opt.unpick != null || opt.picks || opt.stats) {
  altArt(path.dirname(file));
} else if (opt.show) {
  const n = readNotice(file);
  if (!n || !Number.isFinite(n.until) || Date.now() >= n.until) console.log('No active notice.');
  else console.log(`Active until ${time(n.until)} (${Math.ceil((n.until - Date.now()) / 60000)} min left):\n  ${n.text}`);
} else if (opt.clear) {
  try {
    fs.rmSync(file, { force: true });
  } catch (e) {
    writeFailed(e, file);
  }
  console.log('Notice cleared. Players who join from now on will not get it.');
} else {
  const text = positionals.join(' ').trim();
  if (!text) fail(USAGE);
  if (text.length > MAX_LEN) fail(`Message too long: ${text.length} characters (max ${MAX_LEN}).`);
  const minutes = opt.minutes == null ? DEFAULT_MINUTES : Number(opt.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) fail(`--minutes must be a number from 1 to ${MAX_MINUTES}.`);

  const now = Date.now();
  const prev = readNotice(file);
  // a new id every time, so the client shows the notice even when the text repeats
  const id = Number.isFinite(prev?.id) && prev.id >= now ? prev.id + 1 : now;
  const notice = { id, text, createdAt: now, until: now + Math.round(minutes * 60_000) };
  // rename so the server never reads a half-written file
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(notice) + '\n', { mode: 0o644 });
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
    writeFailed(e, file);
  }
  console.log(`Notice saved. Online players get it within ~2 s; players who join get it until ${time(notice.until)}.\n  ${text}`);
}

// (fork) Room picks + outcomes of the alternate result background (server/altArt.js), in `dir` (logs/ by default):
//   --pick CODE [--hours N] (12 h, max 168) | --unpick CODE | --picks | --stats [--days N]
function altArt(dir) {
  const roomsFile = path.join(dir, ALT_ART_ROOMS_FILE);
  const now = Date.now();
  const readPicks = () => { try { return parsePicks(JSON.parse(fs.readFileSync(roomsFile, 'utf8')), now); } catch { return []; } };
  const writePicks = (rooms) => {
    const tmp = `${roomsFile}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify({ rooms }) + '\n', { mode: 0o644 });
      fs.renameSync(tmp, roomsFile);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      writeFailed(e, roomsFile);
    }
  };
  const roomCode = (v) => {
    const code = String(v).trim().toUpperCase();
    if (!ALT_ART_CODE_RE.test(code)) fail(`"${v}" is not a room code (4 letters, e.g. ABCD).`);
    return code;
  };

  if (opt.pick != null) {
    const code = roomCode(opt.pick);
    const hours = opt.hours == null ? 12 : Number(opt.hours);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 168) fail('--hours must be a number above 0 and at most 168.');
    const until = now + Math.round(hours * 3_600_000);
    writePicks([...readPicks().filter((r) => r.code !== code), { code, until }]);
    console.log(`Picked ${code}. Its next matches have the chance until ${time(until)}.`);
    console.log('Room codes are reused once a room closes, so unpick it when you are done.');
  } else if (opt.unpick != null) {
    const code = roomCode(opt.unpick);
    const before = readPicks();
    const rooms = before.filter((r) => r.code !== code);
    writePicks(rooms);
    console.log(rooms.length < before.length ? `Unpicked ${code}.` : `${code} was not picked.`);
  } else if (opt.picks) {
    const rooms = readPicks();
    if (!rooms.length) console.log('No picked rooms.');
    for (const r of rooms) console.log(`  ${r.code}  until ${time(r.until)} (${Math.ceil((r.until - now) / 60000)} min left)`);
  } else {
    const days = opt.days == null ? null : Number(opt.days);
    if (days != null && (!Number.isFinite(days) || days <= 0)) fail('--days must be a number above 0.');
    let text = '';
    try { text = fs.readFileSync(path.join(dir, ALT_ART_JOURNAL_FILE), 'utf8'); } catch { /* no journal yet */ }
    const rows = summarizeJournal(text, days == null ? 0 : now - days * 86_400_000);
    const count = (pred) => rows.filter(pred).length;
    console.log(`Matches with the chance${days == null ? '' : ` (last ${days} d)`}: ${rows.length}`
      + ` (${count((r) => r.start.chance === 'every')} every-10th, ${count((r) => r.start.chance === 'picked')} picked room)`);
    console.log(`  shown:                      ${count((r) => r.end?.outcome === 'shown')}`);
    console.log(`  Hidden Core not reached:    ${count((r) => r.end?.outcome === 'no-core')}`);
    console.log(`  no matching unit on board:  ${count((r) => r.end?.outcome === 'no-unit')}`);
    console.log(`  unfinished / dropped:       ${count((r) => !r.end)}`);
    if (rows.length) {
      console.log('\nLatest:');
      for (const r of rows.slice(-10)) {
        const players = (r.start.players || []).join(', ') || '-';
        console.log(`  ${time(r.start.at)}  ${r.start.code} #${r.start.matchNo}  ${r.start.chance.padEnd(6)}  ${(r.end?.outcome || 'unfinished').padEnd(10)}  ${players}`);
      }
    }
  }
}
