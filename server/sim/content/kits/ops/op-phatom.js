// server/sim/content/kits/ops/op-phatom.js — 傀影 (char_250_phatom) 自选 operator kit: 6★ 处决者 (特种), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait, his modules (EXE-X 克里斯汀小姐的毛毡, EXE-Y “如影随形”,
// ISW-A 傀影特限证章) at every form, and the kit of his summon 镜中虚影 (token_10007_phatom_twin). Kit contract and the 自选
// rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_250_phatom; the twin: tokens.token_10007_phatom_twin, variants by owner form with
// bySkill / byModule): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, the picked module at stage 1
// (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05. Full potential (the owner's decision of 2026-10-07). Sources:
// character_table / skill_table / battle_equip_table / token_table (zh_CN, as built into backups.json); PRTS 傀影 (镜中虚影
// 备注 "虚影再部署与拥有复数召唤物的干员相同，即“部署召唤物后立刻开始计算再部署时间，结束后可以部署下一个”"; 血色乐章 备注 "触发消耗
// 层数效果的行动节点为“成功造成伤害后”。若造成的伤害被伤判效果归零则不会消耗层数"; 夜幕突袭 备注 "不可对空"; EXE-X "撤退时返还大量
// (80%)该次部署费用"); PRTS 镜中虚影 (备注 "持有禁疗", "可以且优先攻击自身阻挡的单位", "退场时返还1个可部署的镜中虚影", "傀影退场时
// 强制撤退场上的镜中虚影"); PRTS 分支特性信息 处决者; the client's battle data — charpack char_250_phatom (Talents/1:
// charge_token[born] (RechargeToken on his deployment) + die_to_kill_token (KillTokens when he leaves), CommonAbilities
// KillTokens; modes S2 / S3), token prefab token_10007_phatom_twin (CommonAbilities: charge_token[finish] carrying abnormal
// flag 7 = 禁疗; Talents/2: phatom_twin_t, RESPAWN_TIME + respawn_time; the same modes), the skill
// prefabs skchr_phatom_1 / _2 / _3 and sktok_phatom_1 / _2 / _3 (S1: evade_physical + phatom_s_1[shield_physical] = a
// shield_physical of hp_ratio × max HP, both `duration`; S2: phatom_s_2 = `times` stacked phatom_s_2[atk] (ATK MULTIPLIER
// `atk`), one stack finished per ON_AFTER_OUTPUT_DAMAGE; S3: RandomCastAbility of the sluggish / stun / root attack
// abilities — one drawn per cast, each hitting every ground enemy of the x-4 with `atk_scale` physical, knockback[relative]
// (`force`) and its status), the equips phatom_equip_2_* (the EXE-Y trait: ATK while every allied unit of profession mask
// 639 — the eight operator professions, no summon — stands at Manhattan distance ≥ 2) / phatom_equip_2_2/3_p2 (the twin's
// hidden talent phatom_equip_token[atk] → phatom_equip_host[atk] on him) / phatom_equip_3_* (`_checkRoguelikeMode`: ISW-A
// is 集成战略-only); buff_template_data (die_to_kill_token, charge_token[born] / [finish], phatom_equip_token[host]).
// - Trait (处决者) "再部署时间大幅度减少": the data's respawnTime (16 s at full potential); melee physical, 1-1, blocks 1,
//   ground-only (data canHitFly false), attacks the enemies it blocks first (the engine's blocked-first rule); ground
//   enemies target him.
// - Module EXE-X: "撤退时返还大量该次部署费用" — no manual retreat in battle in this mode ⇒ no effect (as 砾's EXE-X); HP / ATK
//   in the stats; stage 2+ changes T2 (below). EXE-Y: "周围四格没有友方干员时攻击力+10%" (trait bb atk): ATK +atk while no
//   allied operator — summons and devices do not count (mask 639) — stands on the 4 tiles beside him (noOperatorBeside);
//   stage 2+ changes T1 (below); ATK / DEF in the stats. ISW-A: its trait ("在集成战略中，攻击时使自身和召唤物下次再部署时间减少
//   1秒") and talent ("在集成战略中，虚影不占用部署位，且部署虚影时自身再次释放技能") are 集成战略-only: N/A here, the trait
//   blackboard it carries is not used; ATK / ASPD in the stats.
// - T1 镜中虚影 "可以使用一个属性更强的虚影，虚影拥有和自己一样的技能，拥有独立的再部署时间": the twin is a hand piece the player
//   places (a talent summon: tokens `placeable`, not owner-range); it deploys with the board after the operators and fights
//   with its own stats (the variant of his form; EXE-Y stage 3: "属性进一步增强" = the byModule stats) as an executor (melee,
//   blocks 1, ground-only) holding 禁疗 (PRTS; the client's flag 7 — the data's `abnormal` lacks it [ASSUMED: given here, as
//   the 凯尔希 / 机械师 kits do for their summons]), its copy of his picked skill (bySkill sktok_phatom_1 / 2 / 3) running at
//   each of its own deployments. When he leaves the field (knocked out, withdrawn, forced out) it is withdrawn (PRTS "强制
//   撤退"; the client's KillTokens); a twin off the field comes back on its tile — paying its cost (5 DP) as a deployment,
//   the 卫戍 auto redeploy of a placed summon [ASSUMED, as 鸿雪's 打字机 / 凯尔希's Mon3tr] — once its redeploy time has
//   passed since its LAST DEPLOYMENT (PRTS 备注: the timer starts at the summon's deployment; the twin's charge_token[finish]
//   recharges it ON_FINISH) and only while he stands; his (re)deployment readies a waiting twin at once (his
//   charge_token[born]: RechargeToken with timing NORMAL — read the same way for every summoner, 凯尔希's Mon3tr included;
//   until 0.2.0 this kit let the twin's own timer run on). EXE-Y stage 2+ "本体和虚影同时在场时，攻击力各+10%": the twin's hidden module
//   talent `atk` — ATK +atk on both while both are on the field.
// - T2 虚影精通 "虚影的再部署时间-10秒" (EXE-X stage 3: −16): the twin's own talent respawn_time, added to its 45 s.
// - S1 暗夜魅影 (被动, at each deployment): physical dodge `prob` and a 屏障 of hp_ratio × max HP that absorbs physical damage
//   only (shieldType 'phys'), both for `duration` (10) s.
// - S2 血色乐章 (被动, at each deployment): `times` stacks of ATK +atk each (直接乘算, summed); each damage instance he deals
//   uses one, after it is dealt (a dodged or cancelled hit — invulnerable, 限伤 — uses none; a hit a barrier absorbs does);
//   the stacks go when he leaves the field.
// - S3 夜幕突袭 (被动, at each deployment, after the deploy-time buffs): every selectable ground enemy of the x-4 (PRTS "不可
//   对空") takes atk_scale × ATK physical skill damage, is pushed away from him radially with 力度 `force` (0 = 小力,
//   knockback[relative]: Battle.push) and gets the one status drawn for this cast — 停顿 / 晕眩 / 束缚 for its bb duration
//   (the client draws one of the three abilities per cast, so every enemy gets the same) [ASSUMED: the push and the status
//   land on a dodged hit too — the abilities' buffs are not damage-missable]. At the battle-start deployment no enemy is
//   on the field yet: it hits nothing (as Misery's 空间的归依).

