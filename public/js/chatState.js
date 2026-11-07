// public/js/chatState.js — the page's side of match chat (server/match/chatWallet.js decides everything): one sequence for
// the avatar bubbles (emotes and text), what the box accepts, and who the player muted. Muting is this page's own: it costs
// nothing to set, and the lines still arrive.

import { CHAT_MAX_LETTERS, chatBubbleMs } from '../../shared/constants.js';
import { cleanChat, letterCount } from '../../shared/text.js';

let bubbleSeq = 0;
/** The next bubble's seq: a newer bubble replaces the sender's old one, emote or text. */
export const nextBubbleSeq = () => ++bubbleSeq;

/** A text line as a `store.emotes` entry. @param {string} playerId @param {string} text @param {number} at */
export const chatEntry = (playerId, text, at) => ({ seq: nextBubbleSeq(), playerId, text, at, ttl: chatBubbleMs(letterCount(text)) });

/** More than this cannot survive the chop (a huge paste), so it is not even looked at. */
const RAW_LIMIT = CHAT_MAX_LETTERS * 8;

/**
 * What the box may hold for a wallet of `left` letters, after an edit that left the caret at `caret`. What goes first is
 * what was just typed or pasted, the code points before the caret; at the limit nothing more goes in, not even a space at
 * the end, which would cost nothing but looks like typing past it.
 * @param {string} value @param {number} left @param {number} [caret] UTF-16 index, default the end
 * @returns {{ value: string, caret: number }}
 */
export function fitChatInput(value, left, caret = value.length) {
  const raw = value.slice(0, RAW_LIMIT);
  const head = [...raw.slice(0, caret)];
  const tail = [...raw.slice(caret)];
  const cost = () => letterCount(cleanChat(head.join('') + tail.join('')));
  while (head.length && cost() > left) head.pop();
  while (tail.length && cost() > left) tail.pop();
  if (cost() === left) {
    const dropFree = (part) => {
      while (part.length) {
        const last = part.pop();
        if (cost() !== left) { part.push(last); break; }
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
