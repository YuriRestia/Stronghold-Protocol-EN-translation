// server/sim/content/kits/ops/op-chen2.js — 假日威龙陈 (char_1013_chen2) 自选 operator kit: 6★ 散射手 (狙击), an owned-6★ pick
// of the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and both modules (RPR-X 沙滩战斗套装, RPR-Y 假期的
// 最后一天) at every form. Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_1013_chen2): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7,
// the picked module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05. Full potential (the owner's
// decision of 2026-10-07). Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json); PRTS 假日威龙陈
// (节约风气 修正 and 备注, 假日余韵 备注, S2 / S3 备注, the RPR-X stage-1 note); PRTS 作战机制 §地形TAG; PRTS 分支特性信息 散射手
// ("可对空", the trait's 1-3 front grid); gamedata_const ba.charged (蓄力); the client's battle data read from the local
// install — charpack char_1013_chen2 (the S2 / S3 modes: an attack plus a RangeAttack firing projectile_chr_chen2_s2 / _s3),
// battle/prefabs [uc]projectiles projectile_chr_chen2_s2 / _s3, buff_template_data chen2_s_debuff, chen2_s_2_enhance_judge,
// chen2_tr, chen2_t_002[spareShot], chen2_e_003_t[map_tag].
// - Trait (散射手) "攻击范围内的所有敌人，对自己前方一横排的敌人攻击力提升至150%": the reaperrange profile — every enemy of
//   her range, air units too, ×atk_scale (trait bb; chen2_tr AtkScaleUp) on the trait's front grid (her tile and the three
//   ahead). RPR-X overrides it with atk_scale 1.6; RPR-Y adds "部署费用减少" (cost −8, in the stats: her redeploy after a
//   knock-out costs 8 DP less). Ranged physical arrows; blocks 1; ground enemies target her (no flag).
// - T1 节约风气 "在场时自身弹药类技能攻击时20%概率不消耗对应弹药，其他【狙击】干员的弹药类技能改为10%概率不消耗（同类效果取最
//   高）" (full potential: 22 %): while she is on the field, an attack made by a running 弹药类技能 (PRTS 备注: a skill whose
//   text says "攻击装有X发弹药 / 子弹" — never the 猎手 bullets) spends no ammo with that chance: hers spareshot_chen.prob,
//   another 【狙击】 operator's 20 % (full potential: 22 %) — PRTS 修正 (原因 "描述与游戏实际表现不符合", and the RPR-X stage-1
//   note "实际应为…其他【狙击】干员…20%"): the game gives the other snipers what she has, spareshot_chen.prob, not the text's /
//   `prob`'s 10 % [the mechanism is ASSUMED; the 20 % is PRTS's]. RPR-X stage 3 (talent change; chen2_t_002[spareShot]:
//   【狙击】 profession ⇒ [sniper], else deploy class RANGED ⇒ [other]): herself e_spareshot_chen.prob 27 %, other 【狙击】
//   operators 20 %, other 远程 operators 12 %. 同类效果取最高: the highest chance of every 假日威龙陈 on the field. One roll
//   per attack ("一次性消耗多发弹药时仅进行一次判定"); a spared attack spends nothing of what it would ("强制改为实耗0发"), and every `ammoUsed` of it still
//   fires ("不影响以'消耗弹药'为效果触发条件的侦测": the bullet is put back in that event, before the skill checks for its last
//   bullet) — 拉特兰 / garrison counters see it.
// - T2 假日余韵 "攻击速度+8，当场地中存在水地形时改为攻击速度+12" ([common].attack_speed 8, [map].attack_speed +4). 水地形 is
//   a map TAG (PRTS 作战机制 §地形TAG): no level of this mode carries one (the act1 / act2 autochess level files' mapData.tags
//   are null), so +8. RPR-Y stage 3 "攻击力+15%，攻击速度+12，当场地中存在水地形时改为攻击力+28%，攻击速度+20，技能开启时，场地
//   视为水地形": +15 % / +12, and while her skill runs the field holds the water TAG (chen2_e_003_t[map_tag]: SetRuntimeMapTag
//   water at ON_SKILL_START, cleared at ON_SKILL_FINISH / ON_OWNER_FINISH — one flag of the level, no count: the first
//   holder whose skill ends clears it) — +28 % / +20 for every 假日威龙陈 of that field. The module row's [map] keys are the
//   text's totals (20 / 0.28), the base row's [map] 4 the step over [common] 8 (8 + 4 = 12): read so.
// - S1 高压冲击 (AUTO, attack SP, data DEFAULT — an attack skill): ATK +atk, 4 bullets (attack@trigger_time), every enemy of
//   her range takes the trait's front-row multiplier ("对攻击范围内的所有敌人应用特性加成", as 送葬人 S1).
// - S2 “堇青之夜” (MANUAL, data DEFAULT): ATK +atk, 8 bullets (attack@trigger_time); 蓄力 (maxChargeTime 2;
//   chen2_s_2_enhance_judge: ≥ 2 charges at the cast ⇒ the enhanced mode, then ClearCharacterSp; ba.charged): cast with both
//   charges stored ⇒ attack@another_trigger_time (20) bullets; every cast empties the SP. Every attack leaves slime (below).
// - S3 “假日风暴” (MANUAL, data ACTIVE_RANGE on its 2-6): range 2-6 while it runs, ATK +atk, every attack strikes twice
//   (MultiMeleeAttack _additionalTimes 1) and takes the trait multiplier on every enemy, leaves slime; 32 bullets, 2 per
//   attack — PRTS 备注 "即使剩余弹药数小于2发仍可'消耗2发弹药'进行攻击；技能仅在弹药数归零后自动结束" (one `ammoUsed` per bullet).
// - Slime (S2 / S3 "每次攻击在范围内生成持续5秒的粘液，地面敌人经过时移动速度-N%、防御力-M（不叠加）"): each attack's RangeAttack
//   fires a projectile that lands at once on her own ground mount point in her direction and lives
//   attack@projectile_life_time s; every 0.2 s its range selector (ground enemies, `_ignoreTargetFree`: PRTS 备注 "无视无法选
//   择类效果（如隐匿与无敌）") gives chen2_slime for 0.25 s — move speed FINAL_SCALER ×(1 + attack@move_speed), DEF
//   FINAL_ADDITION attack@def. Here: the tiles of her attack range at the attack hold slime for the life time (a later attack
//   refreshes them) [ASSUMED: the projectile's selector range is her attack range — the prefab names no grid; its effect is
//   "chen2_skill_02_range_01"], pulsed every 0.2 s; 不叠加 — one effect per 假日威龙陈 (independentCharacterSource: two of
//   them each slow); the DEF cut is compensated for the target's DEF multipliers (a final addition). It outlives her: the
//   projectiles are not hers to clear [ASSUMED]. Air units never (地面敌人). (Each struck ground enemy's own 0.1 s
//   chen2_s_debuff from the attack is inside that range anyway.)

