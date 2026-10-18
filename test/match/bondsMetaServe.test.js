// (fork) The dev sandbox counts bonds with the match's own rules: /match/bondsMeta.js = server/match/bondsMeta.js, that one
// file (an exact path, not a mount) — every other server/match file stays unreachable. The module imports only
// shared/constants.js, so it runs in a browser as served.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';

let srv = null;
after(async () => { if (srv) await srv.close(); });

test('/match/bondsMeta.js serves server/match/bondsMeta.js and nothing else of server/match', async () => {
  srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  const get = (p, headers = {}) => fetch(srv.url + p, { redirect: 'manual', headers });
  const r = await get('/match/bondsMeta.js');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type'), /^text\/javascript/);
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  const body = await r.text();
  assert.equal(body, fs.readFileSync(new URL('../../server/match/bondsMeta.js', import.meta.url), 'utf8'));
  const imports = [...body.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
  assert.ok(imports.length && imports.every((p) => p.startsWith('../../shared/')), `browser-loadable: shared/ imports only (${imports})`);
  assert.equal((await get('/match/bondsMeta.js', { 'if-none-match': r.headers.get('etag') })).status, 304);
  for (const p of ['/match/Match.js', '/match/gamedata.js', '/match/', '/match', '/match/bondsMeta.js/', '/match/BONDSMETA.JS', '/match/../index.js']) {
    const x = await get(p);
    assert.ok(x.status === 404 || x.status === 403 || x.status === 400 || x.status === 301, `${p} → ${x.status}`);
  }
});
