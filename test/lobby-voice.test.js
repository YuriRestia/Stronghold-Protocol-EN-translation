// (fork) The animated cards' lobby voices (crew-docs/l2d-lobby-voice-proposal.md, the user's decisions of 2026-11-23):
// the asset plan gives the illustrated voice sets their lobby slots and join word counts (tools/assets/lobby-voice.mjs,
// plan.mjs), and ui/lobbyVoice.js speaks them — one line at a time, the official 120 s quiet, turns, the crowd of joins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlan } from '../tools/assets/plan.mjs';
import { indexAudio, LOBBY_VOICE_SLOTS, JOIN_VOICE_SLOTS as PLAN_JOIN_SLOTS, VOICE_SLOTS } from '../tools/assets/audio.mjs';
import { countWords, lobbyVoiceKeys } from '../tools/assets/lobby-voice.mjs';
import { LobbyVoice, CHATTER_QUIET_MS, CHATTER_JITTER_MS, CARD_REST_MS, JOIN_WORDS, JOIN_VOICE_SLOTS, CHATTER_VOICE_SLOTS, JOIN_QUEUE_MAX } from '../public/js/ui/lobbyVoice.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A charword_table with every lobby line of `wordKey` (charId), one 部署 pair and the battle lines' 选中. */
function words(entries) {
  const out = {};
  for (const [charId, wordKey, voiceId, placeType, voiceIndex, voiceText] of entries) {
    out[`${wordKey}_${voiceId}`] = { charId, wordKey, voiceId, placeType, voiceIndex, voiceText, voiceAsset: `${wordKey}/${voiceId}` };
  }
  return { charWords: out };
}
const SET = (charId, wordKey = charId) => [
  [charId, wordKey, 'CN_002', 'HOME_SHOW', 2, '交谈一'], [charId, wordKey, 'CN_003', 'HOME_SHOW', 3, '交谈二'],
  [charId, wordKey, 'CN_010', 'HOME_WAIT', 10, '闲置'], [charId, wordKey, 'CN_018', 'SQUAD_FIRST', 18, '跟我来'],
  [charId, wordKey, 'CN_021', 'BATTLE_SELECT', 21, '选中'], [charId, wordKey, 'CN_023', 'BATTLE_PLACE', 23, '部署一'],
  [charId, wordKey, 'CN_024', 'BATTLE_PLACE', 24, '部署二'], [charId, wordKey, 'CN_042', 'GREETING', 42, '博士，早上好'],
];

test('lobby voice data: the slots, the official placeTypes, word counts by line', () => {
  assert.deepEqual([...LOBBY_VOICE_SLOTS], ['talk', 'idle', 'greeting', 'squadFirst']);
  assert.deepEqual([...PLAN_JOIN_SLOTS], [...JOIN_VOICE_SLOTS], 'the plan and the client pick the same join slots');
  assert.equal(VOICE_SLOTS.HOME_SHOW, 'talk');
  assert.equal(VOICE_SLOTS.HOME_WAIT, 'idle');
  assert.equal(VOICE_SLOTS.GREETING, 'greeting');
  assert.equal(countWords("Somebody's not happy with me as captain? Sounds like a <i>you</i> problem."), 12);
  assert.equal(countWords('Why, how are you, {@nickname}?'), 5, '{@nickname} is one word');
  assert.ok(countWords('为了你的安全着想，最好离我两米以上', 'zh') >= 6, 'Chinese splits into words without spaces');
  const charword = words([...SET('char_1_a'), ...SET('char_1_a', 'char_1_a_epoque#1'), ...SET('char_2_b')]);
  const charwordEn = words([['char_1_a', 'char_1_a', 'CN_018', 'SQUAD_FIRST', 18, '...Follow me.'],
    ['char_1_a', 'char_1_a', 'CN_023', 'BATTLE_PLACE', 23, 'Not a bad position.']]);
  const res = lobbyVoiceKeys({
    dynillust: { k1: { charId: 'char_1_a', skinId: 'char_1_a@epoque#1' }, k2: { charId: 'char_1_a', skinId: 'char_1_a#2' } },
    outfits: { 'char_1_a@epoque#1': { voice: 'char_1_a_epoque#1' } }, charword, charwordEn,
  });
  assert.deepEqual(Object.keys(res.keys), ['char_1_a', 'char_1_a_epoque#1'], 'the illustrated operator and its outfit voice set; char_2_b has no illustration');
  const w = res.keys.char_1_a.words;
  assert.deepEqual(w.squadFirst, [2], 'English first: "...Follow me."');
  assert.deepEqual(w.place[0], 4, 'English: "Not a bad position."');
  assert.ok(w.place[1] >= 1 && w.greeting[0] >= 1, 'no English text: the Chinese words');
});

