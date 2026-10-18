// Sandbox page (dev, fork): put the operators you want on the board and fight one real battle with them — the shared sim
// in the browser (js/battle/runner.js, like the battle perf page) feeding the field view (js/render/app.js). The stage,
// routes and enemy waves come from a captured BattleSpec of one normal round 1–13 (public/dev/sandbox/*.json, see
// sandbox-waves.js), an empty wave filled on the page, or a saved preset; the player's units are replaced by the board
// built here. Made to check how a model draws and fights (attacks, skills, the impostor box: docs/ASSETS.md `extents`)
// without playing a match up to the round that has it.
//
// Query: &units=<chessId>[~<charId>]:<row>,<col>[:<skillIndex>[:<dir>[:<outfitId>]]][!<itemId>[,<itemId>]];…  the board
//        (prep), e.g. chess_char_2_18_a:12,5:1:RIGHT:char_431_ashlok@epoque#28 (an outfit of data/outfits.json;
//        URL-encoded); `~<charId>` = the operator a 自选 slot (chess_char_5/6_diy*_a/_b) fields (shared/diy.js);
//        `!…` = its equipped items (data/items.json EQUIP, at most EQUIP_SLOTS)
//        &layers=<bondId>:<n>,… (the bonds' stacks) &bonus=<bondId>:<n>,… (extra members: the match's bondCountBonus)
//        &map=<stageId> (one of the 7 HARD maps, default act2autochess_m01; a preset belongs to the map it was saved on)
//        &enemies=hard-normal-rN | hard-boss-r14 (Final Assault) | hard-hidden-r15 (Hidden Core: both on the boss field,
//        the own pieces on its left half, the partner's captured board on the right) | empty | preset:<name> (default hard-normal-r13) &speed=1|2|4 &imp=0 (normal
//        rendering) &legacy=1 (old box) &fight=1 (start the battle on load) &notes=ours (Sakiko's notes drawn by our
//        fallback renderer instead of her official effects, to compare)
// Operators: the pool's (data/chess.json, normal and elite forms) and the Custom Squad picks (自选: the DIY slots of
// tier 5 / 6 filled with any operator a slot may field that has a kit — KITTED_CHARS; no module). 补位 stand-ins are not
// offered. Deploying is the match's prep: "Add to bench" puts the pick in the first free bench slot, then it is dragged
// onto the board (the field view's drag & drop, legal tiles highlighted from `canPlace`: the stage's melee / ranged
// classes, server/match/board.js) and the match's direction wheel (ui/facingWheel.js) picks its facing; a drop on its
// own tile turns it, on an occupied tile swaps, off the field sends a board unit back to the bench (a bench one is
// removed). The skill last picked for an operator is remembered (localStorage SKILL_KEY). The bench is not kept in the
// URL. A placed unit's skill and outfit can be changed from its entry in the list. Bonds are the match's: server/match/bondsMeta.js itself (served as /match/bondsMeta.js) counts the board and the
// bench, with the page's stacks (layers) and +count; the battle gets its bondSnapshot, so kits that stack bonds in battle
// (Battle.addLayers) do it here too. After a battle "Bank stacks" adds the result's layerGains the way the settlement
// does (bondsWithGains: capped at BOND_LAYER_CAP) and "Bank + next round" also loads the next round's waves — the board
// and the bench stay, so stacks grow round after round. PREP-side gains (shop / garrison effects) are not simulated: the
// stack inputs stand in for them. Items: per unit, the ids go into the battle input as in a match. In battle, Pause
// stops the runner's clock (setPaused) and holds the view on its newest frame (view.setFrozen); "+1 frame" / "+10 frames"
// step the sim exactly that many 1/30 s ticks (runner.stepPaused) and Resume goes on from there. Outfits are the sandbox's own per unit (the field view's
// `outfitOf` by uid), not the player's saved choice (ui/outfits.js), which this page neither reads nor changes. Sound:
// the game's audio manager (js/audio.js) with the player's volume settings — prep / combat BGM, battle SFX and voices.
// Puppeteer hook: window.__sandbox = { ready, error, view, runner, units(), bench(), wave(), fight(), prep(), facing,
// bonds(), layers(), gains(), bank(next), setWave(id), pause(on), step(n), tick(), lastResult, addBond(bondId, elite),
// ui, click(pieceClick event), camLayer('L' | 'ALL' | 'R'), boardUids() }
// The game's widgets ride on top (sandbox-ui.js): the bond strip (stacks, active state) and its popup, the detail card of
// a clicked piece / unit / enemy / boss with live HP and stats in battle, and icon pickers for operators (by bond) and
// items (by name). On a boss field in battle, "My side" / "Whole field" / "Partner's side" move the camera like the
// match's ‹ › pill.
// Core bond presets ("Add the whole bond"): every pool operator of a core bond in one click (see addBond).

import { render } from '../vendor/preact.module.js';
import { html } from '../js/ui/components.js';
import { createFieldView } from '../js/render/app.js';
import { data } from '../js/data.js';
import { assets } from '../js/assets.js';
import { genUrl } from '../js/gen.js';
import { createBattleRunner } from '../js/battle/runner.js';
import { deployMap, indexPieces } from '../js/ui/gameLogic/placement.js';
import { resolveDetail } from '../js/ui/detailPanel.js';
import { layerCamera } from '../js/battle/observe.js';
import { previewGrid } from '../js/ui/facing.js';
import { FacingWheel, holdPiece, setPieceDir, showRange } from '../js/ui/facingWheel.js';
import { inspectRange } from '../js/screens/game/range.js';
import { SEL_RANGE } from '../js/screens/game/marks.js';
import { rangePreviewStore } from '../js/ui/rangePreview.js';
import { settingsStore } from '../js/ui/settings.js';
import { loadLangIndex, loadLangChain } from '../js/ui/lang.js';
import { audio, installAudio, setOutfitVoiceResolver, combatTrackFor } from '../js/audio.js';
import { setOutfitPicker } from '../js/ui/assetUrls.js';
import { setLang } from '../../shared/i18n.js';
import { meleeOnHighGround } from '../../shared/highGround.js';
import { BOND_LAYER_CAP } from '../../shared/constants.js';
import { isOutfitOf } from '../../shared/outfits.js';
import { diySlotIds, diySlot, diyPool, diyRecord, isPrototypePick, lockedSelection } from '../../shared/diy.js';
import * as W from './sandbox-waves.js';
import { renderOverlay, operatorGroups, itemGroups } from './sandbox-ui.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const sb = { ready: false, error: null, facing: null };
globalThis.__sandbox = sb;

const DIRS = ['RIGHT', 'LEFT', 'UP', 'DOWN'];
/** The skill last picked per operator: { [charId]: skillIndex }. */
const SKILL_KEY = 'sp.dev.sandbox.skills';
/** Items a unit carries (the match's equipPerChess); a third replaces the oldest, like g.equip without a pick. */
const EQUIP_SLOTS = 2;

const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('is-error', error); };
const loadJson = (key, d) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? d; } catch { return d; } };
const num = (id, lo, hi, d) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

/** The board from the URL: [{ chessId, diy?, row, col, skillIndex, dir, skin }] (junk dropped; picks / `skin` checked later). */
function parseUnits(raw) {
  const out = [];
  for (const part of String(raw || '').split(';')) {
    const m = /^([a-z0-9_]+)(?:~([a-z0-9_]+))?:(\d+),(\d+)(?::(\d))?(?::([A-Z]+))?(?::([^:;!]+))?(?:!([a-z0-9_,]+))?$/.exec(part.trim());
    if (!m) continue;
    const skillIndex = m[5] != null ? +m[5] : 0;
    out.push({ chessId: m[1], ...(m[2] ? { diy: { charId: m[2], skillIndex, uniEquipId: null } } : null), row: +m[3], col: +m[4],
      skillIndex, dir: DIRS.includes(m[6]) ? m[6] : 'RIGHT', skin: m[7] || null, items: m[8] ? m[8].split(',').filter(Boolean).slice(0, EQUIP_SLOTS) : [] });
  }
  return out;
}
const unitsParam = (list) => list.map((u) => `${u.chessId}${u.diy ? `~${u.diy.charId}` : ''}:${u.row},${u.col}:${u.skillIndex}:${u.dir}${u.skin ? `:${u.skin}` : ''}${u.items?.length ? `!${u.items.join(',')}` : ''}`).join(';');
/** `<bondId>:<n>,…` → { [bondId]: n } (integers; junk and zeros dropped). */
function parseCounts(raw) {
  const out = {};
  for (const part of String(raw || '').split(',')) {
    const m = /^([A-Za-z0-9_]+):(-?\d+)$/.exec(part.trim());
    if (m && +m[2]) out[m[1]] = +m[2];
  }
  return out;
}
const countsParam = (o) => Object.entries(o).filter(([, n]) => n).map(([id, n]) => `${id}:${n}`).join(',');

/** The outfits of operator `charId` (data/outfits.json; every outfit is owned, docs/OUTFITS.md). */
const outfitsOf = (charId) => (data.list('outfits') || []).filter((r) => r && r.charId === charId);
const outfitLabel = (r) => (r.series ? `${r.name} · ${r.series}` : r.name || r.id);

