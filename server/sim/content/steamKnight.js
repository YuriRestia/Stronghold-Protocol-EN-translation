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

import { COLS, ROWS, MOVE_SCALE } from '../constants.js';
import { canTargetEnemy } from '../targeting.js';
import { hypot } from '../detmath.js';

export const STEAM_KNIGHT_ID = 'enemy_1533_stmkgt';

const has = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// ---- official values -----------------------------------------------------------------------------------------------
// Clip lengths (s): [src: official enm_art_17.ab enemy_1533_stmkgt.skel animations, data/assets.json
// enemies.enemy_1533_stmkgt.spineLocal.animations]
const CLIP = Object.freeze({
  stanceBeginLen: 5,      // Skill_1_Begin_A 5 s
  blowLen: 2.5,           // Skill_1_Attack_A 2.5 s
  blowHit: 0.7,           // Skill_1_Attack_A strike frame 0.7 s (spineLocal.hits)
  leapUpLen: 1.2,         // FlyToMoon: Skill_2_Begin_A 1.2 s
  landLen: 1.5,           // DownToTile: Skill_2_End_A 1.5 s (the only landing clip)
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
    trait: { attack: 'melee', dmgType, projectile: null, canHitFly: false, maxTargets: 1, heal: null, noAttack: false },
    install(battle, unit) {
      const cfg = () => cfgOf(battle) ?? {};
      const sk = unit.mem.sk = { phase: 'none', walk: null, leapAt: LEAP_FIRST, attacks: 0, t: 0, clock: 0, dir: DIRS.RIGHT, dash: null, target: null };
      // he blocks (user, 2026-11-24); the official enemy record has blockCnt 0, so how many is a PANEL VALUE
      unit.base.blockCnt = has(cfg().blockCnt) ? Math.floor(cfg().blockCnt) : 1;
      // full power from spawn: the Boost's move speed and attack speed stay on [src: Boost move_speed / attack_speed]
      battle.addBuff(unit, { key: 'sk:boost', persist: true, allowDead: true, mods: { moveFlat: BOOST_MOVE, aspd: BOOST_ASPD } });
      if (cfg().secondFormResist) battle.addBuff(unit, { key: 'sk:resist', persist: true, allowDead: true, mods: { dmgTakenMul: 1 - SECOND_FORM_RESIST } });

      const setPhase = (p, extra = {}) => { sk.phase = p; sk.t = 0; Object.assign(sk, extra); };
      const SHIELD = 'sk:untouchable';
      // Invincible only in the air and at the landing: the official leap flags him invincible from take-off to landing
      // [src: official buff stmkgt_invincible[hero_bomb]]. In the bunker (stance, dash, thrust) he can be hit but blocks
      // nobody (his body is not on the tile his block sits on): `noBlock` alone.
      const BUNKER = 'sk:bunker';
      const shield = (on) => {
        if (on && !unit.findBuff(SHIELD)) battle.addBuff(unit, { key: SHIELD, persist: true, allowDead: true, flags: { untargetable: true, invulnerable: true, noBlock: true } });
        if (!on && unit.findBuff(SHIELD)) battle.removeBuff(unit, SHIELD);
      };
      const bunker = (on) => {
        if (on && !unit.findBuff(BUNKER)) battle.addBuff(unit, { key: BUNKER, persist: true, allowDead: true, flags: { noBlock: true } });
        if (!on && unit.findBuff(BUNKER)) battle.removeBuff(unit, BUNKER);
      };
      const phaseFx = (kind, extra = {}) => battle.fx('phase', { x: unit.x, y: unit.y, id: unit.id, kind, form: kind, ...extra });
      const clearForm = () => battle.fx('phase', { x: unit.x, y: unit.y, id: unit.id, kind: 'skFight', form: null });

      // ---- Zantetsuken: every 4th attack is the 3-hit charge at 1.25 ATK [src: Zantetsuken spCost 4, times 3, atk_scale 1.25]
      battle.on('hit', (ctx) => {
        if (ctx.source !== unit || !ctx.dmg?.isAttack || !ctx.target || ctx.target.side !== 'enemy') return;
        sk.attacks++;
        if (sk.attacks % ZAN_SP !== 0) return;
        ctx.dmg.mul *= ZAN_SCALE;
        for (let i = 1; i < ZAN_TIMES; i++) battle.dealDamage(unit, ctx.target, { amount: unit.s.atk * ZAN_SCALE, type: dmgType, isSkill: true, tags: ['steamKnight', 'zantetsuken'] });
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
      };

      const chooseTarget = (dir) => {
        const { hits } = lane(battle, Math.round(unit.y), Math.round(unit.x), dir, groundFoes(battle, unit));
        const big = hits.find((h) => isBig(h.e));
        return big ? big.e : null;
      };

      const endBunker = () => {
        shield(false);
        bunker(false);
        const spot = freeTileNear(battle, unit.x, unit.y, unit);
        if (spot) battle.relocate(unit, spot[0], spot[1]);
        clearForm();
        setPhase('fight', { dash: null, target: null });
      };

      const startStance = () => {
        const c = cfg();
        if (!has(c.dashSpeed) || !(c.dashSpeed > 0) || !has(c.stanceAfterLanding)) { endBunker(); return; }
        setPhase('stance', { stanceDur: c.stanceAfterLanding });
        shield(false);   // the landing's invincibility ends with the landing clip
        bunker(true);
        phaseFx('skStance', { dur: c.stanceAfterLanding, speed: c.stanceAfterLanding > 0 ? CLIP.stanceBeginLen / c.stanceAfterLanding : 1 });
        // castDur: the official Zantetsuken window (its loops run from the stance to the end of the thrust clip) in s
        battle.fx('steamKnight', { id: unit.id, kind: 'stance', x: unit.x, y: unit.y, castDur: c.stanceAfterLanding + CLIP.blowLen + CLIP.blowHit });
      };

      const startDash = (target) => {
        const dir = sk.dir;
        const dash = { dir, target, travelled: 0, shoved: new Set(), clipAt: 0, moveAt: sk.clock };
        // A run shorter than the blow clip's wind-up (the strike frame is 0.7 s in) winds up first and boosts for the
        // last part of it, so the thrust is the impact (the user, 2026-11-24): the clip starts now, the boost starts later.
        const along0 = (target.y - unit.y) * dir[0] + (target.x - unit.x) * dir[1];
        const run = Math.max(0, along0 - 1.0) / c0().dashSpeed;
        if (run < CLIP.blowHit) {
          dash.clipAt = sk.clock;
          dash.moveAt = sk.clock + (CLIP.blowHit - run);
          phaseFx('skBlow', { dur: CLIP.blowLen });
        } else {
          phaseFx('skDash', { dr: dir[0], dc: dir[1], target: target.id });
          battle.fx('steamKnight', { id: unit.id, kind: 'dashStart', x: unit.x, y: unit.y, dr: dir[0], dc: dir[1] });
          dash.started = true;
        }
        setPhase('dash', { dash });
      };
      const c0 = () => cfg();

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
        if (t.alive) battle.dealDamage(unit, t, { amount: unit.s.atk * scale, type: dmgType, isSkill: true, tags: ['steamKnight', 'bunker'] });
        battle.fx('steamKnight', { id: unit.id, kind: 'impactHit', x: t.x, y: t.y, tiles, scale, target: t.id });
      };

      // ---- the leap: take-off (FlyToMoon), then the landing at the rear tile with the longest clear lane to an elite / boss
      const bestLanding = () => {
        const foes = groundFoes(battle, unit);
        const big = foes.filter(isBig);
        const pool = big.length ? big : foes;
        if (!pool.length) return null;
        let best = null;
        const R = battle.rect;
        for (let r = R.r0; r <= R.r1; r++) {
          for (let c = R.c0; c <= R.c1; c++) {
            if (!battle.grid.groundPassable(r, c) || !battle.grid.isLow(r, c)) continue;
            const o = battle._occ[r * COLS + c];
            if ((o && o.alive && o !== unit) || battle.downOn(r, c)) continue;
            for (const d of CARDINAL) {
              const { hits } = lane(battle, r, c, d, pool);
              if (!hits.length) continue;
              const len = hits[0].along;
              if (!best || len > best.len + 1e-9) best = { r, c, d, len };
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
      const walkSpeed = () => Math.max(0.05, unit.s.moveSpeed * MOVE_SCALE);
      const stepWalk = (dt) => {
        const w = sk.walk;
        if (!w) return;
        w.t += dt * walkSpeed() / w.len;
        if (!w.moved && w.t >= 0.5) {
          w.moved = true;
          if (!battle.relocate(unit, w.tr, w.tc)) { sk.walk = null; unit.x = w.fc; unit.y = w.fr; return; }
        }
        const t = Math.min(1, w.t);
        unit.x = w.fc + (w.tc - w.fc) * t; unit.y = w.fr + (w.tr - w.fr) * t;
        if (w.t >= 1) { unit.x = w.tc; unit.y = w.tr; sk.walk = null; }
      };
      const chooseWalk = () => {
        let tgt = null, bd = Infinity;
        for (const e of groundFoes(battle, unit)) {
          const d = hypot(e.x - unit.x, e.y - unit.y);
          if (d < bd - 1e-9) { bd = d; tgt = e; }
        }
        if (!tgt || bd <= 1.05) return;
        const path = battle.grid.findPath(unit.tileR, unit.tileC, Math.round(tgt.y), Math.round(tgt.x));
        if (!path || path.length < 2) return;
        const [tr, tc] = path[1];
        const o = battle._occ[tr * COLS + tc];
        if ((o && o.alive) || battle.downOn(tr, tc)) return;
        sk.walk = { fr: unit.tileR, fc: unit.tileC, tr, tc, t: 0, len: hypot(tr - unit.tileR, tc - unit.tileC) || 1, moved: false };
      };

      // ---- the state machine
      battle.on('tick', ({ dt }) => {
        if (!unit.alive || !unit.deployed) return;
        const c = cfg();
        sk.clock += dt; sk.t += dt;
        switch (sk.phase) {
          case 'drop':
            if (sk.t >= sk.dur - 1e-9) startStance();
            break;
          case 'stance': {
            if (sk.t < sk.stanceDur - 1e-9) break;
            let tgt = sk.target && sk.target.alive ? sk.target : chooseTarget(sk.dir);
            if (!tgt && has(c.waitLimit) && sk.t >= sk.stanceDur + c.waitLimit) {
              // nobody big came in time: the normal enemy with the most HP in the lane
              const { hits } = lane(battle, Math.round(unit.y), Math.round(unit.x), sk.dir, groundFoes(battle, unit));
              hits.sort((a, b) => b.e.hp - a.e.hp || a.along - b.along);
              if (!hits.length) { endBunker(); break; }
              tgt = hits[0].e;
            }
            if (tgt) { sk.target = tgt; startDash(tgt); }
            break;
          }
          case 'dash': {
            const d = sk.dash, t = d.target;
            if (!t || !t.alive) { endBunker(); break; }
            if (sk.clock < d.moveAt - 1e-9) break;   // still winding up: the boost starts when the thrust is 'run' s from its strike
            if (!d.started) {
              d.started = true;
              battle.fx('steamKnight', { id: unit.id, kind: 'dashStart', x: unit.x, y: unit.y, dr: d.dir[0], dc: d.dir[1] });
            }
            const along = (t.y - unit.y) * d.dir[0] + (t.x - unit.x) * d.dir[1];
            const remain = Math.max(0, along - 1.0);
            // start the blow clip so that its strike frame lands on the arrival (a short run starts it at once)
            if (!d.clipAt && remain <= c.dashSpeed * CLIP.blowHit + 1e-9) {
              d.clipAt = sk.clock;
              phaseFx('skBlow', { dur: CLIP.blowLen });
            }
            if (remain <= 1e-9) {
              if (sk.clock - d.clipAt >= CLIP.blowHit - 1e-9) impact();   // else he waits for the strike frame
              break;
            }
            const mv = Math.min(c.dashSpeed * dt, remain);
            const nr = Math.round(unit.y + d.dir[0] * mv), nc = Math.round(unit.x + d.dir[1] * mv);
            if (!battle.grid.inRect(nr, nc) || !battle.grid.groundPassable(nr, nc)) { endBunker(); break; }
            unit.y += d.dir[0] * mv; unit.x += d.dir[1] * mv; d.travelled += mv;
            // the normal enemies at its sides: damage and shove (panel values)
            for (const e of groundFoes(battle, unit)) {
              if (e === t || isBig(e) || d.shoved.has(e)) continue;
              const al = (e.y - unit.y) * d.dir[0] + (e.x - unit.x) * d.dir[1];
              const off = (e.y - unit.y) * d.dir[1] - (e.x - unit.x) * d.dir[0];
              if (al < -0.5 || al > 0.8 || Math.abs(off) > 1.0) continue;
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
            if (sk.t >= CLIP.blowLen - 1e-9) endBunker();
            break;
          case 'leapUp':
            break;
          default: {   // 'none' / 'fight'
            if (sk.phase === 'none') setPhase('fight');
            if (!unit.canAct || unit.s.flags.noMove) break;
            if (sk.clock >= sk.leapAt - 1e-9 && has(c.dashSpeed) && !sk.walk && startLeap()) break;
            if (unit.blocking.length) { sk.walk = null; break; }
            if (!sk.walk) chooseWalk();
            stepWalk(dt);
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
  const ax = vina ? vina.x : (battle.rect.c0 + battle.rect.c1) / 2;
  const ay = vina ? vina.y : (battle.rect.r0 + battle.rect.r1) / 2;
  const spot = freeTileNear(battle, ax, ay, null);
  if (!spot) return null;
  const u = battle.spawnToken(playerId, STEAM_KNIGHT_ID, spot[0], spot[1], { dir: dirName });
  if (!u) return null;
  u.mem.steamKnight = true;
  u.mem.sk.beginLanding(ax, ay, dir);
  return u;
}
