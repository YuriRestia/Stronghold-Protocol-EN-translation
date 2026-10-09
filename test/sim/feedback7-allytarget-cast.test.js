// test/sim/feedback7-allytarget-cast.test.js — a registered ally target (Battle.setAllyTarget: 白铁's 铁钳号·原型机, a
// summon of the enemy camp our attacks select — PRTS 铁钳号·原型机 备注 "该召唤物阵营为敌方") counts like an enemy for a
// non-heal skill's automatic start: the owner's rule of 2026-10-08 (community report: 圣约送葬人 hitting the device spent no
// bullet and gained no layer — her MANUAL ammo skill never opened, since every start condition counted enemies only).
// It stays out of enemiesInKeys / canTargetEnemy; a heal skill never counts it (禁疗); 白铁™多功能平台 is not one.
// Run: node --test test/sim/feedback7-allytarget-cast.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, chessRec, enemyRec, checkInvariants } from '../helpers/battleHarness.js';
import { COLS } from '../../server/sim/constants.js';

const CRAB = 'token_10027_ironmn_pile3';
const iron = (skillIndex) => ({ uid: 2, diy: { slot: 6, charId: 'char_4072_ironmn', skillIndex }, elite: true, row: 12, col: 9, dir: 'RIGHT' });
const IRON = iron(2);   // S3: his pieces are 铁钳号·原型机 (S1: 白铁™多功能平台 极致火力)
const piece = (tokenId, col) => ({ uid: 10, kind: 'token', tokenId, ownerUid: 2, row: 10, col, dir: 'RIGHT' });

function field(units, extra = {}) {
  const h = makeBattle({
    timeLimit: 40, autoFinish: false, seed: 3, flags: { dpPerSec: 0, dpMax: 999 },
    hooks: ['ammoUsed', 'skillStart', 'layerGain', 'attack'], captureNoisy: true, units, ...extra,
  });
  h.step();
  return h;
}

test('圣约送葬人 S2 (MANUAL, DEFAULT, 12 bullets) opens with 铁钳号 alone in range, spends its bullets on it, and the 每消耗7发 garrisons gain layers', () => {
  const h = field([{ uid: 1, chessId: 'chess_char_5_01_a', row: 10, col: 4, dir: 'RIGHT' }, IRON, piece(CRAB, 5)], {
    bonds: { lateranoShip: { count: 3, active: true, tier: 1, layers: 0 }, visiShip: { count: 1, active: true, tier: 1, layers: 0 } },
  });
  const u = h.unit(1);
  const crab = h.b.allyUnits.find((a) => a.defId === CRAB);
  assert.equal(h.b.isAllyTarget(crab), true);
  assert.equal(h.b.enemiesInKeys(u.rangeKeys, u, u.profile).length, 0, 'not an enemy of the selectors');
  assert.equal(u.skill.id, 'skchr_excu2_2');
  assert.equal(u.skill.rule, 'DEFAULT');
  assert.equal(u.skill.kind, 'ammo');
  u.skill.gainSp(999, 'test');
  h.run(14);
  assert.equal(u.skill.activations, 1, 'the skill opened on the device');
  const atk = h.hooksOf('attack').filter((c) => c.attacker === u);
  assert.ok(atk.length >= 10 && atk.every((c) => c.targets.every((t) => t === crab)), 'every attack hit the device');
  const spent = h.hooksOf('ammoUsed').filter((c) => c.unit === u).length;
  assert.ok(spent >= 7, `bullets spent on it (${spent})`);
  const gains = h.hooksOf('layerGain').filter((c) => c.reason === 'garrison');
  assert.ok(gains.length >= 2 && gains.every((c) => c.n > 0), '拉特兰 / 远见 garrison layers after 7 bullets');
  assert.equal(crab.hp, crab.s.maxHp, 'the hits are still cancelled');
  checkInvariants(h.b);
});

test('the other normal-attack ammo skills spend their bullets on 铁钳号 too (隐现 S2, 烛煌 S3, 新约能天使 S2)', () => {
  for (const id of ['chess_char_1_01_a', 'chess_char_5_03_a', 'chess_char_6_13_a']) {
    const h = field([{ uid: 1, chessId: id, row: 10, col: 4, dir: 'RIGHT' }, IRON, piece(CRAB, 5)]);
    const u = h.unit(1);
    assert.equal(u.skill.kind, 'ammo', id);
    u.skill.gainSp(999, 'test');
    h.run(10);
    assert.equal(u.skill.activations, 1, `${id} opened`);
    assert.ok(h.hooksOf('ammoUsed').filter((c) => c.unit === u).length > 0, `${id} spent bullets`);
    checkInvariants(h.b);
  }
});