import { num, traitBb, skillRec, toggleBuff, up } from '../shared/tier1.js';
import { absoluteRangeKeys } from '../../../targeting.js';

const S1 = 'skchr_phatom_1';
const S2 = 'skchr_phatom_2';
const S3 = 'skchr_phatom_3';
export const TWIN = 'token_10007_phatom_twin';
const TS1 = 'sktok_phatom_1';
const TS2 = 'sktok_phatom_2';
const TS3 = 'sktok_phatom_3';
/** 夜幕突袭's area when a record carries no grid: range x-4, his tile and the eight around it. */
const X4 = Object.freeze([[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]]);
/** The four tiles beside a unit (EXE-Y "周围四格"). */
const BESIDE = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);
/** 血色乐章's stack cap (buff_template_data phatom_s_2[atk] max_stack_cnt: the ISW-α stacking limit, never reached here). */
const OPUS_CAP = 80;
/** 夜幕突袭's statuses: the client's RandomCastAbility list (sluggish, stun, root) and the blackboard key of each duration. */
const RAID = Object.freeze([{ status: 'sluggish', key: 'sluggish' }, { status: 'stun', key: 'stun' }, { status: 'bind', key: 'root' }]);
/** How often a fallen twin tries to come back once its conditions may hold. */
const RETRY = 0.25;
const TAG_RAID = 'phatom:raid';

/** First talent of a normalised token def whose blackboard holds `key` (token talents keep no index). */
const tokTalentBb = (def, key) => (def?.talents ?? []).find((t) => t && t.bb && t.bb[key] != null)?.bb ?? {};
const isTwinOf = (t, owner) => !!t && t.kind === 'token' && t.defId === TWIN && t.ownerUnit === owner;
const twinsOf = (battle, owner) => battle.allyUnits.filter((t) => isTwinOf(t, owner));

/**
 * Module EXE-Y "周围四格没有友方干员" (the equip checker over profession mask 639 = the eight operator professions): no
 * allied operator — of any player of the field — stands on one of the 4 tiles beside `unit`; summons and devices do not
 * count. Shared with 弑君者's EXE-Y (op-crosly.js).
 */
