#!/usr/bin/env node
// tools/assets/lobby-voice.mjs — (fork) which voice sets speak in the room / Grand Alliance lobby, and the word counts the
// join lines are cut by. Writes the committed tools/assets/lobby-voice.json, which tools/fetch-assets.mjs reads (never the
// disk) so every run plans the same lines. Rerun it after the animated illustrations were re-extracted.
//
// The lobby voices (crew-docs/l2d-lobby-voice-proposal.md, the user's decisions of 2026-11-23) belong to the operators and
// outfits that have an official animated illustration in this game: the `dynillust` group of data/local-assets.json
// (tools/local-extract, 98 illustrations). Each gets, beside its battle lines, the lobby slots (audio.mjs
// LOBBY_VOICE_SLOTS): 交谈 talk, 闲置 idle, 问候 greeting, 任命队长 squadFirst. An outfit with its own voice set
// (data/outfits.json `voice`) adds its word key, so the card speaks in the outfit's voice like it does in battle.
//
// `words`: for each join line (audio.mjs JOIN_VOICE_SLOTS: 任命队长 / 部署 / 问候), the word count of its official text,
// one per line in voiceIndex order — the client cuts a line off after 2 of its words when the next player's line comes in
// (ui/lobbyVoice.js; the user's "about 2 words", by line length, 2026-11-23). The English text first (EN gamedata
// charword_table), else the Chinese one; words are counted by Intl.Segmenter (ICU word boundaries, which also split
// Chinese without spaces). `{@nickname}` (the player's name the voice says as "Doctor") counts as one word.
//
// Usage: node tools/assets/lobby-voice.mjs [--local data/local-assets.json] [--en <EN charword_table.json>]
//          [--out tools/assets/lobby-voice.json] [--check]
//   --check: exit 1 when the committed file differs from what the inputs give (writes nothing)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOIN_VOICE_SLOTS, VOICE_SLOTS } from './audio.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const LOBBY_VOICE_FILE = join(ROOT, 'tools', 'assets', 'lobby-voice.json');

/**
 * Words in an official voice text (Intl.Segmenter word boundaries; rich-text tags dropped, `{@nickname}` one word).
 * @param {string} text
 * @param {string} lang 'en' | 'zh'
 */
export function countWords(text, lang = 'en') {
  const s = String(text || '').replace(/<[^>]*>/g, ' ').replace(/\{@[a-z]+\}/gi, ' Doctor ');
  const seg = new Intl.Segmenter(lang, { granularity: 'word' });
  let n = 0;
  for (const x of seg.segment(s)) if (x.isWordLike) n += 1;
  return n;
}

/**
 * The lobby voice sets: the base charId of every illustrated operator and the word key of every illustrated outfit with
 * its own voice set, each with the join lines' word counts.
 * @param {{ dynillust: Record<string, {charId:string, skinId:string}>, outfits?: Record<string, any>|null,
 *   charword: any, charwordEn?: any }} p
 * @returns {{ about: string, keys: Record<string, { words: Record<string, number[]> }> }}
 */
export function lobbyVoiceKeys({ dynillust, outfits = null, charword, charwordEn = null }) {
  const words = Object.values(charword?.charWords || {});
  const wordsEn = Object.values(charwordEn?.charWords || {});
  const text = (list, wordKey, voiceId) => list.find((w) => w?.wordKey === wordKey && w.voiceId === voiceId)?.voiceText;
  const keys = new Set();
  for (const e of Object.values(dynillust || {})) {
    if (!e || typeof e.charId !== 'string') continue;
    keys.add(e.charId);
    const own = outfits?.[e.skinId]?.voice;
    if (typeof own === 'string' && words.some((w) => w?.wordKey === own)) keys.add(own);
  }
  const out = {};
  for (const key of [...keys].sort()) {
    const rec = {};
    for (const slot of JOIN_VOICE_SLOTS) {
      const placeType = Object.keys(VOICE_SLOTS).find((p) => VOICE_SLOTS[p] === slot);
      const lines = words.filter((w) => w?.wordKey === key && w.placeType === placeType && /^CN_\d+$/.test(w.voiceId))
        .sort((a, b) => a.voiceIndex - b.voiceIndex);
      const counts = [];
      for (const w of lines) {
        const en = text(wordsEn, key, w.voiceId);
        counts.push(Math.max(1, en ? countWords(en, 'en') : countWords(w.voiceText, 'zh')));
      }
      if (counts.length) rec[slot] = counts;
    }
    out[key] = { words: rec };
  }
  return {
    about: 'Voice sets with lobby lines (the animated illustrations of data/local-assets.json dynillust) and the word counts of their join lines. Written by tools/assets/lobby-voice.mjs; read by tools/fetch-assets.mjs.',
    keys: out,
  };
}

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : dflt;
}

async function main() {
  const localPath = arg('--local', join(ROOT, 'data', 'local-assets.json'));
  const enPath = arg('--en', join(ROOT, 'ArknightsGamedata', 'en', 'gamedata', 'excel', 'charword_table.json'));
  const outPath = arg('--out', LOBBY_VOICE_FILE);
  const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
  const dynillust = read(localPath)?.groups?.dynillust;
  if (!dynillust || !Object.keys(dynillust).length) throw new Error(`${localPath}: no dynillust group (extract the illustrations first)`);
  const charword = read(join(ROOT, '.cache', 'gamedata', 'excel', 'charword_table.json'));
  const charwordEn = existsSync(enPath) ? read(enPath) : null;
  if (!charwordEn) console.warn(`[lobby-voice] ${enPath} missing: word counts from the Chinese text only`);
  const outfits = existsSync(join(ROOT, 'data', 'outfits.json')) ? read(join(ROOT, 'data', 'outfits.json')) : null;
  const res = lobbyVoiceKeys({ dynillust, outfits, charword, charwordEn });
  const body = `${JSON.stringify(res, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    const cur = existsSync(outPath) ? readFileSync(outPath, 'utf8') : '';
    if (cur !== body) { console.error(`[lobby-voice] ${outPath} is stale: rerun node tools/assets/lobby-voice.mjs`); process.exit(1); }
    console.log(`[lobby-voice] ${outPath} is current (${Object.keys(res.keys).length} voice sets)`);
    return;
  }
  writeFileSync(outPath, body);
  console.log(`[lobby-voice] ${Object.keys(res.keys).length} voice sets → ${outPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(`[lobby-voice] FAILED: ${e?.message || e}`); process.exit(1); });
}
