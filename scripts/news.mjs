// (fork) The lobby's live update news (server/news.js): replace the announcement banner on this server without a
// release. The file holds every language; shared/news.js says what it may hold and checks it.
//
//   node scripts/news.mjs set news.json     check the file and put it live (online players see it within ~10 s)
//   node scripts/news.mjs set -             the same, the file on stdin (scripts/deploy-regions.mjs news sends it so)
//   node scripts/news.mjs check news.json   only check it (nothing written)
//   node scripts/news.mjs show              what this server shows now
//   node scripts/news.mjs clear             back to the news built into the release
//
// Writes logs/news.json (logs/ is shared by every server generation). On the VPS, run it as the service user:
//   cd /opt/stronghold/app && sudo -u stronghold node scripts/news.mjs set /tmp/news.json
// For both servers at once, from the PC: node scripts/deploy-regions.mjs news --hosts spa,usspa news.json
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { newsProblems, parseNews, NEWS_MAX_BYTES } from '../shared/news.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const USAGE = `Usage:
  node scripts/news.mjs set <file | ->     check the news file and put it live
  node scripts/news.mjs check <file | ->   only check it
  node scripts/news.mjs show               show the live news on this server
  node scripts/news.mjs clear              back to the news built into the release
Options: --file <path> (default logs/news.json)`;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

/** The news file's text from a path or stdin ('-'), at most NEWS_MAX_BYTES (plus room for whitespace). */
function readInput(src) {
  let text;
  try {
    text = src === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(src, 'utf8');
  } catch (e) {
    fail(`Could not read ${src === '-' ? 'stdin' : src}: ${e?.code || e?.message || e}`);
  }
  if (Buffer.byteLength(text) > NEWS_MAX_BYTES * 2) fail(`The file is too big (${Buffer.byteLength(text)} bytes).`);
  return text.replace(/^\uFEFF/, '');
}

/** The checked news from its text, or exit with every problem listed. */
function checked(text) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { fail(`Not valid JSON: ${e.message}`); }
  const problems = newsProblems(raw);
  if (problems.length) fail(`The news file was refused (nothing changed):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  return parseNews(raw);
}

function summary(news) {
  const lines = [`id "${news.id}", languages: ${Object.keys(news.langs).join(', ')}`];
  const e = news.langs.en || Object.values(news.langs)[0];
  lines.push(`  ${e.title}`);
  for (const h of e.highlights) lines.push(`  * ${h}`);
  for (const p of e.points) lines.push(`  - ${p}`);
  return lines.join('\n');
}

function writeFailed(e, file) {
  if (e?.code === 'EACCES' || e?.code === 'EPERM') {
    fail(`Permission denied writing ${file}.\nOn the server run it as the service user: sudo -u stronghold node scripts/news.mjs …`);
  }
  fail(`Could not write ${file}: ${e?.message || e}`);
}

let args;
try {
  args = parseArgs({ allowPositionals: true, options: { file: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
} catch (e) {
  fail(`${e.message}\n\n${USAGE}`);
}
const { values: opt, positionals } = args;
const [cmd, src] = positionals;
const file = path.resolve(opt.file || path.join(ROOT, 'logs', 'news.json'));

if (opt.help || !cmd) {
  console.log(USAGE);
} else if (cmd === 'check' || cmd === 'set') {
  if (!src) fail(USAGE);
  const news = checked(readInput(src));
  if (cmd === 'check') {
    console.log(`OK: ${summary(news)}`);
  } else {
    // rename so the server never reads a half-written file
    const tmp = `${file}.${process.pid}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(news, null, 1) + '\n', { mode: 0o644 });
      fs.renameSync(tmp, file);
    } catch (e) {
      try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
      writeFailed(e, file);
    }
    console.log(`News saved. Online players see it within ~10 s, everyone else when they open the lobby.\n${summary(news)}`);
  }
} else if (cmd === 'show') {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none */ }
  const news = raw ? parseNews(raw) : null;
  if (!raw) console.log('No live news: players see the news built into the release.');
  else if (!news) console.log(`${file} is not valid, so players see the last good news (or the release's): ${newsProblems(raw).join('; ')}`);
  else console.log(summary(news));
} else if (cmd === 'clear') {
  try {
    fs.rmSync(file, { force: true });
  } catch (e) {
    writeFailed(e, file);
  }
  console.log('Live news cleared. Players see the news built into the release (online players within ~10 s).');
} else {
  fail(`Unknown command "${cmd}".\n\n${USAGE}`);
}
