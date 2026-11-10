// 0.2.0 自选编队 — client side (research 0.2.0 §2; the owner's decisions of 2026-10-05): the 自选编队 tab's model (storage,
// the slots, the picker's operators with the kit list, skill / module choices without 集成战略 modules, export / import)
// and its server sync (room.diy; welcome.diyKitted), the tab's components (four slots, the picker, 确认), and the match
// UI of a 自选 piece — the shop / reward card and the detail card show the operator (name, art, class, derived bonds,
// the pick's skill and module) with a 「自选」 badge, the own pieces get a tag, placement reads the operator's position, and
// the bond popup lists the 自选 member (own and a teammate's).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try {
    const body = readFileSync(path.join(ROOT, 'data', name), 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(body) };
  } catch {
    return { ok: false, status: 404, json: async () => ({}) };
  }
};

const M = await import('../../public/js/ui/diyModel.js');
const { installDiySync, SYNC_DEBOUNCE_MS } = await import('../../public/js/ui/loadoutSync.js');
const { createStore } = await import('../../public/js/store.js');
const G = await import('../../public/js/ui/gameLogic.js');
const { ChessCard } = await import('../../public/js/ui/shopBar.js');
const { ChessDetail, resolveDetail } = await import('../../public/js/ui/detailPanel.js');
const { BondPopup } = await import('../../public/js/ui/bondStrip.js');
const { ownerBoard } = await import('../../public/js/ui/watchBonds.js');
const { diyPieces } = await import('../../public/js/screens/game/standInTags.js');
const { DiyPickerView, DiyDeckSlot } = await import('../../public/js/screens/diy.js');
const { data } = await import('../../public/js/data.js');
const { DATA } = await import('../match/harness.js');
const { KITTED_CHARS } = await import('../../server/sim/content/kits/index.js');

await data.loadAll('chess', 'bonds', 'assets', 'garrisons', 'items', 'backups');

const D = { chess: DATA.chess, backups: DATA.backups };
const getChess = (id) => (Object.hasOwn(DATA.chess, id) ? DATA.chess[id] : null);
const T5A = 'chess_char_5_diy1_a';
const T5B = 'chess_char_5_diy2_a';
const T6A = 'chess_char_6_diy1_a';
const T6B = 'chess_char_6_diy2_a';
const SIEGE = 'char_112_siege';
const SHARP = 'char_609_acguad';
const KALTS = 'char_003_kalts'; // 凯尔希: an ISW-A module at both elite stages
const SIEGE_PICK = { charId: SIEGE, skillIndex: 2, uniEquipId: 'uniequip_002_siege' };
const KIT = [...KITTED_CHARS];

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
/** Render a component tree one level of function components deep at a time (htm vnodes with function types). */
function expand(v, depth = 6) {
  if (Array.isArray(v)) return v.map((x) => expand(x, depth));
  if (!v || typeof v !== 'object') return v;
  if (typeof v.type === 'function' && depth > 0) {
    try { return expand(v.type(v.props || {}), depth - 1); } catch { return v; }
  }
  const children = v.props?.children;
  return children === undefined ? v : { ...v, props: { ...v.props, children: expand(children, depth) } };
}
/** (fork) A picker card is the shared DeckOpCard: a pick is a press on its portrait button (the card's root has no handler). */
const pickCard = (tree, charId) => {
  const card = [...walk(tree)].find((v) => hasClass(v, 'diy-opt') && v.props['data-char'] === charId);
  assert.ok(card, `the card of ${charId}`);
  return [...walk(card)].find((v) => hasClass(v, 'diy-opt__pick'));
};
const textOf = (v) => [...walk(v)].flatMap((n) => (Array.isArray(n.props?.children) ? n.props.children : [n.props?.children])).filter((x) => typeof x === 'string' || typeof x === 'number').join('');

