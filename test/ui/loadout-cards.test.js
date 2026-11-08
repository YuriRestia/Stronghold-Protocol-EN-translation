// test/ui/loadout-cards.test.js — the 干员调配 tab's 卡片视图 (laid out after the event's 物资调配处; the only view since the
// fork's 2026-11-08 change — the list view is gone): 「详情」's switch (DetailsToggleView) and its stored choice, one operator
// card (an OperatorImage portrait — the owner's outfit, B6 —, its own skill / module column, 潜能 as pips through
// cultivationView, the 已调整 mark, the 替补 ribbon), the 「详情」 panel beside it (the Detail's own blocks), 快速配置's
// removal, the tier marker (the official shopLevelSprite tag, the CSS marker without it), the bottom bar's tier jumps and
// lock chip and the 「详情」 switch at its right, and the css rules of the view (text follows 文字大小, no !important, the 转场 only in
// the card view, no invented slogan). Hook-free views drawn as vnode trees. (The browser side:
// test/ui/loadout-cards.e2e.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSIONS } from '../../shared/versions.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try { const body = readFileSync(path.join(ROOT, 'data', name), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(body) }; } catch { return { ok: false, status: 404, json: async () => ({}) }; }
};
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { DeckCard, TierMark, DeckBar, loadoutDetailsPref, deckAnchor, detailsStore } = await import('../../public/js/screens/loadout.js');
const { DetailsToggleView } = await import('../../public/js/screens/loadoutDeck.js');
const { chessOptions } = await import('../../public/js/ui/loadoutModel.js');
const { data } = await import('../../public/js/data.js');
const { OperatorImage, Img, PromotionIcon } = await import('../../public/js/ui/gameComponents.js');
const { OpCard } = await import('../../public/js/screens/settle.js');
await data.loadAll('chess', 'garrisons', 'assets', 'bonds', 'effects', 'backups');

const get = (id) => data.lookup('chess', id);
const INSIDE = 'chess_char_1_01_a';   // 隐现: S1 / S2 (default S2), MAR-X
const CHAR = (id) => get(id).charId;

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  if (typeof v.type === 'function' && ['QuickSkill', 'QuickModule', 'LevelPill', 'PotBadge', 'DeckOpCard', 'CardSide', 'DeckOpSide', 'DeckOpMore', 'GroupMark', 'GroupBar'].includes(v.type.name)) {
    yield* walk(v.type.prototype?.render ? renderClass(v) : v.type(v.props));
    return;
  }
  yield* walk(v.props?.children);
}
function renderClass(v) { const c = new v.type(v.props); c.props = v.props; return c.render(v.props); }
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const find = (tree, pred) => [...walk(tree)].filter(pred);
const byClass = (tree, c) => find(tree, (v) => hasClass(v, c));
const textOf = (v) => (v == null || typeof v === 'boolean' ? '' : typeof v !== 'object' ? String(v) : Array.isArray(v) ? v.map(textOf).join('') : textOf(v.props?.children));

// a card is the shared DeckOpCard (screens/loadoutDeck.js): drawn one level down, as Preact would
const draw = (v) => (typeof v?.type === 'function' ? v.type(v.props) : v);
const card = (props) => draw(DeckCard({ m: null, chess: get(INSIDE), golden: get(get(INSIDE).goldenId), entries: {}, ops: {}, onPick: () => {}, onChange: () => {}, onOps: () => {}, ...props }));

test('「详情」 is off unless this browser chose it', () => {
  mem.clear();
  assert.equal(loadoutDetailsPref(), false);
  localStorage.setItem('sp.pref.loadout.details', 'true');
  assert.equal(loadoutDetailsPref(), true);
  localStorage.setItem('sp.pref.loadout.details', '"yes"');
  assert.equal(loadoutDetailsPref(), false, 'only true turns it on');
  mem.clear();
});

