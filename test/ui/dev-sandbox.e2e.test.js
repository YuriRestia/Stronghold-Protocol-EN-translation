// (fork) SP_E2E=1 node --test test/ui/dev-sandbox.e2e.test.js — the dev battle sandbox (public/dev/sandbox.html): bonds
// counted by the match's own rules (/match/bondsMeta.js) from the board, item-granted bonds, stacks and +count from the
// URL, items kept in the URL, another round's waves loaded in place (board and bench kept) and "Bank + next round", a
// placed unit's skill / outfit, the boss picker (Final Assault on the boss field), pause and frame step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHROME, hasChrome, waitForFunctionLong } from '../e2e/client.mjs';
import { startServer } from '../../server/index.js';

const enabled = process.env.SP_E2E === '1' && hasChrome();

// three 谢拉格 (Kjerag) operators on act2autochess_m01; Harold wears 变形同构体 + 坚守盾牌 (that pairing grants 坚守 / steadShip)
const ISO = 'chess_item_6_09_e_a';
const SHIELD = 'chess_item_1_02_e_a';
const UNITS = `chess_char_1_02_a:9,3:0:RIGHT;chess_char_2_05_a:10,4:0:RIGHT!${ISO},${SHIELD};chess_char_3_11_a:11,4:0:RIGHT`;