describe('自选编队 model (ui/diyModel.js)', () => {
  test('storage: tolerant parse, junk and hostile keys dropped, round trip', () => {
    assert.deepEqual(M.parseStoredDiy(null), {});
    const raw = { v: 1, picks: { [T5A]: SIEGE_PICK, [T6A]: { charId: SHARP }, __proto__x: 1, bad: { charId: 'a b' }, [T6B]: { charId: SIEGE, skillIndex: 99 } } };
    assert.deepEqual(M.parseStoredDiy(raw), { [T5A]: SIEGE_PICK, [T6A]: { charId: SHARP }, [T6B]: { charId: SIEGE } });
    assert.deepEqual(M.toStoredDiy({ [T5A]: SIEGE_PICK }), { v: M.DIY_VERSION, picks: { [T5A]: SIEGE_PICK } });
    assert.equal(M.diyCount({ [T5A]: SIEGE_PICK, [T6A]: null }), 1);
    assert.deepEqual(M.setPick({ [T5A]: SIEGE_PICK }, T5A, null), {});
    assert.deepEqual(M.setPick({}, T6A, { charId: SHARP }), { [T6A]: { charId: SHARP } });
  });

  test('the four slots by tier, with the 调度中心 level that sells them', () => {
    assert.deepEqual(M.diySlotList(D).map((s) => [s.slotId, s.tier, s.shopLevel]), [[T5A, 5, 5], [T5B, 5, 5], [T6A, 6, 6], [T6B, 6, 6]]);
  });

  test('the picker lists only kitted operators (prototypes first), marks one another slot holds', () => {
    const opts = M.pickOptions(T5A, {}, D, KIT);
    const ids = opts.map((o) => o.charId);
    assert.ok(ids.includes(SIEGE) && ids.includes(SHARP) && ids.includes('char_601_cguard'));
    assert.ok(ids.every((id) => KIT.includes(id)), 'no operator without a kit');
    assert.ok(ids.indexOf(SHARP) < ids.indexOf(SIEGE), 'prototypes first');
    assert.deepEqual(opts.find((o) => o.charId === SIEGE).bonds, ['victoriaShip']);
    assert.equal(opts.find((o) => o.charId === SHARP).proto, true);
    assert.ok(!M.pickOptions(T6A, {}, D, KIT).some((o) => o.charId === 'char_601_cguard'), 'a 4★ reserve is a tier-5 pick only');
    // taken: an owned operator in any other slot; a prototype in the other slot of its tier (not across tiers)
    const roster = { [T5B]: { charId: SHARP }, [T6A]: SIEGE_PICK };
    const at5 = M.pickOptions(T5A, roster, D, KIT);
    assert.equal(at5.find((o) => o.charId === SIEGE).taken, T6A);
    assert.equal(at5.find((o) => o.charId === SHARP).taken, T5B);
    assert.equal(M.pickOptions(T6B, roster, D, KIT).find((o) => o.charId === SHARP).taken, null, 'a prototype may fill a tier-5 and a tier-6 slot');
    assert.deepEqual(M.pickOptions(T5A, {}, D, []), [], 'no kit list (not connected): nothing to pick');
  });

  test('choices: three skills, the elite form\'s modules without the 集成战略 (ISW-A) ones; a prototype\'s locked selection', () => {
    const ch = M.pickChoices(SIEGE, T6A, D);
    assert.deepEqual(ch.skills.map((s) => s.index), [0, 1, 2]);
    assert.deepEqual(ch.modules.map((x) => x.uniEquipId), ['uniequip_002_siege', 'uniequip_003_siege']);
    assert.equal(ch.stage, 3);
    assert.equal(M.pickChoices(SIEGE, T5A, D).stage, 1);
    const kalts = M.pickChoices(KALTS, T6A, D);
    assert.ok(kalts.elite.modules.some((x) => x.typeName === 'ISW-A'), 'the form has one');
    assert.ok(!kalts.modules.some((x) => x.rec.typeName === 'ISW-A'), 'never offered');
    const proto = M.pickChoices(SHARP, T5A, D);
    assert.equal(proto.proto, true);
    assert.deepEqual(proto.locked, { skillIndex: 2, uniEquipId: 'uniequip_002_acguad' });
    assert.deepEqual(M.defaultPick(SIEGE, T5A, D), { charId: SIEGE, skillIndex: 2, uniEquipId: 'uniequip_002_siege' }, 'S3 and the first module');
    assert.deepEqual(M.defaultPick(SHARP, T5A, D), { charId: SHARP });
  });

  test('sanitize keeps what the server keeps; export / import envelopes', () => {
    assert.deepEqual(M.sanitizeDiyPicks({ [T5A]: SIEGE_PICK, [T6A]: { charId: SIEGE, skillIndex: 0 } }, D, KIT), { [T5A]: SIEGE_PICK });
    const text = M.serializeDiy({ [T5A]: SIEGE_PICK }, { now: 0 });
    const env = JSON.parse(text);
    assert.deepEqual([env.kind, env.v, env.count, env.picks], [M.DIY_EXPORT_KIND, 1, 1, { [T5A]: SIEGE_PICK }]);
    assert.deepEqual(M.parseDiyImport(text), { ok: true, picks: { [T5A]: SIEGE_PICK } });
    assert.deepEqual(M.parseDiyImport({ v: 1, picks: {} }), { ok: true, picks: {} });
    for (const bad of ['', '{nope', { v: 9, picks: {} }, { kind: 'stronghold.ownership', v: 1, notOwned: [] }, 'x'.repeat(M.DIY_IMPORT_MAX_BYTES + 1), [1]]) {
      assert.equal(M.parseDiyImport(bad).ok, false, JSON.stringify(bad).slice(0, 30));
    }
  });
});

// ---- sync -------------------------------------------------------------------------------------------------------------

