// public/dev/sandbox-variants.js — (fork, dev only) the dev sandbox's wave variant picker: a round's enemies as the match
// generates them for one enemy type (特训敌人: Special, Flying, Frequency, Elements, Continuous, Invisible, Refraction —
// official activity_table autoChessData.enemyTypeDatas, data/factions.json `types`), on any map and in any version.
//
// Nothing here re-implements the generator: `waves` is server/match/waves.js itself (served for the page at
// /match/waves.js, server/http/botModules.js) and `gd` a GameData of the version's data (/match/gamedata.js), so a chosen
// variant spawns exactly the units a match round of that type and entry spawns (roundEntryCandidates, pickRoundEntry,
// buildNormalWave / buildBossWave). Node tests pass the same modules from server/match.

/** The select value of "no variant chosen": the captured round as it is (the match seed's own pick). */
export const OFFICIAL = '';

/**
 * The variants a round can draw: every enemy type with at least one entry for the round's half in this mode (a type
 * without one falls back to SPECIAL in the match, so it is no variant of its own), in the official sortId order.
 * @param {any} waves server/match/waves.js
 * @param {any} gd GameData of the version and mode
 * @param {number} round
 * @returns {{ type: string, sortId: number, entries: { key: string, weight: number }[] }[]}
 */
export function variantList(waves, gd, round) {
  const types = gd.factions?.types && typeof gd.factions.types === 'object' ? gd.factions.types : {};
  return Object.values(types).filter((t) => t && typeof t.type === 'string')
    .map((t) => ({ type: t.type, sortId: Number.isFinite(t.sortId) ? t.sortId : 99, entries: waves.roundEntryCandidates(gd, t.type, round).map((e) => ({ key: e.key, weight: e.weight ?? 1 })) }))
    .filter((v) => v.entries.length)
    .sort((a, b) => a.sortId - b.sortId);
}

/**
 * Which variant a captured round shows: the entry whose key spawns in a special slot (`mods.slot` S / SF, the template
 * placeholder it replaced), else the entry whose attached normal / elite keys spawn in the N / E slots (a round whose
 * special enemy's movement class skipped every special action). Another entry's key can spawn as an attached elite
 * (enemy_1170_dushld is enemy_1174_duholy's E), so the slot decides, not the key alone.
 * @returns {{ type: string, key: string } | null}
 */
export function capturedVariant(waves, gd, round, spawns) {
  const bySlot = (re) => new Set((Array.isArray(spawns) ? spawns : []).filter((s) => s && re.test(String(s.mods?.slot ?? ''))).map((s) => s.enemyKey));
  const special = bySlot(/^SF?$/);
  const normal = bySlot(/^NF?$/);
  const elite = bySlot(/^EF?$/);
  const all = variantList(waves, gd, round).flatMap((v) => waves.roundEntryCandidates(gd, v.type, round));
  const hit = all.find((e) => special.has(e.key));
  if (hit) return { type: hit.type, key: hit.key };
  const keys = (l) => (Array.isArray(l) ? l : []).map((x) => (typeof x === 'string' ? x : x && x.key));
  const score = (e) => (keys(e.N).some((k) => normal.has(k)) ? 1 : 0) + (keys(e.E).some((k) => elite.has(k)) ? 1 : 0);
  let best = null;
  for (const e of all) if (score(e) > (best ? score(best) : 0)) best = e;
  return best ? { type: best.type, key: best.key } : null;
}

/**
 * A round's wave for one variant: the match's pick of that type (the chosen entry, else the official weighted draw with
 * `rng`) and the round template with it applied — a normal round (buildNormalWave) or a boss / hidden field's
 * (buildBossWave: its escorts follow the pick; `bossId`, `solo` as the captured field).
 * @param {{ round: number, kind: string, type: string, entryKey?: string|null, bossId?: string|null, solo?: boolean }} o
 * @returns {{ pick: any, templateId: string|null, routes: any[], spawns: any[], timeLimit: number, overrides: any }}
 */
export function variantWave(waves, gd, rng, { round, kind, type, entryKey = null, bossId = null, solo = false }) {
  const pick = waves.pickRoundEntry(gd, rng, type, round, { entryKey });
  const setup = { picks: [] };
  setup.picks[round] = pick;
  const w = kind === 'boss' || kind === 'hidden'
    ? waves.buildBossWave(gd, rng, setup, round, { bossId, solo })
    : waves.buildNormalWave(gd, rng, setup, round);
  return { pick, templateId: w.templateId, routes: w.routes, spawns: w.spawns, timeLimit: w.timeLimit, overrides: w.overrides };
}
