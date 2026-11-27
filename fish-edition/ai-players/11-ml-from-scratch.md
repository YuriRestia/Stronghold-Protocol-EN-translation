# ML from scratch: SPA without legacy's paradigm

Fish (2026-11-13): "do one pass of researching ml techniques and seeing what we could possibly build that isn't based on
the paradigms of legacy … analyze spa from the beginning, without being bound to legacy. what state can the bot see,
what actions are available, and what is the ultimate objective? what traditional or ml techniques can apply? are there
other ways to make sense of/add order to the system, other than how legacy does it? what constraints do we have? which
techniques may be able to get around the current bottleneck that is running games is slow? and finally, what seems most
promising to try on our budget?"

This pass is a survey plus two measurements (below). Nothing is built yet. The reading list, with links, is in
`untracked/ml-2026-11/papers.md`. The PDFs couldn't be saved: this sandbox can't reach arXiv. The same file has a
command that downloads them on your PC.

## The measurement that changes the picture: battles are cheap and replayable

Every human record keeps each battle's full input (`battles[].spec`: units with tile, direction, items, skill, elite;
spawns, routes, seed) and its result (`out`: killed, total, leaks). I fed the specs back into today's `Battle` (`untracked/ml-2026-11/replay.mjs`):

- **762 normal battles from 30 records: 761 give the same leak / no-leak result as the record.** This holds even though
  the records come from app 0.3.1 and the engine has changed since.
- **36 ms per normal battle** on one thread (73 game seconds each). That is about 28 battles a second per thread. On
  shark's 24 threads, that is roughly 2 million battles an hour. The race plays about 1,350 whole matches an hour.
- The 182 records hold 3,242 normal seat-battles (873 with leaks, 27 %), 360 unite, 131 boss, 77 hidden.

So the slow part is the **whole match**, not the battle. Most of a match's time is the bot's own rehearsal (about 194
of the 240 ms of each prep) and the boss fights. A battle is a pure function, (board, wave, seed) → (kills, leaks,
damage), and it can be called millions of times without playing any games. Legacy uses the battle only as a final
check (the rehearsal). The techniques below use it as a data factory.

## 1. SPA from first principles

### What the bot can see (the state)

Per the rules in `server/match/bot.js`, a bot reads only what a player sees:

- **Its own seat:** LP, level, funds, hand, bench and board (operator, tier, elite, items, tile, direction), Alliance
  counts and layers, the Strategy (band) and its counters, frozen shop, last results.
