// test/render/vfx-procedural.test.js — when the official layer stands for the field view's procedural looks (the 0.3.0
// official-effects audit R10 / R11, history §32.14.44, DESIGN §33.13): a skill whose official plan has no cast rows shows
// no procedural burst; a kit fx is skipped while a skill that covers it lasts (FX_COVER), bound to the official prefab
// the client plays there (FX_BINDINGS `during`, `hold: 'fx'`, `keys`, owner 'skill'), or repeated by a summon's official
// birth effect — and every procedural look stays with 官方特效 off or the effects not installed.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxWiring } from '../../public/js/render/vfx/wiring.js';
import { COVER_AFTER_S } from '../../public/js/render/vfx/skillfx.js';
import { FX_BINDINGS, FX_COVER, BOUND_BY_SKILL, coverOf, bindingEffects, bindingKeys, skillPlan, TEMPLATE_ROWS } from '../../public/js/render/vfx/skills.js';

const CROSSHAIR = ['lemuen_skill_03_crosshair_range', 'lemuen_skill_03_crosshair_02'];
const LOOPING = new Set(['tinman_skill_01_range_01', 'tinman_skill_01_token_01', 'mostma_skill_02_buff', ...CROSSHAIR]);
const KEYS = ['quiet_hit', 'silent_attack_01_trail', 'tinman_attack_hit_01', 'tinman_skill_01_start_03', 'tinman_skill_01_range_01', 'tinman_skill_01_token_01',
  'tinman_skill_01_start_01', 'mostma_skill_02_buff', 'reed2_attack_hit', 'reed2_skill_02_hit', 'g_birth', 'tok_birth', 'g_hit', ...CROSSHAIR];

function makeIndex({ installed = KEYS } = {}) {
  const prefabs = Object.fromEntries(installed.map((k) => [k, { file: `prefabs/${k}.json`, looping: LOOPING.has(k) }]));
  const mode = (hit) => [{ name: 'Default', attack: { class: 'MeleeAttack', cast: [], hit: [{ effects: [hit], directionType: 0 }] } }];
  const unit = (modes, skills, o = {}) => ({ kind: 'char', modes, skills, startEffect: null, deadEffect: null, ...o });
  return {
    units: {
      // no rows at all for its skill (银灰 S1): only its attack's hit is installed
      char_700_quiet: unit(mode('quiet_hit'), { skchr_quiet_1: { mode: null, projectiles: [], uses: [] } }),
      // a passive with no rows (普罗旺斯 S1): the sim opens its 0.5 s skill window at deploy, the client shows nothing
      char_701_passive: unit(mode('quiet_hit'), { skchr_passive_1: { mode: null, projectiles: [], uses: [] } }),
      // 赫默 S2 (CastTokenSkill, no rows): her attack is a projectile's — the unit's refs name its prefabs
      char_108_silent: unit([{ name: 'Default', attack: { class: 'RangedHeal', projectileKey: 'projectile_silent' } }], { skchr_silent_2: { mode: null, projectiles: [], uses: [] } }, { refs: ['silent_attack_01_trail'] }),
      char_4151_tinman: unit(mode('tinman_attack_hit_01'), { skchr_tinman_1: { mode: null, projectiles: ['projectile_chr_tinman_s1'], uses: [
        { role: 'loop', keys: ['tinman_skill_01_start_03'], from: 'UberEffectEmitter._castEffects', node: 'skchr_tinman_1', ability: 'RangedAttack', startEvent: 'ON_CAST_START', endEvent: 'ON_CAST_END', oneshot: false, list: 'cast', projectileKey: 'projectile_chr_tinman_s1' },
      ] } }),
      char_213_mostma: unit(mode('g_hit'), { skchr_mostma_2: { mode: null, projectiles: [], uses: [
        { role: 'loop', keys: ['mostma_skill_02_buff'], from: 'BuffDuringSkill._buffs', node: 'sk', on: 'owner' },
      ] } }),
      char_1020_reed2: unit(mode('reed2_attack_hit'), { skchr_reed2_2: { mode: null, projectiles: ['projectile_chr_reed2_fire'], uses: [] } }),
      char_900_carrier: unit(mode('g_hit'), {}),
      char_4193_lemuen: unit(mode('g_hit'), { skchr_lemuen_3: { mode: null, projectiles: [], uses: [] } }),
      token_1_own: unit(mode('g_hit'), {}, { kind: 'token', startEffect: 'tok_birth' }),
      token_2_plain: unit(mode('g_hit'), {}, { kind: 'token' }),
      enemy_1: { kind: 'enemy', modes: mode('g_hit'), skills: {} },
    },
    skills: {},
    projectiles: {
      projectile_chr_tinman_s1: { main: 'tinman_skill_01_trail_01', onReached: ['tinman_skill_01_range_01', 'tinman_skill_01_start_01', 'tinman_skill_01_token_01'], effects: [] },
      projectile_chr_reed2_fire: { main: null, onHit: ['reed2_skill_02_hit'], effects: [] },
    },
    skins: {},
    generic: { hit: { phys: 'g_hit', arts: 'g_hit', enemy: 'g_hit', heal: 'g_hit' }, die: {}, birth: { char: 'g_birth' }, status: {} },
    prefabs,
  };
}