function fakeNet() {
  const listeners = new Map();
  const net = {
    status: 'online', sent: [], replies: [],
    on(t, fn) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(fn); return () => listeners.get(t).delete(fn); },
    emit(t, msg) { for (const fn of listeners.get(t) || []) fn(msg); },
    request(t, fields) {
      net.sent.push({ t, ...fields });
      const r = net.replies.shift();
      return r && r.error ? Promise.reject(Object.assign(new Error(r.error), { code: r.error })) : Promise.resolve({ t: 'ok' });
    },
  };
  return net;
}
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const q = new Map();
  return {
    setTimeout: (fn, ms) => { const id = ++seq; q.set(id, { at: now + ms, fn }); return id; },
    clearTimeout: (id) => q.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...q.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        q.delete(next[0]);
        now = next[1].at;
        next[1].fn();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
      now = end;
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

test('diy sync: welcome brings the kit list and sends room.diy; edits are debounced; in a match stored for the next one (told once)', async () => {
  const net = fakeNet();
  const T = fakeTimers();
  const told = [];
  const target = createStore({ diy: { [T5A]: SIEGE_PICK }, diyKitted: null, open: false, diySync: 'idle' });
  const s = installDiySync({ net, timers: T, target, notify: (x) => told.push(x) });
  net.emit('welcome', { diyKitted: [SIEGE, SHARP, 7] });
  assert.deepEqual(target.get().diyKitted, [SIEGE, SHARP]);
  await T.advance(100);
  assert.deepEqual(net.sent, [{ t: 'room.diy', picks: { [T5A]: SIEGE_PICK } }]);
  assert.equal(target.get().diySync, 'synced');
  target.set({ diy: { [T5A]: SIEGE_PICK, [T6A]: { charId: SHARP } } });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.deepEqual(net.sent[1], { t: 'room.diy', picks: { [T5A]: SIEGE_PICK, [T6A]: { charId: SHARP } } });
  net.replies.push({ error: 'ROOM_STARTED' });
  target.set({ diy: {} });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.equal(target.get().diySync, 'locked');
  assert.deepEqual(told, ['自选编队是局外设置，修改将在下一局生效']);
  net.emit('room.state', { inMatch: false });
  await T.advance(SYNC_DEBOUNCE_MS + 10);
  assert.deepEqual(net.sent.at(-1), { t: 'room.diy', picks: {} });
  s.dispose();
});

// ---- the tab --------------------------------------------------------------------------------------------------------------

describe('自选编队 picker (screens/diy.js)', () => {
  for (const slotId of [T5A, T6A]) {
    for (const saved of [null, SIEGE_PICK]) {
      test(`the picker: ${slotId}, ${saved ? 'saved' : 'empty'} slot retains edits when reselecting its operator`, () => {
        const picks = saved ? { [slotId]: saved } : {};
        const done = [];
        let draft = saved ? { ...saved } : null;
        let filters = {};
        const view = () => expand(DiyPickerView({ narrowDetail: true, m: null, slot: { slotId }, picks, kitted: KIT,
          onDone: (p) => done.push(p), onClose() {}, filters, draft, onDraft: (d) => { draft = d; } }));
        const click = (key, value, cls = null) => {
          if (key === 'data-char') { pickCard(view(), value).props.onClick(); return; }
          const node = [...walk(view())].find((v) => v.props?.[key] === value && typeof v.props.onClick === 'function' && (!cls || hasClass(v, cls)));
          assert.ok(node, `${key}=${value}${cls ? ` (.${cls})` : ''} is clickable`);
          node.props.onClick();
        };
        // the pane's cards (.lo-skill / .lo-mod, the roster's own) and a row's quick choice (.lo-q) carry the same
        // data-skill / data-module, so the pane's are named by their class
        const rowQuick = (charId, key, value) => {
          const row = [...walk(view())].find((v) => hasClass(v, 'diy-opt') && v.props['data-char'] === charId);
          assert.ok(row, `the row of ${charId}`);
          const hit = [...walk(row)].find((v) => v.props?.[key] === value && typeof v.props.onClick === 'function');
          assert.ok(hit, `${charId}: the row's quick choice ${key}=${value}`);
          hit.props.onClick();
        };
        click('data-char', SIEGE);
        click('data-skill', 0, 'lo-skill');
        click('data-module', 'none', 'lo-mod');
        const edited = { charId: SIEGE, skillIndex: 0, uniEquipId: null };
        assert.deepEqual(draft, edited);
        // a row's own quick choice writes the draft through the same path 确认 saves (the roster's quick choices, PR #301)
        rowQuick(SIEGE, 'data-skill', 1);
        assert.deepEqual(draft, { charId: SIEGE, skillIndex: 1, uniEquipId: null });
        rowQuick(SIEGE, 'data-module', 'uniequip_003_siege');
        assert.deepEqual(draft, { charId: SIEGE, skillIndex: 1, uniEquipId: 'uniequip_003_siege' });
        click('data-skill', 0, 'lo-skill');
        click('data-module', 'none', 'lo-mod');
        assert.deepEqual(draft, edited);
        click('data-char', SIEGE);
        assert.deepEqual(draft, edited, 'reselecting keeps both the skill and explicit no-module choice');
        // Filtering/searching the operator out and back in must not change the draft either.
        filters = { query: 'no matching operator' };
        assert.ok(![...walk(view())].some((v) => hasClass(v, 'diy-opt')));
        filters = { query: '推进' };
        click('data-char', SIEGE);
        assert.deepEqual(draft, edited);
        click('data-testid', 'diy-confirm');
        assert.deepEqual(done, [edited]);
        assert.deepEqual(picks, saved ? { [slotId]: saved } : {}, 'the saved picks stay unchanged until the parent saves');
        // Switching operators still initializes the new pick, and returning restores the saved/default pick.
        filters = {};
        click('data-char', SHARP);
        assert.deepEqual(draft, M.defaultPick(SHARP, slotId, D));
        click('data-char', SIEGE);
        assert.deepEqual(draft, saved || M.defaultPick(SIEGE, slotId, D));
      });
    }
  }

  test("(fork, docs/OUTFITS.md) the picker's detail is 干员调配's: its 调配 / 时装 switch, 时装 the outfit panel of the operator being picked", async () => {
    await data.loadAll('outfits');
    const views = [];
    const view = (draft, detailView = 'loadout') => expand(DiyPickerView({ narrowDetail: true, m: data.get('assets'), slot: { slotId: T5A, tier: 5, shopLevel: 5 }, picks: {}, kitted: KIT, onDone() {}, onClose() {},
      draft, onDraft() {}, detailView, onDetailView: (v) => views.push(v) }), 2);
    const find = (tree, name) => [...walk(tree)].find((v) => typeof v.type === 'function' && v.type.name === name);
    const sw = find(view({ ...SIEGE_PICK }), 'OutfitSwitch');
    assert.ok(sw, 'Siege: the 调配 / 时装 switch');
    assert.equal(sw.props.view, 'loadout');
    sw.props.onView('outfit');
    assert.deepEqual(views, ['outfit']);
    assert.equal(find(view({ ...SIEGE_PICK }), 'OutfitPanel'), undefined, '调配: the loadout sections');
    assert.ok(find(view({ ...SIEGE_PICK }), 'SkillSection'));
    const panel = find(view({ ...SIEGE_PICK }, 'outfit'), 'OutfitPanel');
    assert.ok(panel, '时装: the outfit panel');
    assert.equal(panel.props.chess.charId, SIEGE);
    assert.equal(find(view({ ...SIEGE_PICK }, 'outfit'), 'SkillSection'), undefined);
    assert.equal(find(view(null), 'OutfitSwitch'), undefined, 'nothing picked yet: no detail');
  });

  test('the picker: the slot\'s operators; choosing one and its skill / module confirms the pick', () => {
    const done = [];
    let draft = { ...SIEGE_PICK };
    const view = () => expand(DiyPickerView({ narrowDetail: true, m: null, slot: { slotId: T5A, tier: 5, shopLevel: 5 }, picks: { [T5A]: SIEGE_PICK }, kitted: KIT, onDone: (p) => done.push(p), onClose() {},
      draft, onDraft: (d) => { draft = d; } }));
    let tree = view();
    const opts = [...walk(tree)].filter((v) => hasClass(v, 'diy-opt'));
    assert.ok(opts.some((v) => v.props['data-char'] === SIEGE) && opts.some((v) => v.props['data-char'] === SHARP));
    // the current pick is shown with its three skills and its modules (none + X + Y)
    const skills = [...walk(tree)].filter((v) => v.props?.role === 'radio' && v.props['data-skill'] != null);
    assert.deepEqual(skills.map((v) => v.props['data-skill']), [0, 1, 2]);
    assert.equal(skills.find((v) => v.props['aria-checked'] === 'true').props['data-skill'], 2);
    const mods = [...walk(tree)].filter((v) => v.props?.role === 'radio' && v.props['data-module'] != null);
    assert.deepEqual(mods.map((v) => v.props['data-module']), ['none', 'uniequip_002_siege', 'uniequip_003_siege']);
    // another skill and no module, then 确认
    skills.find((v) => v.props['data-skill'] === 0).props.onClick();
    tree = view();
    [...walk(tree)].find((v) => v.props?.role === 'radio' && v.props['data-module'] === 'none').props.onClick();
    tree = view();
    [...walk(tree)].find((v) => v.props?.['data-testid'] === 'diy-confirm').props.onClick();
    assert.deepEqual(done, [{ charId: SIEGE, skillIndex: 0, uniEquipId: null }]);
    // a prototype: its skill and module are the locked selection of its 补位 rows — the pane offers that one card each
    // (read-only: the shared cards have no disabled, the picker's own handler is a no-op) and the row's cells are static
    pickCard(tree, SHARP).props.onClick();
    tree = view();
    const protoRow = [...walk(tree)].find((v) => hasClass(v, 'diy-opt') && v.props['data-char'] === SHARP);
    assert.equal([...walk(protoRow)].filter((v) => (v.props['data-skill'] != null || v.props['data-module'] != null) && v.props.onClick).length, 0, 'the prototype card has no quick choice to tap');
    const locked = [...walk(tree)].filter((v) => v.props?.role === 'radio');
    assert.deepEqual(locked.map((v) => v.props['data-skill'] ?? v.props['data-module']), [2, 'uniequip_002_acguad'], 'only the locked skill and module');
    locked[0].props.onClick();
    tree = view();
    assert.deepEqual(draft, { charId: SHARP }, 'tapping the locked skill changes nothing');
    [...walk(tree)].find((v) => v.props?.['data-testid'] === 'diy-confirm').props.onClick();
    assert.deepEqual(done.at(-1), { charId: SHARP });
  });

  test('(fork) the page\'s 筛选 (class, bond, search) narrows the deck; the deck groups by class, a marker each, the bar jumps to one', () => {
    let filters = {};
    const jumps = [];
    const view = () => expand(DiyPickerView({ m: null, slot: { slotId: T6A, tier: 6, shopLevel: 6 }, picks: {}, kitted: KIT, onDone() {}, onClose() {},
      filters, draft: null, onDraft() {}, onJumpProf: (p) => jumps.push(p) }));
    const rows = (tree) => [...walk(tree)].filter((v) => hasClass(v, 'diy-opt')).map((v) => v.props['data-char']);
    const tree = view();
    const all = rows(tree);
    assert.ok(all.length > 2, 'the tier-6 slot lists several operators');
    // one group per class present, in the roster's class order, each its class marker and count
    const PROF_ORDER = ['PIONEER', 'WARRIOR', 'TANK', 'SNIPER', 'CASTER', 'MEDIC', 'SUPPORT', 'SPECIAL'];
    const groups = [...walk(tree)].filter((v) => hasClass(v, 'lo-tgroup'));
    const profs = groups.map((g) => g.props['data-group']);
    assert.deepEqual(profs, PROF_ORDER.filter((p) => all.some((id) => DATA.backups.units[id].profession === p)));
    for (const g of groups) {
      const ids = [...walk(g)].filter((v) => hasClass(v, 'diy-opt')).map((v) => v.props['data-char']);
      assert.ok(ids.every((id) => DATA.backups.units[id].profession === g.props['data-group']), g.props['data-group']);
      const mark = [...walk(g)].find((v) => hasClass(v, 'diy-cmark'));
      assert.ok(mark && hasClass(mark, 'lo-tmark'), 'the class marker (the tier marker\'s frame)');
      assert.equal(textOf([...walk(mark)].find((v) => hasClass(v, 'lo-tmark__cnt'))), String(ids.length));
    }
    assert.deepEqual(all, groups.flatMap((g) => [...walk(g)].filter((v) => hasClass(v, 'diy-opt')).map((v) => v.props['data-char'])), 'every card in its group');
    // the bar: a button per class present (the shared GroupBarLive), a jump names the class
    const bar = [...walk(tree)].find((v) => typeof v.type === 'function' && v.type.name === 'GroupBarLive');
    assert.deepEqual(bar.props.items.map((it) => it.key), profs);
    bar.props.onJump(profs[1]);
    assert.deepEqual(jumps, [profs[1]]);
    // the class filter: one group left
    filters = { prof: 'PIONEER' };
    const pioneers = rows(view());
    assert.ok(pioneers.length && pioneers.length < all.length, `${pioneers.length} of ${all.length} are 先锋`);
    for (const id of pioneers) assert.equal(DATA.backups.units[id].profession, 'PIONEER', `${id} is a 先锋`);
    assert.deepEqual([...walk(view())].filter((v) => hasClass(v, 'lo-tgroup')).map((g) => g.props['data-group']), ['PIONEER']);
    // a bond and the search narrow it too
    const bond = DATA.backups.units[all[0]] && M.pickOptions(T6A, {}, D, KIT).find((o) => o.charId === all[0]).bonds[0];
    filters = { bond };
    const bonded = rows(view());
    assert.ok(bonded.length && bonded.includes(all[0]) && bonded.length <= all.length);
    for (const id of bonded) assert.ok(M.pickOptions(T6A, {}, D, KIT).find((o) => o.charId === id).bonds.includes(bond), `${id} has ${bond}`);
    filters = { query: DATA.backups.units[all[0]].name };
    assert.ok(rows(view()).includes(all[0]));
    filters = { query: 'no matching operator' };
    assert.deepEqual(rows(view()), []);
    assert.equal([...walk(view())].find((v) => typeof v.type === 'function' && v.type.name === 'GroupBarLive'), undefined, 'nothing listed: no bar');
  });

  test('(fork) the picker\'s operators are the card view\'s cards: one deck without tiers, skills on top and modules below in each card\'s column', () => {
    const quick = [];
    let draft = null;
    const view = (picks = {}) => expand(DiyPickerView({ m: null, slot: { slotId: T6A, tier: 6, shopLevel: 6 }, picks, kitted: KIT, onDone() {}, onClose() {},
      draft, onDraft: (d) => { draft = d; quick.push(d); } }));
    const tree = view();
    const deck = [...walk(tree)].find((v) => hasClass(v, 'diy-deck'));
    assert.ok(deck && hasClass(deck, 'lo-deck'), 'a sideways deck');
    assert.ok([...walk(tree)].filter((v) => hasClass(v, 'lo-tgroup')).every((g) => g.props['data-prof']), 'class groups, no tier groups');
    assert.equal([...walk(tree)].filter((v) => hasClass(v, 'lo-list__head') || hasClass(v, 'lo-cult')).length, 0, 'no list head, no 潜能 / 练度 on the cards');
    const card = (charId, t = tree) => [...walk(t)].find((v) => hasClass(v, 'diy-opt') && v.props['data-char'] === charId);
    // an owned 6★: the card view's card, its three skills, then every module (不装备 first) and the stepping button
    const siege = card(SIEGE);
    assert.ok(['lo-op', 'has-side', 'lo-op--t6'].every((c) => hasClass(siege, c)));
    const side = [...walk(siege)].find((v) => hasClass(v, 'lo-op__side'));
    const parts = [...walk(side)].filter((v) => hasClass(v, 'lo-op__skills') || hasClass(v, 'lo-op__mods')).map((v) => v.props.class);
    assert.deepEqual(parts, ['lo-op__skills', 'lo-op__mods'], 'skills at the top, modules below');
    assert.deepEqual([...walk(side)].filter((v) => hasClass(v, 'lo-q--skill')).map((v) => v.props['data-skill']), [0, 1, 2]);
    const list = [...walk([...walk(side)].find((v) => hasClass(v, 'lo-op__mlist')))].filter((v) => hasClass(v, 'lo-q--mod'));
    assert.deepEqual(list.map((v) => v.props['data-module']), ['none', 'uniequip_002_siege', 'uniequip_003_siege']);
    const step = [...walk(side)].find((v) => hasClass(v, 'lo-op__mod'));
    assert.equal(step.props['data-module'], 'uniequip_002_siege', 'the default pick\'s module');
    step.props.onClick();
    assert.deepEqual(quick.at(-1), { ...M.defaultPick(SIEGE, T6A, D), uniEquipId: 'uniequip_003_siege' }, 'the stepping button writes the next module into the draft');
    let stopped = 0;
    side.props.onClick({ stopPropagation: () => { stopped += 1; } });
    assert.equal(stopped, 1, 'a press on the column never reaches the card');
    // a prototype: its locked skill and module only, no quick choice to tap
    const proto = card(SHARP);
    assert.ok(hasClass(proto, 'is-proto'));
    assert.equal([...walk(proto)].filter((v) => (v.props?.['data-skill'] != null || v.props?.['data-module'] != null) && v.props.onClick).length, 0);
    assert.equal([...walk(proto)].filter((v) => hasClass(v, 'lo-q') && hasClass(v, 'is-on')).length, 2, 'the locked skill and module, marked');
    // taken by the other tier-6 slot: dimmed, says where, its controls off, and a press does nothing
    const taken = card(SIEGE, view({ chess_char_6_diy2_a: SIEGE_PICK }));
    assert.ok(hasClass(taken, 'is-taken'));
    assert.match(textOf(taken), /已在6阶自选中/);
    assert.ok([...walk(taken)].filter((v) => hasClass(v, 'lo-q--skill')).every((v) => v.props.disabled === true));
    const before = quick.length;
    [...walk(taken)].find((v) => hasClass(v, 'lo-op__card')).props.onClick({ target: { closest: () => null } });
    assert.equal([...walk(taken)].find((v) => hasClass(v, 'diy-opt__pick')).props.disabled, true);
    assert.equal(quick.length, before, 'a taken card does not select');
  });

  test("(fork) the card view's 自选编队 slot cards: an empty slot opens its picker; a pick is an operator card — a press selects it, its 更换 opens the picker", () => {
    const opened = [], selected = [];
    const slot = { slotId: T5A, tier: 5, shopLevel: 5 };
    const empty = expand(DiyDeckSlot({ m: null, slot, pick: null, illegal: false, onOpen: (id) => opened.push(id) }));
    assert.ok(hasClass(empty, 'lo-op--diy') && hasClass(empty, 'is-empty'));
    assert.equal(empty.props['data-slot'], T5A);
    assert.equal(empty.props['data-diy-tier'], 5);
    assert.ok(textOf(empty).includes('选择干员'));
    empty.props.onClick();
    const filled = expand(DiyDeckSlot({ m: null, slot, pick: SIEGE_PICK, illegal: false, onOpen: (id) => opened.push(id), onSel: (id) => selected.push(id) }));
    assert.ok(hasClass(filled, 'lo-diy--filled') && hasClass(filled, 'lo-op') && hasClass(filled, 'has-side'), 'the deck\'s own operator card (DeckOpCard)');
    assert.equal(filled.props['data-char'], SIEGE);
    assert.equal(filled.props['data-slot'], T5A);
    assert.ok(textOf(filled).includes(DATA.backups.units[SIEGE].name) && textOf(filled).includes('已持有'), textOf(filled));
    [...walk(filled)].find((v) => hasClass(v, 'lo-op__card')).props.onClick({ target: { closest: () => null } });
    assert.deepEqual(selected, [T5A], 'a press on the card selects it, as any card');
    assert.deepEqual(opened, [T5A], '…and does not open the picker');
    [...walk(filled)].find((v) => v.props?.['data-testid'] === 'diy-slot-change').props.onClick({ stopPropagation() {} });
    assert.deepEqual(opened, [T5A, T5A], 'its 更换 opens the slot\'s picker');
    assert.ok([...walk(filled)].some((v) => hasClass(v, 'lo-op__side')), 'its skill / module column');
    const bad = expand(DiyDeckSlot({ m: null, slot, pick: SIEGE_PICK, illegal: true, onOpen() {} }));
    assert.ok(hasClass(bad, 'is-bad') && /不可用/.test([...walk(bad)].find((v) => hasClass(v, 'lo-op__pick')).props.title));
  });

  test("(fork) a pick card's ✕ (top-right corner) empties its slot without opening the picker or selecting the card; an empty slot has none", () => {
    const opened = [], selected = [], cleared = [];
    const slot = { slotId: T5A, tier: 5, shopLevel: 5 };
    const props = { m: null, slot, illegal: false, onOpen: (id) => opened.push(id), onSel: (id) => selected.push(id), onClear: (id) => cleared.push(id) };
    const x = (v) => [...walk(v)].find((n) => n.props?.['data-testid'] === 'diy-slot-clear');
    const filled = expand(DiyDeckSlot({ ...props, pick: SIEGE_PICK }));
    const btn = x(filled);
    assert.ok(btn && btn.type === 'button' && hasClass(btn, 'lo-diy__clear'), 'the ✕ on a pick');
    assert.ok(/清空/.test(btn.props['aria-label']) && /清空/.test(btn.props.title), 'named 清空 for screen readers and on hover');
    let stopped = false;
    btn.props.onClick({ stopPropagation() { stopped = true; } });
    assert.deepEqual(cleared, [T5A], 'empties its slot');
    assert.ok(stopped, 'the press stays off the card');
    assert.deepEqual(opened, [], 'no picker');
    assert.deepEqual(selected, [], 'no selection');
    assert.equal(x(expand(DiyDeckSlot({ ...props, pick: null }))), undefined, 'an empty slot has no ✕');
    assert.equal(x(expand(DiyDeckSlot({ ...props, onClear: null, pick: SIEGE_PICK }))), undefined, 'no ✕ without a clear handler');
  });

  test("(fork) the picker's 清空 (a filled slot only): the card view has no 自选编队 overview to clear it from", () => {
    const cleared = [];
    const view = (picks) => expand(DiyPickerView({ m: null, slot: { slotId: T5A, tier: 5, shopLevel: 5 }, picks, kitted: KIT, onDone() {}, onClose() {},
      onClear: () => cleared.push(1), draft: picks[T5A] ? { ...picks[T5A] } : null, onDraft() {} }));
    const clear = (tree) => [...walk(tree)].find((v) => v.props?.['data-testid'] === 'diy-pick-clear');
    assert.equal(clear(view({})), undefined, 'an empty slot: nothing to clear');
    clear(view({ [T5A]: SIEGE_PICK })).props.onClick();
    assert.deepEqual(cleared, [1]);
  });
});

// ---- match UI -------------------------------------------------------------------------------------------------------------

describe('match UI of a 自选 piece', () => {
  const priv = { diy: { [T5A]: SIEGE_PICK, [T6A]: { charId: SHARP, skillIndex: 2, uniEquipId: 'uniequip_002_acguad' } }, loadout: {}, standIns: [], board: [], hand: [], temp: [] };
  test('gameLogic: the own pick of a slot (normal + elite), the composed record, the own getter', () => {
    assert.deepEqual(G.ownDiyPick(priv, getChess(T5A)), SIEGE_PICK);
    assert.deepEqual(G.ownDiyPick(priv, getChess('chess_char_5_diy1_b')), SIEGE_PICK, 'the elite too');
    assert.equal(G.ownDiyPick(priv, getChess(T5B)), null, 'a slot not filled');
    assert.equal(G.ownDiyPick(priv, getChess('chess_char_4_22_a')), null);
    const rec = G.ownDiyRecord(getChess(T5A), priv, D);
    assert.deepEqual([rec.name, rec.charId, rec.diyFor, rec.bonds, rec.tier, rec.price], [DATA.backups.units[SIEGE].name, SIEGE, T5A, ['victoriaShip'], 5, 4]);
    assert.equal(G.ownDiyRecord(getChess(T5A), priv, D), rec, 'cached');
    const get = G.diyGetter(getChess, priv, D);
    assert.equal(get(T5A), rec);
    assert.equal(get('chess_char_4_22_a'), getChess('chess_char_4_22_a'));
    assert.equal(G.chessLoadout(get('chess_char_5_diy1_b'), priv.loadout, get).skill.skillId, 'skchr_siege_3', 'the pick\'s skill');
    assert.equal(G.deployedModuleId(get('chess_char_5_diy1_b'), priv, get, D.backups), 'uniequip_002_siege', 'the pick\'s module on the elite');
    assert.equal(G.cardDiy(getChess(T5A), { unit: { diy: { charId: SHARP, skillIndex: 2, uniEquipId: 'uniequip_002_acguad' } }, data: D }).charId, SHARP, 'a teammate\'s unit says it itself');
  });

  test('placement reads the operator\'s position (推进之王 melee) through the own getter', () => {
    const get = G.diyGetter(getChess, priv, D);
    const ctx = G.placementContext({ priv, stage: null, editable: true, getChess: get, backups: D.backups });
    assert.equal(G.piecePosition(ctx, { kind: 'chess', id: T5A }), 'MELEE');
  });

  test('shop / reward card: the operator\'s name and bonds, the 「自选」 badge, the pick\'s skill', () => {
    const card = ChessCard({ slot: { kind: 'chess', id: T5A, price: 4, basePrice: 4 }, idx: 0, priv, onBuy() {}, onDetail() {} });
    const nodes = [...walk(card)];
    const badge = nodes.find((v) => hasClass(v, 'scard__diy'));
    assert.ok(badge);
    assert.equal(badge.props['data-diy'], SIEGE);
    assert.equal(badge.props.children, '自选');
    assert.equal(nodes.find((v) => hasClass(v, 'scard__name')).props.children, DATA.backups.units[SIEGE].name);
    assert.ok(nodes.some((v) => v.props?.bondId === 'victoriaShip'), 'the derived bond');
    assert.equal(nodes.find((v) => v?.type && v.props?.lo).props.lo.skill.skillId, 'skchr_siege_3');
    const other = ChessCard({ slot: { kind: 'chess', id: T5A, price: 4, basePrice: 4 }, idx: 0, priv: { diy: {} }, onBuy() {}, onDetail() {} });
    assert.equal([...walk(other)].find((v) => hasClass(v, 'scard__diy')), undefined);
  });

  test('detail card: own piece / card / a unit carrying diy → the operator, the 「自选」 tag, the pick\'s skill and module', () => {
    const piece = { uid: 7, kind: 'chess', id: 'chess_char_5_diy1_b', golden: true, items: [] };
    const pieces = new Map([[7, { piece, area: 'board', row: 10, col: 4 }]]);
    const r = resolveDetail({ kind: 'piece', uid: 7 }, pieces, { priv, backups: D.backups });
    assert.equal(r.chess.charId, SIEGE);
    assert.deepEqual(r.diy, SIEGE_PICK);
    assert.equal(resolveDetail({ kind: 'chess', id: T5A }, new Map(), { priv, backups: D.backups }).chess.charId, SIEGE, 'a shop card');
    assert.equal(resolveDetail({ kind: 'chess', id: T5A, foreign: true }, new Map(), { priv, backups: D.backups }).diy, undefined, 'the banned list / another player\'s card');
    const u = resolveDetail({ kind: 'unit', unit: { id: 3, uid: 33, side: 'ally', kind: 'op', defId: T6A, diy: { charId: SHARP, skillIndex: 2, uniEquipId: 'uniequip_002_acguad' } } }, new Map(), { priv: null, backups: D.backups });
    assert.equal(u.chess.charId, SHARP);
    const blocks = ChessDetail({ chess: r.chess, piece, editable: false, bonds: [], loadout: priv.loadout, diy: r.diy });
    const head = blocks.find((b) => b.key === 'head');
    assert.equal([...walk(head)].find((v) => hasClass(v, 'dtag-diy'))?.props.children, '自选');
    assert.equal([...walk(head)].find((v) => hasClass(v, 'dhead__name')).props.children, DATA.backups.units[SIEGE].name);
    const skill = blocks.find((b) => b.key === 'skill');
    assert.ok(JSON.stringify(skill.props).includes('skchr_siege_3'));
    const mod = blocks.find((b) => b.key === 'module');
    assert.ok(JSON.stringify(mod.props).includes('uniequip_002_siege'), 'the pick\'s module (elite)');
    assert.ok(!blocks.some((b) => b.key === 'garrison'), 'no 特质');
  });

  test('own prep pieces of a filled slot get the 「自选」 tag', () => {
    const p = { ...priv, hand: [{ uid: 1, kind: 'chess', id: T5A }, { uid: 2, kind: 'chess', id: 'chess_char_4_22_a' }], temp: [], board: [{ uid: 4, kind: 'chess', id: 'chess_char_6_diy1_b', row: 10, col: 4 }] };
    assert.deepEqual(diyPieces(p, getChess, D).map((x) => [x.uid, x.area, x.label, x.name]), [[1, 'hand', '自选', DATA.backups.units[SIEGE].name], [4, 'board', '自选', DATA.backups.units[SHARP].name]]);
    assert.deepEqual(diyPieces({ ...p, diy: {} }, getChess, D), []);
  });

  test('bonds: the popup lists the own 自选 member (煌-style several bonds count each) and a teammate\'s by its unit\'s pick', () => {
    const get = G.diyGetter(getChess, priv, D);
    const own = { ...priv, board: [{ uid: 4, kind: 'chess', id: T5A, row: 10, col: 4 }], hand: [{ uid: 5, kind: 'chess', id: T6A }] };
    const vic = G.bondMembers(DATA.bonds.victoriaShip, own, [], get);
    const row = vic.find((x) => x.diy);
    assert.deepEqual([row.id, row.name, row.onBoard, row.owned, row.rec.charId], [T5A, DATA.backups.units[SIEGE].name, true, true, SIEGE]);
    const empty = G.bondMembers(DATA.bonds.emptyShip, own, [], get);
    assert.deepEqual(empty.filter((x) => x.diy).map((x) => [x.id, x.inHand]), [[T6A, true]], 'the prototype in the hand counts for 协防');
    assert.equal(G.memberHeadCount(vic.filter((x) => x.diy)), 1);
    // a watched teammate: its board from the field units, their picks carried along (watchBonds ownerBoard)
    const field = { units: [{ kind: 'op', ownerId: 'p_2', defId: T5B, diy: { charId: 'char_017_huang', skillIndex: 0, uniEquipId: null } }] };
    const mate = ownerBoard(field, 'p_2');
    assert.deepEqual(mate.board[0].diy, { charId: 'char_017_huang', skillIndex: 0, uniEquipId: null });
    const pieceRecord = (p) => (p.diy ? G.diyRecordFor(getChess(p.id), p.diy, D) : null) || getChess(p.id);
    for (const b of ['yanShip', 'victoriaShip']) {
      const rows = G.bondMembers(DATA.bonds[b], mate, [], getChess, () => null, pieceRecord);
      assert.ok(rows.some((x) => x.diy && x.rec.charId === 'char_017_huang'), `煌 is a ${b} member`);
    }
    // the popup itself renders the 自选 row with its tag
    const pop = expand(BondPopup({ bondId: 'victoriaShip', entry: { count: 1, active: false, tier: 0, layers: 0 }, priv: own, onClose() {} }));
    const mrow = [...walk(pop)].find((v) => hasClass(v, 'bpop__member') && textOf(v).includes(DATA.backups.units[SIEGE].name));
    assert.ok(mrow, 'the 自选 member row');
    assert.ok([...walk(mrow)].some((v) => hasClass(v, 'bpop__diy')), 'tagged 自选');
  });

  test('the renderer draws the operator (pieceInfo reads m.private.diy; UnitInfo diy is kept)', () => {
    const src = readFileSync(path.join(ROOT, 'public/js/render/app.js'), 'utf8');
    assert.match(src, /const pick = chess && chess\.isDiy \? piece\.diy \|\| diyPicks\[chess\.baseId \|\| chess\.chessId\] : null;/);
    assert.match(src, /diyPicks = src\.diy && typeof src\.diy === 'object' \? src\.diy : \{\};/);
    assert.match(readFileSync(path.join(ROOT, 'public/js/render/app/info.js'), 'utf8'), /diy: u\.diy && typeof u\.diy === 'object'/);
  });
});
