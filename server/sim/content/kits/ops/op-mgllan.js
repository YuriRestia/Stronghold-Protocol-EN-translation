// server/sim/content/kits/ops/op-mgllan.js — 麦哲伦 (char_248_mgllan) 自选 operator kit: 6★ 召唤师 (辅助), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait and both modules (SUM-X 专业无人机操作模块, SUM-Y
// 教学用龙腾无人机) at every form, and the kits of her drones 龙腾.F / 龙腾.L / 龙腾.A (token_10005_mgllan_drone1 / 2 / 3).
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)"); the summon deck: ../shared/summoner.js.
//
// Forms (data/backups.json units.char_248_mgllan): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7,
// the picked module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05. Full potential (the owner's
// decision of 2026-10-07). Sources: character_table / skill_table / battle_equip_table / the tokens' character_table rows (zh_CN, as built
// into backups.json); PRTS 麦哲伦 (光学折射配件 备注 "无人机实际获得隐匿（异常效果）而非隐匿"; S1 / S2 / S3 备注 "技能结束时的回收
// 仅是触发召唤物的技能，技能无法触发的场合不会产生效果"; S3 备注 "主动开启时，无人机攻击的爆炸半径从0.75增加至1.25"; SUM-Y 特性
// "※龙腾.F：部署费用-1；龙腾.L、龙腾.A：部署费用-3", stage 3 "※龙腾.F：生命上限+100，防御+50 / 龙腾.L：攻击+40，攻击速度+3 /
// 龙腾.A：攻击+50，攻击速度+3"); PRTS 龙腾.F / 龙腾.L / 龙腾.A (备注 "持有禁疗"; 龙腾.A "普通攻击的爆炸范围半径0.75，可对空");
// PRTS 分支特性信息 召唤师 ("可对空", "干员离场后，附属的召唤物随之消失"); the client's battle data (charpack char_248_mgllan:
// Talents/1 charge_token[born], CommonAbilities die_to_kill_token, Modes S1_Default / S1 with the S1[Passive] / S1[Active]
// buffs; buff_template_data mgllan_s_1[passive] / [active] and mgllan_s_1_token[passive] / [active] (CreateBuffInRange on her
// attack range and, through CreateBuffToToken, each drone's: the DB `sluggish` / mgllan_frozen UNMOVABLE), mgllan_drone_t
// (INVISIBLE for hidden_duration at the drone's deployment), mgllan_drone_s[finish] (RechargeToken + Withdraw
// `_switchToDeadState`); skill prefabs skchr_mgllan_1 / 2 / 3 (`_buffs` = the drones' mode + bonus, `_passiveBuffs` = hers,
// mgllan_s[after] trigger_token_skill); equips mgllan_equip_1_* (free_summon: 部署位 only), mgllan_equip_1_2/3_p2
// (mgllan_drone_e_hidden INVISIBLE for e_hidden_duration on her inside a drone's x-5, `_removeBuffWhenTargetLeave`),
// mgllan_equip_2_* (trigger_charge_token: the trait's cnt)).
// - Trait (召唤师) "攻击造成法术伤害 / 可以使用召唤物协助作战": the profession default (ranged arts on her 3-1, hits air units —
//   PRTS "可对空"), blocks 1, ground enemies target her. Her drones leave the field with her (shared/summoner.js).
// - T1 支援无人机·龙腾 "可以使用5个不阻挡敌人的无人机（最多同时部署3个），功能随技能选择而改变": the drone of her pick's skill
//   (龙腾.F / .L / .A — the skills' overrideTokenKey) is the hand piece the player places; the deck of ../shared/summoner.js
//   with charge = cnt (5) at each of her deployments, cap = the drone record's deckStack (5: its hidden talent's
//   max_deck_stack_cnt, tools/build-data.mjs tokenTalentDeckBonus; SUM-Y +3), at most its deployLimit standing (3 = 1 + the
//   talent's max_deploy_count 2; SUM-Y stage 2+: 4) — the hand count too. Every drone holds 禁疗
//   (PRTS; the data's `abnormal` lacks it [ASSUMED: given here]), blocks nothing, has no skill of its own here (its 回收 is
//   her skills' end, below). 龙腾.F (ATK 0) makes no attack (the engine's rule for a 0-ATK summon; a commented-out PRTS
//   note "缴械，普通攻击不造成伤害" agrees [ASSUMED]); 龙腾.L strikes one ground enemy on its own tile for arts damage; 龙腾.A
//   fires physical shells that blow up within BLAST (0.75) of their target, air units too.
// - T2 光学折射配件 "无人机在部署后的20秒内处于隐匿状态" (full potential: 22 s): each drone holds 隐匿 (the anomaly — flag
//   `stealth`: only an enemy it blocks could target it, enemy areas skip it) for its token talent's hidden_duration from each
//   deployment. SUM-X stage 2+ "26秒…若麦哲伦在其周围四格则享受相同效果": the drones' 28 s at full potential (the module
//   variant), and she holds 隐匿 while she stands on the x-5 of a drone still inside its e_hidden_duration window [ASSUMED:
//   the window of that drone's deployment — the equip aura's buff lasts e_hidden_duration and drops when she leaves the x-5].
// - S1 高效制冷模块 (MANUAL, data DEFAULT, 15 s): passive (while S1 is picked and not running) every attack@interval (3) s from
//   her deployment / the skill's end, every enemy (air units too) on her attack range and on each of her standing drones'
//   ranges (龙腾.F: x-4) takes 停顿 attack@sluggish s; while it runs, every 3 s from the cast, 束缚 attack@frozen_duration s
//   instead. It acts while she is stunned or silenced (the buff is neither — isStunnable / isSilenceable 0). Its cast:
//   the data's DEFAULT, and — the owner's larger-range rule of 2026-10-06 (its 束缚 acts through the drones' ranges) —
//   also an enemy (air units too) on a standing drone's range (shared/summoner.js summonTriggerArea, checked every tick).
// - S2 激光开采模块 (MANUAL, data DEFAULT, 15 s): she and her drones ASPD +attack_speed; a 龙腾.L strikes every enemy on its tile
//   (群体) while it runs. S3 武装打击模块 (MANUAL, data DEFAULT, 15 s): she and her drones ATK +atk; 龙腾.A's blast radius
//   BLAST_S3 (1.25). Passive parts ("无人机可以部署在近战位 / 远程位"): placement — the piece's position, nothing in battle.
// - Every skill's end (the normal end, not her leaving: the drones go with her then) recalls every standing drone that can
//   still trigger its own skill (not stunned / frozen / asleep, not silenced — PRTS "技能无法触发的场合不会产生效果"
//   [ASSUMED: those]): +1 held each, the drone leaves and comes back on its tile its redeploy time (10 s) later as any piece.
// - Module SUM-X 专业无人机操作模块: trait "首个召唤物部署时不消耗部署位" — 部署位 are the prep's deploy cap, which summon pieces
//   never use in this mode (server/match deployCount counts chess only): N/A; stage 2+ is T2's change above; stats.
//   SUM-Y 教学用龙腾无人机: trait "召唤物持有上限+3，召唤物部署费用减少" — +3 held on the card at the battle start, cap +3, the
//   drones' lower costs (the module variant); stage 2+ T1 "最多同时部署4个", stage 3 "属性更强的" (the module variant's stats).

