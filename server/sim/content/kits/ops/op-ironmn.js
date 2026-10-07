// server/sim/content/kits/ops/op-ironmn.js — 白铁 (char_4072_ironmn) 自选 operator kit: 6★ 工匠 (辅助), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots; every skill, both talents, the trait, both modules (CRA-X 铁钳号·爬行者, CRA-Y 海布里印记)
// at every form, and the kits of his three <支援装置>: 白铁™多功能平台 (token_10027_ironmn_pile1, 极致火力 / pile2, 高效补给)
// and 铁钳号·原型机 (token_10027_ironmn_pile3). Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_4072_ironmn): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7, the
// picked module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05. Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table / the token rows (zh_CN, as built into backups.json), PRTS
// 白铁 (S1 / S2 备注 "支援装置的效果可叠加", S2 "携带该技能时，支援装置每秒流失最大生命值0.4%的生命值", S3 "此时的支援装置为敌对
// 阵营的召唤物单位"; 节约经费 "手动撤回白铁周围8格的装置也可以触发本天赋"; the module pages: CRA-X 白铁™多功能平台 −1 / 铁钳号 −4
// 部署费用, CRA-Y −5 s / −10 s 再部署时间), PRTS 白铁™多功能平台 / 铁钳号·原型机 (备注: 持有禁疗、无敌 / "该召唤物阵营为敌方…提供
// 我方视野", 禁疗 孤立 不可阻挡 失衡免疫 元素免疫, 晕眩 寒冷 冻结 浮空 束缚 沉默 沉睡免疫, "受到伤害时取消此伤害，若该伤害来源为非
// 无职业的辅助职业的工匠单位，治疗自身相当于最大生命值1%的生命值"; 团结的力量 "实际范围为自身及身后一格…多个支援装置的天赋效果可
// 叠加"; skill "伤害半径1.1，造成物理普通伤害…可对空", "仅能选择不持有不可选中/隐匿/无敌的敌方单位（无视孤立）"), PRTS 分支特性信息
// 工匠 ("干员部署后，按天赋描述数量补充支援装置持有数", "干员离场后，附属的支援装置随之消失"), PRTS 卫戍协议/帮助 (§战斗部署 a hand
// summon comes in its deploy-limit count; §作战阶段 "所有手动部署的召唤物…作战开始时立即部署一次", "若战场区初始部署有召唤物，若召唤
// 物在战斗期间退场，将在满足条件后立即原地再部署1个"), and the client's battle data read from the local install — charpack
// char_4072_ironmn (ironmn_t_1 charge_token[born]; ironmn_t_2 on his own tokens of his x-4: ON_OWNER_FINISH ⇒ Dice(prob) ⇒
// RechargeToken(cnt); ironmn_c die_to_kill_token), the token prefabs pile1 / 2 / 3 (talent auras on ally operators —
// professionMask 639 — of the device range, `disableOverride` = one buff per device; pile2 modify_sp[trigger] + the
// ironmn_pile_bleed timer of 1 s; pile3: Trait ironmn_pile3_trait, 团结的力量 damage_resistance[phy] on targetSide 2 = our
// operators of its b-1, `ignoreTargetFree`), the skill prefabs (skchr_ironmn_1 / 2 / 3: devices to their skill mode,
// RechargeToken at S1 start / S2 end / S3 start, KillTokens at S1 end; sktok_ironmn_pile3: one target (`_maxTarget` 1),
// projectile_chr_ironmn_pile3 at 10 tiles/s, `_exceptTraceTarget` splash, the bleed on the cast event), the equip prefabs
// (CRA-X: trigger_charge_token +cnt at each deployment, stage 2+ ironmn_e_002[sp_recover] on the device's x-4; CRA-Y stage
// 2+: ironmn_e_003_t[attr] ATTACK_SPEED on the device talent's targets, its own buff per device) and buff_template_data
// (ironmn_s_1 / 2 / 3, ironmn_t_2, ironmn_pile_bleed / pile3_bleed: PURE DamageViaMaxHpRatio `_skipModifierEvent` — a 流失 —,
// ironmn_pile3_s[main] / [splash]: PHYSICAL AdvancedApplyDamage on the host's ATK, attackType NORMAL, charge_token[born],
// trigger_charge_token, die_to_kill_token).
//
// - Trait (工匠) "能够阻挡两个敌人，使用<支援装置>协助作战": melee physical (professions.js craftsman), 1-1, blocks 2, ground only;
//   the enemies he blocks are always his targets (Battle.blockedTargets, PRTS 分支特性信息 "可以且优先攻击自身阻挡的单位").
// - <支援装置> = the hand pieces of the picked skill's device (data `overrideTokenKey`: S1 pile1, S2 pile2, S3 pile3 — the
//   variant `sources`, server/match/player/diy.js placeableTokens). Every placed piece deploys with the board at the battle
//   start for free (the mode's rule). His 持有 (stock) is cnt (T1, 3) + CRA-X's trait cnt (1) after each of his deployments
//   (charge_token[born] + trigger_charge_token), capped there (持有上限). A device that leaves the field comes back on its own
//   tile — after its redeploy time (data respawnTime, CRA-Y less), paying its cost (data, CRA-X less) and spending one of the
//   stock — while he stands; when he leaves, his devices go with him (die_to_kill_token) and come back the same way after his
//   return (stock refilled). The devices never attack, block nobody, are 禁疗; 白铁™多功能平台 is untargetable and invulnerable
//   ("不会受到攻击"; PRTS 持有无敌).
// - T1 战地工程师 "可以携带3个<支援装置>(最多可部署2个)": the stock above; the 2 deployable are the hand pieces. CRA-Y stage 2+
//   "自身装置天赋生效的干员攻击速度+6（此效果不受技能影响）": every operator a device's talent reaches ASPD +attack_speed (the
//   token's module talent; one per device), never scaled by S1.
// - T2 节约经费 "当白铁周围8格的自身装置损毁时，有70%的几率回收使白铁额外获得1个装置" (full potential: 80%): a device of his
//   leaving the field (killed, destroyed by S1, withdrawn) while on his x-4 (talent range) ⇒ prob ⇒ stock +cnt (capped) — not when
//   he leaves himself (his talents go first). CRA-X stage 2+ adds "当白铁周围8格存在自身装置时技力回复速度+0.2/秒" (the token's
//   module talent sp_recovery_per_sec; one effect however many devices — the client's ironmn_e_002[sp_recover], one buff key) and
//   prob 0.9 (full potential: 1).
// - Module CRA-X “铁钳号·爬行者” "<支援装置>的持有上限+1且部署费用减少": the stock +1 (trait cnt) and the device costs of the data
//   (2 / 2 / 6). CRA-Y “海布里印记” "<支援装置>的再部署时间减少": the data's respawn times (5 / 5 / 10 s).
// - 白铁™多功能平台 (S1): "使攻击范围内一名友方干员的攻击力+12%" — every operator on its range (1-1: its tile and the one it
//   faces) ATK +atk (Σpct); while 白铁's S1 runs ×talent_scale (2.5 / 3: "装置效果提升至…倍").
// - 白铁™多功能平台 (S2): "使攻击范围内一名友方干员每3.5秒额外获得1点技力，每秒流失0.4%生命" — every operator on its range gets 1
//   SP each `default.interval` s it stays there (the first one interval after it came; none while its skill runs — AK: no SP
//   during a skill); the device loses hp_ratio of its max HP every second (a 流失: invulnerable as it is, it runs out). While
//   白铁's S2 runs: s2.interval s and s2.hp_ratio (both timers restart when the mode changes, as the client re-creates the
//   buffs on its mode switch).
// - 铁钳号·原型机 (S3), an enemy-camp summon: our attacks select it like an enemy, after every real one (嘲讽等级 −2;
//   Battle.setAllyTarget — the engine extension of this kit), enemies never (untargetable); every damage it takes is cancelled
//   and gives it 1 SP (受击回复), and +hp_ratio of its max HP when the source is a 工匠 operator (trait, ignores 禁疗). 团结的力
//   量: the operator on its b-1 (its tile and the one behind it) takes physical damage ×(1 − damage_resistance) — one effect per
//   device. Its skill (AUTO, 5 SP, data DEFAULT — it never attacks, so the engine checks it every tick: an enemy, flyers too, in
//   its 3-13): it loses hp_ratio of its max HP (流失), and a projectile (10 tiles/s) to the first enemy of its range deals
//   白铁's ATK (at the cast) × atk_scale physical to it and × atk_scale_2 to the other enemies within 1.1 of it (中点判定;
//   not that one: `_exceptTraceTarget`), 普通伤害, air units too. Immune to the control statuses PRTS lists, never displaced.
// - S1 极致火力 (MANUAL, data DEFAULT): 16 / 17 s, every attack attack@atk_scale × ATK; +1 stock at the start; at its end every
//   device of his on the field is destroyed (KillTokens — T2 may recover them).
// - S2 高效补给 (MANUAL, DEFAULT): 30 s, ATK +atk, DEF +def, every enemy he blocks at once (hitAllBlocked); +1 stock at its end.
// - S3 铁钳号·原型机 (MANUAL, DEFAULT): 30 s, ATK +atk, ASPD +attack_speed; +1 stock at the start.
// [ASSUMED] the stock refilled by +cnt on each deployment, capped at cnt + the CRA-X +1; a RechargeToken beyond the cap is lost;
// the crab charges only from the attacks that select it (an ally's area skill that picks enemies does not see it); summons
// attack it too. The hand count of his devices is the data's deployLimit 2 (the attribute frame's 1 + the token's hidden talent
// max_deploy_count 1 — E2 "最多可部署2个"; tools/build-data.mjs tokenTalentDeckBonus, 0.2.0).

