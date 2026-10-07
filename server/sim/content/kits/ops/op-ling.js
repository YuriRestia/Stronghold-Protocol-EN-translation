// server/sim/content/kits/ops/op-ling.js — 令 (char_2023_ling) 自选 operator kit: 6★ 召唤师 (辅助), an owned-6★ pick of the
// tier-5 and tier-6 自选 slots; every skill, both talents, the trait and her module (SUM-Y 诗短梦长) at every form, and the
// kits of her summons “清平” / “逍遥” / “弦惊” (token_10020_ling_soul1 / 2 / 3). Kit contract and the 自选 rules: ../README.md
// ("How to add an operator (自选)"); the summon deck: ../shared/summoner.js.
//
// Forms (data/backups.json units.char_2023_ling): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, the
// module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05. Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table / the tokens' character_table rows (zh_CN, as built into
// backups.json); PRTS 令 (S2 备注 "令与其召唤物的攻击范围内没有可选目标时，该技能也可开启…但可以进行召唤物的回收", "召唤物的同步
// 触发技能与回收不受缴械或沉默等效果制约"; S3 备注 "召唤物对周围敌人造成的持续法术伤害不可对空，且视为来自令造成的伤害"; SUM-Y
// 特性 "※“清平”“逍遥”：部署费用-3；“弦惊”：部署费用-5", stage 3 "属性更强的召唤物"); PRTS “清平” / “逍遥” / “弦惊” (备注 "持有
// 禁疗", "可以且优先攻击自身阻挡的单位"; 弦惊's merge rules and "高级形态下：生命上限+100%，攻击力+80%，防御力+80%，法术抗性+100%，
// 攻击间隔+0.8s，阻挡数+2…直接加算或直接乘算", "升级时立刻重设召唤物生命值至最大值"); PRTS 分支特性信息 召唤师; the client's
// battle data (charpack char_2023_ling: Talents/1 charge_token[born], Talents/2 ling_t on her summons, CommonAbilities
// die_to_kill_token; buff_template_data ling_t (ON_OWNER_KILLED: modify_sp[trigger] `sp`, ling_atk_up ATK MULTIPLIER STACK
// to max_stack_cnt), ling_s3_aoe[token] (AOEDamage MAGICAL SPLASH WALK_ONLY, source 令, × atk_scale, range x-5 every
// `interval`), ling_soul3_evolution[self] / [another] / _die (the merge); skill prefabs skchr_ling_1 (aura: the summons' mode
// + ATK / ASPD, hers + trigger_charge_token), skchr_ling_2 (Attack: 2 targets, ling_s2_unmovable UNMOVABLE; TokenAttack:
// InterruptCharacterAttack + the summon's ability "2", `_checkCanUseAblityFlag` false; Recycle: 1.2 s later, Withdraw
// `_switchToDeadState` + RechargeToken cnt for every summon below hp_ratio), skchr_ling_3 (aura + ling_s3[charge_token]);
// equips ling_equip_1_* (trigger_charge_token: the trait's cnt)).
// - Trait (召唤师): the profession default (ranged arts on her 3-1, hits air units — PRTS "可对空"), blocks 1, ground enemies
//   target her; her summons leave the field with her (shared/summoner.js).
// - T1 挑灯问梦 "可以使用5个召唤物（最多同时部署3个），功能随技能选择而改变": the summon of her pick's skill (“清平” / “逍遥” /
//   “弦惊” — the skills' overrideTokenKey) is the hand piece the player places; the deck of ../shared/summoner.js with charge =
//   cnt (5), cap = the summon record's deckStack (5: its hidden talent's max_deck_stack_cnt, tools/build-data.mjs
//   tokenTalentDeckBonus; +3 with SUM-Y), at most its deployLimit standing (3 = 1 + the talent's max_deploy_count 2; SUM-Y
//   stage 2+: 4) — the hand count too. Every summon holds 禁疗 (PRTS; [ASSUMED: given here — the data's `abnormal` lacks it]) and fights with its
//   own data: “清平” blocks 1 and strikes in melee (physical) on its 1-1, “逍遥” shoots arts on its 3-1 (air units too), “弦惊”
//   blocks 2 and strikes every enemy it blocks (physical; its trait "攻击阻挡的所有敌人").
// - T2 随付笺咏醉屠苏 "召唤物被击倒/吸收/回收时令额外获得3点技力、攻击力+3%（攻击力加成最多叠加5层）" (full potential: 4点技力): a
//   summon knocked out, absorbed by a 弦惊 merge or recalled by S2 ⇒ +sp SP (no SP while a timed skill of hers runs; 阻回
//   stops it) and a stack of ATK +atk (直接乘算) up to max_stack_cnt, kept until she leaves the field — not when her summons
//   leave with her.
// - S1 重进酒 (MANUAL, data DEFAULT, 25 s): +cnt held at the cast; she and her summons ATK +atk, ASPD +attack_speed, and her
//   summons' attacks deal arts damage meanwhile ("召唤物伤害类型变为法术"). Passive "召唤物可部署在近战位": placement only.
// - S2 笑鸣瑟 (MANUAL, data DEFAULT, 2 charges — the cast replaces the attack she is about to make): her attack strikes up to
//   `value` (2) enemies of her range for atk_scale × ATK arts and 束缚 ling_s2_unmovable.duration s each; every summon of hers
//   on the field breaks off its attack (its cooldown restarts) and strikes up to 2 enemies of its own range for its skill's
//   2.atk_scale × its ATK arts + 束缚 2.duration s — stunned / silenced / disarmed ones too (PRTS; `_checkCanUseAblityFlag`
//   false) — instant for a melee summon, a bolt for “逍遥”; RECYCLE_DELAY (1.2) s after the cast every summon of hers below
//   hp_ratio of its max HP is recalled (+1 held each, T2). Passive "召唤物可部署在远程位，攻击造成法术伤害": “逍遥”'s data.
//   The 备注's cast with no target cannot happen here: the data's DEFAULT casts it on an attack.
// - S3 宁作吾 (MANUAL, data DEFAULT, 30 s): she and her summons ATK +atk, DEF +def; every `interval` (0.5) s from the moment
//   it covers a summon, every ground enemy on that summon's x-5 takes atk_scale × 令's ATK arts (溅射: not dodgeable, her
//   damage — PRTS); +cnt held when it ends (not when she leaves). Its cast: the data's DEFAULT, and — the owner's
//   larger-range rule of 2026-10-06 (its pulses act on each summon's x-5) — also a ground enemy on a standing summon's x-5
//   (shared/summoner.js summonTriggerArea, checked every tick). Passive: the 弦惊 merge — at a 弦惊's deployment, another
//   basic 弦惊 of hers on its range ⇒ that one turns 高级形态 and the new one is absorbed (withdrawn); else, the new one
//   standing on the range of one or more basic ones ⇒ it turns 高级形态 and the latest deployed of them is absorbed. 高级形态
//   (until it leaves the field): its skill's 2.max_hp / 2.atk / 2.def (直接乘算), RES ×(1 + 2.magic_resistance), attack
//   interval +2.base_attack_time s, block +2.block_cnt, arts attacks, HP reset to its new maximum. Its "占据2个部署位" (and
//   SUM-X-like 部署位 rules) concern the prep's deploy cap, which summon pieces never use in this mode: N/A.
// - Module SUM-Y 诗短梦长: trait "召唤物持有上限+3，召唤物部署费用减少" — +3 held on the card at the battle start, cap +3, the
//   summons' lower costs (the module variant); stage 2+ T1 "最多同时部署4个", stage 3 "属性更强的召唤物" (the module variant's
//   stats). Its attributes are in the stats.

