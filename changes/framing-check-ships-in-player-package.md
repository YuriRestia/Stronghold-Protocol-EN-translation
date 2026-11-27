## 2026-11-28

### The card art framing check ships in the player package

- fetch-assets' end-of-run card art framing check now lives in `tools/assets/card-art-check.mjs` (Node built-ins only),
  which ships with fetch-assets; `tools/card-art-framing.mjs` re-exports it and stays author-only.
- Before: fetch-assets imported `tools/card-art-framing.mjs`, which the player package does not ship, so the package
  tests (and the release push's CI) failed.

Kind: internal

Server cost: none (tooling only)
