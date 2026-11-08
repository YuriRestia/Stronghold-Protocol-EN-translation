// The existing stronghold.loadout export carries every operator's potential/cultivation, including DIY-only ones.
// Real server + headless Chrome, normal UI input only; no storage/store/network mutation. No art is required.
// SP_E2E=1 node --test test/ui/loadout-ops-export.e2e.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client, hasChrome, startRealServer } from '../e2e/client.mjs';

const KALTS = 'char_003_kalts';
const INSIDE = 'chess_char_1_01_a';
const SLOT = 'chess_char_6_diy1_a';
// (fork) the card view (the only view since 2026-11-08): the slot is a card in the deck that opens its picker page; 潜能 /
// 练度 are set in the drawer's detail (the list rows' and slot cards' selects went with the list). 导出 / 导入 / 重置 are the
// top bar's own buttons (2026-11-09): one export with a tick per part (one part ticked = that page's own format, so the
// 自选编队 file is the export with only 自选编队 ticked) and one import that reads any of them
const slot = `.lo-op--diy[data-slot="${SLOT}"]`;
const picker = '[data-testid="diy-picker"]';
const io = '[data-testid="loadout-io-text"]';

describe('loadout export includes DIY-only cultivation (real server, headless Chrome)', {
  skip: !(process.env.SP_E2E === '1' && hasChrome()) && 'set SP_E2E=1 (and have Chrome)',
}, () => {
  let srv, P;
  before(async () => { srv = await startRealServer(); P = (await import('puppeteer-core')).default; });
  after(async () => { await srv?.stop(); });

  async function open(label) {
    const c = new Client(P, srv.base, label, { prefix: 'loadout-ops-export', w: 1280, h: 800 });
    try {
      await c.open();
      await c.enter('调配回归');
      await c.click('.lobby-screen [data-testid="loadout-open"]');
      await c.page.waitForSelector('.lo-op[data-chess]');
      return c;
    } catch (e) { await c.close(); throw e; }
  }
  const disabled = (c, id) => c.page.$eval(`[data-testid="${id}"]`, e => e.disabled);
  // the parts the export dialog ticks when it opens (the ones with something to export), the dialog closed again
  const defaultParts = async (c) => {
    await c.click('[data-testid="loadout-export"]');
    await c.page.waitForSelector(io);
    const parts = await c.page.$$eval('.lo-io__part input:checked', (els) => els.map((e) => e.closest('[data-part]').dataset.part));
    await c.page.keyboard.press('Escape');
    await c.page.waitForSelector(io, { hidden: true });
    return parts;
  };
  const openSlot = async (c) => {
    // (a DOM click: puppeteer's would scroll the deck first; a filled slot's card selects, its change button opens the picker)
    await c.page.$eval(slot, (e) => (e.querySelector('[data-testid="diy-slot-change"]') || e).click());
    await c.page.waitForSelector(picker);
  };
  const closePicker = async (c) => {
    await c.click('.lo-top .lo-back'); // (fork) no 取消: the top bar's back leaves the picker
    await c.page.waitForSelector(picker, { hidden: true });
  };
  const saved = (c) => c.page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('sp.pref.loadout') || '{}');
    return { byChar: p.byChar || {}, ops: p.ops || {} }; // (sp.pref.loadout v2: by operator, DESIGN §35.23)
  });
  async function chooseKalts(c) {
    await openSlot(c);
    await c.click('[data-testid="diy-filter"]');
    await c.click('.lo-pop--filter .lo-search input');
    await c.page.keyboard.type('凯尔希');
    await c.page.waitForSelector(`${picker} .diy-opt[data-char="${KALTS}"]`);
    await c.page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); // folds 筛选
    await c.click(`${picker} .diy-opt[data-char="${KALTS}"] .diy-opt__pick`);
    await c.click('[data-testid="diy-confirm"]');
    await c.page.waitForSelector(picker, { hidden: true });
  }
  // the slot's operator: its detail opens in the picker's drawer (a filled slot), where 潜能 / 练度 apply at once
  async function setKalts(c, patch) {
    await openSlot(c);
    await c.page.waitForSelector('[data-testid="diy-drawer"] .lo-sec--cult', { visible: true });
    const press = async (key, v) => {
      const sel = `[data-testid="diy-drawer"] [data-${key}="${v}"]`;
      await c.page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' }));
      await c.click(sel);
      await c.page.waitForFunction((s) => document.querySelector(s)?.getAttribute('aria-checked') === 'true', { timeout: 3000 }, sel);
    };
    if (patch.potential != null) await press('potential', patch.potential);
    if (patch.cultivate != null) await press('cultivate', patch.cultivate);
    await closePicker(c);
  }
  async function changeNormal(c) {
    const card = `.lo-op[data-chess="${INSIDE}"]`;
    await c.click(`${card} .lo-op__skills .lo-q--skill[data-skill="0"]`);
    await c.click(`${card} .lo-op__pick`);
    await c.page.waitForSelector('[data-testid="loadout-drawer"] .lo-sec--cult', { visible: true });
    await c.click('[data-testid="loadout-drawer"] [data-potential="2"]');
    await c.click('.lo-drawer__close');
    await c.page.waitForSelector('[data-testid="loadout-drawer"]', { hidden: true });
  }
  // the export with exactly `parts` ticked (one part: that page's own format)
  async function exportText(c, parts = ['loadout']) {
    assert.equal(await disabled(c, 'loadout-export'), false, '导出 must allow the saved settings to be exported');
    await c.click('[data-testid="loadout-export"]');
    await c.page.waitForSelector(io);
    for (const p of ['loadout', 'ownership', 'diy', 'outfits']) {
      const box = `[data-testid="loadout-io-part-${p}"]`;
      if (await c.page.$eval(box, (e) => e.checked) !== parts.includes(p)) await c.click(box);
    }
    await c.page.waitForFunction((s, n) => { const v = document.querySelector(s)?.value; try { return !!v && (n > 1) === (JSON.parse(v).kind === 'stronghold.all'); } catch { return false; } },
      { timeout: 3000 }, io, parts.length);
    const text = await c.page.$eval(io, e => e.value);
    await c.page.keyboard.press('Escape');
    await c.page.waitForSelector(io, { hidden: true });
    return text;
  }
  async function importText(c, text) {
    await c.click('[data-testid="loadout-import"]');
    await c.page.waitForSelector(io);
    await c.click(io);
    await c.page.keyboard.type(text);
    await c.click('[data-testid="loadout-io-apply"]');
    await c.page.waitForSelector(io, { hidden: true });
  }

  for (const [name, normal, patch] of [
    ['DIY potential only', false, { potential: 1 }],
    ['DIY cultivation only', false, { cultivate: 0 }],
    ['DIY potential and cultivation', false, { potential: 1, cultivate: 0 }],
    ['normal only', true, null],
    ['normal and DIY', true, { potential: 1, cultivate: 0 }],
  ]) {
    test(`${name}: export then import in a fresh browser preserves entries and ops`, { timeout: 90000 }, async () => {
      let c, target, diyText;
      try {
        c = await open(name);
        if (patch) {
          await chooseKalts(c);
          await setKalts(c, patch);
          await c.shot(`${name.replaceAll(' ', '-')}-settings`);
          diyText = await exportText(c, ['diy']);
          const diy = JSON.parse(diyText);
          assert.equal(diy.kind, 'stronghold.diy');
          assert.equal('ops' in diy, false, 'the DIY roster format stays unchanged');
          assert.equal(diy.picks[SLOT].charId, KALTS);
        }
        if (normal) await changeNormal(c);
        const expected = await saved(c);
        if (patch) assert.deepEqual(expected.ops[KALTS], patch);
        if (!normal) {
          assert.deepEqual(expected.byChar, {});
          assert.match(await c.page.$eval('.lo-top__right', e => e.textContent), /已调整\s*0/);
          assert.equal(await disabled(c, 'loadout-reset'), true, 'normal reset still covers only its roster');
        }
        console.log(JSON.stringify({ scenario: name, saved: expected, exportDisabled: await disabled(c, 'loadout-export') }));
        await c.shot(`${name.replaceAll(' ', '-')}-before-export`);
        const text = await exportText(c);
        const payload = JSON.parse(text);
        assert.equal(payload.kind, 'stronghold.loadout');
        assert.equal(payload.v, 2);
        assert.equal(payload.count, normal ? 1 : 0, 'count retains its existing entry semantics');
        assert.deepEqual({ byChar: payload.byChar, ops: payload.ops }, expected);
        await c.shot(`${name.replaceAll(' ', '-')}-exported`);
        target = await open(`${name} import`);
        if (diyText) {
          await importText(target, diyText);
        }
        await importText(target, text);
        assert.deepEqual(await saved(target), expected, 'a fresh browser keeps the complete exported loadout');
        await target.page.reload({ waitUntil: 'domcontentloaded' });
        await target.page.waitForSelector('.lobby-screen');
        assert.deepEqual(await saved(target), expected, 'the imported loadout persists across reload');
        if (patch) {
          assert.deepEqual(await target.page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.diy')).picks), JSON.parse(diyText).picks);
          await target.click('.lobby-screen [data-testid="loadout-open"]');
          await target.page.waitForSelector(slot);
          await openSlot(target);
          await target.page.waitForSelector('[data-testid="diy-drawer"] .lo-sec--cult', { visible: true });
          assert.deepEqual(await target.page.$eval('[data-testid="diy-drawer"] .lo-sec--cult', (e) => ({
            potential: Number(e.querySelector('[data-potential][aria-checked="true"]')?.dataset.potential),
            cultivate: Number(e.querySelector('[data-cultivate][aria-checked="true"]')?.dataset.cultivate) })),
          { potential: patch.potential ?? 6, cultivate: patch.cultivate ?? 3 }, 'the restored pick displays its restored settings');
          await target.shot(`${name.replaceAll(' ', '-')}-imported`);
        }
        assert.deepEqual([...c.problems, ...target.problems].filter(p => p.startsWith('pageerror:')), []);
        console.log(JSON.stringify({ scenario: name, payload, imported: await saved(target), resourceProblems: c.problems.length + target.problems.length }));
      } finally { await target?.close(); await c?.close(); }
    });
  }

  test('defaults, clearing a pick and normal reset preserve the existing scopes', { timeout: 90000 }, async () => {
    let c;
    try {
      c = await open('reset');
      assert.equal(await disabled(c, 'loadout-export'), true, 'nothing to export');
      await chooseKalts(c);
      // (fork) one export for every page: the 自选编队 pick is exportable, but not as 调配 settings
      assert.deepEqual(await defaultParts(c), ['diy'], 'a roster choice alone is not loadout settings');
      await setKalts(c, { potential: 1, cultivate: 0 });
      await changeNormal(c);
      await c.click('[data-testid="loadout-reset"]');
      await c.click('.modal button', '恢复默认');
      await c.page.waitForSelector('.modal', { hidden: true });
      assert.deepEqual(await saved(c), { byChar: {}, ops: { [KALTS]: { potential: 1, cultivate: 0 } } });
      assert.ok((await defaultParts(c)).includes('loadout'), 'normal reset retains exportable DIY settings');
      await openSlot(c);
      await c.click('[data-testid="diy-pick-clear"]');
      await c.page.waitForSelector(picker, { hidden: true });
      assert.deepEqual(await defaultParts(c), ['loadout'], 'clearing a pick retains its per-operator settings');
      await chooseKalts(c);
      await setKalts(c, { potential: 6, cultivate: 3 });
      assert.deepEqual(await saved(c), { byChar: {}, ops: {} });
      assert.deepEqual(await defaultParts(c), ['diy'], 'back to defaults: no loadout settings left to export (the pick stays)');
      assert.deepEqual(c.problems.filter(p => p.startsWith('pageerror:')), []);
    } finally { await c?.close(); }
  });
});
