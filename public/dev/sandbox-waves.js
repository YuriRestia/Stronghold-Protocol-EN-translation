// Sandbox enemy waves (dev, fork; public/dev/sandbox.js): the enemy side of a sandbox battle. A wave is the stage, the
// routes and the spawn list of a captured BattleSpec — every normal round 1–13 of a HARD bot match
// (public/dev/sandbox/*.json, `node tools/capture-specs.mjs --kind normal --out public/dev/sandbox`) — or an empty one
// the page fills enemy by enemy. Edited waves are kept as presets in this browser (localStorage PRESETS_KEY), never on
// the server.
//
// Every map a HARD match draws has its own 13 rounds (`--stages`: one bot match per stage, public/dev/sandbox/<stageId>/);
// a round is named by its file (hard-normal-rN), so `&map=` + `&enemies=` pick one. Each map also has its Final Assault
// (hard-boss-r14) and Hidden Core (hard-hidden-r15): fought on the boss field (`--stages --kind boss,hidden`).
// A wave: { base, routes, spawns, timeLimit } — `base` the captured spec it was made from (stage, rect, flags, the time
// limit's floor), `routes` the BattleSpec routes the spawns index (a captured round's own, then the catalogue routes
// added spawns picked), `spawns` BattleSpec spawn entries ({ time, enemyKey, routeIndex, count, interval, mods, … }).

export const PRESETS_KEY = 'sp.dev.sandbox.waves';
/** The wave a page without `&enemies=` opens (the last normal round). */
export const DEFAULT_WAVE = 'hard-normal-r13';
/** The map a page without `&map=` opens, and the map of a preset saved before maps could be picked. */
export const DEFAULT_MAP = 'act2autochess_m01';
export const LEGACY_STAGE = 'act2autochess_m01';
/** The captured battle kinds the sandbox offers, and the ones fought on the boss field. */
export const WAVE_KINDS = new Set(['normal', 'boss', 'hidden']);
export const BOSS_KINDS = new Set(['boss', 'hidden']);
/** The wave picker's name of a captured battle (an index row or a b.start: `kind`, `round`). */
export function waveTitle({ kind, round }) {
  if (kind === 'boss') return `Final Assault (round ${round})`;
  if (kind === 'hidden') return `Hidden Core (round ${round})`;
  return `Round ${round} waves`;
}
/** `&enemies=` of the empty wave and the prefix of a preset's. */
export const EMPTY = 'empty';
export const PRESET_PREFIX = 'preset:';

/**
 * The captured rounds of every map: the sandbox's own list (one bot match per stage, `dir` = its stage folder), else the
 * battle perf page's (its one normal round). Each row: { name, round, stageId, url }.
 */
export async function loadRoundIndex(fetchFn = globalThis.fetch) {
  for (const dir of ['/dev/sandbox/', '/dev/perf/']) {
    const list = await fetchFn(`${dir}index.json`).then((r) => (r.ok ? r.json() : null), () => null);
    const rounds = Array.isArray(list) ? list.filter((s) => s && WAVE_KINDS.has(s.kind) && s.stageId) : [];
    if (rounds.length) {
      return rounds.sort((a, b) => a.round - b.round)
        .map((s) => ({ ...s, url: `${dir}${s.dir ? `${encodeURIComponent(s.dir)}/` : ''}${encodeURIComponent(s.name)}.json` }));
    }
  }
  return [];
}

/** The maps that have captured rounds, in data order of `stageIds` (unknown ones last). */
export function mapsOf(rounds, stageIds = []) {
  const have = [...new Set(rounds.map((s) => s.stageId))];
  const at = (id) => { const i = stageIds.indexOf(id); return i < 0 ? 1e9 : i; };
  return have.sort((a, b) => at(a) - at(b) || a.localeCompare(b));
}