test('dev sandbox: real bonds, item bonds, stacks, items in the URL, rounds in place', { skip: !enabled, timeout: 120000 }, async (t) => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  t.after(() => srv.close());
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const q = new URLSearchParams({ map: 'act2autochess_m01', enemies: 'hard-normal-r1', units: UNITS, layers: 'kjeragShip:7', bonus: 'victoriaShip:1' });
  await page.goto(`${srv.url}/dev/sandbox.html?${q}`);
  await page.waitForFunction(() => window.__sandbox?.ready || window.__sandbox?.error, { timeout: 60000 });
  assert.equal(await page.evaluate(() => window.__sandbox.error), null);

  const bonds = await page.evaluate(() => window.__sandbox.bonds());
  assert.deepEqual(bonds.kjeragShip, { count: 3, active: true, tier: 1, layers: 7 }, 'three Kjerag members, the URL stacks');
  assert.equal(bonds.steadShip.count, 2, 'Matterhorn + Harold through 变形同构体 + 坚守盾牌');
  assert.equal(bonds.victoriaShip.count, 2, 'Harold + the URL +count');
  const units = await page.evaluate(() => window.__sandbox.units());
  assert.equal(units.length, 3);
  assert.deepEqual(units.find((u) => u.chessId === 'chess_char_2_05_a').items, [ISO, SHIELD]);
  assert.match(await page.evaluate(() => document.querySelector('#bond-list li.is-active')?.textContent || ''), /3 members · tier 1\/2 \(3\/6\)/);
  const url = new URL(page.url());
  assert.ok(url.searchParams.get('units').includes(`!${ISO},${SHIELD}`), 'items stay in the URL');
  assert.equal(url.searchParams.get('layers'), 'kjeragShip:7');

  // a placed unit's skill and outfit, changed from its list entry (the outfit rebuilds its piece: a new uid)
  const pick = async (label, value) => page.evaluate(({ label, value }) => {
    const sel = document.querySelector(`select[aria-label="${label}"]`);
    sel.value = value;
    sel.dispatchEvent(new Event('change'));
  }, { label, value });
  await pick('Skill of Matterhorn', '1');
  await pick('Outfit of Matterhorn', 'char_199_yak@summer#1');
  const yak = (await page.evaluate(() => window.__sandbox.units())).find((u) => u.chessId === 'chess_char_1_02_a');
  assert.equal(yak.skillIndex, 1);
  assert.equal(yak.skin, 'char_199_yak@summer#1');
  assert.ok(new URL(page.url()).searchParams.get('units').includes('chess_char_1_02_a:9,3:1:RIGHT:char_199_yak@summer#1'));

  // the game's widgets: the bond strip (a disc per bond with members), its popup, a piece's detail card
  assert.ok(await page.evaluate(() => document.querySelectorAll('.sb-strip .bslot').length) >= 3, 'bond strip discs');
  await page.evaluate(() => document.querySelector('.sb-strip [data-bond="kjeragShip"] button.bond').click());
  assert.ok(await page.evaluate(() => !!document.querySelector('.bpop')), 'bond popup');
  await page.evaluate(() => window.__sandbox.click({ uid: window.__sandbox.boardUids()[1] }));
  assert.ok(await page.evaluate(() => !!document.querySelector('.dpanel--chess')), 'detail card of a clicked piece');
  await page.evaluate(() => { document.querySelector('.bpop__close')?.click(); document.querySelector('.dpanel__close')?.click(); });
  // icon pickers: operators by bond (the pick fills the operator picker), items by name (the pick equips)
  await page.evaluate(() => document.getElementById('op-browse').click());
  assert.match(await page.evaluate(() => document.querySelector('.sbp__group h3 span').textContent), /\S/);
  await page.evaluate(() => document.querySelector('.sbp__cell').click());
  assert.ok(await page.evaluate(() => document.getElementById('op-search').value.length > 0) && !(await page.evaluate(() => !!document.querySelector('.sbp'))));
  await page.evaluate(() => document.querySelector('button[aria-label="Equip an item on Snow Hunter"]').click());
  await page.evaluate(() => document.querySelector('.sbp__cell').click());
  assert.equal((await page.evaluate(() => window.__sandbox.units())).find((u) => u.chessId === 'chess_char_3_11_a').items.length, 1);

  // another round in place: the board stays, the URL follows
  await page.evaluate(() => window.__sandbox.setWave('hard-normal-r2'));
  assert.equal(await page.evaluate(() => window.__sandbox.wave().base), 'hard-normal-r2');
  assert.equal(await page.evaluate(() => window.__sandbox.units().length), 3);
  assert.equal(new URL(page.url()).searchParams.get('enemies'), 'hard-normal-r2');

  // bank with nothing gained: logged, stacks unchanged, on to round 3
  await page.evaluate(() => window.__sandbox.bank(true));
  assert.equal(await page.evaluate(() => window.__sandbox.wave().base), 'hard-normal-r3');
  assert.deepEqual(await page.evaluate(() => window.__sandbox.layers()), { kjeragShip: 7 });
  assert.match(await page.evaluate(() => document.getElementById('round-log').textContent), /Round 2: no stacks gained/);

  // the boss picker: the map's Final Assault / Hidden Core in the wave list, fought on the boss field
  assert.deepEqual(await page.evaluate(() => [...document.getElementById('enemies').options].map((o) => o.value).filter((v) => /boss|hidden/.test(v))),
    ['hard-boss-r14', 'hard-hidden-r15']);
  await page.evaluate(() => window.__sandbox.setWave('hard-boss-r14'));
  assert.equal(await page.evaluate(() => window.__sandbox.units().length), 3, 'these tiles exist on the boss field too');
  await page.evaluate(() => window.__sandbox.fight());
  await page.waitForFunction(() => window.__sandbox.tick() > 30, { timeout: 30000, polling: 100 });
  assert.equal(await page.evaluate(() => window.__sandbox.runner.state().kind), 'boss');
  // the boss field's camera row, and a click on the boss opens its card
  assert.equal(await page.evaluate(() => document.getElementById('cam-row').hidden), false);
  await page.evaluate(() => window.__sandbox.camLayer('L'));
  assert.equal(await page.evaluate(() => document.getElementById('cam-L').getAttribute('aria-pressed')), 'true');
  const boss = await page.evaluate(() => {
    const r = window.__sandbox.runner;
    const units = r._entries.get(r.state().battleId).battle.units;
    const u = [...(units?.values?.() || units || [])].find((x) => x.side === 'enemy' && x.alive);
    return u ? { id: u.id, defId: u.defId || u.def?.key } : null;
  });
  await page.evaluate((b) => window.__sandbox.click({ unitId: b.id, unit: { id: b.id, side: 'enemy', defId: b.defId } }), boss);
  assert.ok(await page.evaluate(() => !!document.querySelector('.dpanel--enemy')), 'enemy / boss card');
  await page.evaluate(() => window.__sandbox.prep());

  // stacking in battle: three 阿戈尔 (Ægir) operators — the bond's opening marks add layers (bonds/core.js gainLayers),
  // which only happens with the real bonds in the battle input; banked with the settlement's cap, then round 2
  const egir = new URLSearchParams({ map: 'act2autochess_m01', enemies: 'hard-normal-r1', speed: '4', layers: 'egirShip:2',
    units: 'chess_char_1_04_a:9,3:0:RIGHT;chess_char_2_07_a:9,4:0:RIGHT;chess_char_3_09_a:10,4:0:RIGHT' });
  await page.goto(`${srv.url}/dev/sandbox.html?${egir}`);
  await page.waitForFunction(() => window.__sandbox?.ready || window.__sandbox?.error, { timeout: 60000 });
  assert.deepEqual(await page.evaluate(() => window.__sandbox.bonds().egirShip), { count: 3, active: true, tier: 1, layers: 2 });
  await page.evaluate(() => window.__sandbox.fight());
  await waitForFunctionLong(page, () => window.__sandbox.gains() || (window.__sandbox.runner?.state?.()?.done && !document.getElementById('bank').disabled), { timeout: 90000, polling: 500 });
  const gained = (await page.evaluate(() => window.__sandbox.gains()))?.egirShip;
  assert.ok(gained > 0, `Ægir stacked in battle (${gained})`);
  // the battle meter: damage per unit from the sim's counters, the stacks it saw = the result's layerGains
  const meter = await page.evaluate(() => window.__sandbox.meter());
  assert.ok(meter.totals.dmg > 0, 'damage dealt');
  assert.equal(meter.rows.length, 3, 'one row per operator');
  assert.deepEqual(meter.byBond, [{ bondId: 'egirShip', n: gained }]);
  assert.equal(meter.totals.stacks, gained);
  assert.ok(await page.evaluate(() => !!document.querySelector('.sb-meter .dmg__row')), 'meter bars drawn');
  await page.evaluate(() => window.__sandbox.bank(true));
  assert.deepEqual(await page.evaluate(() => window.__sandbox.layers()), { egirShip: 2 + gained });
  assert.equal(await page.evaluate(() => window.__sandbox.wave().base), 'hard-normal-r2');
  assert.match(await page.evaluate(() => document.getElementById('round-log').textContent), new RegExp(`Round 1: Ægir \\+${gained} \\(→ ${2 + gained}\\)`));

  // pause and frame step: the clock stands still while paused, a step is exactly n ticks, and a battle paused and stepped
  // ends exactly like the same battle run straight through (the sim is deterministic per tick)
  await page.evaluate(() => { window.__sandbox.setWave('hard-normal-r1'); window.__sandbox.fight(); });
  await waitForFunctionLong(page, () => window.__sandbox.lastResult, { timeout: 90000, polling: 500 });
  const straight = JSON.stringify(await page.evaluate(() => window.__sandbox.lastResult));
  await page.evaluate(() => window.__sandbox.fight());
  await page.waitForFunction(() => window.__sandbox.tick() > 40, { timeout: 30000, polling: 50 });
  await page.evaluate(() => window.__sandbox.pause(true));
  // (a frame already scheduled still brings the battle up to the pause instant — at most a tick or two)
  await new Promise((r) => setTimeout(r, 200));
  const t0 = await page.evaluate(() => window.__sandbox.tick());
  await new Promise((r) => setTimeout(r, 600));
  assert.equal(await page.evaluate(() => window.__sandbox.tick()), t0, 'paused: no ticks');
  assert.equal(await page.evaluate(() => { window.__sandbox.step(1); return window.__sandbox.tick(); }), t0 + 1);
  assert.equal(await page.evaluate(() => { window.__sandbox.step(10); return window.__sandbox.tick(); }), t0 + 11);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.evaluate(() => window.__sandbox.tick()), t0 + 11, 'still paused after the steps');
  await page.evaluate(() => window.__sandbox.pause(false));
  await waitForFunctionLong(page, () => window.__sandbox.lastResult, { timeout: 90000, polling: 500 });
  assert.equal(JSON.stringify(await page.evaluate(() => window.__sandbox.lastResult)), straight, 'paused + stepped = straight through');

  // core bond preset: the whole of 谢拉格 (Kjerag) in one click, the 3 Ægir operators already placed stay
  await page.evaluate(() => window.__sandbox.prep());
  const added = await page.evaluate(() => window.__sandbox.addBond('kjeragShip'));
  assert.equal(added.onBoard + added.onBench, 10, JSON.stringify(added));
  const k = await page.evaluate(() => window.__sandbox.bonds().kjeragShip);
  assert.equal(k.tier, 2, `all Kjerag members counted (${k.count})`);
  assert.deepEqual(await page.evaluate(() => window.__sandbox.addBond('kjeragShip')), { onBoard: 0, onBench: 0, left: 0 }, 'a second click adds nobody');
  assert.deepEqual(errors, []);
});

