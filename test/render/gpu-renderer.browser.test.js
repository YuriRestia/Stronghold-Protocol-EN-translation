// Which GPU do the browser suites render on? Logs the WebGL renderer string that gpuArgs() gives: a real GPU's name, or
// SwiftShader / llvmpipe on a machine without one (or with SP_E2E_SOFTWARE_GL=1). It only fails when there is no WebGL at all.
// RENDER_E2E=1 node --test test/render/gpu-renderer.browser.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { gpuArgs } from '../../tools/perfbench.mjs';

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const skip = process.env.RENDER_E2E === '1' && existsSync(CHROME) ? false : 'set RENDER_E2E=1 and have Chrome (CHROME_PATH)';

test('gpuArgs() gives a page WebGL2 and logs its renderer', { skip, timeout: 60000 }, async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: [...gpuArgs(), '--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const renderer = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    });
    console.log(`[gpu-renderer] ${renderer}`);
    assert.ok(renderer, 'a page must always get WebGL2, on a software renderer if the machine has no GPU');
  } finally {
    await browser.close();
  }
});