import { num, talentBb, traitBb, moduleOn, skillRec, up } from '../shared/tier1.js';
import { summonDeck, holdBuff, tokenStat, summonTriggerArea } from '../shared/summoner.js';
import { absoluteRangeKeys } from '../../../targeting.js';
import { COLS } from '../../../constants.js';

/** S1's selection on her range and her drones' (air units too). */
const ANY = Object.freeze({ canHitFly: true });
const S1 = 'skchr_mgllan_1';
const S2 = 'skchr_mgllan_2';
const S3 = 'skchr_mgllan_3';
export const DRONE_F = 'token_10005_mgllan_drone1';
export const DRONE_L = 'token_10005_mgllan_drone2';
export const DRONE_A = 'token_10005_mgllan_drone3';
const DRONES = Object.freeze([DRONE_F, DRONE_L, DRONE_A]);
const SUM_Y = 'uniequip_003_mgllan';
/** PRTS 龙腾.A 备注 "普通攻击的爆炸范围半径0.75"; S3 备注 "主动开启时，无人机攻击的爆炸半径从0.75增加至1.25". */
export const BLAST = 0.75;
export const BLAST_S3 = 1.25;
/** 光学折射配件 at E2 when the drone def lacks its hidden_duration (PRTS: 20 s). */
const HIDDEN_FALLBACK = 20;

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const skillOn = (u, id) => !!(u && u.skill && u.skill.active && u.skill.id === id);
/** First talent of a normalised token def holding `key` (token talents keep no index). */
const tokTalent = (def, key) => (def?.talents ?? []).find((t) => t && t.bb && t.bb[key] != null) ?? null;

