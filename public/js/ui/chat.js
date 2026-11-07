// public/js/ui/chat.js — the text side of the 交流 panel (ui/emotes.js EmoteWheel; server/match/chatWallet.js is the rule).
// The player types as many letters as last round's kills, and the box takes no more; the server chops anything over it
// whatever a page sends. The text itself shows as a bubble by the sender's avatar (ChatBubble, ui/emotes.js); there is no
// log and no history, on purpose. Muting is a button in the team panel (ui/teamPanel.js).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { CHAT_COOLDOWN_MS } from '../../../shared/constants.js';
import { t } from '../../../shared/i18n.js';
import { cleanChat, letterCount, chopChat } from '../../../shared/text.js';
import { chatEntry, fitChatInput } from '../chatState.js';
import { store, useStore } from '../store.js';
import { html } from './components.js';
import { actions } from './gameActions.js';

const EMOTE_KEEP = 20;

/**
 * The chat box's state. It lives with the game screen, not the panel: closing the panel must not forget a draft, the
 * letters already counted down or the cooldown.
 * @param {{ pub: any, priv: any, myId: string, online: boolean }} o priv: null for a spectator seat, which cannot write
 * @returns {{ available: boolean, left: number, round: number, text: string, setText: (v: string) => void, cooling: boolean, online: boolean, send: () => void }}
 */
export function useChatBox({ pub, priv, myId, online }) {
  const spectators = useStore((s) => (Array.isArray(s.room?.spectators) ? s.room.spectators.length : 0));
  const serverLeft = priv?.chatLeft;
  const round = priv?.chatRound ?? 0;
  const [left, setLeft] = useState(serverLeft ?? 0);
  // Spending marks nothing dirty on the server and a dropped line is never answered, so this page counts down by itself
  // and every m.private (a new `priv`) puts it right: a line the server dropped gives its letters back. A frame the server
  // built just before it read a line can overstate the count for a moment; the server chops anything over the real one.
  useEffect(() => { setLeft(serverLeft ?? 0); }, [priv]);
  const [text, setText] = useState('');
  const [cooling, setCooling] = useState(false);
  const coolTimer = useRef(null);
  useEffect(() => () => clearTimeout(coolTimer.current), []);
  // the wallet shrank under what is typed (a new round's smaller amount)
  useEffect(() => { setText((v) => fitChatInput(v, left).value); }, [left]);

  const others = Array.isArray(pub?.players) && pub.players.some((p) => !p.isBot && p.playerId !== myId);
  const send = () => {
    const line = chopChat(cleanChat(text), left);
    if (!line || cooling || !online || !actions.chat(line)) return;
    setLeft(left - letterCount(line));
    setText('');
    store.set((s) => ({ emotes: [...s.emotes.slice(-(EMOTE_KEEP - 1)), chatEntry(myId, line, Date.now())] }));
    setCooling(true);
    clearTimeout(coolTimer.current);
    coolTimer.current = setTimeout(() => setCooling(false), CHAT_COOLDOWN_MS);
  };
  return {
    // no wallet: a spectator, or the operator has chat off. Nobody to talk to: nothing to send either.
    available: Number.isInteger(serverLeft) && (others || spectators > 0),
    left, round, text, setText, cooling, online, send,
  };
}

/** @param {{ chat: ReturnType<typeof useChatBox>, onClose: () => void }} props */
export function ChatPane({ chat, onClose }) {
  const { left, round, text, setText, cooling, online, send } = chat;
  const input = useRef(null);
  useEffect(() => { input.current?.focus(); }, [left > 0]);

  // The box takes no more than the wallet. Preact only writes `value` when the state changes, and a refused letter leaves
  // the state as it was, so the DOM has to be put back here.
  const fit = (el) => {
    const caret = el.selectionStart ?? el.value.length;
    const out = fitChatInput(el.value, left, caret);
    if (out.value !== el.value) {
      el.value = out.value;
      el.setSelectionRange(out.caret, out.caret);
    }
    setText(out.value);
  };
  // an IME's half-typed text must not be cut, or the composition breaks: fit once it is committed
  const onInput = (e) => { if (e.isComposing) setText(e.target.value); else fit(e.target); };
  const onKeyDown = (e) => {
    e.stopPropagation(); // typing is not the game's hotkeys
    if (e.key === 'Escape') onClose();
    else if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
  };

  if (left <= 0) {
    return html`<div class="ewheel__text"><p class="ewheel__lock">${round > 0
      ? t('没有字数了，去杀敌吧') // en: "No letters left. Go kill something."
      : t('还没有击杀，只能发表情') // en: "No kills yet. Emotes only."
    }</p></div>`;
  }
  const typed = cleanChat(text);
  const placeholder = t('说点什么…'); // en: "Say something…"
  const lettersLeft = t('还可输入 {n} 字', { n: left }); // en: "{n} letters left"
  const sendText = t('发送'); // en: "Send"
  return html`<div class="ewheel__text">
    <div class="ewheel__field">
    <input ref=${input} class="ewheel__input" type="text" value=${text} disabled=${!online} placeholder=${placeholder}
      aria-label=${placeholder} autocomplete="off" enterkeyhint="send" dir="auto"
      onInput=${onInput} onCompositionEnd=${(e) => fit(e.target)} onKeyDown=${onKeyDown} />
    <span class="ewheel__left num" title=${lettersLeft}>${left - letterCount(typed)}</span>
    </div>
    <button type="button" class="btn btn--primary btn--sm ewheel__send" disabled=${!typed || cooling || !online}
      onClick=${send}><span class="btn__label">${sendText}</span></button>
  </div>`;
}