test('「简洁 / 展开」: both choices in view, the current one checked, the other one switches', () => {
  const sets = [];
  const sw = DetailsToggleView({ on: false, onSet: (v) => sets.push(v) });
  assert.ok(hasClass(sw, 'lo-dswitch'));
  assert.equal(sw.props.role, 'radiogroup');
  const [compact, expanded] = find(sw, (v) => v.type === 'button');
  assert.deepEqual([compact.props['data-testid'], expanded.props['data-testid']], ['loadout-compact', 'loadout-details']);
  assert.deepEqual([compact.props['aria-checked'], expanded.props['aria-checked']], ['true', 'false']);
  assert.deepEqual([textOf(compact).includes('简洁'), textOf(expanded).includes('展开')], [true, true], 'the user\'s names (2026-11-08)');
  compact.props.onClick();
  expanded.props.onClick();
  assert.deepEqual(sets, [true], 'pressing the current choice does nothing');
  const on = find(DetailsToggleView({ on: true, onSet: (v) => sets.push(v) }), (v) => v.type === 'button');
  assert.deepEqual(on.map((b) => b.props['aria-checked']), ['false', 'true']);
  on[0].props.onClick();
  assert.deepEqual(sets, [true, false]);
  assert.ok(find(DetailsToggleView({ on: false, disabled: true, onSet() {} }), (v) => v.type === 'button').every((b) => b.props.disabled === true));
});

test('the bottom bar carries 「简洁 / 展开」 at its right (`tools`), the top bar none', () => {
  const counts = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
  const tool = { type: 'div', props: { class: 'lo-dswitch' } };
  const bar = DeckBar({ counts, active: 1, onJump() {}, diyOpen: {}, tools: tool });
  const box = byClass(bar, 'lo-bbar__tools');
  assert.equal(box.length, 1);
  assert.ok(find(box[0], (v) => v === tool).length, 'the switch inside it');
  assert.equal(byClass(DeckBar({ counts, active: 1, onJump() {}, diyOpen: {} }), 'lo-bbar__tools').length, 0);
});

test('a card: tier, both levels, its skill / module column, 潜能 (the game’s badge), name; a press anywhere else picks it', () => {
  const picks = [];
  const c = card({ onPick: (id) => picks.push(id) });
  assert.ok(hasClass(c, 'lo-op') && hasClass(c, 'lo-op--t1') && hasClass(c, 'has-side'));
  assert.equal(c.props['data-chess'], INSIDE);
  assert.equal(c.props.role, 'listitem');
  const lv = byClass(c, 'lo-op__lvrow');
  assert.equal(lv.length, 2, 'the normal and the elite level');
  assert.equal(textOf(lv[0]), String(get(INSIDE).status.level));
  assert.equal(textOf(lv[1]), String(get(get(INSIDE).goldenId).status.level));
  assert.equal(textOf(byClass(c, 'lo-op__name')[0]), get(INSIDE).name);
  const pot = byClass(c, 'lo-op__pot')[0];
  assert.ok(pot && byClass(byClass(c, 'lo-op__rail')[0], 'lo-op__pot').length === 1, 'an official operator shows 潜能 on the rail (the game badge)');
  assert.equal(pot.props['data-potential'], 6, 'default 潜能 6');
  assert.equal(byClass(c, 'lo-op__mark').length, 0, 'nothing changed: no mark');
  assert.equal(byClass(c, 'lo-op__ribbon').length, 0);
  const more = byClass(c, 'lo-op__more');
  assert.equal(more.length, 1, 'the 「详情」 panel is always drawn (the toggle adds nothing, so nothing flashes)');
  assert.equal(more[0].props.class, 'lo-op__more', 'no state of its own: the deck\'s classes fold and unfold it (css)');
  assert.equal(byClass(c, 'lo-op__kit').length, 0, 'the old equipped-kit strip over the portrait is gone (the column shows it)');
  byClass(c, 'lo-op__pick')[0].props.onClick();
  byClass(c, 'lo-op__card')[0].props.onClick({ target: { closest: () => null } });
  byClass(c, 'lo-op__card')[0].props.onClick({ target: { closest: () => ({}) } }); // a press on a control inside: not a pick
  assert.deepEqual(picks, [INSIDE, INSIDE]);
  // the guard names the column itself (its gaps and pips are no buttons)
  const guard = [];
  byClass(c, 'lo-op__card')[0].props.onClick({ target: { closest: (sel) => { guard.push(sel); return null; } } });
  assert.match(guard[0], /\.lo-op__side/);
  // the column: S1 / S2 (隐现 has two; the default S2 pressed) at its top, the modules at its bottom — every module as a
  // button (a tall screen) and the stepping button (a short one; css picks)
  const side = byClass(c, 'lo-op__side')[0];
  const parts = find(side, (v) => hasClass(v, 'lo-op__skills') || hasClass(v, 'lo-op__mods')).map((v) => v.props.class);
  assert.deepEqual(parts, ['lo-op__skills', 'lo-op__mods'], 'skills first, modules after them');
  const list = byClass(byClass(side, 'lo-op__mlist')[0], 'lo-q--mod');
  assert.deepEqual(list.map((b) => [b.props['data-module'], b.props['aria-pressed']]), [['none', 'false'], ['uniequip_002_inside', 'true']]);
  assert.ok(!hasClass(byClass(side, 'lo-op__mstep')[0], 'is-always'), 'with modules to list, css chooses');
  const skills = byClass(side, 'lo-q--skill');
  assert.deepEqual(skills.map((b) => [b.props['data-skill'], b.props['aria-pressed']]), [[0, 'false'], [1, 'true']]);
  assert.equal(byClass(side, 'lo-q--empty').length, 0, 'only the skills it has');
  const mod = byClass(side, 'lo-op__mod')[0];
  assert.equal(mod.props['data-module'], 'uniequip_002_inside');
  assert.ok(hasClass(mod, 'is-on'), 'a module equipped: marked');
  assert.equal(find(mod, (v) => v.type?.name === 'ModuleGlyph')[0].props.id, 'uniequip_002_inside');
  const mp = byClass(side, 'lo-op__mpips')[0];
  assert.deepEqual(find(mp, (v) => v.type === 'i').map((i) => i.props.class), ['', 'is-on'], '不装备 first, the module second and on');
});

