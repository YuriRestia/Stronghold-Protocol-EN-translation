// shared/modZ.js — (Fish Edition) Mod Z and Mod W: custom modules for 自选 operators that the official game never
// buffed (fish-edition/operator-mod-z/*.md, Fish's designs). A cheat of the Custom Lobby Modifications (shared/rules.js
// `modZ`): the modules are always in a pick's module list (the loadout is set outside a room), and a room without the
// rule fields a pick naming one with the operator's first module instead, or none when it has no other (shared/diy.js
// modZFallbackPicks, server/match/player/diy.js setDiy).
//
// A module here is a record of the same shape as data/backups.json `forms[k].modules[]` (tools/build-data.mjs): `attr`
// adds to the stats, `traitOverride` is the form's own trait (its `bb` unchanged, so every kit reads the trait it always
// did) with the module's text appended (the 特性追加 line the loadout shows), no talent changes. Every effect beyond the
// stats is the sim's (server/sim/content/modZ.js), keyed by the module id. Bonds a module grants (`bonds`) are added to
// the elite record by shared/diy.js diyRecordOf. The same module at both stages (tier 5: stage 1, tier 6: stage 3)
// [DRAFT: Fish's texts name one set of numbers].
//
// DRAFT (2026-11-13): every Mod Z / W of fish-edition/operator-mod-z, for the code-compatibility check Fish asked for
// ("draft the mod z/w all together first even if we can't test them thoroughly right now"). Placeholder art: no icon
// file exists, so the loadout's badge shows the type letter (ui/loadoutSections.js ModuleGlyph).

import { t, N_, getLang } from './i18n.js';

/** Module ids start with this (the protocol's id pattern; never an official uniequip_NNN id). */
export const MODZ_PREFIX = 'uniequip_fish';

/**
 * The modules, by operator. `kind` Z / W; `type` the module type shown (the operator's branch code + -Z / -W);
 * `attr` the stat bonus (backups `attr` keys: maxHp, atk, def, res, aspd …); `bonds` the alliances it grants (replacing
 * 协防干员 `emptyShip`); `name` / `desc` msgids (Chinese; public/i18n/*.json translate them).
 */
export const MODZ = Object.freeze([
  { charId: 'char_2012_typhon', code: 'typhon', kind: 'Z', type: 'SIE-Z', attr: { maxHp: 300 },
    name: N_('提丰的Z型调整'), desc: N_('自动平衡攻击力与攻击速度（攻击力+1%视为攻击速度+1；攻击速度最多+500，超出部分保留为攻击力）；部署10秒后攻击速度+100') },
  { charId: 'char_2012_typhon', code: 'typhon', kind: 'W', type: 'SIE-W', attr: { maxHp: 300, atk: 150, aspd: 10 },
    name: N_('提丰的W型调整'), desc: N_('攻击使目标寒冷；若目标已冻结，改为使其周围1格内的所有敌人碎冰：解除冻结，晕眩4秒并使其受到的物理伤害+40%，持续4秒') },
  { charId: 'char_197_poca', code: 'poca', kind: 'Z', type: 'SIE-Z', attr: { atk: 700 },
    name: N_('早露的Z型调整'), desc: N_('标记受到自身伤害的敌人；技能结束时，技能期间每有1名被标记的敌人倒下，回复17点技力') },
  { charId: 'char_416_zumama', code: 'zumama', kind: 'Z', type: 'HES-Z', attr: { atk: 150, def: 150 },
    name: N_('森蚺的Z型调整'), desc: N_('攻击范围变为自身周围3×3；攻击范围内有敌人时技力自然回复+1/秒；二技能或三技能开启时，诱导攻击范围内的所有敌人至自身位置，直到技能结束；攻击力每+1，防御力也+1（最多+5000）') },
  { charId: 'char_300_phenxi', code: 'phenxi', kind: 'Z', type: 'ART-Z', attr: { atk: 100, res: 30 },
    name: N_('菲亚梅塔的Z型调整'), desc: N_('所有技能改为弹药类技能（一技能18发，二技能3发，三技能100发）；技能期间攻击速度+50，生命上限+100%') },
  { charId: 'char_188_helage', code: 'helage', kind: 'Z', type: 'SBL-Z', attr: { atk: 150 }, bonds: ['raidShip'],
    name: N_('赫拉格的Z型调整'), desc: N_('获得【突袭】盟约身份；每次攻击后生命上限+50并获得1%庇护（最多80层，撤退或倒下后保留）；每次部署（包括首次）获得1层【盈月】（最多10层，可累计）：受到治疗+20%，攻击速度+20，造成伤害时额外造成攻击力1%的侵蚀损伤') },
  { charId: 'char_250_phatom', code: 'phatom', kind: 'Z', type: 'EXE-Z', attr: { atk: 100 }, bonds: ['raidShip', 'indomShip'],
    name: N_('傀影的Z型调整'), desc: N_('获得【突袭】与【不屈】盟约身份；【突袭】总是视为其技能已就绪') },
  { charId: 'char_479_sleach', code: 'sleach', kind: 'Z', type: 'BEA-Z', attr: { maxHp: 200, res: 30 },
    name: N_('琴柳的Z型调整'), desc: N_('阻挡数始终为0且始终隐匿；自身获得的部署费用翻倍；在场时所有我方干员的再部署时间流逝速度+50%，技能期间改为+300%') },
  { charId: 'char_147_shining', code: 'shining', kind: 'Z', type: 'PHY-Z', attr: { atk: 100, def: 100 },
    name: N_('闪灵的Z型调整'), desc: N_('治疗友方单位时使其获得【不朽】：8秒内受到致命伤害时生命值不会低于1（不可叠加）；赋予【不朽】的冷却初始为0秒，每次【不朽】实际生效后+5秒') },
  { charId: 'char_112_siege', code: 'siege', kind: 'Z', type: 'SOL-Z', attr: { maxHp: 300, atk: 100 },
    name: N_('推进之王的Z型调整'), desc: N_('自身获得的部署费用翻倍；持续消耗超过90点的部署费用，每消耗1点使所有我方干员获得1点技力') },
  { charId: 'char_293_thorns', code: 'thorns', kind: 'Z', type: 'LOR-Z', attr: { maxHp: 250, atk: 100, aspd: 10 },
    name: N_('棘刺的Z型调整'), desc: N_('中毒伤害的触发频率变为3倍；攻击范围+1；技能期间攻击范围再+1，攻击目标数+1，并获得隐匿；攻击额外造成攻击力20%的法术伤害和5%的神经损伤') },
  { charId: 'char_400_weedy', code: 'weedy', kind: 'Z', type: 'PUS-Z', attr: { maxHp: 250, atk: 100 },
    name: N_('温蒂的Z型调整'), desc: N_('在场时所有敌人重量-2；目标未处于元素爆发状态时，自身造成的伤害全部转为侵蚀损伤；自身攻击力每提升10%（最多计99层），技力自然回复+0.02/秒，水炮再部署时间-1%') },
  { charId: 'char_4098_vvana', code: 'vvana', kind: 'Z', type: 'AFT-Z', attr: { maxHp: 500, atk: 100 },
    name: N_('薇薇安娜的Z型调整'), desc: N_('可施放【微光之触】（冷却12秒，初始冷却0秒）：以任一【卡西米尔】干员攻击范围内的一名敌人为目标（优先首领），7秒后在其所在位置周围菱形2格内爆炸，造成攻击力300%的灼燃损伤和300%的法术伤害；若敌人已处于灼燃损伤爆发状态，法术伤害改为攻击力600%×在场存活的【卡西米尔】干员数；任一敌人受到灼燃损伤爆发时法术抗性永久-2（最多10次，薇薇安娜倒下后仍保留）') },
  { charId: 'char_4121_zuole', code: 'zuole', kind: 'Z', type: 'SBL-Z', attr: { maxHp: 400, atk: 100 },
    name: N_('左乐的Z型调整'), desc: N_('从增益获得的攻击力翻倍；从自然回复以外的途径获得的技力翻倍；所有技能可多储存1次；造成伤害时额外造成攻击力5%的侵蚀损伤；若敌人防御力已为0，改为造成攻击力5%的灼燃损伤和10%的法术伤害') },
].map((m) => Object.freeze({ ...m, id: `${MODZ_PREFIX}${m.kind.toLowerCase()}_${m.code}`, attr: Object.freeze(m.attr), bonds: Object.freeze(m.bonds ?? []) })));