import { num, talentBb, traitBb, moduleOn, skillRec, batMod, giveSp, up } from '../shared/tier1.js';
import { summonDeck, holdBuff, tokenStat, summonTriggerArea } from '../shared/summoner.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { acquireTargets } from '../../../ai.js';
import { COLS, PROJECTILE_SPEEDS } from '../../../constants.js';

const S1 = 'skchr_ling_1';
const S2 = 'skchr_ling_2';
const S3 = 'skchr_ling_3';
export const SOUL1 = 'token_10020_ling_soul1';
export const SOUL2 = 'token_10020_ling_soul2';
export const SOUL3 = 'token_10020_ling_soul3';
const SOULS = Object.freeze([SOUL1, SOUL2, SOUL3]);
const SUM_Y = 'uniequip_002_ling';
/** skchr_ling_2 Recycle `_preDelay` 1.2 s: the recall of the summons below hp_ratio after the cast. */
export const RECYCLE_DELAY = 1.2;
/** S3's area around each summon (ling_s3[aoe] range_id x-5: its tile and the four next to it). */
const X5 = Object.freeze([[1, 0], [0, -1], [0, 0], [0, 1], [-1, 0]]);
const TAG_S2 = 'ling:s2';
const TAG_S3 = 'ling:s3';
/** S3's pulses: ground enemies only ("不可对空"). */
const GROUND = Object.freeze({ canHitFly: false });

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const skillOn = (u, id) => !!(u && u.skill && u.skill.active && u.skill.id === id);
const tileOf = (u) => u.tileR * COLS + u.tileC;