const rec = (skillId, o = {}) => ({ skill: { skillId, index: 0, skillType: 'MANUAL', durationType: 'NONE', duration: 0, bb: {}, ...o } });
const RECS = {
  char_700_quiet: rec('skchr_quiet_1'),
  char_701_passive: rec('skchr_passive_1', { skillType: 'PASSIVE' }),
  char_108_silent: rec('skchr_silent_2'),
  char_4151_tinman: rec('skchr_tinman_1'),
  char_213_mostma: rec('skchr_mostma_2', { duration: 20 }),
  char_1020_reed2: rec('skchr_reed2_2', { duration: 20 }),
  char_4193_lemuen: rec('skchr_lemuen_3'),
};

async function setup({ active = true, installed } = {}) {
  const index = makeIndex({ installed });
  const spawned = [];
  const handles = [];
  const ofx = {
    active, time: 0, lite: false, tier: active ? 'full' : 'off', timers: [],
    lib: {
      has: (k) => !!index.prefabs[k], def: (k) => (index.prefabs[k] ? { isLoop: index.prefabs[k].looping, spawn: 2 } : null),
      index: async () => index, preload: async (keys) => keys.length, defs: new Map(),
    },
    spawn(key, place, opts) {
      if (!this.active) return null;
      const h = { key, place, opts, stopped: false, get alive() { return !this.stopped; }, stop() { this.stopped = true; }, kill() { this.stopped = true; } };
      spawned.push(key); handles.push(h);
      return h;
    },
  };
  const views = new Map();
  const w = new FxWiring(ofx, { speed: () => 10, record: (info) => RECS[info.defId] || null, view: (id) => views.get(id) || null });
  await w.ready();
  const view = (id, key, x, y = 10) => {
    const enemy = /^enemy_/.test(key);
    const v = { id, x, y, z: 0, visFacing: 1, isEnemy: enemy, alive: true, flags: 0, sp: 0, spMax: 10, dir: enemy ? undefined : 'RIGHT',
      info: { id, spine: key, defId: key, side: enemy ? 'enemy' : 'ally', kind: enemy ? 'enemy' : /^token_/.test(key) ? 'token' : 'op', skillIndex: 0 } };
    views.set(id, v);
    return v;
  };
  const frame = (dt = 1 / 30) => { w.sync(views.values()); w.tick(); ofx.time += dt; };
  return { w, ofx, views, view, frame, spawned, handles, index };
}

const live = (handles, key) => handles.filter((h) => h.key === key && h.alive);

