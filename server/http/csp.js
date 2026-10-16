// Site policy (DESIGN §32.11). Hash only import maps, never arbitrary inline script. Worker/UI policies are independent.
// worker-src 'self' is the asset service worker at /sw.js. blob: stays for workers the page already creates
// (the simulation worker). Do not add a remote worker origin. SIM_WORKER_CSP is that worker's own policy and
// must not gain the asset worker.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { rewriteIndexHtml } from '../../shared/gen.js';

// SES evaluates confined code. This relaxation belongs only to the simulation Worker, never its parent document.
export const SIM_WORKER_CSP = "default-src 'none'; script-src 'self' 'unsafe-eval'; connect-src 'none'";

/**
 * @param {string} publicDir
 * @param {{ gen?: string | null }} [opts] (fork) behind the router, this generation: index.html is served rewritten under
 *   /g/<gen>/ (static.js, shared/gen.js rewriteIndexHtml), so its rewritten import map is hashed as well
 */
export function siteCsp(publicDir, { gen = null } = {}) {
  const hashes = new Set();
  for (const rel of ['index.html', 'studio/index.html', 'dev/game-mock.html', 'dev/render-demo.html', 'dev/battle-perf.html', 'dev/uikit.html']) {
    let html;
    try { html = fs.readFileSync(path.join(publicDir, rel), 'utf8'); } catch { continue; }
    const texts = gen && rel === 'index.html' ? [html, rewriteIndexHtml(html, gen)] : [html];
    for (const text of texts) for (const m of text.matchAll(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/g)) {
      hashes.add(`'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
    }
  }
  return `default-src 'self'; script-src 'self'${hashes.size ? ' ' + [...hashes].join(' ') : ''}; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'`;
}
