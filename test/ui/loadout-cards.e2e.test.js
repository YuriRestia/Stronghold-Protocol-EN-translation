// Browser E2E of the 干员调配 overlay's 卡片视图 against the real server, headless Chrome (puppeteer-core + system Chrome,
// the real GPU through gpuArgs(), muted). Opt-in: SP_E2E=1 node --test test/ui/loadout-cards.e2e.test.js
//
// Desktop 1920×1080: the overlay opens in the cards (the only view since the fork's 2026-11-08 change) → tier groups of
// cards behind the official tier tags (or the CSS marker) with the 甄选干员 cards closing tiers 5 / 6, every card's own
// skill / module column inside it → a card opens the detail in the drawer, the same card again closes it → the column:
// S1 and the module list (不装备, then the module again) on 隐现's card are stored, opening nothing and leaving the
// selection → 「简洁 / 详情」 unfolds the panels already drawn (no element added), the selected card — or, off screen, the
// card nearest the view's centre — holding still, both ways (kept in this browser) → Esc peels back the
// drawer, then the overlay → a tier jump scrolls the deck → 甄选干员 and back; 干员持有 with the drawer open, one Esc closes
// the overlay → a locked loadout said once, in the bottom bar (not in the top bar, its sync chip, the drawer or 「详情」) →
// 筛选 narrows the deck, no list view to switch to, no guide sheet. Phone 844×390 (touch): the cards in one row, their buttons
// inside them and tappable, every module as its own button, a tap on the column opens nothing, the drawer over them, 「详情」, a locked loadout said in the
// bottom bar, 简洁 / 详情 on screen. (The list view and its own opening were removed with the list, 2026-11-08.)
// Every page must finish with zero console errors / page errors / failed requests. Screenshots: test/e2e/out/loadout-cards-*.png

import { seedReleaseRead } from '../helpers/releaseNotes.js';
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSIONS } from '../../shared/versions.js';
import { textProblems } from '../e2e/text-fit.mjs';
import { gpuArgs } from '../../tools/perfbench.mjs';
import { matrix, groupBy, LONGEST_LANG } from '../helpers/matrix.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'test/e2e/out');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ENABLED = process.env.SP_E2E === '1' && existsSync(CHROME);
const INSIDE = 'chess_char_1_01_a';

