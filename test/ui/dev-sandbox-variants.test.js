// (fork) The dev sandbox's wave variant picker (public/dev/sandbox-variants.js): the variants each captured round of
// every map lists, in every official version, with the official EN names; a variant wave is the match generator's own
// (server/match/waves.js: a capture without bounty units rebuilds byte for byte from its pick); and the chosen variant
// and entry are what spawns in the real sim battle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as waves from '../../server/match/waves.js';
import { GameData } from '../../server/match/gamedata.js';
import { getData, getVersionData } from '../../server/data.js';
import { DataSource } from '../../server/sim/simdata.js';
import { createBattleFromSpec } from '../../server/sim/spec.js';
import { createRng } from '../../server/sim/rng.js';
import { VERSIONS } from '../../shared/versions.js';
import { variantList, capturedVariant, variantWave, OFFICIAL } from '../../public/dev/sandbox-variants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIR = path.join(ROOT, 'public/dev/sandbox');
const quiet = { log: { warn() {}, error() {}, info() {} } };
const DATA = getData(quiet);
const index = JSON.parse(readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const specOf = (s) => JSON.parse(readFileSync(path.join(DIR, s.dir, `${s.name}.json`), 'utf8')).spec;
const MODE = specOf(index[0]).modeId;
const gd = new GameData(DATA, MODE);
// the official EN names (data/i18n/en.json, from gamedata-en excel/activity_table.json autoChessData.enemyTypeDatas.*.name)
const EN = JSON.parse(readFileSync(path.join(ROOT, 'data/i18n/en.json'), 'utf8')).files.factions.types;
const keysOf = (l) => (Array.isArray(l) ? l : []).map((x) => (typeof x === 'string' ? x : x && x.key));
const hasBounty = (spec) => spec.spawns.some((s) => s.bounty || s.mods?.bountyId != null);
const strip = (list) => list.filter((s) => !s.bounty).map(({ ownerPlayerId, ...s }) => s);

test('every map lists the variants of its captured rounds, by the official EN names', () => {
  const maps = [...new Set(index.map((s) => s.stageId))];
  assert.equal(maps.length, 7, 'the 7 HARD maps are captured');
  for (const s of index) {
    const spec = specOf(s);
    const list = variantList(waves, gd, spec.round);
    const types = list.map((v) => v.type);
    assert.ok(types.includes('SPECIAL'), `${s.dir}/${s.name}: SPECIAL (the fill type) is offered`);
    // each type offered has the round's own candidates, and a type without one is not offered
    for (const t of Object.keys(gd.factions.types)) {
      assert.equal(types.includes(t), waves.roundEntryCandidates(gd, t, spec.round).length > 0, `${s.dir}/${s.name}: ${t}`);
    }
    for (const v of list) assert.match(EN[v.type].name, /^Tactical Training\//, `${v.type} has its official EN name`);
  }
  // round 3 (first half) offers all seven, round 10 (second half) too, with the round's own entries
  assert.deepEqual(variantList(waves, gd, 3).map((v) => v.type), ['SPECIAL', 'FLY', 'TIMES', 'ELEMENT', 'DOT', 'INVISIBLE', 'REFLECTION']);
  assert.equal(EN.DOT.name, 'Tactical Training/Continuous');
  assert.equal(EN.FLY.name, 'Tactical Training/Flying');
  const r3 = variantList(waves, gd, 3).find((v) => v.type === 'FLY').entries.map((e) => e.key);
  const r10 = variantList(waves, gd, 10).find((v) => v.type === 'FLY').entries.map((e) => e.key);
  assert.ok(r3.every((k) => gd.factions.entries[k].firstHalf) && r10.every((k) => !gd.factions.entries[k].firstHalf), 'first / second half entries');
});

test('every official version lists its own variants', () => {
  for (const v of VERSIONS) {
    const data = v.dir ? getVersionData(v.id) : DATA;
    const vgd = new GameData(data, MODE);
    for (const round of [1, 7, 8, 13, 14, 15]) {
      const list = variantList(waves, vgd, round);
      assert.ok(list.length >= 1 && list[0].type === 'SPECIAL', `${v.id} round ${round}`);
      for (const x of list) for (const e of x.entries) assert.equal(vgd.factions.entries[e.key].type, x.type, `${v.id} ${e.key}`);
    }
  }
});

test('a capture without bounty units rebuilds byte for byte from its own variant', () => {
  let n = 0;
  for (const s of index) {
    const spec = specOf(s);
    if (hasBounty(spec)) continue;   // (a bounty re-times its host action: withBounties)
    const cap = capturedVariant(waves, gd, spec.round, spec.spawns);
    assert.ok(cap, `${s.dir}/${s.name}: its variant is found`);
    const ent = gd.factions.entries[cap.key];
    let same = false;
    for (const normal of [null, ...keysOf(ent.N)]) {
      for (const elite of [null, ...keysOf(ent.E)]) {
        const setup = { picks: [] };
        setup.picks[spec.round] = { round: spec.round, type: cap.type, key: cap.key, normal, elite, fly: typeof ent.fly === 'boolean' ? ent.fly : waves.isFlyKey(gd, cap.key), firstHalf: !!ent.firstHalf };
        const w = s.kind === 'normal' ? waves.buildNormalWave(gd, null, setup, spec.round) : waves.buildBossWave(gd, null, setup, spec.round, { bossId: spec.bossId, solo: spec.players.length === 1 });
        if (JSON.stringify(strip(w.spawns)) === JSON.stringify(strip(spec.spawns))) same = true;
      }
    }
    assert.ok(same, `${s.dir}/${s.name}: ${cap.type} ${cap.key} rebuilds the captured spawns`);
    n++;
  }
  assert.ok(n >= 60, `${n} captures checked`);
});

test('the chosen variant and entry are the pick the wave carries; random draws the official way', () => {
  for (const round of [3, 10, 14]) {
    const s = index.find((x) => x.round === round && x.stageId === 'act2autochess_m01');
    const spec = specOf(s);
    for (const v of variantList(waves, gd, round)) {
      const random = variantWave(waves, gd, createRng(1), { round, kind: s.kind, type: v.type, bossId: spec.bossId, solo: false });
      assert.equal(random.pick.type, v.type, `round ${round} ${v.type}`);
      assert.ok(v.entries.some((e) => e.key === random.pick.key), 'a candidate entry');
      for (const e of v.entries) {
        const w = variantWave(waves, gd, createRng(1), { round, kind: s.kind, type: v.type, entryKey: e.key, bossId: spec.bossId, solo: false });
        assert.equal(w.pick.key, e.key);
        const ent = gd.factions.entries[e.key];
        assert.ok(w.pick.normal == null || keysOf(ent.N).includes(w.pick.normal), `${e.key}: its attached normal enemy`);
        assert.ok(w.pick.elite == null || keysOf(ent.E).includes(w.pick.elite), `${e.key}: its attached elite`);
        for (const sp of w.spawns) if (/^SF?$/.test(String(sp.mods?.slot ?? ''))) assert.equal(sp.enemyKey, e.key, `${e.key}: the special slot spawns it`);
        assert.equal(capturedVariant(waves, gd, round, w.spawns)?.type, v.type, `${e.key}: read back as its own type`);
      }
    }
  }
  // the match's draw is untouched: without entryKey the same rng gives the same pick as before the option existed
  const a = waves.pickRoundEntry(gd, createRng(7), 'FLY', 3);
  const b = waves.pickRoundEntry(gd, createRng(7), 'FLY', 3, {});
  assert.deepEqual(a, b);
  assert.equal(OFFICIAL, '');
});

test('the chosen variant is what spawns in the real battle', () => {
  const ds = new DataSource(DATA, null);
  const s = index.find((x) => x.round === 3 && x.kind === 'normal' && x.stageId === 'act2autochess_m03');
  const base = specOf(s);
  for (const type of ['FLY', 'DOT']) {
    const v = variantList(waves, gd, 3).find((x) => x.type === type);
    const key = v.entries[0].key;
    const w = variantWave(waves, gd, createRng(3), { round: 3, kind: 'normal', type, entryKey: key });
    const spec = { ...structuredClone(base), routes: w.routes, waveId: w.templateId, enemyOverrides: w.overrides,
      spawns: w.spawns.map((x) => ({ ...structuredClone(x), ownerPlayerId: base.players[0].playerId })) };
    const b = createBattleFromSpec(spec, ds, { recordEvents: false });
    const seen = new Set();
    const spawn = b.spawnEnemy.bind(b);
    b.spawnEnemy = (k, o) => { seen.add(k); return spawn(k, o); };
    const last = Math.max(...w.spawns.map((x) => x.time + Math.max(0, x.count - 1) * x.interval));
    for (let i = 0; i < Math.ceil((last + 1) * 30) && !b.finished; i++) b.step();
    for (const x of w.spawns) assert.ok(seen.has(x.enemyKey), `${type}: ${x.enemyKey} spawned`);
    if (w.spawns.some((x) => /^SF?$/.test(String(x.mods?.slot)))) assert.ok(seen.has(key), `${type}: its entry ${key} spawned`);
    // the captured round's own special enemy does not come along (unless the variant spawns it too)
    const cap = capturedVariant(waves, gd, 3, base.spawns);
    if (cap.type !== type && !w.spawns.some((x) => x.enemyKey === cap.key)) assert.ok(!seen.has(cap.key), `${type}: no ${cap.key} of the capture`);
  }
});
