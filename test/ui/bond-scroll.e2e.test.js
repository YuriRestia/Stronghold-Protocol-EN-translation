import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHROME, hasChrome } from '../e2e/client.mjs';
// (fork) No scroller since 2026-11-10: the strip shows as many bonds as fit its width and a 「+N」 button drops the rest in
// a compact grid (ui/bondStrip.js FitStrip). Every bond stays reachable, the strip never overflows, the grid closes on
// the button, Esc, an outside press or a bond opened from it.
test('all bonds remain reachable: the strip shows what fits, +N opens the rest in a grid', { skip: process.env.SP_E2E !== '1' || !hasChrome(), timeout: 90000 }, async () => {
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--mute-audio', '--no-sandbox', '--no-proxy-server'] });
  try {
    for (const [width, height, touch] of [[1920, 1080, false], [844, 390, true]]) {
      const page = await browser.newPage();
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.evaluateOnNewDocument(() => {
        globalThis.__bondResizeErrors = [];
        // Native observer delivery errors reach window.error, rather than Puppeteer's pageerror event.
        addEventListener('error', e => { if (e.message.includes('ResizeObserver')) globalThis.__bondResizeErrors.push(e.message); });
      });
      await page.setViewport({ width, height, isMobile: touch, hasTouch: touch });
      await page.goto(srv.url + '/dev/game-mock.html?shot=1&render=fallback&phase=PREP');
      await page.waitForSelector('.bstrip .bond');
      const ids = await page.evaluate(async () => {
        const { data } = await import('/js/data.js');
        const mock = globalThis.__MOCK__, state = mock.store.get();
        const bonds = data.list('bonds').map((b, i) => ({ bondId: b.bondId, count: 1, tier: 0, active: false, layers: i }));
        mock.store.set({ match: { ...state.match, private: { ...state.match.private, bonds } } });
        return bonds.map(b => b.bondId);
      });
      await page.waitForSelector('.bstrip__more');
      const layout = () => page.evaluate(() => {
        const strip = document.querySelector('.bstrip'), list = document.querySelector('.gm__bond-list');
        const more = document.querySelector('.bstrip__more');
        const right = Math.max(...[...strip.querySelectorAll('.bslot'), more].filter(Boolean).map(e => e.getBoundingClientRect().right));
        return { shown: [...strip.querySelectorAll('.bslot')].map(e => e.getAttribute('data-bond')), more: more?.textContent.trim() ?? null,
          count: Number(more?.getAttribute('data-count') || 0), expanded: more?.getAttribute('aria-expanded') ?? null,
          right, listRight: list.getBoundingClientRect().right,
          scrollers: [document.querySelector('.gm__bonds'), ...document.querySelectorAll('.gm__bonds *')].filter(e => /auto|scroll/.test(getComputedStyle(e).overflowX)).length,
          grid: [...document.querySelectorAll('.bstrip-grid .bslot')].map(e => e.getAttribute('data-bond')) };
      });
      let l = await layout();
      assert.ok(l.shown.length > 0 && l.count > 0, 'more bonds than fit: some shown, the rest behind +N');
      assert.equal(l.shown.length + l.count, ids.length);
      assert.equal(l.more, `+${l.count}`);
      assert.ok(l.right <= l.listRight + 1, `the strip and its button stay inside the list (${l.right} > ${l.listRight})`);
      assert.equal(l.scrollers, 0, 'nothing in the bond strip scrolls, so no scrollbar');
      assert.equal(l.expanded, 'false');
      await page.click('.bstrip__more');
      await page.waitForSelector('.bstrip-grid .bslot');
      l = await layout();
      assert.equal(l.expanded, 'true');
      assert.deepEqual([...l.shown, ...l.grid].sort(), [...ids].sort(), 'every bond is in the strip or the grid, once');
      // the button closes it
      await page.click('.bstrip__more');
      await page.waitForFunction(() => !document.querySelector('.bstrip-grid'));
      // Esc closes it and gives the button the focus back
      await page.click('.bstrip__more'); await page.waitForSelector('.bstrip-grid');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.bstrip-grid') && document.activeElement?.classList.contains('bstrip__more'));
      // an outside press closes it
      await page.click('.bstrip__more'); await page.waitForSelector('.bstrip-grid');
      await page.evaluate(() => document.querySelector('.gm__field, .screen')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
      await page.waitForFunction(() => !document.querySelector('.bstrip-grid'));
      // a bond in the grid opens its popup like a strip bond; the grid closes and the button wears the open ring
      await page.click('.bstrip__more'); await page.waitForSelector('.bstrip-grid');
      await page.click('.bstrip-grid .bslot:last-child .bond'); await page.waitForSelector('.bpop');
      assert.equal(await page.$('.bstrip-grid'), null);
      assert.equal(await page.$eval('.bstrip__more', el => el.classList.contains('is-open')), true);
      await page.click('.bpop__close');
      await page.click('.bonds-toggle');
      assert.equal(await page.$eval('.gm__bond-list', el => el.hidden), true);
      const frozen = await page.evaluate(async () => {
        const { data } = await import('/js/data.js');
        const { render } = await import('/vendor/preact.module.js');
        const { html } = await import('/js/ui/components.js');
        const { BondStrip } = await import('/js/ui/bondStrip.js');
        const host = document.createElement('div'); host.id = 'frozen-bonds';
        host.className = 'gm__bonds'; host.style.width = '300px'; document.body.appendChild(host);
        const bonds = data.list('bonds').map(b => ({ bondId: b.bondId, count: 1, tier: 0, layers: 0 }));
        const NativeObserver = globalThis.ResizeObserver;
        let created = 0, disconnected = 0;
        globalThis.ResizeObserver = class extends NativeObserver {
          constructor(callback) { super(callback); created++; }
          disconnect() { disconnected++; super.disconnect(); }
        };
        try {
          const draw = async entries => {
            render(html`<div class="gm__bond-list"><${BondStrip} bonds=${entries} layersDisabled=${true} onOpen=${() => {}} /></div>`, host);
            await new Promise(r => setTimeout(r, 100));
          };
          await draw(bonds);
          const initial = created;
          await draw(bonds.map(b => ({ ...b, layers: b.layers + 1 })));
          const afterUpdate = { created, disconnected };
          const strip = host.querySelector('.bstrip'), more = host.querySelector('.bstrip__more');
          const result = { all: strip.querySelectorAll('.bslot').length + Number(more?.getAttribute('data-count') || 0),
            right: Math.max(...[...strip.querySelectorAll('.bslot'), more].filter(Boolean).map(e => e.getBoundingClientRect().right)) - host.getBoundingClientRect().left,
            initial, afterUpdate };
          render(null, host);
          return { ...result, afterUnmount: disconnected };
        } finally {
          globalThis.ResizeObserver = NativeObserver;
          render(null, host); host.remove();
        }
      });
      assert.equal(frozen.all, ids.length); assert.ok(frozen.right <= 301, 'a 300 px strip keeps its slots and +N inside');
      assert.equal(frozen.initial, 1);
      assert.deepEqual(frozen.afterUpdate, { created: 1, disconnected: 0 }, 'layer updates reuse the observer');
      assert.equal(frozen.afterUnmount, 1, 'unmount disconnects the observer');
      assert.deepEqual(await page.evaluate(() => globalThis.__bondResizeErrors), [], 'resizing the strip must not loop during observer delivery');
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); await srv.close(); }
});