/** Her S1 / S3 acting on a summon (held from each skill start / end and each summon deployment). */
function syncSoul(battle, owner, t, { b1, b3 }) {
  if (!t.alive) return;
  holdBuff(battle, t, 'ling:s1:soul', skillOn(owner, S1), { atkPct: num(b1.atk), aspd: num(b1.attack_speed) });
  holdBuff(battle, t, 'ling:s3:soul', skillOn(owner, S3), { atkPct: num(b3.atk), defPct: num(b3.def) });
}

/** 弦惊 高级形态 (its skill blackboard "2.*"): stats, block, arts attacks, HP reset to the new maximum. */
function evolve(battle, t) {
  const tb = t.def.skill?.bb ?? {};
  battle.addBuff(t, {
    key: 'ling:soul3:advanced', tags: ['token'],
    mods: {
      hpPct: num(tb['2.max_hp']), atkPct: num(tb['2.atk']), defPct: num(tb['2.def']), resMul: 1 + num(tb['2.magic_resistance']),
      batPct: batMod(tb['2.base_attack_time'], { stats: t.def.stats }), blockCnt: num(tb['2.block_cnt']),
    },
  });
  t.mem.lingAdvanced = true;
  t.hp = t.s.maxHp;
  battle.fx('soul', { x: t.x, y: t.y, id: t.id });
}

/** The summons' kit: 禁疗, her skills' effects on them, S3's pulses, the 弦惊 merge. `owner` = 令. */
function soulKit(t, owner, opts) {
  return {
    skill: null,
    talents: [],
    trait: t.defId === SOUL3 ? { hitAllBlocked: true } : null,
    install(battle, s) {
      battle.addBuff(s, { key: 'ling:soul:abnormal', flags: { noHeal: true }, persist: true, allowDead: true });   // 持有禁疗
      battle.on('deploy', (c) => {
        if (c.unit !== s) return;
        s.mem.lingAdvanced = false;
        s.mem.lingAoeAt = null;
        syncSoul(battle, owner, s, opts);
        if (s.defId === SOUL3) merge(battle, owner, s);
      }, { owner: s });
      // S1: arts attacks; 高级形态: arts attacks
      battle.on('hit', (c) => {
        if (c.source !== s || !c.dmg || !c.dmg.isAttack || c.dmg.type === 'element') return;
        if (s.mem.lingAdvanced || skillOn(owner, S1)) c.dmg.type = 'arts';
      }, { owner: s, priority: 50 });
      // S3: every interval s from the moment it covers this summon, atk_scale × 令's ATK arts on the ground enemies of its x-5
      const iv = num(opts.b3.interval, 0.5);
      battle.on('tick', () => {
        if (!up(s) || !skillOn(owner, S3) || !(iv > 0)) { s.mem.lingAoeAt = null; return; }
        if (s.mem.lingAoeAt == null) { s.mem.lingAoeAt = battle.time + iv; return; }
        if (battle.time + 1e-9 < s.mem.lingAoeAt) return;
        s.mem.lingAoeAt += iv;
        const keys = absoluteRangeKeys(X5, s.tileR, s.tileC, s.dir, 0);
        for (const e of battle.enemiesInKeys(keys, s, GROUND)) {
          if (!e.alive) continue;
          battle.dealDamage(owner, e, { amount: owner.s.atk * num(opts.b3.atk_scale), type: 'arts', isSkill: true, isSplash: true, canDodge: false, tags: ['skill', TAG_S3] });
        }
      }, { owner: s });
    },
  };
}

