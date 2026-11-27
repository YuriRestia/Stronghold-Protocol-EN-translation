# Predictive models and carry rank

## Predictive modeling tests

One of the simplest predictive models is a linear model: add the score of each operator, and compare it to the score of the boss. If the operator sum score is greater, we predict a win. Scores of operators and bosses can be trained. This can be considered the most degenerate form of a neural network, with no intermediate layers.

We can generate test cases by running matches, and further generate more synthetic test cases by running just the boss round with "mutated boards" (replace one operator with a random different operator and let the bot re-position the board).

We can also do the same with human boards, though we have less data there, and it's probably worth separating human boards and their mutants from the fully synthetic test data.

Then we can run different configurations of the model, for example:

- Predict based on only operator tiers (mask all other information)
- Predict based on only alliance activations and stack counts (mask all other information)
- Predict based on each operator, but do not differentiate elite 1 and elite 2
- Predict baesd on only Strategy (Commander) chosen (ex. Pith. I will call them Commanders to avoid confusion)

This will tell us:

- What information is useful
- If any particularly standout good options exist (ex. best boss DPS carry) or terrible options exist

We do have to be careful in some cases ex. Executor the Ex Foedore (aka Fedex) may predict a win, not because he's good against the boss, but because a run that includes him has probably generated a lot of Foresight stacks and therefore Funds. Results should be recorded, interpreted, and scrutinized. Further hypotheses may be formed and tested.

## Carry rank test

1. Start with a board that originally wins.
2. Pick out the operator that deals the most damage.
3. Replace then with XXX operator. (keeping the equipments)
4. Leave as is OR allow bot to re-place the board.
5. Run the match with a flag that allows the round to run until timeout, and the boss never dies. It is possible to deal more than 100% damage in the possible time.

This should give you a N x M x 2 array of matches, where we can then sum, leaving the [operator] axis. We can try every tier 6 operator, as well as all custom operators. This should identify the best boss carry operators, with little need for further interpretation.

Ensure the data is stored, so we don't need to run the full bench again to re-analyze.

It would also be good to have some way to monitor the progress, so we know if the expected time is more like 3 minutes or 3 days.

I'm very curious to see the top 10, and what makes them stand out.

## Predictive modeling and carry rank: results so far (2026-11-05)

Both run on `main`'s code (4a19df6b: sganggs 0.3.3 and `dev`). The data is stored, so it can be re-analysed without
running the bench again: `untracked/predict/` (`boards-*.jsonl`) and `untracked/carry-rank/` (`keep-*.jsonl`,
`replace-*.jsonl`). Progress shows in the `.err` file of each process, one line per board and boss with its time.

**One way to measure boss damage, used by both:** the boss can't die. Its pool keeps its real max HP, so the effects
that read it stay right, but its HP never goes down. The damage dealt to it by the 120 s countdown is the score, as a %
of the real pool, and it can pass 100 %. Example: one human Ultimate board kills boss_7 (6M HP) in 30 game seconds in
a normal fight, and the record agrees.

### Predictive models

**Data.** 300 solo legacy-bot matches, 150 on Ultimate and 150 on Standard, each with a Strategy drawn at random so
every Commander gets games. For each final board:

- 8 mutants: one random operator swapped for a random different one, at the same elite level, with its items kept;
  the bot re-places the whole board, and the Alliance counts are the new board's;
- every board fights every boss of the round, twice: a normal fight gives win or loss, the unkillable boss gives the
  damage.

That makes 2,079 boards that reached the boss, and 14,553 board × boss samples. Win rate: 38 %.

**Model.** Your linear model: logistic regression with one score per feature, against one learned score per boss (and
mode). Each model sees one kind of feature only. The folds keep a board and its mutants together, so no model is
tested on a near-copy of a board it trained on.

