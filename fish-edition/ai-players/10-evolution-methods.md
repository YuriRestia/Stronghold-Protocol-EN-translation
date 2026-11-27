# Evolution methods: what the literature recommends, and what we use (2026-11-12)

Fish: "please research the literature and let's use already known good techniques" for the evolution grinder.

Our problem in the literature's terms: **automatic algorithm configuration** under noise. A configuration is a profile
(tactics, their order, their parameters: categorical, integer and real). An evaluation is a match on one seed, with
a noisy, mostly binary outcome. Matches are expensive: about 1,000 solo matches an hour on shark.

## What the literature offers

| Method | What it does | Fits us? |
|---|---|---|
| **irace** (iterated racing; López-Ibáñez et al. 2016) | Samples candidates around the elites, then *races* them: all play the same instances one at a time, and a statistical test drops the significantly worse ones early. Elitist: survivors carry their results into the next race. | **Yes.** Built for this: mixed and conditional parameters, noisy evaluations, instances (= our seeds). The standard tool of the field. |
| SMAC (Hutter et al. 2011) | Bayesian optimisation with a random-forest model of the fitness; handles categorical and conditional parameters; its own intensification (racing against the incumbent). | Strong, but the model is heavy machinery for our space (variable-length tactic lists). A later option. |
| NTBEA (Lucas et al. 2018) | An evolutionary algorithm with a bandit model of parameter combinations, designed for noisy game-agent tuning; competitive with SMAC on Planet Wars. | Fits fixed parameter sets, not variable tactic lists. Good if we tune one tactic's parameters. |
| CMA-ES with uncertainty handling (Hansen et al. 2009) | The standard optimiser for continuous parameters; the UH variant measures noise from rank changes and adds re-evaluations. | Only for real-valued parameters. Most of our space is choices and lists. |
| Racing / ranking and selection with common random numbers (F-Race, OCBA; Chick & Inoue) | Spend evaluations on the candidates still in contention; play everyone on the same random numbers (seeds) so the comparisons are paired. | **Yes:** the core of irace, and we already pair by seed. |
| Survey (Jin & Branke 2005) | Noise: resampling, larger populations, or models. | Background. |

**Choice: irace's iterated racing**, written into our bench (`tools/evolve.mjs --race`, `tools/race.mjs`). The R
package itself would need R on shark and a wrapper around botbench, and its sampling model doesn't know our
tactic lists. So we keep our mutations (add, remove or move a tactic, change a parameter) as the sampling step, and
take the rest from irace:
- **Instances = seeds**, in one stream of 10-seed blocks. Every candidate of a race plays the same blocks (paired).
- **Racing:** from block 3 (`--first`) on, each candidate is tested against the current best: a one-sided paired
  t-test, Holm-corrected, α 0.05. irace's paper recommends the t-test when the instances' scores are commensurable and
  the goal is the mean, which is our case.
- **Elitism:** each race starts again from the first block, so a new candidate meets the elites on every seed they've
  played (cached, so free for the elites). An elite can only be dropped once the race has gone past its seeds.
- **Budget split** (irace §3): iteration j gets the remaining budget over the iterations left, and
  N_j = B_j / (3 + min(5, j)) candidates. Survivors: 2 + log2(parameters).
- **Sampling:** a parent elite picked with weight by rank, as irace does, then mutated; the parameter step shrinks
  by 0.7 per iteration (irace shrinks its sampling spread). The first race screens every pool tactic alone.
- **Legacy is the control:** never dropped, and every fitness is paired against it.

## The fitness: no cheaper proxy

Earlier I suggested scoring leader damage and stacks instead of wins, for less noise. The data says no. Paired t
statistics of each tactic against legacy (co-op Ultimate, 40 seeds):

| | score (now) | wins | leader damage | stacks R13 | rounds | LP |
|---|---|---|---|---|---|---|
| `items` | +0.16 | 0.00 | +0.68 | +1.22 | −0.29 | −1.82 |
| `eng-pos` | −1.42 | −1.71 | **+0.76** | +0.02 | −2.42 | −2.33 |
| `eng-pos-own` | −3.69 | −3.59 | −1.72 | −2.23 | −3.93 | −1.79 |
| `inv-p5-r4` | −1.35 | −1.71 | **+0.62** | −0.21 | −1.81 | −1.05 |

