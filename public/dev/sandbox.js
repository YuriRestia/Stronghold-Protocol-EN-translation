// Sandbox page (dev, fork): put the operators you want on the board and fight one real battle with them — the shared sim
// in the browser (js/battle/runner.js, like the battle perf page) feeding the field view (js/render/app.js). The enemy
// waves, routes and stage come from a captured BattleSpec (public/dev/perf/*.json, tools/capture-specs.mjs); the
// player's units are replaced by the board built here. Made to check how a model draws in combat (attacks, skills,
// the impostor box: docs/ASSETS.md `extents`) without playing a match up to the round that has it.
//
// Query: &units=<chessId>:<row>,<col>[:<skillIndex>[:<dir>[:<outfitId>]]];…  the board (prep), e.g.
//        chess_char_2_18_a:12,5:1:RIGHT:char_431_ashlok@epoque#28 (an outfit of data/outfits.json; URL-encoded)
//        &enemies=<perf spec name> (default hard-normal-r13) &speed=1|2|4 &imp=0 (normal rendering) &legacy=1 (old box)
//        &fight=1 (start the battle on load)
// Only the pool's operators (data/chess.json, normal and elite forms); 自选 / 补位 picks are not offered. Deploying is the
// match's prep: "Add to bench" puts the pick in the first free bench slot, then it is dragged onto the board (the field
// view's drag & drop, legal tiles highlighted from `canPlace`: the stage's melee / ranged classes, server/match/board.js);
// a drop on an occupied tile swaps, a drop off the field sends a board unit back to the bench (a bench one is removed).
// The bench is not kept in the URL. Bonds are left inactive and no items are equipped. Outfits are the sandbox's own per
// unit (the field view's `outfitOf` by uid), not the player's saved choice (ui/outfits.js), which this page neither
// reads nor changes.
// Puppeteer hook: window.__sandbox = { ready, error, view, runner, units(), bench(), fight(), prep() }

import { createFieldView } from '../js/render/app.js';
import { data } from '../js/data.js';
import { assets } from '../js/assets.js';
import { createBattleRunner } from '../js/battle/runner.js';
import { deployMap } from '../js/ui/gameLogic/placement.js';
import { meleeOnHighGround } from '../../shared/highGround.js';
import { isOutfitOf } from '../../shared/outfits.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const sb = { ready: false, error: null };
globalThis.__sandbox = sb;

const DIRS = ['RIGHT', 'LEFT', 'UP', 'DOWN'];
const DEFAULT_ENEMIES = 'hard-normal-r13';

const status = (text, error = false) => { $('status').textContent = text; $('status').classList.toggle('is-error', error); };

/** The board from the URL: [{ chessId, row, col, skillIndex, dir, skin }] (junk dropped; `skin` checked later). */
function parseUnits(raw) {
  const out = [];
  for (const part of String(raw || '').split(';')) {
    const m = /^([a-z0-9_]+):(\d+),(\d+)(?::(\d))?(?::([A-Z]+))?(?::([^:;]+))?$/.exec(part.trim());
    if (!m) continue;
    out.push({ chessId: m[1], row: +m[2], col: +m[3], skillIndex: m[4] != null ? +m[4] : 0, dir: DIRS.includes(m[5]) ? m[5] : 'RIGHT', skin: m[6] || null });
  }
  return out;
}
const unitsParam = (list) => list.map((u) => `${u.chessId}:${u.row},${u.col}:${u.skillIndex}:${u.dir}${u.skin ? `:${u.skin}` : ''}`).join(';');

/** The outfits of operator `charId` (data/outfits.json; every outfit is owned, docs/OUTFITS.md). */
const outfitsOf = (charId) => (data.list('outfits') || []).filter((r) => r && r.charId === charId);
const outfitLabel = (r) => (r.series ? `${r.name} · ${r.series}` : r.name || r.id);