test('a card\'s picture is an OperatorImage portrait (the owner\'s picture-only outfit, B6), its avatar the fallback', () => {
  const imgs = find(card(), (v) => v.type === OperatorImage);
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0].props.chess.chessId, INSIDE);
  assert.equal(imgs[0].props.portrait, true);
  assert.equal(imgs[0].props.avatarFallback, true);
  assert.equal(imgs[0].props.ownerId, undefined, 'the local picker: this browser\'s own outfit');
});

test('#811: every version, tier and normal / elite form uses its actual promotion phase and level', () => {
  const m = data.get('assets');
  // activity_table AUTOCHESS_SEASON charChessDataDict.status (PHASE_1 / PHASE_2), both seasons.
  const levels = { 1: [[1, 55], [2, 50]], 2: [[1, 60], [2, 55]] };
  for (const version of VERSIONS) {
    const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', version.dir, 'chess.json'), 'utf8'));
    const backups = JSON.parse(readFileSync(path.join(ROOT, 'data', version.dir, 'backups.json'), 'utf8'));
    for (const c of Object.values(chess)) {
      assert.deepEqual([c.status.phase, c.status.level], (levels[c.tier] || [[2, 1], [2, 60]])[Number(c.isGolden)], `${version.id} ${c.chessId}`);
      if (c.isGolden) continue;
      const forms = [c, chess[c.goldenId]].filter(Boolean);
      const rows = byClass(card({ m, chess: c, golden: forms[1] }), 'lo-op__lvrow');
      assert.equal(rows.length, forms.length);
      rows.forEach((row, i) => {
        const icons = find(row, (v) => v.type === PromotionIcon);
        assert.equal(icons.length, 1, `${version.id} ${forms[i].chessId}: a phase icon, never a fixed two-bar glyph`);
        const icon = PromotionIcon(icons[0].props);
        assert.equal(icon.props.src, m.ui[`elite/elite_${forms[i].status.phase}`]);
        assert.equal(textOf(icon.props.fallback), `E${forms[i].status.phase}`);
        assert.equal(textOf(row), String(forms[i].status.level));
      });
    }
    // Backups supply the actual forms for both stand-ins and DIY operators; their phase is not their rarity.
    for (const unit of Object.values(backups.units)) for (const form of Object.values(unit.forms)) {
      const rec = { ...unit, ...form, tier: 1, isGolden: true };
      const tree = OpCard({ u: { id: unit.charId }, gd: { m, backups, chess: () => rec }, i: 0 });
      const icon = find(tree, (v) => v.type === PromotionIcon)[0];
      assert.equal(PromotionIcon(icon.props).props.src, m.ui[`elite/elite_${form.status.phase}`]);
      assert.equal(textOf(byClass(tree, 'sop__lv')[0]), String(form.status.level));
    }
  }
});