import { num, talentBb, skillRec, up } from '../shared/tier1.js';
import { bodyKeys } from '../../../body.js';
import { aggregateMods } from '../../../buffs.js';

const S1 = 'skchr_chen2_1';
const S2 = 'skchr_chen2_2';
const S3 = 'skchr_chen2_3';
/** PRTS 节约风气 备注: a 弹药类技能 is one whose text says "攻击装有X发弹药" or "攻击装有X发子弹". */
const AMMO_SKILL = /攻击装有\d+发(?:弹药|子弹)/;
/** projectile_chr_chen2_s2 / _s3 `_interval` (the slime's selection period) and chen2_slime's lifeTime. */
const SLIME_IV = 0.2;
const SLIME_DUR = 0.25;
/** Buff key of a 假日威龙陈's slime effect on an enemy (independentCharacterSource: one per source). */
export const slimeKey = (src) => `chen2:slime#${src.id}`;

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const count = (v, d) => Math.max(1, Math.floor(num(v, d)));

// ---- T1 节约风气: one battle-wide pair of handlers over every 假日威龙陈 of the battle ------------------------------------
/** battle → { srcs: Map(unit → { self, sniper, other }) }. */
const SPARE = new WeakMap();

/** The spare chance of `u`'s ammo-skill attack: the highest of the 假日威龙陈 on the field (同类效果取最高). */
export function spareChance(battle, u) {
  const st = SPARE.get(battle);
  if (!st || !u) return 0;
  const op = u.kind === 'op';
  let p = 0;
  for (const [s, v] of st.srcs) {
    if (!up(s)) continue;
    const q = u === s ? v.self : op && u.def?.profession === 'SNIPER' ? v.sniper : op && u.def?.position === 'RANGED' ? v.other : 0;
    if (q > p) p = q;
  }
  return Math.min(1, p);
}

