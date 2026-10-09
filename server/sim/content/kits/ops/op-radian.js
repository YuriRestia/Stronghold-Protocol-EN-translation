// server/sim/content/kits/ops/op-radian.js — 电弧 (char_4195_radian) 自选 operator kit: 6★ 召唤师 (辅助), an owned-6★ pick of
// the tier-5 and tier-6 自选 slots — not the 补位 stand-in Raidian (char_614_acsupo, standin-acsupo.js); every skill, both
// talents, the trait and both modules (SO-A 电弧特勤证章, SO-B 新起点) at every form, and the kits of her summons 戴乌 / 赛柯 /
// 桑特拉 (token_10051_radian_tower1, token_10052_radian_tower2, token_10053_radian_tower3). Kit contract and the 自选 rules:
// ../README.md ("How to add an operator (自选)"); the summon deck: ../shared/summoner.js.
//
// Forms (data/backups.json units.char_4195_radian): normal = E2 Lv1, skills at rank 4, no module; elite = E2 Lv60, rank 7,
// the picked module at stage 1 (tier 5) or 3 (tier 6) — the owner's decision of 2026-10-05. Full potential (the owner's
// decision of 2026-10-07). Sources: character_table / skill_table / battle_equip_table / the tokens' character_table rows (zh_CN, as built
// into backups.json); PRTS 电弧 (加油~ 修正 "电弧自身" for the text's "其自身", 备注 "加成效果的数值每秒更新一次"; S1 备注 "技能期间
// 部署的戴乌在部署时也会获得屏障，此时计算屏障量可享受电弧第二天赋的生命值加成"; S2 备注 on 赛柯's bullets; S3 备注 "召唤物可对空",
// "停顿与法术脆弱效果为伤害附加效果，于本次伤害前生效", the 协同攻击); PRTS 戴乌 / 赛柯 / 桑特拉 (备注 "持有禁疗"; 赛柯 "不进行索敌，
// 会持续向前攻击…飞行速度5.0，最大飞行时间0.6秒，碰撞半径0.5，不可对空，无视迷彩…首个敌方单位…100%的物理普通伤害", the S2 bullet
// origins; 桑特拉's 协同请求 / 协同攻击 rules); PRTS 分支特性信息 召唤师; the client's battle data (charpack char_4195_radian:
// Talents/1 charge_token[born], Talents/2 hp_to_hp / atk_to_atk / def_to_def[final_addition] on her TOKEN-class allies every
// 1 s (鼓舞: FINAL_SCALER of the source's attribute), CommonAbilities die_to_kill_token, Talents/master_1 and LogKillBoss
// (`rogue_yan` only); buff_template_data radian_s_1[shield] / [shield_token] (BlockDamage ANY_ATTACK_EXCEPT_ELEMENT of
// hp_ratio × MAX_HP, the token's computed 0.03 s after it starts), radian_s_2[token] (the 赛柯 mode),
// radian_tower2_s_2[emit_projectile] (two more bullets), radian_s_3[token] (ON_OUTPUT_DAMAGE: DB sluggish +
// weak[magic][limit] on the target), token_radian_tower3_t[link_buff] / _s_3[trigger_link] / [prism_aoe] (the 协同攻击);
// skill prefabs skchr_radian_1 / 2 / 3 (`_buffs` = the summons' part, `_passiveBuffs` = hers + trigger_charge_token);
// battle_equip_table uniequip_002 / 003_radian (the talent parts gated to 集成战略: `rogue_yan`, validInGameTag roguelike)).
// - Trait (召唤师): the profession default (ranged arts on her 3-1, hits air units — PRTS "可对空"), blocks 1, ground enemies
//   target her; her summons leave the field with her (shared/summoner.js).
// - T1 卡带里的灵感 "可以使用5个召唤物（最多同时部署3个），功能随技能选择而改变": the summon of her pick's skill (戴乌 / 赛柯 /
//   桑特拉 — the skills' overrideTokenKey) is the hand piece the player places; the deck of ../shared/summoner.js with charge =
//   cnt (5), cap = the token deck (deckStack 5), at most its deployLimit (3) standing. Every summon holds 禁疗 (PRTS; the
//   data's `abnormal` lacks it [ASSUMED: given here]). 戴乌 blocks 3 and strikes in melee on its own tile (physical); 赛柯
//   blocks 2 and never picks a target: every attack interval it fires a bullet straight ahead (BULLET_SPEED tiles/s for
//   BULLET_LIFE s, collision radius BULLET_RADIUS) that deals 100 % of its ATK as physical 普通伤害 to the first selectable
//   ground enemy it touches (stunned / frozen: no shot; disarmed: none [ASSUMED]); 桑特拉 shoots arts on its 3-1, air units
//   too, its splash data capped at 0 extra targets (prism_max_target / normal_aoe max_target 0). 协同攻击 (桑特拉's own rule,
//   PRTS): when a 桑特拉 attacks, every other 桑特拉 of the field that can attack, is between attacks (its attack ready —
//   `atkCd` 0 here) and has no valid target of its own, and has the asking 桑特拉 inside its attack range ("其自身范围内其他
//   电弧的召唤物"), shoots a link at it — the link's arrival deals prism_atk_scale × the responder's ATK as arts 普通伤害 to the
//   first asker's target — and asks the others in turn; its attack restarts [ASSUMED: the link is its attack].
// - T2 加油~ "电弧的召唤物获得相当于电弧自身12％攻击力、防御力、生命值的鼓舞效果" (full potential: 15 %): every INSPIRE_IV (1) s
//   and at each of their deployments, her summons on the field get 鼓舞 = ratio × her current ATK / DEF / max HP, added after
//   their own multipliers, the strongest source of each kind kept (the keys 魔王 / 浊心斯卡蒂 use: inspire, inspire:def,
//   inspire:hp).
// - S1 律动线 (MANUAL, data DEFAULT, 25 s): +cnt held at the cast; she and her summons DEF +def and a 屏障 of hp_ratio × their
//   own max HP until the skill ends (every damage type but 元素伤害 — shieldType phys / arts / true); a summon deployed while it
//   runs takes it at its deployment, after its 鼓舞 (PRTS). Passive "召唤物可部署在近战位": placement only.
// - S2 环形鳞地 (MANUAL, data DEFAULT, 25 s): +cnt held; she and her summons ATK +atk (base_attack_time 0: no change); 赛柯's
//   attacks fire BULLET_OFFSETS (three bullets: its centre, 0.2 tile left-up and right-down — fixed, PRTS) that fly its token
//   skill's attack@projectile_life_time s (0.6 at rank 4, 0.8 at rank 7: "子弹飞行距离+1"); its 3-2 range is unchanged at ranks
//   4 / 7 (PRTS). Passive "会持续向前方发射子弹": 赛柯's data. Its cast: the data's DEFAULT, and — the owner's larger-range
//   rule of 2026-10-06 (it acts through 赛柯's shots) — also a ground enemy on a standing summon's range (its 3-2: the
//   bullets reach no air unit; shared/summoner.js summonTriggerArea, checked every tick).
// - S3 手牵手 (MANUAL, data DEFAULT, 30 s): +cnt held; she and her summons ATK +atk; before each damage of her attacks and of
//   any damage of her summons on an enemy: 停顿 `sluggish` s and 法术脆弱 (artsFragile damage_scale − 1, "同名效果取最高") for
//   weak[magic][limit] s (a dodged hit still carries them [ASSUMED]). Passive "召唤物可部署在远程位…协同攻击": 桑特拉 (above).
//   Its cast: the data's DEFAULT, and — the owner's larger-range rule of 2026-10-06 (it acts through her summons' damage)
//   — also an enemy (air units too: S3 备注 "召唤物可对空") on a standing summon's range (summonTriggerArea).
// - Modules SO-A 电弧特勤证章 / SO-B 新起点: their trait and talent parts act "在【岁的界园志异】中" only (the client gates them to
//   the 集成战略 theme rogue_yan / validInGameTag roguelike): N/A here — the module talents the composed record carries
//   (SO-A's hidden respawn_time / prob / sp, SO-B's attack@max_target and x-5 recall) are ignored; their attributes are in the
//   stats. A player's roster never carries them (shared/diy.js DIY_EXCLUDED_MODULE_TYPE, 0.2.0 WE2); the kit fields them for
//   its tests.

