# Shelved tests

Tests of features that are shelved in this fork. They are named `*.shelved.js`, so **no runner picks them up**: not
`npm test` (`test/**/*.test.js`), not the CI shards, not `tools/browser-suite.mjs` (`*.browser.test.js`, `*.e2e.*`), not
`npm run test:perf` (a fixed list). `test/ci.test.js` checks that nothing under `test/shelved/` is ever picked. Don't run
them in a normal test pass, and don't add new tests here unless their feature is shelved.

## external-ai/ (shelved 2026-11-11)

External AI (`sp-ai/1`, docs/EXTERNAL_AI.md "Shelved in this fork"). The server ignores it unless
`SP_UNSHELVE_EXTERNAL_AI=1`, so these tests only mean something with that set. To run them by hand, from the repo root:

```bash
SP_UNSHELVE_EXTERNAL_AI=1 node --test test/shelved/external-ai/*.shelved.js
```

Whole files moved from `test/match/` (and `test/package-llm-gate.test.js`): external-advisor, external-ai,
external-anthropic, external-knowledge, external-llm-continuity, external-llm, external-timing, external-transports,
llm-adapter-v2, manual-ai, manual-report, advisor-input, advisor-economy, advisor-execution, package-llm-gate, plus the
fixture `fixtures/manual-player.mjs`.

Split out of files whose other tests still run (the shelved copy keeps the whole import header): bot-self-plan,
bot-strategy-seats, bot-strategy-startup, ai-cycle, ai-playbook, abyss-advisor. To unshelve for good, see
docs/EXTERNAL_AI.md.