test('lobby voice plan: only the illustrated sets get the lobby lines, and the manifest carries their word counts', () => {
  const charword = words([...SET('char_1_a'), ...SET('char_2_b')]);
  const lobbyVoice = { keys: { char_1_a: { words: { squadFirst: [2], place: [3, 4], greeting: [5] } } } };
  const t = buildPlan({ assets07: {}, ops03: {}, enemies05: {}, maps05: {}, audio: indexAudio({}), modelsData: {}, charword, voiceJp: false,
    extraOperators: { char_1_a: { skills: [] }, char_2_b: { skills: [] } }, lobbyVoice });
  const v = t.template.audio.voice;
  for (const s of ['talk', 'idle', 'greeting', 'squadFirst', 'select', 'place']) assert.ok(v.char_1_a[s], `char_1_a.${s}`);
  assert.equal(v.char_1_a.talk.length, 2, '交谈 keeps every line');
  for (const s of ['talk', 'idle', 'greeting', 'squadFirst']) assert.equal(v.char_2_b[s], undefined, `char_2_b.${s}: no illustration, battle lines only`);
  assert.ok(v.char_2_b.select);
  const lit = (x) => Object.getOwnPropertySymbols(x || {}).map((s) => x[s])[0]; // manifest.mjs literal()
  assert.deepEqual(lit(t.template.audio.voiceWords), { char_1_a: { squadFirst: [2], place: [3, 4], greeting: [5] } }, 'audio.voiceWords for the illustrated set');
  const none = buildPlan({ assets07: {}, ops03: {}, enemies05: {}, maps05: {}, audio: indexAudio({}), modelsData: {}, charword, voiceJp: false,
    extraOperators: { char_1_a: { skills: [] } } });
  assert.equal(none.template.audio.voice.char_1_a.talk, undefined, 'without the list: battle lines only');
  assert.equal(none.template.audio.voiceWords, undefined);
});

test('the committed lobby voice list: 58 operators + 17 outfit voice sets, a word count for every join line', () => {
  const j = JSON.parse(readFileSync(join(ROOT, 'tools/assets/lobby-voice.json'), 'utf8'));
  const keys = Object.keys(j.keys);
  assert.equal(keys.filter((k) => !k.includes('#')).length, 58, 'the operators of the 98 illustrations');
  assert.equal(keys.filter((k) => k.includes('#')).length, 17, 'their outfits with an own voice set');
  for (const [k, r] of Object.entries(j.keys)) {
    for (const [slot, ns] of Object.entries(r.words)) {
      assert.ok(JOIN_VOICE_SLOTS.includes(slot), `${k}.${slot}`);
      for (const n of ns) assert.ok(Number.isInteger(n) && n >= 1, `${k}.${slot}: ${n}`);
    }
  }
});

/** The voice channel, as audio.js answers it. */
function fakeAudio(counts) {
  const a = {
    voiceToken: 0, playing: 0, calls: [], stopped: [],
    voice(charId, slot, o = {}) { a.voiceToken += 1; a.playing = a.voiceToken; a.calls.push({ charId, slot, ...o, token: a.voiceToken }); return true; },
    voiceBusy() { return a.playing !== 0; },
    voiceOnAir(t) { return a.playing !== 0 && a.playing === t; },
    stopVoice(t) { if (a.playing === t) { a.playing = 0; a.stopped.push(t); } },
    voiceCount(charId, slot, key) { return (counts[key || charId] || {})[slot] || 0; },
    end() { a.playing = 0; },
  };
  return a;
}
const COUNTS = { char_a: { talk: 8, idle: 1, squadFirst: 1, place: 2, greeting: 1 }, char_b: { talk: 8, idle: 1, squadFirst: 1, place: 2, greeting: 1 },
  char_c: { talk: 8, idle: 1, greeting: 1 }, 'char_c_sale#1': { talk: 8, idle: 1 } };
