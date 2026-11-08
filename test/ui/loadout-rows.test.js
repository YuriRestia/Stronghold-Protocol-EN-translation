// test/ui/loadout-rows.test.js — the 干员调配 detail's per-operator 潜能 / 练度 (0.2.2, the owner's decision of 2026-10-08:
// 「调配干员里自己设置吧，默认满潜满加成」): the detail's section, the 局内数值 at the settings, the module card's talents at
// 潜能, and the css the detail and the 自选编队 picker share. (The list view these tests were named after — one row per
// operator, PR #301's quick choices — was removed by the fork's 2026-11-08 change; the cards' column is
// test/ui/loadout-cards.test.js.) Hook-free views drawn as vnode trees.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { unscaled } from '../helpers/uiSize.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
globalThis.fetch = async (url) => {
  const name = String(url).split('/').pop();
  try { const body = readFileSync(path.join(ROOT, 'data', name), 'utf8'); return { ok: true, status: 200, json: async () => JSON.parse(body) }; } catch { return { ok: false, status: 404, json: async () => ({}) }; }
};
const { statsPreview, LoadoutStats, ModuleInfo } = await import('../../public/js/screens/loadout.js');
const { CultivationSection, cultivateName } = await import('../../public/js/screens/cultivation.js');
const { data } = await import('../../public/js/data.js');
await data.loadAll('chess', 'garrisons', 'assets', 'bonds', 'effects', 'backups');

const get = (id) => data.lookup('chess', id);
const VENDLA = 'chess_char_1_06_a';   // 刺玫
const CHAR = (id) => get(id).charId;

function* walk(v) {
  if (Array.isArray(v)) { for (const x of v) yield* walk(x); return; }
  if (!v || typeof v !== 'object') return;
  yield v;
  if (typeof v.type === 'function' && ['KindTag'].includes(v.type.name)) { yield* walk(v.type(v.props)); return; }
  yield* walk(v.props?.children);
}
const hasClass = (v, c) => typeof v?.props?.class === 'string' && v.props.class.split(/\s+/).includes(c);
const find = (tree, pred) => [...walk(tree)].filter(pred);
const textOf = (v) => (v == null || typeof v === 'boolean' ? '' : typeof v !== 'object' ? String(v) : Array.isArray(v) ? v.map(textOf).join('') : textOf(v.props?.children));


test('the detail\'s section: 潜能 1–6 and the four official 练度 tiers, the tier\'s effect, the stand-in note', () => {
  const sets = [];
  const id = CHAR(VENDLA);
  const sec = CultivationSection({ charId: id, ops: { [id]: { potential: 3 } }, onSet: (c, p) => sets.push([c, p]) });
  const pots = find(sec, (v) => v.props && v.props['data-potential'] != null);
  assert.deepEqual(pots.map((b) => [b.props['data-potential'], b.props['aria-checked']]), [[1, 'false'], [2, 'false'], [3, 'true'], [4, 'false'], [5, 'false'], [6, 'false']]);
  const tiers = find(sec, (v) => v.type === 'button' && v.props['data-cultivate'] != null);
  assert.deepEqual(tiers.map((b) => textOf(b)), ['未精英化', '精英阶段1', '精英阶段2', '精英阶段2-60级'], 'effects.json names');
  assert.equal(tiers[3].props['aria-checked'], 'true', 'the default tier');
  assert.match(textOf(find(sec, (v) => hasClass(v, 'lo-cult__eff'))[0]), /精英阶段2-60级 攻击力、防御力和最大生命值\+10%/);
  pots[0].props.onClick();
  tiers[1].props.onClick();
  assert.deepEqual(sets, [[id, { potential: 1 }], [id, { cultivate: 1 }]]);
  assert.equal(cultivateName(0), '未精英化');
  // the rule line says what an operator with nothing set fights at — the default, 满潜能 / 精英2 Lv.60 — and that an unowned
  // 特许 operator at the official 潜能1 / 未精英化 is the player's own setting (Grok review of the branch: it read as automatic)
  const note = textOf(find(sec, (v) => hasClass(v, 'lo-cult__note'))[0]);
  assert.match(note, /^默认满潜能、精英2 Lv\.60（满加成）。/);
  assert.match(note, /未持有的特许干员在官方按潜能1、没有加成，要照官方打请手动设为潜能1、未精英化。$/);
  const st = CultivationSection({ charId: id, ops: {}, onSet: () => {}, standIn: true });
  assert.ok(hasClass(st, 'is-moot'));
  assert.match(textOf(find(st, (v) => hasClass(v, 'lo-cult__note'))[0]), /替补干员没有潜能与练度/);
});