- **The shop:** the 5 offers (or the band's variant), refresh cost, level-up cost.
- **The shared pool:** the copies left of each operator (the shop odds follow from it and the level).
- **Teammates:** their Alliance strips (coop).
- **The round ahead:** the enemy preview (composition, routes), and the stage. Bosses and the hidden round are known by
  round number.

Hidden: future shop draws (random, but the odds are known), other players' hands, future waves past the preview.

Size: 112 normal operators (tiers 1–6) × 2 elite levels, 115 items, 23 Alliances, 40 Strategies, a 4 × 9 board, 14–15
rounds. A full board is about 8 operators with up to 2 items each.

### What it can do (the actions)

The human records count 115k human actions. By type: equip 21k, move 18.5k, shop log 16k, reward 15.6k, sell 14.5k,
refresh 13.7k, buy 10k, destroy 1.5k, gain 1.3k, level up 0.9k, card 0.5k, freeze 0.5k, band 0.2k.

Structurally there are four kinds of decision:

1. **Rare, high-stakes picks:** the Strategy at round 0, Strategy cards, reward offers. Few per game, large effect.
2. **The economy loop:** buy / sell / refresh / level / freeze. Many per round, each small, all interacting through
   funds (which are lost at the end of prep).
3. **Items:** which operator wears what. These are many small choices, but their effects multiply.
4. **Placement:** tile and direction for each deployed operator. This feeds only the battle.

A prep round is a variable-length sequence of these actions. The order matters, because a refresh reveals new offers.

### The objective

Solo: survive every round (LP > 0) to the end and beat the final boss. Coop: the same for the team, with shared
boss pools. The win is binary and comes at the end, after about 15 rounds and roughly 600 actions. That is the classic
long-horizon, sparse-reward setting, which is why single tactics barely move the win rate (05, 08, 10). Useful
stand-ins along the way: leaks per round, LP left, boss damage, the round reached.

### What kind of problem it is

- **Two coupled sub-problems:** a fast, discrete economy (prep) and a slow, deterministic battle given the board. The
  battle's only input from the economy is the board; the economy's only input from the battle is the result (LP,
  coins, layers). That decomposition is the main source of order this note exploits.
- **Single-agent against the house in solo** (the waves don't adapt to you), so it isn't a game-theory problem. It's
  planning under uncertainty: the shop is a stochastic environment. Coop adds a shared pool and teammates.
- **Determinism:** a given seed and the same actions give the same match. Good for search and for paired tests.

## 2. Techniques from the literature

The reading list is in `untracked/ml-2026-11/papers.md`. "(verify)" marks a source I found by search but couldn't open
from here.

### Learned battle models (surrogates)

- **StarCraft combat models.** Stanescu, Barriga and Buro learned Lanchester-style unit strengths from recorded battles
  ("Using Lanchester Attrition Laws for Combat Prediction in StarCraft", AIIDE 2015). Their bot used the model instead
  of a simulator and won more. Uriarte and Ontañón ("Automatic Learning of Combat Models for RTS Games", AIIDE 2015)
  learn forward combat models from replays.
- **Total War.** Kwan and Cakmak (Creative Assembly), "Learning Combat Outcomes in Creative Assembly's Total War"
  (AIIDE 2025). A supervised model of 1-vs-1 unit outcomes drives the auto-resolver and the engage / retreat AI,
  replacing hand rules.
- **What transfers:** SPA's battle is a deterministic simulator we can call 2 million times an hour. A learned model
  is cheap to train here, and we can check it against the real simulator at any time.

### Model size, overfitting and distillation (2026-11-19)

Fish (2026-11-19): one piece of advice says "train a big NN and then distill it", another says "tune the dimensionality to
prevent overfitting"; what does the literature say? From general knowledge of the ML literature, not re-read here
(verify before quoting). **Both are right in different situations, and the amount of data decides which.**

- **Big, then distill.** Buciluă et al. 2006 (model compression) and Hinton et al. 2015 (distillation): a small model
  trained on a big one's outputs often beats the same small model trained directly, since the soft outputs carry more
  than win / loss labels. Li et al. 2020 ("Train Large, Then Compress"): on a fixed compute budget, large models reach
  a given accuracy sooner and compress well. Frankle & Carbin 2019 (lottery ticket): big nets train easily because
  they hold many good small subnetworks. Applies when the end product must be small and fast.
- **Tune the size.** The classic bias-variance view, and what happened in 04 (every feature, 150 seeds: overfit).
  Corrected by double descent (Belkin et al. 2019; Nakkiran et al. 2019): test error peaks where the model can just
  memorise its data, then falls again as it grows; good regularisation and early stopping mostly remove the peak
  (Nakkiran et al. 2020). Scaling laws (Kaplan 2020; Hoffmann 2022 "Chinchilla"; Muennighoff 2023, data-limited): the
  best model size grows with the data, and with scarce fixed data bigger stops helping. Applies when data is the limit.
- **Tabular features favour trees.** Grinsztajn et al. (NeurIPS 2022), Shwartz-Ziv & Armon 2022: boosted trees
  usually beat neural nets on hand-made tabular features at our data sizes. Our first measurement agrees (trees 0.91 AUC).
- **Surrogates inside a search get exploited**: the search finds where the surrogate errs in its favour (Jin 2011).
  Fixes: check the top picks on the real simulator (our "rehearse the top 3"); an ensemble's disagreement as
  uncertainty (Lakshminarayanan et al. 2017, deep ensembles); generate new data where it is unsure.
- **Order-free per-unit encodings.** Deep Sets (Zaheer et al. 2017), Set Transformer (Lee et al. 2019): one
  representation per unit, pooled so unit order doesn't matter.

**For our surrogate:**
1. **Data is unlimited** (the simulator, ~2 M battles an hour on shark), so overfitting is mostly not the constraint:
   if a model overfits, generate more rows rather than shrink it. What must stay strict is held-out seeds (whole seeds,
   every variant folder with them).
2. **Training on the simulator already is distillation**, with the simulator as teacher. A big net is worth it only
   if the browser bots need a small fast model: train big on simulator data, distill to small, check the small one
   against the simulator.
3. **Our bottleneck is the inputs, not the capacity.** The third measurement (below) tied "lowest tier first" because
   its features are board-wide sums: no tile, range or Alliance recount. Next: per-Operator features (Deep Sets style)
   trained on the 16,486 drop-one rows, as an ensemble whose disagreement tells the bot when to rehearse instead.

### Learned evaluation plus shallow search

- **TD-Gammon / AlphaZero lineage.** Learn V(state) and pick the action whose result has the best V. Gumbel
  AlphaZero / MuZero (Danihelka et al., "Policy Improvement by Planning with Gumbel", ICLR 2022) works with very few
  simulations, which suits a small per-prep budget. Code: `deepmind/mctx`.
- **Hidden information.** Information Set MCTS (Cowling, Powley, Whitehouse, IEEE TCIAIG 2012) searches over
  information sets rather than one tree per sampled future. That's the right shape for "what will the next refresh
  show".
- **Auto-battlers specifically.** TFTMuZeroAgent (an open-source Gumbel-MuZero agent on a TFT Set 4 simulator) and a
  Battlegrounds MCTS paper (Zolboot et al., CATA 2022, verify). "Build, Don't Play" / AutoTavern (arXiv 2610.33845,
  verify) claims an LLM-free deck-building agent on a Battlegrounds-like gym; an independent review disputes its
  results.
- **What transfers:** the shape (value network plus small search), not the scale. Those agents train for millions of
  games on GPUs.

### Learning from humans without new games

- **Behaviour cloning (BC).** Predict the human's action in the same state; DAgger (Ross et al. 2011) corrects the drift
  when the clone's mistakes lead it into states no human visited.
- **Drafting / deck-building.** Ward et al., "AI solutions for drafting in Magic: the Gathering" (arXiv 2009.00655):
  pick models trained on human drafts. Generalised card representations for MTG drafting (arXiv 2407.05879): features
  of the card, not its ID, so new or rare cards still get sensible values. SPA's shop is a draft (pick from 5 offers),
  so this is the closest match in the literature.
- **Human-regularised RL and search.** piKL / Diplodocus (Bakhtin et al., arXiv 2210.05492, no-press Diplomacy): search
  or RL that stays close (KL) to a human BC policy. It plays strong and human-like, and needs far less self-play than
  RL from scratch. Hanabi: BC plus regularised RL (arXiv 2506.21490, verify).
- **Offline RL.** AlphaStar Unplugged (Mathieu et al., arXiv 2308.03526): a StarCraft II agent from replays only, BC
  first, then offline RL improves on it. It shows the ladder: BC → BC + value → offline policy improvement.
- **What transfers:** Fish's idea (act like a human) is exactly BC. The literature's lesson is that BC is the best
  starting point and a good prior, but with 269 human seats it won't beat the humans it copies. A value function or
  search on top is what improves on it.

### Tuning under noise (already in 10)

irace, SMAC, NTBEA, CMA-ES. Surrogate-assisted evolution (Jin, "Surrogate-assisted evolutionary computation", 2011)
is the bridge: rank candidates on a cheap model, and play real games only for the survivors.

### Placing the Final Assault board as a lattice search (2026-11-19)

Fish (2026-11-19): placing the boss board is a tractable subproblem (the bot keeps only ~70 % of the human layout's
damage on the human's own units, `04`); check the literature before any experiment, and save the result of every game
run. Web search, **abstracts and snippets only, no paper opened** (verify before quoting). Nothing I found solves
"units on a 2D lattice, scored by a simulator" exactly; these are the nearest.

| Source | What it does | What we take from it |
|---|---|---|
| Barriga, Stanescu, Buro, "Building Placement Optimization in RTS Games" (AIIDE 2014, https://ojs.aaai.org/index.php/AIIDE/article/view/12735) | A GA whose fitness is a simulated battle of the candidate placement | The closest precedent for our rehearsal; our gap is the candidate set, not the idea |
| Zhang, Fontaine, Hoover, Nikolaidis, "Deep Surrogate Assisted MAP-Elites for Hearthstone Deckbuilding" (GECCO 2022, https://arxiv.org/abs/2112.03534) | A deep surrogate trained online on game outcomes; MAP-Elites searches on it; the elites are checked in the real game and become training data | The best match for "surrogate + search + real simulator as judge". The diverse archive feeds the surrogate and counters the search exploiting its errors; beat an offline-trained surrogate |
| Surrogate-assisted neighbourhood search for thermal layout (Complex & Intelligent Systems 2023, https://link.springer.com/article/10.1007/s40747-023-01276-0) | Layouts encoded as images, a deep net as surrogate, local search on swaps | Generic surrogates had large errors on discrete layouts; the image encoding fixed it. Supports a grid encoding with a local-search neighbourhood |
| Loshchilov, Schoenauer, Sebag, ACM-ES (PPSN 2010, https://infoscience.epfl.ch/record/186020; arXiv 1206.0974) | A rank-SVM surrogate inside CMA-ES, tested on noisy functions too | Learn the ordering, not the value: invariant to monotone transforms, so heavy-tailed damage doesn't matter |
| Oh et al., COMBO (NeurIPS 2019, https://arxiv.org/pdf/1902.00448) | Bayesian optimisation over categorical variables with a diffusion kernel on the combinatorial graph | An option for few-unit boards, but a GP scales poorly; not first choice |
| Mirhoseini et al., chip placement with RL (2020, https://arxiv.org/abs/2004.10746) | Places blocks on a canvas with RL; an encoder pretrained to predict placement quality | The pretrained quality predictor is the reusable part; RL itself needs far more games than we have |
| CIG 2013 paper 78 (https://www.cse.unr.edu/~simingl/papers/publish/CIG2013-Paper-78-eXpress-Ready.pdf) | Search over influence-map parameters for StarCraft group positioning | Search a handful of layout parameters instead of every unit's tile |
| Bloons TD as a 2D knapsack (Tilburg, https://research.tilburguniversity.edu/en/publications/modeling-bloons-tower-defense-as-a-temporal-two-dimensional-knaps/) | Integer programming over a dotted board | The fixed-pieces-on-a-grid formulation, if we ever need an exact method |

**Specialisations for a lattice (the first two are in the sources, the rest are my reasoning, to test):**
1. **Search the small, structured space, not the raw one.** A layout generator with a few parameters (cluster
   centre, spread, tile order for the dealers, which tiles the blockers take) cuts the dimensions from "every unit ×
   every tile" to a handful. This is also the answer to the dimensionality question: shrink what you search, not the model.
2. **A local-search neighbourhood on the lattice**: move one unit one step, swap two units, rotate a facing. Evaluating a
   neighbour is one battle; a surrogate only pre-screens neighbours.
3. **Encode tiles, not coordinates.** The route and the boss's approach break translation and mirror symmetry, so a
   raw (row, column) input loses what a human sees. Give per-tile channels instead: distance to the route, how many
   route tiles each unit's range covers from that tile and facing, ground or ranged tile, neighbours' range overlap.
   A CNN or per-unit set encoding then works on those.
4. **Canonicalise before storing or learning.** Units that are identical (same operator, elite, items, modules) are
   interchangeable; sort them so one layout has one hash and one label.
5. **Rank, don't regress.** Train on "layout A beats layout B for this board and boss" pairs (neighbours of one
   parent give thousands cheaply). That is ACM-ES's reason and fits our pairing of parents with children in `11`'s drop-one test.
6. **Archive with descriptors** (DSA-ME): e.g. the packed centre column, the spread, the share facing the approach.
   The archive keeps diversity so the surrogate trains on the whole space, not only where it thinks it's good.
7. **Re-score the top picks on the real simulator**, with the same seeds for all candidates (paired), as our rehearsal does.

## Logging every game run (for analysis and training later)

Every simulated battle in a placement experiment is saved, accepted or not, one JSON row each, written in chunks of a
few thousand to `untracked/placement-2026-11/` with a PID lock so a restart resumes (the incremental-experiments rule).
A row holds what is needed to replay it and to train on it:
- **Identity:** run id, chunk, board id (the recorded match + seat + round), boss id, battle seed, simulator commit.
- **Layout:** each unit as (id, elite, items, modules, tile, facing), the sorted canonical form and its hash.
- **Provenance:** which generator or step produced it (search algorithm, iteration, parent layout hash, move type),
  so parent / child pairs can be rebuilt; the surrogate's prediction when one chose it (to measure how much the search exploits it).
- **Outcome:** the objective (damage at 120 s, time to kill, leak), the boss's HP sampled over time, each unit's damage
  share, whether it won, and the battle's wall time.
- **Rejected and invalid layouts too**, flagged, since "what fails" is training data.
Held-out splits are by board (whole boards, with every layout of them), never by row.

### Shark's return: the shop decision-point dataset (line 1; received 2026-11-20)

Archive `logs/shark-ml-return-2026-11-19.tar.xz` (unpacked, untracked, in `untracked/shark-return-2026-11-19/`; its `RETURN.md` is shark's report). **Checked by orca:** the row counts per source match, `predictability.mjs` reproduces shark's table to the digit, and the human file count (231 in the rows) is 203 files with a round-2-or-later decision, as stated.

- **The data:** `decision-points/shop.jsonl`, 102,839 rows of shop buy/skip decisions (human 25,972; bot-legacy 6,151; bot-other 36,202; legacy-clean 17,290; evobot-clean 17,224), with a start-of-round state (previous round's snapshot, so no leak), counters within the round, and cheat / Risk / seeded labels from `ruleLabels`. It holds human match data: **never commit it** (same as the human records).
- **Results (shark, reproduced):** majority guess vs state-bucketed predictor. Bots: +7 to +8 points over per-round (legacy-clean 63.9 → 71.5 %, evobot-clean 62.2 → 70.8 %); no signature of overfitting. Clean humans (88 files): no lift (62.9 % majority, 61.3 % bucketed), which says the sample is thin and the features too coarse, not that humans are random. Cheat-economy humans skip 78 % of shops. **legacy vs evobot: no difference established** in how predictable their shop decisions are (relative lift 21.1 vs 22.1 %, CI [-0.4, 2.4] points).
- **What it means for the imitation line (line 4):** shop buy/skip from round, shop screen and last round's level is learnable for bots but not yet for humans; a human-imitation model needs richer features (the offer's contents, owned units, Alliance fit) before any claim. Do not redo the extractor or the `bot: 1` tagging (RETURN.md "What orca shouldn't redo").
- **Seeds:** the clean bot records use seeds **5001-5300, which are the evolution race's held-back seeds** (`ai-players/10`). Fine for placement or analysis; never for tuning or training anything that must see those seeds as unseen.
- **New resource for the boss-board work:** the 600 bot records (`bot-records/`, legacy and evobot, solo ABYSS) hold **503 boss battles (452 without summon tokens)**: bot-built final boards, about 8 times the 53 human boards of the placement ceiling test. Use them to find and fit a placement rule, and test it on the human boards (as planned in `04`).
- **Tool:** `make-bot-records.mjs` makes labelled bot records for any registered bot, seeds and config (needs to sit in `fish-edition/untracked/shark-ml/`).

## 3. Other ways to add order (instead of legacy's)

Legacy hand-writes a score for every decision point (`buyScore`, `lineupScore`, `bondPlan` …) and tunes constants.
Some alternatives:

1. **Decompose by the battle boundary.** Learn `P(no leak | board, wave)` and expected leaks. Then every economy choice
   (buy, sell, level, item, lineup) is valued by how it changes that one number on the next waves, rather than by
   separate hand scores. Placement becomes search against the same model, with the real simulator as the final judge.
2. **Power curve vs requirement curve.** Waves get harder on a known schedule. A board's learned "power" must stay
   above each round's requirement, and leftover power is wasted. The economy then becomes a resource-allocation plan
   over (funds, level, power): spend just enough to survive now, invest the rest (levels, pairs, Foresight). This is a
   small dynamic program, not a heuristic. It explains Investor and stack play (08) as "bank when the margin allows".
3. **Comps as goals (what TFT players do).** Cluster the human end boards into archetypes (target Alliances,
   operators, items). The bot picks a reachable target from what it holds, then plays toward it. This is
   goal-conditioned play from data, where legacy's `bondPlan` is hand-written.
4. **Discrete choice for the shop.** A human sees N offers and buys some. A conditional-logit (McFadden) model learns
   each offer's utility from features (tier, Alliance fit, pair progress, price, funds, round). It is interpretable, a
   few hundred weights, and runs in microseconds in the browser. The same model works for reward offers, Strategy
   cards and items.
5. **Value of a round state.** Learn `V(state at prep end) → P(win)` from records and bot games. 269 human seats ×
   15 rounds is about 4k states (small); a weekend of bot games adds about 900k (biased toward the bots' own play).

## 4. Constraints

- **Browser-safe, deterministic, cheap** (bots go client-side). Any model has to be plain JS weights, so a linear
  model, small trees or a small MLP of at most a few MB. No GPU, no library, and seeded randomness only. Inference
  must fit a prep's budget (about 240 ms today, mostly rehearsal).
- **Training happens offline** on your PC (24 threads, 32 GB, Windows; I'm assuming no GPU in use). CPU training of
  small models is fine: gradient-boosted trees or MLPs on millions of rows take minutes to hours.
- **Human data is small:** 182 records, 269 seats, 115k actions, 3.2k normal battles. Enough for BC of frequent
  decisions (buys, sells, refreshes) and battle models, but thin for rare ones (Strategy choice: 233).
- **Game versions drift.** Old records still replay (761 / 762), but balance PRs (SPA-CC, Mod Z) shift values. Models
  need retraining, so the pipeline matters more than any one model.
- **EOS (~May 2027) and the feature freeze.** Only the DYYBot line may grow, so anything has to land as DYYBot
  tactics / decision points.
- **Our own budget:** my sessions run here with a few threads; only jobs over 3 h go to your PC.

## 5. Ways around "games are slow"

From cheapest to most ambitious:

1. **Don't play games; play battles.** 2 million battles an hour vs 1,350 matches. Generate (board, wave) → outcome data
   by mutating human and bot boards (swap one operator, move one, add or drop an item, as 04's mutants did, but
   millions instead of hundreds). This trains the battle surrogate.
2. **Don't play battles either: learn from records.** BC and discrete choice need no simulation at all.
3. **Fast-forward games.** Replace the battle (and the rehearsal) by the surrogate, so a match costs only its prep
   logic. Without rehearsal, a prep is about 46 ms (240 − 194), so a match should be well under a second, roughly
   10–50× faster. Screen candidate profiles in these games, and race only the best on the real simulator
   (multi-fidelity, as in 10's SMAC / surrogate notes).
4. **Shorter games.** Start matches at round 6 or 10 from recorded or bot states (the scenario tool already gives
   gifts by round). A decision that matters late can then be tested without playing the early rounds.
5. **Variance reduction.** Paired seeds (already used), common random numbers, and control variates (subtract a
   surrogate's predicted win chance from the outcome). Each one cuts the games needed for the same p.

## 6. What seems most promising on our budget

1. **Battle surrogate (start here).** Data: the 3.2k human battles plus mutants, generated at about 2 M an hour. Model:
   a small MLP or boosted trees over a set encoding (per unit: operator features, tier, elite, items, tile class;
   per wave: enemy counts, DEF / RES, flyers, route lengths). Targets: no-leak probability, leaks, boss damage.
   - **Uses:** value every buy / sell / item / lineup choice by its effect on next round's leaks; rank many layouts
     and rehearse only the top 2–3, replacing about 194 ms of rehearsal; fast-forward games for evolution.
   - **Why first:** it doesn't depend on human data size, it's checkable against the real simulator at any time, and
     it attacks the bottleneck directly.
   - **Risk:** 04's linear model reached a win AUC of only 0.76 on boss boards (R² ≤ 0.24 for damage). A nonlinear
     model with 1000× the data should do much better, but that is the first thing to measure.
2. **Discrete-choice BC of the shop and items from the 269 human seats.** It's cheap (hours) and interpretable,
   and it is Fish's "act like a human" idea. Measure top-1 / top-3 agreement with humans on held-out seats. As a DYYBot
   tactic it can replace `buyScore` with a learned utility. It is also the prior for item 3.
3. **Value function plus one-step lookahead (later).** Learn V(state) from bot games plus records (fast-forward games
   make this cheap). Then each prep decision picks the action whose result has the best V, kept close to the BC prior
   (piKL-style). This is the closest thing to the TFT / Battlegrounds agents that fits a CPU and a browser.

Not recommended on this budget: full RL from scratch, MuZero-scale self-play, or LLM agents. They need orders of
magnitude more games or compute than we have before EOS, and none of them is browser-cheap.

### A first step (small, resumable chunks)

1. `untracked/ml-2026-11/battles/`: dump the 3.2k human battles as rows of (encoding, outcome). Add mutants in chunks of
   100k with a PID lock, so a restart resumes (about 3 minutes per chunk on 24 threads).
2. Train boosted trees and a small MLP. Report the no-leak AUC and leak MAE on held-out human battles (not their
   mutants), against the no-leak base rate (73 %).
3. If the AUC is about 0.9 or higher: rank layouts with the surrogate, rehearse the top 3, and compare against legacy
   rehearsal on paired seeds (time and win rate).

That's a few hours of my time plus one job for your PC. Items 2 and 3 can wait for the result.

## First measurement: the battle surrogate (2026-11-17)

Fish (2026-11-17) asked whether there is a much better technique than evolution, and to start an investigation if it
fits in 4 hours. Evolution can only tune the parameters of tactics we wrote; §6's battle surrogate is the step that can
find play no tactic describes. This is step 1–2 of "A first step" above. Scripts and data:
`untracked/ml-2026-11/surrogate/` (`extract.mjs`, `train.py`, `mut.sh`).

- **Data.** The human records were in the scratchpad that the restart wiped, so this uses the 238 bot-match records in
  `untracked/`: 10,642 recorded solo seat-battles (57 % without a leak), plus 12,000 mutants (a recorded board with 1–2
  operators removed, re-simulated; 28 % without a leak). The mutants' Alliance counts are the recorded ones (not
  recomputed): an approximation.
- **Features.** About 40 rough hand-made numbers: round, unit count, tiers, elites, items, a crude attack and HP sum,
  profession counts, active Alliances and stacks; the wave's enemy count, HP, attack, DEF / RES, flyers, elites, speed.
- **Test.** 6 of the 30 seeds held out; every record of a held-out seed (all variant folders) is held out with it.

| No-leak prediction (AUC) | held-out recorded | held-out mutants |
|---|---|---|
| Round only | 0.83 | 0.73 |
| Logistic regression | 0.88 | 0.81 |
| Boosted trees | **0.91** | **0.89** |

Leaks, boosted trees: mean absolute error 2.6 against 5.5 for the mean.

**Reading.** The 0.9 bar of step 3 is met on recorded boards and nearly on mutants, with crude features and little
data. The mutants matter most: there the round says little, and the model still separates the boards that leak. So it
values operators, not just the round. Not yet measured: whether it ranks a board above the same board minus one
operator (the per-decision question), and whether it can rank layouts, which these features (no tiles) can't see.

**Next.** Pair each mutant with its parent and measure the ranking; add tile and range features; then step 3 (rank
layouts with the surrogate, rehearse the top 3, compare with legacy's rehearsal on paired seeds). Mutant generation runs
at about 200 ms a battle here while the bench uses 9 cores; on shark it is about 36 ms.

### Second measurement: does it rank a board against itself minus an Operator? (2026-11-17)

All 30,000 mutants (15 chunks) are done. Each is now paired with its recorded parent (`extract.mjs pairs` replays a
chunk's random draws without re-simulating and matches features in order; 30,000 of 30,000 paired). `pairs.py` trains on
the training seeds (recorded boards plus mutants) and tests on the 5,896 held-out pairs.

| Question (held-out pairs) | Trivial guess | Surrogate |
|---|---|---|
| Which of the pair leaked less (3,438 pairs where leaks differ)? | "the parent": 91.7 % | 90.5 % |
| Which kept a clean wave (1,571 pairs where it differs)? | "the parent": 96.6 % | 96.7 % |
| How much does this removal cost? (predicted vs real leak change) | – | correlation 0.52 |
| Does this removal cost any leaks? (54 % of pairs) | – | AUC 0.80 |

**Reading.** The surrogate already knows that fewer Operators is worse, so it can't beat "the parent is better" on direction. That
question is too easy to be useful. The useful signal is the size: it tells a harmless removal from a costly one
(AUC 0.80). That is the decision a bot faces when it sells, benches or swaps an Operator. In 8 % of the pairs the board
with fewer Operators leaked less. Some of that is real (deploy order, DP), and some is the approximation (Alliance counts
not recomputed).

**Next.** Step 3 as planned, with one change: the first test is selling and benching, not layout, since these features
see Operators and not tiles. Rank "which Operator to sell" by the predicted leak change and compare it with
`sell-singles` on paired seeds. Tile and range features come before any layout ranking.


### Third measurement: which Operator to take off? (2026-11-18)

The bench / swap decision, checked against the simulator. For each of the 1,905 held-out boards (groups not used in
training, at least 3 Operators), every single-Operator removal was re-simulated (16,486 battles, `extract.mjs drop1`,
`drop1.sh`; same simulator checkout as the training data). Each chooser picks one removal; the cost is its leaks
minus the full board's.

| Chooser | Mean leak cost of its pick | Picks a removal that costs nothing |
|---|---|---|
| Best possible | −0.27 | 88.8 % |
| Surrogate (fewest predicted leaks) | 1.09 | 64.3 % |
| Surrogate (most likely clean) | 1.16 | 65.3 % |
| Lowest tier first (elites last, then fewest items) | 1.10 | 65.2 % |
| Random | 1.76 | 56.9 % |
| Worst possible | 4.83 | – |

On average 57 % of a board's removals cost nothing, so "free" picks are common.

**Reading.** The surrogate ties the trivial rule: it learned "low tier = expendable" and little more. Both are far from
the best pick (1.1 vs −0.3 leaks), so there is real room, but these features (sums over the board, no tiles, no
Alliance recount) can't see what makes one low-tier Operator matter, such as its tile, its range or the Alliance it
completes. As it stands, the surrogate would not improve a bot's bench decision.

**Next, if this line continues:** per-Operator features (its tile, its Alliance's count with and without it, its range
over the route), trained directly on these drop-one rows (a ranking target, not leaks); the 16,486 rows are a ready
held-out set. Without new features, this line stops here.
