// (fork) Player profile icons (头像): the official icons of data/avatars.json (tools/build-avatars.mjs, shared/avatars.js)
// or an operator's avatar — any operator a seat card may show (ui/seatArt.js cardOperators), worn in the player's outfit
// like the seat card — or 'Assistant Operator' (ASSISTANT_AVATAR): the operator of one's room seat card. A Doctor picks
// in the lobby (screens/lobby.js ProfileChip) or on their room seat card (screens/room.js); the pick is kept in this
// browser (AVATAR_PREF 'profile.avatar', like the 名片干员 of ui/seatArt.js) and sent as hello.avatar (net.js
// setAvatar; the Assistant pick as its operator's charId). Everybody sees it as room.state seats[].avatar,
// m.public / m.result players[].avatar.
// The official icons' art is the CN client's sprite pack, extracted as WebP (tools/local-extract/extract.py group
// `avatar`); the operators' is the avatar art every server has. Without the icon art the Icons tab is empty.
// [ASSUMED] A human with no pick, an unknown id, or an older client is drawn with the official default icon
// (playerAvatarData.defaultAvatarId); an AI teammate with its operator's avatar (as on its room seat card), else the robot.

import { createStore, loadPref, savePref, store, useStore } from '../store.js';
import { net } from '../net.js';
import { data, localAsset, useData } from '../data.js';
import { chessAvatarUrl } from './assetUrls.js';
import { CARD_KEY, cardStore, cardOperators, cardContext, seatOperator, seatCardSkin, botCharId } from './seatArt.js';
import { SKINS_KEY, skinsStore } from './skins.js';
import { settingsStore } from './settingsStore.js';
import { ASSISTANT_AVATAR, AVATAR_ID_MAX, avatarOrDefault, isOperatorAvatar, knownAvatar } from '../../../shared/avatars.js';

/** The pick's localStorage pref (sp.pref.profile.avatar). */
export const AVATAR_PREF = 'profile.avatar';
/** The store field of the pick. */
export const AVATAR_KEY = 'avatar';
/** The local art group of the official icons (data/local-assets.json). */
export const AVATAR_GROUP = 'avatar';

/** A stored pick as the store holds it: an icon id or an operator charId, '' for none. Not checked against the data. */
export function parseStoredAvatar(v) {
  return typeof v === 'string' && v.length <= AVATAR_ID_MAX && /^(avatar|char)_[A-Za-z0-9_]+$/.test(v) ? v : '';
}

/** This browser's pick (survives room / match resets like ui/seatArt.js' cardStore). */
export const avatarStore = createStore({ [AVATAR_KEY]: parseStoredAvatar(loadPref(AVATAR_PREF, '')) });

/**
 * The operator the Assistant pick stands for: the room card's pick, else the card's default operator (seatOperator: by
 * the player id, once the data and the id are known); null before that.
 * @param {{ card?: string, playerId?: any, list?: any[] | null }} [o]
 */
export function assistantCharId({ card = cardStore.get()[CARD_KEY], playerId = store.get().me?.playerId, list = null } = {}) {
  const ops = list ?? cardOperators(data.list('chess'), data.get('backups'));
  const op = seatOperator({ playerId, isBot: false }, cardContext(ops), { myId: playerId, myCard: card || '' });
  return op?.chess?.charId || (card || null);
}

/** What hello.avatar carries for a pick: the Assistant pick as its operator, anything else as it is (null = none). */
export function sentAvatar(pick, o) {
  if (!pick) return null;
  return pick === ASSISTANT_AVATAR ? assistantCharId(o) : pick;
}

const sync = () => net.setAvatar(sentAvatar(avatarStore.get()[AVATAR_KEY]));
// every hello carries the restored pick, from the first one on; the Assistant pick follows the room card, the data and
// the player id as they arrive
sync();
cardStore.subscribe?.((s, prev) => { if (s[CARD_KEY] !== prev?.[CARD_KEY]) sync(); });
data.subscribe?.((name) => { if (name === 'chess' || name === 'backups') sync(); });
store.subscribe?.((s, prev) => { if (s.me?.playerId !== prev?.me?.playerId) sync(); });