import { num, talentBb, talentGrid, traitBb, skillRec, up, giveSp } from '../shared/tier1.js';
import { absoluteRangeKeys, sortEnemyTargets } from '../../../targeting.js';
import { COLS } from '../../../constants.js';
import { frontOf } from '../../../dir.js';

const S1 = 'skchr_ironmn_1';
const S2 = 'skchr_ironmn_2';
const S3 = 'skchr_ironmn_3';
export const PILE1 = 'token_10027_ironmn_pile1';
export const PILE2 = 'token_10027_ironmn_pile2';
export const CRAB = 'token_10027_ironmn_pile3';
const DEVICES = new Set([PILE1, PILE2, CRAB]);
/** 节约经费's range when the data carries none: his tile and the 8 around it (x-4). */
const X4 = Object.freeze([[1, -1], [1, 0], [1, 1], [0, -1], [0, 0], [0, 1], [-1, -1], [-1, 0], [-1, 1]]);
/** A device's 1-1 when its def carries none: its tile and the one it faces. */
const FRONT1 = Object.freeze([[0, 0], [0, 1]]);
/** 铁钳号·原型机's skill: PRTS 备注 "伤害半径1.1"; projectile_chr_ironmn_pile3 `_speed` 10. */
const CRAB_SPLASH = 1.1;
const CRAB_SPEED = 10;
/** Statuses 铁钳号·原型机 is immune to (PRTS 备注: 晕眩 寒冷 冻结 浮空 束缚 沉默 沉睡免疫). */
const CRAB_IMMUNE = new Set(['stun', 'cold', 'freeze', 'levitate', 'bind', 'silence', 'sleep']);
/** Seconds between two tries of a device waiting to come back (timer, stock, DP, tile). */
const RETRY = 0.25;

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
/** First talent of a normalised token def holding `key` (token talents keep no index). */
const tokTalent = (def, key) => (def?.talents ?? []).find((t) => t && t.bb && t.bb[key] != null) ?? null;
const tokBb = (def, key) => tokTalent(def, key)?.bb ?? {};
/** An operator of our side a device's talent may reach (professionMask 639: operators, not summons). */
const isOp = (a) => !!a && a.kind === 'op' && a.side === 'ally';
/**
 * A 工匠's <支援装置> state for the battle: `stock` (持有), `cap` (持有上限), `devices` (its pieces). Shared with 娜斯提
 * (op-nasti.js).
 */