AUC is the chance that the model ranks a random won board above a random lost one: 0.5 is a coin toss, 1 is perfect.
The boss alone already reaches 0.85 over both modes, because Ultimate vs Standard decides most outcomes. So the columns
that matter are the ones within one mode:

| features (+ boss score)   | win AUC within Ultimate | within Standard | damage R² within Ultimate | within Standard |
| ------------------------- | ----------------------- | --------------- | ------------------------- | --------------- |
| boss only                 | 0.52                    | 0.72            | 0.06                      | 0.10            |
| tiers                     | 0.63                    | 0.76            | 0.05                      | 0.14            |
| tiers + elite             | 0.72                    | 0.76            | 0.10                      | 0.14            |
| Alliances (tier + stacks) | 0.64                    | 0.78            | −0.02                     | 0.18            |
| Commander only            | 0.66                    | 0.72            | 0.09                      | 0.06            |
| operators, elite ignored  | 0.71                    | 0.77            | 0.10                      | 0.16            |
| operators with elite      | **0.76**                | 0.78            | −0.03                     | 0.17            |
| items                     | 0.46                    | 0.72            | 0.03                      | 0.06            |
| all of the above          | 0.63                    | **0.80**        | −0.02                     | **0.24**        |

**What it shows.**

- **On Ultimate, elite status carries most of the information.** Counting tiers with elite (6 numbers) predicts almost
  as well as knowing every operator (0.72 against 0.76). Without elite, tiers alone fall to 0.63. The tier-6 elite is
  worth the most: +1.13 log-odds each, against +0.36 for a tier-5 elite. Unpromoted tier 1–3 operators count against.
- **On Standard, everything predicts about equally** (0.76–0.80), and Alliances do best of the single kinds.
- **Items predict nothing**, and the model with every feature overfits on Ultimate: too many features for 150 seeds.
- **Damage is hard to predict linearly** (R² at most 0.24). A sum of operator scores can say who wins; it can't say by
  how much.
- **Mutants help:** on the 231 original boards alone, every model is weaker (within Ultimate 0.48–0.64). A mutant is a
  small controlled experiment: one operator changed, everything else equal.

**Operator scores (operators with elite, at least 30 samples, i.e. about 5 boards).** Top: Lappland the Decadenza (E),
Caper (E), Vina Victoria (E), Thorns the Lodestar (E), Meteor (E), Pramanix the Prerita (E), Snow Hunter (E), Reed the
Flame Shadow (E), Exusiai the New Covenant (E), Gavial the Invincible (E). Bottom: Ptilopsis (E), Hoshiguma (E),
Kazemaru, Warfarin (E), Swire (E), Papyrus (E), Grain Buds (E), Specter the Unchained, Bubble (E).

- Healers and defenders score low: they don't win boss fights by themselves, and a board that fields many of them has
  fewer damage dealers.
- **Your Executor the Ex Foedere worry doesn't show here:** his score is negative (−1.09 elite, −0.91 any). On bot
  boards he doesn't stand in for a rich Foresight game. The same caution still applies to every score: they are
  associations on bot boards, not proof that the operator is good.

**Commanders (the bot plays each one without adapting).** Top: Ch'en, Mulberry, Chiave, Qalaiša, Du Yaoye, Goliath.
Bottom: Narantuya, Cannot, Shamare, Touch, Pith, Damazti Cluster, Paganini. Du Yaoye is 5th, ahead of upstream's
`BAND_STRENGTH` rank (25th of 40). That measure is the bot's own Final Assault pool on Ultimate. Here it is the board's
odds against every boss, so the two can differ.

**Alliances.** Second tiers score highest: Kazimierz 2 (+4.3), Yan 2 (+3.3), Laterano 2 (+3.2), Siracusa 2,
Victoria 2, Precision 2; Raid 1 is the best first tier. Investor stacks score low (−2.4). Investor pays in funds during
the game, not in the boss fight, so its stacks only say the board spent its time on economy.

**Not done yet:**

