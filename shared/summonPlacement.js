// Placement ranges that are independent of the summoner's attack range. Jessica's T1 in backups.json and PRTS
// 涤火杰西卡 / 天赋 says her shield may only stand on the four tiles next to her; op-jesca2.js already treats this as
// a prep placement rule. This symmetric grid uses the same rotation/translation helpers as owner-range summons.
const ADJACENT = Object.freeze([[0, 1], [1, 0], [0, -1], [-1, 0]].map((p) => Object.freeze(p)));

/** @returns {ReadonlyArray<ReadonlyArray<number>> | null} A fixed placement grid, or null to use the token's flags. */
export function summonPlacementGrid(tokenId) {
  return tokenId === 'token_10032_jesca2_jckshd' ? ADJACENT : null;
}
