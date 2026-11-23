Draft: the bot plan tactics and the weekend evolution run on shark. **Not for merging yet**: the tactics are
drafts, and this run is what tells them apart.

Base: `main`. Branch: `feature/bot-plan-tactics`, built on `feature/bot-tactics-research` (#135).

## Run on shark (the weekend, 2026-11-13)

One command, from the repo folder (Windows, Node 22 or newer, as package.json asks):

    git fetch origin
    git checkout feature/bot-plan-tactics
    git pull
    npm ci
    node tools/evolve.mjs --out race-pc --anytime --config solo:ABYSS --pool research,basic,legacy-rules

- **It runs until you stop it.** Each round of the search plays 1,500 solo Ultimate matches (about 1.5 hours at
  1,000 matches an hour), then the current best also plays the held-back seeds 5001–5300.
- **Stop:** Ctrl+C whenever suits you. The running matches stop at once; it then writes `race-pc/summary.md` and packs
  the folder into `race-pc.zip`, next to the folder. Tested here: 1 second. A second Ctrl+C quits without the zip.
- **Send back:** `race-pc.zip`.
- **The job count comes from the machine** (cores − 2, about 1.5 GB a worker: 22 on yours), and several candidates
  play side by side to keep all cores busy. Add `--jobs N` to use fewer.
- **Restarts are safe.** After a reboot or a crash, the same command in the same folder resumes from the saved
  matches.

## What the race searches

25 tactics, each alone first, then combinations and parameters (`fish-edition/ai-players/10`):
- research (`server/match/botTacticsResearch.js`): simple-level, simple-spend, simple-freeze, bounty-optimism,
  bounty-gate, lp-hold-level, merge-first, sell-singles, early-roll, plan-bond, plan-engines, plan-items, plan-iso,
  plan-combos, plan-commit, plan-keepers, diy-picks, cycle-econ, place-copiers, carry-iso, buy-minimalist,
  place-ammo;
- basic: level-curve, buy-tier;
- `legacy-rules`: switches 12 of legacy's rules off one at a time (the less monolithic legacy).

Several of these haven't shown a gain in 40-seed runs here (`ai-players/08`). That's expected: single tactics move
win rate by a few points at most, which only thousands of matches can see. The first local race's lead didn't
hold on held-back seeds, so this run reports held-back results after every round (`holdout.md`).

## Also in this branch

- `tools/evolve.mjs --anytime`; `tools/scenario.mjs` + `botbench --scenario` (scenario tests: gifts at a round's
  prep start, e.g. Muelsyse on round 7);
- the tactics above, each with tests (`test/match/bot-tactics-research.test.js`, `test/evolve-race.test.js`,
  `test/scenario.test.js`).


## Merged with 0.3.3-1 (2026-11-18)

- `main` (0.3.3-1: evobot, the AI profiles popup, #164, #165) is merged in. The bot registry keeps both sides: the
  DYYBot profiles and evobot; evobot's copies of `sell-singles` / `plan-items` (main) win over the research ones.
- **Fixed a legacy change:** the research "around" position trait was reported even with `aroundValue` 0, so legacy
  counted Laterano item pieces as trait pieces and placed them differently (golden `solo-HARD-9-boosted`). It is now
  reported only when the tactic values it, and the per-match trait cache is keyed on that. Golden matches main again.
- A research loop names its cap (`test/plugins/loopCaps.test.js`).
- `sell-singles` and `plan-items` now have one definition, evobot's (`botTacticsEvo.js`); the research list reuses it.
  The two copies were identical, but each side's tests wanted its own object in `TACTICS`.

— Claude (orca)