- the human boards, scored separately from the synthetic data (your suggestion);
- a check of the top and bottom operators by hand, e.g. with the carry rank below.

### Carry rank

**Data.**

- **Boards:** the 20 solo human Final Assault boards in the records, each against every boss of its round. The ranking
  uses only the 12 won boards: 5 Standard, 5 Ultimate, 1 Perilous, 1 Dire.
- **Candidates:** 518 in all: every tier-6 operator with each of its skills, and every DIY pick with each skill, in a
  tier-5 and a tier-6 slot.
- **Swap:** each candidate takes the carry's place with the carry's items and elite level (49 of 81 carries were
  elite), at potential 6 and 练度 3.
- **Placement variants:** "leave as is" puts the candidate on the carry's tile and facing, finished. In "the bot re-places
  the board", the bot arranges the whole board again. Both are complete; see "Results, continued" below for the second.

**Score:** the candidate's boss damage relative to the original carry on the same board and boss, as a geometric mean
over the 81 board × boss pairs. Each operator keeps its best skill. The carry itself is left out of its own board's
ranking. Without its carry, a board deals 48 % of its original damage.

**Top 10, leave as is** (each ± about 5 %):

| #   | operator (skill)                      | vs. the original carry |
| --- | ------------------------------------- | ---------------------- |
| 1   | Logos (DIY, tier 6) S2                | 79 %                   |
| 2   | Qiubai S1                             | 76 %                   |
| 3   | Ch'en the Dawnstreak (DIY, tier 6) S3 | 76 %                   |
| 4   | Exusiai the New Covenant S2           | 76 %                   |
| 5   | Goldenglow (DIY, tier 6) S3           | 75 %                   |
| 6   | Lappland the Decadenza S2             | 74 %                   |
| 7   | Togawa Sakiko (DIY, tier 6) S3        | 74 %                   |
| 8   | Reed the Flame Shadow S2              | 74 %                   |
| 9   | Narantuya (DIY, tier 6) S3            | 72 %                   |
| 10  | Astgenne the Lightchaser S3           | 70 %                   |

Next: Clementia, Leizi the Thunderbringer, Eyjafjalla (all DIY), Chongyue (DIY), Rosmontis. Bottom (about 50 %, the
same as having no carry): Shining, Misery, Kal'tsit, the Reserve Operators, Thorns, Stormeye, Weedy.

**By boss, the best stand-in:**

- Ch'en the Dawnstreak against Helm (`boss_1`, 95 %) and Pipe (`boss_3`, 85 %);
- Narantuya and Qiubai against Gunshatter (`boss_2`, 82 %);
- Exusiai the New Covenant against Quintus (`boss_4`, 79 %);
- Qiubai against Lucien (`boss_5`, 78 %) and the Will of Sami (`boss_7`, 87 %);
- Chongyue against Alistair (`boss_6`, 85 %).

**What stands out.**

- **No stand-in reaches the human's own carry.** The best average 76–79 %. The human picked the carry for that
  board: its Alliances, its items, its tile. A swap keeps all three for the carry's sake, not the candidate's.
- **DIY picks are half of the top 15:** Logos, Ch'en the Dawnstreak, Goldenglow, Togawa Sakiko, Narantuya, Clementia,
  Leizi the Thunderbringer, Eyjafjalla. The tier-5 slot is almost as good as the tier-6 one (Logos 76 % against 79 %).
  That fits H12 (two of five human Standard boards carried by DIY picks) and the gap that bot seats field no DIY pick.
- **Your guess about Ch'en the Dawnstreak holds:** 3rd overall, the best stand-in against Helm and Pipe.
- **The top is mostly ranged damage on S2 / S3,** Arts casters among them (Logos, Goldenglow, Eyjafjalla).
- **"The bot re-places the board" agrees:** see "Results, continued" below for the complete run.
- **Caveat:** in "leave as is", the Alliance block stays the original board's, so a candidate gets no credit for an
  Alliance it would add or lose.