describe('R10: a skill whose official plan has no cast rows shows no procedural burst', () => {
  test('with the unit\'s effects installed the official layer stands for the cast (render/app.js skips fx.skill)', async () => {
    const { w, view, frame, spawned } = await setup();
    const u = view(1, 'char_700_quiet', 5);
    frame();
    assert.equal(w.skill(u, true), true);
    assert.equal(spawned.length, 0, 'and plays nothing: the client shows nothing there');
  });

  test('a unit whose attack is a projectile\'s (赫默 S2): its referenced prefabs show its effects are installed', async () => {
    const { w, view, frame } = await setup();
    const u = view(1, 'char_108_silent', 5);
    frame();
    assert.equal(w.skill(u, true), true);
    const lite = await setup({ installed: KEYS.filter((k) => k !== 'silent_attack_01_trail') });
    const v = lite.view(1, 'char_108_silent', 5);
    lite.frame();
    assert.equal(lite.w.skill(v, true), false);
  });

  test('a lite install without the unit\'s effects, and the layer off, keep the procedural burst', async () => {
    const lite = await setup({ installed: KEYS.filter((k) => k !== 'quiet_hit') });
    const a = lite.view(1, 'char_700_quiet', 5);
    lite.frame();
    assert.equal(lite.w.skill(a, true), false);
    const off = await setup({ active: false });
    const b = off.view(1, 'char_700_quiet', 5);
    off.frame();
    assert.equal(off.w.skill(b, true), false);
  });
});

describe('R10 for a passive skill (0.3.1): its skill window at deploy shows no procedural burst either', () => {
  test('nothing official to draw and the unit\'s effects installed: the official layer stands for it', async () => {
    const { w, view, frame, spawned } = await setup();
    const u = view(1, 'char_701_passive', 5);
    frame();
    assert.equal(w.skill(u, true), true);
    assert.equal(spawned.length, 0);
  });

  test('a lite install without the unit\'s effects, and the layer off, keep the procedural burst', async () => {
    const lite = await setup({ installed: KEYS.filter((k) => k !== 'quiet_hit') });
    const a = lite.view(1, 'char_701_passive', 5);
    lite.frame();
    assert.equal(lite.w.skill(a, true), false);
    const off = await setup({ active: false });
    const b = off.view(1, 'char_701_passive', 5);
    off.frame();
    assert.equal(off.w.skill(b, true), false);
  });
});

describe('R11: FX_COVER — a kind the skill\'s official effects stand for', () => {
  test('莫斯提马 S2\'s zone is skipped while the skill lasts and COVER_AFTER_S after, drawn again later', async () => {
    const { w, ofx, view, frame } = await setup();
    const m = view(1, 'char_213_mostma', 5);
    frame();
    w.skill(m, true);
    assert.equal(w.simFx('zone', 5, 10, { id: 1, duration: 20 }), true, 'during the skill');
    frame();
    w.skill(m, false);
    ofx.time += COVER_AFTER_S / 2;
    assert.equal(w.simFx('zone', 5, 10, { id: 1 }), true, 'a moment after its end');
    ofx.time += COVER_AFTER_S;
    frame();
    assert.equal(w.simFx('zone', 5, 10, { id: 1 }), false, 'not the skill\'s any more');
    assert.equal(w.simFx('ripple', 5, 10, { id: 1 }), false, 'a kind it does not cover');
  });

  test('not covered with the skill\'s effects not installed or the layer off', async () => {
    const lite = await setup({ installed: KEYS.filter((k) => k !== 'mostma_skill_02_buff') });
    const a = lite.view(1, 'char_213_mostma', 5);
    lite.frame();
    lite.w.skill(a, true);
    assert.equal(lite.w.simFx('zone', 5, 10, { id: 1 }), false);
    const off = await setup({ active: false });
    const b = off.view(1, 'char_213_mostma', 5);
    off.frame();
    off.w.skill(b, true);
    assert.equal(off.w.simFx('zone', 5, 10, { id: 1 }), false);
  });

  test('the table: R11\'s cases, src before id, a kind lookup', () => {
    assert.ok(coverOf('skchr_mostma_2', 'zone'));
    assert.ok(coverOf('SKCHR_ARCHET_1', 'volley'));
    assert.equal(coverOf('skchr_mostma_2', 'displace'), false, 'a displacement stays (a game fact)');
    assert.equal(coverOf(null, 'zone'), false);
    for (const [sid, kinds] of Object.entries(FX_COVER)) {
      assert.ok(Array.isArray(kinds) && kinds.length, sid);
      for (const k of kinds) assert.ok(!['drone', 'drones', 'droneLock', 'overload'].includes(k), `${sid}: the floating units decide ${k}`);
    }
  });
});