export function noOperatorBeside(battle, unit) {
  for (const [dr, dc] of BESIDE) {
    const r = unit.tileR + dr, c = unit.tileC + dc;
    if (!battle.grid.inBounds(r, c)) continue;
    const o = battle.unitAt(r, c);
    if (o && o !== unit && o.side === 'ally' && o.kind === 'op') return false;
  }
  return true;
}

/** 暗夜魅影 / its copy at a deployment of `u`: physical dodge and a physical-only 屏障 of hp_ratio × its max HP. */
function nightPhantom(battle, u, b, key) {
  const dur = num(b.duration, 10), p = num(b.prob), sh = u.s.maxHp * num(b.hp_ratio);
  if (!(dur > 0)) return;
  if (p > 0) battle.addBuff(u, { key: `${key}:evade`, duration: dur, mods: { dodgePhys: p }, tags: ['skill'] });
  if (sh > 0) {
    battle.addBuff(u, { key: `${key}:shield`, duration: dur, shield: sh, shieldType: 'phys', tags: ['skill'] });
    battle.fx('shield', { x: u.x, y: u.y, id: u.id });
  }
}

/** 血色乐章 / its copy at a deployment of `u`: `times` stacks of ATK +atk. */
function bloodyOpus(battle, u, b, key) {
  const n = Math.floor(num(b.times)), a = num(b.atk);
  if (!(n > 0) || !a) return;
  battle.addBuff(u, { key, refresh: 'stack', stacks: n, maxStacks: Math.max(n, OPUS_CAP), mods: { atkPct: a }, tags: ['skill'] });
  battle.fx('buff', { x: u.x, y: u.y, id: u.id, kind: 'atk' });
}

/** 血色乐章: every damage instance `u` deals — after it is dealt — uses one stack of buff `key`. */
function installOpusUse(battle, u, key) {
  battle.on('damaged', (c) => {
    if (c.source !== u || c.type === 'element' || !c.target || c.target.side === u.side) return;
    const b = u.findBuff(key);
    if (!b) return;
    if (b.stacks > 1) { b.stacks -= 1; u.markDirty(); } else battle.removeBuff(u, b);
  }, { owner: u });
}

/** 夜幕突袭 / its copy at a deployment of `u` (record `rec`: its blackboard and x-4). */
function nightRaid(battle, u, rec) {
  const b = rec?.bb ?? {};
  const grid = Array.isArray(rec?.rangeGrid) && rec.rangeGrid.length ? rec.rangeGrid : X4;
  const foes = battle.enemiesInKeys(absoluteRangeKeys(grid, u.tileR, u.tileC, u.dir, 0), u, { canHitFly: false, groundOnly: true });
  const pick = RAID[battle.rng.int(RAID.length)];   // one ability per cast (RandomCastAbility)
  const dur = num(b[pick.key]), scale = num(b.atk_scale), force = num(b.force, 0);
  for (const e of foes) {
    if (!e.alive) continue;
    if (scale > 0) battle.dealDamage(u, e, { amount: u.s.atk * scale, type: 'phys', isSkill: true, tags: ['skill', TAG_RAID] });
    if (e.alive) battle.push(e, force, { from: u });
    if (e.alive && dur > 0) battle.applyStatus(e, pick.status, { duration: dur, source: u });
  }
  battle.fx('aoe', { x: u.x, y: u.y, radius: 1, id: u.id, skill: TAG_RAID });
}

/** The deploy-time part of skill record `rec` (his or the twin's copy) on `u`; `key` names its buffs. */
function deployEffect(battle, u, rec, key) {
  const id = rec?.skillId ?? rec?.id ?? null;
  if (id === S1 || id === TS1) nightPhantom(battle, u, rec.bb ?? {}, key);
  else if (id === S2 || id === TS2) bloodyOpus(battle, u, rec.bb ?? {}, key);
  else if (id === S3 || id === TS3) nightRaid(battle, u, rec);
}

/**
 * The twin's kit (`owner` = 傀影): 禁疗, its skill copy at each of its deployments, EXE-Y stage 2+'s shared ATK, and its own
 * redeploys (withdrawn with him; back on its tile once its timer has run from its last deployment, he stands and the DP is
 * there).
 */