## Results, continued (2026-11-07)

Same data and code as above. New files in `untracked/carry-rank/`:

- `copy-{none,bonds,attr,both}.jsonl`: the copy runs;
- `wrap-*.jsonl` and `cmp-wrap.mjs`: the HP-tracking pool;
- `replace-*.jsonl`: the bot re-placement run, now complete.

### Is it the Alliances or the Attribute? Mostly neither: the operator

You suspected that the human carry's Alliances or its Attribute (特质) do the work, since no stand-in reached 100 %.

**Test.** The candidate takes the carry's place, as before, but fights with the carry's Alliance membership, its
Attribute, or both. Setup:

- the 12 won boards, against every boss;
- 35 candidates: the top of the first run plus a low control group;
- scores are against the original carry, and the carry itself is left out.

**Sanity check.** The carry's own operator, swapped out and back in, scores exactly 100 % in all four variants, both
as its exact unit and through the candidate path at default settings.

| What the candidate copies | Average stand-in | Best stand-ins                                                                      | Board × boss pairs at 100 % or more |
| ------------------------- | ---------------- | ----------------------------------------------------------------------------------- | ----------------------------------- |
| nothing                   | 67 %             | Logos 80, Ch'en the Dawnstreak 78, Qiubai 77                                        | 18 %                                |
| Alliances                 | **74 %**         | Togawa Sakiko 100, Logos 92, Exusiai the New Covenant 88, Lappland the Decadenza 88 | 29 %                                |
| Attribute                 | 67 %             | the same as nothing                                                                 | 18 %                                |
| both                      | 74 %             | the same as Alliances                                                               | 28 %                                |

- **The Alliances are worth about 7 points on average,** and up to 12–24 points for the best stand-ins. With them,
  Togawa Sakiko matches the carry and Logos comes close.
- **The Attribute is worth nothing in the boss fight:** "Attribute" is the same as "nothing", and "both" the same as
  "Alliances". In 17 of the 84 board × boss pairs the carry has no Attribute at all; the others act outside
  the boss fight, or don't change its damage.
- **The rest, about a quarter, is the operator itself:** its kit, numbers and range on that tile. The human picks are
  not fragile. The carries are simply the right operator for that board, and they also sit in its Alliances.

### The boss's HP never fell: what that hid (your question about Arcane)

**The problem.** The unkillable pool above kept the boss at 100 % HP, so nothing that reads the boss's HP ever fired:

- Arcane tier 2's ×1.4 against targets under 50 % HP;
- execute effects;
- boss phases.

The new pool lets the HP fall with the damage and wraps it back to full at each "kill". Up to the first kill it is
exactly the real fight. **Time to kill** (game seconds until the first full pool is dealt) is therefore the measure
closest to a real fight; a board that never kills gets its 120 s damage rate instead. Runs: the 12 won boards ×
every boss × 41 candidates, plus Logos S1 and S3.

- **Boss phases were the big error.** Helm (`boss_1`), Alistair (`boss_6`) and the Will of Sami (`boss_7`) get harder
  below an HP mark, for example +100 % DEF and +45 RES at 50 %. The old pool overstated the damage against them by
  ×1.7–2: one Ultimate board scored 5,188 % against `boss_7`, but 2,226 % with the HP falling. The other four bosses
  moved by a few %.
- **Arcane tier 2 is small:** the boards that have it lost less (×0.82) than the others (×0.79), about +4 %.
- **Logos S1's execute never hit a boss:** 0 executes in 84 fights. It needs the target's HP below a multiple of
  Logos's ATK, and a boss's HP is far above that, even when it's nearly dead.
- **The carry ranking barely moves.** Every candidate is compared with the carry on the same board and boss, so most of
  the error cancels:

| Stand-in                         | Old pool | Time to kill |
| -------------------------------- | -------- | ------------ |
| Logos (DIY t6) S2                | 80 %     | 82 %         |
| Ch'en the Dawnstreak (DIY t6) S3 | 78 %     | 81 %         |
| Astgenne the Lightchaser S3      | 72 %     | 79 %         |
| Togawa Sakiko (DIY t6) S3        | 76 %     | 78 %         |
| Qiubai S1                        | 77 %     | 77 %         |
| Exusiai the New Covenant S2      | 78 %     | 77 %         |
| Logos (DIY t6) S1                | 75 %     | 75 %         |
| Chongyue (DIY t6) S3             | 70 %     | 61 %         |

- **Damage numbers across boards or bosses** in this file and in the predictive models' R² are inflated for those three
  bosses. Their win and loss results come from real fights and stand.
- **From now on,** runs use `carry-rank.mjs --pool wrap` and rank by time to kill. The copy runs above still use the
  old pool. A rerun with `--pool wrap` is about 12 min per variant; the conclusions should hold.

### The bot places the same units worse than the human

In "the bot re-places the board", the bot first arranges the human's own board, units unchanged. That board keeps
**70 %** of the human placement's damage (geometric mean of 84 board × boss pairs). So placement alone costs the bot
about 30 %, apart from which operators it picks.

The full re-placement carry rank (186 operators, 518 candidates) agrees with "leave as is":

- **Board without its carry:** 43 % of the original's damage.
- **Top stand-ins:** Tragodia (DIY t5) 68 %, Exusiai the New Covenant 66 %, Reed the Flame Shadow 66 %, Ch'en the
  Dawnstreak (DIY t6) 66 %, Logos (DIY t5) 65 %, Qiubai 64 %, Narantuya (DIY t6) 64 %, Pramanix the Prerita 64 %.
- **Bottom:** Misery and the Reserve Operators, about 32 %.

All of these are against the human-placed original, so the ~70 % placement gap is included.

### Where the placement gap comes from (2026-11-07)

**Test.** `untracked/carry-rank/placement.mjs`, analysed with `analyze-placement.mjs`. Setup:

- **Boards:** the same 12 won human boards. One (fe12) is left out because the bot couldn't be given its DIY pick, which
  leaves 77 board × boss pairs.
- **Re-placement:** the bot re-places each board's own units (`arrange` final, on a replay of the match to its boss
  prep).
- **Pool:** the HP-tracking one, with the human layout as 100 %.

| Layout                                                                     | Damage at 120 s | Kill speed |
| -------------------------------------------------------------------------- | --------------- | ---------- |
| the bot's layout                                                           | 74 %            | 74 %       |
| the bot's layout, with the carry put back on its human tile and facing     | 82 %            | 85 %       |
| the human layout, with the carry moved to the bot's tile and facing for it | 76 %            | 82 %       |
| the bot's tiles, each unit with its human facing                           | 66 %            | 72 %       |
| the human tiles, each unit with the bot's facing                           | **70 %**        | 66 %       |

**Against the boss the human actually placed for** (the recorded one), the bot's layout reaches only **66 %** and beats
the human on 1 board of 11. Against the other bosses it beats the human layout in 19 of 66 pairs: there the human
layout wasn't made for that boss either.

**What the bot does differently**

|                         | Human                            | Bot                                                 |
| ----------------------- | -------------------------------- | --------------------------------------------------- |
| Facing RIGHT            | 83 % of units                    | 56 %                                                |
| Facing DOWN / UP / LEFT | 9 / 3 / 4 %                      | 26 / 12 / 6 %                                       |
| Columns used            | packed into 5–8 (83 of 95 units) | spread out: 15 units on column 3, 37 on columns 8–9 |

**What it means**

- **The bot's facings alone cost 30 %.** Turning the human's own units to the bot's facings, on the human's tiles, drops
  them to 70 %. A tile and its facing go together: the human facings on the bot's tiles are no better (66 %).
