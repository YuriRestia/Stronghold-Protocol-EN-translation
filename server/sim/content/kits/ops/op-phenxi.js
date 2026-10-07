// server/sim/content/kits/ops/op-phenxi.js — 菲亚梅塔 (char_300_phenxi) 自选 operator kit: 6★ 炮手 (狙击), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and all three modules (ART-Y “‘律外’特种弹药配给组”,
// ART-X “漫长的旅途”, ISW-A “菲亚梅塔特限证章”) at every form. Kit contract and the 自选 rules: ../README.md ("How to add an
// operator (自选)").
//
// Forms (data/backups.json units.char_300_phenxi, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, the picked module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05.
// Full potential (the owner's decision of 2026-10-07). Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into
// backups.json; battle_equip_table marks every ISW-A part but its attributes `validInGameTag` roguelike); PRTS 菲亚梅塔
// and 溅射半径一览 (the 备注 quoted below); the client's charpack char_300_phenxi (the S1 mode's attack selector), skill
// prefabs ([uc]skills skchr_phenxi_1 / 2 / 3) and buff templates (phenxi_t_1 / [bleeding] / [peak], phenxi_t_2,
// phenxi_e_t_2, phenxi_e_003_t / [bleeding], phenxi_e_003_tr).
// - Trait (炮手) "攻击造成群体物理伤害": ranged physical, every enemy within SPLASH of the struck one takes the hit in full
//   (the aoesniper profile), air units too; her 3-10, blocks 1, ground enemies target her (no flag). PRTS 溅射半径一览 gives
//   the 炮手 1.0 (the profile keeps the 扩散术师's 1.1): the kit's trait sets 1.0. Bonds (拉特兰) are the slot's business.
// - Module ART-Y “‘律外’特种弹药配给组” "攻击时无视敌人100点的防御力" (def_penetrate_fixed): defIgnoreFlat on all her damage.
//   Stage 3 changes 宣告终局 (below).
// - Module ART-X “漫长的旅途” "攻击被阻挡的敌人时攻击力提升至110%" (trait bb atk_scale; phenxi_e_003_tr: AtkScaleUp on every
//   damage she calculates when the target is blocked): ×atk_scale on her damage to a blocked enemy — normal attacks and
//   their splash, both skills' blasts. Stage 3 changes 陈述苦难 (below).
// - Module ISW-A “菲亚梅塔特限证章”: its trait and every talent part are 集成战略-only (battle_equip_table validInGameTag
//   roguelike: 首次部署费用 −50 %, 倒下时立即重新部署, the slower 生命流失, the doubled 精力充沛, the 再度施放 echo, +30 攻速) ⇒
//   N/A here; only its attributes (HP / ATK) count, and both talents are the base ones (the record's talentsBase — the
//   composed talents would carry the 集成战略 blackboard).
// - T1 陈述苦难 "自身生命会不断流失（该效果不会使生命降至0）；生命值高于50%时获得+25%攻击力的精力充沛；高于80%效果翻倍"
//   (phenxi_t_1: from each deployment phenxi_t_1[bleeding] every `interval` s; PRTS 备注 "每0.1s结算一次，每次结算时菲亚梅塔
//   流失当前生命值的0.5%（向上取整），且始终不会致命（至多令菲亚梅塔生命值降至1点）"): a 流失 (battle.loseHp — no hit, no SP,
//   no shield; PRTS calls it 生命流失) of ⌈hp_ratio × current HP⌉ every `interval` s while she has more than 1 HP, never
//   below 1. 精力充沛 (peak_performance; ba.strong "生命值高于一定比例时获得一定属性加成"): ATK +peak_1 atk while HP > peak_1
//   hp_ratio (50 %), +peak_2 atk (twice that) while HP > peak_2 hp_ratio (80 %) — the higher replaces the lower.
//   ART-X stage 3 (phenxi_e_003_t[bleeding]: FilterByTargetHpRatio min_hp_ratio 0.503): no loss unless HP > 50.3 % ("不会
//   使生命降至50%以下"), +30 % / +60 %.
// - T2 宣告终局 "技能持续期间外，攻击速度+27" (full potential: +30; phenxi_t_2: an ASPD buff, overridden while a skill runs):
//   ASPD +attack_speed except while a timed skill runs (S1's 30 s, S3 for good; S2 is instant). ART-Y stage 3 (phenxi_e_t_2):
//   +33 outside, and ASPD +phenxi_e_t_2[in_skill] (10) while one runs.
// - S1 “你须直面” (MANUAL, attack SP, 30 s, data ACTIVE_RANGE on her 3-10 grown by ability_range_forward_extend): ATK +atk.
//   PRTS 备注 "自2026年8月1日（客户端版本 2.7.61）版本更新后：技能期间的普通攻击不再以飞行单位为目标（但弹道依旧能击中飞行
//   单位），技能期间的攻击范围不再受攻击距离属性影响，因此技能提供的攻击距离加成不会产生攻击范围扩展效果" — the client agrees
//   (charpack: the S1 mode's attack selector `_targetMotion` 1, owner range): while it runs she selects ground enemies
//   only, her shells still splash air units (attack `splashHitsFly`), and her range stays 3-10 (S1_SINCE_2_7_61; false =
//   the skill text: range +1 forward, air targets). The data trigger still reads the +1 grid — reported as an open
//   question (by the owner's rule the trigger would be DEFAULT once the range does not grow).
// - S2 “你须愧悔” (MANUAL, attack SP, data DEFAULT): the attack it is cast for fires the 灼痕弹 instead (its cast animation;
//   no hit of its own [ASSUMED]). PRTS 备注 "灼痕弹飞行终点为干员正前方第4格中点，每飞行0.66格留下一道灼痕，飞行速度8格/秒。
//   灼痕弹爆炸半径1.5；灼痕生成后0.8s爆炸，爆炸半径1.1": from her tile along her facing to the 4th tile ahead at 8 tiles/s,
//   a 灼痕 every `dist` tiles of its flight (none on the end point [ASSUMED]); at the end atk_scale × ATK physical to every
//   targetable enemy within 1.5, each 灼痕 0.8 s after it was left atk_scale_2 × ATK within 1.1 (中点判定; air units too
//   [ASSUMED: no 不可对空 note]). Her ATK when each blast goes off [ASSUMED].
// - S3 “你须偿还” (MANUAL, attack SP, data DEFAULT, 持续时间无限 — a toggle; ba.permanentatk 持续攻击 "无论攻击范围内是否有攻击
//   目标，都会持续进行攻击"): every attack interval, enemy or not, a shell (S3_SPEED [ASSUMED]) to the centre of the farthest
//   tile of her range on her own line ahead; PRTS 备注 "爆炸范围扩大至半径2.0…爆炸中心为半径1.1的圆（中点判定）；爆炸中心攻击倍率
//   提升效果不叠加，取最高": every targetable enemy within 2.0 takes attack@atk_scale_2 × ATK, within attack@dist (1.1) of
//   the centre attack@atk_scale instead, physical, air units too [ASSUMED: no 不可对空 note]. These shells are her attacks
//   (isAttack, every victim a splash victim: the shot aims at a tile); a stun / freeze holds the cycle, disarm stops it.