describe('R11: FX_BINDINGS — the official prefab the client plays at the kit fx', () => {
  test('锡人 S1\'s zone plays the flask\'s reached effects at its tile, held for the zone\'s own time; outside the skill it is not bound', async () => {
    const { w, ofx, view, frame, spawned, handles } = await setup();
    const t = view(1, 'char_4151_tinman', 4);
    frame();
    w.skill(t, true);
    assert.equal(w.simFx('zone', 5, 11.29, { radius: 1, dur: 3, id: 1, skill: 'tinman1' }), true);
    w.skill(t, false);
    for (const k of ['tinman_skill_01_range_01', 'tinman_skill_01_start_01', 'tinman_skill_01_token_01']) assert.ok(spawned.includes(k), k);
    assert.equal(live(handles, 'tinman_skill_01_range_01').length, 1);
    assert.equal(handles.find((x) => x.key === 'tinman_skill_01_range_01').opts.important, true, 'never dropped while the area lasts');
    for (let i = 0; i < 2.5 * 30; i++) frame();
    assert.equal(live(handles, 'tinman_skill_01_range_01').length, 1, 'still there at 2.5 s');
    for (let i = 0; i < 0.6 * 30; i++) frame();
    assert.equal(live(handles, 'tinman_skill_01_range_01').length, 0, 'gone after the zone\'s 3 s');
    ofx.time += 5;
    frame();
    const n = spawned.length;
    assert.equal(w.simFx('zone', 5, 11, { radius: 1, dur: 3, id: 1 }), false, 'a zone outside the skill is not the skill\'s');
    assert.equal(spawned.length, n);
  });

  test('none of the binding\'s prefabs installed: the procedural zone stays', async () => {
    const { w, view, frame } = await setup({ installed: KEYS.filter((k) => !/^tinman_skill_01_(range|start_01|token)/.test(k)) });
    const t = view(1, 'char_4151_tinman', 4);
    frame();
    w.skill(t, true);
    assert.equal(w.simFx('zone', 5, 11, { dur: 8, id: 1 }), false);
  });

  test('焰影苇草 S2: a strike from a carrier (owner \'skill\') plays the fireball\'s hit on the enemy while her skill lasts', async () => {
    const { w, view, frame, handles } = await setup();
    const r = view(1, 'char_1020_reed2', 4);
    view(2, 'char_900_carrier', 5);
    const e = view(3, 'enemy_1', 7);
    frame();
    assert.equal(w.simFx('strike', 7, 10, { id: 3, src: 2 }), false, 'not before her skill');
    w.skill(r, true);
    assert.equal(w.simFx('strike', 7, 10, { id: 3, src: 2 }), true);
    assert.ok(handles.some((x) => x.key === 'reed2_skill_02_hit'), 'the official hit');
    e.alive = false;
  });

  test('蕾缪安 S3: a lock\'s crosshair stays while her skill waits, at the spot of an enemy gone, until the shell fired at it lands', async () => {
    const { w, view, frame, handles } = await setup();
    const lem = view(1, 'char_4193_lemuen', 3);
    const a = view(2, 'enemy_1', 5);
    const b = view(3, 'enemy_1', 6);
    frame();
    w.skill(lem, true);
    assert.equal(w.simFx('lock', 5, 10, { id: 2, src: 1, hold: 1 }), true, 'the official crosshair stands for the reticle');
    frame();
    assert.equal(w.simFx('lock', 6, 10, { id: 3, src: 1, hold: 1 }), true);
    const on = (v) => handles.filter((h) => CROSSHAIR.includes(h.key) && h.alive && h.opts.owner === v);
    assert.equal(on(a).length, 2, 'both prefabs on the locked enemy');
    assert.ok(on(a).every((h) => typeof h.opts.track === 'function'), 'kept to the enemy (stick)');
    for (let i = 0; i < 90; i++) frame();
    assert.equal(on(a).length + on(b).length, 4, 'up 3 s later: her skill still runs (it waited 1 s — the fx\'s `hold` flag)');
    a.alive = false;
    frame();
    assert.equal(on(a).length, 2, 'the enemy is gone: its crosshair stays, the shell still falls there');
    w.skill(lem, false);
    frame();
    w.simFx('bombardShell', 5.1, 9.9, { id: 1, r: 1.5, t: 0.3, i: 0 });
    for (let i = 0; i < 9; i++) frame();
    assert.equal(on(a).length, 2, 'until its shell lands');
    w.simFx('bombard', 5.1, 9.9, { id: 1, r: 1.5 });
    frame();
    assert.equal(on(a).length, 0, 'its shell landed');
    assert.equal(on(b).length, 2, 'the other lock waits for its own');
    for (let i = 0; i < 160; i++) frame();
    assert.equal(on(b).length, 0, 'a shell that never comes: gone 5 s after the last sign of her S3');
  });

  test('(fork) 蕾缪安 S3 in an outfit: the lock plays the outfit\'s crosshairs (its skinpack twins), the default outfit the plain ones', async () => {
    const SUF = 'ambiencesynesthesia#7';
    const twins = CROSSHAIR.map((k) => `${k}_${SUF}`);
    const { w, view, frame, handles, index } = await setup({ installed: [...KEYS, ...twins] });
    index.skinFx = { [SUF]: Object.fromEntries(CROSSHAIR.map((k, i) => [k, twins[i]])) };
    const lem = view(1, 'char_4193_lemuen', 3);
    lem.info.model = 'char_4193_lemuen@ambienceSynesthesia#7';
    const plain = view(4, 'char_4193_lemuen', 4);
    view(2, 'enemy_1', 5);
    view(3, 'enemy_1', 6);
    frame();
    w.skill(lem, true);
    w.skill(plain, true);
    assert.equal(w.simFx('lock', 5, 10, { id: 2, src: 1, hold: 1 }), true);
    assert.equal(w.simFx('lock', 6, 10, { id: 3, src: 4, hold: 1 }), true);
    const keys = handles.filter((h) => h.alive).map((h) => h.key).sort();
    assert.deepEqual(keys, [...CROSSHAIR, ...twins].sort(), 'the outfit\'s twins for her, the plain crosshairs for the default outfit');
  });

  test('(fork) 焰影苇草 S3: an enemy\'s death blast plays the official reed2_debuff_boom_01 once where it fell, her Curator outfit\'s twin', async () => {
    const BOOM = 'reed2_debuff_boom_01', SUF = 'epoque#30', TWIN = `${BOOM}_${SUF}`;
    assert.deepEqual(bindingKeys(makeIndex({ installed: [...KEYS, BOOM] }), 'skchr_reed2_3'), [BOOM]);
    const { w, view, frame, handles, index } = await setup({ installed: [...KEYS, BOOM, TWIN] });
    index.skinFx = { [SUF]: { [BOOM]: TWIN } };
    index.units.char_1020_reed2.skills.skchr_reed2_3 = { mode: null, projectiles: [], uses: [] };
    RECS.reed2_s3 = rec('skchr_reed2_3', { duration: 30 });
    try {
      const reed = view(1, 'char_1020_reed2', 3);
      reed.info.defId = 'reed2_s3';
      const curator = view(4, 'char_1020_reed2', 4);
      curator.info.defId = 'reed2_s3';
      curator.info.model = 'char_1020_reed2@epoque#30';
      frame();
      w.skill(reed, true);
      w.skill(curator, true);
      frame();
      assert.equal(w.simFx('scorchBurst', 6, 11, { id: 1, r: 1.7 }), true, 'the official blast stands for the procedural one');
      assert.equal(w.simFx('scorchBurst', 7, 12, { id: 4, r: 1.7 }), true);
      const booms = handles.filter((h) => h.key === BOOM || h.key === TWIN);
      assert.deepEqual(booms.map((h) => h.key), [BOOM, TWIN], 'once each: the plain blast for the default outfit, the twin for Curator');
      assert.equal(booms[0].opts.important, true, 'never dropped');
      // a chain: blasts of the same frame each play; a blast the sim defers past the skill's end (a kill on its last
      // tick) still plays — every 'scorchBurst' the kit sends is a blast
      for (const [x, y] of [[8, 11], [9, 11], [9, 12]]) assert.equal(w.simFx('scorchBurst', x, y, { id: 1, r: 1.7 }), true);
      w.skill(reed, false);
      frame();
      assert.equal(w.simFx('scorchBurst', 10, 11, { id: 1, r: 1.7 }), true, 'after the skill ended');
      assert.equal(handles.filter((h) => h.key === BOOM).length, 5);
    } finally {
      delete RECS.reed2_s3;
    }
  });

  test('(fork) 蕾缪安 S3: the official falling shell for the fx\'s flight, the lock-on mark with each lock, the salute at the end', async () => {
    const MARK = 'lemuen_skill_03_crosshair_01', SHELL = 'lemuen_skill_03_trail_02', SALUTE = 'lemuen_skill_03_start_01';
    const { w, view, frame, handles } = await setup({ installed: [...KEYS, MARK, SHELL, SALUTE] });
    const lem = view(1, 'char_4193_lemuen', 3);
    view(2, 'enemy_1', 5);
    frame();
    w.skill(lem, true);
    frame();
    w.simFx('lock', 5, 10, { id: 2, src: 1, hold: 1 });
    assert.equal(handles.filter((h) => h.key === MARK).length, 1, 'the lock-on mark with the lock');
    w.skill(lem, false);
    frame();
    assert.equal(handles.filter((h) => h.key === SALUTE).length, 1, 'the salute on her as the skill ends (TEMPLATE_ROWS)');
    assert.equal(handles.find((h) => h.key === SALUTE).place?.view ?? handles.find((h) => h.key === SALUTE).opts?.owner, lem);
    assert.equal(w.simFx('bombardShell', 5.1, 9.9, { id: 1, r: 1.5, t: 0.3, i: 0 }), true, 'the official shell stands for the procedural one');
    const shell = handles.find((h) => h.key === SHELL);
    assert.ok(shell && shell.alive);
    for (let i = 0; i < 8; i++) frame();
    assert.ok(shell.alive, 'falling for the fx\'s `t`');
    for (let i = 0; i < 3; i++) frame();
    assert.equal(shell.alive, false, 'gone once it has landed');
  });

  test('(fork) 蕾缪安 S2: the aim holds its reticle and aim line until her shot, which plays its hit; 莫斯提马 S2\'s hit stops like a hit', async () => {
    const RET = 'lemuen_skill_02_crosshair_02', LINE = 'lemuen_skill_02_trail_01', SHOT = 'lemuen_skill_02_hit_01', HIT = 'mostma_skill_02_hit';
    const { w, view, frame, handles, index } = await setup({ installed: [...KEYS, RET, LINE, SHOT, HIT] });
    index.prefabs[HIT].looping = true;                          // the Ethereal Harmony twin loops
    index.units.char_4193_lemuen.skills.skchr_lemuen_2 = { mode: null, projectiles: [], uses: [] };
    RECS.lemuen_s2 = rec('skchr_lemuen_2', { bb: { 'attack@aim_duration': 3.5 } });
    RECS.mostma_s2 = rec('skchr_mostma_2', { duration: 7 });
    try {
      const lem = view(1, 'char_4193_lemuen', 3);
      lem.info.defId = 'lemuen_s2';
      const mo = view(4, 'char_213_mostma', 4);
      mo.info.defId = 'mostma_s2';
      view(2, 'enemy_1', 6);
      view(3, 'enemy_1', 7);
      frame();
      w.skill(lem, true);
      w.skill(mo, true);
      frame();
      assert.equal(w.simFx('lock', 6, 10, { id: 2, src: 1 }), true, 'the official aim stands for the procedural reticle');
      w.simFx('lock', 7, 10, { id: 3, src: 1 });
      const alive = (k) => handles.filter((h) => h.key === k && h.alive).length;
      assert.deepEqual([alive(RET), alive(LINE)], [2, 2], 'a reticle and a line per aimed enemy');
      for (let i = 0; i < 30; i++) frame();
      assert.deepEqual([alive(RET), alive(LINE)], [2, 2], 'held while she aims (1 s in)');
      assert.equal(w.simFx('crit', 6, 10, { id: 2, src: 1 }), true);
      assert.deepEqual([alive(RET), alive(LINE)], [1, 1], 'her shot ends that aim only');
      assert.equal(handles.filter((h) => h.key === SHOT).length, 1, 'and plays its hit on the enemy');
      for (let i = 0; i < 90; i++) frame();
      assert.deepEqual([alive(RET), alive(LINE)], [0, 0], 'an aim with no shot ends with her aim time');
      assert.equal(w.simFx('timeLockHit', 6, 10, { id: 2, src: 4 }), true);
      const hit = handles.find((h) => h.key === HIT);
      assert.ok(hit.alive);
      for (let i = 0; i < 20; i++) frame();
      assert.equal(hit.alive, false, 'a looping hit prefab stops after SKILL_CAST_S');
    } finally {
      delete RECS.lemuen_s2;
      delete RECS.mostma_s2;
    }
  });

  test('(fork) TEMPLATE_ROWS: a row the index does not list joins the plan once; a linked index keeps its own', () => {
    const SALUTE = 'lemuen_skill_03_start_01';
    const idx = makeIndex({ installed: [...KEYS, SALUTE] });
    const plan = skillPlan(idx, 'char_4193_lemuen', 'skchr_lemuen_3', { rec: RECS.char_4193_lemuen });
    assert.deepEqual(plan.end.map((e) => e.key), [SALUTE]);
    assert.equal(TEMPLATE_ROWS.skchr_lemuen_3[0].role, 'end');
    idx.units.char_4193_lemuen.skills.skchr_lemuen_3.uses = [{ role: 'end', keys: [SALUTE], from: 'linked', on: 'owner' }];
    assert.equal(skillPlan(idx, 'char_4193_lemuen', 'skchr_lemuen_3', { rec: RECS.char_4193_lemuen }).end.length, 1, 'no second copy');
    assert.equal(skillPlan(makeIndex(), 'char_4193_lemuen', 'skchr_lemuen_3', { rec: RECS.char_4193_lemuen }).end.length, 0, 'not installed: no row');
  });

  test('蕾缪安 S3: her knock-out drops the locks no shell took; a shell in the air keeps its lock', async () => {
    const { w, view, frame, handles } = await setup();
    const lem = view(1, 'char_4193_lemuen', 3);
    const a = view(2, 'enemy_1', 5);
    const b = view(3, 'enemy_1', 7);
    frame();
    w.skill(lem, true);
    w.simFx('lock', 5, 10, { id: 2, src: 1, hold: 1 });
    w.simFx('lock', 7, 10, { id: 3, src: 1, hold: 1 });
    w.skill(lem, false);
    w.simFx('bombardShell', 5, 10, { id: 1, r: 1.5, t: 0.3, i: 0 });
    lem.alive = false;
    frame();
    const on = (v) => handles.filter((h) => CROSSHAIR.includes(h.key) && h.alive && h.opts.owner === v).length;
    assert.equal(on(a), 2, 'its shell is in the air');
    assert.equal(on(b), 0, 'no shell will come');
  });

  test('蕾缪安 S3: a tier switch clears the held locks (PR #862 review); a later lock starts afresh', async () => {
    const { w, ofx, view, frame, handles } = await setup();
    const lem = view(1, 'char_4193_lemuen', 3);
    view(2, 'enemy_1', 5);
    frame();
    w.skill(lem, true);
    w.simFx('lock', 5, 10, { id: 2, src: 1, hold: 1 });
    frame();
    const crosshairs = () => handles.filter((h) => CROSSHAIR.includes(h.key) && h.alive).length;
    assert.equal(crosshairs(), 2);
    ofx.tier = 'lite';
    frame();
    assert.equal(crosshairs(), 0, 'the switch stops them and forgets the locks');
    assert.equal(w.skills.locks.length, 0);
    w.simFx('lock', 5, 10, { id: 2, src: 1, hold: 1 });
    frame();
    assert.equal(crosshairs(), 2, 'a new lock after the switch shows');
  });

  test('the table: owner fields, keys, the owner-less kinds, preloading', () => {
    const idx = makeIndex();
    assert.equal(FX_BINDINGS.skchr_tinman_1.zone.hold, 'fx');
    assert.equal(FX_BINDINGS.skchr_lemuen_3.lock.owner, 'src');
    assert.equal(FX_BINDINGS.skchr_lemuen_3.lock.hold, 'lock');
    assert.deepEqual(bindingEffects(idx, FX_BINDINGS.skchr_pasngr_3.lightning), ['pasngr_skill_03_hit'], 'explicit keys');
    assert.deepEqual(BOUND_BY_SKILL.strike, ['skchr_reed2_2']);
    assert.deepEqual(bindingKeys(idx, 'skchr_tinman_1').sort(), ['tinman_skill_01_range_01', 'tinman_skill_01_start_01', 'tinman_skill_01_token_01']);
    for (const kinds of Object.values(FX_BINDINGS)) for (const b of Object.values(kinds)) assert.ok(['id', 'src', 'skill'].includes(b.owner));
  });
});

