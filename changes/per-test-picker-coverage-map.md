## 2026-11-23

### Browser test reruns place data and tool changes

- `tools/test-repro.mjs --changed` no longer gives up on a change to a data file or a tool: tools and scripts are placed by the lines the tests ran, data files, language packs and dev pages by the tests whose pages requested them, docs and timing tables start nothing, and any other file runs every candidate file whole.
- The coverage map it reads is recorded by the browser suite only (`test-repro --coverage` to record otherwise), can live outside the checkout (`SP_COVERAGE_DIR`), and is capped at 16 MB a file and 400 MB in all, the oldest maps going first.
- Before: any change under `data/` or `tools/` started nothing, and every `test-repro` run recorded coverage into the checkout.

Kind: internal

Server cost: none (test tooling only)
