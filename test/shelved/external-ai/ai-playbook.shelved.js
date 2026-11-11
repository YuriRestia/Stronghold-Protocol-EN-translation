// SHELVED (2026-11-11): External AI is shelved in this fork, so no suite runs this file (test/shelved/README.md).
// The External AI cases split out of test/match/ai-playbook.test.js.
/* eslint-disable no-unused-vars -- the split-out cases keep their source file's whole import header */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { DATA, makeMatch, give } from '../../match/harness.js';
import { buildPlaybook } from '../../../server/ai/playbook.js';
import { COMMUNITY } from '../../../server/ai/strategy-community.js';
import { strategyCandidates, enemyProfile } from '../../../server/ai/strategy.js';
import { knowledgePack } from '../../../server/ai/knowledge.js';
import { aiObservation } from '../../../server/match/externalAI.js';
import { createLLMAgent, STRATEGY_PROMPT } from '../../../tools/ai/llm-agent.mjs';

const modeId = 'mode_multi_normal', book = buildPlaybook(DATA, { modeId });
const band = id => book.bands.find(b => b.id === id);
const digest = (id = 'band_bldsk') => ({ playerId: 'self', round: 4, band: { id }, availability: {},
  board: [], bench: [], opponents: [], factions: [], economy: { level: 3 }, deployCap: 8 });
const draft = extra => ({ ...digest(), actions: book.bands.map((b, i) => ({ id: `a${i}`, intent: { t: 'g.band', bandId: b.id } })), ...extra });

test('seat-visible generation is unchanged by hidden holdings/funds/pool, and consumes no match RNG', t => {
  const h = makeMatch({ humans: 2, fake: true }); t.after(() => h.m.dispose()); h.start().toPrep();
  const ps = h.m.order[0], other = h.m.order[1];
  const observe = () => aiObservation(h.m, ps, { id: 'test', kind: 'prep', remaining: 64, deadline: 100 }, []);
  const before = strategyCandidates(book, observe().digest);
  give(h.m, other, h.m.gd.visibleChess[0]); other.funds = 987654321;
  const rng = [h.m.rngBots.state(), h.m.rngShop.state()];
  const after = strategyCandidates(book, observe().digest);
  assert.deepEqual(after, before);
  assert.deepEqual([h.m.rngBots.state(), h.m.rngShop.state()], rng);
  assert.ok(!JSON.stringify(after).includes('987654321'));
});

test('LLM mock: the draft is a choice-only band table, prep gets the digest without candidates; one static prefix', async () => {
  const calls = [];
  const pack = knowledgePack(DATA, { modeId });
  const agent = createLLMAgent({ SP_LLM_BASE_URL: 'http://127.0.0.1:1', SP_LLM_MODEL: 'mock', SP_LLM_API_KEY: 'mock' }, async (_config, call) => {
    calls.push(call);
    const user = JSON.parse(call.messages[1].content);
    return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ why: 'Continue the supported direction.',
      pivot: false, pivotReason: '', plan: user.kind === 'band' ? { choice: user.bands[0].choice } : {} }) } }] };
  });
  await agent({ v: 'sp-ai/1', type: 'hello', id: 'hello', knowledge: pack });
  for (const kind of ['band', 'prep']) {
    const reply = await agent({ v: 'sp-ai/1', id: kind, knowledgeVersion: pack.version, context: { mode: 'plan', kind, matchId: 'test' },
      digest: kind === 'band' ? draft() : digest('band_duyaoy') });
    assert.equal(reply.why, undefined);
    const user = JSON.parse(calls.at(-1).messages[1].content);
    assert.equal(user.strategy, undefined, 'no heuristic strategy candidates (round 65)');
    if (kind === 'band') {
      assert.equal(user.bands.length, book.bands.length);
      assert.ok(user.bands.every(r => /^a\d+$/.test(r.choice) && Number.isFinite(r.share) && Number.isFinite(r.lp)));
      assert.equal(user.digest.boss, undefined, 'no leader at the draft');
      assert.equal(reply.plan.choice, user.bands[0].choice);
    } else assert.deepEqual(reply.plan, {});
  }
  assert.equal(calls[0].messages[0].content, calls[1].messages[0].content);
  assert.match(STRATEGY_PROMPT, /digest\.bot/); assert.match(STRATEGY_PROMPT, /pivotReason/);
});

test('offline CLI emits repeatable evidence hashes and rejects an unknown version mode', () => {
  const args = ['tools/ai/playbook.mjs', '--mode', modeId];
  const run = () => execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 4e6 });
  const a = run(); assert.equal(a, run());
  const output = JSON.parse(a); assert.deepEqual(output.playbook, book);
  assert.match(output.inputHashes.chess, /^[a-f0-9]{64}$/);
  assert.ok(Object.keys(output.codeHashes).length >= 5);
  assert.throws(() => execFileSync(process.execPath, ['tools/ai/playbook.mjs', '--mode', 'missing'], { stdio: 'pipe' }));
});
