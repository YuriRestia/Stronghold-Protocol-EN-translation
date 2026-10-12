// Sandbox page (dev, fork): put the operators you want on the board and fight one real battle with them — the shared sim
// in the browser (js/battle/runner.js, like the battle perf page) feeding the field view (js/render/app.js). The stage,
// routes and enemy waves come from a captured BattleSpec of one normal round 1–13 (public/dev/sandbox/*.json, see
// sandbox-waves.js), an empty wave filled on the page, or a saved preset; the player's units are replaced by the board
// built here. Made to check how a model draws and fights (attacks, skills, the impostor box: docs/ASSETS.md `extents`)
// without playing a match up to the round that has it.
//
// Query: &units=<chessId>[~<charId>]:<row>,<col>[:<skillIndex>[:<dir>[:<outfitId>]]];…  the board (prep), e.g.
//        chess_char_2_18_a:12,5:1:RIGHT:char_431_ashlok@epoque#28 (an outfit of data/outfits.json; URL-encoded);
//        `~<charId>` = the operator a 自选 slot (chess_char_5/6_diy*_a/_b) fields (shared/diy.js)
//        &map=<stageId> (one of the 7 HARD maps, default act2autochess_m01; a preset belongs to the map it was saved on)
//        &enemies=hard-normal-rN | empty | preset:<name> (default hard-normal-r13) &speed=1|2|4 &imp=0 (normal
//        rendering) &legacy=1 (old box) &fight=1 (start the battle on load)
// Operators: the pool's (data/chess.json, normal and elite forms) and the Custom Squad picks (自选: the DIY slots of
// tier 5 / 6 filled with any operator a slot may field that has a kit — KITTED_CHARS; no module). 补位 stand-ins are not
// offered. Deploying is the match's prep: "Add to bench" puts the pick in the first free bench slot, then it is dragged
// onto the board (the field view's drag & drop, legal tiles highlighted from `canPlace`: the stage's melee / ranged
// classes, server/match/board.js) and the match's direction wheel (ui/facingWheel.js) picks its facing; a drop on its
// own tile turns it, on an occupied tile swaps, off the field sends a board unit back to the bench (a bench one is
// removed). The skill last picked for an operator is remembered (localStorage SKILL_KEY). The bench is not kept in the
// URL. Bonds are left inactive and no items are equipped. Outfits are the sandbox's own per unit (the field view's
// `outfitOf` by uid), not the player's saved choice (ui/outfits.js), which this page neither reads nor changes. Sound:
// the game's audio manager (js/audio.js) with the player's volume settings — prep / combat BGM, battle SFX and voices.
// Puppeteer hook: window.__sandbox = { ready, error, view, runner, units(), bench(), wave(), fight(), prep(), facing }

import { render } from '../vendor/preact.module.js';
import { html } from '../js/ui/components.js';
import { createFieldView } from '../js/render/app.js';
import { data } from '../js/data.js';
import { assets } from '../js/assets.js';
import { genUrl } from '../js/gen.js';
import { createBattleRunner } from '../js/battle/runner.js';
import { deployMap } from '../js/ui/gameLogic/placement.js';
import { previewGrid } from '../js/ui/facing.js';
import { FacingWheel, holdPiece, setPieceDir } from '../js/ui/facingWheel.js';
import { settingsStore } from '../js/ui/settings.js';
import { loadLangIndex, loadLangChain } from '../js/ui/lang.js';
import { audio, installAudio, setOutfitVoiceResolver, combatTrackFor } from '../js/audio.js';
import { setOutfitPicker } from '../js/ui/assetUrls.js';
import { setLang } from '../../shared/i18n.js';
import { meleeOnHighGround } from '../../shared/highGround.js';
import { isOutfitOf } from '../../shared/outfits.js';
import { diySlotIds, diySlot, diyPool, diyRecord, isPrototypePick, lockedSelection } from '../../shared/diy.js';
import * as W from './sandbox-waves.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const sb = { ready: false, error: null, facing: null };
globalThis.__sandbox = sb;

const DIRS = ['RIGHT', 'LEFT', 'UP', 'DOWN'];
/** The skill last picked per operator: { [charId]: skillIndex }. */
const SKILL_KEY = 'sp.dev.sandbox.skills';

