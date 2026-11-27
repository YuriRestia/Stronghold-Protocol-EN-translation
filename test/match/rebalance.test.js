// test/match/rebalance.test.js — the rebalanced alliances of the Custom Lobby Modifications (shared/rules.js
// virtuosaBonds / blaze; shared/ruleData.js): 塑心 also in 迅捷 and 助力; 煌 in 凯瑟琳's shop slot (her tier, price, skill
// slot and module, Blaze's body and kit, 炎 + 维多利亚, "<售出时>获得1名【烛煌】"). The match changes only its own records;
// a battle built from a spec carrying the rules (the browser's) fields the same operators (sim/simdata.js withRuleData).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { ruleDataPatch, BLAZE, VIRTUOSA } from '../../shared/ruleData.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { getDefaultSource, withRuleData } from '../../server/sim/simdata.js';
import { kitOf } from '../../server/sim/content/index.js';
import { KITS } from '../../server/sim/content/kits/index.js';

const BOTH = { blaze: true, virtuosaBonds: true };

test('the match\'s records change; a match without the rules (and the shared data) keep the original ones', () => {
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: BOTH });
  const plain = makeMatch({ mode: 'solo', seed: 3 });
  try {
    const blaze = h.m.gd.chess(BLAZE.slot.a), cath = plain.m.gd.chess(BLAZE.slot.a);
    assert.equal(blaze.charId, BLAZE.charId);
    assert.deepEqual(blaze.bonds, BLAZE.bonds);
    assert.equal(blaze.tier, cath.tier);
    assert.equal(blaze.price, cath.price);
    assert.deepEqual(blaze.status, cath.status, 'her training status');
    assert.deepEqual(blaze.garrisonIds, [BLAZE.garrison.a]);
    assert.equal(h.m.gd.garrison(BLAZE.garrison.a).eventType, 'SERVER_CHESS_SOLD');
    assert.equal(cath.charId, 'char_4162_cathy', 'the other match still has 凯瑟琳');
    assert.deepEqual(h.m.gd.chess(VIRTUOSA.ids[0]).bonds, VIRTUOSA.bonds);
    assert.deepEqual(plain.m.gd.chess(VIRTUOSA.ids[0]).bonds, ['lateranoShip']);
    // only one of the two rules: only its records
    const only = ruleDataPatch(h.m.data, { blaze: false, virtuosaBonds: true });
    assert.deepEqual(Object.keys(only.chess).sort(), [...VIRTUOSA.ids].sort());
    assert.deepEqual(Object.keys(only.garrisons), []);
  } finally { h.m.dispose(); plain.m.dispose(); }
});

test('selling 煌 gives one 烛煌; an elite 煌 an elite one', () => {
  for (const form of ['a', 'b']) {
    const h = makeMatch({ mode: 'solo', seed: 5, lobbyRules: { blaze: true } }).start();
    try {
      h.toPrep(1);
      const ps = h.ps('p_0');
      const piece = ps.acquireChess(BLAZE.slot[form], { source: 'test', fromPool: false });
      assert.ok(piece, 'got 煌');
      assert.deepEqual(ps.sell(piece.uid), { ok: true });
      const ids = [...ps.hand, ...ps.temp].filter(Boolean).map((p) => p.id);
      assert.ok(ids.includes(BLAZE.product[form]), `${form}: ${ids.join(', ')}`);
    } finally { h.m.dispose(); }
  }
});

test('a battle from a spec with the rules fields Blaze (her body, S2, her own kit) and 塑心 in three alliances', () => {
  const spec = buildBattleSpec({
    battleId: 'r', fieldId: 'n:p', kind: 'normal', round: 3, stageId: 'act2autochess_m01', timeLimit: 60,
    players: [{ playerId: 'p', units: [
      { uid: 1, kind: 'chess', chessId: BLAZE.slot.a, row: 10, col: 3 },
      { uid: 2, kind: 'chess', chessId: VIRTUOSA.ids[0], row: 10, col: 5 },
    ] }],
    spawns: [], flags: { layerGainsEnabled: true, rules: BOTH },
  });
  const b = createBattleFromSpec(spec);
  const [blaze, virt] = [1, 2].map((uid) => b.units.find((u) => u.uid === uid));
  assert.equal(blaze.def.charId, BLAZE.charId);
  assert.equal(blaze.def.skill?.id ?? blaze.def.skill?.skillId, 'skchr_huang_2');
  assert.equal(kitOf(blaze.def, KITS), KITS[BLAZE.charId], 'Blaze\'s kit, not 凯瑟琳\'s');
  assert.deepEqual([...virt.def.bonds], VIRTUOSA.bonds);
  // the same view without the rules is the plain source
  assert.equal(withRuleData(getDefaultSource(), { blaze: false, virtuosaBonds: false }), getDefaultSource());
  const plain = createBattleFromSpec({ ...spec, flags: { layerGainsEnabled: true } });
  assert.equal(plain.units.find((u) => u.uid === 1).def.charId, 'char_4162_cathy');
});