describe('干员调配 卡片视图 (real server, headless Chrome)', { skip: !ENABLED && 'set SP_E2E=1 (and have Chrome) to run' }, () => {
  let srv;
  let browser;
  let base;

  before(async () => {
    const { startServer } = await import('../../server/index.js');
    const puppeteer = (await import('puppeteer-core')).default;
    srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true, versions: { enabled: 'all' } });
    base = `http://127.0.0.1:${srv.port}`;
    browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--mute-audio', ...gpuArgs()] });
    mkdirSync(OUT, { recursive: true });
  });
  after(async () => { await browser?.close(); await srv?.close(); });

  async function open({ w = 1920, h = 1080, touch = false } = {}) {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => { if (!/fonts\.(googleapis|gstatic)/.test(r.url())) problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`); });
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('sp.name', '卡片测试');
      sessionStorage.setItem('sp.entered', '1');
      // (fork) the checks read Chinese msgids; a test that switches languages stores its own choice
      try { if (localStorage.getItem('sp.pref.lang') == null) localStorage.setItem('sp.pref.lang', JSON.stringify('zh')); } catch { /* opaque origin */ }
    });
    await seedReleaseRead(page);
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => globalThis.__SP__?.store.get().connection.status === 'online' && !!document.querySelector('.lobby-screen'), { timeout: 30000 });
    return { ctx, page, problems };
  }
  const clickSel = async (page, sel) => {
    await page.waitForSelector(sel, { visible: true, timeout: 10000 });
    await page.click(sel);
  };
  const openOverlay = async (page) => {
    await clickSel(page, '.lobby-screen [data-testid="loadout-open"]');
    await page.waitForSelector('.lo .lo-op', { visible: true, timeout: 15000 });
  };
  const escape = async (page) => { await page.keyboard.press('Escape'); await new Promise((r) => setTimeout(r, 120)); };
  // (fork) a card off screen is skipped (content-visibility: auto) and its boxes read as zero; a check of every card's
  // geometry lays them all out meanwhile (the same layout each gets once it scrolls into view)
  const layoutAll = (page, on) => page.evaluate((on) => {
    document.getElementById('lo-test-cv')?.remove();
    if (!on) return;
    const st = document.createElement('style');
    st.id = 'lo-test-cv';
    st.textContent = '.lo-op.has-side { content-visibility: visible; }';
    document.head.append(st);
  }, on);

  // 界面大小 is enabled only at 小; also test a stored 75 % with each larger text size.
  const LOOKS = ['sm', 'md', 'lg', 'xl'].flatMap((ts) => (ts === 'sm' ? [75, 80, 85, 90, 95, 100] : [75, 100]).map((ui) => ({ ts, ui, label: `${ts} ${ui}%` })));
  for (const touch of [false, true]) for (const version of VERSIONS) {
    test(`#811: ${version.label} ${touch ? 'phones' : 'desktop'} — promotion icons, five languages, text sizes and UI scales`, { timeout: 300000 }, async () => { // (fork) 300 s: the deck holds 112 「详情」 panels
      let checked = 0;
      // (fork) language × (文字大小, 界面大小) × window: a pairwise sample plus the smallest window at 特大 100 % in every
      // language and the longest language at 特大 100 % in every window (test/helpers/matrix.js; SP_FULL_MATRIX=1: all 180)
      const screens = touch ? [[640, 360], [844, 390], [390, 844]] : [[1920, 1080], [1600, 900], [960, 540]];
      const combos = matrix(`loadout-cards #811 ${version.id} ${touch ? 'phones' : 'desktop'}`, { lang: ['zh', 'en', 'ja', 'ko', 'zh-TW'], look: LOOKS, screen: screens },
        { corners: [{ look: 'xl 100%', screen: touch ? screens[0] : screens[2] }, { lang: LONGEST_LANG, look: 'xl 100%' }] });
      const { ctx, page, problems } = await open(touch ? { w: 844, h: 390, touch } : {});
      try {
        if (await page.$eval('[data-testid="version-switch"]', (e) => e.dataset.version) !== version.id) {
          await clickSel(page, '[data-testid="version-switch"]');
          await page.waitForFunction(() => !document.getAnimations().some((a) => /^tr-/.test(String(a.animationName)) && a.playState === 'running'));
          await clickSel(page, `.verpick__pick[data-version="${version.id}"]`);
        }
        await page.waitForFunction((id) => (globalThis.__SP__.data.get('config')?.version?.id ?? 'act2autochess') === id
          && !document.querySelector('[data-testid="version-picker"]'), { timeout: 30000 }, version.id);
        await openOverlay(page);
        await page.waitForSelector('.lo-op__phase', { visible: true });
        await page.waitForFunction(() => !document.querySelector('.lo').getAnimations({ subtree: true })
          .some((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity));
        await layoutAll(page, true);
        const glyphs = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('.lo-op[data-chess]')) {
            const c = globalThis.__SP__.data.lookup('chess', el.dataset.chess);
            const forms = [c, globalThis.__SP__.data.lookup('chess', c.goldenId)].filter(Boolean);
            const rows = [...el.querySelectorAll('.lo-op__lvrow')];
            forms.forEach((rec, i) => {
              const row = rows[i], icon = row?.querySelector('.lo-op__phase');
              if (!icon || !(icon.getAttribute('src')?.endsWith(`/elite_${rec.status.phase}.png`) || icon.textContent === `E${rec.status.phase}`)
                || row.querySelector('b')?.textContent !== String(rec.status.level)) out.push(rec.chessId);
            });
          }
          return out;
        });
        assert.deepEqual(glyphs, [], `${version.id}: the glyph and level match every normal / elite record`);
        for (const { lang, rows: langRows } of groupBy(combos, 'lang')) {
          await page.evaluate(async (l) => (await import('/js/ui/lang.js')).switchLang(l), lang);
          for (const { look: { ts, ui }, rows } of groupBy(langRows, 'look')) {
            await page.evaluate(async (ts, ui) => {
              (await import('/js/ui/settings.js')).updateSettings({ textSize: ts });
              (await import('/js/ui/screenFit.js')).updateFit({ ui });
            }, ts, ui);
            for (const { screen: [w, h] } of rows) {
              await page.setViewport({ width: w, height: h, isMobile: touch, hasTouch: touch, deviceScaleFactor: 1 });
              await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
              const label = `${version.id} ${lang} ${ts} ${ui}% ${w}×${h}`;
              const geometry = await page.evaluate(() => {
                const out = [];
                for (const card of document.querySelectorAll('.lo-op[data-chess]')) {
                  const rail = card.querySelector('.lo-op__rail'), tier = rail.querySelector('.lo-op__tier');
                  const badge = tier.getBoundingClientRect(), img = tier.querySelector('img')?.getBoundingClientRect();
                  const lv = rail.querySelector('.lo-op__lv').getBoundingClientRect(), cr = card.getBoundingClientRect();
                  const rows = [...rail.querySelectorAll('.lo-op__lvrow')].map((e) => e.getBoundingClientRect());
                  if (Math.max(badge.bottom, img?.bottom ?? 0) > lv.top - 1) out.push(`${card.dataset.chess}: badge overlaps levels`);
                  if (rows.some((r) => r.left < lv.left - 1 || r.right > lv.right + 1 || r.top < lv.top || r.bottom > lv.bottom)
                    || rows.some((r, i) => i && rows[i - 1].bottom > r.top)) out.push(`${card.dataset.chess}: level rows overlap / escape`);
                  if (lv.bottom > cr.bottom + 1) out.push(`${card.dataset.chess}: levels escape card`);
                }
                return out;
              });
              assert.deepEqual(geometry, [], label);
              // The first card in each row of every tier covers all phase / level labels; geometry above checks every card.
              assert.deepEqual(await page.evaluate(textProblems, '.lo-tgrid > .lo-op:nth-child(-n+2) .lo-op__rail'), [], label);
              checked++;
            }
          }
        }
        assert.deepEqual(problems, []);
      } finally { await ctx.close(); }
      assert.equal(checked, combos.length);
    });
  }

  test('desktop: the cards (the only view) → drawer, the card\'s own skill / module column, 简洁 / 详情, Esc layers, tier jump, 筛选', async () => {
    const { ctx, page, problems } = await open();
    try {
      await openOverlay(page);
      await page.waitForSelector('[data-testid="loadout-deck"] .lo-op[data-chess]', { visible: true });
      assert.equal(await page.$('.lo-list, .lo-card'), null, 'the cards are the only view (fork, 2026-11-08)');
      const deck = await page.evaluate(() => ({
        cards: document.querySelectorAll('.lo-op[data-chess]').length,
        groups: [...document.querySelectorAll('.lo-tgroup')].map((g) => Number(g.dataset.tier)),
        diy: [...document.querySelectorAll('.lo-op--diy')].map((d) => Number(d.dataset.diyTier)),
        rows: new Set([...document.querySelectorAll('.lo-tgroup[data-tier="1"] .lo-op')].map((c) => Math.round(c.getBoundingClientRect().top))).size,
        scrolls: (() => { const d = document.querySelector('.lo-deck'); return d.scrollWidth > d.clientWidth; })(),
        bar: document.querySelectorAll('.lo-bbar__tier').length,
        stored: localStorage.getItem('sp.pref.loadout.details'),
        sides: document.querySelectorAll('.lo-op[data-chess] .lo-op__side').length,
        modsShown: [...document.querySelectorAll('.lo-op[data-chess] .lo-op__mods')].map((m) => [m.querySelector('.lo-op__mlist'), m.querySelector('.lo-op__mstep:not(.is-always)')]
          .filter(Boolean).map((e) => getComputedStyle(e).display).join('/')).filter((v, i, a) => a.indexOf(v) === i),
        switch: [...document.querySelectorAll('.lo-bbar .lo-dswitch button')].map((b) => [b.dataset.testid, b.getAttribute('aria-checked')]),
        quick: !!document.querySelector('[data-testid="loadout-quick"]'),
        layers: [...document.querySelector('.lo').children].filter((c) => !c.classList.contains('lo__bg')).map((c) => getComputedStyle(c).position),
        marks: [...document.querySelectorAll('.lo-tmark')].map((mk) => (mk.querySelector('img.lo-tmark__art') ? 'art' : mk.querySelector('.lo-tmark__css') ? 'css' : '?')),
        slogan: getComputedStyle(document.querySelector('.lo-tmark'), '::after').content,
        tagInManifest: !!globalThis.__SP__.data.get('assets')?.ui?.['shopLevelSprite/shop_level_tag_1'],
      }));
      assert.equal(deck.cards, 112, 'every visible chess as a card');
      assert.equal(deck.sides, 112, 'every card has its skill / module column');
      assert.deepEqual(deck.modsShown, ['flex/none'], 'a tall screen lists every module, the stepping button hidden');
      assert.deepEqual(deck.switch, [['loadout-compact', 'true'], ['loadout-details', 'false'], ['loadout-outfitview', 'false']], '简洁 / 展开 / 时装 in the bottom bar, 简洁 on');
      assert.equal(deck.quick, false, '快速配置 is gone');
      assert.deepEqual(deck.groups, [1, 2, 3, 4, 5, 6]);
      assert.deepEqual(deck.diy, [5, 5, 6, 6], 'one card per 自选编队 slot closes tiers 5 and 6');
      assert.equal(deck.rows, 2, 'a tier group flows in two rows');
      assert.ok(deck.scrolls, 'the deck scrolls sideways');
      assert.equal(deck.bar, 6);
      assert.equal(deck.stored, null, '「详情」\'s default is not stored: a later default change still reaches this browser');
      assert.ok(deck.layers.every((p) => p === 'relative'), `every layer stacks above the background ${deck.layers}`);
      assert.equal(deck.marks.length, 6);
      assert.ok(deck.marks.every((k) => k === 'art' || k === 'css'), `a tier tag or the CSS marker before every group ${deck.marks}`);
      assert.ok(deck.slogan === 'none' || deck.slogan === 'normal', `no invented slogan on the marker (${deck.slogan})`);
      if (deck.tagInManifest) {
        // the official shopLevelSprite tag, drawn at its own proportions (150 × 595)
        await page.waitForFunction(() => document.querySelector('.lo-tgroup[data-tier="1"] img.lo-tmark__art')?.complete, { timeout: 10000 });
        const tag = await page.$eval('.lo-tgroup[data-tier="1"] img.lo-tmark__art', (img) => ({ w: img.naturalWidth, h: img.naturalHeight, src: img.getAttribute('src') }));
        assert.ok(/shop_level_tag_1\.png$/.test(tag.src), tag.src);
        assert.deepEqual([tag.w, tag.h], [150, 595]);
      }
      await page.waitForFunction(() => !document.querySelector('.lo')?.getAnimations({ subtree: true })
        .some((a) => /^lo-tr-/.test(String(a.animationName)) && a.playState === 'running'));
      // the column stays inside its card: no button past the card's edge, the column itself within the card (the portrait
      // is the whole card's background since the card view of 2026-11-09, so the column sits over its shaded side)
      await layoutAll(page, true);
      const col = await page.evaluate(() => [...document.querySelectorAll('.lo-op[data-chess]')].map((op) => {
        const card = op.querySelector('.lo-op__card').getBoundingClientRect();
        const side = op.querySelector('.lo-op__side').getBoundingClientRect();
        const btns = [...op.querySelectorAll('.lo-op__side .lo-q')].filter((b) => b.getClientRects().length).map((b) => b.getBoundingClientRect());
        return { id: op.dataset.chess, at: [Math.round(card.left), Math.round(card.right), Math.round(card.bottom), Math.round(side.left), Math.round(side.right), ...btns.map((b) => Math.round(b.bottom))].join(' '), out: btns.some((b) => b.bottom > card.bottom + 0.5 || b.right > card.right + 0.5), over: side.left < card.left - 0.5 || side.right > card.right + 0.5, small: Math.min(...btns.map((b) => b.height)) };
      }));
      assert.deepEqual(col.filter((c) => c.out || c.over).map((c) => `${c.id} ${c.at}`), [], 'every column inside its card');
      assert.ok(col.every((c) => c.small >= 30), `desktop buttons ≥ 30 px (${Math.min(...col.map((c) => c.small))})`);
      await layoutAll(page, false);
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-desktop.png') });

      // a card opens the drawer with the list's own detail; the same card again closes it. The drawer is a pure overlay
      // over the deck's left (screens/loadoutDeck.js DeckDrawer, the user's call of 2026-11-09): the deck neither makes
      // room nor scrolls, so the picked card keeps its place — under the drawer, if it lay there
      const where = (id) => page.evaluate((id) => ({ scroll: Math.round(document.querySelector('[data-testid="loadout-deck"]').scrollLeft),
        left: Math.round(document.querySelector(`.lo-op[data-chess="${id}"]`).getBoundingClientRect().left) }), id);
      const before = await where(INSIDE);
      await page.click(`.lo-op[data-chess="${INSIDE}"] .lo-op__pick`);
      await page.waitForSelector('[data-testid="loadout-drawer"] .lo-detail .lo-skill', { visible: true });
      assert.equal(await page.$eval('[data-testid="loadout-drawer"] .lo-dhead__name', (el) => el.textContent.trim()), '隐现');
      await new Promise((r) => setTimeout(r, 300));
      assert.deepEqual(await where(INSIDE), before, 'the drawer opens over the deck: no room made, no scroll');
      assert.equal(await page.evaluate(() => Math.round(document.querySelector('.lo-drawer').getBoundingClientRect().left)
        - Math.round(document.querySelector('[data-testid="loadout-deck"]').getBoundingClientRect().left) <= 1), true, 'the drawer lies over the deck\'s left');
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-drawer.png') });
      // a tier-1 card clear of the drawer (隐现's lies under it) for the same-card toggle below
      const OTHER = await page.evaluate(() => {
        const right = document.querySelector('.lo-drawer').getBoundingClientRect().right;
        return [...document.querySelectorAll('.lo-tgroup[data-tier="1"] .lo-op[data-chess]')].find((el) => el.getBoundingClientRect().left >= right + 1)?.dataset.chess;
      });
      assert.ok(OTHER, 'a tier-1 card beside the drawer');
      await page.click('.lo-drawer__close');
      await page.waitForSelector('[data-testid="loadout-drawer"]', { hidden: true });

      // the card's column: S1 is stored like the list's quick buttons; the modules (every one a button on this tall screen)
      // 不装备, then the module again; none of it opens the drawer or moves the selection (stored by operator: sp.pref.loadout
      // v2, DESIGN §35.23 — 隐现 is char_498_inside)
      await page.click(`.lo-op[data-chess="${OTHER}"] .lo-op__pick`);
      await page.waitForSelector('[data-testid="loadout-drawer"]', { visible: true });
      await page.click(`.lo-op[data-chess="${OTHER}"] .lo-op__pick`);
      await page.waitForSelector('[data-testid="loadout-drawer"]', { hidden: true });
      const sel = () => page.evaluate(async () => (await import('/js/ui/loadoutSync.js')).loadoutStore.get().sel);
      assert.equal(await sel(), OTHER);
      const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('sp.pref.loadout') || '{}').byChar?.char_498_inside || null);
      const side = `.lo-op[data-chess="${INSIDE}"] .lo-op__side`;
      await page.click(`${side} .lo-q--skill[data-skill="0"]`);
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('sp.pref.loadout') || '{}').byChar?.char_498_inside?.skill === 0);
      assert.equal(await page.$eval(`${side} .lo-q--skill[data-skill="0"]`, (b) => b.getAttribute('aria-pressed')), 'true');
      const modOn = (id) => page.waitForFunction((s, i) => document.querySelector(`${s} .lo-op__mlist [data-module="${i}"]`)?.getAttribute('aria-pressed') === 'true', {}, side, id);
      await modOn('uniequip_002_inside');
      await page.click(`${side} .lo-op__mlist [data-module="none"]`);
      await modOn('none');
      assert.equal((await stored()).module, 'none');
      // a press between the skills and the modules (no button there): still not a pick
      const gap = await page.$eval(side, (el) => { const a = el.querySelector('.lo-op__skills').getBoundingClientRect(); const b = el.querySelector('.lo-op__mods').getBoundingClientRect();
        return { x: (a.left + a.right) / 2, y: (a.bottom + b.top) / 2, room: b.top - a.bottom }; });
      assert.ok(gap.room > 8, `the modules sit apart from the skills (${gap.room} px)`);
      await page.mouse.click(gap.x, gap.y);
      await page.click(`${side} .lo-op__mlist [data-module="uniequip_002_inside"]`);
      await modOn('uniequip_002_inside');
      assert.deepEqual(await stored(), { skill: 0 }, 'back at the default module: only the skill stays stored');
      assert.equal(await page.$('[data-testid="loadout-drawer"]'), null, 'the column never opens the drawer');
      assert.equal(await sel(), OTHER, 'nor moves the selection');
      assert.ok(await page.$(`.lo-op[data-chess="${INSIDE}"].is-changed .lo-op__mark`), 'the changed card is marked');

      // 「详情」: the skills' descriptions and every module beside each card, kept in this browser; a module picked there is the
      // same choice
      // (the panels are drawn already, folded away — out of layout —; the selected card — OTHER, in
      // view — holds still while they unfold)
      assert.deepEqual(await page.$$eval('.lo-op[data-chess] .lo-op__more', (els) => [els.length, els.filter((e) => getComputedStyle(e).display !== 'none').length]), [112, 0]);
      const xOf = (id) => page.$eval(`.lo-op[data-chess="${id}"]`, (el) => el.getBoundingClientRect().left);
      const x0 = await xOf(OTHER);
      const nodes0 = await page.evaluate(() => document.querySelectorAll('.lo *').length);
      await clickSel(page, '[data-testid="loadout-details"]');
      const drift = [];
      for (let i = 0; i < 8; i += 1) { await new Promise((r) => setTimeout(r, 40)); drift.push(Math.round((await xOf(OTHER)) - x0)); }
      await page.waitForSelector(`.lo-op[data-chess="${INSIDE}"] .lo-op__more .lo-skill__desc`, { visible: true });
      assert.ok(drift.every((d) => Math.abs(d) <= 2), `the selected card holds still while the panels unfold (${drift})`);
      assert.equal(await page.evaluate(() => document.querySelectorAll('.lo *').length), nodes0, 'the toggle adds no element');
      assert.equal(await page.evaluate(() => localStorage.getItem('sp.pref.loadout.details')), 'true');
      assert.equal(await page.$$eval('.lo-deck.is-details .lo-op[data-chess] .lo-op__more', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').length), 112);
      await page.click(`.lo-op[data-chess="${INSIDE}"] .lo-op__more .lo-mod[data-module="none"]`);
      await modOn('none');
      assert.equal(await page.$('[data-testid="loadout-drawer"]'), null, 'a choice in the panel opens nothing either');
      await page.waitForFunction(() => !document.querySelector('.lo')?.getAnimations({ subtree: true })
        .some((an) => an.playState === 'running' && an.effect?.getTiming().iterations !== Infinity), { timeout: 5000 });
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-details.png') });
      await clickSel(page, '[data-testid="loadout-compact"]');
      await page.waitForFunction(() => !document.querySelector('.lo-deck.is-details'), { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 400));
      assert.ok(Math.abs((await xOf(OTHER)) - x0) <= 2, 'folded again: the selected card is where it was');
      assert.equal(await page.evaluate(() => localStorage.getItem('sp.pref.loadout.details')), 'false');
      // the selected card off screen: the card nearest the view's centre holds still instead
      await page.evaluate(() => { const d = document.querySelector('.lo-deck'); d.scrollLeft = document.querySelector('.lo-tgroup[data-tier="5"]').offsetLeft; });
      await new Promise((r) => setTimeout(r, 300));
      const lead = await page.evaluate(() => {
        const d = document.querySelector('.lo-deck').getBoundingClientRect();
        const cx = (d.left + d.right) / 2, cy = (d.top + d.bottom) / 2;
        let best = null;
        for (const el of document.querySelectorAll('.lo-op[data-chess]')) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.right <= d.left + 1 || r.left >= d.right - 1) continue;
          const dist = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy);
          if (!best || dist < best.dist) best = { id: el.dataset.chess, l: r.left, dist };
        }
        return best;
      });
      assert.ok(await page.$eval(`.lo-op[data-chess="${OTHER}"]`, (el) => el.getBoundingClientRect().right < 0), 'the selected card is off screen');
      await clickSel(page, '[data-testid="loadout-details"]');
      await page.waitForFunction(() => !!document.querySelector('.lo-deck.is-details'));
      await new Promise((r) => setTimeout(r, 500));
      assert.ok(Math.abs((await xOf(lead.id)) - lead.l) <= 2, 'the card nearest the centre held still');
      await clickSel(page, '[data-testid="loadout-compact"]');
      await page.waitForFunction(() => !document.querySelector('.lo-deck.is-details'), { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 500));
      assert.ok(Math.abs((await xOf(lead.id)) - lead.l) <= 2, 'and again as they fold');

      // Esc: the drawer first, then the overlay
      await page.click(`.lo-op[data-chess="${INSIDE}"] .lo-op__pick`);
      await page.waitForSelector('[data-testid="loadout-drawer"]', { visible: true });
      await escape(page);
      assert.equal(await page.$('[data-testid="loadout-drawer"]'), null, 'Esc closes the drawer');
      assert.ok(await page.$('.lo'));
      await escape(page);
      await page.waitForFunction(() => !document.querySelector('.lo'), { timeout: 3000 });

      // reopened in the cards; a tier jump scrolls the deck to that group
      await openOverlay(page);
      assert.ok(await page.$('[data-testid="loadout-deck"]'), 'reopened in the card view');
      await page.click('.lo-bbar__tier[data-tier="6"]');
      await page.waitForFunction(() => {
        const d = document.querySelector('.lo-deck');
        const g = document.querySelector('.lo-tgroup[data-tier="6"]');
        return g.getBoundingClientRect().left < d.getBoundingClientRect().left + d.clientWidth / 2;
      }, { timeout: 5000 });
      await page.waitForFunction(() => document.querySelector('.lo-bbar__tier.is-on')?.dataset.tier === '6', { timeout: 5000 });

      // a 自选编队 slot card opens that slot's picker as a page of its own in place of the deck (no 自选编队 overview, no
      // layer over a live deck); Esc (and the top bar's 干员调配) returns to the deck where it was, without its opening 转场
      // the tier jump glides (scrollTo smooth): read the deck once it has stopped, not mid-glide
      await page.evaluate(() => new Promise((done) => {
        const d = document.querySelector('.lo-deck');
        let last = -1, still = 0;
        const tick = () => { if (d.scrollLeft === last) still++; else { still = 0; last = d.scrollLeft; } if (still >= 6) done(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      }));
      const slotScroll = await page.$eval('.lo-deck', (d) => d.scrollLeft);
      await page.$eval('.lo-op--diy[data-diy-tier="6"]', (e) => (e.querySelector('[data-testid="diy-slot-change"]') || e).click()); // (a DOM click: puppeteer's would scroll it into view first; a filled slot: its change button)
      await page.waitForSelector('[data-testid="diy-picker"] .diy-opt', { visible: true });
      assert.equal(await page.$('[data-testid="loadout-deck"]'), null, 'the deck is not drawn under the picker');
      assert.equal(await page.$eval('.lo-top__title', (el) => el.textContent.trim()), '6阶 自选');
      // no header rows of its own (search, 全部 / 原型 / 持有): the top bar's 筛选 folds out the class chips
      assert.equal(await page.$('[data-testid="diy-picker"] .diy-pick__head'), null, 'no picker header');
      await page.click('[data-testid="diy-filter"]');
      await page.waitForSelector('.lo-pop--filter .lo-chip--prof', { visible: true });
      const allOps = await page.$$eval('[data-testid="diy-picker"] .diy-opt', (els) => els.length);
      await page.click('.lo-pop--filter .lo-chip--prof:nth-child(6)'); // 医疗
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid="diy-picker"] .diy-opt').length < n, { timeout: 5000 }, allOps);
      await page.click('.lo-pop--filter .lo-chip--prof.is-on');
      await page.waitForFunction((n) => document.querySelectorAll('[data-testid="diy-picker"] .diy-opt').length === n, { timeout: 5000 }, allOps);
      await page.click('.lo-top__title'); // a tap outside folds it
      await page.waitForSelector('.lo-pop--filter', { hidden: true, timeout: 3000 });
      await escape(page);
      await page.waitForSelector('[data-testid="diy-picker"]', { hidden: true });
      await page.waitForSelector('[data-testid="loadout-deck"]', { visible: true });
      assert.ok(await page.$('.lo'), 'Esc closed the picker only');
      assert.equal(await page.$eval('.lo-deck', (d) => d.scrollLeft), slotScroll, 'the deck is back where it was');
      assert.equal(await page.evaluate(() => document.querySelector('.lo').getAnimations({ subtree: true }).filter((a) => /^lo-tr-/.test(a.animationName)).length), 0, 'no opening 转场 again');
      // the drawer open → 干员持有 → ONE Esc closes the overlay (no hidden layer swallows it)
      await page.click(`.lo-op[data-chess="${INSIDE}"] .lo-op__pick`);
      await page.waitForSelector('[data-testid="loadout-drawer"]', { visible: true });
      await page.click('[data-testid="loadout-ownership"]');
      await page.waitForFunction(() => document.querySelector('.lo-top__title')?.textContent.trim() === '干员持有', { timeout: 5000 });
      await escape(page);
      await page.waitForFunction(() => !document.querySelector('.lo'), { timeout: 3000 });
      // (the overlay reopens on the last tab, 干员持有; its back button returns to the deck — no drawer left open)
      await clickSel(page, '.lobby-screen [data-testid="loadout-open"]');
      await page.waitForFunction(() => document.querySelector('.lo-top__title')?.textContent.trim() === '干员持有', { timeout: 5000 });
      await page.click('.lo-back');
      await page.waitForSelector('[data-testid="loadout-deck"]', { visible: true });
      assert.equal(await page.$('[data-testid="loadout-drawer"]'), null);

      // a locked loadout (the server's 'locked') is said once on a wide screen — the bottom bar's chip — not again in the
      // top bar's note, its sync chip or the drawer's detail (§35.18's leftover: three times); with 「详情」 on too. The column
      // stays usable: a choice made now is for the next match (as in the list)
      const lockSays = () => page.evaluate(() => [...document.querySelectorAll('.lo *')].filter((el) => {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && /锁定/.test(n.textContent))) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
      }).map((el) => (el.closest('[data-testid="loadout-deck-locked"]') ? 'chip' : el.closest('[class]')?.className || el.tagName)));
      assert.deepEqual(await lockSays(), [], 'not locked: nothing said');
      const unlockedNote = await page.$eval('.lo-top__note', (el) => el.textContent);
      await page.evaluate(async () => { (await import('/js/ui/loadoutSync.js')).loadoutStore.set({ sync: 'locked' }); });
      await page.waitForSelector('[data-testid="loadout-deck-locked"]', { visible: true, timeout: 5000 });
      assert.deepEqual(await lockSays(), ['chip'], 'locked: once, in the bottom bar');
      assert.equal(await page.$('.lo-top__note'), null, 'the top bar drops its note');
      assert.ok(unlockedNote && !/锁定/.test(unlockedNote), unlockedNote);
      assert.ok((await page.$eval('[data-testid="loadout-deck-locked"]', (el) => el.title)).includes('下一局生效'), 'the full notice in the chip\'s title');
      assert.equal(await page.$eval(`${side} .lo-q--skill[data-skill="1"]`, (b) => b.disabled), false, 'the column stays live');
      await page.click(`.lo-op[data-chess="${INSIDE}"] .lo-op__pick`);
      await page.waitForSelector('[data-testid="loadout-drawer"] .lo-detail .lo-skill', { visible: true });
      assert.deepEqual(await lockSays(), ['chip'], 'the drawer adds no second notice');
      await page.waitForFunction(() => !document.querySelector('.lo')?.getAnimations({ subtree: true })
        .some((an) => an.playState === 'running' && an.effect?.getTiming().iterations !== Infinity), { timeout: 5000 });
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-locked.png') });
      await page.click('.lo-drawer__close'); // 隐现's card lies under the drawer (a pure overlay)
      await page.waitForSelector('[data-testid="loadout-drawer"]', { hidden: true });
      await clickSel(page, '[data-testid="loadout-details"]');
      await page.waitForSelector('.lo-deck.is-details .lo-op__more', { visible: true });
      await new Promise((r) => setTimeout(r, 400));
      // (the panels' skill texts are game data: 「锁定」 there is a skill locking onto a target, not this notice)
      assert.deepEqual((await lockSays()).filter((c) => !/(^|\s)(rt|rt-rem|lo-skill__desc|lo-minfo\S*)(\s|$)/.test(c)), ['chip'], '「详情」: still once');
      assert.equal(await page.$$eval('.lo-op__more .lo-locknote, .lo-op__more .lo-note', (els) => els.length), 0, 'no lock notice in the panels');
      await clickSel(page, '[data-testid="loadout-compact"]');
      await page.evaluate(async () => { (await import('/js/ui/loadoutSync.js')).loadoutStore.set({ sync: 'idle' }); });
      await page.waitForSelector('[data-testid="loadout-deck-locked"]', { hidden: true, timeout: 5000 });

      // no guide sheet (the user's call of 2026-11-08); 筛选 narrows the deck
      assert.equal(await page.$('[data-testid="loadout-help"]'), null, 'no 卡片视图说明');
      await clickSel(page, '[data-testid="loadout-filter"]');
      await page.waitForSelector('.lo-pop--filter .lo-search input', { visible: true });
      await page.type('.lo-pop--filter .lo-search input', '隐现');
      await page.waitForFunction(() => document.querySelectorAll('.lo-op[data-chess]').length === 1 && !document.querySelector('.lo-op--diy'), { timeout: 5000 });
      assert.equal(await page.$('[data-testid="loadout-view-list"], [data-testid="loadout-view-deck"]'), null, 'no list view to switch to');
      assert.deepEqual(problems, []);
    } finally { await ctx.close(); }
  });

  test('phone 844×390 (touch): the cards (the default) fit one row with their column, a tap there opens nothing, the drawer slides over them', async () => {
    const { ctx, page, problems } = await open({ w: 844, h: 390, touch: true });
    try {
      await openOverlay(page);
      await page.waitForSelector('[data-testid="loadout-deck"] .lo-op[data-chess]', { visible: true });
      // measured once the 转场 (lo-tr-*: the bottom bar rises into place) is over
      await page.waitForFunction(() => !document.querySelector('.lo')?.getAnimations({ subtree: true })
        .some((a) => /^lo-tr-/.test(String(a.animationName)) && a.playState === 'running'));
      await layoutAll(page, true);
      const fit = await page.evaluate(() => {
        const vh = window.innerHeight;
        const bar = document.querySelector('.lo-bbar').getBoundingClientRect();
        const cards = [...document.querySelectorAll('.lo-tgroup[data-tier="1"] .lo-op')].map((c) => c.getBoundingClientRect());
        const btns = [...document.querySelectorAll('.lo-op[data-chess]')].flatMap((op) => {
          const card = op.querySelector('.lo-op__card').getBoundingClientRect();
          return [...op.querySelectorAll('.lo-op__side .lo-q')].filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return { h: r.height, out: r.bottom > card.bottom + 0.5 }; });
        });
        const top = document.querySelector('.lo-top').getBoundingClientRect();
        const sw = document.querySelector('.lo-bbar .lo-dswitch').getBoundingClientRect();
        return { barBottom: bar.bottom, vh, rows: new Set(cards.map((r) => Math.round(r.top))).size, lowest: Math.max(...cards.map((r) => r.bottom)), barTop: bar.top,
          minBtn: Math.min(...btns.map((b) => b.h)), out: btns.filter((b) => b.out).length, switchIn: sw.right <= top.right + 0.5 && sw.bottom <= vh + 1 && sw.width > 40 };
      });
      assert.ok(fit.barBottom <= fit.vh + 1, `the bottom bar is on screen ${JSON.stringify(fit)}`);
      assert.equal(fit.rows, 1, 'a short phone: one row of cards at the deck height (the user call of 2026-11-09)');
      assert.ok(fit.lowest <= fit.barTop + 1, `the cards end above the bar ${JSON.stringify(fit)}`);
      assert.equal(fit.out, 0, 'every skill / module button inside its card');
      assert.ok(fit.minBtn >= 22, `tappable buttons (${fit.minBtn} px)`);
      assert.ok(fit.switchIn, '简洁 / 展开 on screen in the bottom bar');
      await layoutAll(page, false);
      await page.tap(`.lo-op[data-chess="${INSIDE}"] .lo-op__side .lo-q--skill[data-skill="0"]`);
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('sp.pref.loadout') || '{}').byChar?.char_498_inside?.skill === 0);
      await page.tap(`.lo-op[data-chess="${INSIDE}"] .lo-op__side .lo-op__mlist .lo-q--mod[data-module="none"]`);
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('sp.pref.loadout') || '{}').byChar?.char_498_inside?.module === 'none');
      await new Promise((r) => setTimeout(r, 300));
      assert.equal(await page.$('[data-testid="loadout-drawer"]'), null, 'a tap on the column opens nothing');
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-phone.png') });
      await page.tap(`.lo-op[data-chess="${INSIDE}"] .lo-op__pick`);
      await page.waitForSelector('[data-testid="loadout-drawer"] .lo-detail', { visible: true });
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-phone-drawer.png') });
      await page.tap('.lo-drawer__close');
      await page.waitForSelector('[data-testid="loadout-drawer"]', { hidden: true });
      // 「详情」 at this width: the panels beside the cards, the column kept
      assert.deepEqual(await page.$eval(`.lo-op[data-chess="${INSIDE}"] .lo-op__mods`, (m) => [getComputedStyle(m.querySelector('.lo-op__mlist')).display, getComputedStyle(m.querySelector('.lo-op__mstep')).display]),
        ['flex', 'none'], 'one row on a short phone: every module as its own button, as on a tall screen');
      await page.tap('[data-testid="loadout-details"]');
      await page.waitForSelector(`.lo-deck.is-details .lo-op[data-chess="${INSIDE}"] .lo-op__more`, { visible: true });
      await new Promise((r) => setTimeout(r, 400));
      assert.ok(await page.$(`.lo-op[data-chess="${INSIDE}"] .lo-op__side`));
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-phone-details.png') });
      await page.tap('[data-testid="loadout-compact"]');
      await page.waitForFunction(() => !document.querySelector('.lo-deck.is-details'), { timeout: 5000 });

      // a locked loadout (the server's 'locked'): the top bar's note is hidden at this width, the bottom bar says it
      assert.equal(await page.$('[data-testid="loadout-deck-locked"]'), null);
      await page.evaluate(async () => { (await import('/js/ui/loadoutSync.js')).loadoutStore.set({ sync: 'locked' }); });
      await page.waitForSelector('[data-testid="loadout-deck-locked"]', { visible: true, timeout: 5000 });
      const lock = await page.evaluate(() => {
        const r = document.querySelector('[data-testid="loadout-deck-locked"]').getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, w: r.width, vw: window.innerWidth, vh: window.innerHeight,
          title: document.querySelector('[data-testid="loadout-deck-locked"]').title };
      });
      assert.ok(lock.w > 40 && lock.right <= lock.vw + 1 && lock.top < lock.vh, `the chip is on screen ${JSON.stringify(lock)}`);
      assert.ok(lock.title.includes('下一局生效'), lock.title);
      await page.screenshot({ path: path.join(OUT, 'loadout-cards-phone-locked.png') });
      assert.deepEqual(problems, []);
    } finally { await ctx.close(); }
  });
});