test('局内数值 at the operator\'s settings: 刺玫 at 潜能1 / 未精英化 and at the defaults (×1.1)', () => {
  const v = get(VENDLA);
  const g = get(v.goldenId);
  const pv = (ops, level = 'normal') => statsPreview(v, g, {}, level, get, ops).record.stats;
  assert.deepEqual([pv({ [v.charId]: { potential: 1, cultivate: 0 } }).atk, pv({ [v.charId]: { potential: 1, cultivate: 0 } }).cost], [413, 17]);
  assert.equal(pv({}).atk, 435 * 1.1, 'none set: 满潜 + 精英2 Lv.60');
  assert.equal(pv({ [v.charId]: { potential: 1, cultivate: 0 } }, 'elite').atk, 508 + 23, 'the elite: statsBase at 潜能1 + INC-X');
  assert.ok(statsPreview(v, g, {}, 'normal', get, {}).lo.cultivation);
  // the caption says the numbers carry 潜能 and 练度 (an owned operator; effects.json loaded)
  const cap = (tree) => textOf(find(tree, (n) => hasClass(n, 'lo-stats__cap'))[0]);
  assert.match(cap(LoadoutStats({ base: v, golden: g, entries: {}, level: 'elite', onLevel() {}, getChess: get, ops: {} })), /^数值含所选模组；含潜能与练度；不含技能发动/);
});

test('the module card reads its talent changes at the operator\'s 潜能, as 局内数值 and the battle do (余 闲云隐市: 2%（+0.5%） / 1.5%)', () => {
  // (Grok review of the branch: the card printed the full-potential line whatever the setting)
  const g = get('chess_char_6_03_b');
  const mod = g.modules.find((x) => x.uniEquipId === 'uniequip_002_yu');
  const opt = { id: mod.uniEquipId, rec: mod, isDefault: !!mod.isDefault };
  const texts = (tree) => find(tree, (v) => typeof v.type === 'function' && v.type.name === 'RichText').map((v) => String(v.props.text));
  const full = texts(ModuleInfo({ m: null, golden: g, opt }));
  assert.ok(full.some((x) => x.includes('生命上限2%<@ba.talpu>（+0.5%）</>')), 'full potential (none given)');
  assert.deepEqual(texts(ModuleInfo({ m: null, golden: g, opt, potential: 6 })), full);
  const p1 = texts(ModuleInfo({ m: null, golden: g, opt, potential: 1 }));
  assert.ok(p1.some((x) => x.includes('生命上限1.5%的生命')), '潜能1');
  assert.ok(!p1.some((x) => x.includes('（+0.5%）')));
  assert.deepEqual(texts(ModuleInfo({ m: null, golden: g, opt: { id: 'none', rec: null }, potential: 1 })), [g.traitBase.descRaw], '不装备: the base 特性');
  // 圣约送葬人 REA-Y (GitHub #400): 特性 heals 50 per enemy hit as in battle; 特性追加 is the module's ASPD line
  const ex = get('chess_char_5_01_b');
  const rea = ex.modules.find((x) => x.uniEquipId === 'uniequip_003_excu2');
  const lines = texts(ModuleInfo({ m: null, golden: ex, opt: { id: rea.uniEquipId, rec: rea }, potential: 6 }));
  assert.ok(lines.some((x) => x.includes('每攻击到一个敌人回复自身<@ba.kw>50</>生命')), lines.join(' | '));
  assert.ok(lines.some((x) => x === '攻击范围内存在2名及以上敌人时攻击速度<@ba.kw>+12</>'));
  // the detail hands the operator's 潜能 to it — the stored one (cultivationView: opsOf(ops, charId).potential) when the
  // operator has a 潜能 curve; a data plugin's operator without one gets none, the full-potential text (DESIGN §32.5).
  // The sections themselves moved to screens/loadoutSections.js, so the wiring is asserted in two steps: the screen
  // passes it to the section, the section forwards it to the card.
  const src = readFileSync(path.join(ROOT, 'public/js/screens/loadout.js'), 'utf8');
  const sections = readFileSync(path.join(ROOT, 'public/js/screens/loadoutSections.js'), 'utf8');
  assert.match(src, /<\$\{ModuleSection\}[\s\S]*?potential=\$\{cv\.potentialOn \? cv\.potential : null\} \/>/, 'the detail passes the operator\'s 潜能');
  assert.match(sections, /<\$\{ModuleInfo\} m=\$\{m\} golden=\$\{golden\} opt=\$\{modOpt\} potential=\$\{potential\} brief=\$\{brief\} \/>/, 'the module card reads it at that 潜能');
  // (fork) the card view's 「展开」 panel draws it brief: the stat bonus and the 特性 lines, no title, no talents
  const brief = ModuleInfo({ m: null, golden: ex, opt: { id: rea.uniEquipId, rec: rea }, potential: 6, brief: true });
  assert.equal(find(brief, (v) => hasClass(v, 'lo-minfo__title')).length, 0, 'brief: no title');
  assert.ok(hasClass(brief, 'lo-minfo--brief'));
  assert.ok(texts(brief).some((x) => x === '攻击范围内存在2名及以上敌人时攻击速度<@ba.kw>+12</>'), 'brief: the 特性追加 line stays');
  assert.ok(find(brief, (v) => hasClass(v, 'lo-attrs')).length === 1, 'brief: the stat bonus stays');
  const cult = readFileSync(path.join(ROOT, 'public/js/screens/cultivation.js'), 'utf8');
  assert.match(cult, /const cur = opsOf\(ops, charId\);\n  const potentialOn = potentialEditable\(charId, tables\);\n  return \{\n    potential: cur\.potential,/);
});

test('css: the selected skill\'s frame is square around its icon (GitHub #398 / PR #399): no img max-width clamp, fill beats `.lo-sicon img`', () => {
  // theme.css `img { max-width: 100% }` held the frame's width to the icon's while its height grew by .1rem (36 × 40 px
  // on a phone, 70 × 80 at 1920 px), and the more specific `.lo-sicon img { object-fit: cover }` cropped its side lines
  const css = unscaled(readFileSync(path.join(ROOT, 'public/css/screens/loadout.css'), 'utf8'));
  const rule = css.match(/^([^{}\n]*\.lo-sicon__outline) \{([^}]*)\}/m);
  assert.ok(rule, 'the frame rule');
  assert.equal(rule[1], '.lo-sicon .lo-sicon__outline', 'more specific than `.lo-sicon img`');
  assert.match(rule[2], /inset: -\.05rem; width: calc\(100% \+ \.1rem\) !important; height: calc\(100% \+ \.1rem\) !important;/);
  assert.match(rule[2], /max-width: none;/);
  assert.match(rule[2], /object-fit: fill;/);
  assert.match(css, /\.lo-sicon img \{ width: 100%; height: 100%; object-fit: cover;/, 'the icon itself still covers');
  assert.match(readFileSync(path.join(ROOT, 'public/css/theme.css'), 'utf8'), /\bimg \{ max-width: 100%; \}/, 'the global clamp the frame opts out of');
});

test('css: the list view is gone — no rows, no list grid, no slide-over list layout', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/screens/loadout.css'), 'utf8');
  for (const gone of ['.lo-list', '.lo-card', '.lo-body', '.lo-roster', '.lo-detail-wrap', '.lo-cult {', '.diy-slot', '.lo-tabs']) assert.ok(!css.includes(gone), gone);
  assert.ok(!/\.lo-grid\b/.test(css), 'the old card grid is gone');
});

