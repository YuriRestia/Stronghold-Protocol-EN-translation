// server/sim/content/kits/ops/op-veen.js — 维伊 (char_4226_veen) 自选 operator kit: 6★ 秘术师 (术师), an owned-6★ pick of the
// tier-5 and tier-6 自选 slots; every skill, both talents, the trait and the module (MSC-Y) at every form.
// Kit contract and the 自选 rules: ../README.md ("How to add an operator (自选)").
//
// Forms (data/backups.json units.char_4226_veen, the DIY slot statuses): normal = E2 Lv1, skills at rank 4, no module;
// elite = E2 Lv60, rank 7, MSC-Y at stage 1 (tier 5) or 3 (tier 6). Full potential (the owner's decision of 2026-10-07).
// Sources: character_table / skill_table / battle_equip_table (zh_CN, as built into backups.json) and PRTS 维伊 (the 备注
// quoted below).
// - Trait (秘术师) "攻击造成法术伤害，在找不到攻击目标时可以将攻击能量储存起来之后一齐发射" (ranged arts, hits air units,
//   targetable by ground enemies). PRTS 分支特性信息 秘术师: "能量储存与攻击占用相同的攻击间隔：在进行攻击判定时，若范围内存在
//   有效目标，则进行普通攻击；若无有效目标且能量储存数未满，则改为储存一份攻击能量（属于攻击行为）" — when her attack is ready
//   and she has no valid target she stores one energy and her attack interval starts again (the shared 秘术师 profile,
//   professions.js installMystic, with this kit's `storeEnergy`); the energies fly with her next attack, at its target
//   ("由储存能量形成的弹道造成攻击力100%的法术普通伤害").
//   T1 “在挥刀之前” "特性储存的能量达到3个时，合成为1个转置能量（至多储存等同于9倍的能量）" (trait bb merge_cnt 3, times 9):
//   3 stored make 1 转置能量, at most times / merge_cnt of those, then no more storing (备注 "转置能量数量达到上限时，停止储存
//   攻击能量"); a 转置能量 hits for merge_cnt × ATK (备注 "攻击力300%的法术普通伤害"). Every shot uses the ATK it left with
//   (备注 "所有攻击、储存能量、转置能量的弹道均使用脱手时的缓存攻击力"), released 转置能量 → main attack → stored energies (S2
//   备注 "弹道创建顺序"); one volley flies to one target and lands at once, so the kit resolves all its hits as the main bolt
//   lands (the engine's own hit makes none: `hitsFn` 0), with that attack's attackId, the later ones only on a target still
//   alive. [ASSUMED] a redeployment holds no energy.
// - T1 “在挥刀之前” "拥有转置能量时攻击力+10%，未拥有转置能量时攻击速度+15" (full potential: ATK +12 %; bb atk / attack_speed):
//   two toggles on her stored state (checked every tick — the 备注's "攻击力加成失效存在短暂延迟": the volley that spends the
//   转置能量 keeps it).
// - T2 战争技艺 "攻击和储存的能量使目标在5秒内每秒受到90点法术伤害（至多叠加3次，发射转置能量可以叠加3次），维伊不以该效果影响的
//   敌人为攻击目标" (bb attack@duration / attack@value / attack@max_stack_cnt; MSC-Y stage 3: 120 / 4): each hit adds 1
//   stack (a 转置能量 3, an S3 bounce 1 — S3 备注 "相当于一发储存能量"), each stack attack@value arts per second, the 5 s
//   restarting with every stack [ASSUMED]; she never picks a marked enemy (canAttack / beforeAttack, as 深靛 skips bound
//   enemies — with only marked enemies in range she stores energy).
// - MSC-Y “军械库” "拥有已储存的攻击能量时，攻击速度+30" (hidden module talent attack_speed): while she holds any energy.
// - S1 “自呼号生发” (AUTO, 18 s): ASPD +attack_speed — an AUTO skill acting on herself fires at full SP (the owner's rule,
//   kits/README.md checklist 5: `trigger: 'SP_FULL'`).
// - S2 “以鲜血洗去” (MANUAL, 28 s, data DEFAULT): attack interval base_attack_time (a flat −0.5 s on 3.0 s); every released
//   main attack or stored energy adds a stack (a 转置能量 3), at most …max_stack_cnt: ATK +…atk and ASPD +…attack_speed each,
//   until the skill ends; a shot leaving later in the same volley already has the stacks of those before it (备注).
// - S3 “用赤铁铭记” (MANUAL, 21 / 18 bullets, data DEFAULT): ASPD +attack_speed; 备注 "技能期间发射的储存能量与转置能量不会
//   产生伤害，维伊仅在每次攻击时根据当前储存能量与转置能量消耗相应数量的弹药（不考虑是否足够），并令本次攻击获得相应弹射次数":
//   an attack spends 1 bullet per stored energy and merge_cnt per 转置能量 (none without) and its main hit
//   (attack@base_atk_scale × ATK) bounces that many times, every 0.5 s within 1.7 tiles (备注 "弹射间隔0.5，弹射半径1.7"),
//   preferring an enemy not hit yet by it, else another one, else the same (text "优先不同目标" [ASSUMED order]), each
//   attack@bounce_atk_scale × the cached ATK arts. The skill ends when the bullets run out.

