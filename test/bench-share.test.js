// (Fish Edition) tools/bench-share.mjs: the pasteable block round-trips, merge drops repeated seeds and keeps bot
// pairs apart, and the sign test matches the exact binomial.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toHex, fromHex, formatBlock, parseBlocks, merge, signTest } from '../tools/bench-share.mjs';

test('bits → hex → bits, any length', () => {
  for (const n of [1, 3, 4, 5, 9, 200]) {
    const bits = Array.from({ length: n }, (_, i) => (i * 7 + 3) % 5 < 2 ? 1 : 0);
    assert.deepEqual(fromHex(toHex(bits), n), bits);
  }
  assert.equal(toHex([1, 0, 1, 1, 1]), 'b8');
});

test('a block survives being pasted into a comment, with CRLF and indentation', () => {
  const blk = formatBlock({ commit: 'abc', config: 'solo:ABYSS', a: 'legacy', b: 'evobot', seed: 1000, aBits: [1, 0, 0, 1, 1], bBits: [1, 1, 0, 0, 1] });
  assert.match(blk, /# a won 3, b won 3; b gained 1 seeds, lost 1/);
  const pasted = `Here are mine:\r\n\r\n${blk.replace(/\n/g, '\r\n').replace(/\r\na /, '\r\n  a ')}\r\nthanks`;
  const [p] = parseBlocks(pasted);
  assert.deepEqual([p.seed, p.n, p.a, p.b, p.config], [1000, 5, 'legacy', 'evobot', 'solo:ABYSS']);
  assert.deepEqual(p.aBits, [1, 0, 0, 1, 1]);
  assert.deepEqual(p.bBits, [1, 1, 0, 0, 1]);
});

test('merge: repeated seeds count once, other pairs stay apart', () => {
  const B = (seed, a, b, bot = 'evobot') => formatBlock({ commit: 'c', config: 'solo:ABYSS', a: 'legacy', b: bot, seed, aBits: a, bBits: b });
  const text = [B(10, [0, 0, 1], [1, 1, 1]), B(12, [1, 1], [0, 0]), B(10, [0], [1], 'other')].join('\n');
  const res = merge(parseBlocks(text));
  const evo = res.find((g) => g.key.endsWith('b=evobot'));
  assert.equal(evo.seeds, 4); assert.equal(evo.dupes, 1);
  assert.deepEqual([evo.aWins, evo.bWins, evo.up, evo.dn], [2, 3, 2, 1]);
  assert.equal(res.find((g) => g.key.endsWith('b=other')).seeds, 1);
});

test('sign test: exact two-sided values', () => {
  assert.equal(signTest(0, 0), 1);
  assert.ok(Math.abs(signTest(9, 1) - 0.021484375) < 1e-12);
  assert.ok(Math.abs(signTest(332, 272) - 0.01629) < 5e-5); // the evobot confirmation (ai-players/10)
});