import { num, talentBb, skillRec, up } from '../shared/tier1.js';
import { summonDeck, holdBuff, tokenStat, summonTriggerArea } from '../shared/summoner.js';
import { acquireTargets } from '../../../ai.js';
import { aggregateMods } from '../../../buffs.js';
import { dirVec } from '../../../dir.js';
import { COLS } from '../../../constants.js';
import { hypot } from '../../../detmath.js';

const S1 = 'skchr_radian_1';
const S2 = 'skchr_radian_2';
const S3 = 'skchr_radian_3';
export const TOWER1 = 'token_10051_radian_tower1';
export const TOWER2 = 'token_10052_radian_tower2';
export const TOWER3 = 'token_10053_radian_tower3';
const TOWERS = Object.freeze([TOWER1, TOWER2, TOWER3]);
/** 加油~ "加成效果的数值每秒更新一次" (PRTS; Talents/2 triggerInterval 1). */
export const INSPIRE_IV = 1;
/** PRTS 赛柯 备注: "飞行速度5.0，最大飞行时间0.6秒，碰撞半径0.5". */
export const BULLET_SPEED = 5;
export const BULLET_LIFE = 0.6;
export const BULLET_RADIUS = 0.5;
/** PRTS S2 备注: the skill's bullets start at the tile centre, 0.2 left + 0.2 up and 0.2 right + 0.2 down (any facing). */
const BULLET_OFFSETS = Object.freeze([[0, 0], [-0.2, 0.2], [0.2, -0.2]]);
/** PRTS 桑特拉 备注 "不论是普通攻击还是协同攻击，弹道飞行速度均为50". */
const LINK_SPEED = 50;
const SHIELD_TYPES = Object.freeze(['phys', 'arts', 'true']);
const KEY_BARRIER = 'radian:s1:barrier';
/** The summons' areas a skill casts on (summonTriggerArea): 赛柯's bullets hit ground enemies only, S3's summons air too. */
const GROUND = Object.freeze({ canHitFly: false });
const ANY = Object.freeze({ canHitFly: true });
const TAG_BULLET = 'radian:bullet';
const TAG_LINK = 'radian:link';

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const skillOn = (u, id) => !!(u && u.skill && u.skill.active && u.skill.id === id);
const tokTalent = (def, key) => (def?.talents ?? []).find((t) => t && t.bb && t.bb[key] != null) ?? null;