function rig({ random = () => 0 } = {}) {
  const clock = { t: 1e6 };
  const timers = [];
  const audio = fakeAudio(COUNTS);
  const lv = new LobbyVoice({ voice: audio, now: () => clock.t, random, wordsOf: (k, s, i) => ({ squadFirst: 4, place: 8, greeting: 2 })[s] ?? null,
    setTimer: (fn, ms) => { const h = { fn, at: clock.t + ms }; timers.push(h); return h; }, clearTimer: (h) => { const i = timers.indexOf(h); if (i >= 0) timers.splice(i, 1); } });
  const run = (ms) => { // advance the clock, firing due timers and 1 s ticks
    for (let left = ms; left > 0;) {
      const step = Math.min(1000, left);
      clock.t += step; left -= step;
      for (const h of [...timers]) if (h.at <= clock.t) { timers.splice(timers.indexOf(h), 1); h.fn(); }
      lv.tick(step);
    }
  };
  return { clock, timers, audio, lv, run };
}

test('lobby chatter: the official 120 s of quiet plus the random 0–60 s; a touch, a voice or a hidden tab restarts it', () => {
  assert.equal(CHATTER_QUIET_MS, 120000);
  assert.equal(CHATTER_JITTER_MS, 60000);
  assert.deepEqual([...CHATTER_VOICE_SLOTS], ['talk', 'idle']);
  const { audio, lv, run } = rig();
  lv.setCards([{ id: 'p1', charId: 'char_a', live: true }]);
  run(119000);
  assert.equal(audio.calls.length, 0, 'quiet under 120 s');
  lv.activity();
  run(119000);
  assert.equal(audio.calls.length, 0, 'a touch restarted it');
  run(1000);
  assert.equal(audio.calls.length, 1, 'speaks at 120 s of quiet (random 0)');
  assert.ok(CHATTER_VOICE_SLOTS.includes(audio.calls[0].slot) && audio.calls[0].takeover);
  const r = rig({ random: () => 0.5 });
  r.lv.setCards([{ id: 'p1', charId: 'char_a', live: true }]);
  r.run(149000);
  assert.equal(r.audio.calls.length, 0, '120 s + half of 60 s');
  r.run(1000);
  assert.equal(r.audio.calls.length, 1);
  const h = rig();
  h.lv.setCards([{ id: 'p1', charId: 'char_a', live: true }]);
  for (let i = 0; i < 200; i += 1) h.lv.tick(1000, { hidden: true });
  assert.equal(h.audio.calls.length, 0, 'never while the tab is hidden');
  h.audio.playing = 99; // another voice on air
  h.run(200000);
  assert.equal(h.audio.calls.length, 0, 'a playing voice holds the timer');
});

test('lobby chatter: one card at a time, the cards take turns, a lone card rests 300 s, no line twice in a row; 2D cards never speak', () => {
  assert.equal(CARD_REST_MS, 300000);
  const { audio, lv, run } = rig();
  lv.setCards([{ id: 'p1', charId: 'char_a', live: true }, { id: 'p2', charId: 'char_b', live: true }, { id: 'p3', charId: 'char_c', live: false }]);
  const who = [];
  for (let i = 0; i < 4; i += 1) { run(CARD_REST_MS); who.push(audio.calls.at(-1)?.charId); audio.end(); }
  assert.ok(!who.includes('char_c'), 'a card still showing its 2D art says nothing');
  assert.deepEqual([who[0] !== who[1], who[1] !== who[2], who[2] !== who[3]], [true, true, true], 'turns');
  const lone = rig();
  lone.lv.setCards([{ id: 'p1', charId: 'char_a', live: true }]);
  lone.run(120000); lone.audio.end();
  lone.run(170000);
  assert.equal(lone.audio.calls.length, 1, 'not again within 300 s');
  lone.run(130000);
  assert.equal(lone.audio.calls.length, 2, 'again once rested');
  const seq = rig({ random: (() => { let n = 0; return () => [0, 0, 0, 0][n++ % 4]; })() });
  seq.lv.setCards([{ id: 'p1', charId: 'char_a', live: true }]);
  seq.run(120000); seq.audio.end(); seq.run(CARD_REST_MS + 1000);
  const [x, y] = seq.audio.calls;
  assert.notEqual(`${x.slot}:${x.line}`, `${y.slot}:${y.line}`, 'never the same line twice in a row');
  const o = rig();
  o.lv.setCards([{ id: 'p1', charId: 'char_c', voiceKey: 'char_c_sale#1', live: true }]);
  o.run(120000);
  assert.equal(o.audio.calls[0].voiceKey, 'char_c_sale#1', "the outfit's own voice set");
});