- **In 18 of 77 fights the bot's layout leaves the carry with under 10 % of its human damage:** out of reach, or turned
  away from the boss.
  - Exusiai the New Covenant goes from 70 % of the board's damage to 0 (8471, facing DOWN).
  - Degenbrecher goes from 44 % to 2 % (9557).
  - Leizi goes from 17 % to 0 (0ed2, column 9).
- **Two kinds of board:**
  - On some the carry's tile is the whole story: putting Exusiai back brings 8471 from 28 % to 89 %.
  - On others the carry is fine, and the damage is lost by the rest of the board, turned away or parked on column 3:
    0b0f, 9557, 01c8.
- **Caveat:** "RIGHT" is the way to the boss on these stages, so the rule is "face the boss's approach", not a fixed
  direction.
- **Open question:** the bot already rehearses candidate layouts against its planned boss, so either its candidate set
  never contains a packed, boss-facing cluster, or the rehearsal scores it lower. Next is to read `bot.js`'s Final
  Assault candidates (`bossCandidateOpts`, `faDamageLineups`) against these boards.

### Facing everyone RIGHT: tiles first, then facing (2026-11-08)

**Test.** The same script and boards, now with all 12 boards (84 pairs, fe12 included, so the bot and the human-facing
rows differ a little from the table above), and two more layouts: every unit turned RIGHT, on the bot's tiles and on
the human's tiles (`untracked/carry-rank/placement2.jsonl`).

| Layout (84 pairs)                        | Kill speed, geometric mean | Median |
| ---------------------------------------- | -------------------------- | ------ |
| the bot's layout                         | 70 %                       | 69 %   |
| the bot's tiles, all facing RIGHT        | 71 %                       | 73 %   |
| the human tiles, with the bot's facings  | 69 %                       | 88 %   |
| the human tiles, all facing RIGHT        | **97 %**                   | 100 %  |

- **On the bot's tiles, facing doesn't matter:** turning everyone RIGHT gains about 1 point. The bot's tiles are the
  real problem; units on column 3 or 8–9 don't reach the boss whichever way they face.
- **On the human's tiles, "everyone faces RIGHT" is almost as good as the human's own facings** (97 %). The human's
  few non-RIGHT units are worth about 3 %. The bot's facings on those same tiles cost 30 %.
- **So the order for DYYBot is: tiles first (packed into the middle columns), then a plain "face the boss's
  approach".** A cheap, fixed facing rule gives nearly all of the facing value, and needs no rehearsal: it suits bots
  that run in the player's browser.

### Can a search reach the human layout? The ceiling test (2026-11-19)

