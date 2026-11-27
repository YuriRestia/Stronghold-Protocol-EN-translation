// test/sim/laterano-mod-b.test.js — 拉特兰 Mod B (Custom Lobby Modifications lateranoMod 'B', shared/rules.js;
// server/sim/content/bonds/core.js installLaterano, garrisons/battle.js consume_ammo): ammo +min(5 + L, 75 + 0.3·L) %
// instead of +(5 + 1.5·L) %; at 100 stacks the members deal 200 % damage and an operator's "every N bullets" 驻守
// triggers twice each time (the bullets count as usual). The rule reaches the battle in BattleSpec flags.rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';
import { lateranoB100 } from '../../server/sim/content/support/index.js';

const DEFS = { enemies: { enemy_dummy: enemyRec({ key: 'enemy_dummy', hp: 1e7, speed: 0 }) } };
const lat = (layers) => ({ lateranoShip: { count: 3, active: true, tier: 1, layers } });

function battle({ mod = 'A', layers = 0, chessId = 'chess_char_6_01_a' } = {}) {
  return makeBattle({
    defs: DEFS, timeLimit: 200, seed: 7, autoFinish: false,
    units: [{ chessId, row: 10, col: 3 }],
    enemies: [{ key: 'enemy_dummy', pos: [10, 5] }],
    bonds: lat(layers),
    flags: { rules: { lateranoMod: mod } },
  });
}

/** The bullets 蕾缪安's S3 starts with at `layers` stacks under Mod `mod`. */
function startAmmo(mod, layers) {
  const h = battle({ mod, layers });
  const u = h.unit('chess_char_6_01_a');
  h.step(1);
  u.skill.activate('test', { free: true });
  // a skill with a begin clip starts when the clip ends (sim/skills.js activate, Yuri d3ec5ccc): the ammo is set then
  h.runUntil(() => u.skill.active, 5);
  return u.skill.ammoMax;
}

test('ammo: Mod B gives fewer bullets than Mod A below 100 stacks (5 + L vs 5 + 1.5·L %)', () => {
  // 蕾缪安 S3 holds 5: Mod A at 30 stacks ×1.5 → 7, Mod B ×1.35 → 6 (both floored; her talents add the same)
  const a = startAmmo('A', 30), b = startAmmo('B', 30);
  assert.equal(a - b, 1, `A ${a}, B ${b}`);
  // at 200 stacks: A ×4.05 → 20, B ×(1 + min(2.05, 1.35)) = ×2.35 → 11
  assert.equal(startAmmo('A', 200) - startAmmo('B', 200), 9);
});

test('100 stacks: Mod B members deal 200 % damage; not below 100, never under Mod A', () => {
  const has = (mod, layers) => {
    const h = battle({ mod, layers });
    h.step(1);
    const u = h.unit('chess_char_6_01_a');
    return { buff: u.buffs.some((x) => x.key === 'bond:laterano:b100'), b100: lateranoB100(h.b, u), mul: u.s.dmgDealtMul };
  };
  const on = has('B', 100), below = has('B', 99), modA = has('A', 150);
  assert.equal(on.buff, true);
  assert.equal(on.b100, true);
  assert.equal(below.buff, false);
  assert.equal(below.b100, false);
  assert.equal(modA.buff, false);
  assert.ok(Math.abs(on.mul / below.mul - 2) < 1e-9, `×2: ${on.mul} vs ${below.mul}`);
});

test('100 stacks: 圣约送葬人\'s "every 7 bullets" 驻守 triggers twice after 7 bullets (not once after 4)', () => {
  const gainsAfter = (mod, bullets) => {
    const h = battle({ mod, layers: 100, chessId: 'chess_char_5_01_a' });
    h.step(1);
    const u = h.unit('chess_char_5_01_a');
    const gains = [];
    h.b.on('layerGain', (c) => { if (c.bondId === 'lateranoShip') gains.push(c); });
    for (let i = 1; i <= bullets; i++) h.b.emit('ammoUsed', { unit: u, left: 20 - i, skill: u.skill });
    return gains.length;
  };
  assert.equal(gainsAfter('A', 6), 0);
  assert.equal(gainsAfter('A', 7), 1);
  assert.equal(gainsAfter('B', 6), 0, 'the bullets count as usual');
  assert.equal(gainsAfter('B', 7), 2, 'and the trait triggers twice');
});

test('100 stacks: the Attribute\'s owner decides — 莫斯提马\'s triggers twice on a non-拉特兰 neighbour\'s bullets', () => {
  const gainsAfter = (mod) => {
    const h = makeBattle({
      defs: DEFS, timeLimit: 200, seed: 7, autoFinish: false,
      units: [{ chessId: 'chess_char_4_02_a', row: 10, col: 3 }, { chessId: 'chess_char_3_08_a', row: 10, col: 4 }],
      enemies: [{ key: 'enemy_dummy', pos: [10, 7] }],
      bonds: lat(100),
      flags: { rules: { lateranoMod: mod } },
    });
    h.step(1);
    const mint = h.unit('chess_char_3_08_a');
    assert.equal(lateranoB100(h.b, mint), false, '薄绿 is no 拉特兰 operator');
    const gains = [];
    h.b.on('layerGain', (c) => { if (c.bondId === 'lateranoShip') gains.push(c); });
    for (let i = 1; i <= 6; i++) h.b.emit('ammoUsed', { unit: mint, left: 10 - i, skill: mint.skill });
    return gains.length;
  };
  assert.equal(gainsAfter('A'), 1, 'her Attribute counts the neighbour\'s bullets');
  assert.equal(gainsAfter('B'), 2, 'and triggers twice under Mod B');
});