function installSpare(battle, unit, probs) {
  let st = SPARE.get(battle);
  if (!st) {
    st = { srcs: new Map() };
    SPARE.set(battle, st);
    // the roll: when an attack is made by a running 弹药类技能, before its bullets are spent (skills.js onAttackPerformed
    // runs after the `attack` hook); one roll per attack (no draw when nobody's chance applies)
    battle.on('attack', (ctx) => {
      const u = ctx.attacker, sk = u?.skill;
      if (!u || u.side !== 'ally' || !sk || !sk.active || sk.kind !== 'ammo' || !AMMO_SKILL.test(String(sk.def?.description ?? ''))) return;
      const p = spareChance(battle, u);
      u.mem.chen2Spare = { t: battle.time, n: u.stats.attacks, proc: p > 0 && battle.rng.chance(p) };
      if (u.mem.chen2Spare.proc) battle.fx('reload', { x: u.x, y: u.y, id: u.id });
    }, { priority: -50 });
    // the spared attack's every bullet goes back in its own ammoUsed event (the event itself still fires)
    battle.on('ammoUsed', (ctx) => {
      const u = ctx.unit, m = u?.mem?.chen2Spare, sk = ctx.skill;
      if (!m || !m.proc || m.t !== battle.time || m.n !== u.stats.attacks || !sk || !sk.active || sk.kind !== 'ammo') return;
      sk.ammoLeft += 1;
    }, { priority: 100 });
  }
  st.srcs.set(unit, probs);
}

// ---- 水地形 TAG (RPR-Y stage 3): the level's one runtime flag ----------------------------------------------------------
/** battle → { on } (SetRuntimeMapTag water: no count — the last set / clear wins). */
const WATER = new WeakMap();
/** Whether the field of `battle` counts as water terrain now (no level of the mode has the TAG of its own). */
export const waterOn = (battle) => !!WATER.get(battle)?.on;
function setWater(battle, on) {
  let s = WATER.get(battle);
  if (!s) WATER.set(battle, (s = { on: false }));
  s.on = on;
}

/**
 * 假日余韵's two lines: { common: { atkPct, aspd }, water: { atkPct, aspd } }. The base row's [map] value is the step over
 * [common] (8 + 4 = the text's 12); a module row's [map] values are the text's totals (RPR-Y: 改为 +28 % / +20).
 */
export function holidayLines(t) {
  const bb = t?.bb ?? {};
  const ca = num(bb['chen2_t_2[common].atk']), cs = num(bb['chen2_t_2[common].attack_speed']);
  const ma = num(bb['chen2_t_2[map].atk']), ms = num(bb['chen2_t_2[map].attack_speed']);
  const total = !!t?.fromModule;
  return { common: { atkPct: ca, aspd: cs }, water: total ? { atkPct: ma || ca, aspd: ms || cs } : { atkPct: ca + ma, aspd: cs + ms } };
}

// ---- slime (S2 / S3): one battle-wide pulse over every 假日威龙陈's slimed tiles ------------------------------------------
/** battle → Map(source unit → Map(tileKey → { until, ms, def })). */
const SLIME = new WeakMap();

/** A source's slimed tiles (tile key → { until, ms, def }), for tests. */
export const slimeOf = (battle, src) => SLIME.get(battle)?.get(src) ?? null;

/** The enemy's DEF multiplier from every buff but `key`'s ((1 + Σ defPct) × Π defMul): a FINAL_ADDITION is divided by it. */
function defFactor(e, key) {
  const { add, mul } = aggregateMods(e.buffs.filter((b) => b.key !== key));
  return Math.max(0, 1 + (add.defPct ?? 0)) * (mul.defMul ?? 1);
}

function slimeState(battle) {
  let m = SLIME.get(battle);
  if (m) return m;
  m = new Map();
  SLIME.set(battle, m);
  // no owner: the slime outlives the unit that left it [ASSUMED]
  battle.every(SLIME_IV, () => {
    const now = battle.time;
    for (const [src, tiles] of m) {
      for (const [k, p] of tiles) if (p.until <= now + 1e-9) tiles.delete(k);
      if (!tiles.size) continue;
      const key = slimeKey(src);
      for (const e of battle.enemies) {
        // 地面敌人 only; 无视无法选择 — no targetability check (stealth, invulnerable)
        if (!e.alive || e.hidden || !e.deployed || e.isFlying) continue;
        let p = null;
        for (const k of bodyKeys(e)) { p = tiles.get(k) ?? null; if (p) break; }
        if (!p) continue;
        const f = defFactor(e, key);
        battle.addBuff(e, {
          key, duration: SLIME_DUR, source: src, tags: ['skill', 'slime'],
          mods: { moveMul: Math.max(0, 1 + p.ms), defFlat: f > 1e-6 ? p.def / f : p.def },
        });
      }
    }
  });
  return m;
}

/** S2 / S3 onAttack: the tiles of her attack range hold her slime for life s (refreshed by every attack). */
function leaveSlime(battle, unit, b) {
  const life = num(b['attack@projectile_life_time'], 5), ms = num(b['attack@move_speed']), def = num(b['attack@def']);
  if (!(life > 0) || (!ms && !def) || !unit.rangeKeys) return;
  const m = slimeState(battle);
  let tiles = m.get(unit);
  if (!tiles) m.set(unit, (tiles = new Map()));
  const fresh = !tiles.size;
  const until = battle.time + life;
  for (const k of unit.rangeKeys) tiles.set(k, { until, ms, def });
  if (fresh) battle.fx('zone', { x: unit.x, y: unit.y, radius: 2, dur: life, id: unit.id, skill: 'chen2:slime' });
}