test('promotion icons: E0, E1 and E2 use the official images or a phase-specific missing-art fallback', () => {
  for (const phase of [0, 1, 2]) {
    const icon = PromotionIcon({ m: null, phase, class: 'phase-test' });
    assert.equal(icon.props.src, null);
    assert.equal(textOf(icon.props.fallback), `E${phase}`);
  }
  for (const phase of [undefined, null, -1, 3]) assert.equal(PromotionIcon({ m: null, phase }), null);
});

test('a card follows the loadout: the chosen skill and module, a lower 潜能, the 已调整 mark, the 替补 ribbon', () => {
  const c = card({ entries: { [INSIDE]: { skill: 0, module: 'none' } }, ops: { [CHAR(INSIDE)]: { potential: 2, cultivate: 3 } }, selected: true, notOwned: true });
  assert.ok(hasClass(c, 'is-sel') && hasClass(c, 'is-changed') && hasClass(c, 'is-standin'));
  const side = byClass(c, 'lo-op__side')[0];
  assert.deepEqual(byClass(side, 'lo-q--skill').map((b) => b.props['aria-pressed']), ['true', 'false']);
  const mod = byClass(side, 'lo-op__mod')[0];
  assert.equal(mod.props['data-module'], 'none');
  assert.ok(!hasClass(mod, 'is-on'), '不装备: not marked as a module');
  assert.equal(find(mod, (v) => v.type?.name === 'ModuleGlyph')[0].props.id, 'none');
  assert.equal(byClass(c, 'lo-op__pot')[0].props['data-potential'], 2);
  assert.equal(byClass(c, 'lo-op__mark').length, 1);
  assert.equal(textOf(byClass(c, 'lo-op__ribbon')[0]), '替补');
  // 潜能 alone counts as a change (cultivationView), like the list's row
  assert.ok(hasClass(card({ ops: { [CHAR(INSIDE)]: { potential: 5, cultivate: 3 } } }), 'is-changed'));
});

test('the column: a skill tap and the module button change only that choice (the list\'s handler), never a pick', () => {
  const changes = [], picks = [];
  const on = { onChange: (id, p) => changes.push([id, p]), onPick: (id) => picks.push(id) };
  const side = byClass(card(on), 'lo-op__side')[0];
  let stopped = 0;
  side.props.onClick({ stopPropagation: () => { stopped += 1; } });
  assert.equal(stopped, 1, 'a press on the column never reaches the card');
  byClass(side, 'lo-q--skill')[0].props.onClick();
  const mod = byClass(side, 'lo-op__mod')[0];
  assert.match(mod.props['aria-label'], /模组：.+ · 点按切换为 不装备模组/);
  mod.props.onClick(); // the module → 不装备 (the next, wrapping)
  const back = byClass(byClass(card({ ...on, entries: { [INSIDE]: { module: 'none' } } }), 'lo-op__side')[0], 'lo-op__mod')[0];
  back.props.onClick(); // 不装备 → the module
  byClass(byClass(side, 'lo-op__mlist')[0], 'lo-q--mod')[0].props.onClick(); // the list's 不装备: picked directly
  assert.deepEqual(changes, [[INSIDE, { skill: 0 }], [INSIDE, { module: 'none' }], [INSIDE, { module: 'uniequip_002_inside' }], [INSIDE, { module: 'none' }]]);
  assert.deepEqual(picks, []);
  // a chess without an elite form: no module to choose, the button says so and is off
  const noElite = draw(DeckCard({ m: null, chess: get(INSIDE), golden: null, entries: {}, ops: {}, onPick() {}, onChange: (id, p) => changes.push([id, p]) }));
  const nm = byClass(noElite, 'lo-op__mod')[0];
  assert.equal(nm.props.disabled, true);
  assert.equal(nm.props['aria-label'], '无精锐');
  assert.equal(byClass(noElite, 'lo-op__mpips').length, 0);
  assert.equal(byClass(noElite, 'lo-op__mlist').length, 0, 'no list without an elite form');
  assert.ok(hasClass(byClass(noElite, 'lo-op__mstep')[0], 'is-always'), 'its dash shows on every screen');
  assert.equal(changes.length, 4);
});