/** Her skills acting on a drone (held from each skill start / end and each drone deployment). */
function syncDrone(battle, owner, t, { b2, b3 }) {
  if (!t.alive) return;
  const s2 = skillOn(owner, S2), s3 = skillOn(owner, S3);
  holdBuff(battle, t, 'mgllan:s2:drone', s2, { aspd: num(b2.attack_speed) });
  holdBuff(battle, t, 'mgllan:s3:drone', s3, { atkPct: num(b3.atk) });
  if (t.defId === DRONE_A) t.profile.splashRadius = s3 ? BLAST_S3 : BLAST;
}

/** The drones' kit: 禁疗, 光学折射配件's 隐匿 window, her skills' modes (龙腾.L 群体, 龙腾.A blast). `owner` = 麦哲伦. */
function droneKit(t, owner, opts) {
  return {
    skill: null,
    talents: [],
    trait: t.defId === DRONE_A ? { splashRadius: BLAST, splashScale: 1 } : null,
    install(battle, d) {
      battle.addBuff(d, { key: 'mgllan:drone:abnormal', flags: { noHeal: true }, persist: true, allowDead: true });   // 持有禁疗
      const hidden = num(tokTalent(d.def, 'hidden_duration')?.bb?.hidden_duration, HIDDEN_FALLBACK);
      battle.on('deploy', (c) => {
        if (c.unit !== d) return;
        if (hidden > 0) {
          battle.addBuff(d, { key: 'mgllan:drone:hidden', flags: { stealth: true }, duration: hidden, status: 'stealth', tags: ['talent'] });
          battle.fx('stealth', { x: d.x, y: d.y, id: d.id });
        }
        syncDrone(battle, owner, d, opts);
      }, { owner: d });
      // S2: a 龙腾.L strikes every enemy on its tile
      if (d.defId === DRONE_L) {
        battle.on('beforeAttack', (c) => {
          if (c.attacker !== d || !skillOn(owner, S2)) return;
          const all = battle.enemiesInKeys(d.rangeKeys, d, c.profile);
          if (all.length) c.targets = all;
        }, { owner: d });
      }
    },
  };
}

