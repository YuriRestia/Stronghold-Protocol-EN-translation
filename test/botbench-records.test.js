import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

// botbench --records DIR saves every match as the match's own record (server/match/records.js), named bot-config-seed.
const root = new URL('../', import.meta.url);

test('botbench --records writes one replayable record per match, and without the flag nothing is written', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'botbench-records-'));
  try {
    const args = ['tools/botbench.mjs', '--configs', 'solo:FUNNY', '--seeds', '1', '--seed', '11', '--jobs', '1', '--quiet', '--json', '-'];
    const child = spawnSync(process.execPath, [...args, '--records', dir], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    assert.ok(child.status === 0 || child.status === 1, child.stderr);
    const files = fs.readdirSync(dir);
    assert.deepEqual(files, ['legacy-solo_FUNNY-11.json.gz']);
    const rec = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, files[0]))));
    assert.equal(rec.seed, 11);
    assert.ok(Array.isArray(rec.actions) && rec.actions.length > 0 && Array.isArray(rec.rounds) && Array.isArray(rec.battles));
    assert.equal(typeof rec.result.victory, 'boolean');
    assert.equal(rec.result.victory, JSON.parse(child.stdout)[0].victory, 'the record is of the same match the bench reports');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
