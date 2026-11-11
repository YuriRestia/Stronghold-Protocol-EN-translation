#!/usr/bin/env node
// (fork) The dev traffic meter's report (server/http/trafficDetail.js; SERVER COST rule, changes/README.md
// "Server cost"): what a test match sent and received, in MB/s and GB/day, per player and extrapolated to 300.
//
//   SP_TRAFFIC_METER=1 npm run dev                         start a dev server with the meter on
//   node tools/traffic-report.mjs --reset                  zero it before the test match
//   node tools/traffic-report.mjs [--players 300] [--json] after it: the summary
//   options: --url http://127.0.0.1:3000 (default; PORT from the environment)
//
// It only reads GET /healthz?traffic=1 from the same machine; nothing is written.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { summarize } from '../server/http/trafficDetail.js';

export const USAGE = `Usage: node tools/traffic-report.mjs [--url <base>] [--players <n>] [--reset] [--json]
  --url      the dev server (default http://127.0.0.1:$PORT or :3000)
  --players  extrapolate to this many concurrent players (default 300)
  --reset    zero the meter (before a test match) and print nothing else
  --json     the summary as JSON`;

/** Parse the options. @returns {{ url: string, players: number, reset: boolean, json: boolean } | { error: string }} */
export function parseArgs(args, env = process.env) {
  const o = { url: `http://127.0.0.1:${env.PORT || 3000}`, players: 300, reset: false, json: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--reset') o.reset = true;
    else if (a === '--json') o.json = true;
    else if (a === '--url' && args[i + 1]) o.url = args[++i].replace(/\/+$/, '');
    else if (a === '--players' && /^\d+$/.test(args[i + 1] || '')) o.players = Number(args[++i]);
    else return { error: a === '--help' || a === '-h' ? '' : `unknown or incomplete option ${a}` };
  }
  return o;
}

/** The summary as text lines. */
export function formatSummary(sum, players) {
  const p = sum[`players${players}`];
  const lines = [
    `Measured: ${sum.measured.activeSeconds} s with traffic, ~${sum.measured.avgPlayers} players on average; ${sum.measured.messagesOut} messages out, ${sum.measured.messagesIn} in`,
    `| | Out | In |`,
    `|---|---|---|`,
    `| Test, average MB/s | ${sum.measured.outMBps} | ${sum.measured.inMBps} |`,
    `| Test, peak second MB/s | ${sum.measured.peakOutMBps} | ${sum.measured.peakInMBps} |`,
    `| Per player, MB/s (GB/day) | ${sum.perPlayer.outMBps} (${sum.perPlayer.outGBday}) | ${sum.perPlayer.inMBps} (${sum.perPlayer.inGBday}) |`,
    `| ${players} players, average MB/s (GB/day) | ${p.outMBps} (${p.outGBday}) | ${p.inMBps} (${p.inGBday}) |`,
    `| ${players} players, peak MB/s | ${p.peakOutMBps} | ${p.peakInMBps} |`,
    '',
    'Top message types (payload before compression):',
    '| Type | Out (n, KB) | In (n, KB) | Share |',
    '|---|---|---|---|',
    ...sum.types.map((t) => `| ${t.t} | ${t.outN}, ${t.outKB} | ${t.inN}, ${t.inKB} | ${(t.share * 100).toFixed(1)} % |`),
    '',
    'Payload bytes before WebSocket compression: an upper bound on the wire bytes (measured; extrapolation linear in players).',
  ];
  return lines.join('\n');
}

async function main(args) {
  const o = parseArgs(args);
  if ('error' in o) { if (o.error) console.log(`traffic-report: ${o.error}`); console.log(USAGE); return o.error ? 2 : 0; }
  const q = o.reset ? 'traffic=1&trafficReset=1' : 'traffic=1';
  let body;
  try {
    const res = await fetch(`${o.url}/healthz?${q}`, { signal: AbortSignal.timeout(10_000) });
    body = await res.json();
  } catch (e) {
    console.log(`traffic-report: cannot read ${o.url}/healthz (${e?.message || e}); is the dev server running?`);
    return 2;
  }
  if (!body?.trafficDetail) {
    console.log('traffic-report: the dev traffic meter is off on that server: start it with SP_TRAFFIC_METER=1 (never on production)');
    return 1;
  }
  if (o.reset) { console.log('traffic-report: meter reset'); return 0; }
  const sum = summarize(body.trafficDetail, o.players);
  console.log(o.json ? JSON.stringify(sum, null, 2) : formatSummary(sum, o.players));
  return 0;
}

const invoked = (() => { try { return pathToFileURL(realpathSync(process.argv[1] || '')).href; } catch { return null; } })();
if (invoked === import.meta.url) process.exitCode = await main(process.argv.slice(2));
