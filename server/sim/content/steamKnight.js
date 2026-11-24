// server/sim/content/steamKnight.js — 'The Last Steam Knight' (enemy_1533_stmkgt) as the Victoria bond's ALLY, dev sandbox
// slice (crew-docs/steam-knight-slice-design.md, user decisions of 2026-11-24). Everything here runs only when the
// battle spec carries `flags.steamKnight` ({ enabled: true, …panel values }); a vanilla battle never reaches it.
//
// What he does (user decisions): he arrives through the Victoria bond (6 members) and drops onto Vina Victoria first; he
// blocks; full power from spawn (the Boost's speed / attack speed always on, no second phase, no revive); he never damages
// a friendly operator (every damage here is dealt to an enemy); his leap is one of his attacks (Boost's cooldown); EVERY
// landing — the first drop and every leap — starts the PILE BUNKER: a stance, a boost along a straight lane, a side shove
// of the normal enemies it passes, then one massive blow on an elite or boss whose damage grows with the distance boosted.
//
// Numbers: official ones cite their source. Dash speed, damage per tile, side damage, shove distance, the stance length
// after a landing and the wait limit have NO official source: they are PANEL VALUES (`flags.steamKnight.*`), read here
// without a default — a missing one switches that part off (no dash / no extra damage), never a guessed number.

import { COLS, ROWS, MOVE_SCALE, BLOCK_RADIUS_SQ, TICK } from '../constants.js';
import { canTargetEnemy } from '../targeting.js';
import { pushTiles, pushUnbalance } from '../battle/displacement.js';
import { hypot } from '../detmath.js';

export const STEAM_KNIGHT_ID = 'enemy_1533_stmkgt';

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const has = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// ---- official values -----------------------------------------------------------------------------------------------
// Clip lengths (s): [src: official enm_art_17.ab enemy_1533_stmkgt.skel animations, data/assets.json
// enemies.enemy_1533_stmkgt.spineLocal.animations]
const CLIP = Object.freeze({
  stanceBeginLen: 5,      // Skill_1_Begin_A 5 s
  attackLen: 2,           // Attack_A 2 s
  blowLen: 2.5,           // Skill_1_Attack_A 2.5 s
  blowHit: 0.7,           // Skill_1_Attack_A strike frame 0.7 s (spineLocal.hits)
  leapUpLen: 1.2,         // FlyToMoon: Skill_2_Begin_A 1.2 s
  landLen: 1.5,           // DownToTile: Skill_2_End_A 1.5 s (the only landing clip)
  landTouch: 0.4,         // its touchdown: bone Common's translate falls from 4952 to 0 at key 0.400 (skel Skill_2_End_A)
});
// Zantetsuken [src: official enemy_database enemy_1533_stmkgt skills Zantetsuken]: times 3, atk_scale 1.25, spCost 4
const ZAN_TIMES = 3, ZAN_SCALE = 1.25, ZAN_SP = 4;
// Boost [src: official enemy_database skills Boost]: move_speed +0.3, attack_speed +100, cooldown 45, initCooldown 25
const BOOST_MOVE = 0.3, BOOST_ASPD = 100, LEAP_CD = 45, LEAP_FIRST = 25;
// reborn.damage_resistance 0.3 [src: official enemy_database talentBlackboard reborn.damage_resistance]
const SECOND_FORM_RESIST = 0.3;

const DIRS = Object.freeze({ RIGHT: [0, 1], LEFT: [0, -1], UP: [1, 0], DOWN: [-1, 0] }); // dir.js: UP = +row (row 0 is the bottom)
const CARDINAL = Object.freeze([[0, 1], [0, -1], [1, 0], [-1, 0]]);
const PROFILE = Object.freeze({ canHitFly: false });

const cfgOf = (battle) => {
  const c = battle.flags?.steamKnight;
  return c && typeof c === 'object' && c.enabled ? c : null;
};

const isBig = (e) => e.isBoss || e.def?.rank === 'ELITE' || e.def?.rank === 'BOSS';
/** The ally blue box: the end tiles of the field's ground routes (simdata normalizeRoute `end`, [r, c]), inside the rect. */
const homeEnds = (battle) => {
  const R = battle.rect, out = [];
  for (const rt of battle.routes || []) {
    if (!rt || rt.motion !== 'WALK' || !Array.isArray(rt.end)) continue;
    const r = Math.max(R.r0, Math.min(R.r1, rt.end[0])), c = Math.max(R.c0, Math.min(R.c1, rt.end[1]));
    if (!out.some(([a, b]) => a === r && b === c)) out.push([r, c]);
  }
  return out;
};
const groundFoes = (battle, u) => battle.enemies.filter((e) => e.alive && !e.hidden && !e.isFlying && canTargetEnemy(u, e, PROFILE));

/** Straight lane from tile (r, c) along `d`: the clear tile count and the enemies on it (offset < 0.5), nearest first. */
function lane(battle, r, c, d, foes) {
  let n = 0, rr = r, cc = c;
  for (;;) {
    rr += d[0]; cc += d[1];
    if (!battle.grid.inRect(rr, cc) || !battle.grid.groundPassable(rr, cc)) break;
    n++;
    if (n > ROWS + COLS) break;
  }
  const hits = [];
  for (const e of foes) {
    const along = (e.y - r) * d[0] + (e.x - c) * d[1];
    const side = Math.abs((e.y - r) * d[1] - (e.x - c) * d[0]);
    if (along > 0.3 && along <= n + 0.5 && side < 0.5) hits.push({ e, along });
  }
  hits.sort((a, b) => a.along - b.along);
  return { n, hits };
}