import { num, talentBb, traitBb, moduleOn, skillRec, up, statBuff } from '../shared/tier1.js';
import { toLocal } from '../../../dir.js';
import { COLS, PROJECTILE_SPEEDS } from '../../../constants.js';

const S1 = 'skchr_phenxi_1';
const S2 = 'skchr_phenxi_2';
const S3 = 'skchr_phenxi_3';
/** PRTS 溅射半径一览: 炮手 1.0. */
const SPLASH = 1.0;
/**
 * “你须直面” since the 2026-08-01 client (PRTS S1 备注, 客户端版本 2.7.61): her skill attacks select ground enemies only (the
 * shell still hits air units) and the skill's 攻击距离+1 no longer grows her range. false = the skill text.
 */
const S1_SINCE_2_7_61 = true;
/** PRTS S2 备注: the 灼痕弹 ends at the centre of the 4th tile ahead, flies 8 tiles/s, bursts 1.5; each 灼痕 0.8 s / 1.1. */
const SHELL_REACH = 4;
const SHELL_SPEED = 8;
const SHELL_RADIUS = 1.5;
const MARK_DELAY = 0.8;
const MARK_RADIUS = 1.1;
/** PRTS S3 备注 "爆炸范围扩大至半径2.0". */
const S3_RADIUS = 2.0;
/** S3's shells fly as bombs [ASSUMED: the engine's bomb projectile speed]. */
const S3_SPEED = PROJECTILE_SPEEDS.bomb;
const PEAK_KEY = 'talent:phenxi:peak';
const ASPD_KEY = 'talent:phenxi:aspd';
const BLEED_TAG = 'phenxi:bleed';
const P1 = 'phenxi_t_1[peak_1].peak_performance';
const P2 = 'phenxi_t_1[peak_2].peak_performance';

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** A 集成战略 module (ISW-*) is picked: none of its talent parts applies outside 集成战略. */
const isRoguelikeModule = (chess) => moduleOn(chess) && /^ISW/i.test(String(chess?.module?.type ?? ''));

