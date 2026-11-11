## 2026-11-11

### The golden check skips itself when nothing it reads has changed

- `npm run golden` first hashes everything a golden result can depend on (the engine, the data, the stored results,
  the tool, the Node version). If a passing comparison of exactly those inputs is on record, it says so and stops
  at once instead of spending about 33 CPU-minutes (8 minutes on 4 cores) on the same answer. `--force` runs it anyway.
- Before: every run recomputed all 293 scenarios, even on an unchanged tree.
- New `npm run golden:fast` runs only the quick subset, for branch checks; the whole corpus stays the check at merge.
- Golden never uses more than 4 worker threads, even when asked for more, so a run never loads every core of the PC.
- Before: `--jobs` took any number.