/**
 * 鼓舞 (ba.inspire "获得额外附加的基础属性加成（同类属性取最高）"): +`val` of `stat` after the target's own multipliers (the flat
 * mod compensated), the strongest source kept — the keys and rule of 魔王's / 浊心斯卡蒂's 鼓舞.
 */
function inspire(battle, target, val, src, stat) {
  if (!(val > 0) || !up(target) || target.mem?.noInspire) return;
  const key = stat === 'atk' ? 'inspire' : `inspire:${stat}`;
  const cur = target.findBuff(key);
  if (cur && cur.data && cur.data.src !== src.id && cur.data.val > val && cur.timeLeft > 0.1) return;
  const { add, mul } = aggregateMods(target.buffs.filter((b) => b.key !== key));
  const f = stat === 'def' ? Math.max(0, 1 + (add.defPct ?? 0)) * (mul.defMul ?? 1)
    : stat === 'hp' ? Math.max(0, 1 + (add.hpPct ?? 0)) * (mul.hpMul ?? 1)
      : Math.max(0, 1 + (add.atkPct ?? 0)) * (mul.atkMul ?? 1);
  const flat = f > 1e-6 ? val / f : val;
  const mods = stat === 'def' ? { defFlat: flat } : stat === 'hp' ? { hpFlat: flat } : { atkFlat: flat };
  battle.addBuff(target, { key, mods, duration: INSPIRE_IV + 0.25, refresh: 'replace', source: src, status: 'inspire', data: { src: src.id, val } });
}

