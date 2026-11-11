// SHELVED (2026-11-11): External AI is shelved in this fork, so no suite runs this file (test/shelved/README.md).
// The External AI cases split out of test/match/ai-cycle.test.js.
/* eslint-disable no-unused-vars -- the split-out cases keep their source file's whole import header */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA } from '../../match/harness.js';
import { buildPlaybook } from '../../../server/ai/playbook.js';
import { COMMUNITY } from '../../../server/ai/strategy-community.js';
import { strategyCandidates } from '../../../server/ai/strategy.js';
import { knowledgePack } from '../../../server/ai/knowledge.js';
import { createLLMAgent } from '../../../tools/ai/llm-agent.mjs';

const modeId = 'mode_multi_normal', book = buildPlaybook(DATA, { modeId });
const op = id => book.operators.find(c => c.id === id);
const gains = id => op(id).events.filter(e => e.event === 'SERVER_GAIN');
const digest = () => ({ playerId: 'self', round: 6, lp: 24, band: { id: 'band_lisa' }, economy: { level: 5, gold: 10 },
  board: [], bench: [], factions: [], opponents: [], shop: [{ id: 'chess_char_4_19_a', price: 3 }],
  bonds: [{ bondId: 'investShip', active: true, layers: 100 }, { bondId: 'visiShip', active: true, layers: 150 }] });
const candidates = (d, b = book) => strategyCandidates(b, d).candidates.filter(c => c.build === 'meter-backwards');

test('round 65: the example prompt no longer carries cycle candidates; an empty plan still delegates to the bot', async () => {
  let sent;
  const pack = knowledgePack(DATA, { modeId });
  const agent = createLLMAgent({ SP_LLM_BASE_URL: 'http://127.0.0.1:1', SP_LLM_MODEL: 'mock', SP_LLM_API_KEY: 'mock' }, async (_config, body) => {
    sent = body;
    return { choices: [{ finish_reason: 'stop', message: { content: '{"why":"Preserve the funded engine.","plan":{}}' } }] };
  });
  await agent({ v: 'sp-ai/1', type: 'hello', id: 'hello', knowledge: pack });
  const reply = await agent({ v: 'sp-ai/1', id: 'prep', knowledgeVersion: pack.version, context: { mode: 'plan', kind: 'prep', matchId: 'cycle-test' }, digest: digest() });
  assert.deepEqual(reply.plan, {});
  const user = JSON.parse(sent.messages[1].content);
  assert.equal(user.strategy, undefined);
  assert.ok(user.digest.bonds.some(b => b.id === 'investShip' && b.layers === 100), 'the engine layers stay visible in the digest');
  // The offline audit (tools/ai/playbook.mjs --observation) still derives the cycle evidence.
  assert.ok(candidates(digest()).length > 0);
});