// The 自选编队 picker draws the same detail panel (screens/diy.js hands `.lo-detail` the roster's own head), and the
// detail column plus the panel's horizontal padding change at 1100 px. Written in both places they drifted apart: the
// picker kept a `1.2fr / 1fr` split and .3rem padding, so the shared `.lo-dhead` wrapped differently up there.
test('css: the picker body reads the roster\'s detail geometry instead of repeating it', () => {
  const css = readFileSync(path.join(ROOT, 'public/css/screens/loadout.css'), 'utf8');
  assert.match(css, /--lo-detail-w: 7rem;[\s\S]*--lo-gap-x: \.22rem;[\s\S]*--lo-pad-x: \.3rem;/, 'one source of truth on `.lo`');
  // (fork, 2026-11-08) the picker is the card view for 自选 operators: the deck takes the whole width (no detail column)
  // and the detail is the card view's drawer, at its width
  assert.match(css, /\.diy-pick__main \{ position: relative; flex: 1 1 auto; min-height: 0; display: flex; \}/);
  assert.doesNotMatch(css, /\.diy-pick__main \{[^}]*grid-template-columns/);
  assert.match(css, /\.diy-pick \{\n {2}--drawer-w: min\(6\.4rem, 92vw\);/);
  assert.match(css, /\.lo--deck \{\n {2}--drawer-w: min\(6\.4rem, 92vw\);/, 'the same drawer width as the card view');
  assert.match(css, /\.diy-pick \{[^}]*padding: \.12rem var\(--lo-pad-x\) \.14rem;/);
  assert.match(css, /\.diy-pick \{ padding: \.08rem var\(--lo-pad-x\) \.1rem; \}/);
  const narrow = css.slice(css.indexOf('@media (max-width: 1100px) {'));
  assert.match(narrow, /\.lo \{ --lo-detail-w: 6\.4rem; --lo-gap-x: \.16rem; --lo-pad-x: \.2rem; \}/, 'the ≤1100 geometry both screens read');
});
