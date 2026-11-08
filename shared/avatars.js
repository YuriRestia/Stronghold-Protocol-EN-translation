// (fork) Player profile icons (头像): the official icons of data/avatars.json (tools/build-avatars.mjs), or an operator's
// avatar — any operator a seat card may show (server/lobby.js cardCharIds, ui/seatArt.js cardOperators) — a Doctor picks
// in the lobby or on their room seat card (public/js/ui/avatars.js). The pick travels as `hello.avatar`; the server keeps
// only a known id (server/lobby.js avatarOf) and publishes it as room.state seats[].avatar, m.public / m.result
// players[].avatar. No free-form value is ever shown: an unknown id, or none (an older client), is the default icon.

/** The official default icon (display_meta_table playerAvatarData.defaultAvatarId). */
export const DEFAULT_AVATAR = 'avatar_def_01';

/** The longest id the protocol accepts (shared/protocol.js hello.avatar); the official ids are under 30 characters. */
export const AVATAR_ID_MAX = 48;

/**
 * The official 名片形象 icon (display_meta_table ASSISTANT, 'Assistant Operator'): the avatar of the account's assistant.
 * Here the operator of one's room seat card (ui/seatArt.js) stands in for the assistant; it is a browser-side pick only —
 * the page sends that operator's charId (ui/avatars.js sentAvatar), never this id.
 */
export const ASSISTANT_AVATAR = 'avatar_ass_01';

/** Whether a string has the shape of an operator id (char_<n>_<name>); the server checks it against its operators. */
export function isOperatorAvatar(id) {
  return typeof id === 'string' && id.length <= AVATAR_ID_MAX && /^char_\d+_[A-Za-z0-9_]+$/.test(id);
}

/**
 * A known icon id, or null: an icon of the catalog, or an operator of `operators` (the room's seat-card operators).
 * @param {unknown} id
 * @param {{ avatars?: Record<string, unknown> } | null | undefined} catalog data/avatars.json
 * @param {{ has(id: string): boolean } | null} [operators]
 * @returns {string | null}
 */
export function knownAvatar(id, catalog, operators = null) {
  if (typeof id !== 'string' || id.length > AVATAR_ID_MAX) return null;
  const all = catalog?.avatars;
  if (!!all && typeof all === 'object' && Object.hasOwn(all, id)) return id;
  return isOperatorAvatar(id) && !!operators && operators.has(id) ? id : null;
}

/**
 * The icon a player is drawn with: their known pick, else the catalog's default (null without a catalog).
 * @param {unknown} id
 * @param {{ defaultId?: unknown, avatars?: Record<string, unknown> } | null | undefined} catalog
 * @returns {string | null}
 */
export function avatarOrDefault(id, catalog, operators = null) {
  return knownAvatar(id, catalog, operators) ?? knownAvatar(catalog?.defaultId, catalog) ?? knownAvatar(DEFAULT_AVATAR, catalog);
}