// (fork) the card's 普通 / 技能 range buttons move the field highlight — a 自选 pick (丰川祥子) and a normal chess (烛煌
// S3), in prep and in battle (public/dev/sandbox.js drawCardRange, ui/rangePreview.js)
test('dev sandbox: the card range buttons light the skill range on the field, 自选 picks included', { skip: !enabled, timeout: 120000 }, async (t) => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  t.after(() => srv.close());
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const units = 'chess_char_6_diy1_a~char_4182_oblvns:10,5:2:RIGHT;chess_char_5_03_a:11,4:2:RIGHT';
  await page.goto(`${srv.url}/dev/sandbox.html?${new URLSearchParams({ map: 'act2autochess_m01', enemies: 'hard-normal-r1', units })}`);
  await page.waitForFunction(() => window.__sandbox?.ready || window.__sandbox?.error, { timeout: 60000 });
  await page.evaluate(() => localStorage.removeItem('sp.pref.rangePreview'));
  const tiles = () => page.evaluate(() => window.__sandbox.cardRange?.grid?.length ?? 0);
  const press = (i) => page.evaluate((i) => document.querySelectorAll('.drange__btn')[i].click(), i);
  const both = async () => {
    const before = await tiles();
    await press(1);
    await page.waitForFunction((n) => (window.__sandbox.cardRange?.grid?.length ?? 0) !== n, { timeout: 5000 }, before);
    const during = await tiles();
    await press(0);
    await page.waitForFunction((n) => (window.__sandbox.cardRange?.grid?.length ?? 0) === n, { timeout: 5000 }, before);
    return [before, during];
  };
  const [saki, blaze] = await page.evaluate(() => window.__sandbox.boardUids());
  await page.evaluate((uid) => window.__sandbox.click({ uid }), saki);
  const [s0, s1] = await both();
  assert.ok(s0 > 0 && s1 > s0, `Sakiko S3 in prep: ${s0} → ${s1}`);
  await page.evaluate((uid) => window.__sandbox.click({ uid }), blaze);
  assert.deepEqual(await both(), [10, 13], '烛煌 S3: 3-1 → 4-11');
  // in battle: the sim's own skill range
  await page.evaluate(() => window.__sandbox.fight());
  await page.waitForFunction(() => { const r = window.__sandbox.runner; try { return !!r?._entries.get(r.state().battleId)?.battle; } catch { return false; } }, { timeout: 30000 });
  await page.evaluate(() => window.__sandbox.pause(true));
  const op = await page.evaluate((uid) => {
    const r = window.__sandbox.runner;
    const u = [...r._entries.get(r.state().battleId).battle.units].find((x) => x.side === 'ally' && x.uid === uid);
    return { id: u.id, uid: u.uid, defId: u.defId, x: u.x, y: u.y };
  }, saki);
  await page.evaluate((u) => window.__sandbox.click({ unitId: u.id, uid: u.uid, unit: { ...u, side: 'ally', kind: 'op', area: 'board' } }), op);
  await page.waitForFunction(() => (window.__sandbox.cardRange?.grid?.length ?? 0) > 0, { timeout: 5000 });
  assert.deepEqual(await both(), [s0, s1], 'the battle unit: the same ranges');
  assert.deepEqual(errors, []);
});
