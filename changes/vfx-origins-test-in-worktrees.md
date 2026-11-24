## 2026-11-24

### The shot-origin browser test fails at once without effect data

- `test/render/vfx-origins.browser.test.js` names the missing `data/local-fx.json` and prints the muzzle values it measures.
- Before: in a worktree without that git-ignored file, each case timed out waiting for a shot that never came.

Kind: internal

Server cost: none
