## 2026-11-13

### The [ASSUMED gate judges a branch's net change

- `npm run changelog -- --check` and the crew's cover-tests now count only the `[ASSUMED` lines a branch's final tree
  adds (the diff from its merge base with dev-0.2, plus uncommitted changes) [src: tools/claims.mjs branchAssumed].
  Before: every commit's patch was read, so a line one commit added and a later commit removed still failed the
  check.
- dev-0.2 merged into the branch moves the merge base and drops out; a hit whose exact line is also in that file on an
  `upstream/*` remote ref came with an upstream merge and is dropped.

Kind: internal

Server cost: none (tooling and tests only)
