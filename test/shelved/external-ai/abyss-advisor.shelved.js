// SHELVED (2026-11-11): External AI is shelved in this fork, so no suite runs this file (test/shelved/README.md).
// The External AI cases split out of test/match/abyss-advisor.test.js.
/* eslint-disable no-unused-vars -- the split-out cases keep their source file's whole import header */
// §35.63: 终极 cycle 2 — the example agent's choice-only calls, length retry and choice-name check, the digest's copy /
// level / enemy-scale rows, core-bond mains for carries, the executor's guards for plan seats, and the bots' level
// curve and layer trade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLLMAgent, CHOICE_TASK, RETRY_TEXT, checkChoiceName } from '../../../tools/ai/llm-agent.mjs';
import { compactDigest, levelOptions } from '../../../tools/ai/llm-context.mjs';
import { buildPlaybook } from '../../../server/ai/playbook.js';
import { strategyCandidates } from '../../../server/ai/strategy.js';
import { carryPlan } from '../../../server/match/externalAI.js';
import { planProtected } from '../../../server/match/aiEconomy.js';
import { sellWeakestHand, buyLoopSteps, levelUp } from '../../../server/match/bot.js';
import { DATA, makeMatch, give, legalTileFor } from '../../match/harness.js';

const fixture = JSON.parse(readFileSync(new URL('../../fixtures/llm-advisor.json', import.meta.url), 'utf8'));
const pack = fixture.knowledge;
const ENV = { SP_LLM_BASE_URL: 'http://127.0.0.1:1', SP_LLM_MODEL: 'mock', SP_LLM_API_KEY: 'mock' };
const answer = (content, finish = 'stop', usage = { prompt_tokens: 10, completion_tokens: 5 }) =>
  ({ choices: [{ finish_reason: finish, message: { content } }], usage });
const rewardDigest = () => ({ ...fixture.digest, actions: [{ id: 'a1', intent: { t: 'g.reward', idx: 0 }, text: 'support' },
  { id: 'a2', intent: { t: 'g.reward', idx: 1 }, text: 'lead' }],
rewards: [{ id: 'support', name: 'Support', kind: 'chess' }, { id: 'lead', name: 'Lead', kind: 'chess' }] });

async function agentWith(replies) {
  const sent = [];
  const agent = createLLMAgent(ENV, async (_config, body) => { sent.push(structuredClone(body)); return replies.shift(); });
  await agent({ v: 'sp-ai/1', type: 'hello', id: 'hello', knowledge: pack });
  return { agent, sent };
}

test('a reward call gets the choice-only task, and a choice whose name the model contradicts follows the name', async () => {
  const { agent, sent } = await agentWith([answer('{"why":"Lead completes the pair.","choiceName":"Lead","plan":{"choice":"a1"}}')]);
  const reply = await agent({ v: 'sp-ai/1', id: 'r1', knowledgeVersion: pack.version, context: { mode: 'plan', kind: 'reward', matchId: 'm' },
    digest: rewardDigest() });
  assert.equal(reply.plan.choice, 'a2');
  const question = JSON.parse(sent[0].messages[1].content);
  assert.equal(question.task, CHOICE_TASK);
  assert.equal(question.strategy, undefined); assert.equal(question.continuity, undefined);
  assert.equal(sent[0].max_tokens, 16000);
  const plan = { choice: 'a1' }, repairs = [];
  checkChoiceName(plan, 'Nobody', [{ id: 'a1', card: { name: 'Support' } }, { id: 'a2', card: { name: 'Lead' } }], repairs);
  assert.equal(plan.choice, 'a1'); assert.equal(repairs.length, 0);
});

test('a reply cut off by the output limit is retried once with the decide-now turn; usage adds up', async () => {
  const { agent, sent } = await agentWith([answer('', 'length', { prompt_tokens: 100, completion_tokens: 50 }),
    answer('{"why":"Fill the board.","plan":{}}', 'stop', { prompt_tokens: 120, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 90 } })]);
  const reply = await agent({ v: 'sp-ai/1', id: 'p1', knowledgeVersion: pack.version, context: { mode: 'plan', kind: 'prep', matchId: 'm' },
    digest: fixture.digest });
  assert.deepEqual(reply.plan, {});
  assert.deepEqual(reply.usage, { inputTokens: 220, outputTokens: 70, cachedTokens: 90 });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[1].messages.at(-1), { role: 'user', content: RETRY_TEXT });
  const twice = await agentWith([answer('', 'length'), answer('', 'length')]);
  await assert.rejects(twice.agent({ v: 'sp-ai/1', id: 'p2', knowledgeVersion: pack.version, context: { mode: 'plan', kind: 'prep', matchId: 'm' },
    digest: fixture.digest }), /incomplete/);
  assert.equal(twice.sent.length, 2);
});