test('the column on every version: S1–S3 only where the operator has them, the module button steps through every module in order', () => {
  for (const version of VERSIONS) {
    const chess = JSON.parse(readFileSync(path.join(ROOT, 'data', version.dir, 'chess.json'), 'utf8'));
    let checked = 0;
    for (const c of Object.values(chess)) {
      if (c.isGolden) continue;
      const golden = c.goldenId ? chess[c.goldenId] : null;
      const changes = [];
      const opt = chessOptions(c, golden);
      const side = byClass(draw(DeckCard({ m: null, chess: c, golden, entries: {}, ops: {}, onPick() {}, onChange: (id, p) => changes.push(p) })), 'lo-op__side')[0];
      assert.deepEqual(byClass(side, 'lo-q--skill').map((b) => b.props['data-skill']), opt.skillOptions.map((s) => s.index), `${version.id} ${c.chessId}`);
      assert.equal(byClass(side, 'lo-q--skill').filter((b) => b.props['aria-pressed'] === 'true').length, opt.skillOptions.length ? 1 : 0);
      if (!golden) continue;
      // the list: every module, 不装备 first, the chosen one pressed
      const order = [...opt.moduleOptions].sort((a, b) => Number(b.id === 'none') - Number(a.id === 'none')).map((x) => x.id);
      const listed = byClass(byClass(side, 'lo-op__mlist')[0], 'lo-q--mod');
      assert.deepEqual(listed.map((b) => b.props['data-module']), order, `${version.id} ${c.chessId}: the list`);
      assert.equal(listed.filter((b) => b.props['aria-pressed'] === 'true').length, 1);
      // walk the module button from the default through every option and back
      let cur = byClass(side, 'lo-op__mod')[0].props['data-module'];
      const seen = [cur];
      for (let i = 0; i < order.length; i += 1) {
        const btn = byClass(byClass(draw(DeckCard({ m: null, chess: c, golden, entries: { [c.chessId]: { module: cur } }, ops: {}, onPick() {}, onChange: (id, p) => changes.push(p) })), 'lo-op__side')[0], 'lo-op__mod')[0];
        if (order.length < 2) { assert.equal(btn.props.disabled, true, `${c.chessId}: one option, nothing to step to`); break; }
        btn.props.onClick();
        cur = changes.at(-1).module;
        seen.push(cur);
      }
      if (order.length > 1) {
        assert.equal(seen.at(-1), seen[0], `${version.id} ${c.chessId}: back to the start after every option`);
        assert.deepEqual([...new Set(seen)].sort(), [...order].sort(), `${version.id} ${c.chessId}: every module reached`);
      }
      checked += 1;
    }
    assert.ok(checked > 50, `${version.id}: ${checked} operators`);
  }
});

