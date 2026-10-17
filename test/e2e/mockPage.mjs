// test/e2e/mockPage.mjs — (fork) open or reload a /dev/game-mock page and wait for its game screen.
// Not `networkidle0`: on Windows the mock (render loop, Pixi's image worker) goes network-idle after 25–40 s or not at
// all, so that wait timed out; 'load' + the mounted screen (no .gload overlay) is what the checks need.

/** `url` null = reload the current page. */
export async function gotoMock(page, url = null, { timeout = 60000 } = {}) {
  await (url ? page.goto(url, { waitUntil: 'load', timeout }) : page.reload({ waitUntil: 'load', timeout }));
  await page.waitForFunction(() => !!document.querySelector('.screen:not(.gload)'), { timeout });
}
