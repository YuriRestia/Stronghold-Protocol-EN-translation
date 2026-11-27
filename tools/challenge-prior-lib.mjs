// Reading the server's match records (server/match/records.js, `*.json.gz`) as challenge FACTS (public/js/challenges/facts.js):
// one observation per human seat. Used by tools/challenge-prior.mjs to derive the ratings prior from the matches we have.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { difficultyLevel, ruleFacts } from '../public/js/challenges/facts.js';

/** Every `*.json.gz` under `dir`, recursively, parsed; unreadable files are skipped. */
export function* readRecords(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { yield* readRecords(p); continue; }
    if (!e.name.endsWith('.json.gz') && !e.name.endsWith('.json')) continue;
    try {
      const raw = fs.readFileSync(p);
      yield { file: p, rec: JSON.parse(e.name.endsWith('.gz') ? zlib.gunzipSync(raw) : raw) };
    } catch { /* not a record */ }
  }
}

const num = (v) => (Number.isFinite(v) ? v : null);

/** The facts of each human seat of one server record (an empty list for a record that is not a settled match). */
export function factsFromServerRecord(r) {
  if (!r || !Array.isArray(r.seats) || !r.result || r.v == null) return [];
  const seats = r.seats;
  const humans = seats.filter((s) => s.human).length;
  const rf = ruleFacts(r.lobbyRules);
  const rounds = Array.isArray(r.rounds) ? r.rounds : [];
  const nobodyOut = !rounds.some((x) => Object.values(x.seats ?? {}).some((s) => s.alive === false));
  const out = [];
  for (const s of seats) {
    if (!s.human) continue;
    const layers = {}; const active = new Set();
    let last = null;
    for (const b of r.battles ?? []) {
      const pl = (b.spec?.players ?? []).find((x) => x.playerId === s.seat || x.playerId === `s${String(s.seat).replace(/\D/g, '')}` || x.seat === Number(String(s.seat).replace(/\D/g, '')));
      if (!pl) continue;
      last = pl;
      for (const [id, v] of Object.entries(pl.bonds ?? {})) layers[id] = Math.max(layers[id] ?? 0, v.layers ?? 0);
    }
    if (last) for (const [id, v] of Object.entries(last.bonds ?? {})) if (v.active) active.add(id);
    const st = s.stats ?? {};
    out.push({
      win: !!r.result.victory && !s.left,
      difficulty: difficultyLevel(r.difficulty),
      humans, bots: seats.length - humans, solo: r.mode === 'solo',
      ...rf,
      rounds: Number.isFinite(s.roundsPassed) ? s.roundsPassed : r.result.roundsPassed ?? 0,
      hiddenCleared: !!r.result.hiddenCleared,
      durationMin: null,
      nobodyOut,
      lpLost: num(st.lpLost), perfectRounds: num(st.perfectRounds),
      stats: { dmgDealt: num(st.dmgDealt), kills: num(st.kills), leaks: num(st.leaks), gold: num(st.gold), refreshes: num(st.refreshes), merges: num(st.merges), itemsEquipped: num(st.itemsEquipped), bossDamage: num(st.bossDamage), activatedLayers: num(st.activatedLayers) },
      band: s.band ?? null,
      layers: last ? layers : null, active: last ? [...active] : null,
      golden: null, custom: null,
    });
  }
  return out;
}