/** The 弦惊 merge at the deployment of 弦惊 `t` (see the header). */
function merge(battle, owner, t) {
  const deck = owner.mem.summonDeck;
  if (!deck || !t.rangeKeySet) return;
  const mates = deck.standing().filter((o) => o !== t && o.defId === SOUL3 && !o.mem.lingAdvanced);
  const target = mates.find((o) => t.rangeKeySet.has(tileOf(o)));
  if (target) { evolve(battle, target); deck.withdraw(t, 'absorb'); return; }
  const holders = mates.filter((o) => o.rangeKeySet && o.rangeKeySet.has(tileOf(t)));
  if (!holders.length) return;
  const material = holders.reduce((a, b) => (b.deploySeq > a.deploySeq ? b : a));
  evolve(battle, t);
  deck.withdraw(material, 'absorb');
}

/** S2: a summon's synced strike — up to `n` enemies of its range, its skill's 2.atk_scale × ATK arts + 束缚 2.duration s. */
function syncedStrike(battle, t, { b2 }) {
  const tb = t.def.skill?.bb ?? {};
  const scale = num(tb['2.atk_scale'], num(b2.atk_scale, 1));
  const dur = num(tb['2.duration'], num(b2['ling_s2_unmovable.duration']));
  const n = Math.max(1, Math.floor(num(b2.value, 2)));
  const targets = acquireTargets(battle, t, { ...t.profile, maxTargets: n, allInRange: false });
  t.atkCd = t.s.interval;   // InterruptCharacterAttack (resetCD): its attack starts over
  const strike = (e) => {
    if (!e || !e.alive) return;
    battle.dealDamage(t, e, { amount: t.s.atk * scale, type: 'arts', isSkill: true, tags: ['skill', TAG_S2] });
    if (e.alive && dur > 0) battle.applyStatus(e, 'bind', { duration: dur, source: t });
  };
  for (const e of targets.slice(0, n)) {
    if (t.profile.attack === 'ranged') {
      battle.addProjectile({ from: t, target: e, speed: PROJECTILE_SPEEDS.bolt, visual: 'bolt', source: t, onHit: (c) => strike(c.target) });
    } else strike(e);
  }
}

