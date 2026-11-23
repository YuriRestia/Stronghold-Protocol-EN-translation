Draft: the DYYBot line (`fish-edition/ai-players/05-dyybot.md`) and the bot research tactics, plus the experiments
for Fish to run on a bigger machine. **Not for merging yet**: the tactics are a first draft, and the runs below decide
what stays.

Base: `main` (7bf71d0c, #130). Branch: `feature/fish-dyy-profile`, which merges `feature/bot-tactics-research`.

## What's in it

- `server/match/botTacticsDyy.js`: Fish's Du Yaoye tactics, each passing for any other Strategy:
  - `dyy-level`: a fixed levelling schedule (`fish` 2 / 4 / 5 / 7, or `human` 2 / 4 / 6 / 9);
  - `dyy-shop`: buy Yan and side-Alliance operators, sell Bench operators for them, hunt Yan with the 2 special refreshes;
  - `dyy-freeze`: freeze an unaffordable Yan operator.

  Profile `fish-dyy` (opt-in, in the room's list), and the tactics by id for profile data.
- From `feature/bot-tactics-research` (ai-players/07):
  - `server/match/botTacticsResearch.js`: nine research tactics;
  - `tools/evolve.mjs`: the evolution bench.
- Tests: `test/match/bot-tactics-dyy.test.js`, `test/match/bot-tactics-research.test.js`.

## Experiments

**Run here (Claude), after the balance sweep:** the forced-Du Yaoye baseline and the draft. Solo Ultimate, Du Yaoye
forced, seeds 1–160, on the same seeds:
- `legacy`;
- `fish-dyy`;
- `fish-dyy-human` (the draft with the human levelling schedule).

That's 480 matches, about an hour. It answers whether the draft beats legacy as Du Yaoye, and which schedule is better.

**Result (2026-11-12):** neither draft beats legacy yet; the differences in wins are noise.

| | `legacy` | `fish-dyy` | `fish-dyy-human` |
|---|---|---|---|
| Wins of 160 | 20 | 18 (9 lost / 7 gained, p 0.80) | 24 (11 / 15, p 0.56) |
| Reached the Final Assault | 136 | 101 | 102 |
| Shop level, rounds 4 / 7 | 1.9 / 3.3 | 3.0 / 4.3 | 3.0 / 4.0 |
| Merges per game | 6.4 | 3.5 | 4.0 |
| Stacks, round 13 | 171 | 188 | 191 |
| Leader damage per game | 2.00 M | 1.58 M | 1.61 M |

The early levelling works as designed but costs the board: fewer merges and more leaks in rounds 2–8. Fewer games
reach the boss. Those that do win about as often. The details are in 05 ("Baseline").

**For shark, later: the DYYBot evolution run** (05 "Process", step 5). It waits for the step 3 tactics: the
Isomorph plan, the levelling, Yan-focused buying and freezing. Then this PR gets one command that runs everything and
writes one zip to send back.

## Known issues

- The draft explains well under 90 % of human Du Yaoye behaviour (05, "Process step 1"). Most of the gap is the
  roll-down from round 9: refreshes, sells and equips.


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
