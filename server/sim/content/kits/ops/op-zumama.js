// server/sim/content/kits/ops/op-zumama.js — 森蚺 (char_416_zumama) 自选 operator kit: 6★ 决战者 (重装), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and all three modules at every form.
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_416_zumama, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, the picked module at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json); PRTS 森蚺 (勇冠三军 备注
// "天赋具有0.1秒的检测周期；高于一半的效果实为在计算伤害时提升本次伤害的攻击力倍率"; S2 备注 "造成的晕眩效果无视目标可选性，持续
// 时间不会因抵抗等效果被缩短或延长"; S3 备注 "生命恢复的提供方式为增加“生命回复速度（百分比）”属性…不受治疗加成和禁疗影响");
// PRTS 分支特性信息 §决战者 ("常态持有阻回（停止任意形式的技力回复，技力也无法自然回复）；阻挡敌人期间暂时免疫此效果"; "此分支的部分
// 干员拥有可以移除此阻回效果的模组，但会增加“技力回复速度倍率降低”的限制"); the client's battle data: her charpack (trait abilities
// SpRecoveryStopped / SpRecovery, the S2 mode's stun_ability), buff templates zumama_t_1 / zumama_t_1[atk] / zumama_s_3 /
// zumama_s_3[buff], the module prefabs zumama_equip_{1,2,3}_* and battle_equip_table `validInGameTag`; Arknights Terra
// Wiki "Eunectes" (S2: "unaffected by … Status Resistance and remains even if the target becomes invulnerable or
// untargetable").
// - Trait (决战者) "只有阻挡敌人时才能够回复技力": the charpack's trait — 阻回 (sp_recovery_stopped, overridden while she
//   blocks at least one enemy): flag `noSp` while she blocks nobody — no SP of any kind then (time, gifts; skills.js), her
//   initSp included at deployment ('init' passes it). The modules replace that 阻回 by a 技力回复速度倍率 (trait bb
//   sp_recover_ratio, the equip prefab's attribute 30 on 'sp_e_recovery_stopped', overridden while blocking): HES-X
//   “祖玛玛的工具箱” "缓慢回复技力，只有阻挡敌人时恢复技力回复速度" ×(1 − 0.8), HES-Y “小小的丑东西” "不阻挡敌人时无法自我回复技力"
//   ×(1 − 0.999) — SP recovery ×(1 + ratio) while she blocks nobody (spRecoveryMul; SP gifts still land) —, RA-A
//   森蚺特限证章 ×(1 − 1) (its TRAIT part carries no validInGameTag: it holds in every mode). HES-Y also "阻挡敌人时…攻击力
//   +15%，防御力+15%" (trait bb atk / def) while she blocks.
// - Module RA-A: every other part is 生息演算-only (battle_equip_table validInGameTag 'sandbox': the hidden talent's
//   attraction / block / 物理脆弱 and 愈战愈勇's +0.4/s; trait text "在生息演算中…") — N/A here; its HP / ATK are in the stats. The
//   composed record merges the sandbox 愈战愈勇 part (0.4) into `talents`, so this kit reads 愈战愈勇 from `talentsBase` under
//   RA-A (+0.2/s, the module's own text "阻挡敌人时技力回复速度+0.2/秒；在生息演算中…").
// - T1 勇冠三军 (zumama_t_1, polled every T1_PERIOD s): HP ratio above hp_ratio ⇒ every damage she deals ×atk_scale as an
//   攻击力倍率 (atkScaleMul: applied to the ATK before DEF — PRTS 备注); at or below it ⇒ damage_resistance 庇护 (ba.protect
//   "受到的物理和法术伤害降低相应比例（同名效果取最高）": the shared applyStrongest key PROTECT). HES-Y stage 3: 125 % / 30 % (the module
//   talent change; full potential).
// - T2 愈战愈勇 "阻挡敌人时技力回复速度+0.2/秒": spRecoveryFlat while she blocks. HES-X stage 3: +0.55/s.
// - S1 轻型挂斧 (PASSIVE): ATK / DEF +atk / +def from every deployment.
// - S2 震慑劈砍 (MANUAL; data DEFAULT — the owner's 重装 exception of 2026-10-05, rawRule TAKE_DAMAGE): `duration` s, ATK
//   +atk, attack interval +base_attack_time s (a flat +0.4 on her 1.6 s), and every enemy she blocks is stunned while it is
//   blocked and the skill runs (the charpack's _buffsToBlockee 'stun'): a stun pulse of STUN_PULSE s renewed every tick
//   past 抵抗 (`resistApplied`: "持续时间不会因抵抗等效果被缩短或延长") and refused only by a 晕眩 immunity — so it ends at most
//   STUN_PULSE s after the block or the skill. [ASSUMED] a blockee that turns 无敌 and 无法选中 at once loses it after one pulse
//   (the engine refuses statuses on such a unit; Terra: the official one stays).
// - S3 钢铁意志 (MANUAL; data DEFAULT, rawRule TAKE_DAMAGE): `duration` s, ATK / DEF +atk / +def, block +block_cnt,
//   生命回复速度 +hp_recovery_per_sec_by_max_hp_ratio × max HP (hpRegenRatio — checklist 11: no heal, 禁疗-proof); when it ends
//   she is stunned `stun` s (zumama_s_3 ON_BUFF_FINISH 'stun'; a stunned operator blocks nobody).
// - Melee physical, ground-only (data canHitFly false), block 1, range 1-1; ground enemies target her (no 起飞 / 迷彩).

import { num, traitBb, skillRec, toggleBuff, batMod, up, holdProtect } from '../shared/tier1.js';

const S1 = 'skchr_zumama_1';
const S2 = 'skchr_zumama_2';
const S3 = 'skchr_zumama_3';
/** PRTS 勇冠三军 备注 "天赋具有0.1秒的检测周期". */
const T1_PERIOD = 0.1;
/** 庇护 refresh: a little longer than the check period, so it never lapses while it holds. */
const PROTECT_HOLD = T1_PERIOD + 0.05;
/** S2's blockee stun, renewed every tick while it holds (three ticks long). */
const STUN_PULSE = 0.1;
const VALOR = 'talent:zumama:valor';

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** The record's active module, or null. */
const activeModule = (chess) => (chess?.module?.active ? (chess.modules ?? []).find((m) => m && m.uniEquipId === chess.module.id) ?? null : null);
/** A module whose extra parts work 在生息演算中 only (RA-A): its talent changes do not apply here. */
const sandboxOnly = (mod) => /生息演算/.test(String(mod?.traitOverride?.moduleDesc ?? ''));
/** Blackboard of the talent with data index `i` in `list` ({} when absent). */
const talentAt = (list, i) => (list ?? []).find((t) => t && t.index === i)?.bb ?? {};

export default {
  char_416_zumama: (bb, chess) => {
    const mod = activeModule(chess);
    const talents = mod && sandboxOnly(mod) ? chess.talentsBase : chess?.talents;
    const t0 = talentAt(talents, 0), t1 = talentAt(talents, 1);
    const tb = traitBb(chess);
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    return {
      skills: {
        [S1]: { kind: 'passive', mods: { atkPct: num(b1.atk), defPct: num(b1.def) } },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk), batPct: batMod(b2.base_attack_time, chess) },
          onTick({ battle, unit }) {
            for (const e of unit.blocking) {
              if (e.alive && e.blockedBy === unit) battle.applyStatus(e, 'stun', { duration: STUN_PULSE, source: unit, resistApplied: true });
            }
          },
        },
        [S3]: {
          kind: 'duration',
          mods: { atkPct: num(b3.atk), defPct: num(b3.def), blockCnt: num(b3.block_cnt), hpRegenRatio: num(b3.hp_recovery_per_sec_by_max_hp_ratio) },
          onEnd({ battle, unit }) {
            if (up(unit) && num(b3.stun) > 0) battle.applyStatus(unit, 'stun', { duration: num(b3.stun), source: unit });
          },
        },
      },
      talents: [
        { install(battle, unit) { // 勇冠三军: above hp_ratio ×atk_scale (攻击力倍率), at or below it 庇护 — checked every T1_PERIOD s
          const ratio = num(t0.hp_ratio, 0.5), scale = num(t0.atk_scale, 1), dr = num(t0.damage_resistance);
          const check = () => {
            const high = up(unit) && unit.hpRatio > ratio + 1e-9;
            const has = unit.findBuff(VALOR);
            if (high && !has && scale !== 1) battle.addBuff(unit, { key: VALOR, mods: { atkScaleMul: scale }, tags: ['talent'] });
            else if (!high && has) battle.removeBuff(unit, VALOR);
            if (up(unit) && !high) holdProtect(battle, unit, dr, PROTECT_HOLD, unit);   // 庇护: the shared effect
          };
          battle.every(T1_PERIOD, check, { owner: unit, immediate: true });
          battle.on('deploy', (ctx) => { if (ctx.unit === unit) check(); }, { owner: unit });
        } },
        { install(battle, unit) { // 愈战愈勇: SP recovery +sp_recovery_per_sec while she blocks
          const sp = num(t1.sp_recovery_per_sec);
          if (sp > 0) toggleBuff(battle, unit, 'talent:zumama:fight', () => unit.blocking.length > 0, { spRecoveryFlat: sp });
        } },
      ],
      install(battle, unit) {
        // 决战者: 阻回 while she blocks nobody; a module turns it into ×(1 + sp_recover_ratio) SP recovery instead
        const notBlocking = () => unit.blocking.length === 0;
        if (tb.sp_recover_ratio == null) toggleBuff(battle, unit, 'trait:zumama:duel', notBlocking, null, { flags: { noSp: true } });
        else toggleBuff(battle, unit, 'trait:zumama:duel', notBlocking, { spRecoveryMul: Math.max(0, 1 + num(tb.sp_recover_ratio)) });
        // HES-Y: 阻挡敌人时攻击力+15%，防御力+15%
        const ma = num(tb.atk), md = num(tb.def);
        if (ma || md) toggleBuff(battle, unit, 'trait:zumama:block', () => unit.blocking.length > 0, { atkPct: ma, defPct: md });
      },
    };
  },
};