test('「详情」: the skills with their descriptions and every module beside the card, the column kept, the same handler', () => {
  const changes = [];
  const c = card({ onChange: (id, p) => changes.push([id, p]) });
  assert.equal(byClass(c, 'lo-op__side').length, 1, 'the column stays (a phone picks without scrolling the panel)');
  const more = byClass(c, 'lo-op__more')[0];
  assert.equal(detailsStore.get().on, false, 'off unless this browser chose it');
  let stopped = 0;
  more.props.onClick({ stopPropagation: () => { stopped += 1; } });
  assert.equal(stopped, 1);
  const skills = find(more, (v) => v.type?.name === 'SkillOption');
  assert.deepEqual(skills.map((s) => [s.props.opt.index, s.props.on, s.props.level]), [[0, false, 'elite'], [1, true, 'elite']], 'the elite\'s Lv.7 skills');
  skills[0].props.onPick(0);
  const mods = find(more, (v) => v.type?.name === 'ModuleSection')[0];
  assert.deepEqual(mods.props.moduleOptions.map((x) => x.id), ['none', 'uniequip_002_inside']);
  assert.equal(mods.props.module, 'uniequip_002_inside');
  assert.equal(mods.props.potential, 6);
  mods.props.onPick('none');
  assert.deepEqual(changes, [[INSIDE, { skill: 0 }], [INSIDE, { module: 'none' }]]);
  const noElite = draw(DeckCard({ m: null, chess: get(INSIDE), golden: null, entries: {}, ops: {}, onPick() {}, onChange() {} }));
  assert.equal(find(byClass(noElite, 'lo-op__more')[0], (v) => v.type?.name === 'ModuleSection').length, 0);
  assert.equal(textOf(byClass(byClass(noElite, 'lo-op__more')[0], 'lo-op__none')[0]), '无精锐');
});

test('the card that holds still while 「详情」 unfolds: the selected one in view, else the card in view nearest the view\'s centre', () => {
  // a fake deck from 0 to 800 px wide, 0 to 400 px high (its centre 400, 200): cards 100 × 180 px in two rows
  const card = (id, left, top) => ({ dataset: { chess: id }, getBoundingClientRect: () => ({ left, right: left + 100, top, bottom: top + 180, width: 100 }) });
  const make = (cards) => ({
    getBoundingClientRect: () => ({ left: 0, right: 800, top: 0, bottom: 400 }),
    querySelector: (sel) => cards.find((c) => sel.includes(`"${c.dataset.chess}"`)) || null,
    querySelectorAll: () => cards,
  });
  const cards = [card('a', -150, 0), card('c', 40, 200), card('d', 40, 0), card('e', 300, 0), card('g', 500, 200), card('f', 900, 0)];
  const deck = make(cards);
  assert.equal(deckAnchor(deck, 'd', 0).dataset.chess, 'd', 'the selected card in view, wherever it is');
  assert.equal(deckAnchor(deck, 'a', 0).dataset.chess, 'e', 'selected off screen: the card nearest the centre');
  assert.equal(deckAnchor(deck, 'f', 0).dataset.chess, 'e');
  assert.equal(deckAnchor(deck, null, 0).dataset.chess, 'e');
  assert.equal(deckAnchor(deck, 'a', 200).dataset.chess, 'g', 'the drawer covers the left: the view, and its centre, start after it');
  assert.equal(deckAnchor(make([card('a', -50, 0), card('f', 900, 0)]), null, 0).dataset.chess, 'a', 'a card partly in view counts');
  assert.equal(deckAnchor(make([card('f', 900, 0)]), null, 0), null);
});

test('「详情」 panels redraw only when their own card changes; a press reads the current props (no write with an old loadout)', () => {
  const vnode = find(card(), (v) => v.type?.name === 'DeckOpMore')[0];
  const More = vnode.type;
  const inst = new More(vnode.props);
  inst.props = vnode.props;
  const same = { ...vnode.props, onSkill: () => {}, onModule: () => {}, skills: [...vnode.props.skills], modules: [...vnode.props.modules] };
  assert.equal(inst.shouldComponentUpdate(same), false, 'new handlers and equal values: skipped');
  for (const [k, v] of [['locale', 'ja|ja'], ['src', { ...vnode.props.src }], ['golden', null], ['m', {}], ['skill', 0], ['module', 'none'],
    ['potential', 2], ['level', 'normal'], ['locked', true]]) {
    assert.equal(inst.shouldComponentUpdate({ ...same, [k]: v }), true, k);
  }
  // a skipped redraw keeps the old tree; Preact still sets this.props — the old tree's handler calls the new onChange
  const tree = inst.render(inst.props);
  const calls = [];
  inst.props = { ...same, onSkill: (i) => calls.push(['new', i]) };
  find(tree, (v) => v.type?.name === 'SkillOption')[0].props.onPick(0);
  assert.deepEqual(calls, [['new', 0]]);
});