/** 律动线's 屏障: hp_ratio × the holder's max HP, until the skill ends. */
function barrier(battle, u, owner, ratio) {
  if (!(ratio > 0) || !up(u)) return;
  const left = owner.skill?.active ? owner.skill.timeLeft : 0;
  if (!(left > 0)) return;
  battle.addBuff(u, { key: KEY_BARRIER, shield: u.s.maxHp * ratio, shieldType: SHIELD_TYPES, duration: left, tags: ['skill'] });
  battle.fx('shield', { x: u.x, y: u.y, id: u.id });
}

/** 协同攻击: every 桑特拉 of the field that can answer `asker` shoots its link and asks the others in turn (see the header). */
function relayLink(battle, asker, target, seen) {
  for (const r of battle.allyUnits) {
    if (r.kind !== 'token' || r.defId !== TOWER3 || seen.has(r) || !up(r) || !r.canAct || r.s.flags.disarm || r.atkCd > 1e-9) continue;
    if (!r.rangeKeySet || !r.rangeKeySet.has(asker.tileR * COLS + asker.tileC)) continue;
    if (acquireTargets(battle, r, r.profile).length) continue;
    seen.add(r);
    r.atkCd = r.s.interval;
    const amount = r.s.atk * num(tokTalent(r.def, 'prism_atk_scale')?.bb?.prism_atk_scale, 1);
    battle.addProjectile({
      from: r, target: asker, speed: LINK_SPEED, visual: 'bolt', source: r, hitDead: true,
      onHit: () => { if (target.alive) battle.dealDamage(r, target, { amount, type: 'arts', isAttack: true, tags: [TAG_LINK] }); },
    });
    battle.fx('link', { x: r.x, y: r.y, id: r.id, to: asker.id });
    relayLink(battle, r, target, seen);
  }
}

/** 赛柯: one volley straight ahead (one bullet; three while S2 runs). */
function fireVolley(battle, t, owner) {
  const s2 = skillOn(owner, S2);
  const life = s2 ? num(t.def.skill?.bb?.['attack@projectile_life_time'], BULLET_LIFE) : BULLET_LIFE;
  const [fr, fc] = dirVec(t.dir);
  const list = (t.mem.radianBullets ??= []);
  for (const [dx, dy] of s2 ? BULLET_OFFSETS : [[0, 0]]) {
    list.push({ x: t.x + dx, y: t.y + dy, vx: fc * BULLET_SPEED, vy: fr * BULLET_SPEED, life, atk: t.s.atk });
  }
  battle.fx(s2 ? 'volley' : 'strike', { x: t.x, y: t.y, id: t.id, n: s2 ? BULLET_OFFSETS.length : 1 });
}

