// (fork, GitHub #107) The bot profiles a room's host can give an AI seat, and the presets of 「用 AI 填满空位」.
// Ids are registered strategies (server/match/botStrategies.js; a test checks each). `external` is never listed: it is
// a dev checkout's LLM host, not a room choice. The first entry is the default and is what an AI seat plays when the
// host picks nothing; room.state names a seat's bot only when it is another one, so a default room's state is unchanged.
import { N_ } from './i18n.js';

/** @typedef {{ id: string, label: string, desc: string }} RoomBot */

/** @type {readonly RoomBot[]} */
export const ROOM_BOTS = Object.freeze([
  { id: 'legacy', label: N_('基础 AI'), desc: N_('原版 AI，未选择时的默认') },
  { id: 'fish-level', label: N_('升级曲线'), desc: N_('按模式长度换算的升级曲线，其余同基础 AI') },
  { id: 'fish-tier6', label: N_('六星优先'), desc: N_('优先购买六星干员，升级到 6 级，其余同基础 AI') },
  { id: 'evobot', label: N_('进化 AI'), desc: N_('进化搜索调出的基础 AI：后期卖掉低星单张干员，并购买叠层与资金道具') },
  { id: 'ioleta', label: N_('伊奥莱塔开局'), desc: N_('开局优先选择伊奥莱塔盟约') },
  { id: 'adaptive', label: N_('自适应布阵'), desc: N_('按地图搜索部署位置') },
  { id: 'ioleta-adaptive', label: N_('伊奥莱塔开局 + 自适应布阵'), desc: N_('伊奥莱塔开局，并按地图搜索部署位置') },
].map((b) => Object.freeze(b)));

export const DEFAULT_ROOM_BOT = ROOM_BOTS[0].id;

/** @param {unknown} id @returns {boolean} */
export const isRoomBot = (id) => typeof id === 'string' && ROOM_BOTS.some((b) => b.id === id);

/** @param {string | undefined | null} id @returns {RoomBot} the entry, or the default's for an unknown / missing id */
export const roomBot = (id) => ROOM_BOTS.find((b) => b.id === id) || ROOM_BOTS[0];

/**
 * 「用 AI 填满空位」: each preset gives the bot id of every seat it fills. More are planned (#107): 「推荐」, a stable set
 * with a high win rate, and 「最强」, a team from the bot research.
 * @typedef {{ id: string, label: string, bots: (count: number) => string[] }} FillPreset
 * @type {readonly FillPreset[]}
 */
export const FILL_PRESETS = Object.freeze([
  { id: 'basic', label: N_('全部基础 AI'), bots: (count) => Array.from({ length: count }, () => DEFAULT_ROOM_BOT) },
].map((p) => Object.freeze(p)));

/** @param {unknown} id @returns {boolean} */
export const isFillPreset = (id) => typeof id === 'string' && FILL_PRESETS.some((p) => p.id === id);