test('快速配置 is gone: no button, no 确认配置, no quick columns; 潜能 · 练度 only in the Detail', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/screens/loadout.js'), 'utf8');
  for (const gone of ['loadout-quick', 'lo-quickbtn', 'lo-qseg', 'lo-op__quick', 'lo-confirm', 'QUICK ASSEMBLE', "t('快速配置')", "t('确认配置')"]) assert.ok(!src.includes(gone), gone);
  const css = readFileSync(path.join(ROOT, 'public/css/screens/loadout.css'), 'utf8');
  for (const gone of ['.lo-quickbtn', '.lo-qseg', '.lo-op__quick', '.lo-confirm', '.lo-op__kit']) assert.ok(!css.includes(gone), gone);
  // (fork, 2026-11-08) the list view is gone: no switch, no stored view, no rows; one 「简洁 / 详情」 switch per top bar
  for (const gone of ['ViewSwitch', "'loadout.view'", 'RosterRow', 'RosterHead', 'narrowDetail', 'lo-list', "t('筛选干员 · 切换列表视图')"]) assert.ok(!src.includes(gone), gone);
  assert.equal(src.match(/<\$\{DetailsToggle\} disabled=/g)?.length, 1, 'the deck\'s bottom bar (the picker page\'s: screens/diy.js)');
  assert.ok(!/DeckHelp|loadout-help|DECK_HELP/.test(src), 'no card view guide (the user\'s call of 2026-11-08)');
});

test('the bottom bar: a tier with nothing is disabled, a jump names its tier, open 自选 slots badge 5 / 6, no 确认配置', () => {
  const jumps = [];
  const counts = { 1: 20, 2: 20, 3: 20, 4: 0, 5: 20, 6: 16 };
  const bar = DeckBar({ counts, active: 2, onJump: (t) => jumps.push(t), diyOpen: { 5: 2, 6: 0 } });
  const tiers = byClass(bar, 'lo-bbar__tier');
  assert.deepEqual(tiers.map((b) => b.props['data-tier']), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(tiers.map((b) => !!b.props.disabled), [false, false, false, true, false, false]);
  assert.ok(hasClass(tiers[1], 'is-on'));
  tiers[4].props.onClick();
  assert.deepEqual(jumps, [5]);
  const diy = byClass(bar, 'lo-bbar__diy');
  assert.equal(diy.length, 1, 'only tier 5 has open slots');
  assert.equal(textOf(diy[0]).trim(), '2');
  assert.equal(byClass(bar, 'lo-confirm').length, 0);
});

test('the tier marker: the official shopLevelSprite tag of that tier, the CSS marker (NO. and the numeral) without it', () => {
  const m = { ui: { 'shopLevelSprite/shop_level_tag_5': '/assets/ui/shopLevelSprite/shop_level_tag_5.png' } };
  const art = draw(TierMark({ m, tier: 5, count: 18 }));
  assert.ok(hasClass(art, 'lo-tmark') && hasClass(art, 'tier--5'));
  assert.equal(art.props['aria-hidden'], 'true');
  const img = find(art, (v) => v.type === Img)[0];
  assert.equal(img.props.src, '/assets/ui/shopLevelSprite/shop_level_tag_5.png');
  assert.equal(img.props.class, 'lo-tmark__art');
  assert.equal(textOf(byClass(art, 'lo-tmark__cnt')[0]), '18');
  // the fallback: drawn when the manifest has no such sprite or the picture fails (Img)
  const css = img.props.fallback;
  assert.ok(hasClass(css, 'lo-tmark__css'));
  assert.equal(textOf(byClass(css, 'lo-tmark__no')[0]), 'NO.');
  assert.equal(textOf(byClass(css, 'lo-tmark__n')[0]), 'V');
  assert.equal(find(TierMark({ m: null, tier: 2, count: 1 }), (v) => v.type === Img)[0].props.src, null, 'no manifest: the CSS marker');
});

test('the bottom bar says a locked loadout (its full text the title)', () => {
  const counts = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 };
  const base = { counts, active: 1, onJump() {}, diyOpen: {} };
  assert.equal(byClass(DeckBar(base), 'lo-bbar__lock').length, 0, 'not locked: no chip');
  const chip = byClass(DeckBar({ ...base, locked: '本局的调配已锁定' }), 'lo-bbar__lock');
  assert.equal(chip.length, 1);
  assert.equal(chip[0].props.title, '本局的调配已锁定');
  assert.equal(chip[0].props.role, 'status');
  assert.equal(textOf(chip[0]), '本局已锁定 · 下一局生效');
});