function twinKit(t, owner) {
  const rec = t.def?.skill ?? null;
  const key = 'phatom:twin:skill';
  const cut = num(tokTalentBb(t.def, 'respawn_time').respawn_time);   // 虚影精通 (−10; EXE-X stage 3: −16)
  const both = num(tokTalentBb(t.def, 'atk').atk);                    // EXE-Y stage 2+: 本体和虚影同时在场时
  return {
    skill: { kind: 'passive' },
    install(battle, unit) {
      battle.addBuff(unit, { key: 'phatom:twin:abnormal', flags: { noHeal: true }, persist: true, allowDead: true });   // 持有禁疗
      if (rec?.id === TS2) installOpusUse(battle, unit, key);
      battle.on('deploy', (c) => {
        if (c.unit !== unit || c.move || !up(unit)) return;
        unit.mem.twinReadyAt = battle.time + Math.max(0, num(unit.base.respawnTime) + cut);   // timer from its deployment
        deployEffect(battle, unit, rec ? { ...rec, skillId: rec.id } : null, key);
      }, { owner: unit, priority: -10 });
      if (both > 0) toggleBuff(battle, unit, 'module:phatom:both', () => up(owner), { atkPct: both });
      battle.on('death', (c) => {
        if (c.unit !== unit || battle.finished) return;
        unit.removed = false; // the piece stays (Battle.redeploy accepts it; its hooks are kept)
        if (unit.mem.twinRetry) return;
        unit.mem.twinRetry = battle.every(RETRY, (b, sched) => {
          const stop = () => { sched.cancel(); unit.mem.twinRetry = null; };
          if (unit.alive || unit.removed || b.finished) { stop(); return; }
          if (!up(owner) || b.time + 1e-9 < num(unit.mem.twinReadyAt, 0)) return;
          if (b.redeploy(unit, { free: false })) stop();
        }, { owner: unit });
      }, { owner: unit, priority: -10 });
    },
  };
}

export default {
  char_250_phatom: (bb, chess) => {
    const lonelyAtk = num(traitBb(chess).atk);   // EXE-Y trait (EXE-X: withdraw_cost_recover_ratio, ISW-A: 集成战略-only)
    const t0desc = String((chess?.talents ?? []).find((t) => t && t.index === 0)?.desc ?? '');
    const recOf = (id) => skillRec(chess, id);
    return {
      skills: {
        [S1]: { kind: 'passive' },
        [S2]: { kind: 'passive' },
        [S3]: { kind: 'passive' },
      },
      talents: [
        { install(battle, unit) { // 镜中虚影: his twin pieces run the twin's kit; withdrawn when he leaves; EXE-Y stage 2+: both +ATK
          for (const t of twinsOf(battle, unit)) {
            if (t.alive || t.deployed) continue;
            if (t.kit) battle.offOwner(t); // a piece set up before him: drop its generic kit's hooks
            battle._setupUnit(t, twinKit(t, unit));
          }
          battle.on('death', (c) => {
            if (c.unit !== unit) return;
            // "傀影退场时强制撤退场上的镜中虚影" (KillTokens): a withdrawal, not a knock-out
            for (const t of twinsOf(battle, unit)) if (t.alive) battle.retreat(t, { reason: 'retreat' });
          }, { owner: unit });
          // charge_token[born] (RechargeToken, timing NORMAL): his (re)deployment readies a waiting twin at once — the
          // twin's own timer is the ON_FINISH recharge of its charge_token[finish] (as every summoner kit reads it)
          // [ASSUMED: NORMAL = usable now, from the enum and the first deployment]
          battle.on('deploy', (c) => {
            if (c.unit !== unit || c.move) return;
            for (const t of twinsOf(battle, unit)) if (!t.alive && !t.removed) t.mem.twinReadyAt = battle.time;
          }, { owner: unit });
          // 本体和虚影同时在场时，攻击力各+N%: the twin's hidden module talent (his text when no twin def resolves)
          const both = num(tokTalentBb(battle.tokenDef(TWIN, unit), 'atk').atk, /本体和虚影同时在场时/.test(t0desc)
            ? num(+(/攻击力各\+(\d+)%/.exec(t0desc)?.[1]) / 100) : 0);
          if (both > 0) toggleBuff(battle, unit, 'module:phatom:both', () => twinsOf(battle, unit).some(up), { atkPct: both });
        } },
        // 虚影精通 is the twin's own talent (its redeploy time): twinKit
      ],
      install(battle, unit) {
        // the picked skill's deploy-time effects (S1 dodge + barrier, S2 stacks, S3 burst), after the deploy-time buffs
        const rec = recOf(chess?.skill?.skillId);
        if (rec?.skillId === S2) installOpusUse(battle, unit, 'phatom:skill');
        battle.on('deploy', (c) => {
          if (c.unit !== unit || c.move || !up(unit)) return;
          deployEffect(battle, unit, rec, 'phatom:skill');
        }, { owner: unit, priority: -10 });
        // EXE-Y "周围四格没有友方干员时攻击力+10%"
        if (lonelyAtk > 0) toggleBuff(battle, unit, 'trait:phatom:lonely', () => noOperatorBeside(battle, unit), { atkPct: lonelyAtk });
      },
    };
  },
};