export const deviceState = (unit) => unit.mem.craftsman ?? (unit.mem.craftsman = { stock: 0, cap: 0, devices: new Set() });
/** The owner's devices standing on the field. */
export const devicesUp = (unit) => [...deviceState(unit).devices].filter((d) => up(d));
/** Stock +n, capped at the 持有上限 (RechargeToken). */
export function rechargeDevices(unit, n) {
  const st = deviceState(unit);
  st.stock = Math.min(st.cap, st.stock + Math.max(0, n));
}

/**
 * Keep buff `key` (one per device: `disableOverride`) on every operator `select` returns, exactly while it does; `mods(a)`
 * re-read whenever `sig()` changes (a skill switching the device's mode). Removed from everyone when the device leaves.
 */
export function deviceAura(battle, dev, { key, select, mods, sig = () => 0 }) {
  const held = new Map(); // operator → signature it was given
  const drop = (a) => { if (a.findBuff(key)) battle.removeBuff(a, key); held.delete(a); };
  battle.on('tick', () => {
    if (!up(dev)) { for (const a of [...held.keys()]) drop(a); return; }
    const want = select();
    const s = sig();
    for (const a of [...held.keys()]) if (!want.includes(a) || !up(a)) drop(a);
    for (const a of want) {
      if (!up(a)) continue;
      if (held.get(a) === s && a.findBuff(key)) continue;
      const m = mods(a);
      if (!Object.keys(m).length) { drop(a); continue; }
      battle.addBuff(a, { key, mods: m, source: dev, tags: ['talent', 'device'] });
      held.set(a, s);
    }
  }, { owner: dev });
  battle.on('death', (ctx) => { if (ctx.unit === dev) for (const a of [...held.keys()]) drop(a); }, { owner: dev, priority: 10 });
}