/** Move 赛柯's bullets one tick: the first selectable ground enemy within the radius takes the hit; expired ones vanish. */
function flyBullets(battle, t, dt) {
  const list = t.mem.radianBullets;
  if (!list || !list.length) return;
  const keep = [];
  for (const b of list) {
    const hit = () => {
      const near = battle.foesInRadius(b.x, b.y, BULLET_RADIUS).filter((e) => e.alive && !e.isFlying);
      if (!near.length) return false;
      near.sort((p, q) => hypot(p.x - b.x, p.y - b.y) - hypot(q.x - b.x, q.y - b.y) || p.spawnSeq - q.spawnSeq);
      battle.dealDamage(t, near[0], { amount: b.atk, type: 'phys', isAttack: true, tags: [TAG_BULLET] });
      return true;
    };
    if (hit()) continue;
    const step = Math.min(dt, b.life);
    b.x += b.vx * step;
    b.y += b.vy * step;
    b.life -= step;
    if (hit()) continue;
    if (b.life > 1e-9) keep.push(b);
  }
  t.mem.radianBullets = keep;
}

/** Her summons' kit: 禁疗, her skills on them (stats, 屏障), 鼓舞 at each deployment, 赛柯's bullets, 桑特拉's 协同攻击. */
function towerKit(t, owner, opts) {
  return {
    skill: null,
    talents: [],
    trait: t.defId === TOWER2 ? { noAttack: true } : null,
    install(battle, s) {
      battle.addBuff(s, { key: 'radian:tower:abnormal', flags: { noHeal: true }, persist: true, allowDead: true });   // 持有禁疗
      battle.on('deploy', (c) => {
        if (c.unit !== s) return;
        s.mem.radianFireCd = 0;
        opts.sync(s);          // her running skill first: the 鼓舞's flat part is set against its multipliers
        opts.inspireOne(s);
        if (skillOn(owner, S1)) barrier(battle, s, owner, opts.hpRatio);   // 技能期间部署的戴乌在部署时也会获得屏障 (with its 鼓舞 HP)
      }, { owner: s });
      if (s.defId === TOWER2) {
        battle.on('tick', (c) => {
          const dt = c.dt ?? battle.dt;
          flyBullets(battle, s, dt);
          if (!up(s) || !s.canAct) return;
          s.mem.radianFireCd = Math.max(0, (s.mem.radianFireCd ?? 0) - dt);
          if (s.s.flags.disarm || s.mem.radianFireCd > 1e-9) return;
          fireVolley(battle, s, owner);
          s.mem.radianFireCd = s.s.interval;
        }, { owner: s });
      }
      if (s.defId === TOWER3) {
        battle.on('attack', (c) => {
          if (c.attacker !== s) return;
          const target = (c.targets || []).find((e) => e && e.side === 'enemy' && e.alive);
          if (target) relayLink(battle, s, target, new Set([s]));
        }, { owner: s });
      }
    },
  };
}