Leader damage *rises* for two profiles that lose more games. Stacks and damage are not aligned with winning, and they
aren't less noisy either. Mixes trade one signal for another (adding LP sharpens the losers and blurs `items`). So the
fitness stays the win-aligned score (victory + 0.25 × hidden core + 0.25 × rounds / boss round), paired by seed. A
stacks goal (Fish's 200+) is a different objective, to be chosen on purpose, not as a noise trick.

The gain has to come from **where the seeds go**, which is what racing does.

## Checked on a synthetic game

`EVOLVE_FAKE=<tactic>` replaces matches with a synthetic game: a 40 % win chance, ±4 points per tactic, and the
planted tactic +15 or +6 points. Seeds share luck (60 %), like paired matches. Each method had to put the planted
tactic into its best profile; 12 planted tactics × 2 search seeds each:

| Planted effect | Race: found (mean matches) | Old GA with `--resample`: found (mean matches) |
|---|---|---|
| +15 points | 24 of 24 (1,588) | 20 of 24 (1,870) |
| +6 points | 19 of 24 (2,472) | 17 of 24 (2,932) |

Racing is better, but not by a different order. A 6-point effect still needs a few thousand matches; a 2–3 point
one (like `sell-singles`) needs far more, whatever the method. Both methods also pick up hitchhikers: tactics with
no effect that ride along.

## The first real race (2026-11-12)

`untracked/queue9-2026-11-12.sh` → `untracked/evolve-2026-11/race1/`: solo Ultimate, pool research + basic, 1,950 of
2,400 matches over 5 iterations. Then the top three were played against legacy on held-back seeds 5001–5300, which the
race never saw.

| Profile | Race (seeds 1–140): wins | Fitness | Held-back (300 seeds): wins | Flips vs legacy (+ / −) | p (sign test) |
|---|---|---|---|---|---|
| legacy | 52 | 0 | 118 | | |
| `plan-items(fromRound=5)` | 71 | +0.139 | 112 | +33 / −39 | 0.56 |
| `plan-items()` | 67 | +0.113 | 120 | +40 / −38 | 0.91 |
| `sell-singles(maxTier=1)` | 66 | +0.101 | 127 | +38 / −29 | 0.33 |

**The race's lead didn't hold.** On its own seeds, the winner beat legacy by 19 wins of 140. On fresh seeds it lost
by 6 of 300. This is the winner's curse: out of many candidates, the race keeps the ones that were lucky on its seeds,
so its best score is biased upward. Only `sell-singles(maxTier=1)` kept a small lead (+9 wins of 300), and that's not
significant either.

What it means:
- **Never read the race's own fitness as the effect.** Only the held-back seeds count. That's why the `--anytime` run
  plays its best on the held-back seeds after every iteration.
- At this scale, no single tactic is a big win, which matches Fish's "small effects add up". A 3-point effect needs
  far more matches than 2,000; that's the PC run's job.
- Next race here: the same pool plus the new tactics (queues 13–17), once they're measured.

## The weekend race (2026-11-14 → 16, shark)

`untracked/race-weekend/` (summary.md, holdout.md, gen-*.md, best.json). 19 iterations, 122,380 matches, solo Ultimate;
stopped by hand during iteration 19.

- **What the race converged on:** every iteration's winner from 11 on holds `sell-singles` (from round 8 or 9: sell
  operators with no pair, tier ≤ 2–3) and almost all hold `plan-items` (buy consumables from round 5, keep ~9–10
  funds). The final best is `sell-singles(fromRound=9) > plan-items(fromRound=5,reserve=9)` (`best.json`).
  Tactics that never stuck: `plan-iso`, `merge-first`, the placement tactics, `bounty-gate`, `diy-picks`.
- **Held-back seeds (5001–5300):** the final best won 103 of 240 against legacy's 94 (43 % vs 39 %), 35 seeds gained and
  26 lost: p ≈ 0.31 (sign test). The best single holdout was iteration 13's (`sell-singles(fromRound=8)` +
  `plan-items`): 37 / 23, p ≈ 0.09. Each iteration's best is about +2 to +9 points over legacy, never significant on its
  own; the holdout rows share seeds, so they are not independent evidence.