export default {
  char_1013_chen2: (bb, chess) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const s3 = skillRec(chess, S3);
    const t0 = talentBb(chess, 0);
    const t1 = (chess?.talents ?? []).filter((t) => t && t.index !== -1)[1] ?? null;
    const lines = holidayLines(t1);
    const waterSkill = /技能开启时，场地视为水地形/.test(String(t1?.desc ?? ''));
    const frontAll = (battle, u) => num(u.profile?.frontScale, 1.5);
    const spare = {
      self: num(t0['e_spareshot_chen.prob'], num(t0['spareshot_chen.prob'])),
      sniper: num(t0['chen2_t_002[spareshot][sniper].prob'], num(t0['spareshot_chen.prob'])),
      other: num(t0['chen2_t_002[spareshot][other].prob']),
    };
    const s2Charged = count(b2['attack@another_trigger_time'], 0);
    return {
      skills: {
        [S1]: {
          kind: 'ammo',
          ammo: count(b1['attack@trigger_time'], 4),
          mods: { atkPct: num(b1.atk) },
          attack: { dmgMul: frontAll },
        },
        [S2]: {
          kind: 'ammo',
          ammo: count(b2['attack@trigger_time'], 8),
          mods: { atkPct: num(b2.atk) },
          attack: {},   // (its attacks are the skill's: isSkill)
          onStart({ unit, skill }) {
            // 蓄力: cast with every charge stored (activate took one) ⇒ the charged bullets; any cast spends all the SP
            const charged = skill.maxCharges > 1 && skill.charges + 1 >= skill.maxCharges;
            unit.mem.chen2Charged = charged;
            if (charged && s2Charged > skill.ammoLeft) skill.addAmmo(s2Charged - skill.ammoLeft);
            skill.charges = 0;
            skill.sp = 0;
          },
          onAttack({ battle, unit }) { leaveSlime(battle, unit, b2); },
          onEnd({ unit }) { unit.mem.chen2Charged = false; },
        },
        [S3]: {
          kind: 'ammo',
          ammo: count(b3['attack@trigger_time'], 32),
          mods: { atkPct: num(b3.atk) },
          targeting: s3?.rangeGrid ? { rangeGrid: s3.rangeGrid.map((p) => [p[0], p[1]]) } : undefined,
          attack: { hits: 2, dmgMul: frontAll },
          onAttack({ battle, unit, skill }) {
            leaveSlime(battle, unit, b3);
            // 每次攻击消耗2发: the second bullet (the engine spends the other one); with one left she still attacks
            if (skill.ammoLeft > 1) {
              skill.ammoLeft--;
              battle.emit('ammoUsed', { unit, left: skill.ammoLeft, skill });
            }
          },
        },
      },
      talents: [
        { install(battle, unit) { // 节约风气
          if (spare.self > 0 || spare.sniper > 0 || spare.other > 0) installSpare(battle, unit, spare);
        } },
        { install(battle, unit) { // 假日余韵: +ASPD (+ATK), the water line while the field counts as water
          const KEY = 'talent:chen2:holiday';
          const apply = () => {
            const w = waterOn(battle);
            if (unit.mem.chen2Water === w && unit.findBuff(KEY)) return;
            unit.mem.chen2Water = w;
            const l = w ? lines.water : lines.common;
            const mods = {};
            if (l.atkPct) mods.atkPct = l.atkPct;
            if (l.aspd) mods.aspd = l.aspd;
            if (Object.keys(mods).length) battle.addBuff(unit, { key: KEY, mods, persist: true, allowDead: true, tags: ['talent'] });
            else battle.removeBuff(unit, KEY);
          };
          apply();
          battle.on('tick', apply, { owner: unit });
          if (!waterSkill) return;
          // RPR-Y stage 3 "技能开启时，场地视为水地形" (chen2_e_003_t[map_tag]): set at her skill's start unless she holds it,
          // cleared when her skill ends or she leaves — if she set it
          const clear = () => { if (unit.mem.chen2WaterSet) { unit.mem.chen2WaterSet = false; setWater(battle, false); apply(); } };
          battle.on('skillStart', (ctx) => {
            if (ctx.unit !== unit || unit.mem.chen2WaterSet) return;
            unit.mem.chen2WaterSet = true;
            setWater(battle, true);
            apply();
          }, { owner: unit });
          battle.on('skillEnd', (ctx) => { if (ctx.unit === unit) clear(); }, { owner: unit });
          battle.on('death', (ctx) => { if (ctx.unit === unit) clear(); }, { owner: unit });
        } },
      ],
    };
  },
};