test('lobby joins: the newest cuts the one on air after about 2 of its words; faster joins wait; the last plays out; another voice is skipped', () => {
  assert.equal(JOIN_WORDS, 2);
  assert.ok(JOIN_QUEUE_MAX >= 8);
  const { audio, lv, run, timers } = rig();
  lv.setCards(['p1', 'p2', 'p3'].map((id, i) => ({ id, charId: ['char_a', 'char_b', 'char_c'][i], live: true })));
  lv.setCards([...lv.cards.values(), { id: 'p4', charId: 'char_a', live: true }]);
  // a chatter line on air: a join cuts it at once
  lv.chatter();
  assert.equal(audio.calls.length, 1);
  lv.join('p2');
  assert.equal(audio.calls.length, 2, 'the join takes the channel from chatter');
  assert.ok(JOIN_VOICE_SLOTS.includes(audio.calls[1].slot));
  // two more joins come right away: they wait for the line on air to say its words
  lv.join('p3'); lv.join('p4');
  assert.equal(audio.calls.length, 2, 'decoding: nobody cuts in yet');
  const sec = 4;
  audio.calls[1].onStart(sec);  // the file is 4 s long; the slot's line has (wordsOf) N words
  const words = { squadFirst: 4, place: 8, greeting: 2 }[audio.calls[1].slot];
  const cut = sec * 1000 * Math.min(1, 2 / words);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].at - 1e6, cut, `cut after 2 of ${words} words`);
  run(Math.max(1, cut));
  assert.equal(audio.calls.length, 3, 'p3 cuts p2 off');
  run(10000);
  assert.equal(audio.calls.length, 3, 'p3 still decoding: p4 waits');
  audio.calls[2].onStart(3);
  run(3000);
  assert.equal(audio.calls.length, 4, 'p4 cuts p3 off');
  audio.calls[3].onStart(5);
  run(20000);
  assert.equal(audio.calls.length, 4, 'the last plays to its end: nobody cuts it');
  // another voice on air (not ours): the join is skipped, never queued
  const other = rig();
  other.lv.setCards([{ id: 'p1', charId: 'char_a', live: true }]);
  other.audio.playing = 42;
  other.lv.join('p1');
  other.audio.end(); other.run(5000);
  assert.equal(other.audio.calls.length, 0);
  // a card that is not live, or a hidden tab: nothing
  const x = rig();
  x.lv.setCards([{ id: 'p1', charId: 'char_a', live: false }, { id: 'p2', charId: 'char_b', live: true }]);
  x.lv.join('p1'); x.lv.join('p2', { hidden: true });
  assert.equal(x.audio.calls.length, 0);
});

test('a manifest without the lobby lines (before the fetch): no chatter, no error; a join without word counts plays out uncut', () => {
  const clock = { t: 1e6 };
  const audio = fakeAudio({ char_x: { select: 2, place: 2 } }); // battle slots only, no voiceWords
  const lv = new LobbyVoice({ voice: audio, now: () => clock.t, random: () => 0, setTimer: () => 0, clearTimer: () => {} });
  lv.setCards([{ id: 'p1', charId: 'char_x', live: true }, { id: 'p2', charId: 'char_y', live: true }]);
  for (let i = 0; i < 400; i += 1) { clock.t += 1000; lv.tick(1000); }
  assert.equal(audio.calls.length, 0, 'no 交谈 / 闲置 in the manifest: silent');
  assert.doesNotThrow(() => lv.join('p2'));
  assert.equal(audio.calls.length, 0, 'an operator with no join line: nothing');
  lv.join('p1');
  assert.equal(audio.calls.length, 1, 'the battle slot 部署 is a join line already');
  audio.calls[0].onStart(3);
  assert.equal(lv.cutAt, 1e6 + 400000 + 3000, 'no word count: the whole line, nobody cuts it early');
});

test('leaving the room: our line fades out and nothing waits', () => {
  const { audio, lv, run } = rig();
  lv.setCards([{ id: 'p1', charId: 'char_a', live: true }, { id: 'p2', charId: 'char_b', live: true }]);
  lv.join('p1'); lv.join('p2');
  lv.stop();
  assert.deepEqual(audio.stopped, [audio.calls[0].token]);
  run(CARD_REST_MS);
  assert.equal(audio.calls.length, 1);
});