- **Reading:** the race found one consistent direction, an economy one (buy consumables mid-game, sell dead weight
  late), worth maybe +3–4 points. It is the "small effects add up" picture again, not a new bot.
- **Confirmation (2026-11-16):** the best against legacy on 400 fresh seeds (7001–7400), paired: 178 wins vs 163
  (44.5 % vs 40.8 %), 67 seeds gained, 52 lost, p ≈ 0.20. With the 240 held-back seeds (independent of these): 102
  gained, 78 lost, p ≈ 0.09. So: about +4 points, consistent in both sets, still not significant at 5 %. The race's
  answer is "a small economy gain, probably real, not proven". Whether it goes into the bot selector as a profile
  (e.g. 「经济」) is Fish's call; 1,000 more paired seeds would settle it (shark, ~3 h).
- **Final confirmation (2026-11-17, plan fixed before results in `untracked/race-confirm/PLAN.txt`):** evobot (#159)
  against legacy on 2,000 paired fresh seeds (7001–9000, includes the 400 above), solo Ultimate, 0 errors: **875 wins vs
  815 (43.8 % ± 1.1 vs 40.8 % ± 1.1, 1σ)**, 332 seeds gained, 272 lost, sign test p = 0.016 (two-sided). With the 240
  held-back seeds: 367 gained, 298 lost, **p = 0.008**. **Evobot is proven better than legacy, by about +3 points.**
  (The holdout row is the weekend's final best, `evo-99f84d0e339c`: the same profile as evobot.)

## For shark (Fish's other agent)

Fish (2026-11-12): "I ctrl+c to stop it whenever is convenient, wait hopefully not longer than a minute for it to clean
up, and then I have a zip file I can send back. that way whether I have 10 hours or 100 hours it still is maximally
useful". So the PC run is `--anytime` (c6552626): the race with no budget. Each iteration gets 1,500 matches (irace's
share for one iteration), and the races go on until stopped. After each iteration, its best and legacy also play the
held-back seeds 5001–5300: 6 blocks at first, one more each iteration, all 30 at most (`holdout.md`). So the
held-back check is already in the zip.

    node tools/evolve.mjs --out race-pc --anytime --config solo:ABYSS --pool research,basic,legacy-rules

- **Stop:** Ctrl+C. The running matches stop at once, then `summary.md` is written and the folder is packed into
  `race-pc.zip` next to it (Windows' own tar.exe writes the zip). Tested here: 1 second from Ctrl+C to the zip. A second
  Ctrl+C quits without packing. Creating a file `race-pc/STOP` stops it the same way.
- **Send back:** `race-pc.zip`. It holds the cache (about 7 KB per match before compression), so nothing is lost.
- **Go on later:** the same command in the same folder resumes. The finished iterations replay from the cache
  without playing again.
- At about 1,000 matches an hour: 10 hours ≈ 6 iterations, 100 hours ≈ 60.
- The job count comes from the machine (cores − 2, about 1.5 GB a worker), and several candidates' 10-seed blocks run
  side by side, so all cores stay busy. The weekend run of 2026-11-13: draft PR #137.

## Sources

- M. López-Ibáñez, J. Dubois-Lacoste, L. Pérez Cáceres, M. Birattari, T. Stützle, "The irace package: Iterated
  racing for automatic algorithm configuration", Operations Research Perspectives 3 (2016) 43–58.
- M. Birattari, T. Stützle, L. Paquete, K. Varrentrapp, "A racing algorithm for configuring metaheuristics", GECCO
  2002 (F-Race).
- F. Hutter, H. Hoos, K. Leyton-Brown, "Sequential model-based optimization for general algorithm configuration",
  LION 5 (2011) (SMAC).
- S. Lucas, J. Liu, D. Perez-Liebana, "The N-Tuple Bandit Evolutionary Algorithm for game agent optimisation", 2018
  (arXiv 1802.05991).
- N. Hansen, A. Niederberger, L. Guzzella, P. Koumoutsakos, "A method for handling uncertainty in evolutionary
  optimization…", IEEE TEVC 13(1) (2009) 180–197.
- Y. Jin, J. Branke, "Evolutionary optimization in uncertain environments — a survey", IEEE TEVC 9(3) (2005) 303–317.
- S. Chick, K. Inoue, selection procedures with common random numbers, Winter Simulation Conference 2000.
