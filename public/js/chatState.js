// public/js/chatState.js — the page's side of match chat (server/match/chatWallet.js decides everything): one sequence for
// the avatar bubbles (emotes and text), what the box accepts, and who the player muted. Muting is this page's own: it costs
// nothing to set, and the lines still arrive.

import { CHAT_LINE_LETTERS, chatBubbleMs } from '../../shared/constants.js';
import { chatDraft, cleanChat, letterCount } from '../../shared/text.js';

let bubbleSeq = 0;
/** The next bubble's seq: a newer bubble replaces the sender's old one, emote or text. */
export const nextBubbleSeq = () => ++bubbleSeq;

/** A text line as a `store.emotes` entry. @param {string} playerId @param {string} text @param {number} at */
export const chatEntry = (playerId, text, at) => ({ seq: nextBubbleSeq(), playerId, text, at, ttl: chatBubbleMs(letterCount(text)) });

/**
 * What the box may hold for a wallet of `left` letters (and never more than one line, CHAT_LINE_LETTERS), after an edit
 * that left the caret at `caret`. The text is filtered as typed (shared/text.js chatDraft: what the server would drop never
 * shows). What goes first is what was just typed or pasted, the code points before the caret; at the limit nothing more
 * goes in, not even a space at the end, which would cost nothing but looks like typing past it.
 * @param {string} value @param {number} left @param {number} [caret] UTF-16 index, default the end
 * @returns {{ value: string, caret: number }}
 */
export function fitChatInput(value, left, caret = value.length) {
  const max = Math.max(0, Math.min(left, CHAT_LINE_LETTERS));
  // after the filter a letter is at most 3 code points (2 marks): more than this can never fit, so it is not even counted
  const limit = max * 3 + 8;
  const at = Math.min(Math.max(0, caret), value.length);
  const head = [...chatDraft(value.slice(0, at))];
  const tail = [...chatDraft(value.slice(at))];
  if (head.length > limit) head.length = limit;
  if (tail.length > limit) tail.length = limit;
  const cost = () => letterCount(cleanChat(head.join('') + tail.join('')));
  while (head.length && cost() > max) head.pop();
  while (tail.length && cost() > max) tail.pop();
  if (cost() === max) {
    const dropFree = (part) => {
      while (part.length) {
        const last = part.pop();
        if (cost() !== max) { part.push(last); break; }
      }
    };
    dropFree(tail);
    if (!tail.length) dropFree(head);
  }
  const before = head.join('');
  return { value: before + tail.join(''), caret: before.length };
}

/** @param {string[] | null | undefined} mute the muted playerIds @param {string} playerId */
export const chatMuted = (mute, playerId) => !!mute && mute.includes(playerId);

/** @param {string[]} mute @param {string} playerId @returns {string[]} */
export const toggleChatMute = (mute, playerId) => (mute.includes(playerId) ? mute.filter((id) => id !== playerId) : [...mute, playerId]);
