// (fork) The sim's signals for official enemy effects the fx index does not carry (render/vfx/indexGaps.js
// ENEMY_STATE_KEYS): b.snap `fxs` rows, display only — the props' idle loop, Rotchaser's bleed, Sand Voyager's passengers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import * as enemies from '../../server/sim/content/enemies.js';
import { fxStateView } from '../../server/sim/snapshot.js';
import { enemyStateKeys } from '../../public/js/render/vfx/indexGaps.js';

const parked = { motion: 'WALK', start: [9, 7], end: [9, 2], steps: [{ t: 'wait', s: 100 }, { t: 'move', p: [9, 2] }] };
const arena = () => makeBattle({ content: 'generic', extraContent: [enemies], autoFinish: false, timeLimit: 600 });
const spawn = (h, key, o = {}) => h.spawn(key, { pos: [9, 7], route: parked, ...o });
const rows = (u, buff) => (fxStateView(u, 0) || []).filter((r) => r[0] === buff);

test("a prop (Wooden Seal, Iron Lampstand): its idle loop's row while it stands, the client's key by its unit", () => {
  const h = arena();
  h.step();
  for (const key of ['enemy_1196_msfyin', 'enemy_1210_msfden_2']) {
    const e = spawn(h, key);
    h.step();
    assert.deepEqual(rows(e, 'msf_basic'), [['msf_basic', null, null]], key);
    assert.equal(enemyStateKeys('msf_basic', key).length, 1);
    e.alive = false;
    assert.deepEqual(rows(e, 'msf_basic'), [], `${key}: gone with it`);
  }
});

test("Rotchaser's bleed: the bleeding target carries the official bleed buff, given by the Rotchaser", () => {
  const h = arena();
  h.step();
  const r = spawn(h, 'enemy_1270_nhstlk');
  const t = spawn(h, 'enemy_1000_gopro_2', { pos: [8, 7] });
  h.step();
  const kit = r.mem.ab.list.find((a) => typeof a.dealt === 'function');
  kit.dealt({ target: t }, h.b, r);
  assert.deepEqual(rows(t, 'enemy_nhstlk_t[bleeding]'), [['enemy_nhstlk_t[bleeding]', r.id, null]]);
  assert.deepEqual(enemyStateKeys('enemy_nhstlk_t[bleeding]', 'enemy_1270_nhstlk'), ['enemy_nhstlk_attack_buff_01']);
});

test("Sand Voyager: no row while empty, then its passenger count as the row's look (buff_0N)", () => {
  const h = arena();
  h.step();
  const bus = spawn(h, 'enemy_1302_ymtro_2');
  h.step();
  assert.deepEqual(rows(bus, 'durbus_passengers'), []);
  spawn(h, 'enemy_1000_gopro_2');
  spawn(h, 'enemy_1000_gopro_2');
  h.step();
  assert.deepEqual(rows(bus, 'durbus_passengers'), [['durbus_passengers', null, 2]]);
  assert.deepEqual(enemyStateKeys('durbus_passengers', 'enemy_1302_ymtro_2', 2), ['enemy_ymtro_buff_02']);
});

test("the Wooden Burdenbeast of Ilion shares the bus kit but signals nothing: its prefab has no passenger effects", () => {
  const h = arena();
  h.step();
  const camel = spawn(h, 'enemy_10159_mntrjn');
  spawn(h, 'enemy_1000_gopro_2');
  h.step();
  assert.deepEqual(rows(camel, 'durbus_passengers'), []);
});