/**
 * Pick a profile icon ('' = none, the default icon): persisted at once and sent with a hello.
 * @param {string} id an icon id, an operator charId or ASSISTANT_AVATAR
 */
export function setAvatar(id) {
  const next = parseStoredAvatar(id);
  savePref(AVATAR_PREF, next);
  avatarStore.set({ [AVATAR_KEY]: next });
  sync();
}

/**
 * The icon id a player is drawn with — an official icon or an operator charId — or null (an AI teammate without an
 * operator, no catalog). One's own card shows this browser's pick at once, before the server has echoed it.
 * @param {{ isBot?: unknown, avatar?: unknown, name?: unknown } | null | undefined} player
 * @param {{ self?: boolean, mine?: string, catalog?: any, assistant?: string | null }} [opts]
 * @returns {string | null}
 */
export function playerAvatarId(player, { self = false, mine = '', catalog = data.get('avatars'), assistant = null } = {}) {
  if (!player) return null;
  if (player.isBot === true) return botCharId(player);
  if (self && mine) {
    const own = mine === ASSISTANT_AVATAR ? assistant : mine;
    if (knownAvatar(own, catalog) || isOperatorAvatar(own)) return own;
  }
  // another player's operator id was checked by the server (server/lobby.js avatarOf)
  if (isOperatorAvatar(player.avatar)) return /** @type {string} */ (player.avatar);
  return avatarOrDefault(player.avatar, catalog);
}

/**
 * The URL of an icon's art, or null (an official icon this server has not extracted).
 * @param {string | null} id
 * @param {{ skin?: string | null, bot?: boolean }} [o] an operator's outfit; an AI teammate wears the default
 */
export function avatarArtUrl(id, { skin = null, bot = false } = {}) {
  if (!id) return null;
  if (isOperatorAvatar(id)) return chessAvatarUrl(data.get('assets'), { charId: id }, bot ? { outfit: null } : { skin });
  return localAsset(AVATAR_GROUP, id);
}

/**
 * Hook: the art URL of a player's icon (null: draw the fallback — no catalog, no art).
 * @param {any} player
 * @param {boolean} [self]
 */
export function useAvatarArt(player, self = false) {
  useData('avatars', 'local', 'assets', 'chess', 'backups');
  const mine = useStore((s) => s[AVATAR_KEY], Object.is, avatarStore);
  const card = useStore((s) => s[CARD_KEY], Object.is, cardStore);
  const localSkins = useStore((s) => s[SKINS_KEY], Object.is, skinsStore);
  const otherSkins = useStore((s) => s.otherSkins !== false, Object.is, settingsStore);
  const myId = useStore((s) => s.me?.playerId ?? null);
  const assistant = self && mine === ASSISTANT_AVATAR ? assistantCharId({ card, playerId: myId }) : null;
  const id = playerAvatarId(player, { self, mine, assistant });
  const bot = player?.isBot === true;
  const skin = !bot && isOperatorAvatar(id)
    ? seatCardSkin(self ? { ...player, playerId: myId } : player, id, { myId, localSkins, players: [player], otherSkins })
    : null;
  return avatarArtUrl(id, { skin, bot });
}

/**
 * The picker's official groups: the catalog's groups (official order) with the icons this server has art for, each icon
 * with its name (translated by the data overlay) and whether that English name is our own (`unofficial`). Empty
 * without art.
 * @param {any} catalog data/avatars.json
 * @param {(id: string) => string | null} artOf
 * @returns {{ type: string, name: string, icons: { id: string, name: string, unofficial: boolean, src: string }[] }[]}
 */
export function pickerGroups(catalog, artOf = avatarArtUrl) {
  const out = [];
  for (const g of Array.isArray(catalog?.groups) ? catalog.groups : []) {
    const icons = [];
    for (const id of Array.isArray(g?.ids) ? g.ids : []) {
      const rec = knownAvatar(id, catalog) ? catalog.avatars[id] : null;
      const src = rec ? artOf(id) : null;
      if (src) icons.push({ id, name: String(rec.name || id), unofficial: rec.unofficial === true, src });
    }
    if (icons.length) out.push({ type: String(g.type), name: String(g.name || g.type), icons });
  }
  return out;
}
