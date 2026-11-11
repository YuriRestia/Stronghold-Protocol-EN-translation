## 2026-11-11

### The changelog tool only folds fragments when told to

- Behind the scenes: `npm run changelog` now only checks the fragments. Folding them into this file and deleting them
  takes `--write`, which runs only on dev-0.2 with `changes/` and this file committed.
- `--help` and any unknown option print the usage and change nothing. Before, `--help` folded and deleted every
  fragment.