import { num, talentBb, moduleBb, traitBb, skillRec, batMod, toggleBuff } from '../shared/tier1.js';
import { canTargetEnemy, sortEnemyTargets } from '../../../targeting.js';

const S1 = 'skchr_veen_1';
const S2 = 'skchr_veen_2';
const S3 = 'skchr_veen_3';
const ANY = Object.freeze({ canHitFly: true });
/** 用赤铁铭记 备注 "弹射间隔0.5，弹射半径1.7". */
const BOUNCE_IV = 0.5;
const BOUNCE_R = 1.7;
const S2_STACK = 'veen:s2stack';

const bbOf = (chess, id) => skillRec(chess, id)?.bb ?? {};
const warKey = (unit) => `veen:war:${unit.id}`;
const marked = (unit, e) => !!e.findBuff(warKey(unit));
const skillOn = (unit, id) => !!(unit.skill && unit.skill.active && unit.skill.id === id);
/**
 * Her stored energies (per deployment): `s` stored, `t` 转置能量, `q` the volleys in flight per target, `use` the S3 bullets of
 * the attack just made, `k` the S2 stacks.
 */
const stateOf = (unit) => unit.trait.veen ?? (unit.trait.veen = { s: 0, t: 0, q: new Map(), use: 0, k: 0 });

/** Enemies she may pick: in her range (or blocked by her), none under her 战争技艺. */
function validTargets(battle, unit, prof) {
  const cands = battle.enemiesInKeys(unit.rangeKeys, unit, prof);
  for (const e of battle.blockedTargets(unit, prof)) if (!cands.includes(e)) cands.push(e);
  return cands.filter((e) => !marked(unit, e));
}