function freeTileNear(battle, x, y, avoid = null) {
  let best = null, bd = Infinity;
  const r0 = Math.round(y), c0 = Math.round(x);
  for (let r = r0 - 3; r <= r0 + 3; r++) {
    for (let c = c0 - 3; c <= c0 + 3; c++) {
      if (!battle.grid.inRect(r, c) || !battle.grid.groundPassable(r, c) || !battle.grid.isLow(r, c)) continue;
      const o = battle._occ[r * COLS + c];
      if ((o && o.alive && o !== avoid) || battle.downOn(r, c)) continue;
      const d = (c - x) * (c - x) + (r - y) * (r - y);
      if (d < bd - 1e-9) { bd = d; best = [r, c]; }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------------
// the kit

export function steamKnightKit(bb, raw) {
  const dmgType = raw?.dmgType === 'arts' ? 'arts' : 'phys';
  return {
    skill: null,
    // (fork, 2026-11-24) he attacks every enemy he blocks, like a Centurion (强攻手): the engine's `hitAllBlocked`
    // takes up to his block count from his range, the blocked ones first (ai.js targetCount) [src: PRTS 分支特性信息
    // 强攻手 "普通攻击最大目标数等于阻挡数（不会低于1）"; server/sim/ai.js:360-370]
    trait: { attack: 'melee', dmgType, projectile: null, canHitFly: false, maxTargets: 1, hitAllBlocked: true, heal: null, noAttack: false },
    install(battle, unit) {
      const cfg = () => cfgOf(battle) ?? {};
      const sk = unit.mem.sk = { phase: 'none', walk: null, leapAt: LEAP_FIRST, attacks: 0, t: 0, clock: 0, dir: DIRS.RIGHT, dash: null, target: null };
      // he blocks (user, 2026-11-24); the official enemy record has blockCnt 0, so how many is a PANEL VALUE. A cleared
      // panel field is off (`sandbox-steamknight.js`: an empty input sends nothing) — the same reading as the dash and
      // the side damage — so the fallback is 0, not 1 (the sandbox panel's own start value is 1)
      unit.base.blockCnt = has(cfg().blockCnt) ? Math.floor(cfg().blockCnt) : 0;
      // his own walking speed: an ally's base is 0 (units.js), so he walked on the Boost's +0.3 alone
      // [src: official enemy_database enemy_1533_stmkgt level 0 attributes moveSpeed 0.5]
      unit.base.moveSpeed = num(battle.data.getEnemy(STEAM_KNIGHT_ID)?.stats?.moveSpeed, 0);
      // full power from spawn: the Boost's move speed and attack speed stay on [src: Boost move_speed / attack_speed]
      battle.addBuff(unit, { key: 'sk:boost', persist: true, allowDead: true, mods: { moveFlat: BOOST_MOVE, aspd: BOOST_ASPD } });
      // his stats, tunable in the sandbox panel (the user, 2026-11-24: "I would like to tune his stats"): a panel value
      // replaces the official record's (enemy_database attributes atk 1600, maxHp 65000, def 2000, baseAttackTime 5)
      for (const k of ['atk', 'maxHp', 'def', 'bat']) if (has(cfg()[k]) && cfg()[k] > 0) unit.base[k] = cfg()[k];
      if (cfg().secondFormResist) battle.addBuff(unit, { key: 'sk:resist', persist: true, allowDead: true, mods: { dmgTakenMul: 1 - SECOND_FORM_RESIST } });

      const setPhase = (p, extra = {}) => { sk.phase = p; sk.t = 0; Object.assign(sk, extra); };
      const SHIELD = 'sk:untouchable';
      // Invincible only in the air and at the landing: the official leap flags him invincible from take-off to landing
      // [src: official buff stmkgt_invincible[hero_bomb]]. In the bunker (stance, dash, thrust) he can be hit but blocks
      // nobody (his body is not on the tile his block sits on): `noBlock` alone.
      const BUNKER = 'sk:bunker';
      const shield = (on) => {
        // (the official HeroBomb's invincibility has no visible effect of its own: the effect Dev 65 laid on it, the
        // Reborn talent's `stmkgt_immortal_buff_01`, is the boss's revive look and read wrong on a landing — the user,
        // 2026-11-24. The official TriggerHeroBomb shield stays, played by the generic talent layer)
        if (on && !unit.findBuff(SHIELD)) {
          battle.addBuff(unit, { key: SHIELD, persist: true, allowDead: true, flags: { untargetable: true, invulnerable: true, noBlock: true, disarm: true } });
        }
        if (!on && unit.findBuff(SHIELD)) battle.removeBuff(unit, SHIELD);
      };
      const bunker = (on) => {
        // (disarm: no normal attack starts during the pile bunker — its clips are the official Zantetsuken's)
        if (on && !unit.findBuff(BUNKER)) battle.addBuff(unit, { key: BUNKER, persist: true, allowDead: true, flags: { noBlock: true, disarm: true } });
        if (!on && unit.findBuff(BUNKER)) battle.removeBuff(unit, BUNKER);
      };
      // the charge before the boost: he stands and keeps blocking by contact (the user, 2026-11-24: "he should block
      // while charging"); only his weapon is out of action, so the buff disarms without the bunker's noBlock
      const CHARGE = 'sk:charge';
      const charging = (on) => {
        if (on && !unit.findBuff(CHARGE)) battle.addBuff(unit, { key: CHARGE, persist: true, allowDead: true, flags: { disarm: true } });
        if (!on && unit.findBuff(CHARGE)) battle.removeBuff(unit, CHARGE);
      };
      // the standing Zantetsuken: no normal attack starts while it runs; he keeps blocking
      const ZAN = 'sk:zan';
      const zanning = (on) => {
        if (on && !unit.findBuff(ZAN)) battle.addBuff(unit, { key: ZAN, persist: true, allowDead: true, flags: { disarm: true } });
        if (!on && unit.findBuff(ZAN)) battle.removeBuff(unit, ZAN);
      };
      // walking up to an enemy in reach that nobody blocks: no swing starts on the way
      const CLOSE = 'sk:close';
      const closing = (on) => {
        if (on && !unit.findBuff(CLOSE)) battle.addBuff(unit, { key: CLOSE, persist: true, allowDead: true, flags: { disarm: true } });
        if (!on && unit.findBuff(CLOSE)) battle.removeBuff(unit, CLOSE);
      };
      const phaseFx = (kind, extra = {}) => battle.fx('phase', { x: unit.x, y: unit.y, id: unit.id, kind, form: kind, ...extra });
      const clearForm = () => battle.fx('phase', { x: unit.x, y: unit.y, id: unit.id, kind: 'skFight', form: null });

      // ---- Zantetsuken ([Furious Defense]): 1 SP per normal attack, at 4 SP his next turn is the standing charge — the
      // official stance (Skill_1_Begin_A 5 s) and thrust (Skill_1_Attack_A, strike at 0.7 s), 3 hits at 1.25 ATK
      // [src: official enemy_database enemy_1533_stmkgt skills Zantetsuken spCost 4, times 3, atk_scale 1.25]
      battle.on('hit', (ctx) => {
        if (ctx.source !== unit || !ctx.dmg?.isAttack || !ctx.target || ctx.target.side !== 'enemy') return;
        sk.attacks++;
        if (sk.attacks >= ZAN_SP) sk.zanReady = true;
      }, { owner: unit });

      // ---- his normal attacks take the enemies he blocks (the user, 2026-11-24: "attack all enemies he blocks"):
      // `hitAllBlocked` collects up to his block count from his range with the blocked ones first (ai.js targetCount);
      // this narrows them to the blocked ones, so a large block count never reaches enemies that walk past him
      battle.on('beforeAttack', (ctx) => {
        if (ctx.attacker !== unit || ctx.isSkill) return;
        const blocked = (unit.blocking || []).filter((e) => e.alive);
        if (blocked.length) ctx.targets = blocked.slice();
      }, { owner: unit });

      // ---- every landing starts the bunker
      sk.beginLanding = (x, y, dir, leap = false) => {
        sk.walk = null;
        battle.releaseBlocked(unit);
        unit.x = x; unit.y = y;
        shield(true);
        phaseFx('skDrop', { dur: CLIP.landLen });
        setPhase('drop', { dir, dur: CLIP.landLen, dash: null, target: null });
        battle.fx('steamKnight', { id: unit.id, kind: 'landing', x, y, leap });
        // the moment his feet hit the ground (the clip's touchdown): the impact look and the shake hang on it
        battle.after(CLIP.landTouch, () => { if (unit.alive) battle.fx('steamKnight', { id: unit.id, kind: 'touchdown', x, y }); }, { owner: unit });
      };

      /** The stance's pick, taken at once when the charge ends (the user, 2026-11-24: no waiting): an elite or boss in the
       *  lane first, else the farthest enemy in it — the longest boost does the most damage — and none ends the bunker. */
      const pickLaneTarget = (dir, skip = []) => {
        const { hits } = lane(battle, Math.round(unit.y), Math.round(unit.x), dir, groundFoes(battle, unit).filter((e) => !skip.includes(e)));
        if (!hits.length) return null;
        const big = hits.filter((h) => isBig(h.e));
        const pool = big.length ? big : hits;
        pool.sort((a, b) => b.along - a.along);
        return pool[0].e;
      };

      const endBunker = () => {
        shield(false);
        bunker(false);
        charging(false);
        // he stays where the thrust left him (free position)
        clearForm();
        battle.fx('steamKnight', { id: unit.id, kind: 'bunkerEnd', x: unit.x, y: unit.y });
        setPhase('fight', { dash: null, target: null });
      };

      const startStance = () => {
        const c = cfg();
        if (!has(c.dashSpeed) || !(c.dashSpeed > 0)) { endBunker(); return; }
        // the charge is the official stance clip at its own speed, all of it: he boosts only once it is done (the user,
        // 2026-11-24: "His charge up for the boost should play that animation at the correct speed, and he only boost
        // forward when he's actually ready") [src: official enm_art_17.ab enemy_1533_stmkgt.skel Skill_1_Begin_A 5 s]
        const stanceDur = CLIP.stanceBeginLen;
        setPhase('stance', { stanceDur });
        shield(false);   // the landing's invincibility ends with the landing clip
        charging(true);
        // (the engine's tile block stays off; contactBlock holds the enemies he catches)
        if (!unit.findBuff('sk:contact')) battle.addBuff(unit, { key: 'sk:contact', persist: true, allowDead: true, flags: { noNewBlock: true } });
        phaseFx('skStance', { dur: stanceDur });
        // dr / dc / boostIn: only the charge before a boost has them (display: the thrusters light ahead of it)
        battle.fx('steamKnight', { id: unit.id, kind: 'stance', x: unit.x, y: unit.y, castDur: stanceDur + CLIP.blowLen + CLIP.blowHit, boostIn: stanceDur, dr: sk.dir[0], dc: sk.dir[1] });
        holdSound(stanceDur);
      };
      // the stance clip's own sound event: OnPlayAudio(zan_hold) at 2.5 s of the 5 s Skill_1_Begin_A [src: official
      // enm_art_17.ab enemy_1533_stmkgt.skel Skill_1_Begin_A events], at the same share of a faster stance
      const holdSound = (stanceDur) => {
        const ph = sk.phase;
        battle.after(stanceDur * (2.5 / CLIP.stanceBeginLen), () => {
          if (unit.alive && sk.phase === ph) battle.fx('steamKnight', { id: unit.id, kind: 'zanHold', x: unit.x, y: unit.y });
        }, { owner: unit });
      };

      // ---- the standing Zantetsuken (his official charge, no dash): stance, then thrust; 3 hits at its strike frame
      const startZan = (target) => {
        sk.zanReady = false;
        sk.attacks = 0;
        zanning(true);
        setPhase('zan', { target, zanHit: false });
        phaseFx('skStance', { dur: CLIP.stanceBeginLen });
        battle.fx('steamKnight', { id: unit.id, kind: 'stance', x: unit.x, y: unit.y, castDur: CLIP.stanceBeginLen + CLIP.blowLen });
        holdSound(CLIP.stanceBeginLen);
      };
      const zanTarget = () => {
        const t = sk.target;
        if (t && t.alive && unit.blocking.includes(t)) return t;
        let best = unit.blocking.find((e) => e.alive) ?? null, bd = Infinity;
        if (!best) for (const e of groundFoes(battle, unit)) { const d = hypot(e.x - unit.x, e.y - unit.y); if (d <= 1.5 && d < bd - 1e-9) { bd = d; best = e; } }
        return best;
      };

      // ---- the pushes of his big blows (the boost's, the standing Zantetsuken's; the force of each is a PANEL VALUE)
      /** May the body stand at (x, y): the tiles its movement may cross (displacement.js displace). */
      const bodyOk = (e, x, y) => {
        const r = Math.round(y), col = Math.round(x);
        return e.motion === 'FLY' ? battle.grid.inRect(r, col) : battle.grid.groundPassable(r, col);
      };
      /**
       * Before the damage: what a push of `force` will do to `e`, whether it lives or dies of the blow (the user,
       * 2026-11-25: the push also on the target the attack kills). The returned call pushes it: a survivor by the official
       * force rule (displacement.js push, PUSH_TILES: force less its weight; leaders and 失衡免疫 stay), a body killed by
       * the blow the same distance, its slide marked `corpse` for the view (units.js slideTo).
       */
      const readyPush = (e, force, dir) => {
        if (!has(force) || !battle._displaceable(e)) return () => {};
        const level = battle.forceLevel(e, force);
        return () => {
          if (e.hidden) return;
          if (e.alive) { battle.push(e, force, { from: unit, dir: { x: dir[1], y: dir[0] }, fixed: true }); return; }
          slideBody(e, dir, pushTiles(level), pushUnbalance(level));
        };
      };
      /** A dead body slides `tiles` along `dir` over the tiles it may cross, in the steps of displacement.js displace. */
      const slideBody = (e, dir, tiles, dur) => {
        let left = tiles, moved = 0;
        while (left > 1e-9) { // loop-cap: a push is at most 3.53 tiles (PUSH_TILES), step 0.1
          const s = Math.min(0.1, left);
          const x = e.x + dir[1] * s, y = e.y + dir[0] * s;
          if (!bodyOk(e, x, y)) break;
          e.x = x; e.y = y; left -= s; moved += s;
        }
        if (moved > 0) battle.fx('displace', { x: e.x, y: e.y, id: e.id, dur, keepFacing: true, corpse: true });
      };
      // Two ticks after the blow: the view draws a move up to a tick ahead of that tick's events, and the target was seen
      // flying before its hit burst (a look, no rule).
      const pushLater = (pushes) => { battle.after(2 * TICK, () => { for (const p of pushes) p(); }, { owner: unit }); };

      // ---- the drag (the user, 2026-11-25: the boost drags normal enemies along, up to his block count; they take the
      // blow with the target, and they and their bodies are pushed with it). An enemy is caught where he would block it:
      // within the official ground block radius of him [src: server/sim/constants.js BLOCK_RADIUS_SQ.ground]
      const DRAG = 'sk:dragged';
      const dragging = () => cfg().drag !== false;
      const canDrag = (e) => dragging() && !isBig(e) && battle._displaceable(e);
      const dragRoom = (d, e) => d.dragged.reduce((n, x) => n + (x.blockWeight ?? 1), 0) + (e.blockWeight ?? 1) <= Math.floor(num(unit.s.blockCnt, 0));
      /** It neither walks, attacks nor is blocked while it is carried: the official 失衡 state, held two ticks ahead. */
      const hold = (e) => {
        if (!e.alive) return;
        battle._unblock(e);
        battle.addBuff(e, { key: DRAG, duration: 2 * TICK, flags: { unblockable: true } });
        battle._unbalance(e, 2 * TICK);
        e.moving = false;
      };
      const grab = (d, e) => {
        d.dragged.push(e);
        d.shoved.add(e);
        hold(e);
        battle.fx('steamKnight', { id: unit.id, kind: 'drag', x: e.x, y: e.y, target: e.id });
      };
      /** The carried move with him (a body that died on the way too); one that a wall stops is left behind. */
      const carry = (d, mv) => {
        for (let i = d.dragged.length - 1; i >= 0; i--) {
          const e = d.dragged[i];
          const x = e.x + d.dir[1] * mv, y = e.y + d.dir[0] * mv;
          if (e.hidden || !bodyOk(e, x, y)) { d.dragged.splice(i, 1); continue; }
          e.x = x; e.y = y;
          if (e.route) e.route.pts = null;
          hold(e);
        }
      };

      const startDash = (target) => {
        const dir = sk.dir;
        // the charge ends with the boost: its buff gives way to the bunker's (no blocking from a body that is not on the
        // tile any more), and the enemies he held are let go
        charging(false);
        bunker(true);
        const held = unit.blocking.slice();
        battle.releaseBlocked(unit);
        const dash = { dir, target, travelled: 0, shoved: new Set(), dragged: [], clipAt: sk.clock, lead: 0, form: 'skBlow' };
        // the normal enemies he was holding come along
        for (const e of held) if (e !== target && e.alive && canDrag(e) && dragRoom(dash, e)) grab(dash, e);
        // He boosts at once and the thrust clip runs with it, started this far into its wind-up so that its strike frame
        // (0.7 s) is the moment he reaches the target (the user, 2026-11-24: the pile was fully out while he still stood
        // at the start — never again: the boost and the wind-up share the run, and the extension is the hit). The clip's
        // OnAttack frame at the hit holds for any run: the lead is the strike frame less the run.
        dash.lead = Math.max(0, CLIP.blowHit - runTo(dir, target));
        phaseFx('skBlow', { dur: CLIP.blowLen, lead: dash.lead });
        battle.fx('steamKnight', { id: unit.id, kind: 'dashStart', x: unit.x, y: unit.y, dr: dir[0], dc: dir[1], target: target.id });
        setPhase('dash', { dash });
      };
      const c0 = () => cfg();
      /** Seconds of boost until the target is in the pile's reach (1 tile). */
      const runTo = (dir, t) => Math.max(0, (t.y - unit.y) * dir[0] + (t.x - unit.x) * dir[1] - 1.0) / c0().dashSpeed;
      const lostTarget = (d) => {
        const t = d.target;
        if (!t || !t.alive || t.hidden || !canTargetEnemy(unit, t, PROFILE)) return true;
        const al = (t.y - unit.y) * d.dir[0] + (t.x - unit.x) * d.dir[1];
        const off = (t.y - unit.y) * d.dir[1] - (t.x - unit.x) * d.dir[0];
        return al < -0.5 || Math.abs(off) > 1.0;
      };
      /** The next best target of a boost under way: the charge's own pick in the lane ahead, else the foremost he drags. */
      const retarget = (d) => {
        let t = pickLaneTarget(d.dir, [...d.dragged, d.target]);
        if (!t) {
          const al = (e) => (e.y - unit.y) * d.dir[0] + (e.x - unit.x) * d.dir[1];
          for (const e of d.dragged) if (e.alive && !e.hidden && canTargetEnemy(unit, e, PROFILE) && (!t || al(e) > al(t) + 1e-9)) t = e;
        }
        if (!t) return false;
        d.dragged = d.dragged.filter((e) => e !== t);
        d.target = t;
        sk.target = t;
        // the thrust is aimed again, so that its strike frame stays the hit; two names of one form, since a form already
        // on is not started again (units.js setForm)
        const lead = Math.max(0, CLIP.blowHit - runTo(d.dir, t));
        if (Math.abs(lead - (sk.clock - d.clipAt + d.lead)) > 0.05) {
          d.form = d.form === 'skBlow' ? 'skBlowAgain' : 'skBlow';
          d.lead = lead; d.clipAt = sk.clock;
          phaseFx(d.form, { dur: CLIP.blowLen, lead });
        }
        battle.fx('steamKnight', { id: unit.id, kind: 'retarget', x: t.x, y: t.y, target: t.id });
        return true;
      };

      // The blow clip (Skill_1_Attack_A) starts on the flight path, so that its strike frame (0.7 s) is the moment he
      // reaches the target: the pile is already forward on impact (the user, 2026-11-24). `d.clipAt` = when it started.
      const impact = () => {
        const c = cfg();
        const d = sk.dash, tiles = d.travelled, t = d.target;
        setPhase('blow');
        sk.t = sk.clock - d.clipAt;   // the clip has been running since it started on the flight path
        // 0 tiles = the official 3 hits at 1.25 ATK; the distance boosted adds on top (panel: ATK scale per tile)
        const scale = ZAN_TIMES * ZAN_SCALE + (has(c.dmgPerTile) ? c.dmgPerTile * tiles : 0);
        battle.fx('steamKnight', { id: unit.id, kind: 'impact', x: t.x, y: t.y, tiles, dr: d.dir[0], dc: d.dir[1], target: t.id });
        // the target and everyone he dragged take the whole blow, and are pushed along the boost, dead or alive
        const pushes = [];
        for (const e of [t, ...d.dragged]) {
          if (!e.alive) {
            // a body that died on the way: its weight as it was, pushed with the others
            if (has(c.pushForce)) { const lv = battle.forceLevel(e, c.pushForce); pushes.push(() => slideBody(e, d.dir, pushTiles(lv), pushUnbalance(lv))); }
            continue;
          }
          pushes.push(readyPush(e, c.pushForce, d.dir));
          if (e !== t) battle.fx('steamKnight', { id: unit.id, kind: 'dragHit', x: e.x, y: e.y, target: e.id });
          battle.dealDamage(unit, e, { amount: unit.s.atk * scale, type: dmgType, isSkill: true, tags: ['steamKnight', 'bunker'] });
        }
        pushLater(pushes);
        // the thrust holds its ground: he blocks by contact again (an enemy walked through him during it, and he crept
        // after it when it was over — the user, 2026-11-24)
        bunker(false);
        charging(true);
        battle.fx('steamKnight', { id: unit.id, kind: 'impactHit', x: t.x, y: t.y, tiles, scale, target: t.id });
      };

      // ---- the leap: take-off (FlyToMoon), then the landing at the rear tile with the longest clear lane to an elite / boss
      const bestLanding = () => {
        const foes = groundFoes(battle, unit);
        const big = foes.filter(isBig);
        const pool = big.length ? big : foes;
        if (!pool.length) return null;
        // He lands in front of the ally blue box, the ground routes' end (the user, 2026-11-24: with no ground operator
        // left the longest lane put him in front of the enemy red box): of the tiles with a clear lane to the target,
        // those nearest a route's end; then the longest lane. A field with no ground route end: the longest lane alone.
        const ends = homeEnds(battle);
        let best = null;
        const R = battle.rect;
        for (let r = R.r0; r <= R.r1; r++) {
          for (let c = R.c0; c <= R.c1; c++) {
            if (!battle.grid.groundPassable(r, c) || !battle.grid.isLow(r, c)) continue;
            if (ends.some(([er, ec]) => er === r && ec === c)) continue;   // in front of the box, not on it
            // a tile an operator stands on is as good (his position is free, as at the first drop onto Vina; the user,
            // 2026-11-25: "why not land where horn is for more boost distance?")
            let home = 0;
            if (ends.length) { home = Infinity; for (const [er, ec] of ends) home = Math.min(home, hypot(r - er, c - ec)); }
            for (const d of CARDINAL) {
              const { hits } = lane(battle, r, c, d, pool);
              if (!hits.length) continue;
              const len = hits[0].along;
              if (!best || home < best.home - 1e-9 || (home <= best.home + 1e-9 && len > best.len + 1e-9)) best = { r, c, d, len, home };
            }
          }
        }
        return best;
      };

      const startLeap = () => {
        if (!bestLanding()) return false;
        sk.leapAt = sk.clock + LEAP_CD;
        shield(true);
        battle.releaseBlocked(unit);
        sk.walk = null;
        phaseFx('skLeapUp', { dur: CLIP.leapUpLen });
        battle.fx('steamKnight', { id: unit.id, kind: 'leapUp', x: unit.x, y: unit.y });
        setPhase('leapUp');
        battle.after(CLIP.leapUpLen, () => {
          if (!unit.alive || sk.phase !== 'leapUp') return;
          const spot = bestLanding();   // read again at the landing: the field has moved on
          if (!spot) { endBunker(); return; }
          sk.beginLanding(spot.c, spot.r, spot.d, true);
        }, { owner: unit });
        return true;
      };

      // ---- walking (a ground ally: tile hops; relocate keeps the tile occupancy true)
      // ---- a free position, like an enemy (the user, 2026-11-24: "fight without having to snap to a specific tile"): his
      // x / y never snap, and he blocks by contact from where he stands, not from a tile — an enemy within the official
      // ground block radius of his position [src: server/sim/constants.js BLOCK_RADIUS_SQ.ground, PRTS 游戏数据基础 §阻挡半径]
      // while he has room for its block weight (the engine's tile block is off for him: `noBlock`, the tile he spawned on
      // stays his). His range is his tile and the 4 around it, from where he stands now.
      const RANGE = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]];
      let keysAt = -1;
      const refreshKeys = () => {
        const r = Math.round(unit.y), c = Math.round(unit.x);
        if (keysAt === r * COLS + c) return;
        keysAt = r * COLS + c;
        const keys = [];
        for (const [dr, dc] of RANGE) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS) keys.push(rr * COLS + cc); }
        unit.rangeKeys = keys; unit.rangeKeySet = new Set(keys); unit.baseRangeKeys = keys;
      };
      /** An enemy he may block now: on the ground, seen, not blocked by anyone, no flag that keeps it out of a block. */
      const blockable = (e) => {
        if (!e.alive || e.hidden || e.isFlying || e.blockedBy) return false;
        const f = e.s.flags;
        return !(f.unblockable || f.levitate || f.fear || f.sleep);
      };
      const contactBlock = () => {
        const R2 = BLOCK_RADIUS_SQ.ground;
        // (a blocked enemy stands still; a push or pull unblocks it itself: displacement.js _unblock)
        for (const e of unit.blocking.slice()) if (e.blockedBy === unit && !e.alive) battle._unblock(e);
        const cap = Math.max(0, Math.floor(num(unit.s.blockCnt, 1)));
        let used = 0;
        for (const e of unit.blocking) used += e.blockWeight ?? 1;
        for (const e of battle.enemies) {
          if (used >= cap) break;
          if (!blockable(e)) continue;
          const w = e.blockWeight ?? 1;
          if (used + w > cap) continue;
          if ((e.x - unit.x) * (e.x - unit.x) + (e.y - unit.y) * (e.y - unit.y) >= R2) continue;
          e.blockedBy = unit;
          unit.blocking.push(e);
          e.moving = false;
          used += w;
          if (battle._hooks?.blocked) battle.emit('blocked', { blocker: unit, enemy: e });
        }
      };
      const walkSpeed = () => Math.max(0.05, unit.s.moveSpeed * MOVE_SCALE);
      /** One step toward the nearest enemy, along the ground path, unless one is within reach (he fights where he stands). */
      // An enemy that walks past him unblocked (none blocks it, he has room) is met: he steps into contact and blocks it,
      // instead of hitting it from 1.5 tiles while it walks on and then following it (the user, 2026-11-24: "he seems to
      // get dragged along by an enemy behind him. He should be blocking that enemy, stand there and fight it").
      // Never while a swing plays (he slid with his attack clip on), and only to an enemy that stands: creeping after one
      // that walks past was the slide the user saw at tick 1316 (2026-11-24). One that walks into contact is blocked there.
      const stepToward = (dt) => {
        if (unit.cast || battle.time - unit.lastCastAt < CLIP.attackLen - 1e-9) return;
        const room = unit.blocking.reduce((n, e) => n + (e.blockWeight ?? 1), 0) < Math.floor(num(unit.s.blockCnt, 1));
        // He walks only to an enemy that stands (blocked, waiting): one walking on toward the blue box outpaces him, and
        // following it was the drag the user saw.
        let tgt = null, bd = Infinity, near = Infinity, free = null, fd = Infinity;
        for (const e of groundFoes(battle, unit)) {
          const d = hypot(e.x - unit.x, e.y - unit.y);
          if (d < near) near = d;
          if (!e.moving && d < bd - 1e-9) { bd = d; tgt = e; }
          if (room && !e.moving && blockable(e) && d < fd - 1e-9) { fd = d; free = e; }
        }
        if (free && fd <= 1.5) {
          // straight at it, to inside the official block radius (0.707 tiles [src: server/sim/constants.js
          // BLOCK_RADIUS_SQ.ground]); contactBlock takes it on the next tick
          const s = Math.min(walkSpeed() * dt, Math.max(0, fd - 0.5));
          if (s > 1e-6) { unit.moving = true; unit.x += ((free.x - unit.x) / fd) * s; unit.y += ((free.y - unit.y) / fd) * s; }
          return true;   // closing in: no swing starts until he is there
        }
        // no step while an enemy is within his range's reach (1 tile + the 0.5 an enemy can sit off a tile's centre)
        if (!tgt || near <= 1.5) return;
        const path = battle.grid.findPath(Math.round(unit.y), Math.round(unit.x), Math.round(tgt.y), Math.round(tgt.x));
        const next = path && path.length >= 2 ? path[1] : null;
        if (!next) return;
        const dx = next[1] - unit.x, dy = next[0] - unit.y, d = hypot(dx, dy);
        if (!(d > 1e-6)) return;
        const s = Math.min(d, walkSpeed() * dt);
        unit.moving = true;
        unit.x += (dx / d) * s; unit.y += (dy / d) * s;
      };

      // his death mid-bunker: the view's held loops (the Zantetsuken's, the marker on his target) end with him (the code
      // review, 2026-11-24: they ran on until the target died). Display only.
      battle.on('death', (c) => {
        if (c.unit !== unit) return;
        battle.fx('steamKnight', { id: unit.id, kind: 'bunkerEnd', x: unit.x, y: unit.y });
      });

      // ---- the state machine
      battle.on('tick', ({ dt }) => {
        if (!unit.alive || !unit.deployed) return;
        const c = cfg();
        sk.clock += dt; sk.t += dt;
        if (sk.phase !== 'fight' || !unit.canAct) closing(false);
        unit.moving = false;   // only stepToward sets it: the view plays his Move clip while he walks (snapshot animOf)
        // a stun (unit.canAct: units.js) cuts the stance, the boost or the Zantetsuken before its strike: no blow
        // lands from a stunned knight (the code review, 2026-11-24)
        if (!unit.canAct && (sk.phase === 'stance' || sk.phase === 'dash' || sk.phase === 'zan' || (sk.phase === 'zanBlow' && !sk.zanHit))) {
          zanning(false);
          endBunker();
          return;
        }
        switch (sk.phase) {
          case 'drop':
            if (sk.t >= sk.dur - 1e-9) startStance();
            break;
          case 'stance': {
            contactBlock();   // he holds his ground while the pile presses (the user, 2026-11-24)
            if (sk.t < sk.stanceDur - 1e-9) break;
            // the pick is taken the moment the charge ends (the user, 2026-11-24: no waiting for an elite): the lane's
            // best — an elite or boss, else the farthest enemy — and no target ends the bunker
            const tgt = sk.target && sk.target.alive ? sk.target : pickLaneTarget(sk.dir);
            if (!tgt) { endBunker(); break; }
            sk.target = tgt;
            startDash(tgt);
            break;
          }
          case 'dash': {
            const d = sk.dash;
            // the target died, hid or left his line (pushed aside, or behind him; the band is the shove's own: 1 tile to a
            // side, 0.5 behind): he goes on at the next best one (the user, 2026-11-25), and only with none left it ends
            if (lostTarget(d) && !retarget(d)) { endBunker(); break; }
            const t = d.target;
            const along = (t.y - unit.y) * d.dir[0] + (t.x - unit.x) * d.dir[1];
            const remain = Math.max(0, along - 1.0);
            // he reaches the pile's reach: the blow lands now — the thrust clip was started (with its lead) so that its
            // strike frame is this moment, never a pause at the start (the user, 2026-11-24)
            if (remain <= 1e-9) { impact(); break; }
            // (fork, 2026-11-24) bounded by the distance to the target, not by `remain`: a target that walks away
            // kept `remain` at one tick's step, so the boost matched its walk and trailed it forever (the user saw him
            // "slowly sliding back" from tick 2538). Bounding by `along` always closes in; the impact fires at 1.0
            const mv = Math.min(c.dashSpeed * dt, Math.max(0, along));
            const nr = Math.round(unit.y + d.dir[0] * mv), nc = Math.round(unit.x + d.dir[1] * mv);
            if (!battle.grid.inRect(nr, nc) || !battle.grid.groundPassable(nr, nc)) { endBunker(); break; }
            unit.y += d.dir[0] * mv; unit.x += d.dir[1] * mv; d.travelled += mv;
            carry(d, mv);
            // the normal enemies at its sides: damage and shove (panel values); the ones he runs into come along (drag)
            for (const e of groundFoes(battle, unit)) {
              if (e === t || isBig(e) || d.shoved.has(e)) continue;
              const al = (e.y - unit.y) * d.dir[0] + (e.x - unit.x) * d.dir[1];
              const off = (e.y - unit.y) * d.dir[1] - (e.x - unit.x) * d.dir[0];
              if (al < -0.5 || al > 0.8 || Math.abs(off) > 1.0) continue;
              if (canDrag(e) && dragRoom(d, e) && off * off < BLOCK_RADIUS_SQ.ground) {
                if (al * al + off * off < BLOCK_RADIUS_SQ.ground) { grab(d, e); continue; }
                if (al > 0) continue;   // about to be caught
              }
              d.shoved.add(e);
              if (has(c.sideDamage) && c.sideDamage > 0) battle.dealDamage(unit, e, { amount: unit.s.atk * c.sideDamage, type: dmgType, isSkill: true, tags: ['steamKnight', 'side'] });
              if (has(c.shoveDist) && c.shoveDist > 0 && e.alive) {
                const side = off >= 0 ? 1 : -1;
                battle.displace(e, { x: -d.dir[0] * side, y: d.dir[1] * side }, c.shoveDist, { dur: 0.3 });
              }
              battle.fx('steamKnight', { id: unit.id, kind: 'shove', x: e.x, y: e.y, target: e.id });
            }
            break;
          }
          case 'blow':
            contactBlock();
            if (sk.t >= CLIP.blowLen - 1e-9) endBunker();
            break;
          case 'zan': {
            contactBlock();   // he blocks through the Zantetsuken's charge too (the user, 2026-11-24)
            if (sk.t < CLIP.stanceBeginLen - 1e-9) break;
            setPhase('zanBlow', { target: sk.target, zanHit: false });
            // lead 0: the clip and the hit play on one feed, so its strike frame is the hit (the form's own 0.2 s lead put
            // the pile out before the hit's sound and burst — the user, 2026-11-24)
            phaseFx('skBlow', { dur: CLIP.blowLen, lead: 0 });
            break;
          }
          case 'zanBlow': {
            contactBlock();   // and through its thrust: the enemies he held take its three hits
            if (!sk.zanHit && sk.t >= CLIP.blowHit - 1e-9) {
              sk.zanHit = true;
              // every enemy he blocks takes the three hits (the user, 2026-11-24); with none blocked, the one in front
              const blocked = (unit.blocking || []).filter((e) => e.alive);
              const t = blocked.length ? null : zanTarget();
              // and is pushed the way he faces (his thrust), dead or alive (the user, 2026-11-25), by its own panel force
              const pushes = [];
              for (const x of blocked.length ? blocked : t ? [t] : []) {
                pushes.push(readyPush(x, c.zanPushForce, unit.fwd));
                for (let i = 0; i < ZAN_TIMES; i++) battle.dealDamage(unit, x, { amount: unit.s.atk * ZAN_SCALE, type: dmgType, isSkill: true, tags: ['steamKnight', 'zantetsuken'] });
                battle.fx('steamKnight', { id: unit.id, kind: 'zanHit', x: x.x, y: x.y, target: x.id });
              }
              pushLater(pushes);
            }
            if (sk.t >= CLIP.blowLen - 1e-9) {
              zanning(false);
              clearForm();
              battle.fx('steamKnight', { id: unit.id, kind: 'bunkerEnd', x: unit.x, y: unit.y });
              setPhase('fight', { target: null });
            }
            break;
          }
          case 'leapUp':
            break;
          default: {   // 'none' / 'fight'
            if (sk.phase === 'none') setPhase('fight');
            if (!unit.canAct || unit.s.flags.noMove) break;
            // the engine's tile block stays off — `noNewBlock`: it takes no enemy by its own contact rule from the tile he spawned
            // on, and keeps the ones content hands it (as 酒神's 迷狂牢笼) — he blocks by contact from where he stands
            bunker(false);
            if (!unit.findBuff('sk:contact')) battle.addBuff(unit, { key: 'sk:contact', persist: true, allowDead: true, flags: { noNewBlock: true } });
            refreshKeys();
            if (sk.clock >= sk.leapAt - 1e-9 && has(c.dashSpeed) && c.dashSpeed > 0 && startLeap()) break;
            contactBlock();
            // 4 SP: the standing Zantetsuken on the enemy in front of him (blocked, else the nearest in reach)
            if (sk.zanReady && !unit.cast) { const t = zanTarget(); if (t) { sk.target = t; startZan(t); break; } }
            if (unit.blocking.length) { closing(false); break; }   // blocking: he stays
            closing(stepToward(dt) === true);
          }
        }
      }, { owner: unit });
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// spawn: through the Victoria bond, onto Vina first

const isVina = (u) => /^chess_char_6_07_/.test(String(u.defId ?? ''));

/** Called at battle start by the Victoria bond (bonds/core.js installVictoria) when `flags.steamKnight.enabled`. */
export function spawnSteamKnight(battle, playerId) {
  if (!cfgOf(battle)) return null;
  const ps = battle.getPlayer(playerId);
  const dirName = ps ? ps.dir : 'RIGHT';
  const dir = DIRS[dirName] ?? DIRS.RIGHT;
  const ops = battle.allyUnits.filter((a) => a.kind === 'op' && a.alive && a.deployed && a.ownerId === playerId);
  const vina = ops.find(isVina) ?? ops.find((a) => a.ground) ?? ops[0] ?? null;
  // no operator of his player: in front of the ally blue box (a route's end), else the field's centre
  const home = vina ? null : homeEnds(battle)[0] ?? null;
  const ax = vina ? vina.x : home ? home[1] : (battle.rect.c0 + battle.rect.c1) / 2;
  const ay = vina ? vina.y : home ? home[0] : (battle.rect.r0 + battle.rect.r1) / 2;
  const spot = freeTileNear(battle, ax, ay, null);
  if (!spot) return null;
  const u = battle.spawnToken(playerId, STEAM_KNIGHT_ID, spot[0], spot[1], { dir: dirName });
  if (!u) return null;
  u.mem.steamKnight = true;
  u.mem.sk.beginLanding(ax, ay, dir);
  return u;
}