export default {
  char_248_mgllan: (bb, chess) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const t0 = talentBb({ talents: chess?.talentsBase ?? chess?.talents }, 0);   // 支援无人机·龙腾: cnt
    const sumY = moduleOn(chess) && chess.module.id === SUM_Y ? Math.max(0, Math.floor(num(traitBb(chess).cnt))) : 0;
    const picked = chess?.skill?.skillId ?? null;
    const tokenId = skillRec(chess, picked)?.overrideTokenKey ?? null;
    const opts = { b2, b3 };
    /** 技能结束时回收所有无人机 (her normal end; the drones that cannot trigger their skill stay). */
    const recall = ({ unit, reason }) => {
      if (reason === 'death') return;
      const deck = unit.mem.summonDeck;
      if (!deck) return;
      for (const d of deck.standing()) if (d.canAct && !d.s.flags.silence) deck.recall(d);
    };
    return {
      skills: {
        [S1]: { kind: 'duration', onEnd: recall },
        [S2]: { kind: 'duration', mods: { aspd: num(b2.attack_speed) }, onEnd: recall },
        [S3]: { kind: 'duration', mods: { atkPct: num(b3.atk) }, onEnd: recall },
      },
      talents: [
        { install(battle, unit) { // 支援无人机·龙腾: the deck of her drone pieces and their kit
          const cnt = Math.max(0, Math.floor(num(t0.cnt)));
          summonDeck(battle, unit, {
            tokenIds: DRONES,
            charge: cnt,
            start: sumY,
            cap: num(tokenId ? tokenStat(battle, unit, tokenId, 'deckStack') : cnt, cnt),
            maxDeployed: num(tokenId ? tokenStat(battle, unit, tokenId, 'deployLimit') : 1, 1),
            kit: (t) => droneKit(t, unit, opts),
          });
          // her skills on the standing drones: at each start / end (a drone deployed meanwhile syncs itself)
          const sync = (c) => {
            if (c.unit !== unit) return;
            for (const d of unit.mem.summonDeck.standing()) syncDrone(battle, unit, d, opts);
          };
          battle.on('skillStart', sync, { owner: unit });
          battle.on('skillEnd', sync, { owner: unit });
        } },
        { install(battle, unit) { // 光学折射配件 (the drones' 隐匿: their kit); SUM-X stage 2+: hers beside a hidden drone
          const tdef = tokenId ? battle.tokenDef(tokenId, unit) : null;
          const et = tokTalent(tdef, 'e_hidden_duration');
          const dur = num(et?.bb?.e_hidden_duration);
          if (!(dur > 0)) return;
          const grid = et.rangeGrid?.length ? et.rangeGrid : [[1, 0], [0, -1], [0, 0], [0, 1], [-1, 0]];
          battle.on('tick', () => {
            const deck = unit.mem.summonDeck;
            const want = up(unit) && !!deck && deck.standing().some((d) => battle.time < d.deployedAt + dur - 1e-9
              && absoluteRangeKeys(grid, d.tileR, d.tileC, d.dir, 0).includes(unit.tileR * COLS + unit.tileC));
            const has = unit.findBuff('mgllan:eHidden');
            if (want && !has) battle.addBuff(unit, { key: 'mgllan:eHidden', flags: { stealth: true }, status: 'stealth', tags: ['module'] });
            else if (!want && has) battle.removeBuff(unit, 'mgllan:eHidden');
          }, { owner: unit });
        } },
      ],
      install(battle, unit) {
        // S1 高效制冷模块: every attack@interval s, 停顿 (passive) / 束缚 (running) on her range and her drones' ranges
        if (picked !== S1) return;
        // its cast: an enemy on a standing drone's range too (the owner's larger-range rule, 2026-10-06)
        summonTriggerArea(battle, unit, S1, (d) => ({ keys: d.rangeKeys, profile: ANY }));
        const iv = num(b1['attack@interval'], 3);
        if (!(iv > 0)) return;
        const restart = (c) => { if (c.unit === unit) unit.mem.mgllanPulseAt = battle.time + iv; };
        battle.on('deploy', restart, { owner: unit });
        battle.on('skillStart', restart, { owner: unit });
        battle.on('skillEnd', restart, { owner: unit });
        battle.on('tick', () => {
          if (!up(unit) || !(battle.time + 1e-9 >= (unit.mem.mgllanPulseAt ?? Infinity))) return;
          unit.mem.mgllanPulseAt += iv;
          const active = skillOn(unit, S1);
          const key = active ? 'bind' : 'sluggish';
          const duration = num(active ? b1['attack@frozen_duration'] : b1['attack@sluggish']);
          if (!(duration > 0)) return;
          const done = new Set();
          for (const src of [unit, ...(unit.mem.summonDeck?.standing() ?? [])]) {
            for (const e of battle.enemiesInKeys(src.rangeKeys, src, ANY)) {
              if (done.has(e)) continue;
              done.add(e);
              battle.applyStatus(e, key, { duration, source: src });
            }
          }
          battle.fx('coldWind', { x: unit.x, y: unit.y, id: unit.id, n: done.size });
        }, { owner: unit });
      },
    };
  },
};