test('白铁™多功能平台 is no ally target: never attacked, the skill stays closed', () => {
  const h = field([{ uid: 1, chessId: 'chess_char_5_01_a', row: 10, col: 4, dir: 'RIGHT' }, iron(0), piece('token_10027_ironmn_pile1', 5)]);
  const u = h.unit(1);
  const pile = h.b.allyUnits.find((a) => a.defId === 'token_10027_ironmn_pile1');
  assert.ok(pile && pile.deployed);
  assert.equal(h.b.isAllyTarget(pile), false);
  u.skill.gainSp(999, 'test');
  h.run(8);
  assert.equal(u.skill.activations, 0);
  assert.equal(h.hooksOf('attack').filter((c) => c.attacker === u).length, 0);
  assert.equal(h.hooksOf('ammoUsed').length, 0);
  checkInvariants(h.b);
});

test('every start rule counts it (SEARCH, SKILL_RANGE, CUSTOM_RANGE, ACTIVE_RANGE, GDGLOW anywhere, a content trigger range) — never a heal skill', () => {
  const id = 'test_cast_a';
  const open = (rule, { grid = null, rangeGrid = [[0, 0], [0, 1]], col = 5, heal = false, area = null, enemy = false } = {}) => {
    const h = makeBattle({
      defs: {
        chess: { [id]: chessRec({ id, profession: heal ? 'MEDIC' : 'SNIPER', rangeGrid, skill: { skillType: 'MANUAL', spCost: 1, initSp: 1 } }) },
        enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e9, speed: 0, mass: 0 }) },
      },
      kits: {
        [id]: () => ({
          skill: { kind: 'duration', duration: 5, spCost: 1, initSp: 1, heal, trigger: grid ? { rule, grid } : rule },
          install(battle, unit) { if (area) unit.skill.addTriggerRange(() => [area]); },
        }),
      },
      units: [{ uid: 1, chessId: id, row: 10, col: 4, dir: 'RIGHT' }, IRON, piece(CRAB, col)],
      enemies: enemy ? [{ key: 'enemy_dummy', time: 0, pos: [11, 4] }] : [],
      timeLimit: 20, autoFinish: false, seed: 2, flags: { dpPerSec: 0, dpMax: 999 },
    });
    h.step();
    const u = h.unit(1);
    const crab = h.b.allyUnits.find((a) => a.defId === CRAB);
    crab.hp = crab.s.maxHp * 0.2;   // an injured unit: still no heal patient (禁疗)
    u.skill.gainSp(999, 'test');
    h.run(3);
    checkInvariants(h.b);
    return u.skill.activations;
  };

  assert.equal(open('DEFAULT', { heal: true }), 0, 'a heal skill: the 禁疗 device is no patient');
  assert.equal(open('SEARCH', { heal: true }), 0);
  assert.equal(open('DEFAULT'), 1, 'DEFAULT: about to attack it');
  assert.equal(open('SEARCH'), 1);
  assert.equal(open('SKILL_RANGE', { grid: [[0, 0], [0, 1], [0, 2]], rangeGrid: [[0, 0]] }), 1, 'on the skill range only');
  assert.equal(open('CUSTOM_RANGE', { grid: [[0, 0], [0, 1], [0, 2]], rangeGrid: [[0, 0]] }), 1);
  assert.equal(open('ACTIVE_RANGE', { grid: [[0, 0], [0, 1], [0, 2]], rangeGrid: [[0, 0]] }), 1);
  assert.equal(open('SKILL_RANGE', { grid: [[0, 0], [0, 1], [0, 2]], rangeGrid: [[0, 0]], col: 8 }), 0, 'outside the grid: no');
  assert.equal(open('GDGLOW_SKILL_2', { rangeGrid: [[0, 0]], col: 9 }), 1, '全场: outside its own range too');
  assert.equal(open('DEFAULT', { rangeGrid: [[0, 0]], col: 8, area: [10 * COLS + 8] }), 1, 'a content trigger range (addTriggerRange)');
  assert.equal(open('DEFAULT', { rangeGrid: [[0, 0]], col: 8 }), 0, 'neither in range nor in a trigger range: no');
});