/** English name of a record (its official appellation), else its Chinese one. */
const nameOf = (c) => c?.appellation || c?.name || '?';
const skillName = (s, i) => `S${i + 1} ${s?.name || s?.skillId || ''}`.trim();
const diyData = () => ({ chess: data.get('chess'), backups: data.get('backups') });
/** The record an entry fights as: the chess, or its 自选 slot filled with the pick. */
const recordOf = (u) => (u?.diy ? diyRecord(u.chessId, u.diy, { data: diyData() }) : data.lookup('chess', u?.chessId));
const unitLabel = (u) => {
  const c = data.lookup('chess', u.chessId);
  const r = recordOf(u);
  return `${nameOf(r)}${c?.isGolden ? ' (elite)' : ''} · T${c?.tier ?? '?'}${u.diy ? ' · custom' : ''}`;
};

async function main() {
  $('collapse').onclick = () => {
    const c = $('panel').classList.toggle('is-collapsed');
    $('collapse').textContent = c ? 'Show' : 'Hide';
    $('collapse').setAttribute('aria-expanded', String(!c));
  };

  await data.loadAll('chess', 'tokens', 'items', 'enemies', 'stages', 'bonds', 'config', 'backups', 'outfits', 'assets');
  // English game texts and interface strings (the direction wheel's)
  try { await loadLangIndex(); if (await loadLangChain('en')) setLang('en'); } catch { /* Chinese strings */ }
  try { await data.setLocale('en'); } catch { /* Chinese skill names */ }
  await assets.ready();
  // the operators a 自选 slot may field (server/lobby.js welcome.diyKitted); the same module URL as the browser sim's
  const kitted = await import(genUrl('/sim/content/kits/index.js')).then((m) => m.KITTED_CHARS || [], (e) => { console.warn('[sandbox] no kit list: no Custom Squad picks', e); return []; });
  // the match's bond rules (server/match/bondsMeta.js, served for this page as /match/bondsMeta.js)
  const BM = await import(genUrl('/match/bondsMeta.js')).catch((e) => { console.warn('[sandbox] no bond rules: bonds stay inactive', e); return null; });

  // ---- sound: the game's audio manager with the player's settings (BGM, battle SFX, voices) ---------------------------
  setOutfitPicker(null);   // ui/outfits.js (loaded with the direction wheel) must not dress the sandbox in the saved outfits
  installAudio({ getManifest: () => data.get('assets'), settings: settingsStore.get() });
  // the Settings dialog changes these live: volumes and the voice dub (the render options stay the sandbox's own)
  settingsStore.subscribe?.((s) => { try { audio.setVolumes(s); audio.setVoiceLang(s.voiceLang); audio.setVoiceNative(s.voiceNative); } catch { /* ignore */ } });

  // ---- the enemy waves ---------------------------------------------------------------------------------------------
  const allRounds = await W.loadRoundIndex();
  if (!allRounds.length) throw new Error('No enemy waves found: public/dev/sandbox/index.json lists no normal battle (node tools/capture-specs.mjs --stages --out public/dev/sandbox).');
  // the map: &map=, else the one of a preset named by &enemies=, else the default wave's
  let presets = W.loadPresets();
  const maps = W.mapsOf(allRounds, (data.list('stages') || []).map((s) => s.id));
  const presetOf = (id) => (String(id || '').startsWith(W.PRESET_PREFIX) ? presets.find((p) => W.PRESET_PREFIX + p.name === id) : null);
  const want = q.get('enemies') || W.DEFAULT_WAVE;
  const mapId = [q.get('map'), presetOf(want)?.stageId ?? (presetOf(want) ? W.LEGACY_STAGE : null), W.DEFAULT_MAP].find((m) => m && maps.includes(m)) || maps[0];
  const mapName = (id) => nameOf(data.lookup('stages', id)) || id;
  $('map').replaceChildren(...maps.map((id) => new Option(mapName(id), id)));
  $('map').value = mapId;
  const rounds = allRounds.filter((s) => s.stageId === mapId);
  const templates = new Map(await Promise.all(rounds.map(async (s) => [s.name, await fetch(s.url).then((r) => (r.ok ? r.json() : null), () => null)])));
  // presets are drawn on one map (their routes are its own); one saved before maps existed is of LEGACY_STAGE
  const mapPresets = () => presets.filter((p) => (p.stageId || W.LEGACY_STAGE) === mapId);
  const fillWaveSelect = () => {
    $('enemies').replaceChildren(...rounds.filter((s) => templates.get(s.name)).map((s) => new Option(W.waveTitle(s), s.name)),
      new Option('Empty wave (add enemies below)', W.EMPTY), ...mapPresets().map((p) => new Option(`Preset: ${p.name}`, W.PRESET_PREFIX + p.name)));
  };
  fillWaveSelect();
  const firstRound = templates.get(W.DEFAULT_WAVE) ? W.DEFAULT_WAVE : rounds.find((s) => templates.get(s.name))?.name;
  /** The wave `id` names on this map (a round, the empty wave or a preset; else the default round) and its template. */
  const waveOf = (id) => {
    const preset = mapPresets().find((p) => W.PRESET_PREFIX + p.name === id) || null;
    const waveId = templates.get(id) || id === W.EMPTY || preset ? id : firstRound;
    const baseName = preset && templates.get(preset.base) ? preset.base : templates.get(waveId) ? waveId : firstRound;
    const template = templates.get(baseName);
    if (!template) throw new Error('The enemy waves failed to load.');
    const wave = preset ? JSON.parse(JSON.stringify({ ...preset, base: baseName })) : waveId === W.EMPTY ? W.emptyWave(baseName, template) : W.waveOfTemplate(baseName, template);
    return { waveId, preset, template, wave };
  };
  // (another wave of this map swaps these in place: setWave below — the stage, routes and enemy pool stay the map's)
  let { waveId, preset, template, wave } = waveOf(want);
  $('enemies').value = waveId;
  if (preset) $('preset-name').value = preset.name;
  if (waveId === W.EMPTY) $('wave-edit').open = true;
  if (['1', '2', '4'].includes(q.get('speed'))) $('speed').value = q.get('speed');
  $('impostors').checked = q.get('imp') !== '0';
  $('legacy').checked = q.get('legacy') === '1';
  $('note-ours').checked = q.get('notes') === 'ours';

  const stage = data.lookup('stages', template.spec.stageId);
  // the deploy field of a wave: the normal board, or the own (left) half of the boss field (Final Assault / Hidden Core)
  const onBoss = (t) => W.BOSS_KINDS.has(t?.kind);
  const fieldOf = (t) => (onBoss(t) ? 'bossL' : 'normal');
  let tiles = deployMap(stage, { field: fieldOf(template) });   // 'r,c' (board) → 'melee' | 'ranged'
  const myId = template.spec.players[0]?.playerId ?? null;

  // the wave editor
  // (the routes of the waves fought on the same field: the boss field's routes are not the normal one's)
  const catalogueOf = (t) => W.routeCatalogue([...templates.values()].filter((x) => onBoss(x) === onBoss(t)), t.spec.stageId);
  let catalogue = catalogueOf(template);
  const foes = W.enemyPool(data.list('enemies'), template.spec.modeId);
  const foeLabel = (e) => `${e.name || e.key} · ${String(e.rank || 'NORMAL').toLowerCase()}${foes.filter((x) => x.name === e.name).length > 1 ? ` · ${e.key}` : ''}`;
  const foeByLabel = new Map(foes.map((e) => [foeLabel(e), e]));
  for (const e of foes) $('en-list').append(new Option(foeLabel(e)));
  let foe = null;
  const fillRoutes = () => {
    const keep = $('en-route').value;
    const fly = !!foe?.isFlyEnemy;
    const fits = catalogue.map((e, i) => ({ e, i })).filter(({ e }) => !foe || (e.route.motion === 'FLY') === fly);
    const list = fits.length ? fits : catalogue.map((e, i) => ({ e, i }));
    $('en-route').replaceChildren(...list.map(({ e, i }) => new Option(W.routeLabel(e), String(i))));
    if (list.some(({ i }) => String(i) === keep)) $('en-route').value = keep;
    $('en-add').disabled = !foe || !list.length;
  };
  $('en-search').oninput = () => {
    const v = $('en-search').value.trim();
    foe = foeByLabel.get(v) || foes.find((e) => String(e.name).toLowerCase() === v.toLowerCase() || e.key === v) || null;
    fillRoutes();
  };
  const renderWave = () => {
    $('wave-count').textContent = String(wave.spawns.length);
    $('wave-list').replaceChildren(...wave.spawns.map((s) => {
      const e = data.lookup('enemies', s.enemyKey);
      const li = document.createElement('li');
      li.innerHTML = '<span><b></b><small></small></span>';
      li.querySelector('b').textContent = `${s.count > 1 ? `${s.count}× ` : ''}${e?.name || s.enemyKey}`;
      const r = wave.routes[s.routeIndex];
      const mul = [s.mods?.hpMul, s.mods?.atkMul].some((m) => m != null && Math.abs(m - 1) > 1e-6) ? ` · HP×${+(s.mods.hpMul ?? 1).toFixed(2)} ATK×${+(s.mods.atkMul ?? 1).toFixed(2)}` : '';
      li.querySelector('small').textContent = `${s.time}s${s.count > 1 ? `, every ${s.interval}s` : ''} · ${r ? W.routeLabel({ route: r, gate: s.preview?.gate }) : '?'}${mul}`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', `Remove ${e?.name || s.enemyKey} at ${s.time}s`);
      rm.onclick = () => { wave.spawns = wave.spawns.filter((x) => x !== s); renderWave(); };
      li.append(rm);
      return li;
    }));
    if (!wave.spawns.length) {
      const li = document.createElement('li');
      li.className = 'sb-empty';
      li.textContent = 'No enemies yet: pick one below and add it.';
      $('wave-list').append(li);
    }
    $('preset-del').disabled = !$('enemies').value.startsWith(W.PRESET_PREFIX);
  };
  $('en-add').onclick = () => {
    const entry = catalogue[Number($('en-route').value)];
    if (!foe || !entry) return;
    W.addSpawn(wave, { enemy: foe, entry, time: num('en-time', 0, 600, 5), count: Math.round(num('en-count', 1, 50, 1)), interval: num('en-interval', 0, 60, 2),
      hpMul: num('en-hp', 0.1, 50, 1), atkMul: num('en-atk', 0.1, 50, 1), ownerPlayerId: myId });
    renderWave();
    status(`${foe.name || foe.key} added to the wave.`);
  };
  $('preset-save').onclick = () => {
    const name = $('preset-name').value.trim();
    if (!name) { status('Name the preset first.', true); $('preset-name').focus(); return; }
    if (!wave.spawns.length) { status('The wave is empty: add an enemy first.', true); return; }
    const other = presets.find((p) => p.name === name && (p.stageId || W.LEGACY_STAGE) !== mapId);
    if (other && !confirm(`A preset "${name}" exists on ${mapName(other.stageId || W.LEGACY_STAGE)}. Replace it?`)) return;
    presets = W.savePreset({ name, stageId: mapId, base: wave.base, routes: wave.routes, spawns: wave.spawns, timeLimit: wave.timeLimit });
    fillWaveSelect();
    $('enemies').value = waveId = W.PRESET_PREFIX + name;
    preset = mapPresets().find((p) => p.name === name) || null;
    sync();
    renderWave();
    status(`Preset "${name}" saved.`);
  };
  $('preset-del').onclick = () => {
    const id = $('enemies').value;
    if (!id.startsWith(W.PRESET_PREFIX)) return;
    const name = id.slice(W.PRESET_PREFIX.length);
    if (!confirm(`Delete the preset "${name}"?`)) return;
    presets = W.deletePreset(name);
    $('enemies').replaceChildren(new Option('', W.EMPTY));
    $('enemies').value = W.EMPTY;
    sync();
    location.reload();
  };
  fillRoutes();
  renderWave();

  // ---- the operator picker: the pool's chess and the Custom Squad picks ----------------------------------------------
  // { chess } | { charId, tiers: [5, 6] } — a 自选 pick fights in a slot of one of its tiers (the Form select)
  const dd = diyData();
  const slotOfTier = Object.fromEntries([5, 6].map((t) => [t, diySlotIds(dd).find((id) => diySlot(id, dd)?.tier === t) || null]));
  const diyTiers = new Map();
  for (const t of [5, 6]) if (slotOfTier[t]) for (const id of diyPool(t, { data: dd, kitted })) diyTiers.set(id, [...(diyTiers.get(id) || []), t]);
  const backupUnit = (charId) => dd.backups?.units?.[charId] || null;
  const pool = [
    ...data.list('chess').filter((c) => c && c.visible && !c.isDiy && c.charId).map((c) => ({ chess: c, name: nameOf(c), label: `${nameOf(c)}${c.isGolden ? ' (elite)' : ''} · T${c.tier}` })),
    ...[...diyTiers].map(([charId, tiers]) => ({ charId, tiers, rec: { ...backupUnit(charId), charId }, name: nameOf(backupUnit(charId)), label: `${nameOf(backupUnit(charId))} · Custom T${tiers.join('/')}` })),
  ].sort((a, b) => a.name.localeCompare(b.name) || Number(!!a.chess?.isGolden) - Number(!!b.chess?.isGolden));
  const byLabel = new Map(pool.map((p) => [p.label, p]));
  for (const p of pool) $('op-list').append(new Option(p.label));
  let current = null;
  const skillMemory = loadJson(SKILL_KEY, {});
  /** The pick as a board entry ({ chessId, diy? }) and its record, from the operator and the Form select. */
  const pick = () => {
    if (!current) return null;
    const v = $('op-elite').value;
    if (current.chess) {
      const c = current.chess;
      const rec = data.lookup('chess', v === '1' ? c.goldenId || c.chessId : c.baseId || c.chessId) || c;
      return { chessId: rec.chessId, rec, charId: rec.charId, skills: rec.skills?.length ? rec.skills : [rec.skill].filter(Boolean), locked: null };
    }
    const [tier, elite] = v.split(':').map(Number);
    const slot = diySlot(slotOfTier[tier], dd);
    if (!slot) return null;
    const chessId = elite ? slot.goldenId : slot.baseId;
    const lk = isPrototypePick(dd, tier, current.charId) ? lockedSelection(dd, tier, current.charId) : null;
    const rec = diyRecord(chessId, { charId: current.charId, skillIndex: lk ? lk.skillIndex : 0 }, { data: dd });
    if (!rec) return null;
    const skills = (rec.skills || []).filter((s) => !lk || s.index === lk.skillIndex);
    return { chessId, rec, charId: current.charId, skills, locked: lk };
  };
  const allows = (rec, key) => {
    const cls = tiles.get(key);
    if (!cls || !rec) return false;
    return cls === 'melee' || rec.position !== 'MELEE' || meleeOnHighGround(rec);
  };
  const fillForms = () => {
    const keepElite = /(^1$|:1$)/.test($('op-elite').value);
    const opts = !current || current.chess ? [['0', 'Normal'], ['1', 'Elite']]
      : current.tiers.flatMap((t) => [[`${t}:0`, `T${t} Normal`], [`${t}:1`, `T${t} Elite`]]);
    $('op-elite').replaceChildren(...opts.map(([v, l]) => new Option(l, v)));
    $('op-elite').value = (opts.find(([v]) => /(^1$|:1$)/.test(v) === keepElite) || opts[0])[0];
  };
  let lastChar = null;
  const refreshPicker = () => {
    const p = pick();
    const skins = p ? outfitsOf(p.charId) : [];
    const keepSkin = $('op-skin').value;
    $('op-skin').replaceChildren(new Option(skins.length ? 'Default' : 'Default (no outfits)', ''), ...skins.map((r) => new Option(outfitLabel(r), r.id)));
    if (skins.some((r) => r.id === keepSkin)) $('op-skin').value = keepSkin;   // the form switch keeps the outfit
    $('op-skin').disabled = !skins.length;
    // the skill: the one last picked for this operator, else the one shown (same operator, other form), else S1
    const keepSkill = p && p.charId === lastChar ? $('op-skill').value : null;
    $('op-skill').replaceChildren(...(p?.skills || []).map((s, i) => new Option(skillName(s, s.index ?? i), String(s.index ?? i))));
    const has = (v) => v != null && [...$('op-skill').options].some((o) => o.value === String(v));
    const remembered = p ? skillMemory[p.charId] : null;
    if (has(remembered)) $('op-skill').value = String(remembered);
    else if (has(keepSkill)) $('op-skill').value = keepSkill;
    $('op-skill').disabled = !!p?.locked;
    lastChar = p?.charId ?? null;
    const full = !bench.includes(null);
    $('op-add').disabled = !p || full;
    if (p && full) status('The bench is full: drag someone onto the board first.');
  };
  const rememberSkill = () => {
    const p = pick();
    if (!p || p.locked || $('op-skill').value === '') return;
    skillMemory[p.charId] = Number($('op-skill').value);
    try { localStorage.setItem(SKILL_KEY, JSON.stringify(skillMemory)); } catch { /* private mode */ }
  };
  $('op-search').oninput = () => {
    const v = $('op-search').value.trim();
    let p = byLabel.get(v) || pool.find((x) => !x.chess?.isGolden && x.name.toLowerCase() === v.toLowerCase()) || null;
    if (p?.chess?.isGolden) { p = pool.find((x) => x.chess && x.chess.chessId === p.chess.baseId) || p; $('op-elite').value = '1'; }
    current = p;
    fillForms();
    refreshPicker();
  };
  $('op-elite').onchange = refreshPicker;
  $('op-skill').onchange = rememberSkill;

  // ---- the board and the bench (the game's prep: drag a bench piece onto a highlighted tile) ----------------------
  let board = parseUnits(q.get('units')).filter((u) => {
    const rec = recordOf(u);
    if (u.skin && !(rec && isOutfitOf(rec.charId, u.skin) && outfitsOf(rec.charId).some((r) => r.id === u.skin))) u.skin = null;
    return rec && allows(rec, `${u.row},${u.col}`);
  });
  // waiting on the bench (the hand row, HAND_SIZE slots): { chessId, diy?, skillIndex, dir, skin } or null; not in the URL
  const BENCH = 10;
  const bench = Array(BENCH).fill(null);
  const sync = () => {
    const p = new URLSearchParams(location.search);
    if (board.length) p.set('units', unitsParam(board)); else p.delete('units');
    p.set('map', $('map').value);
    p.set('enemies', $('enemies').value);
    p.set('speed', $('speed').value);
    if ($('impostors').checked) p.delete('imp'); else p.set('imp', '0');
    if ($('legacy').checked) p.set('legacy', '1'); else p.delete('legacy');
    if ($('note-ours').checked) p.set('notes', 'ours'); else p.delete('notes');
    for (const [k, v] of [['layers', layers], ['bonus', bonus]]) { const s = countsParam(v); if (s) p.set(k, s); else p.delete(k); }
    p.delete('fight');
    history.replaceState(null, '', `${location.pathname}?${p}`);
  };
  const renderList = () => {
    const entries = [...board.map((u) => ({ u, where: `row ${u.row}, col ${u.col} · ${u.dir}` })),
      ...bench.filter(Boolean).map((u) => ({ u, where: 'bench' }))];
    $('squad').replaceChildren(...entries.map(({ u, where }) => {
      const rec = recordOf(u);
      const li = document.createElement('li');
      const sk = (rec?.skills || []).find((s, i) => (s.index ?? i) === u.skillIndex) || rec?.skill;
      li.innerHTML = '<span><b></b><small></small></span>';
      li.querySelector('b').textContent = unitLabel(u);
      const skin = u.skin ? outfitsOf(rec?.charId).find((r) => r.id === u.skin) : null;
      li.querySelector('small').textContent = `${skillName(sk, u.skillIndex)}${skin ? ` · ${skin.name}` : ''} · ${where}`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', `Remove ${nameOf(rec)}`);
      rm.onclick = () => {
        board = board.filter((x) => x !== u);
        const idx = bench.indexOf(u);
        if (idx >= 0) bench[idx] = null;
        changed();
      };
      li.append(rm, editRow(u, rec), itemRow(u, rec));
      return li;
    }));
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'sb-empty';
      li.textContent = 'Nobody yet: pick an operator above and add it to the bench.';
      $('squad').append(li);
    }
  };
  // a placed unit's skill and outfit, changed in place (a new outfit gets a new uid: the field view dresses a piece when it
  // builds it, so the piece is built again in the new look)
  const skillsOf = (u, rec) => {
    const all = rec?.skills?.length ? rec.skills : [rec?.skill].filter(Boolean);
    if (!u.diy) return { list: all, locked: false };
    const tier = data.lookup('chess', u.chessId)?.tier;
    const lk = isPrototypePick(dd, tier, u.diy.charId) ? lockedSelection(dd, tier, u.diy.charId) : null;
    return { list: all.filter((x) => !lk || x.index === lk.skillIndex), locked: !!lk };
  };
  const editRow = (u, rec) => {
    const box = document.createElement('div');
    box.className = 'sb-items';
    const { list, locked } = skillsOf(u, rec);
    const sk = document.createElement('select');
    sk.setAttribute('aria-label', `Skill of ${nameOf(rec)}`);
    sk.append(...list.map((x, i) => new Option(skillName(x, x.index ?? i), String(x.index ?? i))));
    sk.value = String(u.skillIndex);
    sk.disabled = locked || list.length < 2;
    sk.onchange = () => {
      const v = Number(sk.value);
      u.skillIndex = v;
      if (u.diy) u.diy = { ...u.diy, skillIndex: v };
      if (rec?.charId) { skillMemory[rec.charId] = v; try { localStorage.setItem(SKILL_KEY, JSON.stringify(skillMemory)); } catch { /* private mode */ } }
      changed();
      status(`${nameOf(rec)} now uses ${sk.selectedOptions[0]?.textContent || `S${v + 1}`}.`);
    };
    const skins = outfitsOf(rec?.charId);
    const of = document.createElement('select');
    of.setAttribute('aria-label', `Outfit of ${nameOf(rec)}`);
    of.append(new Option(skins.length ? 'Default outfit' : 'Default (no outfits)', ''), ...skins.map((r) => new Option(outfitLabel(r), r.id)));
    of.value = u.skin || '';
    of.disabled = !skins.length;
    of.onchange = () => {
      u.skin = of.value || null;
      delete u.uid;   // rebuilt in the new look
      changed();
      status(`${nameOf(rec)} now wears ${of.value ? of.selectedOptions[0]?.textContent : 'the default outfit'}.`);
    };
    box.append(sk, of);
    return box;
  };
  // the items a unit carries: a button per item (unequips it) and a picker (a third replaces the oldest)
  const equipList = (data.list('items') || []).filter((r) => r && r.itemType === 'EQUIP')
    .sort((a, b) => (a.tier - b.tier) || nameOf(a).localeCompare(nameOf(b)) || Number(!!a.isGolden) - Number(!!b.isGolden));
  const itemLabel = (r) => `${nameOf(r)}${r.isGolden ? ' (elite)' : ''} · T${r.tier ?? '?'}`;
  const itemRow = (u, rec) => {
    const box = document.createElement('div');
    box.className = 'sb-items';
    u.items ||= [];
    for (const [k, id] of u.items.entries()) {
      const r = data.lookup('items', id);
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `${r ? itemLabel(r) : id} ✕`;
      b.setAttribute('aria-label', `Unequip ${r ? nameOf(r) : id} from ${nameOf(rec)}`);
      b.onclick = () => { u.items.splice(k, 1); changed(); };
      box.append(b);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = u.items.length >= EQUIP_SLOTS ? '+ Item (replaces the oldest)' : '+ Item…';
    add.setAttribute('aria-label', `Equip an item on ${nameOf(rec)}`);
    add.onclick = () => openPicker({ kind: 'item', groups: itemGroupList, unitName: nameOf(rec), onPick: (r) => equip(u, rec, r.id) });
    box.append(add);
    return box;
  };
  /** Equip item `id` on unit `u` (a third item replaces the oldest). */
  const equip = (u, rec, id) => {
    const r = data.lookup('items', id);
    u.items = [...(u.items || []), id].slice(-EQUIP_SLOTS);
    changed();
    status(`${r ? nameOf(r) : id} equipped on ${nameOf(rec)}.`);
  };
  const itemGroupList = itemGroups(equipList);
  const summary = () => {
    const n = bench.filter(Boolean).length;
    if (!board.length && !n) return 'Add operators, then drag them onto the board.';
    return `${board.length} on the board${n ? `, ${n} on the bench (drag onto a highlighted tile)` : ''}.`;
  };

  // ---- bonds & stacks (the match's computeBonds on the board and the bench) ------------------------------------------
  let layers = parseCounts(q.get('layers'));   // the stacks per bond (ps.layers: they last the whole match)
  let bonus = parseCounts(q.get('bonus'));     // extra members per bond (ps.bondCountBonus)
  const roundLog = [];                         // banked battles: { title, got: { [bondId]: n }, after: { [bondId]: n } }
  let gains = null;                            // the last battle's layerGains (the own player's), until banked
  let live = null;                             // the running battle's stacks: runner state().bondLayers of the own player
  const bondIds = (data.list('bonds') || []).filter((b) => b && b.bondId)
    .sort((a, b) => ((Number.isFinite(a.identifier) ? a.identifier : 99) - (Number.isFinite(b.identifier) ? b.identifier : 99)) || (a.bondId < b.bondId ? -1 : 1)).map((b) => b.bondId);
  const bondName = (id) => nameOf(data.lookup('bonds', id)) || id;
  /** computeBonds / offBondCounts on a GameData stand-in (a 自选 pick counts as its own operator: `<slot>~<charId>`). */
  const bondState = () => {
    if (!BM) return null;
    const picks = new Map();
    const pieceOf = (u) => {
      const id = u.diy ? `${u.chessId}~${u.diy.charId}` : u.chessId;
      if (u.diy) picks.set(id, recordOf(u));
      return { kind: 'chess', id, items: (u.items || []).map((x) => ({ id: x })) };
    };
    const slotOf = (id) => String(id).split('~');
    const gd = {
      chess: (id) => picks.get(id) || data.lookup('chess', id),
      item: (id) => data.lookup('items', id),
      bond: (id) => data.lookup('bonds', id),
      baseIdOf: (id) => {
        const [c, charId] = slotOf(id);
        const base = data.lookup('chess', c)?.baseId || c.replace(/_b$/, '_a');
        return charId ? `${base}~${charId}` : base;
      },
      isGolden: (id) => !!data.lookup('chess', slotOf(id)[0])?.isGolden,
      bondIds,
      modeInactiveBonds: new Set(data.get('config')?.modes?.[template.spec.modeId]?.inactiveBondIds || []),
    };
    const ps = { board: new Map(board.map((u) => [`${u.row},${u.col}`, pieceOf(u)])), hand: bench.map((u) => (u ? pieceOf(u) : null)), layers, bondCountBonus: bonus };
    const bonds = BM.computeBonds(gd, ps);
    const off = BM.offBondCounts(gd, ps);
    // (the strip's list: m.private.bonds' shape — thresholds / countsHand, the mode-off bonds last)
    return { bonds, off, list: BM.bondList(gd, bonds, { full: true, off }), offIds: gd.modeInactiveBonds };
  };
  const intIn = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.trunc(Number(v) || 0)));
  const renderBonds = () => {
    const st = bondState();
    if (!st) {
      $('bond-list').replaceChildren(Object.assign(document.createElement('li'), { className: 'sb-empty', textContent: 'The bond rules did not load: bonds stay inactive.' }));
      renderUi();
      return;
    }
    const all = $('bond-all').checked;
    const rows = bondIds.map((id) => ({ id, b: st.bonds[id], off: st.off?.[id] })).filter(({ id, b, off }) => (b || off)
      && (all || off || b.count > 0 || b.active || layers[id] || bonus[id] || gains?.[id] || live?.[id]));
    rows.sort((x, y) => Number(!!y.b?.active) - Number(!!x.b?.active) || Number(!!x.off) - Number(!!y.off));
    $('bond-active').textContent = String(rows.filter((r) => r.b?.active).length);
    $('bond-list').replaceChildren(...rows.map(({ id, b, off }) => {
      const li = document.createElement('li');
      li.className = b?.active ? 'is-active' : off ? 'is-off' : '';
      li.innerHTML = '<span><b></b><small></small></span><span class="sb-nums"><label>+Count <input type="number" step="1" min="-9" max="9" /></label><label>Stacks <input type="number" step="1" min="0" /></label></span>';
      li.querySelector('b').textContent = bondName(id);
      const th = BM.thresholdsOf(data.lookup('bonds', id) || {});
      const now = live?.[id] != null ? ` · ${live[id]} in battle` : gains?.[id] ? ` · +${gains[id]} to bank` : '';
      li.querySelector('small').textContent = off ? `${off.count} member${off.count === 1 ? '' : 's'} · off in this mode`
        : `${b.count} member${b.count === 1 ? '' : 's'}${b.harmony ? ' (Harmony +1)' : ''} · tier ${b.tier}/${th.length} (${th.join('/')})${now}`;
      const [cnt, stk] = li.querySelectorAll('input');
      cnt.value = String(bonus[id] || 0);
      cnt.setAttribute('aria-label', `${bondName(id)} extra members`);
      cnt.onchange = () => { bonus[id] = intIn(cnt.value, -9, 9); sync(); renderBonds(); };
      stk.max = String(BOND_LAYER_CAP);
      stk.value = String(layers[id] || 0);
      stk.setAttribute('aria-label', `${bondName(id)} stacks`);
      stk.onchange = () => { layers[id] = intIn(stk.value, 0, BOND_LAYER_CAP); sync(); renderBonds(); };
      return li;
    }));
    if (!rows.length) $('bond-list').append(Object.assign(document.createElement('li'), { className: 'sb-empty', textContent: 'No bonds yet: place operators, or tick "Show every bond".' }));
    renderUi(st);
  };
  const renderLog = () => {
    $('round-log').replaceChildren(...roundLog.map((e) => Object.assign(document.createElement('li'), {
      textContent: `${e.title}: ${Object.entries(e.got).map(([id, n]) => `${bondName(id)} +${n} (→ ${e.after[id]})`).join(', ') || 'no stacks gained'}`,
    })));
  };
  const waveTitle = () => (preset ? `Preset ${preset.name}` : waveId === W.EMPTY ? 'Custom wave' : onBoss(template) ? W.waveTitle({ kind: template.kind, round: template.spec.round }) : `Round ${template.spec.round}`);
  /** The next round's waves on this map, if the current wave is a round and there is one. */
  const nextRound = () => (templates.get(waveId) ? rounds.find((s) => s.round === template.spec.round + 1 && templates.get(s.name))?.name ?? null : null);
  const setBankable = (on) => { $('bank').disabled = !on; $('bank-next').disabled = !on || !nextRound(); };
  $('bond-all').onchange = renderBonds;
  $('bond-reset').onclick = () => { layers = {}; bonus = {}; roundLog.length = 0; gains = null; setBankable(false); sync(); renderBonds(); renderLog(); status('Stacks and +count reset.'); };

  // ---- the field ---------------------------------------------------------------------------------------------
  const settings = () => ({ quality: 'high', damageNumbers: true, forceImpostors: $('impostors').checked, legacyImpostorBox: $('legacy').checked,
    noteFx: $('note-ours').checked ? 'ours' : 'official' });
  // the outfit of each unit, by board uid: prep pieces and battle units both carry it (prepState / me.units below)
  const skinByUid = new Map();
  const outfitOf = (info) => (info && info.side !== 'enemy' && info.kind !== 'token' ? skinByUid.get(info.uid) || null : null);
  // …and its voice set (data/outfits.json `voice`), for the battle voices (js/audio.js)
  setOutfitVoiceResolver((info) => {
    const id = info && info.side !== 'enemy' && (!info.kind || info.kind === 'op') ? skinByUid.get(info.uid) : null;
    return id ? (data.list('outfits') || []).find((r) => r && r.id === id)?.voice || null : null;
  });
  const view = await createFieldView($('field'), { data, assets, audio, settings: settings(), outfitOf });
  view.setStage(stage);
  const net = { on: () => () => {}, send() {}, request: async () => ({ ok: true }) };
  let runner = null;
  // every board / bench entry keeps one uid for the page's life: the field view keeps a piece's view across setPrep
  // calls by uid, so a moved piece glides instead of being rebuilt
  let nextUid = 1;
  const uidOf = (u) => u.uid ?? (u.uid = nextUid++);
  const piece = (u, extra) => {
    const c = data.lookup('chess', u.chessId);
    if (u.skin) skinByUid.set(uidOf(u), u.skin);
    return { uid: uidOf(u), kind: 'chess', id: u.chessId, golden: !!c?.isGolden, tier: c?.tier ?? 1, items: (u.items || []).map((id) => ({ id })), ...(u.diy ? { diy: u.diy } : null), ...extra };
  };
  const prepState = () => {
    skinByUid.clear();
    return {
      hand: bench.map((u) => (u ? piece(u) : null)), temp: Array(5).fill(null), nextEnemies: [],
      board: board.map((u) => piece(u, { row: u.row, col: u.col, dir: u.dir })),
    };
  };

  // ---- the overlay (sandbox-ui.js): the game's bond strip / popup and detail card, the icon pickers ------------------
  const ui = { bondOpen: null, target: null, picker: null };
  const uiHost = document.body.appendChild(document.createElement('div'));
  uiHost.id = 'sb-ui';
  /** The player's side as m.private shows it (the bond popup's member list, the detail card's own pieces). */
  const privOf = () => ({ playerId: myId, hand: bench.map((u) => (u ? piece(u) : null)), temp: [], board: board.map((u) => piece(u, { row: u.row, col: u.col, dir: u.dir })) });
  // the battle's newest snapshot tuples by unit id ([id, …, hp, max, …]: the detail card's HP bar)
  let snapUnits = new Map();
  /**
   * The card's loadout (the match's room.loadout shape, { [baseId]: { skill } }): the clicked unit's picked skill, so the
   * card — its skill, its 攻击范围 and the 技能 toggle — reads the skill it fights with. A 自选 card reads its pick.
   */
  const cardLoadout = (detail) => {
    if (detail?.type !== 'chess' || detail.diy || !detail.chess) return null;
    const uid = detail.piece?.uid ?? ui.target?.uid ?? detail.unit?.uid;
    const u = Number.isInteger(uid) ? locate(uid)?.u : null;
    if (!u || !Number.isInteger(u.skillIndex)) return null;
    return { [detail.chess.baseId || detail.chess.chessId]: { skill: u.skillIndex } };
  };
  /**
   * The open card's range on the field, as the match draws it (screens/game/range.js inspectRange, SEL_RANGE): an own
   * board piece in prep, an ally on the field in battle — with the card's 技能 toggle (ui/rangePreview.js) the range
   * while its skill runs. Nothing while the direction wheel draws its own.
   */
  const drawCardRange = (detail, priv, tuple, liveOf, loadout) => {
    let r = null;
    if (detail && !facing) {
      try {
        // a 自选 piece's card is a `chess` target (the card shows the pick): its range is the piece's
        const target = ui.target?.kind === 'chess' && Number.isInteger(ui.target.uid) ? { kind: 'piece', uid: ui.target.uid } : ui.target;
        r = inspectRange({
          target, detail, pieces: indexPieces(priv), showPrep: !runner, field: battleField, snapshot: tuple,
          live: liveOf ? liveOf() : null, loadout, getChess: (id) => data.lookup('chess', id), backups: data.get('backups'),
          skill: rangePreviewStore.get().skill,
        });
      } catch (e) { console.warn('[sandbox] card range', e); }
    }
    sb.cardRange = r; // (the e2e test reads the drawn range)
    showRange(view, r?.grid, r?.row, r?.col, r?.dir, SEL_RANGE);
  };
  rangePreviewStore.subscribe(() => renderUi());
  const renderUi = (st = bondState()) => {
    // in battle the strip shows the stacks as they grow (runner state().bondLayers), like the match's strip
    const list = (st?.list || []).map((b) => (live?.[b.bondId] != null ? { ...b, layers: live[b.bondId] } : b));
    const priv = privOf();
    let detail = null;
    try { detail = ui.target ? resolveDetail(ui.target, indexPieces(priv), { priv }) : null; } catch (e) { console.warn('[sandbox] detail', e); }
    const unitId = detail?.unitId;
    const tuple = unitId != null ? snapUnits.get(unitId) : null;
    const loadout = cardLoadout(detail);
    const liveOf = unitId != null && runner ? () => { const e = runner?.unitStats?.(unitId); return e ? { ...e, src: 'battle' } : null; } : null;
    drawCardRange(detail, priv, tuple, liveOf, loadout);
    renderOverlay(uiHost, {
      bonds: list, layersDisabled: onBoss(template), bondOpen: ui.bondOpen, priv, offBonds: st?.offIds || new Set(), detail,
      snapHp: tuple ? { hp: tuple[3], max: tuple[4] } : null,
      live: liveOf, loadout,
      picker: ui.picker,
      settings: ui.settings,
      meter: meterShown() ? meter || { title: 'no battle yet', rows: [], other: [], byBond: [], totals: { dmg: 0, heal: 0, taken: 0, stacks: 0 } } : null,
      meterTab: ui.meterTab,
      on: {
        meterTab: (k) => { ui.meterTab = k; renderUi(); },
        closeMeter: () => { $('meter').checked = false; renderUi(); },
        openBond: (id) => { ui.bondOpen = ui.bondOpen === id ? null : id; renderUi(); },
        closeBond: () => { ui.bondOpen = null; renderUi(); },
        member: (id, items, _standInFor, diy) => { ui.target = { kind: 'chess', id, items: items || null, ...(diy ? { diy, foreign: true } : null) }; renderUi(); },
        closeDetail: () => { ui.target = null; renderUi(); },
        pick: (e) => { const p = ui.picker; ui.picker = null; renderUi(); p?.onPick?.(e.pick); },
        closePicker: () => { ui.picker = null; renderUi(); },
        closeSettings: () => { ui.settings = false; renderUi(); },
      },
    });
  };
  const openPicker = (p) => { ui.picker = p; renderUi(); };
  // the game's own settings dialog (ui/settings.js): volumes reach the audio manager through settingsStore (above)
  $('settings').onclick = () => { ui.settings = true; renderUi(); };

  // ---- the battle meter: per own unit the sim's counters (unit.stats dmg / heal / taken; a summon counts for its
  // operator) and the stacks it gained. Stacks: Battle.prototype.addLayers is wrapped on this page only — it records what
  // each call added (with its source unit and reason) and changes nothing, so the battle stays bit-identical.
  const SimBattle = await import(genUrl('/sim/Battle.js')).then((m) => m.Battle, () => null);
  let stackLog = [];   // the current battle's gains of the own player: { source: unit|null, reason, bondId, n }
  if (SimBattle?.prototype?.addLayers && !SimBattle.prototype.addLayers.sandboxMeter) {
    const base = SimBattle.prototype.addLayers;
    const wrapped = function (playerId, bondId, n, reason = '', opts = {}) {
      const got = base.call(this, playerId, bondId, n, reason, opts);
      if (got > 0 && playerId === myId) stackLog.push({ source: opts?.source ?? null, reason: String(reason || ''), bondId, n: got });
      return got;
    };
    wrapped.sandboxMeter = true;
    SimBattle.prototype.addLayers = wrapped;
  }
  const REASON_LABEL = { bond: 'Bond effects', item: 'Items', band: 'Strategy', choice: 'Choices', garrison: 'Traits' };
  ui.meterTab = 'dmg';
  let meter = null;     // the last reading (kept after the battle until the next one starts)
  const readMeter = () => {
    const e = runner?._entries?.get(runner.state?.()?.battleId);
    const battle = e?.battle;
    if (!battle) return meter;
    const rows = new Map();
    const rowOf = (u) => {
      const own = u.kind === 'token' && u.ownerUnit && u.ownerUnit.kind === 'op' ? u.ownerUnit : u;
      const key = `${own.kind}:${own.uid ?? own.id}`;
      let r = rows.get(key);
      if (!r) {
        const entry = own.kind === 'op' ? board.find((b) => uidOf(b) === own.uid) : null;
        const rec = entry ? recordOf(entry) : own.kind === 'op' ? data.lookup('chess', own.defId) : data.lookup('tokens', own.defId);
        r = { key, kind: own.kind === 'token' ? 'token' : 'op', defId: entry ? entry.chessId : own.defId, rec: entry?.diy ? rec : null,
          name: nameOf(rec), dmg: 0, heal: 0, taken: 0, stacks: 0, bonds: {} };
        rows.set(key, r);
      }
      return r;
    };
    for (const u of Array.isArray(battle.allyUnits) ? battle.allyUnits : []) {
      if (!u || u.ownerId !== myId || (u.kind !== 'op' && u.kind !== 'token')) continue;
      const r = rowOf(u);
      r.dmg += Number(u.stats?.dmg) || 0;
      r.heal += Number(u.stats?.heal) || 0;
      r.taken += Number(u.stats?.taken) || 0;
    }
    const other = new Map();
    const byBond = new Map();
    for (const g of stackLog) {
      const src = g.source && (g.source.kind === 'op' || g.source.kind === 'token') && g.source.ownerId === myId ? g.source : null;
      const r = src ? rowOf(src) : (() => {
        const key = `other:${g.reason || 'content'}`;
        if (!other.has(key)) other.set(key, { key, label: REASON_LABEL[g.reason] || g.reason || 'Other effects', stacks: 0, bonds: {} });
        return other.get(key);
      })();
      r.stacks += g.n;
      r.bonds[g.bondId] = (r.bonds[g.bondId] || 0) + g.n;
      byBond.set(g.bondId, (byBond.get(g.bondId) || 0) + g.n);
    }
    const list = [...rows.values()];
    const sum = (k) => list.reduce((s, r) => s + r[k], 0);
    meter = {
      title: `${waveTitle()}${e.done || battle.finished ? ' · over' : ` · ${((battle.tickCount || 0) / 30).toFixed(1)} s`}`,
      rows: list, other: [...other.values()], byBond: [...byBond].sort((a, b) => b[1] - a[1]).map(([bondId, n]) => ({ bondId, n })),
      totals: { dmg: sum('dmg'), heal: sum('heal'), taken: sum('taken'), stacks: [...byBond.values()].reduce((s, n) => s + n, 0) },
      noGains: battle.flags?.layerGainsEnabled === false ? 'This field gains no stacks in battle (the official rule for boss fields).' : null,
    };
    return meter;
  };
  const meterShown = () => $('meter').checked;
  const opGroups = operatorGroups(pool, bondIds);
  $('op-browse').onclick = () => openPicker({ kind: 'op', groups: opGroups, onPick: (p) => {
    $('op-search').value = p.label;
    $('op-search').oninput();
    status(`${p.name} picked: choose its form, skill and outfit, then "Add to bench".`);
  } });
  // a click on a piece / unit opens its card (an own 自选 piece as its pick); on the ground closes it
  const onPieceClick = (e) => {
    if (!e) return;
    if (e.unitId != null || e.unit) ui.target = { kind: 'unit', unit: e.unit || null, unitId: e.unitId, uid: e.uid };
    else if (Number.isInteger(e.uid)) {
      const at = locate(e.uid);
      // (a 自选 card keeps its piece's uid: its range on the field, drawCardRange)
      ui.target = at?.u?.diy ? { kind: 'chess', id: at.u.chessId, diy: at.u.diy, foreign: true, items: at.u.items || null, uid: e.uid } : { kind: 'piece', uid: e.uid };
    } else return;
    try { audio.sfx('click', { volume: 0.4 }); } catch { /* ignore */ }
    renderUi();
  };

  /** Where entry `id` (a uid) is: { area: 'board', i, u } | { area: 'hand', idx, u } | null. */
  const locate = (id) => {
    const i = board.findIndex((u) => u.uid === id);
    if (i >= 0) return { area: 'board', i, u: board[i] };
    const idx = bench.findIndex((u) => u && u.uid === id);
    return idx >= 0 ? { area: 'hand', idx, u: bench[idx] } : null;
  };
  const occupant = (t) => (t.area === 'hand' ? bench[t.idx] : board.find((u) => u.row === t.row && u.col === t.col)) || null;
  let facing = null;   // the open direction step: { uid, target, prevDir }
  // the field view asks this while dragging (legal tiles are highlighted) and before a drop: a board tile of the right
  // class, free or holding someone who could stand where the dragged one came from; any bench slot
  const canPlace = (id, target) => {
    if (runner || facing) return false;
    const src = locate(id);
    if (!src || !target) return false;
    const rec = recordOf(src.u);
    if (target.area === 'hand') {
      if (!Number.isInteger(target.idx) || target.idx < 0 || target.idx >= BENCH) return false;
      const occ = bench[target.idx];
      return !occ || src.area === 'hand' || allows(recordOf(occ), `${src.u.row},${src.u.col}`);
    }
    if (target.area !== 'board' || !rec || !allows(rec, `${target.row},${target.col}`)) return false;
    const occ = occupant(target);
    if (!occ || occ === src.u) return true;
    return src.area === 'hand' || allows(recordOf(occ), `${src.u.row},${src.u.col}`);
  };
  /** Apply a legal drop: move, or swap with the occupant. */
  const move = (id, target) => {
    const src = locate(id);
    if (!src) return;
    const occ = occupant(target);
    if (occ === src.u) return;
    const take = (loc) => { if (loc.area === 'board') board = board.filter((u) => u !== loc.u); else bench[loc.idx] = null; };
    const put = (u, t) => {
      if (t.area === 'hand') { delete u.row; delete u.col; u.dir = 'RIGHT'; bench[t.idx] = u; }
      else { u.row = t.row; u.col = t.col; board.push(u); }
    };
    const from = src.area === 'board' ? { area: 'board', row: src.u.row, col: src.u.col } : { area: 'hand', idx: src.idx };
    take(src);
    if (occ) take(locate(occ.uid));
    put(src.u, target);
    if (occ) put(occ, from);
  };
  const bgm = (combat) => { try { audio.playBgm(combat ? `combat:${combatTrackFor(template.spec.round) ? 1 : 0}` : 'prep'); } catch { /* ignore */ } };
  const prep = () => {
    if (runner) { try { runner.dispose(); } catch { /* ignore */ } runner = null; }
    paused = false;
    view.setFrozen?.(false);
    renderControls();
    battleField = null;
    $('cam-row').hidden = true;
    if (ui.target?.kind === 'unit') { ui.target = null; renderUi(); }
    if (live) { live = null; renderBonds(); }
    view.setLocalFeed({ on: false });
    view.setPrep(prepState(), { editable: true, canPlace });
    view.setCamera('prep', { rect: { ...template.spec.rect }, side: 'L', instant: true });
    $('fight').disabled = false;
    bgm(false);
  };
  // ---- pause and frame step: the runner's clock stands still, the view holds its newest frame --------------------------
  let paused = false;
  const inBattle = () => !!runner && !!runner.state?.() && !runner.state().done;
  const battleTick = () => runner?._entries?.get(runner.state?.()?.battleId)?.battle?.tickCount ?? null;
  const renderControls = () => {
    $('pause').disabled = !inBattle();
    $('pause').textContent = paused ? 'Resume' : 'Pause';
    $('step1').disabled = $('step10').disabled = !inBattle() || !paused;
    const tick = runner ? battleTick() : null;
    $('tick').textContent = tick != null ? `Battle time ${(tick / 30).toFixed(2)} s · tick ${tick}${paused ? ' · paused' : ''}` : '';
  };
  const setPause = (on) => {
    paused = !!on && inBattle();
    if (runner) runner.setPaused(paused);
    view.setFrozen?.(paused);
    renderControls();
  };
  // ---- the boss field's camera (the match's ‹ › pill, battle/observe.js layerCamera): own half / whole field / partner's
  let battleField = null;
  let camLayer = 'ALL';
  const setCamLayer = (k, move = true) => {
    camLayer = k;
    if (move && battleField && onBoss(template)) view.setCamera('boss', layerCamera(battleField, k, 'L'));
    $('cam-row').hidden = !(runner && battleField && onBoss(template));
    for (const [id, key] of [['cam-L', 'L'], ['cam-ALL', 'ALL'], ['cam-R', 'R']]) $(id).setAttribute('aria-pressed', String(camLayer === key));
  };
  $('cam-L').onclick = () => setCamLayer('L');
  $('cam-ALL').onclick = () => setCamLayer('ALL');
  $('cam-R').onclick = () => setCamLayer('R');
  const stepFrames = (n) => { if (paused && runner?.stepPaused?.(n)) renderControls(); };
  $('pause').onclick = () => setPause(!paused);
  $('step1').onclick = () => stepFrames(1);
  $('step10').onclick = () => stepFrames(10);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target?.tagName || '') || !inBattle()) return;
    if (e.code === 'Space') { e.preventDefault(); setPause(!paused); } else if (e.key === '.') stepFrames(1); else if (e.key === '>') stepFrames(10);
  });
  const changed = () => { sync(); renderList(); refreshPicker(); prep(); renderBonds(); status(summary()); };

  // ---- the direction step (the match's wheel, ui/facingWheel.js): after a legal drop on a board tile ---------------
  const wheelHost = document.body.appendChild(document.createElement('div'));
  const closeWheel = () => { facing = null; sb.facing = null; render(null, wheelHost); };
  const openFacing = (uid, target) => {
    const src = locate(uid);
    if (!src) return;
    const rec = recordOf(src.u);
    facing = { uid, target: { area: 'board', row: target.row, col: target.col }, prevDir: src.u.dir || 'RIGHT' };
    sb.facing = facing;
    showRange(view, null, 0, 0, null, SEL_RANGE); // the wheel draws its own
    holdPiece(view, uid, { row: target.row, col: target.col });
    audio.sfx('pick', { volume: 0.5 });
    const grid = previewGrid({ getChess: () => rec }, { kind: 'chess', id: src.u.chessId });
    render(html`<${FacingWheel} key=${`${uid}:${target.row},${target.col}`} view=${view} row=${target.row} col=${target.col}
      grid=${grid} name=${nameOf(rec)} onPreview=${(dir) => setPieceDir(view, uid, dir || facing?.prevDir || 'RIGHT')}
      onCommit=${commitFacing} onCancel=${cancelFacing} />`, wheelHost);
  };
  function commitFacing(dir) {
    const f = facing;
    if (!f) return;
    closeWheel();
    const src = locate(f.uid);
    if (src) {
      const occ = occupant(f.target);
      if (occ !== src.u) move(f.uid, f.target);
      src.u.dir = DIRS.includes(dir) ? dir : f.prevDir;
    }
    holdPiece(view, f.uid, null);
    changed();
  }
  function cancelFacing() {
    const f = facing;
    if (!f) return;
    closeWheel();
    setPieceDir(view, f.uid, f.prevDir);
    holdPiece(view, f.uid, null);
    audio.sfx('back', { volume: 0.5 });
    prep();
  }

  $('op-add').onclick = () => {
    const p = pick();
    if (!p) return;
    const idx = bench.indexOf(null);
    if (idx < 0) return;
    rememberSkill();
    const skillIndex = Number($('op-skill').value) || 0;
    bench[idx] = { chessId: p.chessId, ...(current.chess ? null : { diy: { charId: p.charId, skillIndex, uniEquipId: null } }), skillIndex, dir: 'RIGHT', skin: $('op-skin').value || null, items: [] };
    changed();
    status(`${nameOf(p.rec)} is on the bench: drag it onto a highlighted tile.`);
  };
  // ---- core bond presets: every operator of a core bond at once (the pool's chess carrying it; Custom Squad picks are
  // not added) — free board tiles first, melee operators before ranged ones so they keep the melee tiles, ranged ones on
  // ranged tiles while there are any; the rest on the bench. An operator already on the board or the bench is skipped.
  const membersOf = (bondId) => data.list('chess').filter((c) => c && c.visible && !c.isGolden && !c.isDiy && c.charId && c.bonds?.includes(bondId))
    .sort((a, b) => Number(a.position !== 'MELEE') - Number(b.position !== 'MELEE') || a.tier - b.tier || nameOf(a).localeCompare(nameOf(b)));
  const coreBonds = bondIds.filter((id) => data.lookup('bonds', id)?.isCore);
  $('bond-preset').replaceChildren(...coreBonds.map((id) => new Option(`${bondName(id)} · ${membersOf(id).length} operators`, id)));
  $('bond-add').disabled = !coreBonds.length;
  const addBond = (bondId, elite = false) => {
    const baseOf = (u) => data.lookup('chess', u.chessId)?.baseId || u.chessId;
    const have = new Set([...board, ...bench.filter(Boolean)].filter((u) => !u.diy).map(baseOf));
    const tileOrder = [...tiles.keys()].map((k) => k.split(',').map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([r, c]) => `${r},${c}`);
    const taken = new Set(board.map((u) => `${u.row},${u.col}`));
    let onBoard = 0, onBench = 0, left = 0;
    for (const c of membersOf(bondId)) {
      if (have.has(c.chessId)) continue;
      const rec = (elite && c.goldenId && data.lookup('chess', c.goldenId)) || c;
      const skills = rec.skills?.length ? rec.skills : [rec.skill].filter(Boolean);
      const remembered = skillMemory[rec.charId];
      const skillIndex = skills.some((s, i) => (s.index ?? i) === remembered) ? remembered : (skills[0]?.index ?? 0);
      const u = { chessId: rec.chessId, skillIndex, dir: 'RIGHT', skin: null, items: [] };
      const fits = tileOrder.filter((k) => !taken.has(k) && allows(rec, k));
      const key = (rec.position !== 'MELEE' && fits.find((k) => tiles.get(k) === 'ranged')) || fits[0];
      if (key) { [u.row, u.col] = key.split(',').map(Number); taken.add(key); board.push(u); onBoard++; continue; }
      const idx = bench.indexOf(null);
      if (idx >= 0) { bench[idx] = u; onBench++; } else left++;
    }
    changed();
    const n = onBoard + onBench;
    status(n ? `${bondName(bondId)}: ${onBoard} on the board${onBench ? `, ${onBench} on the bench` : ''}${left ? ` (${left} did not fit: the bench is full)` : ''}.`
      : left ? `${bondName(bondId)}: no room left (board and bench are full).` : `${bondName(bondId)}: everyone is already placed.`);
    return { onBoard, onBench, left };
  };
  $('bond-add').onclick = () => addBond($('bond-preset').value, $('bond-form').value === '1');
  sb.addBond = addBond;
  sb.ui = ui;
  sb.click = onPieceClick;
  sb.camLayer = (k) => setCamLayer(k);
  sb.boardUids = () => board.map((u) => uidOf(u));
  sb.meter = () => readMeter();
  $('meter').onchange = () => renderUi();

  // a drop: a legal board drop opens the direction step (the view already checked canPlace), a bench one moves; off the
  // field, a board piece returns to the bench and a bench piece is removed
  const onDrop = (e) => {
    if (runner || facing) return;
    if (e.target?.area === 'outside') {
      const src = locate(e.uid);
      if (src?.area === 'board') {
        const idx = bench.indexOf(null);
        board = board.filter((u) => u !== src.u);
        if (idx >= 0) { delete src.u.row; delete src.u.col; src.u.dir = 'RIGHT'; bench[idx] = src.u; }
      } else if (src?.area === 'hand') bench[src.idx] = null;
      changed();
      return;
    }
    if (!canPlace(e.uid, e.target)) { prep(); return; }
    if (e.target.area === 'board') { openFacing(e.uid, e.target); return; }
    move(e.uid, e.target);
    changed();
  };
  view.on('pieceDrop', onDrop);
  view.on('pieceClick', onPieceClick);
  view.on('tileClick', () => { if (ui.target) { ui.target = null; renderUi(); } });
  sb.drop = onDrop;   // (tests: the drop the view would emit)
  $('clear').onclick = () => { board = []; bench.fill(null); changed(); };
  $('reset').onclick = () => { prep(); status('Back in prep.'); };
  /** Another wave of this map, in place (the board, the bench and the stacks stay; between the normal and the boss field,
   *  the units standing where the other field has no tile for them go back to the bench, or off it when it is full). */
  const setWave = (id) => {
    if (facing) return;
    const was = fieldOf(template);
    ({ waveId, preset, template, wave } = waveOf(id));
    let benched = 0;
    if (fieldOf(template) !== was) {
      tiles = deployMap(stage, { field: fieldOf(template) });
      catalogue = catalogueOf(template);
      fillRoutes();
      for (const u of board.filter((x) => !allows(recordOf(x), `${x.row},${x.col}`))) {
        board = board.filter((x) => x !== u);
        const idx = bench.indexOf(null);
        if (idx >= 0) { delete u.row; delete u.col; u.dir = 'RIGHT'; bench[idx] = u; }
        benched++;
      }
      renderList();
    }
    sb.benched = benched;
    $('enemies').value = waveId;
    $('preset-name').value = preset ? preset.name : '';
    if (waveId === W.EMPTY) $('wave-edit').open = true;
    gains = null;
    setBankable(false);
    sync();
    renderWave();
    prep();
    renderBonds();
  };
  $('enemies').onchange = () => {
    setWave($('enemies').value);
    status(`${waveTitle()} loaded.${sb.benched ? ` ${sb.benched} unit${sb.benched === 1 ? '' : 's'} had no tile on this field: back to the bench.` : ''}${onBoss(template) ? ' Boss fields gain no stacks in battle (the official rule).' : ''}`);
  };
  // another map: the same round there (an empty wave stays empty; a preset of this map falls back to the round); units
  // standing on a tile the new map does not offer to them are dropped when it loads
  $('map').onchange = () => {
    if ($('enemies').value.startsWith(W.PRESET_PREFIX)) $('enemies').replaceChildren(new Option('', W.DEFAULT_WAVE));
    sync();
    location.reload();
  };
  $('speed').onchange = sync;
  $('impostors').onchange = () => { sync(); view.setSettings(settings()); };
  $('legacy').onchange = () => { sync(); view.setSettings(settings()); };
  // Sakiko's notes: her official projectile prefabs or our fallback (render/fx/notes.js) — from the next note launched
  $('note-ours').onchange = () => { sync(); view.setSettings(settings()); };

  const fight = async () => {
    if (facing) return;
    if (!board.length) { status(bench.some(Boolean) ? 'Drag an operator from the bench onto the board first.' : 'Add at least one operator first.', true); return; }
    if (!wave.spawns.length) { status('The wave is empty: add an enemy under "Edit wave" first.', true); $('wave-edit').open = true; return; }
    if (runner) { try { runner.dispose(); } catch { /* ignore */ } }
    const spec = JSON.parse(JSON.stringify(template.spec));
    spec.battleId = `sandbox.${Date.now()}`;
    spec.routes = JSON.parse(JSON.stringify(wave.routes));
    // (a boss field's spawns keep their owner: the partner's half has its own; added ones are ours)
    const owners = new Set(spec.players.map((p) => p.playerId));
    spec.spawns = wave.spawns.map((s) => ({ ...JSON.parse(JSON.stringify(s)), ownerPlayerId: owners.has(s.ownerPlayerId) ? s.ownerPlayerId : myId }));
    // a boss field has no time limit (the leader's pool decides); a normal one ends a minute after the last spawn
    spec.timeLimit = onBoss(template) ? template.spec.timeLimit : W.waveTimeLimit(wave);
    const me = spec.players[0];
    skinByUid.clear();
    for (const u of board) if (u.skin) skinByUid.set(uidOf(u), u.skin);
    me.units = board.map((u) => ({ uid: uidOf(u), kind: 'chess', chessId: u.chessId, row: u.row, col: u.col, dir: u.dir, items: [...(u.items || [])],
      ...(u.diy ? { diy: { ...u.diy } } : { skillIndex: u.skillIndex }) }));
    // the match's PlayerBattleInput.bonds (bondSnapshot); without the rules every bond is inactive
    const st = bondState();
    if (st) me.bonds = BM.bondSnapshot(st.bonds);
    else for (const b of Object.values(me.bonds || {})) { b.count = 0; b.active = false; b.tier = 0; b.layers = 0; }
    gains = null;
    live = null;
    setBankable(false);
    sb.lastResult = null;
    stackLog = [];
    meter = null;
    me.playerEffects = [];
    runner = createBattleRunner({ net, store: null });
    runner.on('field', (field) => {
      view.setLocalFeed({ on: true, speed: field.speed });   // client-side combat, as the match screen runs it
      view.enterBattle(field);
      view.setCamera(onBoss(template) ? 'boss' : 'normal', { rect: field.rect, side: 'L', instant: true });
      audio.setFieldUnits(field.units);
      battleField = field;
      setCamLayer('ALL', false);
    });
    runner.on('snap', (snap) => {
      view.pushSnapshot(snap);
      if (Array.isArray(snap?.units)) snapUnits = new Map(snap.units.filter(Array.isArray).map((t) => [t[0], t]));
      if (ui.target && ui.target.kind === 'unit') renderUi();
    });
    // the own player's in-battle stacks (Battle.addLayers), banked by "Bank stacks"
    runner.on('result', (r) => {
      sb.lastResult = r?.result ?? null;
      const g = r?.result?.perPlayer?.[myId]?.layerGains;
      gains = g && Object.keys(g).length ? { ...g } : null;
      setBankable(true);
      renderBonds();
    });
    runner.on('ev', (ev) => { view.pushEvents(ev); audio.handleBattleEvents(ev?.ev); });
    sb.runner = runner;
    paused = false;
    view.setFrozen?.(false);
    $('fight').disabled = true;
    status('Fighting…');
    audio.sfx('battleStart');
    bgm(true);
    try {
      await runner.onStart({ ...template, spec, battleId: spec.battleId, elapsed: 0, authoritative: true, watch: false, done: false, speed: Number($('speed').value) || 2 });
    } catch (e) { status(`The battle did not start: ${e?.message || e}`, true); $('fight').disabled = false; }
  };
  $('fight').onclick = fight;
  setInterval(() => {
    if (!runner) return;
    const st = runner.state?.();
    if (paused && st?.done) setPause(false);
    renderControls();
    if (meterShown() && runner) { readMeter(); renderUi(); }
    const now = st?.bondLayers?.[myId] || null;
    if (JSON.stringify(now) !== JSON.stringify(live)) { live = now; renderBonds(); }
    if (st?.done && $('fight').disabled) {
      const got = Object.entries(gains || {}).map(([id, n]) => `${bondName(id)} +${n}`).join(', ');
      status(`Battle over.${got ? ` Stacks gained: ${got} — "Bank stacks" keeps them.` : ' No stacks gained.'} "Back to prep" to change the board, or start again.`);
      $('fight').disabled = false;
    }
  }, 500);

  /** Add the last battle's stacks the way the settlement does (bondsWithGains: capped), then back to prep — `next`: on
   *  the next round's waves. */
  const bank = (next) => {
    const st = bondState();
    const got = {};
    const after = {};
    if (st && gains) {
      const grown = BM.bondsWithGains(st.bonds, gains);
      for (const [id, b] of Object.entries(grown)) {
        const add = (b.layers || 0) - (st.bonds[id]?.layers || 0);
        if (add > 0) { got[id] = add; after[id] = b.layers; layers[id] = b.layers; }
      }
    }
    roundLog.push({ title: waveTitle(), got, after });
    gains = null;
    live = null;
    const to = next ? nextRound() : null;
    if (to) setWave(to); else { setBankable(false); sync(); prep(); renderBonds(); }
    renderLog();
    const sum = Object.entries(got).map(([id, n]) => `${bondName(id)} +${n}`).join(', ');
    status(`${sum ? `Banked: ${sum}.` : 'No stacks to bank.'}${to ? ` Now on ${waveTitle()}.` : ''}`);
  };
  $('bank').onclick = () => bank(false);
  $('bank-next').onclick = () => bank(true);

  sb.view = view;
  sb.units = () => board.map(({ uid, ...u }) => u);
  sb.bench = () => bench.map((u) => (u ? u.chessId : null));
  sb.wave = () => JSON.parse(JSON.stringify(wave));
  sb.stageId = mapId;
  sb.benchUids = () => bench.map((u) => (u ? u.uid : null));
  sb.legalTiles = (uid) => [...tiles.keys()].map((k) => k.split(',').map(Number)).filter(([row, col]) => canPlace(uid, { area: 'board', row, col }));
  sb.fight = fight;
  sb.prep = prep;
  sb.bonds = () => bondState()?.bonds ?? null;
  sb.layers = () => ({ ...layers });
  sb.gains = () => (gains ? { ...gains } : null);
  sb.bank = bank;
  sb.setWave = setWave;
  sb.pause = setPause;
  sb.step = stepFrames;
  sb.tick = battleTick;
  renderList();
  renderBonds();
  refreshPicker();
  prep();
  status(summary());
  sb.ready = true;
  if (q.get('fight') === '1') await fight();
}

main().catch((e) => { sb.error = String(e?.stack || e); status(String(e?.message || e), true); console.error(e); });