/** Every targetable enemy within `r` of (x, y) (中点判定) takes scale × her ATK physical. */
function blast(battle, unit, x, y, r, scale, skill) {
  battle.fx('aoe', { x, y, radius: r, id: unit.id, skill });
  for (const e of battle.foesInRadius(x, y, r, true)) {
    battle.dealDamage(unit, e, { amount: unit.s.atk * scale * unit.s.atkScaleMul, type: 'phys', isSkill: true, tags: ['skill', skill] });
  }
}

/** “你须愧悔”: the 灼痕弹 along her facing and the 灼痕 it leaves (header). */
function fireShell(battle, unit, b2) {
  const [fr, fc] = unit.fwd;
  const x0 = unit.x, y0 = unit.y;
  const at = (d) => ({ x: x0 + fc * d, y: y0 + fr * d });
  const end = at(SHELL_REACH);
  const scale = num(b2.atk_scale, 1), scale2 = num(b2.atk_scale_2, scale), step = num(b2.dist);
  battle.addProjectile({ from: unit, to: end, speed: SHELL_SPEED, visual: 'bomb', source: unit,
    onHit: () => blast(battle, unit, end.x, end.y, SHELL_RADIUS, scale, 'phenxi:s2') });
  if (!(step > 0)) return;
  for (let k = 1; k * step < SHELL_REACH - 1e-9; k++) {
    const p = at(k * step);
    battle.after((k * step) / SHELL_SPEED, () => {
      battle.fx('zone', { x: p.x, y: p.y, radius: MARK_RADIUS, dur: MARK_DELAY, id: unit.id, skill: 'phenxi:mark' });
      battle.after(MARK_DELAY, () => blast(battle, unit, p.x, p.y, MARK_RADIUS, scale2, 'phenxi:mark'));
    });
  }
}

/** “你须偿还”'s aim: the farthest tile of her current range on her own line ahead ([row, col]), or null. */
function farthestAhead(unit) {
  let best = null, bc = -1;
  for (const k of unit.rangeKeys ?? []) {
    const r = Math.floor(k / COLS), c = k % COLS;
    const [lr, lc] = toLocal(r - unit.tileR, c - unit.tileC, unit.dir);
    if (lr === 0 && lc > bc) { bc = lc; best = [r, c]; }
  }
  return best;
}

/** One “你须偿还” shell (header). */
function s3Shot(battle, unit, b3) {
  const tile = farthestAhead(unit);
  if (!tile) return;
  const x = tile[1], y = tile[0];
  const lo = num(b3['attack@atk_scale_2'], 1), hi = Math.max(lo, num(b3['attack@atk_scale'], lo)), core = num(b3['attack@dist'], 1.1);
  unit.stats.attacks++;
  unit.lastAttackAt = battle.time;
  battle.addProjectile({ from: unit, to: { x, y }, speed: S3_SPEED, visual: 'bomb', source: unit, onHit: () => {
    battle.fx('aoe', { x, y, radius: S3_RADIUS, id: unit.id, skill: 'phenxi:s3' });
    for (const e of battle.foesInRadius(x, y, S3_RADIUS, true)) {
      const sc = Math.hypot(e.x - x, e.y - y) <= core + 1e-9 ? hi : lo;
      battle.dealDamage(unit, e, { amount: unit.s.atk * sc * unit.s.atkScaleMul, type: 'phys', isAttack: true, isSkill: true, isSplash: true, tags: ['skill', 'phenxi:s3'] });
    }
  } });
}

