## 2026-11-22

### Dynamic illustration extraction

- `extract.py --only dynillust` extracts the official dynamic illustrations (动态立绘) of every operator in the main and self-select pools from the local CN client: the Spine skeleton, atlas and pages (full and half size, WebP), the framing, the actions and their effects, the animators, the bone followers and the render separator, the effect layer through the battle-effect extractor, and one `dynillust` group in `data/local-assets.json` (DESIGN §33.19).
- Opt-in like the battle effects: a plain extraction leaves them out and keeps an earlier `dynillust` group. Capped by size (`--dyn-max-mb`), per file and by time; `--dyn-keys`, `--dyn-shard` and `--dyn-report` for partial and parallel runs.
- Each illustration's outfit id keeps the official letter case from the client's prefab name (the bundle file names are lower case), so the Ambience Synesthesia outfits find their animated art; the run warns about any outfit id that is not exactly in `data/outfits.json`.

Kind: internal

Server cost: none (extraction tool only; no server, network or bot code. Serving the files is counted in the screens' fragment.)