export default {
  char_4195_radian: (bb, chess) => {
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const t0 = talentBb({ talents: chess?.talentsBase ?? chess?.talents }, 0);   // 卡带里的灵感: cnt (the module copies' IS keys ignored)
    const t1 = talentBb({ talents: chess?.talentsBase ?? chess?.talents }, 1);   // 加油~: atk / def / max_hp
    const picked = chess?.skill?.skillId ?? null;
    const tokenId = skillRec(chess, picked)?.overrideTokenKey ?? null;
    const hpRatio = num(b1.hp_ratio);
    const gain = (unit, n) => unit.mem.summonDeck?.gain(n);
    return {
      skills: {
        [S1]: {
          kind: 'duration', mods: { defPct: num(b1.def) },
          onStart({ battle, unit }) {
            gain(unit, num(b1.cnt, 1));   // 技能开启时获得1个召唤物
            barrier(battle, unit, unit, hpRatio);
            for (const t of unit.mem.summonDeck?.standing() ?? []) barrier(battle, t, unit, hpRatio);
          },
          onEnd({ battle, unit }) {
            for (const u of [unit, ...(unit.mem.summonDeck?.pieces() ?? [])]) if (u.findBuff(KEY_BARRIER)) battle.removeBuff(u, KEY_BARRIER);
          },
        },
        [S2]: { kind: 'duration', mods: { atkPct: num(b2.atk) }, onStart({ unit }) { gain(unit, num(b2.cnt, 1)); } },
        [S3]: { kind: 'duration', mods: { atkPct: num(b3.atk) }, onStart({ unit }) { gain(unit, num(b3.cnt, 1)); } },
      },
      talents: [
        { install(battle, unit) { // 卡带里的灵感: the deck of her summon pieces and their kit
          const cnt = Math.max(0, Math.floor(num(t0.cnt)));
          const ratios = { atk: num(t1.atk), def: num(t1.def), hp: num(t1.max_hp) };
          const inspireOne = (s) => {
            if (!up(unit)) return;
            inspire(battle, s, unit.s.atk * ratios.atk, unit, 'atk');
            inspire(battle, s, unit.s.def * ratios.def, unit, 'def');
            inspire(battle, s, unit.s.maxHp * ratios.hp, unit, 'hp');
          };
          const sync = (s) => {
            if (!s.alive) return;
            holdBuff(battle, s, 'radian:s1:tower', skillOn(unit, S1), { defPct: num(b1.def) });
            holdBuff(battle, s, 'radian:s2:tower', skillOn(unit, S2), { atkPct: num(b2.atk) });
            holdBuff(battle, s, 'radian:s3:tower', skillOn(unit, S3), { atkPct: num(b3.atk) });
          };
          const opts = { inspireOne, sync, hpRatio };
          summonDeck(battle, unit, {
            tokenIds: TOWERS,
            charge: cnt,
            cap: num(tokenId ? tokenStat(battle, unit, tokenId, 'deckStack') : cnt, cnt),
            maxDeployed: num(tokenId ? tokenStat(battle, unit, tokenId, 'deployLimit') : 1, 1),
            kit: (t) => towerKit(t, unit, opts),
          });
          // her skills on the standing summons at each start / end (a summon deployed meanwhile syncs itself); 鼓舞 again
          const onSkill = (c) => {
            if (c.unit !== unit) return;
            for (const s of unit.mem.summonDeck.standing()) { sync(s); inspireOne(s); }
          };
          battle.on('skillStart', onSkill, { owner: unit });
          battle.on('skillEnd', onSkill, { owner: unit });
          // 加油~: every second
          if (ratios.atk > 0 || ratios.def > 0 || ratios.hp > 0) {
            battle.every(INSPIRE_IV, () => { for (const s of unit.mem.summonDeck.standing()) inspireOne(s); }, { owner: unit });
          }
        } },
        // 加油~ lives in the deck's install above (its 鼓舞 at each deployment and every second)
      ],
      install(battle, unit) {
        // S2 / S3's cast: an enemy on a standing summon's range too (the owner's larger-range rule, 2026-10-06)
        summonTriggerArea(battle, unit, S2, (t) => ({ keys: t.rangeKeys, profile: GROUND }));
        summonTriggerArea(battle, unit, S3, (t) => ({ keys: t.rangeKeys, profile: ANY }));
        // S3 手牵手: before each damage of her attacks / of her summons' damage on an enemy, 停顿 + 法术脆弱
        if (picked !== S3) return;
        const slug = num(b3.sluggish), dur = num(b3['weak[magic][limit]']), frag = num(b3.damage_scale, 1) - 1;
        battle.on('hit', (c) => {
          const src = c.source, e = c.target;
          if (!src || !e || e.side !== 'enemy' || !e.alive || !c.dmg || c.dmg.type === 'element' || !skillOn(unit, S3)) return;
          const mine = src === unit ? !!c.dmg.isAttack : (src.kind === 'token' && src.ownerUnit === unit && TOWERS.includes(src.defId));
          if (!mine) return;
          if (slug > 0) battle.applyStatus(e, 'sluggish', { duration: slug, source: src });
          if (frag > 0 && dur > 0) battle.applyStatus(e, 'artsFragile', { duration: dur, value: frag, source: src });
        }, { owner: unit, priority: 100 });
      },
    };
  },
};
