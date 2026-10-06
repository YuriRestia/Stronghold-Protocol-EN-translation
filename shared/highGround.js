// shared/highGround.js — which MELEE chess may stand on a 高台 (a ranged deploy tile).
//
// The owner's decision of 2026-10-05, reversing the one of 2026-10-04 (elite 歌蕾蒂娅 with HOK-Y only): follow PRTS. A
// MELEE chess whose trait reads 「可以放置于远程位」 may stand on a 高台 as well as on the ground. The line is the 钩索师 /
// 推击手 branch trait (PRTS 歌蕾蒂娅 · 特性, raised with the PRTS source in PR #69 by @sunstricken; PRTS 新人入门: both
// branches "可部署在高台和地面"): 歌蕾蒂娅, 崖心 and 见行者, normal and elite. It is the branch's own text, not a module
// effect — every module of the three keeps it — so the loadout does not matter: any module, or none. The text read is
// the record's trait without a module (`traitBase`, which an elite with modules carries; else `trait`). A module talent
// such as the 教官's Y module ("可以额外部署在远程位") is a 部署效果, which 卫戍协议 switches off (PRTS 卫戍协议/帮助
// §战斗部署), and is not read. The battle keeps position MELEE: on a 高台 the unit attacks and blocks nothing.

/** The trait line that lets a MELEE chess stand on a ranged (高台) tile. */
export const PLACE_ON_RANGED = '可以放置于远程位'; // i18n-ok: match key for Chinese trait data

/**
 * The record's trait text without a module ('' when it has none).
 * @param {object|null} rec a chess record
 * @returns {string}
 */
export function baseTraitText(rec) {
  const t = rec ? rec.traitBase || rec.trait : null;
  return t && typeof t.desc === 'string' ? t.desc : '';
}

/**
 * Whether a MELEE chess record may also stand on a 高台: its trait reads 「可以放置于远程位」. Normal or elite, any module.
 * @param {object|null} rec a chess record (normal or golden)
 * @returns {boolean}
 */
export function meleeOnHighGround(rec) {
  return !!rec && rec.position === 'MELEE' && baseTraitText(rec).includes(PLACE_ON_RANGED);
}
