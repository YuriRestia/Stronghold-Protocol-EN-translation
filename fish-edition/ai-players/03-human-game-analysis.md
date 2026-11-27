# More human game analysis

The iteration will consist of making a hypothesis (or multiple hypotheses) and testing them programmatically.

For example, if the AI player is given the human's final boss board, can the AI player win? Does the human's final board win against all bosses, if you switch the boss?

Other areas can also be investigated. For example, does the AI player make use of all gameplay features? If it doesn't use shop freeze, can a better bot be made using shop freeze? If the AI player does not react to lobby rules selection, can a better bot be made that has conditionals on lobby rules?

## Response (Claude, 2026-10-27)

**On the assumption:** half right. Tests do depend on the bot, but they don't freeze it.

- 19 test files import `server/match/bot.js`, and the match goldens record bot games.
- Goldens can be regenerated, though: #67 did it here, and sganggs's 0.3.2 changed `legacy` itself (leveling,
  core-bond commitment, a full-bench-swap fix) and updated its goldens.
- The better reasons to keep the current bot and add another beside it:
  - it stays the yardstick, so the goldens keep catching simulation regressions;
  - a recorded match replays with the bot it was played with;
  - `bot.js` is a 1,900-line upstream file, and changing our copy would conflict on every sync.

So the conclusion holds.

**Upstream already has the framework** (sganggs 0.3.2 / 0.3.3; not in our 0.3.1 main yet):