**Test.** `untracked/boss-board-2026-11/` (`search.mjs`, `analyze.mjs`, `shape.mjs`; run `run-1.sh`). Boards: the 53
solo human boss records without summon tokens (60 of the 78 are won; 25 boards carry tokens and were left out, their
tiles depend on their owner), simulator sp-170 at 81dda9e7f. Each board's own units, only tiles and facings change
(legal tiles from the stage's deploy map; swaps, moves of one unit to a free tile, turns), scored by the real boss
fight (wrap pool, damage at 120 s, `p120`) on the record's boss. Three starts × 400 fights per board: the human layout,
the human tiles all facing RIGHT, and a random legal layout. A search sees one battle seed; every layout is then
re-scored on 4 other seeds. **Base seed 30711621**, validation seeds derived from it. Every fight is a row in
`out-1/rows/<board>.jsonl` (63,398 rows, 37 MB, with the layout, canonical hash, parent hash, move, per-unit damage).

| Start | Start's own damage vs the human layout | Best found vs the human layout (unseen seeds) | Boards with best ≥ 0.95× human | > 1.2× |
|---|---|---|---|---|
| human layout | 1.00 | geomean **1.33**, median 1.14 | 50 / 53 | 25 |
| human tiles, all RIGHT | 0.97 | 1.31, median 1.07 | 51 / 53 | 25 |
| random legal layout | **0.17** | **1.26**, median 1.05 | 43 / 53 | 24 |

- **A plain local search, 400 fights from a random layout, reaches the human layout** (≥ 0.95× on 43 of 53 boards, and
  beats it by > 1.2× on 24). The problem is solvable and cheap; no board's best fell under 0.5×. So the bot's 70 % is
  its candidate layouts, not an unreachable ceiling, and the human layouts aren't optimal either (1.33×).
- **Lost boards:** 9 of the 53 were lost by the human. On 8 the sim says the human layout doesn't kill the pool in
  120 s (`p120` < 100); the search's best does on 3 of them (68 → 105, 93 → 199, 55 → 192), a loss turned into a kill.
  The ninth killed the pool in the sim anyway (the loss came from something this fight doesn't model).
- **What the best layouts look like:** no clean rule in the marginals. Facing RIGHT is 73 % of the humans' units, but
  only 41–55 % in the search's best layouts, and the columns match the humans' (5–8). Treat the facing numbers with
  care: the search accepts equal scores, so a unit whose facing doesn't matter drifts to a random one. A rule has to
  come from per-unit effects (what a move does to the damage), which the rows allow.

**Caveats.** One boss, 120 s damage as the objective (not the win), a fixed set of 53 boards the search was also run on
(its best layouts are searched per board, not a rule that carries to new boards). Not measured here: the bot's own
layout on these 53 boards, and how much win rate the damage is worth (the human winning boards kill the pool in 7–45 s,
so most of the 30 % is margin).

### The bot's layout on the same boards (2026-11-19)

`botlayout.mjs`: bot.js `arrange` final, on a replay of each match to its boss prep, then the same fight and the same
four unseen seeds as the ceiling run (`out-bot/`). 51 of the 53 boards (2 failed to replay).

- **The bot keeps a median 63 % of the human layout's damage** (the old 12-board figure was 70 %); on 9 of 51 boards it
  reaches ≥ 0.95× and on 20 it keeps under half. The search's best layout is a median **1.9×** the bot's.
- **Kills, not just damage:** on 5 boards the human layout kills the pool in 120 s and the bot's doesn't
  (29b8: 163 → 65, 3af6: 169 → 65, 564c: 232 → 87, 725b: 948 → 88, a4c3: 149 → 84). One board the other way (7d5c,
  55 → 123). So roughly one boss board in ten is a kill the bot's placement loses.
- Where the human layout fails too (8 boards under 100), the bot is worse on 7 of them; the search kills on 3.

**Next.** (2) Per-unit effects from the rows (which move helped, by unit type and tile class) and a layout generator
with a few parameters, scored on boards the search hasn't seen. (3) The win-rate check: put the better layout into bot
matches that reach the Final Assault.

### What this says for DYYBot

- **Placement is the first lever:** worth ~30 %, about as much as the difference between the best stand-in and the carry.
  It is mostly the tiles: pack the damage dealers into the middle columns, then face them all the boss's approach,
  which is nearly as good as the human's own facings (see above).
- **Then buy for the Alliances,** not for a named operator. The Alliances turn a good operator into a carry-level one,
  and the Attribute adds nothing in the boss fight.
- **The carry pool is small and known:** Logos, Ch'en the Dawnstreak, Togawa Sakiko and Goldenglow (DIY picks), plus
  Exusiai the New Covenant, Qiubai and Lappland the Decadenza.

### Each SPA-CC tag version on 4-bot Ultimate (#31): results (2026-11-08)

**Setup:**
- 4 legacy bots on Ultimate, with botbench `--rules` fixed (#126).
- Each of the 41 tag versions alone, on the same 80 seeds as the baseline, paired by seed.
- The first run (2026-11-05 → 07) was invalid: before the fix, every tag played exactly like the baseline.
- Files: `untracked/tag-sweep/`. The full table is `table-2026-11-08.md` (`analyze-sweep.mjs`).

**Baseline:** 37 of 80 wins (46 %), 13.2 rounds passed.

**Caveat first:** the bot doesn't know the tags exist. This is what a tag costs a player who doesn't adapt, and that
player is the legacy bot.

| Group | Tag versions (wins of 80; change in points) |
| --- | --- |
| **Ends every win** | Lockout 1, 2 and 3 (0; −46), Activation 3 (0; −46), Elements 2 (2; −44) |
| **Costs 30 points or more** | Patriot 1–3 (10 / 5 / 4), Activation 2 (7), Famiglia: Seasonal 2–3 (7 / 6), Suffocation 3 (7) |
| **Costs 15–26 points** | Famiglia: Unending 2–3, Delegation 1–3, Suffocation 2, Elements 1, Intern, Activation 1 |
| **Costs about 10** | Suffocation 1 (−13), Last Line of Defense (−10, p 0.10), Junk 1–2, Famiglia: Cleaner 1, Vengeance 3 |
| **About free (within ±5, not significant)** | Investor 1–2, Barge 1–2, Foresight, Swift, Strategy 1–2, Originium Zone Arts and Physical, Deep Infiltration, Low Efficiency, Vengeance 1–2 |

All rows down to Suffocation 1 have p < 0.05 (exact sign test on the seeds that changed outcome).

**What it shows**

- **The bots' Final Assault wins are all narrow.**
  - Lockout 1 makes the boss invulnerable for 10 s each time it loses 68 % of its HP. Activation 3 gives it +400 %
    HP.
  - Under either one, the 80 matches play exactly like the baseline up to round 13, and every one of the 37 wins then
    becomes a loss at the boss.
  - So any boss-side tag works like a threshold for the bot. These rows say more about the bot's margin than about the
    tag, and a human board with more damage (`untracked/carry-rank/`) would lose much less to them.
- **The same Risk buys very different difficulty.** At Risk 1:
  - Lockout 1: −46;
  - Patriot 1: −34;
  - Elements 1 and Delegation 1: −19;
  - Intern and Activation 1: −16;
  - Investor 1, Swift, Strategy 1, Foresight, Barge 1, both Originium Zones, Deep Infiltration, Low Efficiency and
    Vengeance 1: 0 ± 5.
  
  For the bot, half of the Risk-1 tags are free points.
- **"Free" can mean two things:**
  - Swift, Deep Infiltration and Vengeance 1 change most of the bots' matches (0–7 of the 37 won seeds play
    identically), but not their outcome.
  - Investor 1 and Originium Zone: Arts barely touch them (32 and 30 of 37 identical): what they change, the bot
    doesn't use.
- **Levels mostly scale as expected,** each level costing more. The exceptions are Lockout, whose level 1 already ends
  every win, and Investor and Barge, free at every level.

**For the final SPA-CC balance update** (Fish, 2026-11-07; nothing changes piecemeal):

- **Candidates for more Risk,** or a weaker level 1: Lockout, Patriot, Elements and Delegation. Their level 1 costs
  the bot as much as other tags' level 3.
- **Candidates for less Risk:** Investor, Barge, Foresight, Swift, Strategy 1, Originium Zone, Deep Infiltration, Low
  Efficiency and Vengeance 1–2. At least for a non-adapting player, they're free.
- **Check against humans** before changing anything:
  - the boss-side tags measure the bot's narrow margin;
  - a human adapts to economy tags such as Investor (banking).
  
  The match records with tags (#32) and the pro player's feedback are the evidence for that.

Should do a small run first, as a sanity check and to prevent similar bugs from silently ruining a multiple-hour long run.

(Claude: agreed, and done from now on, together with a check that the treatment changes anything at all. Since
2026-11-08 the sweep also runs in 10-seed chunks that each save as they finish.)