export default {
  char_300_phenxi: (bb, chess) => {
    const src = isRoguelikeModule(chess) ? { talents: chess.talentsBase ?? chess.talents } : chess;
    const t0 = talentBb(src, 0);   // 陈述苦难 (ART-X stage 3: min_hp_ratio, +30 % / +60 %)
    const t1 = talentBb(src, 1);   // 宣告终局 (ART-Y stage 3: 33, in-skill 10)
    const tb = traitBb(chess);     // ART-Y def_penetrate_fixed · ART-X atk_scale
    const blocked = num(tb.atk_scale, 1);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    return {
      trait: { splashRadius: SPLASH },
      skills: {
        [S1]: S1_SINCE_2_7_61
          ? { kind: 'duration', mods: { atkPct: num(b1.atk) }, targeting: { canHitFly: false }, attack: { splashHitsFly: true } }
          : { kind: 'duration', mods: { atkPct: num(b1.atk) }, targeting: { rangeExtend: num(b1.ability_range_forward_extend) } },
        [S2]: {
          kind: 'instant',
          onStart({ battle, unit }) {
            unit.mem.phenxiCastAt = battle.time; // the cast takes this attack's place
            fireShell(battle, unit, b2);
          },
        },
        [S3]: {
          kind: 'toggle',
          attack: { noAttack: true }, // 持续攻击: her shells below are her attacks
          onStart({ unit }) { unit.mem.phenxiCd = 0; },
          onTick({ battle, unit, dt }) {
            if (!unit.canAct) return; // 晕眩 / 冻结 hold the cycle, as her attack cooldown
            unit.mem.phenxiCd = num(unit.mem.phenxiCd) - dt;
            if (unit.mem.phenxiCd > 1e-9 || unit.s.flags.disarm) return;
            unit.mem.phenxiCd = unit.s.interval;
            s3Shot(battle, unit, b3);
          },
        },
      },
      talents: [
        { install(battle, unit) { // 陈述苦难: the 流失 and 精力充沛
          const iv = Math.max(0.05, num(t0.interval, 0.1)), ratio = num(t0.hp_ratio), floor = num(t0.min_hp_ratio);
          const a1 = num(t0[`${P1}.atk`]), h1 = num(t0[`${P1}.hp_ratio`], 0.5);
          const a2 = num(t0[`${P2}.atk`]), h2 = num(t0[`${P2}.hp_ratio`], 0.8);
          if (ratio > 0) {
            battle.on('deploy', (ctx) => {
              if (ctx.unit !== unit) return;
              const seq = unit.deploySeq;
              battle.every(iv, (b, sched) => {
                if (!unit.alive || !unit.deployed || unit.deploySeq !== seq) { sched.cancel(); return; }
                if (!(unit.hp > 1) || (floor > 0 && !(unit.hpRatio > floor))) return;
                const n = Math.min(Math.ceil(unit.hp * ratio - 1e-9), unit.hp - 1); // 向上取整, never lethal
                if (n > 0) battle.loseHp(unit, n, { source: unit, silent: true, tags: [BLEED_TAG] });
              }, { owner: unit });
            }, { owner: unit });
          }
          if (!(a1 > 0) && !(a2 > 0)) return;
          const sync = () => {
            const r = unit.hpRatio;
            const v = !up(unit) ? 0 : r > h2 ? a2 : r > h1 ? a1 : 0;
            const cur = unit.findBuff(PEAK_KEY);
            if (v > 0 && (!cur || cur.mods?.atkPct !== v)) battle.addBuff(unit, { key: PEAK_KEY, mods: { atkPct: v }, tags: ['talent'], visible: true });
            else if (!(v > 0) && cur) battle.removeBuff(unit, PEAK_KEY);
          };
          battle.on('tick', sync, { owner: unit });
          battle.on('battleStart', sync, { owner: unit });
          battle.on('deploy', (ctx) => { if (ctx.unit === unit && battle.started) sync(); }, { owner: unit });
        } },
        { install(battle, unit) { // 宣告终局: ASPD outside a running skill (ART-Y stage 3: and a smaller one inside)
          const out = num(t1.attack_speed), inside = num(t1['phenxi_e_t_2[in_skill].attack_speed']);
          if (!out && !inside) return;
          const sync = () => {
            const running = !!(unit.skill && unit.skill.active && unit.skill.isTimed);
            const v = up(unit) ? (running ? inside : out) : 0;
            const cur = unit.findBuff(ASPD_KEY);
            if (v && (!cur || cur.mods?.aspd !== v)) battle.addBuff(unit, { key: ASPD_KEY, mods: { aspd: v }, tags: ['talent'] });
            else if (!v && cur) battle.removeBuff(unit, ASPD_KEY);
          };
          battle.on('tick', sync, { owner: unit });
          battle.on('battleStart', sync, { owner: unit });
          for (const ev of ['deploy', 'skillStart', 'skillEnd']) battle.on(ev, (ctx) => { if (ctx.unit === unit && battle.started) sync(); }, { owner: unit });
        } },
      ],
      install(battle, unit) {
        // ART-X: 攻击被阻挡的敌人时攻击力提升至110% (every damage she calculates)
        if (blocked !== 1) {
          battle.on('hit', (ctx) => {
            const t = ctx.target;
            if (ctx.source !== unit || !t || t.side !== 'enemy' || !t.blockedBy || ctx.dmg.type === 'element') return;
            ctx.dmg.amount *= blocked;
          }, { owner: unit });
        }
        // ART-Y: 攻击时无视敌人100点的防御力
        statBuff(battle, unit, 'trait:phenxi:pierce', { defIgnoreFlat: num(tb.def_penetrate_fixed) });
        // “你须愧悔”: the attack it is cast for makes no hit of its own
        if (unit.skill?.id === S2) {
          battle.on('beforeAttack', (ctx) => {
            if (ctx.attacker !== unit || unit.mem.phenxiCastAt !== battle.time) return;
            unit.mem.phenxiCastAt = null;
            ctx.targets = [];
          }, { owner: unit, priority: 100 });
        }
      },
    };
  },
};
