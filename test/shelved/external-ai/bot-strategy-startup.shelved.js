// SHELVED (2026-11-11): External AI is shelved in this fork, so no suite runs this file (test/shelved/README.md).
// The External AI cases split out of test/bot-strategy-startup.test.js.
/* eslint-disable no-unused-vars -- the split-out cases keep their source file's whole import header */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../../server/index.js';
import { Match } from '../../../server/match/Match.js';
import { LEGACY_BOT } from '../../../server/match/botStrategyContract.js';
import { TestClient } from '../../helpers/wsClient.js';

test('external selection requires operator transport configuration before listening', async () => {
  const previous = { strategy: process.env.SP_BOT_STRATEGY, transport: process.env.SP_EXTERNAL_AI_TRANSPORT };
  try {
    process.env.SP_BOT_STRATEGY = 'external';
    delete process.env.SP_EXTERNAL_AI_TRANSPORT;
    await assert.rejects(startServer({ port: 0, host: '127.0.0.1', quiet: true, dataDir: 'missing-external-test-data' }), /SP_EXTERNAL_AI_TRANSPORT/);
  } finally {
    if (previous.strategy == null) delete process.env.SP_BOT_STRATEGY; else process.env.SP_BOT_STRATEGY = previous.strategy;
    if (previous.transport == null) delete process.env.SP_EXTERNAL_AI_TRANSPORT; else process.env.SP_EXTERNAL_AI_TRANSPORT = previous.transport;
  }
});

test('an external seat requires operator transport configuration before listening', async (t) => {
  const previous = { seats: process.env.SP_BOT_STRATEGY_SEATS, transport: process.env.SP_EXTERNAL_AI_TRANSPORT };
  t.after(() => {
    if (previous.seats == null) delete process.env.SP_BOT_STRATEGY_SEATS; else process.env.SP_BOT_STRATEGY_SEATS = previous.seats;
    if (previous.transport == null) delete process.env.SP_EXTERNAL_AI_TRANSPORT; else process.env.SP_EXTERNAL_AI_TRANSPORT = previous.transport;
  });
  process.env.SP_BOT_STRATEGY_SEATS = '2:external';
  delete process.env.SP_EXTERNAL_AI_TRANSPORT;
  await assert.rejects(startServer({ port: 0, host: '127.0.0.1', quiet: true, dataDir: 'missing-external-test-data' }),
    /Invalid SP_BOT_STRATEGY_SEATS: External AI: configure SP_EXTERNAL_AI_TRANSPORT/);
});
