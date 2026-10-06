// Operator notice for every online player, e.g. before a restart (server/announce.js has the whole flow).
//
//   node scripts/announce.mjs "Server restarting in 5 min for an update"   (active 10 min)
//   node scripts/announce.mjs --minutes 15 "Restarting at 12:00 UTC"
//   node scripts/announce.mjs --show        what is active now
//   node scripts/announce.mjs --clear       stop sending it to players who join from now on
//
// It only writes logs/announce.json (git-ignored); the running server picks the file up within ~2 s. On the VPS run it
// as the service user so the server can always read and replace the file:
//   cd /opt/stronghold/app && sudo -u stronghold node scripts/announce.mjs "…"
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LEN = 200; // server/announce.js NOTICE_MAX_LEN
const DEFAULT_MINUTES = 10;
const MAX_MINUTES = 24 * 60;

const USAGE = `Usage:
  node scripts/announce.mjs [--minutes N] "message"   send a notice (active ${DEFAULT_MINUTES} min by default, max ${MAX_MINUTES})
  node scripts/announce.mjs --show                    show the active notice
  node scripts/announce.mjs --clear                   remove the notice`;

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
      file: { type: 'string' }, // tests / custom setups
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (e) {
  fail(`${e.message}\n\n${USAGE}`);
}
const { values: opt, positionals } = args;
const file = path.resolve(opt.file || path.join(ROOT, 'logs', 'announce.json'));

if (opt.help) {
  console.log(USAGE);
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
  // the words may come unquoted: announce.mjs Restarting in 5 min
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
  // write a temp file and rename it, so the server never reads a half-written notice
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