/** @type {Map<string, (typeof MODZ)[number]>} */
const BY_ID = new Map(MODZ.map((m) => [m.id, m]));
const BY_CHAR = new Map();
for (const m of MODZ) BY_CHAR.set(m.charId, [...(BY_CHAR.get(m.charId) ?? []), m]);

/** The Mod Z / W definition of module id `id`, or null. */
export const modZOf = (id) => (typeof id === 'string' ? BY_ID.get(id) ?? null : null);
/** Whether `id` names a Mod Z / W. */
export const isModZ = (id) => !!modZOf(id);
/** The Mod Z / W definitions of operator `charId` (possibly none). */
export const modZFor = (charId) => BY_CHAR.get(charId) ?? [];

const CACHE = new WeakMap();
/**
 * `form` (a backups form of `charId`) with its Mod Z / W appended to `modules` — only a form that carries modules (the
 * elite forms), at that form's stage. The same object for the same form and language (cached), the form itself when
 * the operator has none.
 * @param {string} charId @param {any} form
 */
export function withModZ(charId, form) {
  const defs = modZFor(charId);
  if (!defs.length || !form || !Array.isArray(form.modules) || !form.modules.length) return form;
  let byLang = CACHE.get(form);
  if (!byLang) CACHE.set(form, byLang = new Map());
  const lang = getLang();
  if (byLang.has(lang)) return byLang.get(lang);
  const level = form.modules.find((m) => m && Number.isInteger(m.level))?.level ?? 1;
  const base = form.trait ?? { desc: '', descRaw: '', bb: {}, bbStr: {}, rangeGrid: null };
  const records = defs.map((d) => {
    const desc = t(d.desc);
    return Object.freeze({
      uniEquipId: d.id, name: t(d.name), typeName: d.type, typeIcon: d.type.toLowerCase(), icon: d.id, level,
      attr: { ...d.attr },
      traitOverride: { ...base, desc: `${base.desc ?? ''}\n${desc}`, descRaw: `${base.descRaw ?? base.desc ?? ''}\n<@ba.kw>${desc}</>` },
      talentChanges: [],
      fishModZ: d.kind,
    });
  });
  const out = { ...form, modules: [...form.modules, ...records] };
  byLang.set(lang, out);
  return out;
}