export default {
  char_2023_ling: (bb, chess) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const s2 = skillRec(chess, S2);
    const t0 = talentBb({ talents: chess?.talentsBase ?? chess?.talents }, 0);   // 挑灯问梦: cnt
    const t1 = talentBb(chess, 1);                                               // 随付笺咏醉屠苏: sp, atk, max_stack_cnt
    const sumY = moduleOn(chess) && chess.module.id === SUM_Y ? Math.max(0, Math.floor(num(traitBb(chess).cnt))) : 0;
    const picked = chess?.skill?.skillId ?? null;
    const tokenId = skillRec(chess, picked)?.overrideTokenKey ?? null;
    const opts = { b1, b2, b3 };
    const gain = (unit, n) => unit.mem.summonDeck?.gain(n);
    return {
      skills: {
        [S1]: {
          kind: 'duration', mods: { atkPct: num(b1.atk), aspd: num(b1.attack_speed) },
          onStart({ unit }) { gain(unit, num(b1.cnt, 1)); },   // 技能开启时获得1个召唤物
        },
        [S2]: {
          kind: num(s2?.maxChargeTime, 1) > 1 ? 'charges' : 'instant',
          targeting: { maxTargets: Math.max(1, Math.floor(num(b2.value, 2))) },
          attack: {
            atkScale: num(b2.atk_scale, 1),
            onEachHit({ battle, unit, target, kind }) {
              const d = num(b2['ling_s2_unmovable.duration']);
              if (kind === 'main' && target && target.alive && d > 0) battle.applyStatus(target, 'bind', { duration: d, source: unit });
            },
          },
          onStart({ battle, unit }) {
            const deck = unit.mem.summonDeck;
            if (!deck) return;
            for (const t of deck.standing()) syncedStrike(battle, t, opts);
            // 技能结束时回收生命值低于一半的召唤物 (Recycle, 1.2 s after the cast)
            const hp = num(b2.hp_ratio, 0.5);
            battle.after(RECYCLE_DELAY, () => {
              if (!up(unit)) return;
              for (const t of deck.standing()) if (t.hpRatio < hp - 1e-9) deck.recall(t);
            }, { owner: unit });
          },
        },
        [S3]: {
          kind: 'duration', mods: { atkPct: num(b3.atk), defPct: num(b3.def) },
          onEnd({ unit, reason }) { if (reason !== 'death') gain(unit, num(b3.cnt, 1)); },   // 技能结束时获得1个召唤物
        },
      },
      talents: [
        { install(battle, unit) { // 挑灯问梦: the deck of her summon pieces and their kit
          const cnt = Math.max(0, Math.floor(num(t0.cnt)));
          const sp = num(t1.sp), atk = num(t1.atk), stacks = Math.max(1, Math.floor(num(t1.max_stack_cnt, 1)));
          summonDeck(battle, unit, {
            tokenIds: SOULS,
            charge: cnt,
            start: sumY,
            cap: num(tokenId ? tokenStat(battle, unit, tokenId, 'deckStack') : cnt, cnt),
            maxDeployed: num(tokenId ? tokenStat(battle, unit, tokenId, 'deployLimit') : 1, 1),
            kit: (t) => soulKit(t, unit, opts),
            // 随付笺咏醉屠苏: knocked out / absorbed / recalled ⇒ +sp SP and a stack of ATK +atk (not when they leave with her)
            onLeave(t, kind) {
              if (!(kind === 'killed' || kind === 'absorb' || kind === 'recall') || !up(unit)) return;
              if (sp > 0 && giveSp(unit, sp) > 0) battle.fx('spGain', { x: unit.x, y: unit.y, id: unit.id, n: sp });
              if (atk) battle.addBuff(unit, { key: 'ling:t2', mods: { atkPct: atk }, refresh: 'stack', maxStacks: stacks, tags: ['talent'] });
            },
          });
          const sync = (c) => {
            if (c.unit !== unit) return;
            for (const t of unit.mem.summonDeck.standing()) syncSoul(battle, unit, t, opts);
          };
          battle.on('skillStart', sync, { owner: unit });
          battle.on('skillEnd', sync, { owner: unit });
        } },
        // 随付笺咏醉屠苏 lives in the deck's onLeave above
      ],
      install(battle, unit) {
        // S3's cast: a ground enemy on a standing summon's x-5 too (the owner's larger-range rule, 2026-10-06)
        summonTriggerArea(battle, unit, S3, (t) => ({ keys: absoluteRangeKeys(X5, t.tileR, t.tileC, t.dir, 0), profile: GROUND }));
      },
    };
  },
};
