// public/js/ui/chatLog.js — (fork) the room screen's chat (user, 2026-11-11; docs/design/network.md "Room chat"): an
// MMO-style log you can scroll up — time, name (squad colours: A mint, B blue, yours gold), the line; who joined or left;
// a "↓ N new messages" pill while scrolled up — with one input row (the box, a letter counter, Send) and the emote wheel.
// Desktop: docked in the empty strip under the seat cards, ⤢ expands it upward (remembered per browser). A short screen
// (a phone in landscape): a Chat button with the unread count and the last line; the log opens over the left half.
// The seat bubbles and mutes are screens/room.js's (the shared ChatBubble / ChatMuteButton); the state is roomChat.js's.
// Text is rendered as text, never markup; what the box holds is already the plain text the server will take.

import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { CHAT_LINE_LETTERS, ROOM_CHAT_GAP_MS } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';
import { chatLine, cleanChat, letterCount } from '../../../shared/text.js';
import { chatEntry, chatMuted, fitChatInput, nextBubbleSeq } from '../chatState.js';
import { net } from '../net.js';
import { store, useStore, loadPref, savePref } from '../store.js';
import { roomChatAppend, roomChatFor } from '../roomChat.js';
import { html, Icon, useTicker } from './components.js';
import { EmoteWheel } from './emotes.js';
import { useMediaQuery } from './device.js';

const EXPAND_KEY = 'roomChatExpanded';
/** Where the log is a button + a sheet instead of docked: a narrow or a short screen (room.css hides the dock column there). */
const SHEET_QUERY = '(max-width: 900px), (max-height: 520px)';
const EMOTE_KEEP = 20;
const two = (n) => String(n).padStart(2, '0');
const clock = (at) => { const d = new Date(at); return `${two(d.getHours())}:${two(d.getMinutes())}`; };

/** The colour class of a sender: yours, or their squad in a large room (seats 1–4 A, 5–8 B), else A. */
export function senderClass(room, myId, id) {
  if (id === myId) return 'is-me';
  const seats = Array.isArray(room?.seats) ? room.seats : [];
  const i = seats.findIndex((s) => s && s.playerId === id);
  return seats.length > 4 && i >= 4 ? 'is-b' : 'is-a';
}

/** One log line's text part (system lines are worded here, from the page's own strings). */
function LineBody({ l }) {
  if (l.sys === 'join') return html`<span class="clog__sys">${t('{name} 加入了同盟', { name: l.n || t('博士') })}</span>`; // en: "{name} joined the Alliance"
  if (l.sys === 'leave') return html`<span class="clog__sys">${t('{name} 离开了同盟', { name: l.n || t('博士') })}</span>`; // en: "{name} left the Alliance"
  if (l.sys === 'busy') return html`<span class="clog__warn">${t('聊天繁忙，请稍后再试。')}</span>`; // en: "Chat is busy. Try again in a moment."
  if (l.sys === 'pause') {
    return html`<span class="clog__warn">${t('发送太快了，聊天暂停 {n} 秒。', { n: Math.ceil((l.ms || 0) / 1000) })}</span>`; // en: "You're sending too fast. Chat paused for {n} s."
  }
  return null;
}

/**
 * The room screen's chat: log + input + emotes. Renders nothing when the operator turned chat off.
 * @param {{ room: any, myId: string, seated: boolean, online: boolean }} props seated: a player seat (spectators read only)
 */