/** The saved presets: [{ name, base, routes, spawns, timeLimit }] (junk dropped). */
export function loadPresets(store = globalThis.localStorage) {
  try {
    const list = JSON.parse(store?.getItem(PRESETS_KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === 'string' && p.name && Array.isArray(p.spawns) && Array.isArray(p.routes)) : [];
  } catch { return []; }
}

/** Save (or replace, by name) one preset; returns the new list. */
export function savePreset(preset, store = globalThis.localStorage) {
  const list = loadPresets(store).filter((p) => p.name !== preset.name);
  list.push(JSON.parse(JSON.stringify(preset)));
  list.sort((a, b) => a.name.localeCompare(b.name));
  store?.setItem(PRESETS_KEY, JSON.stringify(list));
  return list;
}

/** Delete a preset by name; returns the new list. */
export function deletePreset(name, store = globalThis.localStorage) {
  const list = loadPresets(store).filter((p) => p.name !== name);
  store?.setItem(PRESETS_KEY, JSON.stringify(list));
  return list;
}

const routeSig = (r) => JSON.stringify(r);

/**
 * Every distinct route of the captured rounds of `stageId`, with the gate their spawns preview: [{ route, gate }].
 * @param {Array<{ spec: any }>} templates
 */
export function routeCatalogue(templates, stageId) {
  const seen = new Map();
  for (const t of templates) {
    const s = t?.spec;
    if (!s || s.stageId !== stageId) continue;
    (s.routes || []).forEach((route, i) => {
      const sig = routeSig(route);
      if (!route || seen.has(sig)) return;
      const gate = (s.spawns || []).find((sp) => sp.routeIndex === i)?.preview?.gate ?? null;
      seen.set(sig, { route, gate });
    });
  }
  return [...seen.values()];
}

/** A short text for a route: "Ground · lower gate (9,10) · 1 turn". */
export function routeLabel({ route, gate }) {
  const turns = Array.isArray(route?.checkpoints) ? route.checkpoints.length : 0;
  const waits = Array.isArray(route?.steps) ? route.steps.filter((s) => s?.t === 'wait').length : 0;
  return [route?.motion === 'FLY' ? 'Air' : 'Ground', `${gate ? `${gate} gate ` : ''}(${(route?.start || []).join(',')})`,
    turns ? `${turns} turn${turns > 1 ? 's' : ''}` : 'direct', waits ? 'waits' : ''].filter(Boolean).join(' · ');
}

/** The wave of a captured spec (its own routes and spawns). */
export function waveOfTemplate(name, template) {
  const s = template.spec;
  return { base: name, routes: JSON.parse(JSON.stringify(s.routes || [])), spawns: JSON.parse(JSON.stringify(s.spawns || [])), timeLimit: s.timeLimit };
}

/** An empty wave on the stage of `base`. */
export function emptyWave(base, template) {
  return { base, routes: [], spawns: [], timeLimit: template.spec.timeLimit };
}

/**
 * Add `count` enemies `enemyKey` to a wave (mutates it): from `time` s, one every `interval` s, along catalogue route
 * `entry` ({ route, gate }), HP / ATK scaled by `hpMul` / `atkMul`. Returns the spawn entry.
 */
export function addSpawn(wave, { enemy, entry, time, count, interval, hpMul = 1, atkMul = 1, ownerPlayerId = null }) {
  let routeIndex = wave.routes.findIndex((r) => routeSig(r) === routeSig(entry.route));
  if (routeIndex < 0) { wave.routes.push(JSON.parse(JSON.stringify(entry.route))); routeIndex = wave.routes.length - 1; }
  const actionIndex = wave.spawns.reduce((m, s) => Math.max(m, Number.isInteger(s.actionIndex) ? s.actionIndex + 1 : 0), 0);
  const s = {
    time, enemyKey: enemy.key, routeIndex, count, interval,
    mods: { hpMul, atkMul, speedMul: 1, slot: 'N' }, actionIndex,
    preview: { gate: entry.gate || 'lower', start: [...(entry.route.start || [])], fly: entry.route.motion === 'FLY', elite: enemy.rank === 'ELITE', boss: enemy.rank === 'BOSS' },
    ownerPlayerId,
  };
  wave.spawns.push(s);
  wave.spawns.sort((a, b) => a.time - b.time);
  return s;
}

/** The time limit a wave fights with: its base's, or longer when the last enemy comes later. */
export function waveTimeLimit(wave) {
  const last = wave.spawns.reduce((m, s) => Math.max(m, (Number(s.time) || 0) + Math.max(0, (Number(s.count) || 1) - 1) * (Number(s.interval) || 0)), 0);
  return Math.max(Number(wave.timeLimit) || 0, Math.ceil(last + 60));
}

/** The enemies a wave may add: not summon-only, active in `modeId`; sorted by name. */
export function enemyPool(enemies, modeId) {
  return enemies.filter((e) => e && e.key && !e.tokenOnly && !(Array.isArray(e.inactiveIn) && e.inactiveIn.includes(modeId)))
    .sort((a, b) => String(a.name || a.key).localeCompare(String(b.name || b.key)));
}