/** Operators of our side standing on `keys` (absolute tile keys), the device itself excluded. */
export function opsOn(battle, dev, keys, { ignoreSelect = false } = {}) {
  const set = keys instanceof Set ? keys : new Set(keys);
  const out = [];
  for (const a of battle.allyUnits) {
    if (!up(a) || a.hidden || !isOp(a) || !set.has(a.tileR * COLS + a.tileC)) continue;
    if (!ignoreSelect && !battle.allySelectable(a, dev)) continue;
    out.push(a);
  }
  return out;
}

/**
 * A device piece's return (PRTS 卫戍协议/帮助 "若战场区初始部署有召唤物…退场，将在满足条件后立即原地再部署1个"): once it left the
 * field it comes back on its own tile after its redeploy time (data respawnTime), paying its cost (`costOf(dev)`, default its
 * data cost) and spending one of the owner's stock, while the owner stands. `onLeave(dev)` runs as it leaves (节约经费 —
 * not when it leaves with its owner: `dev.mem.withOwner`), `onBack(dev)` when it is back. Shared with 娜斯提 (op-nasti.js).
 */
export function deviceReturn(battle, dev, owner, { onLeave = null, costOf = null, onBack = null } = {}) {
  battle.on('death', (ctx) => {
    if (ctx.unit !== dev || battle.finished) return;
    if (!dev.mem.withOwner && onLeave) onLeave(dev);
    dev.mem.withOwner = false;
    dev.removed = false;   // the piece stays its tile's (content/tokens.js enableRespawn): back there later
    const at = battle.time + Math.max(0, num(dev.base.respawnTime));
    const seq = (dev.mem.returnSeq ?? 0) + 1;
    dev.mem.returnSeq = seq;
    const tryBack = () => {
      if (battle.finished || dev.alive || dev.removed || dev.mem.returnSeq !== seq) return;
      const st = deviceState(owner);
      if (battle.time + 1e-9 >= at && up(owner) && st.stock > 0) {
        const cost = Math.max(0, costOf ? costOf(dev) : num(dev.base.cost));
        const ps = battle.getPlayer(dev.ownerId);
        if (ps && ps.dp + 1e-9 >= cost && battle.redeploy(dev, { free: true })) {
          ps.dp = Math.max(0, ps.dp - cost);
          st.stock--;
          battle.fx('summon', { x: dev.x, y: dev.y, id: dev.id, src: owner.id });
          if (onBack) onBack(dev);
          return;
        }
      }
      battle.after(Math.max(RETRY, at - battle.time), tryBack, { owner: dev });
    };
    battle.after(Math.max(0, at - battle.time), tryBack, { owner: dev });
  }, { owner: dev, priority: -10 });
}