describe('R11: a summon\'s arrival repeats its official birth effect', () => {
  test('the summon pillar in the deploy\'s frame is skipped; the arrival burst only with the token\'s own birth effect', async () => {
    const { w, view, frame } = await setup();
    const a = view(5, 'token_1_own', 6);
    const b = view(6, 'token_2_plain', 7);
    frame();
    w.deploy(a);
    w.deploy(b);
    assert.equal(w.simFx('summon', 6, 10, { id: 5, token: 'token_1_own' }), true);
    assert.equal(w.simFx('summon', 7, 10, { id: 6, token: 'token_2_plain' }), true, 'the generic birth is drawn too');
    assert.equal(w.simFx('summonStun', 6, 10, { id: 5, token: 'token_1_own', n: 1 }), true, 'its own birth effect is its arrival');
    assert.equal(w.simFx('summonBurst', 7, 10, { id: 6, token: 'token_2_plain', n: 1 }), false, 'the generic birth is no burst');
    assert.equal(w.simFx('drones', 6, 10, { id: 5, n: 1 }), false, 'the floating units decide theirs');
    frame();
    assert.equal(w.simFx('summon', 6, 10, { id: 5 }), false, 'a later frame: no birth to repeat');
  });

  test('without the birth effect installed, or with the layer off, the pillar stays', async () => {
    const lite = await setup({ installed: KEYS.filter((k) => k !== 'g_birth') });
    const a = lite.view(6, 'token_2_plain', 7);
    lite.frame();
    lite.w.deploy(a);
    assert.equal(lite.w.simFx('summon', 7, 10, { id: 6 }), false);
    const off = await setup({ active: false });
    const b = off.view(6, 'token_2_plain', 7);
    off.frame();
    off.w.deploy(b);
    assert.equal(off.w.simFx('summon', 7, 10, { id: 6 }), false);
  });
});
