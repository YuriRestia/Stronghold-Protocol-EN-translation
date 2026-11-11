// public/js/roomChat.js — (fork) the page's side of room chat (server/lobby.js roomChat decides everything; docs/design/
// network.md "Room chat"): the log of the room screen (store.roomChat), its system lines (who joined or left, read from
// room.state), and the frames the server sends. The seat bubbles reuse match chat's store.emotes (chatState.js chatEntry).
// The log lives in this page only, at most ROOM_LOG_KEEP lines; it starts empty in each room and is gone with the page.

import { chatEntry, chatMuted, nextBubbleSeq } from './chatState.js';

/** Lines the page keeps (older ones drop). */
export const ROOM_LOG_KEEP = 200;
/** Bubbles kept in store.emotes (main.js EMOTE_KEEP). */
const EMOTE_KEEP = 20;

/** @typedef {{ seq: number, id: string|null, n: string, x: string, at: number, sys?: 'join'|'leave'|'pause', ms?: number }} RoomLine */

let lineSeq = 0;
/** A fresh log for room `code`. */
export const roomChatFor = (code) => ({ code: code ?? null, lines: /** @type {RoomLine[]} */ ([]), pausedUntil: 0 });

/** @param {ReturnType<typeof roomChatFor>} rc @param {Omit<RoomLine, 'seq'>[]} add */
export function roomChatAppend(rc, add) {
  if (!add.length) return rc;
  const lines = [...rc.lines, ...add.map((l) => ({ ...l, seq: ++lineSeq }))];
  return { ...rc, lines: lines.length > ROOM_LOG_KEEP ? lines.slice(-ROOM_LOG_KEEP) : lines };
}

/**
 * The join / leave lines between two room.state frames of the same room (humans only; an AI teammate is not news).
 * @param {any} prev @param {any} room @param {number} now @returns {Omit<RoomLine, 'seq'>[]}
 */
export function roomChatSystemLines(prev, room, now) {
  if (!prev || !room || prev.code !== room.code || room.inMatch || prev.inMatch) return [];
  const humans = (r) => new Map((Array.isArray(r.seats) ? r.seats : [])
    .filter((s) => s && !s.isBot && typeof s.playerId === 'string').map((s) => [s.playerId, s.name || '']));
  const before = humans(prev), after = humans(room);
  const out = [];
  for (const [id, n] of after) if (!before.has(id)) out.push({ id, n, x: '', at: now, sys: /** @type {const} */ ('join') });
  for (const [id, n] of before) if (!after.has(id)) out.push({ id, n, x: '', at: now, sys: /** @type {const} */ ('leave') });
  return out;
}

/** A line from the server, or null when it is not one (or its sender is muted: their lines and bubbles stop here). */
export function roomChatLine(msg, mute, now) {
  if (!msg || typeof msg.id !== 'string' || typeof msg.x !== 'string' || !msg.x || chatMuted(mute, msg.id)) return null;
  return { id: msg.id, n: typeof msg.n === 'string' ? msg.n : '', x: msg.x, at: now };
}

/**
 * Wire the room-chat frames into the store (main.js). `store` is the page store; `currentCode()` the room on screen.
 * @param {{ on: (t: string, fn: (msg: any) => void) => void }} net @param {any} store
 */
export function installRoomChat(net, store) {
  const ensure = (s) => (s.roomChat?.code === (s.room?.code ?? null) ? s.roomChat : roomChatFor(s.room?.code));
  const bubble = (s, playerId, entry) => ({ emotes: [...s.emotes.slice(-(EMOTE_KEEP - 1)), entry] });
  net.on('room.chat', (msg) => {
    const s = store.get();
    const line = roomChatLine(msg, s.chatMute, Date.now());
    if (!line) return;
    store.set((st) => ({ roomChat: roomChatAppend(ensure(st), [line]), ...bubble(st, line.id, chatEntry(line.id, line.x, line.at)) }));
  });
  net.on('room.emote', (msg) => {
    if (!msg || typeof msg.id !== 'string' || typeof msg.e !== 'string') return;
    store.set((st) => bubble(st, msg.id, { seq: nextBubbleSeq(), playerId: msg.id, id: msg.e, at: Date.now() }));
  });
  net.on('room.chatPause', (msg) => {
    const ms = Number(msg?.ms);
    if (!Number.isFinite(ms) || ms <= 0) return;
    const now = Date.now();
    store.set((st) => {
      const rc = roomChatAppend(ensure(st), [{ id: null, n: '', x: '', at: now, sys: 'pause', ms }]);
      return { roomChat: { ...rc, pausedUntil: now + Math.min(ms, 10 * 60_000) } };
    });
  });
  // a reconnect: the lines this member got before (the server's memory of the room), in order, with their age
  net.on('room.chatLog', (msg) => {
    if (!Array.isArray(msg?.lines)) return;
    const now = Date.now();
    const st = store.get();
    const have = new Set(ensure(st).lines.map((l) => `${l.id}|${l.x}`));
    const add = msg.lines.slice(-ROOM_LOG_KEEP)
      .map((l) => roomChatLine(l, st.chatMute, now - Math.max(0, Number(l?.ago) || 0)))
      .filter((l) => l && !have.has(`${l.id}|${l.x}`));
    if (add.length) store.set((s) => ({ roomChat: roomChatAppend(ensure(s), add) }));
  });
}

/** main.js onRoomState: start a new log for a new room, or add who joined / left. */
export function roomChatOnState(store, prev, room) {
  const st = store.get();
  const code = room?.code ?? null;
  if (st.roomChat?.code !== code) { store.set({ roomChat: roomChatFor(code) }); return; }
  const add = roomChatSystemLines(prev, room, Date.now());
  if (add.length) store.set((s) => ({ roomChat: roomChatAppend(s.roomChat, add) }));
}
