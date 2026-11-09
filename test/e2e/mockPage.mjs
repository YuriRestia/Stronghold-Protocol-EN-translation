// test/e2e/mockPage.mjs — (fork) open or reload a /dev/game-mock page and wait for its game screen.
// Not `networkidle0`: with the engine renderer Pixi starts its image worker from a blob: URL, and Chrome never marks
// that worker script's load finished (seen on Chrome 156: the request stays open, so the page never fires its
// networkIdle lifecycle event and every networkidle0 wait times out). 'load' + the mounted screen (no .gload overlay)
// is what most checks need; `settle` then also waits for 500 ms with no request open as Puppeteer sees them (the same
// rule as networkidle0, without that worker load), for checks that need every model and picture loaded first.

/** `url` null = reload the current page. */
export async function gotoMock(page, url = null, { timeout = 60000, settle = false } = {}) {
  await (url ? page.goto(url, { waitUntil: 'load', timeout }) : page.reload({ waitUntil: 'load', timeout }));
  await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)'), { timeout });
  if (settle) await page.waitForNetworkIdle({ idleTime: 500, timeout });
}
