// A skill restarted inside its own end (0.1.4 release review): 耀骑士临光 S2 retreats when its duration ends and 不屈
// redeploys her inside that call, starting the deploy-timed skill again (PR #109) — the new cast keeps its effects and
// the client never sees it off; 伊内丝 S3's recall still finds its 影哨 when 不屈 redeploys her at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle, enemyRec } from '../helpers/battleHarness.js';

const bond = (tier, layers = 0, count = 3) => ({ count, active: tier > 0, tier, layers });

test('耀骑士临光 S2 restarted by 不屈 inside its duration end keeps 骑士戒律 and stays on for the client', () => {
  const NEARL = 'chess_char_6_17_a';
  const ends = [];
  const h = makeBattle({
    seed: 1, autoFinish: false, timeLimit: 220, flags: { dpInit: 99 },
    bonds: { kazimierzShip: bond(1, 0), indomShip: bond(1, 999) },
    defs: { enemies: { enemy_hit: enemyRec({ key: 'enemy_hit', hp: 10, atk: 0, speed: 0 }) } },
    units: [{ chessId: NEARL, row: 10, col: 5, dir: 'RIGHT', skillIndex: 1, items: ['chess_item_6_10_e_a', 'chess_item_4_07_e_a'] }],
    setup(b) { b.on('skillEnd', (c) => { if (c.unit?.defId === NEARL) ends.push({ active: c.skill.active, reason: c.reason }); }); },
  });
  const u = h.unit(NEARL);
  const combo = () => u.buffs.some((x) => x.key.endsWith(':combo'));
  h.run(0.3);
  assert.ok(u.skill.active && combo(), 'the first cast runs with its combo');
  h.runUntil(() => u.alive && u.skill.activations >= 2 && u.skill.active, 60);
  h.run(0.3);
  assert.ok(u.skill.active, 'the second cast runs');
  assert.ok(combo(), 'the restarted cast keeps 骑士戒律');
  assert.ok(ends.every((e) => !e.active), 'no skillEnd fires for a skill that is running again');
  const own = h.eventsOf('skill').filter((e) => e[1] === u.id).map((e) => e[2]);
  assert.equal(own.at(-1), 1, 'the client sees the skill on');
});

test('伊内丝 S3: knocked out mid-battle, 不屈\'s immediate redeploy recalls the 影哨 she leaves', () => {
  const INES = 'chess_char_4_04_a';
  const h = makeBattle({
    seed: 1, autoFinish: false, timeLimit: 10, flags: { dpInit: 99 },
    bonds: { indomShip: bond(1, 999) },
    defs: { enemies: { enemy_ines: enemyRec({ key: 'enemy_ines', hp: 80000, speed: 0, atk: 0, def: 0 }) } },
    units: [{ chessId: INES, row: 10, col: 5, dir: 'RIGHT', skillIndex: 2 }],
    enemies: [{ key: 'enemy_ines', time: 0, pos: [10, 6] }],
  });
  h.step(1);
  const u = h.unit(INES), e = h.enemies()[0];
  const recalls = [];
  h.b.on('damaged', (c) => { if (c.source === u && (c.dmg?.tags || []).includes('sentryRecall')) recalls.push(c.amount); });
  h.b.dealDamage(e, u, { amount: u.s.maxHp * 10, type: 'true', canDodge: false }); // knocked out: 不屈 redeploys at once
  h.step(0.2);
  assert.ok(u.alive && u.deployed, 'redeployed by 不屈');
  assert.equal(recalls.length, 1, 'the redeploy\'s S3 recalls the 影哨 left at her fall');
  assert.equal(u.mem.sentry, null, 'and the 影哨 is spent');
});
