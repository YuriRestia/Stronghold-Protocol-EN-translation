## 2026-11-11

### Branches no longer conflict on the changelog and the asset manifest

- Behind the scenes: a change's changelog entry is now its own small file in `changes/`, folded into this file with
  `npm run changelog` on dev-0.2 (format in `changes/README.md`). Parallel branches no longer edit the same lines here.
- `data/assets.json` and the audio pool test's expected numbers merge entry by entry (`tools/merge-generated.mjs`, a
  git merge driver; `npm run merge:generated` after a merge). Before, any two branches that changed sounds or art
  conflicted on the one-line manifest and on three totals in `test/audio-pools-data.test.js`.
- The audio pool test now checks every unit's and every pool's count against `test/audio-pools-data.snapshot.json`
  (`npm run assets:pool-snapshot -- --update` rewrites it), not only the three totals.