export default {
  char_4226_veen: (bb, chess) => {
    const t0 = talentBb(chess, 0);
    const t1 = talentBb(chess, 1);
    const tb = traitBb(chess);
    const hidden = moduleBb(chess);   // MSC-Y: attack_speed
    const b1 = bbOf(chess, S1), b2 = bbOf(chess, S2), b3 = bbOf(chess, S3);
    const merge = Math.max(1, Math.floor(num(tb.merge_cnt, 3)));
    const tMax = Math.max(1, Math.floor(num(tb.times, 9) / merge));
    const war = { dur: num(t1['attack@duration']), value: num(t1['attack@value']), max: Math.max(1, Math.floor(num(t1['attack@max_stack_cnt'], 1))) };
    const s2 = { atk: num(b2['attack@veen_s_2_buff[stack].atk']), aspd: num(b2['attack@veen_s_2_buff[stack].attack_speed']), max: Math.max(0, Math.floor(num(b2['attack@veen_s_2_buff[stack].max_stack_cnt']))) };

    /** 战争技艺: `n` stacks on `e`. */
    function warOn(battle, unit, e, n) {
      if (!e || !e.alive || !(war.value > 0) || !(war.dur > 0) || !(n > 0)) return;
      battle.addBuff(e, {
        key: warKey(unit), duration: war.dur, refresh: 'stack', stacks: Math.min(n, war.max), maxStacks: war.max, source: unit,
        interval: 1, data: { value: war.value },
        onTick: ({ battle: b, unit: t, buff }) => { b.dealDamage(unit, t, { amount: buff.data.value * buff.stacks, type: 'arts', canDodge: false, tags: ['talent', 'dot', 'veenWar'] }); },
      });
    }
    /** S2: `n` more stacks (a released shot). */
    function s2Stack(battle, unit, n) {
      if (!skillOn(unit, S2) || !(s2.max > 0)) return;
      const v = stateOf(unit);
      v.k = Math.min(s2.max, v.k + n);
      battle.addBuff(unit, { key: S2_STACK, mods: { atkPct: s2.atk * v.k, aspd: s2.aspd * v.k }, tags: ['skill'] });
    }
    /** One hit of the volley: `atk` (cached at release) × `scale` arts, then `stacks` of 战争技艺. */
    function hitOnce(battle, unit, t, atk, scale, stacks, attackId, isSkill) {
      battle.dealDamage(unit, t, { amount: atk * scale * unit.s.atkScaleMul, type: 'arts', isAttack: true, isSkill, attackId, tags: ['veen'] });
      warOn(battle, unit, t, stacks);
    }
    /** S3: `n` bounces from `from`, every BOUNCE_IV s, each bounce × the cached `atk`. */
    function bounces(battle, unit, from, n, atk, attackId) {
      const hit = new Set([from]);
      let cur = from;
      const step = (left) => {
        if (left <= 0) return;
        battle.after(BOUNCE_IV, () => {
          const near = battle.enemiesInRadius(cur.x, cur.y, BOUNCE_R).filter((e) => canTargetEnemy(unit, e, ANY));
          let pool = near.filter((e) => !hit.has(e));
          if (!pool.length) pool = near.filter((e) => e !== cur);
          if (!pool.length) pool = near;
          let next = null, bd = Infinity;
          for (const e of pool) {
            const d = Math.hypot(e.x - cur.x, e.y - cur.y);
            if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && next && e.spawnSeq < next.spawnSeq)) { bd = d; next = e; }
          }
          if (!next) return;   // nobody within reach: the bounces left are lost
          battle.fx('veenBounce', { x: cur.x, y: cur.y, id: unit.id, target: next.id });
          hit.add(next);
          cur = next;
          battle.dealDamage(unit, next, { amount: atk * num(b3['attack@bounce_atk_scale'], 1) * unit.s.atkScaleMul, type: 'arts', isAttack: true, attackId, tags: ['veen', 'veenBounce'] });
          warOn(battle, unit, next, 1);
          step(left - 1);
        });
      };
      step(n);
    }
    /** The main bolt of an attack lands on `victim`: every hit of its volley (released in order), then the S3 bounces. */
    function land(battle, unit, victim, attackId, isSkill) {
      const v = stateOf(unit);
      const list = v.q.get(victim.id);
      const rec = list ? list.shift() : null;
      if (list && !list.length) v.q.delete(victim.id);
      if (!rec) { hitOnce(battle, unit, victim, unit.s.atk, 1, 1, attackId, isSkill); return; }
      for (const p of rec.pre) { if (!victim.alive) return; hitOnce(battle, unit, victim, p.atk, p.scale, p.stacks, attackId, isSkill); }
      if (!victim.alive) return;
      hitOnce(battle, unit, victim, rec.main.atk, rec.main.scale, 1, attackId, isSkill);
      if (rec.main.bounces > 0) bounces(battle, unit, victim, rec.main.bounces, rec.main.atk, attackId);
      for (const p of rec.post) { if (!victim.alive) return; hitOnce(battle, unit, victim, p.atk, p.scale, p.stacks, attackId, isSkill); }
    }

    return {
      trait: {
        hitsFn: () => 0,   // the volley's hits are the kit's (land)
        onEachHit(battle, unit, victim, hc) { if (hc.kind === 'main' && victim && victim.side === 'enemy') land(battle, unit, victim, hc.attackId, !!hc.isSkill); },
        // only enemies under her 战争技艺 in range: no valid target — she holds her fire (and stores energy)
        canAttack(battle, u) { return validTargets(battle, u, u.profile).length > 0; },
        // the mystic store (the shared profile calls it at her attack check with no valid target — professions.js
        // installMystic: an attack action, the interval restarts): one energy, 3 merge into a 转置能量; none once the
        // 转置能量 are at their cap (a full store: she idles)
        storeEnergy(battle, unit) {
          const v = stateOf(unit);
          if (v.t >= tMax) return false;
          if (++v.s >= merge) { v.s -= merge; v.t++; }
          return true;
        },
        install(battle, unit) {
          battle.on('deploy', (ctx) => { if (ctx.unit === unit) unit.trait.veen = null; }, { owner: unit });
          battle.on('death', (ctx) => { if (ctx.unit && ctx.unit.side === 'enemy') stateOf(unit).q.delete(ctx.unit.id); }, { owner: unit });
        },
      },
      skills: {
        [S1]: { kind: 'duration', trigger: { rule: 'SP_FULL' }, mods: { aspd: num(b1.attack_speed) } },
        [S2]: {
          kind: 'duration',
          mods: { batPct: batMod(b2.base_attack_time, chess) },
          onStart({ battle, unit }) { stateOf(unit).k = 0; battle.removeBuff(unit, S2_STACK); },
          onEnd({ battle, unit }) { stateOf(unit).k = 0; battle.removeBuff(unit, S2_STACK); },
        },
        [S3]: {
          kind: 'ammo',
          ammo: num(b3['attack@trigger_time'], 1),
          mods: { aspd: num(b3.attack_speed) },
          // bullets: 1 per stored energy, merge_cnt per 转置能量 the attack released (none without)
          onAttack(ctx) {
            ctx.noAmmo = true;
            const { battle, unit, skill } = ctx;
            const v = stateOf(unit);
            const n = v.use;
            v.use = 0;
            for (let i = 0; i < n && skill.active; i++) {
              skill.ammoLeft--;
              battle.emit('ammoUsed', { unit, left: skill.ammoLeft, skill });
              if (skill.ammoLeft <= 0) skill.end('ammo');
            }
          },
        },
      },
      talents: [
        { install(battle, unit) { // “在挥刀之前”: ATK while holding a 转置能量, ASPD while holding none
          const atk = num(t0.atk), aspd = num(t0.attack_speed);
          if (atk) toggleBuff(battle, unit, 'talent:veen:merged', () => stateOf(unit).t > 0, { atkPct: atk });
          if (aspd) toggleBuff(battle, unit, 'talent:veen:unmerged', () => stateOf(unit).t === 0, { aspd });
        } },
        { install(battle, unit) { // 战争技艺: the stacks come with every hit (warOn); she never picks a marked enemy
          battle.on('beforeAttack', (ctx) => {
            if (ctx.attacker !== unit || ctx.targets.every((e) => !marked(unit, e))) return;
            const prof = ctx.profile || unit.profile;
            const cands = validTargets(battle, unit, prof);
            sortEnemyTargets(battle, unit, cands, prof.priority);
            ctx.targets = cands.slice(0, Math.max(1, ctx.targets.length));
          }, { owner: unit });
        } },
      ],
      install(battle, unit) {
        // MSC-Y: ASPD while she holds stored energy
        const msc = num(hidden.attack_speed);
        if (msc) toggleBuff(battle, unit, 'trait:veen:stored', () => { const v = stateOf(unit); return v.s + v.t > 0; }, { aspd: msc });
        // the volley leaves with the attack: 转置能量 → main → stored, each with the ATK of its release (S2 stacks between)
        battle.on('attack', (ctx) => {
          if (ctx.attacker !== unit || !ctx.targets.length) return;
          const v = stateOf(unit);
          const t = v.t, s = v.s;
          v.t = 0; v.s = 0;
          const s3 = skillOn(unit, S3);
          const pre = [], post = [];
          for (let i = 0; i < t; i++) { if (!s3) pre.push({ atk: unit.s.atk, scale: merge, stacks: merge }); s2Stack(battle, unit, merge); }
          const main = { atk: unit.s.atk, scale: s3 ? num(b3['attack@base_atk_scale'], 1) : 1, bounces: s3 ? s + merge * t : 0 };
          s2Stack(battle, unit, 1);
          for (let i = 0; i < s; i++) { if (!s3) post.push({ atk: unit.s.atk, scale: 1, stacks: 1 }); s2Stack(battle, unit, 1); }
          v.use = s3 ? s + merge * t : 0;
          ctx.targets.forEach((tg, i) => {
            const list = v.q.get(tg.id) ?? [];
            list.push(i === 0 ? { pre, main, post } : { pre: [], main: { atk: main.atk, scale: main.scale, bounces: 0 }, post: [] });
            v.q.set(tg.id, list);
          });
          if (t || s) battle.fx('veenVolley', { x: unit.x, y: unit.y, id: unit.id, target: ctx.targets[0].id, stored: s, merged: t });
        }, { owner: unit });
      },
    };
  },
};