test('the client shows the match\'s records while its rules are set (data.js setRules), in the player\'s language', async () => {
  const { createDataStore } = await import('../../public/js/data.js');
  const { readFileSync, existsSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const fetch = async (url) => {
    const abs = path.join(ROOT, url.replace(/^\/data\//, 'data/'));
    if (!existsSync(abs)) return { ok: false, status: 404, json: async () => null };
    const text = readFileSync(abs, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
  const d = createDataStore({ fetch, retryDelays: [] });
  await d.loadAll('chess', 'garrisons', 'backups');
  assert.equal(await d.setLocale('en'), 'en');
  const seen = [];
  d.subscribe((n) => seen.push(n));
  assert.equal(d.lookup('chess', BLAZE.slot.a).name, 'Catherine');
  d.setRules({ blaze: true, virtuosaBonds: true });
  assert.ok(seen.includes('chess') && seen.includes('garrisons'), 'subscribers re-render');
  assert.equal(d.lookup('chess', BLAZE.slot.a).name, 'Blaze');
  assert.equal(d.lookupBase('chess', BLAZE.slot.a).name, 'Catherine', 'the slot\'s own record stays reachable');
  assert.deepEqual(d.lookup('chess', VIRTUOSA.ids[0]).bonds, VIRTUOSA.bonds);
  assert.match(d.lookup('garrisons', BLAZE.garrison.a).desc, /Blaze the Igniting Spark/);
  d.setRules(null);
  assert.equal(d.lookup('chess', BLAZE.slot.a).name, 'Catherine');
  assert.equal(d.lookup('garrisons', BLAZE.garrison.a), null);
});

test('煌 takes the skill (and module) the player chose for 凯瑟琳: her loadout belongs to the shop slot', () => {
  for (const [skillIndex, skill] of [[0, 'skchr_huang_1'], [1, 'skchr_huang_2'], [2, 'skchr_huang_3']]) {
    const spec = buildBattleSpec({
      battleId: 'l', fieldId: 'n:p', kind: 'normal', round: 3, stageId: 'act2autochess_m01', timeLimit: 60,
      players: [{ playerId: 'p', units: [{ uid: 1, kind: 'chess', chessId: BLAZE.slot.b, row: 10, col: 3, skillIndex, moduleId: 'none' }] }],
      spawns: [], flags: { layerGainsEnabled: true, rules: { blaze: true } },
    });
    const u = createBattleFromSpec(spec).units.find((x) => x.uid === 1);
    assert.equal(u.def.skill?.id ?? u.def.skill?.skillId, skill, `skill ${skillIndex}`);
    assert.equal(u.def.loadout?.moduleId, 'none', '凯瑟琳 without her module: 煌 without hers');
  }
});

test('Alliance Modules: 拉特兰 Mod B\'s text and current effect, 维多利亚 Mod C\'s text, in the match and the client (GitHub #75)', async () => {
  const { formatBondEffect } = await import('../../public/js/ui/richText.js');
  const h = makeMatch({ mode: 'solo', seed: 3, lobbyRules: { lateranoMod: 'B', victoriaMod: 'C' } });
  try {
    const lat = h.m.gd.bond('lateranoShip'), vic = h.m.gd.bond('victoriaShip');
    // Mod A's ammo line, Mod B's 100-stack line, Mod A's 6-member line: three paragraphs, rich text kept in descRaw
    assert.equal(lat.desc.split('\n').length, 3);
    assert.match(lat.desc.split('\n')[1], /^<达到100层>.*莫斯提马/);
    assert.match(lat.descRaw, /<@ba\.vup>200%<\/>/);
    assert.equal(lat.effectDescRaw.split('\n').length, 3);
    // the current effect: +min(5 + 1 × L, 75 + 0.3 × L) %
    for (const [L, pct] of [[0, '5%'], [50, '55%'], [300, '165%']]) assert.match(formatBondEffect(lat, L), new RegExp(`\\+${pct}`), `${L} stacks`);
    assert.match(vic.desc, /每携带1件维式重锤回复8点技力/);
  } finally { h.m.dispose(); }
  const { createDataStore } = await import('../../public/js/data.js');
  const { readFileSync, existsSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { setLang, addMessages } = await import('../../shared/i18n.js');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const fetch = async (url) => {
    const abs = path.join(ROOT, url.replace(/^\/data\//, 'data/'));
    if (!existsSync(abs)) return { ok: false, status: 404, json: async () => null };
    const text = readFileSync(abs, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
  addMessages('en', JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8')));
  setLang('en');
  try {
    const d = createDataStore({ fetch, retryDelays: [] });
    await d.loadAll('chess', 'bonds', 'backups');
    await d.setLocale('en');
    d.setRules({ lateranoMod: 'B' });
    const lat = d.lookup('bonds', 'lateranoShip');
    assert.match(lat.desc, /^\[Laterano\] Operators gain ammo/);
    assert.match(lat.desc, /\n<At 100 stacks> \[Laterano\] Operators deal 200% damage.*Mostima/);
    assert.match(formatBondEffect(lat, 300), /\+165%/);
    d.setRules(null);
    assert.match(formatBondEffect(d.lookup('bonds', 'lateranoShip'), 300), /\+455%/, 'Mod A again: 5 + 1.5 × L');
  } finally { setLang('zh'); }
});

test('SPA-CC Junk: the client shows the Toxic Waste of a match with the tag (its name and text in English)', async () => {
  const { createDataStore } = await import('../../public/js/data.js');
  const { readFileSync, existsSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { setLang, addMessages } = await import('../../shared/i18n.js');
  const { CC } = await import('../../shared/ruleData.js');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const fetch = async (url) => {
    const abs = path.join(ROOT, url.replace(/^\/data\//, 'data/'));
    if (!existsSync(abs)) return { ok: false, status: 404, json: async () => null };
    const text = readFileSync(abs, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
  addMessages('en', JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8')));
  setLang('en');
  try {
    const d = createDataStore({ fetch, retryDelays: [] });
    await d.loadAll('items', 'chess', 'bonds', 'backups');
    await d.setLocale('en');
    assert.equal(d.lookup('items', CC.junk.itemId), null);
    d.setRules({ ccJunk: 2 });
    const it = d.lookup('items', CC.junk.itemId);
    assert.equal(it.name, 'Toxic Waste');
    assert.match(it.desc, /−1 income/);
    assert.equal(it.iconId, CC.junk.iconId);
    d.setRules(null);
    assert.equal(d.lookup('items', CC.junk.itemId), null);
  } finally { setLang('zh'); }
});

test('the boosterPack cheat: the client has the Booster Pack\'s record, so it is drawn with its icon (GitHub #62)', async () => {
  const { createDataStore } = await import('../../public/js/data.js');
  const { readFileSync, existsSync } = await import('node:fs');
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { setLang, addMessages } = await import('../../shared/i18n.js');
  const { BOOSTER, ITEM_BOOSTER } = await import('../../shared/ruleData.js');
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const fetch = async (url) => {
    const abs = path.join(ROOT, url.replace(/^\/data\//, 'data/'));
    if (!existsSync(abs)) return { ok: false, status: 404, json: async () => null };
    const text = readFileSync(abs, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  };
  addMessages('en', JSON.parse(readFileSync(path.join(ROOT, 'public/i18n/en.json'), 'utf8')));
  setLang('en');
  try {
    const d = createDataStore({ fetch, retryDelays: [] });
    await d.loadAll('items', 'chess', 'bonds', 'backups');
    await d.setLocale('en');
    assert.equal(d.lookup('items', BOOSTER.itemId), null);
    // the cheat alone, and with another rule that changes data
    for (const rules of [{ boosterPack: true }, { boosterPack: true, ccJunk: 1 }]) {
      d.setRules(rules);
      const it = d.lookup('items', BOOSTER.itemId);
      assert.ok(it, JSON.stringify(rules));
      assert.equal(it.name, 'Booster Pack');
      assert.equal(it.iconId, BOOSTER.iconId);
    }
    // the itemBoosterPack cheat's Equipment Booster Pack (GitHub #56): its own record and icon
    d.setRules({ itemBoosterPack: true });
    assert.equal(d.lookup('items', BOOSTER.itemId), null);
    const eq = d.lookup('items', ITEM_BOOSTER.itemId);
    assert.equal(eq.name, 'Equipment Booster Pack');
    assert.equal(eq.iconId, ITEM_BOOSTER.iconId);
    d.setRules(null);
    assert.equal(d.lookup('items', BOOSTER.itemId), null);
    assert.equal(d.lookup('items', ITEM_BOOSTER.itemId), null);
  } finally { setLang('zh'); }
});

test('GitHub #116: the loadout the lobby checked against 凯瑟琳 (her module) still gives 煌 the chosen skill', () => {
  const h = makeMatch({ mode: 'solo', seed: 5, lobbyRules: { blaze: true } }).start();
  try {
    // as the lobby stores it: complete, with 凯瑟琳's own module, and another operator's choice beside it
    const other = 'chess_char_1_09_a';
    assert.deepEqual(h.m.setLoadout('p_0', { [BLAZE.slot.a]: { skill: 0, module: 'uniequip_002_cathy' }, [other]: { skill: 0 } }), { ok: true });
    const ps = h.ps('p_0');
    for (const form of ['a', 'b']) {
      const lo = ps.loadoutFor(h.m.gd.chess(BLAZE.slot[form]));
      assert.equal(lo.skillIndex, 0, `${form}: Catherine's S1 → Blaze's S1`);
      if (form === 'b') assert.equal(lo.moduleId, BLAZE.moduleId, 'her X module, as Catherine\'s X');
    }
    assert.equal(ps.loadoutFor(h.m.gd.chess(other)).skillIndex, 0, 'the rest of the loadout is kept');
    assert.deepEqual(h.m.setLoadout('p_0', { [BLAZE.slot.a]: { skill: 0, module: 'none' } }), { ok: true });
    assert.equal(ps.loadoutFor(h.m.gd.chess(BLAZE.slot.b)).moduleId, 'none', '"no module" stays');
  } finally { h.m.dispose(); }
});