/** English name of a chess entry (its official appellation), else its Chinese one. */
const nameOf = (c) => c?.appellation || c?.name || '?';
const label = (c) => `${nameOf(c)}${c.isGolden ? ' (elite)' : ''} · T${c.tier}`;
const skillName = (s, i) => `S${i + 1} ${s?.name || s?.skillId || ''}`.trim();

async function main() {
  $('collapse').onclick = () => {
    const c = $('panel').classList.toggle('is-collapsed');
    $('collapse').textContent = c ? 'Show' : 'Hide';
    $('collapse').setAttribute('aria-expanded', String(!c));
  };

  await data.loadAll('chess', 'tokens', 'items', 'enemies', 'stages', 'bonds', 'config', 'backups', 'outfits');
  try { await data.setLocale('en'); } catch { /* Chinese skill names */ }
  await assets.ready();

  const index = await fetch('/dev/perf/index.json').then((r) => (r.ok ? r.json() : []), () => []);
  const normalSpecs = index.filter((s) => s.kind === 'normal');
  if (!normalSpecs.length) throw new Error('No enemy waves found: public/dev/perf/index.json lists no normal battle (node tools/capture-specs.mjs).');
  for (const s of normalSpecs) $('enemies').append(new Option(`Round ${s.round} waves (${s.stageId})`, s.name));
  const specName = normalSpecs.some((s) => s.name === q.get('enemies')) ? q.get('enemies') : (normalSpecs.find((s) => s.name === DEFAULT_ENEMIES) || normalSpecs[0]).name;
  $('enemies').value = specName;
  if (['1', '2', '4'].includes(q.get('speed'))) $('speed').value = q.get('speed');
  $('impostors').checked = q.get('imp') !== '0';
  $('legacy').checked = q.get('legacy') === '1';

  const template = await fetch(`/dev/perf/${encodeURIComponent(specName)}.json`).then((r) => {
    if (!r.ok) throw new Error(`Enemy waves ${specName} failed to load (HTTP ${r.status}).`);
    return r.json();
  });
  const stage = data.lookup('stages', template.spec.stageId);
  const tiles = deployMap(stage);   // 'r,c' → 'melee' | 'ranged'

  // ---- the operator picker -----------------------------------------------------------------------------------
  const pool = data.list('chess').filter((c) => c && c.visible && !c.isDiy && c.charId)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)) || Number(a.isGolden) - Number(b.isGolden));
  const byLabel = new Map(pool.map((c) => [label(c), c]));
  for (const c of pool) $('op-list').append(new Option(label(c)));
  let current = null;
  const elite = (c) => (c ? data.lookup('chess', $('op-elite').value === '1' ? c.goldenId || c.chessId : c.baseId || c.chessId) || c : null);
  const allows = (c, key) => {
    const cls = tiles.get(key);
    if (!cls) return false;
    return cls === 'melee' || c.position !== 'MELEE' || meleeOnHighGround(c);
  };
  const refreshPicker = () => {
    const c = elite(current);
    const skins = c ? outfitsOf(c.charId) : [];
    const keepSkin = $('op-skin').value;
    $('op-skin').replaceChildren(new Option(skins.length ? 'Default' : 'Default (no outfits)', ''), ...skins.map((r) => new Option(outfitLabel(r), r.id)));
    if (skins.some((r) => r.id === keepSkin)) $('op-skin').value = keepSkin;   // the form switch keeps the outfit
    $('op-skin').disabled = !skins.length;
    $('op-skill').replaceChildren(...(c?.skills?.length ? c.skills : [c?.skill].filter(Boolean)).map((s, i) => new Option(skillName(s, i), String(i))));
    const full = !bench.includes(null);
    $('op-add').disabled = !c || full;
    if (c && full) status('The bench is full: drag someone onto the board first.');
  };
  $('op-search').oninput = () => {
    const v = $('op-search').value.trim();
    current = byLabel.get(v) || pool.find((c) => !c.isGolden && nameOf(c).toLowerCase() === v.toLowerCase()) || null;
    if (current?.isGolden) { $('op-elite').value = '1'; current = data.lookup('chess', current.baseId) || current; }
    refreshPicker();
  };
  $('op-elite').onchange = refreshPicker;

  // ---- the board and the bench (the game's prep: drag a bench piece onto a highlighted tile) ----------------------
  let board = parseUnits(q.get('units')).filter((u) => {
    const c = data.lookup('chess', u.chessId);
    if (u.skin && !(c && isOutfitOf(c.charId, u.skin) && outfitsOf(c.charId).some((r) => r.id === u.skin))) u.skin = null;
    return c && allows(c, `${u.row},${u.col}`);
  });
  // waiting on the bench (the hand row, HAND_SIZE slots): { chessId, skillIndex, dir, skin } or null; not in the URL
  const BENCH = 10;
  const bench = Array(BENCH).fill(null);
  const sync = () => {
    const p = new URLSearchParams(location.search);
    if (board.length) p.set('units', unitsParam(board)); else p.delete('units');
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
      const c = data.lookup('chess', u.chessId);
      const li = document.createElement('li');
      const sk = (c?.skills || [])[u.skillIndex];
      li.innerHTML = '<span><b></b><small></small></span>';
      li.querySelector('b').textContent = label(c);
      const skin = u.skin ? outfitsOf(c?.charId).find((r) => r.id === u.skin) : null;
      li.querySelector('small').textContent = `${skillName(sk, u.skillIndex)}${skin ? ` · ${skin.name}` : ''} · ${where}`;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'Remove';
      rm.setAttribute('aria-label', `Remove ${nameOf(c)}`);
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
  const view = await createFieldView($('field'), { data, assets, settings: settings(), outfitOf });
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
    return { uid: uidOf(u), kind: 'chess', id: u.chessId, golden: !!c?.isGolden, tier: c?.tier ?? 1, items: [], ...extra };
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
  // the field view asks this while dragging (legal tiles are highlighted) and before a drop: a board tile of the right
  // class, free or holding someone who could stand where the dragged one came from; any bench slot
  const canPlace = (id, target) => {
    if (runner) return false;
    const src = locate(id);
    if (!src || !target) return false;
    const c = data.lookup('chess', src.u.chessId);
    if (target.area === 'hand') {
      if (!Number.isInteger(target.idx) || target.idx < 0 || target.idx >= BENCH) return false;
      const occ = bench[target.idx];
      return !occ || src.area === 'hand' || allows(data.lookup('chess', occ.chessId), `${src.u.row},${src.u.col}`);
    }
    if (target.area !== 'board' || !c || !allows(c, `${target.row},${target.col}`)) return false;
    const occ = occupant(target);
    if (!occ || occ === src.u) return true;
    return src.area === 'hand' || allows(data.lookup('chess', occ.chessId), `${src.u.row},${src.u.col}`);
  };
  /** Apply a legal drop: move, or swap with the occupant. */
  const move = (id, target) => {
    const src = locate(id);
    if (!src) return;
    const occ = occupant(target);
    if (occ === src.u) return;
    const take = (loc) => { if (loc.area === 'board') board = board.filter((u) => u !== loc.u); else bench[loc.idx] = null; };
    const put = (u, t) => {
      if (t.area === 'hand') { delete u.row; delete u.col; bench[t.idx] = u; }
      else { u.row = t.row; u.col = t.col; board.push(u); }
    };
    const from = src.area === 'board' ? { area: 'board', row: src.u.row, col: src.u.col } : { area: 'hand', idx: src.idx };
    take(src);
    if (occ) take(locate(occ.uid));
    put(src.u, target);
    if (occ) put(occ, from);
  };
  const prep = () => {
    if (runner) { try { runner.dispose(); } catch { /* ignore */ } runner = null; }
    view.setLocalFeed({ on: false });
    view.setPrep(prepState(), { editable: true, canPlace });
    view.setCamera('prep', { rect: { ...template.spec.rect }, side: 'L', instant: true });
    $('fight').disabled = false;
  };
  const changed = () => { sync(); renderList(); refreshPicker(); prep(); status(summary()); };

  $('op-add').onclick = () => {
    const c = elite(current);
    if (!c) return;
    const idx = bench.indexOf(null);
    if (idx < 0) return;
    bench[idx] = { chessId: c.chessId, skillIndex: Number($('op-skill').value) || 0, dir: $('op-dir').value, skin: $('op-skin').value || null };
    changed();
    status(`${nameOf(c)} is on the bench: drag it onto a highlighted tile.`);
  };
  // a drop: legal ones are applied (the view already checked canPlace); off the field, a board piece returns to the
  // bench and a bench piece is removed
  view.on('pieceDrop', (e) => {
    if (runner) return;
    if (e.target?.area === 'outside') {
      const src = locate(e.uid);
      if (src?.area === 'board') {
        const idx = bench.indexOf(null);
        board = board.filter((u) => u !== src.u);
        if (idx >= 0) { delete src.u.row; delete src.u.col; bench[idx] = src.u; }
      } else if (src?.area === 'hand') bench[src.idx] = null;
      changed();
      return;
    }
    if (!canPlace(e.uid, e.target)) { prep(); return; }
    move(e.uid, e.target);
    changed();
  });
  $('clear').onclick = () => { board = []; bench.fill(null); changed(); };
  $('reset').onclick = () => { prep(); status('Back in prep.'); };
  $('enemies').onchange = () => { sync(); location.reload(); };
  $('speed').onchange = sync;
  $('impostors').onchange = () => { sync(); view.setSettings(settings()); };
  $('legacy').onchange = () => { sync(); view.setSettings(settings()); };

  const fight = async () => {
    if (!board.length) { status(bench.some(Boolean) ? 'Drag an operator from the bench onto the board first.' : 'Add at least one operator first.', true); return; }
    if (runner) { try { runner.dispose(); } catch { /* ignore */ } }
    const spec = JSON.parse(JSON.stringify(template.spec));
    spec.battleId = `sandbox.${Date.now()}`;
    const me = spec.players[0];
    skinByUid.clear();
    for (const u of board) if (u.skin) skinByUid.set(uidOf(u), u.skin);
    me.units = board.map((u) => ({ uid: uidOf(u), kind: 'chess', chessId: u.chessId, row: u.row, col: u.col, dir: u.dir, items: [], skillIndex: u.skillIndex }));
    for (const b of Object.values(me.bonds || {})) { b.count = 0; b.active = false; b.tier = 0; }
    me.playerEffects = [];
    runner = createBattleRunner({ net, store: null });
    runner.on('field', (field) => {
      view.setLocalFeed({ on: true, speed: field.speed });   // client-side combat, as the match screen runs it
      view.enterBattle(field);
      view.setCamera('normal', { rect: field.rect, side: 'L', instant: true });
    });
    runner.on('snap', (snap) => view.pushSnapshot(snap));
    runner.on('ev', (ev) => view.pushEvents(ev));
    sb.runner = runner;
    $('fight').disabled = true;
    status('Fighting…');
    try {
      await runner.onStart({ ...template, spec, battleId: spec.battleId, elapsed: 0, authoritative: true, watch: false, done: false, speed: Number($('speed').value) || 2 });
    } catch (e) { status(`The battle did not start: ${e?.message || e}`, true); $('fight').disabled = false; }
  };
  $('fight').onclick = fight;
  setInterval(() => {
    if (!runner) return;
    const st = runner.state?.();
    if (st?.done) { status('Battle over. "Back to prep" to change the board, or start again.'); $('fight').disabled = false; }
  }, 500);

  sb.view = view;
  sb.units = () => board.map(({ uid, ...u }) => u); // eslint-disable-line no-unused-vars
  sb.bench = () => bench.map((u) => (u ? u.chessId : null));
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