test('digest shop rows carry copies held and merge completion; level options, enemy scale and bond kinds are computed', () => {
  const lead = fixture.digest.bench[0];
  const digest = { ...fixture.digest, round: 7, board: [], overflow: [], bench: [lead, { ...lead, uid: 'u3' }],
    shop: [{ id: 'lead', baseId: 'lead', kind: 'chess', slot: 0, stars: 1, price: 1, tier: 1, bonds: ['a'] },
      { id: 'support', baseId: 'support', kind: 'chess', slot: 1, stars: 1, price: 2, tier: 1, bonds: ['a'] }] };
  const scaled = { ...pack, modeId: 'mode_multi_abyss', difficulties: [{ id: 'mode_multi_abyss', enemyScale: { 7: { atk: 2.1, hp: 3.58, speed: 1 } } }],
    bonds: pack.bonds.map((b, i) => ({ ...b, core: i === 0 })) };
  const d = compactDigest(digest, scaled);
  assert.deepEqual(d.shop.map(s => [s.copiesHeld, s.completesMerge]), [[2, true], [0, false]]);
  assert.deepEqual(d.enemyScale, { atk: 2.1, hp: 3.58 });
  assert.equal(d.bonds.find(b => b.id === pack.bonds[0].id)?.kind, 'core');
  assert.ok(d.bonds.filter(b => b.id !== pack.bonds[0].id).every(b => b.kind === 'class'));
  assert.deepEqual(d.economy.levelOptions, [{ action: 'hold', fundsAfter: 8, mergesAffordable: 1, nextRoundPrice: 3 },
    { action: 'level', toLevel: 2, fundsAfter: 4, mergesAffordable: 1 }]);
  assert.deepEqual(levelOptions({ gold: 3, upgradePrice: 4, level: 2 }, [2, 2]), [{ action: 'hold', fundsAfter: 3, mergesAffordable: 1, nextRoundPrice: 3 }]);
});

test('a carried plan keeps only the funds direction of its economy', () => {
  assert.deepEqual(carryPlan({ bonds: [{ id: 'a', priority: 5 }], choice: 'a1', placements: [],
    economy: { level: 4, maxRefreshes: 0, refreshAbove: 100, holdLevel: true, why: 'x', saveForInterest: true, reserve: 5, freezeSearch: true } }),
  { bonds: [{ id: 'a', priority: 5 }], economy: { saveForInterest: true, reserve: 5 } });
  assert.deepEqual(carryPlan({ economy: { maxRefreshes: 0 } }), {});
});

function planSeat(t, plan) {
  const h = makeMatch({ mode: 'solo', difficulty: 'ABYSS', fake: true, botStrategy: 'external', externalReplay: true,
    externalAI: { mode: 'plan' } });
  t.after(() => h.m.dispose()); h.start().toPrep();
  const m = h.m, ps = m.order[0];
  m.externalAI.planFor = () => plan;
  ps.funds = 0; ps.shop.slots = []; ps.shop.frozen = false;
  return { m, ps, ids: m.gd.visibleChess.filter(id => m.pool.has(id)) };
}

test('a crowded R9+ bench frees keep-listed low tiers, and a full keep-listed hand of tier 5/6 carries sheds none', t => {
  const { m, ps, ids } = planSeat(t, { keep: [] });
  const t2 = ids.find(id => m.gd.tierOf(id) === 2), t5 = ids.filter(id => m.gd.tierOf(id) >= 5);
  const plan = { keep: [t2] };
  m.externalAI.planFor = () => plan;
  m.round = 9;
  give(m, ps, t2);
  const low = ps.hand.find(p => p?.id === t2);
  assert.ok(planProtected(m, ps, low), 'keep-listed with a roomy bench');
  for (const id of t5) { if (!ps.hand.some(p => !p)) break; give(m, ps, id); }
  assert.equal(ps.hand.filter(p => !p).length, 0);
  assert.equal(planProtected(m, ps, low), false, 'crowded: the keep-listed tier 2 may go');
  // §37.71: released, not singled out: the shed then sells by legacy piece value
  assert.ok(sellWeakestHand(m, ps, { handOnly: true }));
  plan.keep = ps.hand.filter(Boolean).map(p => p.id);
  m.round = 3;
  const before = ps.allChess().length;
  assert.equal(sellWeakestHand(m, ps, { handOnly: true }), false, 'only tier 5/6 protected pieces left');
  assert.equal(ps.allChess().length, before);
});

const run = gen => { for (const step of gen) void step; };
function legacySeat(t) {
  const h = makeMatch({ mode: 'solo', difficulty: 'ABYSS', seats: [{ seat: 0, playerId: 'ai_0', name: 'AI', isBot: true, connected: true }], seed: 3 });
  t.after(() => h.m.dispose()); h.start().toPrep();
  const m = h.m, ps = m.order[0];
  for (const p of ps.allChess()) ps.sell(p.uid);
  ps.funds = 0; ps.shop.freeRefreshes = 0; ps.shop.frozen = false;
  for (const slot of ps.shop.slots) if (slot) slot.sold = true;
  return { m, ps };
}