- **A bot registry (sganggs #673):** `docs/BOT_STRATEGIES.md`, `server/match/botStrategies.js`. The original bot is
  `legacy`, the default.
  - A new entry is made with `defineBotStrategy` and overrides only the hooks it wants: band pick, card pick, prep,
    bounty estimate. The rest are legacy's, so goldens don't move.
  - `SP_BOT_STRATEGY` picks one entry for the whole match. `ioleta` and `adaptive` (sganggs #742) are the first opt-in
    entries.
- **RFC sganggs #816:** one profile per bot seat, with separate slots for the band draft, the economy and placement,
  overridable per band. Close to the layered idea above. Its first step, an entry per seat
  (`SP_BOT_STRATEGY_SEATS`), is sganggs PR #890 (opened 2026-10-26).

**Suggested order:**

1. Sync sganggs 0.3.3 (directly; Yuri hasn't). It's large: 267 commits, 548 files since 0.3.1.
2. Build the new bot as a registry entry: the per-seat choice, the replay rules and botbench support come with it.
   Leave `legacy` alone.
3. **Evolution:** legacy's tunables are plain data already: `LAYOUT_PARAMS`, `REHEARSAL_VARIANTS`, `LEVEL_TARGET`,
   the purchase weights. A bot that takes them as parameters is ready for a background search.
4. **Mind the noise.** At 40 seeds, ±5 points is noise (the SPA-CC sweep above). A search needs:
   - many seeds per candidate;
   - held-back seeds for the final comparison, against overfitting;
   - a fitness score over several modes and difficulties.

**On the human-game experiments:**

- **The human's final board against every boss:** feasible now. The records keep each battle's BattleSpec, and
  `tools/records.mjs --verify` already replays them, so it's that replay with the boss swapped.
- **The bot continuing from a human's board:** needs a way to start a match mid-way. More work.
- **Shop freeze:** the bot already uses it (`maybeFreeze`: it freezes when it can't afford the third copy of a pair).
- **Lobby rules:** a real gap. The bot reacts to none of them.

## Standard terms for the new bot (agreed 2026-10-27)

Upstream's "strategy" means a whole bot (`SP_BOT_STRATEGY=legacy`, `defineBotStrategy`), so we don't use the word for
the parts.

| Term               | Meaning                                                                              | Upstream                                                             |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| **profile**        | What one bot seat runs: an ordered list of tactics, with their parameters            | RFC sganggs #816's "profile"; run by registering it as a strategy id |
| **tactic**         | One item of a profile. Asked at a decision point, it returns an action or **passes** | —                                                                    |
| **decision point** | Where the game asks the bot: band pick, card pick, each prep step, bounty choice     | the registry's hooks (`pickBand`, `pickCard`, `prepBegin`, …)        |
| **action**         | One validated game action: buy, sell, merge, level, freeze, place, ready, …          | the game's own                                                       |
| **legacy**         | The original bot, unchanged                                                          | same                                                                 |

Rules:

- At each decision point the tactics are asked in order. The first that returns an action wins.
- After an action, the next decision starts again from the top. There's a cap on actions per prep, so a looping
  tactic can't stall the round.
- If every tactic passes during prep, the bot readies. The band and card picks can't pass: they take the game's
  timeout default.
- At first, legacy is one tactic at the bottom of every profile, because its prep is monolithic. A starting profile is
  [new tactics…, legacy] and plays like legacy until tactics above it take decisions. Splitting legacy into smaller
  tactics can come later, one decision at a time.

## Evolution (agreed 2026-10-27)

A candidate is a profile. What mutates:

- which tactics are in it (add, remove; the same tactic may appear twice with different parameters);
- their order (move), since in a priority list order is behaviour;
- each tactic's parameters. Every tactic declares its parameters (integer, decimal or choice; bounds; default), and
  mutation stays inside them.

Rules:

- legacy stays fixed at the bottom, so every candidate is a complete player.
- A length cap or a small fitness cost per tactic, against bloat.
- Crossover is optional. If added: merge two parents' tactics in order, each keeping its parameters.

What a run fixes, so it can be repeated: the tactic code, the training seeds and the held-back seeds, and the fitness
(which modes and difficulties, how win rate and LP weigh). Its result is a profile file anyone can play or re-score.

## Hypothesis tests: human Final Assault boards (2026-11-01)

Fish's questions (2026-11-01): does a human's final board beat every boss, and can the AI win from a human's
final board? Plus a third test that closes the loop. All on `mini/0.3.1-4` (03a9f044), solo Standard (FUNNY), whose
final boss comes at round 9.

**Method.**

- The records keep each Final Assault's BattleSpec, and a solo one replays exactly (same digest).
- To face another boss, the wave (template, routes, overrides) is rebuilt with `waves.js buildBossWave`, and the pool
  with `finalAssault.js bossPoolHp`. Rebuilding the recorded boss this way gives the recorded template, routes and pool.
- **Won** means the pool emptied before the LP lost reached the LP the player brought in. LP lost counts leaks at the
  enemy's LP cost, leaders' LP effects, and the overtime drain, which for a solo team starts at the 120 s countdown.
- **Validated:** on 160 bot matches, this standalone verdict for the boss the match drew agrees with the match's own
  result on 160 of 160.
- **Not covered:** co-op Final Assaults, whose fields share one pool. The one human Perilous win had cheats (Tier
  Start, Booster Pack) that change the random draws, so its seed doesn't rebuild the match for H1.

|                                                                                                   | boards                                          | bosses beaten                                       | notes                                                           |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------- |
| **H2:** the human's board, as placed, vs all 7 bosses                                             | 5 human Standard wins (+1 Perilous with cheats) | **7 of 7, every board**, 0 LP lost                  | all well inside the countdown                                   |
| **H1:** the bot places the human's units (same operators, elites, items, loadouts, bonds, layers) | the same 5                                      | **7 of 7, every board**, 0 LP lost                  | fights take a median 1.36× as long (0.82–3.36×)                 |
| **H3:** the bot's own board (its normal prep) vs all 7 bosses                                     | 160 seeds                                       | 52 % on average; 16 of 160 beat all 7; 21 beat none | shop level 4 on 157 of 160 boards; the humans' were all level 5 |

The bot's boards, by boss (all 160 / the 87 whose match was won):

| boss                | 1 胄 | 2 铳 | 3 管 | 4 昆图斯 | 5 卢西恩 | 6 阿利斯泰尔 | 7 萨米的意志 |
| ------------------- | ---- | ---- | ---- | -------- | -------- | ------------ | ------------ |
| all bot boards      | 75 % | 32 % | 74 % | 69 %     | 59 %     | **17 %**     | 36 %         |
| bot boards that won | 87 % | 48 % | 86 % | 84 %     | 78 %     | 30 %         | 48 %         |

**Answers.**

- **Does the human's final board beat every boss? Yes.** Every recorded human Standard board beats all seven, with no
  LP lost. Even among bot boards that won their own match, only 18 % do. Five boards in a row at that rate: p ≈ 2 × 10⁻⁴.
- **Can the AI win from a human's final board? Yes, every time.** On that board, only placement and items are left to
  decide. The bot's placement of the human's units beats every boss too, only more slowly. It is never slow enough to
  reach the drain.
- **So the bot's Standard losses come from the board it builds, not from how it places it.** This agrees with the
  2026-10-22 finding: its level curve is indexed by round, so it meets the round-9 boss at shop level 4. The humans
  were at level 5. Alistair is the clearest case: 17 % of bot boards beat him, every human board does.

**Caveats.**

- 5 human boards, probably from one or two players, and only won matches; Standard only.
- "The bot from the human's board" is tested at the final board. Taking over at an earlier round needs the match
  rebuilt from the record's actions (see H8 below).
- Escorts don't vary: the faction setup of the match seed fixes them, so each fight is one deterministic run.

**Scripts** (scratch, in `untracked/hypotheses/`; offered as `tools/` if wanted):

- `h2-boss-swap.mjs <repo> <records…>`;
- `h1-bot-places-human-units.mjs <repo> <records…>`;
- `h3-bot-boards.mjs <repo> FUNNY 1 160`, ~1.5 min on 4 processes;
- with their results as `.jsonl`.

### More hypotheses worth testing

Cheapest first; the first three reuse the scripts above.

- **H4: Does the bossRound-scaled level curve close the gap?** Re-run H3 with the scratch `LEVEL_TARGET` change of
  2026-10-22. Expect level-5 boards and a higher all-7 rate. Bots only; it would be the evidence for that PR, here or
  for sganggs.
- **H5: How far up does a Standard-winning board carry?** The human boards against Perilous, Dire and Ultimate's Final
  Assault: the same boss, with that difficulty's pool and escorts. It says how much stronger a board must be per
  difficulty.
- **H6: Which SPA-CC tags would a winning human board still beat?** Each tag's Final Assault effect on the human boards:
  Activation (pool +50/150/400 %), Elements (leader DR), Originium Zone, Lockout. It measures tag cost on human play
  instead of the tag-blind bot, and feeds the clears tracking issue.
- **H7: Does the bot use the features humans use?** From the records: humans' refreshes, levels, freezes, sells and
  merges per round, against the bot's on the same seeds (botbench). The 2026-10-22 table did this for levels and tiers
  only.
- **H8: Can the bot take over mid-match from a human?** Rebuild a recorded match from its seed and actions up to round
  k, then hand the seat to the bot (autoplay). If the rebuild is exact, this tests the bot's play from human
  positions. Unknown whether the recorded actions rebuild the match exactly. Worth one try, since it would also
  verify the records.
- **H9: Is the bot's random band the problem?** Humans choose their band, the bot picks at random. Run botbench by
  band, and compare with the bands humans won with.
- **H10: Do bots benefit by switching bands?** Humans commit late, or are able to change strategy on the fly. Is committing to a band hurting the bots? Does continuing the match from round 7 with each possible new band choice reveal a different band is more winning?
- **H11: Are any human games "almost" won?** Sometimes we blame our teammates. Is the best board x4 enough to win the matches when the original match did not win?
- **H12: Who does the damage in the final round?** Is the distribution roughly even across operators, or does one DPS operator stand out? This influences whether bots should go for a more rounded playstyle, or focus on getting one operator as buffed as possible.

## Hypothesis tests, continued: H4–H9 and H12 (2026-11-01)

Same base (`mini/0.3.1-4`, solo Standard unless stated), same win test as H1–H3. H10 and H11 are not run yet.

### First, a correction to H3

H3 kept each bot board where the bot had placed it, i.e. placed for the boss its match drew. Against another boss that
placement can be useless (one board dealt Alistair no damage at all). So H3 understates the bot. **H3b** fixes it: for
each boss, the bot places its own units again with `arrange` against that boss's wave (`m.bossWaves` swapped,
`m._botPath` reset), as it would in a match.

|                                        | mean bosses beaten | beat all 7 | 1 胄 | 2 铳 | 3 管 | 4 昆图斯 | 5 卢西恩 | 6 阿利斯泰尔 | 7 萨米的意志 |
| -------------------------------------- | ------------------ | ---------- | ---- | ---- | ---- | -------- | -------- | ------------ | ------------ |
| H3 (fixed placement), 160 bot boards   | 52 %               | 16         | 75 % | 32 % | 74 % | 69 %     | 59 %     | 17 %         | 36 %         |
| **H3b** (re-placed per boss)           | 59 %               | 23 (14 %)  | 88 % | 33 % | 78 % | 87 %     | 64 %     | 28 %         | 36 %         |
| H3b, the 87 boards whose match was won | —                  | 23 (26 %)  |      |      |      |          |          |              |              |
| the 5 human boards, same treatment     | 100 %              | 5 of 5     |      |      |      |          |          |              |              |

The H1–H3 answers stand, at a smaller margin: five human boards in a row at 26 % is p ≈ 10⁻³.

### H4: does the bossRound-scaled level curve close the gap? Partly.

The scratch change (`LEVEL_TARGET` indexed by `round × 14 / bossRound`), 160 seeds:

|                  | match wins     | shop level at the boss | bosses beaten (H3b) | beat all 7 | Alistair |
| ---------------- | -------------- | ---------------------- | ------------------- | ---------- | -------- |
| current curve    | 87 (54 %)      | 4 on 157 boards        | 59 %                | 23         | 28 %     |
| **scaled curve** | **108 (68 %)** | 6 on all 160           | 62 %                | 23         | 35 %     |

Levelling wins matches, mostly against the easier bosses. Level 6 boards still beat all seven only as often as level 4
boards did. So level alone is not the gap.

### Why the human boards are stronger

Boss damage per second (median over boards: the 5 human boards as placed, the 160 bot boards re-placed per boss):

|       | 1    | 2    | 3    | 4    | 5    | 6    | 7    |
| ----- | ---- | ---- | ---- | ---- | ---- | ---- | ---- |
| human | 4231 | 1067 | 3191 | 4753 | 1873 | 2040 | 1982 |
| bot   | 1473 | 605  | 1381 | 1892 | 753  | 480  | 714  |

2–3× higher, and higher than the bot boards that beat that boss. What it is **not**:

- **Placement:** H1, the bot placing the human units, beats everything.
- **Skills and modules:** every human operator was on its default skill and module, which is what the bot plays.
  Resetting them changes nothing.
- **Training:** both sides play potential 6 / 练度 3.
- **Board size, bonds, layers, elites, items:** all eight units on both sides; the bot has as many active bonds, more
  layers and more elites. With bonds switched off on both sides, the human boards still deal ≈ 3.6× the bot's damage.
- **Concentration (H12, below):** both sides get about 40–45 % of the leader damage from one operator.

What it **is**: the operators. Four of the five human boards field two tier-6 operators; at shop level 4 the bot fields
none (156 of 160 boards).

- Removing the two tier-6 operators from a human board leaves 36 %, 52 % and 62 % of its boss damage on three of the
  four boards (88 % on the fourth), and 4 of their 28 fights are lost.
- With the scaled curve the bot does buy them, and its results follow the count:

  | tier-6 operators on the bot board | boards | mean bosses beaten | beat all 7 | Alistair |
  | --------------------------------- | ------ | ------------------ | ---------- | -------- |
  | 0                                 | 50     | 3.5                | 5          | 28 %     |
  | 1                                 | 70     | 4.5                | 11         | 31 %     |
  | 2                                 | 33     | 5.2                | 5          | 45 %     |
  | 3                                 | 7      | 5.9                | 2          | 71 %     |

- But a bot board with two tier-6 operators (tier sum 27.8, the humans' range) beats all seven 5 times in 33; the
  humans' 5 in 5. The rest is which operators. Two human boards carry 自选 (DIY) picks (丰川祥子 ×2, 予愿安洁莉娜),
  and **the bot never takes a DIY pick** (0 of 160 boards). Their carries are named in H12.

### H5: how far up does a Standard-winning board carry?

The five human boards, unchanged and with the LP they had, against each difficulty's Final Assault (its round, enemy
scaling, escorts and pool; one escort draw per boss):

|          | pool (boss 1) | won      | how they lose                                            |
| -------- | ------------- | -------- | -------------------------------------------------------- |
| Standard | 247,500       | 35 of 35 |                                                          |
| Perilous | 675,000       | 28 of 35 | they clear the boss but too late: the drain takes the LP |
| Dire     | 1,800,000     | 5 of 35  | the same (median 483 s); only fe12 wins any (5 of 7)     |
| Ultimate | 3,600,000     | 0 of 35  | half never clear                                         |

A round-9 Standard board is roughly Perilous-ready. The higher difficulties have five more rounds to build in, so this
measures the pool, not what those players would have fielded there.

### H6: which SPA-CC boss tags would the human boards still beat?

Each tag alone, on the five Standard boards. The pool tags (Originium Zone, Lockout) run against a real
`SharedBossPool`, with the lockout released after `CC.lockout.seconds` as the match does; without it the standalone
fight silently ignores them.

| tag                           | won          | per board | effect                                                            |
| ----------------------------- | ------------ | --------- | ----------------------------------------------------------------- |
| Activation 1 (ccBoss 1)       | 35 of 35     |           |                                                                   |
| Activation 2                  | 28 of 35     | 7,4,6,4,7 |                                                                   |
| Activation 3                  | 10 of 35     | 1,1,1,1,6 | only fe12 survives it                                             |
| Elements 1 (ccLeaderDr 1)     | 35 of 35     |           | fights ≈ 1.4× longer                                              |
| Elements 2                    | 25 of 35     | 7,6,5,5,2 | two fights reach the 3600 s cap                                   |
| Originium Zone, Arts          | 33 of 35     | 7,6,7,6,7 | total fight time ×3.1                                             |
| Originium Zone, Physical      | 35 of 35     |           | no effect: these boards deal little Physical damage (not checked) |
| Lockout 1 / 2 / 3             | 35 / 35 / 34 |           | median fight 58 → 81 / 111 / 133 s                                |
| OZ Arts + OZ Phys + Lockout 3 | 31 of 35     | 7,6,7,4,7 |                                                                   |

For the clears tracking issue: on these boards the expensive tags are Activation 2–3 and Elements 2; the others cost
time, rarely the fight.

### H7: does the bot use the shop like humans do? No: it buys where they level.

Per round, at the battle's start (`contentInfo.roundStats`): 5 human Standard wins and 60 bot matches (the 33 bot wins
look the same).

| round | shop level, human / bot | buys, human / bot | refreshes, human / bot | sells, human / bot |
| ----- | ----------------------- | ----------------- | ---------------------- | ------------------ |
| 1     | 2.2 / 1                 | 1.4 / 2.0         | 0 / 0                  | 0 / 0              |
| 3     | 3.6 / 3                 | 1.8 / 2.5         | 0.2 / 0                | 0 / 0              |
| 5     | 4.6 / 3                 | 2.2 / 3.0         | 0.4 / 1.0              | 0 / 0.1            |
| 7     | 5 / 4                   | 2.8 / 3.6         | 2.6 / 2.4              | 0 / 0.9            |
| 9     | 5 / 4                   | 3.8 / 4.1         | 5.0 / 4.9              | 2.6 / 1.2          |

The funds spent are the same. Humans put them into levels from round 1 and buy fewer, better units; the bot fills
the board first and reaches level 4 only at round 6. Freezes and merges aren't in the records.

### H8: mid-match takeover: not possible from the records

The records keep the battle specs and a per-round summary, not each shop action, so a match can't be rebuilt to round
k. It would need an action log in `records.js` first.

### H9: is the bot's band the problem? No: the boss is.

botbench, 320 solo Standard matches (current bot): 182 won (57 %); every match reaches the Final Assault, so every
loss is there.

- **By boss drawn:** 1 胄 46/50, 4 昆图斯 31/37, 3 管 28/38, 5 卢西恩 47/71, 2 铳 17/54, 7 萨米的意志 6/29,
  **6 阿利斯泰尔 7/41**.
- **By band:** the weighted pick gives 歌利亚 86 of 320 (65 % won). Most other bands have 5–18 matches, between
  20 % and 87 %, which is within noise at those counts. Nothing stands out the way the boss does. A per-band
  botbench (`--band`) would settle it.

### H12: who does the damage in the final round? One carry, on both sides.

Each operator's share of the leader damage, every board against every boss (5 human boards and 20 bot boards, × 7):

|       | top operator (median) | top two | operators dealing ≥ 10 % |
| ----- | --------------------- | ------- | ------------------------ |
| human | 44 %                  | 66 %    | 3                        |
| bot   | 41 %                  | 64 %    | 3                        |

The human carries: 烛煌 (≈ 50 %), a 2-copy DIY 丰川祥子 (45–70 %), 0ed2's summon "炎佑" (38–73 %); 01c8 and 852a are
spread over two or three (予愿安洁莉娜 / 伺夜, 圣聆初雪 / 耶拉). So humans aren't more "rounded": the shape is the
same, and their carry is stronger. For a bot this points at getting a strong carry (tier 6 or a DIY pick) over
spreading the funds.

### What this says for the bot

In order of effect, all in the board the bot builds:

1. **Level earlier** (H4, H7): +14 points of match wins on Standard by itself.
2. **Take tier-6 operators and DIY picks** (the tier-6 table; DIY never used).
3. **Pick the carry** among them: same concentration as humans, weaker units.

Placement, skills and bands are not where it loses.

**Scripts** (in `untracked/hypotheses/`, with their `.jsonl` results): `h3b-bot-replaces-per-boss.mjs` (H3b; with the
scratch `bot.js` gate and `H4_SCALE=1` for H4), `default-skills.mjs`, `without-tier6.mjs`,
`h5-h6-other-mode-and-tags.mjs <repo> <modeId> <records…>` (`RULES='{"ccBoss":2}'` for H6), `h7-shop-actions.mjs`,
`h12-damage-shares.mjs`, and `h9-botbench-solo-funny-320.json`.