export function RoomChat({ room, myId, seated, online }) {
  const rc = useStore((s) => s.roomChat);
  const mute = useStore((s) => s.chatMute);
  const short = useMediaQuery(SHEET_QUERY);
  const [expanded, setExpanded] = useState(() => loadPref(EXPAND_KEY, false) === true);
  const [open, setOpen] = useState(false); // short screens: the log over the left half
  const [text, setText] = useState('');
  const [coolUntil, setCoolUntil] = useState(0);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const [seenSeq, setSeenSeq] = useState(0);
  const list = useRef(null);
  const atBottom = useRef(true);
  const input = useRef(null);

  const lines = (rc?.code === room?.code ? rc.lines : []).filter((l) => !l.id || l.sys || !chatMuted(mute, l.id));
  const lastSeq = lines.length ? lines[lines.length - 1].seq : 0;
  const now = Date.now();
  const paused = (rc?.pausedUntil || 0) > now;
  useTicker(paused || coolUntil > now ? 500 : 0);
  const visible = !short || open;

  // new lines: follow them while at the bottom, else count them for the pill
  const prevLast = useRef(lastSeq);
  useLayoutEffect(() => {
    const el = list.current;
    const added = lines.filter((l) => l.seq > prevLast.current).length;
    prevLast.current = lastSeq;
    if (!el) return;
    if (atBottom.current) el.scrollTop = el.scrollHeight;
    else if (added) setNewCount((n) => n + added);
  }, [lastSeq, visible, expanded]);
  useEffect(() => { if (visible) setSeenSeq(lastSeq); }, [visible, lastSeq]);
  // the open sheet lives in the footer, whose stacking context sits under the top bar (room.css: .rs-foot 2 < .rs-top 3),
  // so at a large 文字大小 the top bar's text drew over the sheet's header: while it is open the footer goes on top
  useEffect(() => {
    if (!(short && open)) return undefined;
    const root = document.documentElement;
    root.classList.add('rs-chat-open');
    return () => root.classList.remove('rs-chat-open');
  }, [short, open]);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    if (atBottom.current) setNewCount(0);
  };
  const toBottom = () => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setNewCount(0);
  };

  const fit = (el) => {
    const caret = el.selectionStart ?? el.value.length;
    const out = fitChatInput(el.value, CHAT_LINE_LETTERS, caret);
    if (out.value !== el.value) { el.value = out.value; el.setSelectionRange(out.caret, out.caret); }
    setText(out.value);
  };
  const cooling = coolUntil > now;
  const send = () => {
    const line = chatLine(text);
    if (!line || cooling || paused || !online || !seated) return;
    if (!net.send('room.chat', { x: line })) return;
    const at = Date.now();
    setText('');
    setCoolUntil(at + ROOM_CHAT_GAP_MS);
    store.set((s) => ({
      roomChat: roomChatAppend(s.roomChat?.code === room.code ? s.roomChat : roomChatFor(room.code), [{ id: myId, n: s.me?.name || '', x: line, at }]),
      emotes: [...s.emotes.slice(-(EMOTE_KEEP - 1)), chatEntry(myId, line, at)],
    }));
    atBottom.current = true;
  };
  const sendEmote = (id) => {
    if (!net.send('room.emote', { id })) return;
    store.set((s) => ({ emotes: [...s.emotes.slice(-(EMOTE_KEEP - 1)), { seq: nextBubbleSeq(), playerId: myId, id, at: Date.now() }] }));
  };
  const onKeyDown = (e) => {
    e.stopPropagation(); // typing is not the screen's hotkeys
    if (e.key === 'Escape') e.target.blur();
    else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
  };
  const toggleExpand = () => { const v = !expanded; setExpanded(v); savePref(EXPAND_KEY, v); };

  const typed = letterCount(cleanChat(text));
  const pausedLeft = paused ? Math.ceil((rc.pausedUntil - now) / 1000) : 0;
  const placeholder = !seated ? t('观战席只能查看聊天') // en: "Spectators can only read the chat"
    : paused ? t('已暂停：还剩 {n} 秒', { n: pausedLeft }) // en: "Paused: {n} s left"
      : t('说点什么…（回车发送）'); // en: "Say something… (Enter to send)"
  const unread = short && !open ? lines.filter((l) => l.seq > seenSeq && !l.sys && l.id !== myId).length : 0;
  const last = [...lines].reverse().find((l) => !l.sys);

  // msgids — 聊天 en: "Chat"; 同盟聊天 en: "Alliance chat"; 收起聊天 en: "Dock chat"; 展开聊天 en: "Expand chat";
  // ↓ {n} 条新消息 en: "↓ {n} new messages"; 聊天输入 en: "Chat message"; 每条最多 {n} 字 en: "At most {n} letters a line"
  if (short && !open) {
    return html`<div class="clog-mini" data-testid="room-chat-mini">
      <button type="button" class="clog-mini__btn" data-testid="room-chat-open" onClick=${() => setOpen(true)}>
        <${Icon} name="chat" /><span>${t('聊天')}</span>${unread ? html`<b class="clog-mini__badge num">${unread > 99 ? '99+' : unread}</b>` : null}</button>
      ${last ? html`<div class="clog-mini__last" dir="auto"><b class=${senderClass(room, myId, last.id)}>${last.n || t('博士')}:</b> ${last.x}</div>` : null}
    </div>`;
  }
  const emotes = seated ? html`<${EmoteWheel} open=${emoteOpen} onToggle=${setEmoteOpen} onSend=${sendEmote} disabled=${!online} />` : null;
  // docked (desktop): no header — the input row carries the emotes and ⤢, so the log fits under the seat cards even at
  // 720p; the sheet (short screens) has a header with its title and ✕
  return html`<section class=${`clog${expanded && !short ? ' is-expanded' : ''}${short ? ' is-sheet' : ''}`} data-testid="room-chat" aria-label=${t('同盟聊天')}>
    ${short ? html`<header class="clog__head">
      <b>${t('同盟聊天')}</b>
      <span class="clog__sp"></span>
      <button type="button" class="clog__mini" data-testid="room-chat-close" onClick=${() => setOpen(false)} title=${t('关闭')} aria-label=${t('关闭')}><${Icon} name="close" /></button>
    </header>` : null}
    <div class="clog__list" ref=${list} onScroll=${onScroll} role="log" aria-live="polite">
      ${lines.map((l) => html`<div key=${l.seq} class="clog__line" dir="auto">
        ${l.sys ? null : html`<span class="clog__t num">${clock(l.at)}</span>`}
        ${l.sys ? html`<${LineBody} l=${l} />` : html`<b class=${`clog__n ${senderClass(room, myId, l.id)}`}>${l.n || t('博士')}:</b> <span class="clog__x">${l.x}</span>`}
      </div>`)}
    </div>
    ${newCount ? html`<button type="button" class="clog__new" data-testid="room-chat-new" onClick=${toBottom}>
      ${t('↓ {n} 条新消息', { n: newCount })}</button>` : null}
    <div class="clog__in">
      <input ref=${input} type="text" class="clog__box" value=${text} disabled=${!seated || !online || paused} placeholder=${placeholder}
        aria-label=${t('聊天输入')} autocomplete="off" enterkeyhint="send" dir="auto" data-testid="room-chat-input"
        onInput=${(e) => { if (e.isComposing) setText(e.target.value); else fit(e.target); }} onCompositionEnd=${(e) => fit(e.target)} onKeyDown=${onKeyDown} />
      <span class="clog__cnt num" title=${t('每条最多 {n} 字', { n: CHAT_LINE_LETTERS })}>${typed}/${CHAT_LINE_LETTERS}</span>
      <button type="button" class="btn btn--primary btn--sm clog__send" data-testid="room-chat-send" disabled=${!typed || cooling || paused || !online || !seated}
        onClick=${send}><span class="btn__label">${t('发送')}</span></button>
      ${emotes}
      ${short ? null : html`<button type="button" class="clog__mini" data-testid="room-chat-expand" onClick=${toggleExpand}
        title=${expanded ? t('收起聊天') : t('展开聊天')} aria-label=${expanded ? t('收起聊天') : t('展开聊天')}>${expanded ? '⤡' : '⤢'}</button>`}
    </div>
  </section>`;
}