const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('is-error', error); };
const loadJson = (key, d) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? d; } catch { return d; } };
const num = (id, lo, hi, d) => { const v = Number($(id).value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

/** The board from the URL: [{ chessId, diy?, row, col, skillIndex, dir, skin }] (junk dropped; picks / `skin` checked later). */
function parseUnits(raw) {
  const out = [];
  for (const part of String(raw || '').split(';')) {
    const m = /^([a-z0-9_]+)(?:~([a-z0-9_]+))?:(\d+),(\d+)(?::(\d))?(?::([A-Z]+))?(?::([^:;]+))?$/.exec(part.trim());
    if (!m) continue;
    const skillIndex = m[5] != null ? +m[5] : 0;
    out.push({ chessId: m[1], ...(m[2] ? { diy: { charId: m[2], skillIndex, uniEquipId: null } } : null), row: +m[3], col: +m[4],
      skillIndex, dir: DIRS.includes(m[6]) ? m[6] : 'RIGHT', skin: m[7] || null });
  }
  return out;
}
const unitsParam = (list) => list.map((u) => `${u.chessId}${u.diy ? `~${u.diy.charId}` : ''}:${u.row},${u.col}:${u.skillIndex}:${u.dir}${u.skin ? `:${u.skin}` : ''}`).join(';');

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

  // ---- sound: the game's audio manager with the player's settings (BGM, battle SFX, voices) ---------------------------
  setOutfitPicker(null);   // ui/outfits.js (loaded with the direction wheel) must not dress the sandbox in the saved outfits
  installAudio({ getManifest: () => data.get('assets'), settings: settingsStore.get() });
  settingsStore.subscribe?.((s) => { try { audio.setVolumes(s); } catch { /* ignore */ } });

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
    $('enemies').replaceChildren(...rounds.filter((s) => templates.get(s.name)).map((s) => new Option(`Round ${s.round} waves`, s.name)),
      new Option('Empty wave (add enemies below)', W.EMPTY), ...mapPresets().map((p) => new Option(`Preset: ${p.name}`, W.PRESET_PREFIX + p.name)));
  };
  fillWaveSelect();
  const firstRound = templates.get(W.DEFAULT_WAVE) ? W.DEFAULT_WAVE : rounds.find((s) => templates.get(s.name))?.name;
  const preset = mapPresets().find((p) => W.PRESET_PREFIX + p.name === want) || null;
  const waveId = templates.get(want) || want === W.EMPTY || preset ? want : firstRound;
  const baseName = preset && templates.get(preset.base) ? preset.base : templates.get(waveId) ? waveId : firstRound;
  const template = templates.get(baseName);
  if (!template) throw new Error('The enemy waves failed to load.');
  const wave = preset ? JSON.parse(JSON.stringify({ ...preset, base: baseName })) : waveId === W.EMPTY ? W.emptyWave(baseName, template) : W.waveOfTemplate(baseName, template);
  $('enemies').value = waveId;
  if (preset) $('preset-name').value = preset.name;
  if (waveId === W.EMPTY) $('wave-edit').open = true;
  if (['1', '2', '4'].includes(q.get('speed'))) $('speed').value = q.get('speed');
  $('impostors').checked = q.get('imp') !== '0';
  $('legacy').checked = q.get('legacy') === '1';

  const stage = data.lookup('stages', template.spec.stageId);
  const tiles = deployMap(stage);   // 'r,c' → 'melee' | 'ranged'
  const myId = template.spec.players[0]?.playerId ?? null;

  // the wave editor
  const catalogue = W.routeCatalogue([...templates.values()], template.spec.stageId);
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
    $('enemies').value = W.PRESET_PREFIX + name;
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
    ...[...diyTiers].map(([charId, tiers]) => ({ charId, tiers, name: nameOf(backupUnit(charId)), label: `${nameOf(backupUnit(charId))} · Custom T${tiers.join('/')}` })),
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
      li.append(rm);
      return li;
    }));
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'sb-empty';
      li.textContent = 'Nobody yet: pick an operator above and add it to the bench.';
      $('squad').append(li);
    }
  };
  const summary = () => {
    const n = bench.filter(Boolean).length;
    if (!board.length && !n) return 'Add operators, then drag them onto the board.';
    return `${board.length} on the board${n ? `, ${n} on the bench (drag onto a highlighted tile)` : ''}.`;
  };

  // ---- the field ---------------------------------------------------------------------------------------------
  const settings = () => ({ quality: 'high', damageNumbers: true, forceImpostors: $('impostors').checked, legacyImpostorBox: $('legacy').checked });
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
    return { uid: uidOf(u), kind: 'chess', id: u.chessId, golden: !!c?.isGolden, tier: c?.tier ?? 1, items: [], ...(u.diy ? { diy: u.diy } : null), ...extra };
  };
  const prepState = () => {
    skinByUid.clear();
    return {
      hand: bench.map((u) => (u ? piece(u) : null)), temp: Array(5).fill(null), nextEnemies: [],
      board: board.map((u) => piece(u, { row: u.row, col: u.col, dir: u.dir })),
    };
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
    view.setLocalFeed({ on: false });
    view.setPrep(prepState(), { editable: true, canPlace });
    view.setCamera('prep', { rect: { ...template.spec.rect }, side: 'L', instant: true });
    $('fight').disabled = false;
    bgm(false);
  };
  const changed = () => { sync(); renderList(); refreshPicker(); prep(); status(summary()); };

  // ---- the direction step (the match's wheel, ui/facingWheel.js): after a legal drop on a board tile ---------------
  const wheelHost = document.body.appendChild(document.createElement('div'));
  const closeWheel = () => { facing = null; sb.facing = null; render(null, wheelHost); };
  const openFacing = (uid, target) => {
    const src = locate(uid);
    if (!src) return;
    const rec = recordOf(src.u);
    facing = { uid, target: { area: 'board', row: target.row, col: target.col }, prevDir: src.u.dir || 'RIGHT' };
    sb.facing = facing;
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
    bench[idx] = { chessId: p.chessId, ...(current.chess ? null : { diy: { charId: p.charId, skillIndex, uniEquipId: null } }), skillIndex, dir: 'RIGHT', skin: $('op-skin').value || null };
    changed();
    status(`${nameOf(p.rec)} is on the bench: drag it onto a highlighted tile.`);
  };
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
  sb.drop = onDrop;   // (tests: the drop the view would emit)
  $('clear').onclick = () => { board = []; bench.fill(null); changed(); };
  $('reset').onclick = () => { prep(); status('Back in prep.'); };
  $('enemies').onchange = () => { sync(); location.reload(); };
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

  const fight = async () => {
    if (facing) return;
    if (!board.length) { status(bench.some(Boolean) ? 'Drag an operator from the bench onto the board first.' : 'Add at least one operator first.', true); return; }
    if (!wave.spawns.length) { status('The wave is empty: add an enemy under "Edit wave" first.', true); $('wave-edit').open = true; return; }
    if (runner) { try { runner.dispose(); } catch { /* ignore */ } }
    const spec = JSON.parse(JSON.stringify(template.spec));
    spec.battleId = `sandbox.${Date.now()}`;
    spec.routes = JSON.parse(JSON.stringify(wave.routes));
    spec.spawns = wave.spawns.map((s) => ({ ...JSON.parse(JSON.stringify(s)), ownerPlayerId: myId }));
    spec.timeLimit = W.waveTimeLimit(wave);
    const me = spec.players[0];
    skinByUid.clear();
    for (const u of board) if (u.skin) skinByUid.set(uidOf(u), u.skin);
    me.units = board.map((u) => ({ uid: uidOf(u), kind: 'chess', chessId: u.chessId, row: u.row, col: u.col, dir: u.dir, items: [],
      ...(u.diy ? { diy: { ...u.diy } } : { skillIndex: u.skillIndex }) }));
    for (const b of Object.values(me.bonds || {})) { b.count = 0; b.active = false; b.tier = 0; }
    me.playerEffects = [];
    runner = createBattleRunner({ net, store: null });
    runner.on('field', (field) => {
      view.setLocalFeed({ on: true, speed: field.speed });   // client-side combat, as the match screen runs it
      view.enterBattle(field);
      view.setCamera('normal', { rect: field.rect, side: 'L', instant: true });
      audio.setFieldUnits(field.units);
    });
    runner.on('snap', (snap) => view.pushSnapshot(snap));
    runner.on('ev', (ev) => { view.pushEvents(ev); audio.handleBattleEvents(ev?.ev); });
    sb.runner = runner;
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
    if (st?.done && $('fight').disabled) { status('Battle over. "Back to prep" to change the board, or start again.'); $('fight').disabled = false; }
  }, 500);

  sb.view = view;
  sb.units = () => board.map(({ uid, ...u }) => u);
  sb.bench = () => bench.map((u) => (u ? u.chessId : null));
  sb.wave = () => JSON.parse(JSON.stringify(wave));
  sb.stageId = mapId;
  sb.benchUids = () => bench.map((u) => (u ? u.uid : null));
  sb.legalTiles = (uid) => [...tiles.keys()].map((k) => k.split(',').map(Number)).filter(([row, col]) => canPlace(uid, { area: 'board', row, col }));
  sb.fight = fight;
  sb.prep = prep;
  renderList();
  refreshPicker();
  prep();
  status(summary());
  sb.ready = true;
  if (q.get('fight') === '1') await fight();
}

main().catch((e) => { sb.error = String(e?.stack || e); status(String(e?.message || e), true); console.error(e); });