/** The owner leaving withdraws its devices on the field (die_to_kill_token / KillTokens), but those `keep(dev)` spares. */
export function devicesLeaveWithOwner(battle, owner, keep = null) {
  battle.on('death', (ctx) => {
    if (ctx.unit !== owner) return;
    for (const d of devicesUp(owner)) {
      if (keep && keep(d)) continue;
      d.mem.withOwner = true;
      battle.retreat(d, { reason: 'expired' });
    }
  }, { owner });
}

export default {
  char_4072_ironmn: (bb, chess) => {
    const t0 = talentBb(chess, 0), t1 = talentBb(chess, 1);
    const grid1 = talentGrid(chess, 1) ?? X4;
    const extraCnt = num(traitBb(chess).cnt);             // CRA-X: 持有上限+1 (and trigger_charge_token +1)
    const cnt = num(t0.cnt, 3) + extraCnt;
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);

    /** Device kit (`dev` = the piece, `owner` = 白铁). */
    const deviceKit = (dev, owner) => {
      const def = dev.def;
      const sk = def.skill ?? null;
      const tb = sk?.bb ?? {};
      const aspd = num(tokBb(def, 'attack_speed').attack_speed);        // CRA-Y stage 2+ (the token's module talent)
      const grid = dev.rangeGrid ?? def.rangeGrid ?? FRONT1;
      const keys = () => absoluteRangeKeys(grid, dev.tileR, dev.tileC, dev.dir, 0);
      const s1On = () => up(owner) && !!owner.skill?.active && owner.skill.id === S1;
      const s2On = () => up(owner) && !!owner.skill?.active && owner.skill.id === S2;
      const common = (battle) => {
        battle.addBuff(dev, { key: 'ironmn:device', flags: { untargetable: true, noHeal: true, ...(dev.defId === CRAB ? { isolated: true, noDisplace: true } : { invulnerable: true }) }, persist: true, allowDead: true });
        if (aspd) {
          // CRA-Y: "自身装置天赋生效的干员攻击速度+6（此效果不受技能影响）" — on the operators the device's talent reaches
          const reach = dev.defId === CRAB
            ? () => opsOn(battle, dev, [dev.tileR * COLS + dev.tileC, (([r, c]) => r * COLS + c)(frontOf(dev.tileR, dev.tileC, dev.dir, -1))], { ignoreSelect: true })
            : () => opsOn(battle, dev, keys());
          deviceAura(battle, dev, { key: `ironmn:aspd:${dev.id}`, select: reach, mods: () => ({ aspd }) });
        }
      };
      if (dev.defId === PILE1) {
        const atk = num(tokBb(def, 'atk').atk);
        const scale = num(tb.talent_scale, num(b1.fake_scale, 1));
        return {
          skill: null,
          trait: { noAttack: true },
          talents: [],
          install(battle) {
            common(battle);
            // 支援火力: ATK +atk on the operators of its 1-1 (×talent_scale while 白铁's S1 runs)
            deviceAura(battle, dev, { key: `ironmn:pile1:${dev.id}`, select: () => opsOn(battle, dev, keys()),
              sig: () => (s1On() ? 1 : 0), mods: () => ({ atkPct: atk * (s1On() ? scale : 1) }) });
          },
        };
      }
      if (dev.defId === PILE2) {
        const iDef = num(tokBb(def, 'default.interval')['default.interval'], 3.5);
        const iS2 = num(tb['s2.interval'], num(b2.fake_interval, iDef));
        const hpDef = num(tokBb(def, 'hp_ratio').hp_ratio);
        const hpS2 = num(tb['s2.hp_ratio'], hpDef * 2);
        return {
          skill: null,
          trait: { noAttack: true },
          talents: [],
          install(battle) {
            common(battle);
            const m = { mode: null, next: new Map(), bleedAt: Infinity };
            battle.on('deploy', (ctx) => { if (ctx.unit === dev) { m.mode = null; m.next.clear(); } }, { owner: dev });
            battle.on('tick', () => {
              if (!up(dev)) return;
              const mode = s2On() ? 'S2' : 'default';
              if (mode !== m.mode) { m.mode = mode; m.next.clear(); m.bleedAt = battle.time + 1; } // the buffs re-made on a mode switch
              const every = mode === 'S2' ? iS2 : iDef;
              // 战地补给: 1 SP every `every` s to each operator staying on its 1-1
              const now = opsOn(battle, dev, keys());
              for (const a of [...m.next.keys()]) if (!now.includes(a)) m.next.delete(a);
              for (const a of now) {
                if (!m.next.has(a)) { m.next.set(a, battle.time + every); continue; }
                if (battle.time + 1e-9 < m.next.get(a)) continue;
                m.next.set(a, m.next.get(a) + every);
                if (giveSp(a, 1, 'device') > 0) battle.fx('spGift', { x: a.x, y: a.y, id: a.id, from: dev.id });
              }
              // 每秒流失0.4%生命 (S2: ×2): a 流失, invulnerable or not
              if (battle.time + 1e-9 >= m.bleedAt) {
                m.bleedAt += 1;
                const r = mode === 'S2' ? hpS2 : hpDef;
                if (r > 0) battle.loseHp(dev, dev.s.maxHp * r, { source: dev, tags: ['device'] });
              }
            }, { owner: dev });
          },
        };
      }
      // 铁钳号·原型机
      const dr = num(tokBb(def, 'damage_resistance').damage_resistance);
      const healRatio = num(def.traitBb?.hp_ratio, 0.01);
      const atkScale = num(tb.atk_scale, 1), atkScale2 = num(tb.atk_scale_2, 0), loss = num(tb.hp_ratio);
      const skillGrid = sk?.rangeGrid ?? grid;
      return {
        skill: {
          kind: 'instant',
          onStart({ battle, unit }) {
            // 技能开启时自身流失2.5%的生命 (PURE DamageViaMaxHpRatio, `_skipModifierEvent`: a 流失 its trait does not cancel)
            const atk = up(owner) ? owner.s.atk : 0;
            const keysNow = absoluteRangeKeys(skillGrid, unit.tileR, unit.tileC, unit.dir, 0);
            const list = battle.enemiesInKeys(keysNow, unit, { canHitFly: true });
            sortEnemyTargets(battle, unit, list, null);
            const target = list[0] ?? null;
            if (loss > 0) battle.loseHp(unit, unit.s.maxHp * loss, { source: unit, tags: ['device'] });
            if (!target || !(atk > 0)) return;
            battle.addProjectile({ from: unit, target, speed: CRAB_SPEED, visual: 'bomb', source: unit, hitDead: true,
              onHit: ({ target: t, x, y }) => {
                if (t && t.alive) battle.dealDamage(unit, t, { amount: atk * atkScale, type: 'phys', isSkill: true, tags: ['summon', 'skill'] });
                const cx = t ? t.x : x, cy = t ? t.y : y;
                if (atkScale2 > 0) {
                  for (const e of battle.foesInRadius(cx, cy, CRAB_SPLASH, true)) {
                    if (e === target || !e.alive) continue;
                    battle.dealDamage(unit, e, { amount: atk * atkScale2, type: 'phys', isSkill: true, tags: ['summon', 'skill'] });
                  }
                }
                battle.fx('aoe', { x: cx, y: cy, radius: CRAB_SPLASH, id: unit.id, skill: 'ironmn:crab' });
              } });
          },
        },
        trait: { noAttack: true, canHitFly: true },
        talents: [],
        install(battle) {
          common(battle);
          battle.on('deploy', (ctx) => { if (ctx.unit === dev) battle.setAllyTarget(dev, true); }, { owner: dev });
          battle.on('death', (ctx) => { if (ctx.unit === dev) battle.setAllyTarget(dev, false); }, { owner: dev, priority: 5 });
          // trait: every damage cancelled; 受击回复 +1 SP; a 工匠 operator's damage heals it hp_ratio of its max HP
          battle.on('hit', (ctx) => {
            if (ctx.target !== dev || !up(dev)) return;
            ctx.dmg.cancel = true;
            if (dev.skill && !dev.skill.active) dev.skill.gainSp(1, 'hurt');
            const src = ctx.source ?? ctx.credit;
            if (src && src.kind === 'op' && src.def?.profession === 'SUPPORT' && src.profile?.sub === 'craftsman' && healRatio > 0) {
              battle.heal(dev, dev, dev.s.maxHp * healRatio, { self: true, ignoreHealFree: true });
            }
          }, { owner: dev, priority: 100 });
          battle.on('elementHit', (ctx) => { if (ctx.target === dev) ctx.dmg.cancel = true; }, { owner: dev });   // 元素免疫
          battle.on('beforeStatus', (ctx) => { if (ctx.target === dev && CRAB_IMMUNE.has(ctx.status)) ctx.cancel = true; }, { owner: dev });
          // 团结的力量: the operator on its tile / the one behind it — physical damage taken ×(1 − damage_resistance), per device
          if (dr > 0) {
            const behind = () => {
              const [r, c] = frontOf(dev.tileR, dev.tileC, dev.dir, -1);
              return opsOn(battle, dev, [dev.tileR * COLS + dev.tileC, r * COLS + c], { ignoreSelect: true });
            };
            deviceAura(battle, dev, { key: `ironmn:crab:${dev.id}`, select: behind, mods: () => ({ physTakenMul: 1 - dr }) });
          }
        },
      };
    };

    return {
      skills: {
        [S1]: {
          kind: 'duration',
          attack: { atkScale: num(b1['attack@atk_scale'], 1) },
          onStart({ unit }) { rechargeDevices(unit, 1); },
          onEnd({ battle, unit }) {
            // 技能结束时所有场上的装置被销毁 (KillTokens)
            for (const d of devicesUp(unit)) battle.kill(d, null);
          },
        },
        [S2]: {
          kind: 'duration',
          mods: { atkPct: num(b2.atk), defPct: num(b2.def) },
          attack: { hitAllBlocked: true },
          onEnd({ unit }) { rechargeDevices(unit, 1); },
        },
        [S3]: {
          kind: 'duration',
          mods: { atkPct: num(b3.atk), aspd: num(b3.attack_speed) },
          onStart({ unit }) { rechargeDevices(unit, 1); },
        },
      },
      talents: [
        { install(battle, unit) {
          // 战地工程师: his device pieces run the device kits (set up here, before the battle starts — as op-bgsnow.js); the
          // stock refilled on each of his deployments; his devices leave with him (die_to_kill_token)
          const st = deviceState(unit);
          st.cap = cnt;
          const prob = num(t1.prob), gain = num(t1.cnt, 1);
          // 节约经费: a device of his leaving his x-4 ⇒ prob ⇒ +cnt
          const onLeave = (dev) => {
            if (!up(unit) || !absoluteRangeKeys(grid1, unit.tileR, unit.tileC, unit.dir, 0).includes(dev.tileR * COLS + dev.tileC)) return;
            if (!(prob > 0) || !battle.rng.chance(prob)) return;
            rechargeDevices(unit, gain);
            battle.fx('spGift', { x: unit.x, y: unit.y, id: unit.id, from: dev.id });
          };
          for (const t of battle.allyUnits) {
            if (t.kind !== 'token' || !DEVICES.has(t.defId) || t.ownerUnit !== unit || t.alive || t.deployed) continue;
            if (t.kit) battle.offOwner(t);
            battle._setupUnit(t, deviceKit(t, unit));
            deviceReturn(battle, t, unit, { onLeave });
            st.devices.add(t);
          }
          battle.on('deploy', (ctx) => { if (ctx.unit === unit) rechargeDevices(unit, cnt); }, { owner: unit });
          devicesLeaveWithOwner(battle, unit);
        } },
        { install(battle, unit) {
          // 节约经费 (the roll is the device lifecycle's, above); CRA-X stage 2+: SP +0.2/s while a device of his stands on
          // his x-4 (one effect)
          const spDef = [...deviceState(unit).devices].map((d) => num(tokBb(d.def, 'sp_recovery_per_sec').sp_recovery_per_sec)).find((v) => v > 0) ?? 0;
          if (!(spDef > 0)) return;
          const key = 'talent:ironmn:spRecover';
          battle.on('tick', () => {
            const area = new Set(absoluteRangeKeys(grid1, unit.tileR, unit.tileC, unit.dir, 0));
            const want = up(unit) && devicesUp(unit).some((d) => area.has(d.tileR * COLS + d.tileC));
            const has = unit.findBuff(key);
            if (want && !has) battle.addBuff(unit, { key, mods: { spRecoveryFlat: spDef }, tags: ['talent'] });
            else if (!want && has) battle.removeBuff(unit, key);
          }, { owner: unit });
        } },
      ],
    };
  },
};