test('the card view says a locked loadout once — the bottom bar\'s chip —, not in the top note, the sync chip or the drawer (§35.18)', () => {
  const src = readFileSync(path.join(ROOT, 'public/js/screens/loadout.js'), 'utf8');
  assert.match(src, /const deckNote = locked \? null : fromText;/, 'no lock text in the top note');
  assert.match(src, /\$\{deckNote \? html`<p class="lo-top__note" title=\$\{deckNote\}>\$\{deckNote\}<\/p>` : null\}/);
  assert.doesNotMatch(src, /onReset=\$\{resetOne\} locked=/, 'the drawer\'s detail adds no notice');
  assert.ok(!src.includes("t('本局的调配已锁定，修改将在下一局生效')"), 'nor does the Detail draw one');
  assert.match(src, /\$\{syncText && st\.sync !== 'locked' \? html`<span class=\$\{cx\('lo-sync', syncCls\)\} role="status">/, 'nor the card view\'s sync chip');
  assert.match(src, /locked=\$\{locked \? lockedText : null\} tools=/, 'the bottom bar keeps it, its full text the title');
  assert.doesNotMatch(readFileSync(path.join(ROOT, 'public/css/screens/loadout.css'), 'utf8'), /lo-top__note\.is-locked/);
});

test('the 转场 belong to the card view: the list keeps lo-in and its narrow-screen toggle replays nothing', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/screens/loadout.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const lo = rules.find((r) => r.sel === '.lo');
  assert.match(lo.body, /animation:\s*lo-in 200ms/, 'the overlay opens as before');
  assert.ok(!rules.some((r) => r.sel !== '.lo' && /(^|,)\s*\.lo\s*(,|$)/.test(r.sel) && /animation:(?!\s*none)/.test(r.body)), 'nothing else animates .lo');
  for (const r of rules.filter((x) => /animation:\s*lo-tr-/.test(x.body))) {
    for (const sel of r.sel.split(',')) assert.match(sel.trim(), /^\.lo--deck /, `${sel.trim()}: a 转场 rule scoped to the card view`);
  }
  assert.ok(!rules.some((r) => /\.lo-(roster|detail-wrap)\b/.test(r.sel) && /animation:(?!\s*none)/.test(r.body)), 'the list\'s roster / detail never animate');
  assert.ok(!/lo-drawer-in|lo-tr-veil/.test(css), 'no dead or background-colour animation');
  assert.ok(!/RHODES ISLAND|OPERATOR DISPATCH/.test(css), 'no invented slogan (the official tag carries its own line)');
});

test('the view\'s css: every text size follows 文字大小 (var(--t)), no !important', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/screens/loadout.css'), 'utf8');
  const at = css.indexOf('卡片视图 (optional');
  assert.ok(at > 0, 'the card view section');
  const section = css.slice(at);
  const sizes = [...section.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => v !== 'inherit');
  assert.ok(sizes.length >= 20);
  assert.deepEqual(sizes.filter((v) => !v.includes('var(--t)')), [], 'font sizes through var(--t)');
  assert.ok(!/!important/.test(section));
});
