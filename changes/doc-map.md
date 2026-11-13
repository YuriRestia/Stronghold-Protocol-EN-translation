## 2026-11-13

### Read the docs first, source every claim

- `docs/doc-map.json` maps each code area to the doc sections to read before editing it (`node tools/doc-map.mjs
  <path>` prints them); `test/doc-map.test.js` fails when a mapped doc, heading or path no longer exists. AGENTS.md
  points at it. It also lists the server-cost facts (what runs where, what the server sends) with their sources.
- `tools/claims.mjs`: a number with a unit or a statement about the official game carries `[src: ...]` or
  `[unverified]`. `npm run changelog` applies it to new fragments' `Server cost:` numbers and timing lines (the fold
  strips the markers), and fails on a branch's new `[ASSUMED` lines without "user OK <date>".

Kind: internal

Server cost: none (tooling, docs and tests only)
