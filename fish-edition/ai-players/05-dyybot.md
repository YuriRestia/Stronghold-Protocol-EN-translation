# DYYBot

This is my first attempt writing a list of tactics that result in a very strong bot, based on my own human games. It includes general strategies, and optimizations for playing Du Yaoye.

## General insights

According to my mentor, Du Yaoye is actually stronger when Yan is banned, as all the remaining Yan operators must have at least 2 Alliances and are therefore generally better quality.

We want to speed-level to barge level 5, which should happen around round 7. Typically we level on rounds 2, 4, 5, 7.

Most of our boss DPS will come from one operator. Therefore we plan around having one DPS operator. Dusk is very strong, so she's fine as a fallback option that we can usually get thanks to Du Yaoye. If possible, certain operators given Yan membership with Damazti Isomorph will be significantly stronger than Dusk. Therefore we want to pick up one carry operator and plan around that carry operator for the boss.

Chen the Dawnstreak might be a particularly good carry, though I haven't tested thoroughly. While putting her in tier 6 would dilute the pool and therefore make it harder to get Muelsyse, she has Yan membership herself already.

Adding one operator to Yan is relatively cheap; the second Yan blade will merge into the first one, so you won't get to Isomorph a second Yan operator until the third Yan blade, which most games don't have good enough RNG to hit.

Yan generally prefers building Investor rather than Foresight or Marvel, but it's good to pick up Foresight or Marvel along the way if it's offered.

Items that let us duplicate Muelsyse or upgrade Muelsyse (and therefore print more Damazti Isomorph) will be on our shopping list. Durable, Raid, Arcane, Swift, and Precision are particularly good for adding a member via Damazti Isomorph, as our team is already capable of getting one member normally.

We definitely want one healer for the boss. 0 healing is very bad. It's perfectly acceptable to Isomorph the healer into Yan if we're already using a Yan carry operator.

We want to hit 6 Yan members if possible, as Gunshatterer with elemental shield can really screw over a team that has no elemental damage. The burn increasing arts damage somewhat and letting Blaze alter deal true damage is nice, but the countermeasure against Gunshatterer is the real reason we always want to have a source of elemental damage.

For DYY, using the last 1 Funds to refresh the shop to get a Yan operator and then freezing, is generally better than buying a 1 cost equipment.

Getting duplicates of Yan operators (particularly Swire/Swire Alter) is more consistent than getting duplicates of other operators, even vs Kazemaru, and even when the pool is already somewhat depleted by ourselves. This can probably be verified with math if it's really true.

## State and shopping list

While tactics can be refactored to all be stateless, it's easier to initially state related tactics as sharing a shopping list.

In particular, our shopping list might include:

- One carry operator (as in, after we pick up any carry operator, this slot is filled, but we don't commit until we know who it will be)
- One healer
- 5 other Yan operators (again, slots, that we don't fill until we know who it is)
- Muelsyse/Damazti Isomorph
- Yan item
- Up to 5 more Isomorph-compatible items (but not the ones for Alliances that are infeasible. if the Alliance needs N members and there are at least N-1 members who are also Yan members, then it is feasible with Isomorph)

Muelsyse cloning items are also indirectly on the shopping list. Sometimes we get these before we get Muelsyse.

## Variable valuation

I realize I often implicitly weigh the worth of an action rather than always taking it or not taking it. For example, Arcane Arts Circle (to give membership into Arcane) might be taken when I already have 1 Arcane, but it might be not taken when I already have 3 Arcane, or if it's earlier game and I have 0 Arcane. I'm not really sure what the rules would be in boolean predicate logic, but it might actually be easier to construct this system by having the bot assign a valuation to various items, that can change based on the current state. This lets us reason with numbers, and the bot can decide if an item is not worth it.

## Tactics that are likely to be consistent

- Equip custom operators: Chen the Dawnstreak and Shu on tier 5, nothing on tier 6
- Round 1: Buy 2 operators (buy until out of funds)
- - This will probably be replaced by a more general set of tactics to cover buying operators on all rounds.
- Round 2 or later AND Can upgrade barge to level 2/3/4/5: Upgrade barge
- Foresight not active AND unowned Foresight operator in shop: Buy that operator
- - Same for Marvel and Investor
- (1 Funds left OR 5 or more Funds left) AND no Yan operator in shop AND shop item is not needed AND used less than 2 refreshes this round: Refresh
- Shopping list operator in shop AND can buy it by selling operators: Sell operators to buy shopping list operator
- - Unneeded operators (safe to sell) determination: Below tier 6 AND not currently on board AND not unpromoted Yan operator AND not required to keep Foresight/Marvel/Investor active
- 0 Funds left AND (Yan operator in shop OR shop item is needed): Freeze
- Can upgrade barge to level 6 AND Muelsyse in inventory AND less than 6 Damazti Isomorph owned in total AND (cloning item in inventory OR cloning item in shop): Upgrade barge
- Can clone Muelsyse AND less than 6 Damazti Isomorph owned in total: Clone Muelsyse
- Muelsyse in inventory and 6 or more Damazti Isomorph owned in total: Sell Muelsyse

You should test mutants of these! Maybe I am wrong and these are not optimal.

## Process

1. Draft the list of tactics (pseudocode is acceptable since some variables like the shopping list are not entirely well defined). Compare to human games, especially winning human games. If humans are behaving in a way that none of the tactics cover, adjust the tactics or add a new tactic, and repeat the review process. Aim to be able to explain 90% of human behaviour. Humans do not always play consistently, so some tactics may not apply to some games, and that's okay.
2. Attempt to come up with formal models for the "shopping list" and "variable valuation", which are the two big unknowns right now. Does the shopping list behave like A or B or C? For variable valuation, can we attempt training a linear estimator that predicts human actions among a limited set? Is the limited estimator accurate enough, or do we need something hand-tuned or a neural network? If further fuzzy functions were used in step 1, attempt to define them as well.
3. Draft the real list of tactics. It can include conflicting tactics.
4. Identify parameterizable numbers/choices, and parameterize them.
5. Run evolutionary algorithm for solo matches, with all existing tactics and all new tactics available, and starter bots including existing reference bots and new bots. Your budget is around 3 hours of background execution at max threads. We expect the winner is using at least some of the new tactics, otherwise lesson learned.

## Our profiles on the new bot: is the research redundant? (2026-11-05)

`main` now has upstream's bot work from 0.3.2 to `dev` (#108), which made `legacy` much stronger. So the question: do our profiles still improve on it?

**Method.**

- `botbench` on `main`'s code (mini/0.3.1-4 with #119), the three bots on the same seeds: solo seeds 1–160, co-op seeds 1–80.
- "Flips" count seeds won by the profile and lost by legacy (+), and the other way round (−).
- Boss damage is the leader damage per match, paired by seed, relative to legacy, ± one standard error.

|                      | legacy wins     | `fish-level`                 | `fish-tier6`                  |
| -------------------- | --------------- | ---------------------------- | ----------------------------- |
| solo Standard        | 141 (88 %)      | 146 (+13 / −8), +0.3 ± 0.9 % | 141 (+9 / −9), −0.1 ± 0.7 %   |
| solo Ultimate        | 36 (23 %)       | 36, identical on every seed  | 31 (+8 / −13), −17 ± 6 %      |
| 4-bot co-op Ultimate | 37 of 80 (46 %) | 36 (+0 / −1), −0.3 ± 0.3 %   | **15 (+0 / −22), −52 ± 10 %** |

**What it shows.**

- **Neither profile beats the new legacy.**
- **Levelling (H4, H7):** upstream's bot already did this on its own.
  - On Standard, legacy now wins 88 % (H4's 0.3.1 baseline: 54 %).
  - `fish-level` reaches shop level 5 by round 7 where legacy is at 4, and wins 5 more of 160. That's noise: 13 flips against 8.
  - On Ultimate the curve, read on a 14-round mode, _is_ legacy's, and both stop at level 5. So `fish-level` plays legacy's exact games.
- **Tier 6 on Ultimate:** wrong there.
  - `fish-tier6` levels to 6 at round 13. Its board is worth less at round 13 (Σ shop price 36.6 against 41.2), with fewer elites (2.2 against 2.8).
  - It loses 22 co-op games and wins none back.
  - Upstream measured the same (§37.38: dropping level 6 raised the solo Ultimate pool finished from 30.9 % to 38.7 %). The tier-6 finding came from round-9 Standard boards. On Ultimate, paying for level 6 costs more than the tier-6 operators bring.

**Is our research redundant?** Partly.

- **Overtaken:**
  - the levelling findings, which upstream fixed on Standard;
  - "level 6 for tier 6", which is wrong on Ultimate.

  Keep both profiles as examples of the API, not as candidates.

- **Not redundant: gaps the new bot still has.**
  1. **Each Alliance's own layer engine.** Upstream names it as the remaining gap (§37.35, §37.36):
     - in Du Yaoye games with Xiaoman on the field, the bot gains 2.4–3.5 operators per round, where humans gain about ten;
     - it has 1.65 distinct Yan operators at round 5, and 2.83 at round 7.

     It's Upstream's measure of the bot's own strength by Strategy (`BAND_STRENGTH`, solo Ultimate pool finished): Du Yaoye is 35.8 %, 25th of 40 (Amiya 51.8 %).

  2. **DIY picks:** the bot's own seats field none. It only uses them taking over a human's seat (`DIY_PIECE_BONUS`). Two of the five human Standard boards were carried by DIY picks (H12). Not measured yet.
  3. **Bosses on Ultimate, solo, legacy:**
     - Gunshatter (`boss_2`) 1 of 27, the Will of Sami 1 of 15, Pipe 2 of 20, Lucien 4 of 37;
     - Helm 15 of 24.
  4. **The bounty estimate (#29):** still too pessimistic. Cards the bot rates 20–50 % are killed 94 % of the time.

- **The method isn't redundant either.** Upstream tunes the bot against itself with `botbench`. Our hypothesis tests compare it with human boards and records, which is how H1–H12 found what the bot doesn't do.

**Fish's Du Yaoye tactics: helpful, not redundant.** They target gap 1, the one upstream names and hasn't closed. The bot's Du Yaoye handling today is:

- Yan is the main Alliance from round 1 (§37.35);
- her two rigged refreshes come before the level-up;
- it aims for the 9-Yan line with Muelsyse (§37.43);
- it gives the layer engines a buy and lineup bonus (§37.36).

Nothing manages Xiaoman's gain-per-operator layers the way a human does. To write them so each can be built and measured:

- one tactic per idea: **when** (round, board, shop: "Xiaoman on the field and …"), **what** (buy / sell / refresh / level / place …), and what it gives up;
- each becomes a `defineTactic` at one decision point, in a profile `[dyy tactics…, legacy]`;
- measured as upstream measures Strategies: Du Yaoye forced with `botbench --band band_duyaoy`, solo Ultimate, paired seeds, against legacy forced the same way. Seeds 1–40 to develop, the rest held back.

The forced-Du Yaoye baseline is not run yet. The first try was stopped because the machine ran low on memory, so run it on its own, with fewer jobs:

```
node tools/botbench.mjs --configs solo:ABYSS --seeds 160 --seed 1 --jobs 4 --bot legacy --band band_duyaoy --json dyy-legacy.json
```

Data: `untracked/bench-2026-11-05/` (the nine `--json` runs and their tables).


## Process step 1: human Du Yaoye games against the draft (2026-11-12)

The draft tactics are on `feature/fish-dyy-profile` (`server/match/botTacticsDyy.js`):
- `dyy-level`: a fixed levelling schedule;
- `dyy-shop`: buy Yan and side-Alliance operators, sell Bench operators for them, hunt Yan with the 2 special refreshes;
- `dyy-freeze`: freeze an unaffordable Yan operator.

**Data.** The match records in `logs/` (182 matches, 2026-10-27 to 11-08) have 39 human Du Yaoye seats. 21 passed
round 10. 6 of those played with cheats (booster packs, extra Funds, tier start), including all four solo Ultimate wins,
so they don't compare with a bot. That leaves **15 seats**, all co-op, 9 of them won. Scripts and tables:
`untracked/dyy-2026-11/` (`dyy-step1.mjs` per seat, `dyy-step1b.mjs` what each action is for).

**What the draft explains, and what it doesn't** (the 15 seats pooled):

| | Humans | The draft |
|---|---|---|
| Levelling | level 2 / 3 / 4 / 5 at rounds 2 / 4 / 6 / 10 (medians; level 5 at 6–14) | `fish` 2 / 4 / 5 / 7 is two rounds early for level 5; `human` (2 / 4 / 6 / 9) fits |
| Operator buys | Yan 54 %, side Alliance 6 %, other 40 % | Yan yes; side Alliances are rare buys |
| The 2 special refreshes | every round from round 2; 42 % are followed by a Yan buy | the hunt, but only with no Yan showing (humans: 59 %) |
| Further refreshes (327) | almost none before round 9, then 37–72 per round over all 15 seats; 46 % lead to another refresh, 6 % to a Yan buy | **not covered** |
| Sells (301 operators) | 76 % Bench; 41 % leave another copy; 31 % tier 1; next action: refresh 26 %, a Yan buy 23 %, another buy 37 % | sell-to-buy covers about a quarter; **sell-to-roll isn't covered** |
| Board sells (24 %) | 82 % followed by a move onto the board: a swap | **not covered** (legacy's board) |
| Freezes (84) | 56 % for an item, 32 % for a wanted Yan operator; 80 % end the prep | the Yan freeze only |
| Equips | rise from round 9 with the roll-down. Top: 盟约之币 (+1 / 2 Funds when equipped) 65, 变形同构体 56, 简易通讯机 (1 / 2 operators of the bearer's Alliances) 23 | **not covered** (legacy's equips) |
| DIY operators | 4 of 15 seats | not covered |

**The shape of a human Du Yaoye game.** Two phases:
1. **Rounds 2–8, economy.** Level on schedule, the 2 special refreshes each round, buy Yan, freeze (a Yan operator or an
   item) at the end of the prep.
2. **From round 9 (about when level 5 is reached), the roll-down.** Refresh many times per round, fund it by selling
   duplicate and low-tier Bench operators and cashing 盟约之币, swap better operators onto the board, equip.

The draft only models phase 1. To explain 90 %, the list needs (pseudocode, for step 3):
- **dyy-rolldown:** from level 5 (or round 9): while funds > a reserve, refresh; buy merge copies, Yan operators and
  carry upgrades; sell duplicates and tier-1 / tier-2 Bench operators when funds run out. Parameters: start round or
  level, reserve, what is sellable.
- **dyy-cash-coins:** equip 盟约之币 when the funds buy a refresh or a wanted operator (not on a board slot's item).
- **dyy-comms:** 简易通讯机 on a Yan operator (it brings operators of the bearer's Alliances).
- **dyy-freeze-items:** also freeze for a wanted item (Isomorph, 简易通讯机, cloning items) at the end of the prep.
- **dyy-level:** default schedule `human`.
- Board swaps and the side Alliances: legacy's are probably enough. Check after the above.

Not covered yet: why 28 % of the special refreshes skip a wanted Yan operator. It's most likely funds, which the
records don't log per action; a replay of the economy would tell.

### The bot's Du Yaoye games against the humans'

Legacy (main, #108) as Du Yaoye in 30 co-op Ultimate matches with three legacy teammates (seeds 1–30, recorded with
`untracked/dyy-2026-11/botrecords.mjs`; 28 passed round 10; 8 won). Per seat, against the 15 human seats:

| | Humans | Legacy |
|---|---|---|
| Level 2 / 3 / 4 / 5 at round (medians) | 2 / 4 / 6 / 10 | **4 / 6 / 8** / 9 |
| Special refreshes in round 3 | 9 over 15 seats | 4 over 28 seats |
| Yan share of operator buys | 54 % | **37 %** |
| Freezes per seat | 5.6 (56 % for an item) | **1.2** |
| Seats that got a 变形同构体 (Isomorph) | 11 of 17 (the cheat filter here is per rule key) | **5 of 28** |
| Isomorph equips per seat | 3.7 | **0.2** |
| 简易通讯机 bought or offered and taken | 23 | **1** |
| Refreshes per seat | 40 | 35 |
| Sells per seat | 20 (31 % tier 1) | 18 (52 % tier 1) |
| Extra refreshes start | round 9 | round 5–7 |

**Where legacy differs most from the humans:**
- **Early levelling.** Legacy is two rounds behind at levels 2–4, and catches up at 5. `dyy-level` (either schedule)
  targets exactly this.
- **The Isomorph engine.** Legacy rarely gets an Isomorph and almost never equips one. Humans build around it
  (Fish's "General insights"). This is the biggest gap, and the draft has no tactic for it.
- **Yan focus and freezing.** Legacy buys fewer Yan operators and freezes a quarter as often.

**What's not a gap:** the roll-down. Legacy already refreshes about as much, starting earlier.

So, for step 3, in order: an Isomorph plan (get one, equip it on a carry or a Yan-feasible member, keep 简易通讯机
and cloning items), `dyy-level`, the Yan-focused buying and freezing. Then the roll-down only as a tuning of legacy's.

## Step 3 begun: the Isomorph tactic `plan-iso` (2026-11-12)

Where the humans' Isomorphs come from (all 62 human seats of 08): **merge rewards** (54 of 97; 缪尔赛思 56 of 76),
then strategy gifts (25) and buying (14). Half the human seats reach level 6, at a median of round 12. Legacy never goes
past level 5 (`BOT_MAX_LEVEL`), so tier 6 never shows in its shop. When a reward offers 缪尔赛思 or an Isomorph, humans
take it 43 % of the time, bots 31 %. Legacy already equips an Isomorph well once held (`morphPlan`).

`plan-iso` (`server/match/botTacticsResearch.js`, branch `feature/bot-plan-tactics`, 58d6c04a):
- **takes a merge reward** offering 缪尔赛思 or a 变形同构体, while fewer than `maxIso` (6) are owned;
- from shop level `fromLevel` (6), puts 缪尔赛思 and the 变形同构体 into the plan's buy lists;
- once an Isomorph is owned, lists the bond items of the Alliances one Isomorph completes. Fish's rule is applied to
  the owned members: first threshold ≤ 3, owned members one short. For a Yan board that's Durable, Arcane and Raid
  from the data alone, and Swift or Precision once one member is owned;
- keeps the Isomorphs and those bond items (`items.keep`).

Six solo Du Yaoye matches (seeds 1–6): an Isomorph got and equipped in 5 of 6 seats, against 2 of 6 for legacy.
Stacks were the same within a few.

**Measured** (`untracked/queue6-2026-11-12.sh` → `untracked/engines-2026-11/dyy-iso/`, `compare-iso.md`): solo
Ultimate, Du Yaoye forced, seeds 1–160, legacy against `iso`, paired.

| | `legacy` | `iso` |
|---|---|---|
| Wins of 160 | 20 | 17 (3 lost / 0 gained) |
| Reached the Final Assault | 136 | 135 |
| Leaks per game | 21.5 | 22.8 |
| Stacks, rounds 10 / 13 | 77 / 171 | 77 / 167 |
| Leader damage per game | 2.00 M | 1.98 M |

**This mostly tested nothing.** Legacy stops at level 5, so `fromLevel` 6 never comes and `plan-iso` never buys. Only
its merge-reward picks act; they change 49 of 160 seeds, with no visible gain (3 lost is noise, p 0.25).

**Level 6 added** (33e86ab4): `legacy-level` has a new `level6From` (default 16: never), so a profile can set
`maxLevel 6, level6From 11`. Measured (`untracked/queue8-2026-11-12.sh`, `compare-lvl6.md`, `compare-iso6-vs-lvl6.md`):
the same 160 seeds.

| | `legacy` | `lvl6` (level 6 from round 11) | `iso6` (`lvl6` + `plan-iso`) |
|---|---|---|---|
| Wins of 160 | 20 | 12 (12 lost / 4 gained vs legacy, p 0.08) | 9 (3 lost / 0 gained vs `lvl6`, p 0.25) |
| Reached the Final Assault | 136 | 122 | 121 |
| Shop level, round 13 | 5.0 | 5.9 | 5.9 |
| Board value, round 13 | 50.1 | 46.6 | 46.4 |
| Stacks, round 13 | 171 | 145 | 140 |
| Leader damage per game | 2.00 M | 1.58 M | 1.55 M |

- **Level 6 at round 11 costs legacy a lot**, as §37.38 found: the funds leave the board, and fewer games reach the boss.
- **The Isomorph adds nothing on top.** Items held at round 14 rise only from 1.66 to 1.81, so the bot rarely gets one;
  the three seeds lost are noise.
- So, for a bot that plays legacy's board, the Isomorph route is not worth its price. Humans pay for level 6 with a
  stronger economy (08: more gold, coins, merges). Before more Isomorph work, Fish's exact rule is worth one run:
  level 6 only once Muelsyse is held (not on a fixed round). That needs a small `plan-iso` change (not built).

**Next for step 3:** cloning Muelsyse, then the roll-down.

## Baseline: the draft against legacy (2026-11-12)

Solo Ultimate, Du Yaoye forced, seeds 1–160, paired, from `feature/fish-dyy-profile` (c1f872e4). Data:
`untracked/dyy-2026-11/solo/` (chunks, joined `*.all.json`, `compare-*.md`).

| | `legacy` | `fish-dyy` (levels 2 / 4 / 5 / 7) | `fish-dyy-human` (2 / 4 / 6 / 9) |
|---|---|---|---|
| Wins of 160 | 20 | 18 (9 lost / 7 gained, p 0.80) | 24 (11 / 15, p 0.56) |
| Reached the Final Assault | 136 | 101 | 102 |
| LP left at the end | 13.7 | 8.2 | 8.8 |
| Leaks per game | 21.5 | 25.3 | 24.7 |
| Shop level, rounds 4 / 7 / 10 | 1.9 / 3.3 / 4.9 | 3.0 / 4.3 / 5.0 | 3.0 / 4.0 / 5.0 |
| Board value, rounds 4 / 7 / 10 | 19.8 / 28.9 / 36.6 | 11.6 / 21.9 / 31.0 | 11.6 / 23.3 / 33.6 |
| Merges per game | 6.4 | 3.5 | 4.0 |
| Stacks, rounds 10 / 13 | 77 / 171 | 66 / 188 | 71 / 191 |
| Leader damage per game | 2.00 M | 1.58 M | 1.61 M |

- **No difference in wins** that 160 seeds can see. `fish-dyy-human` is ahead by 4, which is noise (p 0.56).
- **The levelling does what it says, and costs the board.** At round 4 the drafts have shop level 3 against 1.9, and
  about 60 % of legacy's board value. They leak more from round 2 to round 8, and 35 fewer games reach the Final
  Assault.
- **Games that reach the boss do as well:** 18–24 wins out of about 100, against legacy's 20 of 136.
- **Merges halve.** The funds go into levels and Yan buys, not pairs. The stacks catch up by round 13.
- So the early levelling only pays if the levels turn into strength. Humans do that with the roll-down and the
  Isomorph engine (above). That was step 3's order: `plan-iso` first (queue6, queue8: no gain), then the roll-down.


## Step 3 continued: the Muelsyse clone, and the `dyybot` profile (2026-11-13)

**Why legacy never clones her:** legacy sells a normal 缪尔赛思 as soon as she arrives (§37.42 `sellMorphBringers`: the
Isomorph she brought stays, she goes back to the pool). So no Muelsyse is held when a clone item comes.

**The clones** (Fish, 2026-11-13: "a few different items capable of cloning muelsyse"). In our engine:
- 画卷 (`chess_item_6_02_m`, a tier-6 Art): copies the operator on its tile, elite status included; any shop level.
- 拟态物质: her third copy with 2 normal ones held, else a random operator of her Alliances (only her); any level.
- 简易通讯机, 寻呼模块 (an offer; she is picked), 商业包装方案 (a copy every 8 sales while it stays on her): operators of
  her Alliances, but only up to the shop level, so only from level 6 (she is tier 6).
- Not 博士投影: it promotes her in place, which is no gain, so no Isomorph. Fish: "better to put it on the carry dps so
  they don't hit the 300k ceiling" (a promoted operator ignores the cap since #131), "or certain stack generators like
  executor alter" (an elite 圣约送葬人 gives Laterano +14 per 7 bullets instead of +7).

`dyy-muelsyse` (`server/match/botTacticsDyy.js`, a0bd1b85; c2b1b386 had 画卷 only): while fewer than `maxIso` (6)
Isomorphs are owned and a Muelsyse is held:
- keeps her (`keep: clone`: while a clone item is held or shown, or the packaging plan is on her; `always`);
- lists the clone items for buying and keeps them from legacy's own item rules;
- uses them on her: 画卷 (moving her onto the board first if needed), 拟态物质, then from level 6 the printers;
  the printers only on a Muelsyse without an Isomorph (it would add another Alliance to roll from);
- levels to 6 by Fish's rule (`level6: clone`: she is held and a clone item is held or shown; `held`; `off`).
From 6 Isomorphs on it stops, and legacy sells her and uses the items its own way.

`carry-hologram` (same file, any band): from round 4, a held 博士投影 goes on carry-iso's planned carry (`target:
carry`), on the deployed normal stack generator of highest tier (`stacker`: a trait with "层数+"), or a stacker first
(`stacker-first`); until then it's kept from legacy's own rule (any deployed normal tier-5+ operator). It sits in the
DYY file, not the research list, so the weekend race's pool is unchanged; it moves after the race. Note: the plan
branch doesn't have #131 yet (it's on main), so in its benches a promoted carry is still capped.

**`dyybot`** (the step-3 draft): dyy-muelsyse, dyy-shop, dyy-freeze, dyy-level (`human`), plan-iso from shop level 5,
carry-iso, carry-hologram, plan-items (stack items: 简易通讯机 and co.). Queue21: solo Ultimate, Du Yaoye forced, seeds 1–160, against
the baseline above; `dyybot` without dyy-muelsyse; and the scenario `mu-scroll` (Muelsyse and a 画卷 at round 9, a
second 画卷 at round 11), legacy against dyybot, seeds 1–80.

**No Isomorph on Muelsyse** (Fish, 2026-11-13: "you're not supposed to isomorph muelsyse yourself. you use it to gain
alliance membership for other operators, activate more alliances overall, and give key operators membership in
alliances useful for them"). Legacy did it on purpose: §37.41 / §37.43 (the upstream maintainer's "9 Yan with 8
deployed") put a Yan item and the Isomorph on her whenever the focus Alliance's top tier is above the deploy cap, and
valued her as two focus members. The records showed it 3 times in 20 seats. d044f278:
- legacy tunable `MORPH_ON_MUELSYSE` (upstream: true, so legacy is unchanged; a `legacy-equip` parameter);
- `iso-not-muelsyse` (in the DYY file, in `dyybot`) sets it false: no conversion, no double value, and neither morphPlan
  nor the general item loop puts an Isomorph on her (it waits in the hand);
- carry-iso's carry is never her (`carryAndFocus`, `plannedCarry`).
Queue21 ran before this (a0bd1b85). Queue22: dyybot again, and with carry-iso's buying off.

**Queue21** (a0bd1b85, before iso-not-muelsyse): solo Ultimate, Du Yaoye forced, paired against the baseline's legacy
(today's legacy reproduces it: seeds 1–20 identical).

| | Wins | Seeds won / lost vs legacy | p |
|---|---|---|---|
| legacy | 20 of 160 | | |
| fish-dyy-human (baseline) | 24 | 15 / 11 | 0.56 |
| dyybot | 17 | 10 / 13 | 0.68 |
| dyybot without dyy-muelsyse | 16 | 10 / 14 | 0.54 |

The scenario `mu-scroll` (Muelsyse and a 画卷 at round 9, a second 画卷 at round 11), seeds 1–80:
- **legacy: 7 → 19 wins** with the gift (15 / 3, p 0.01). Legacy uses 画卷 on its most valuable operator.
- **dyybot: 9 → 6** (2 / 5, p 0.45). It spends the 画卷 on Muelsyse (one more Isomorph) and pays for level 6.
- dyybot's board is weaker from round 4 on (value 11.8 against legacy's 19.8: the early levels), so the two can't be
  compared directly; queue23 tests the clone alone on legacy, with and without 画卷 (`scroll`, 65af52fa).

## How the humans with 6+ Isomorphs got them (2026-11-13)

Fish: "rather than ask me, just see what the very high scoring human games do". `untracked/dyy-2026-11/iso6.mjs` →
`iso6.md`: 131 clean HARD / ABYSS human seats that passed round 10, 17 with 4+ Isomorphs, 7 with 6+.

- **The top three (11–12 Isomorphs, Paganini, solo Ultimate) ran a sell engine.** 商业包装方案 on one Muelsyse (a copy of
  one of her Alliances, so her, every 8 sales; 7 elite), then dozens of cheap operators sold per round from round 11–12.
  Every printed Muelsyse is sold at once: her Isomorph stays, and she goes back to the pool for the next print. All
  their Isomorphs arrived during sales.
- **The Du Yaoye seat (9):** level 6 at round 12, then 简易通讯机 ×2 on Muelsyse.
- **Others (6–7):** mostly merge rewards (Muelsyse picked from the offer), plus a 简易通讯机 or 寻呼模块 on her.
- **画卷 was never used** by a clean human seat. 博士投影 went on Muelsyse once in 31 uses.
- Clone items on Muelsyse: 简易通讯机 12, 商业包装方案 7, 寻呼模块 5, 拟态物质 2 (most of each went elsewhere).
- Level 6 came at rounds 12–15.

So `dyy-muelsyse` (783d0ae7) now: no 画卷 by default (legacy keeps its own copy rule); one Muelsyse holder (the packed
one, else an elite, else the oldest), every other normal copy sold; while 商业包装方案 is on her, a sale cycle of
operators of price ≤ 2 (`cycle` 24 sales a prep, `reserve` 2). Queue24 tests it, with a packaging scenario (Muelsyse
at round 10, 商业包装方案 at round 11).

**Queue22** (d044f278): dyybot with iso-not-muelsyse 17 of 160, exactly as queue21's (0 seeds change), with carry-iso's
buying on or off. In the mu-scroll scenario: 4 of 80 (legacy 19), the 画卷 spent on Muelsyse.

**Queue23** (65af52fa): the clone alone, on legacy, in the mu-scroll scenario (Du Yaoye solo Ultimate, seeds 1–80),
paired with legacy in the same scenario (19 wins):

| | Wins | Seeds won / lost | p |
|---|---|---|---|
| legacy + iso-not-muelsyse | 15 | 1 / 5 | 0.22 |
| + dyy-muelsyse, 画卷 on her | 4 | 1 / 16 | < 0.001 |
| + dyy-muelsyse, no 画卷 | 12 | 2 / 9 | 0.07 |

Against legacy + iso-not-muelsyse, the clone without 画卷 is 1 / 4 (p 0.38).

- **画卷 on Muelsyse is a clear loss** (19 → 4): the copy of the best operator is worth far more than one Isomorph. The
  default is now off (783d0ae7), as the humans play it.
- **No Isomorph on her costs legacy a little here** (19 → 15, n.s.): in a Du Yaoye game legacy's §37.43 Yan conversion
  (her Yan item + Isomorph, "9 Yan with 8 deployed") may be worth something. Fish's rule stands; worth watching.
- **Keeping her and level 6 without the 画卷:** 15 → 12 (n.s.). Level 6 by round 13 (5.6 against 5.0), and stacks at
  round 13 drop (178 against 210): the funds go into the level, not the board.

## Queue24: the human-style clone (783d0ae7) (2026-11-13)

Du Yaoye solo Ultimate, paired by seed. `legmu3` = legacy + the human-style dyy-muelsyse (keep her, sell the extra
copies, no 画卷); `dyybot3` = the dyybot profile at 783d0ae7.

**Muelsyse gifted at round 7 with a 画卷 (mu-scroll), seeds 1–80, against legacy (19 wins):**

| | Wins | Seeds won / lost | p |
|---|---|---|---|
| legacy + iso-not-muelsyse (legnomu) | 15 | 1 / 5 | 0.22 |
| legmu (first clone, 画卷 on her) | 4 | 1 / 16 | < 0.001 |
| legmu3 (human-style) | 13 | 3 / 9 | 0.15 |
| dyybot (queue21) | 6 | 1 / 14 | < 0.001 |
| dyybot3 | 8 | 2 / 13 | 0.01 |

**Muelsyse gifted at round 7 with a 商业包装方案 (mu-pack), seeds 1–80, against legacy (15 wins):**

| | Wins | Seeds won / lost | p |
|---|---|---|---|
| legnomu | 13 | 1 / 3 | 0.63 |
| legmu3 | 5 | 1 / 11 | 0.01 |
| legmu3 without the packaging cycle | 5 | 1 / 11 | 0.01 |

**Normal games (no gift), seeds 1–160, against legacy (20 wins):** dyybot 17, dyybot3 17, dyybot-nomu 16 (all n.s.,
10 / 13 seeds). Muelsyse rarely comes up by herself, so the clone changes almost nothing there.

- **The human-style clone loses less than the first one** (13 against 4 with the 画卷), but **still loses to not chasing
  her at all** (legacy 19, legnomu 15). Buying her copies and levelling to 6 for them costs more than the Isomorphs
  give the bots.
- **With the packaging plan it is worse** (5 against 15): the plan is spent on Muelsyse instead of the board's best
  operator, which is what legacy does with it.
- **The packaging cycle never changed a game:** with and without it, every seed is identical. Either it never starts
  in this scenario (its funds reserve, or no second plan) or it is broken. To check before trusting it.
- **dyybot3's other tactics cost a little more** in the scenario (8 against legmu3's 13): carry-hologram, plan-iso
  and the level schedule, tested one by one in queue25.
- **Why the humans win with it and the bots don't:** the 11–12 Isomorph humans played Paganini solo and spent the
  Isomorphs on alliance memberships that completed big Alliances. The bots place Isomorphs by legacy's rules
  (`carry-iso`), which doesn't plan memberships. The clone pays only once that part exists: the next tactic to draft
  is **iso-memberships** (put each Isomorph where it completes or upgrades an Alliance level), then re-test the clone
  on top of it.

**Next (queue25):** dyybot3 minus one tactic at a time in mu-scroll; the packaging cycle's trigger counts; the
iso-memberships draft.

## Queue25 prep: why the packaging cycle never fired, and the humans' sale engine (2026-11-13)

**The cycle isn't broken; it has nothing to buy.** Instrumented (mu-pack, seeds 1–2): 商业包装方案 only gets onto her at
round 12 (at round 11 the seat holds it with 2 funds), and from then on the shop is mostly price 3–4 (level 6). The
cycle looks at the shop once a prep (no refresh) for operators of price ≤ 2, so it seldom finds one.

**The humans' engine is Foresight's.** The three 11–12 Isomorph seats (`scratchpad` engine.mjs over the records), from
round 11–12: 14–75 refreshes and 18–100 buys a round, reselling tier 1, 3 and 4 operators alike (two-thirds sold the same
round), 166 funds spent in one round with 8 left. What pays for it is 远见 (Foresight): every 10 layers +2 funds, from 80
layers its operators cost 1 less, from 150 every operator does (a tier 1 then costs 1 and sells for 1). All three were
Paganini (潘格尼尼: an elite Laterano operator per 55 funds spent) with Foresight active from round 7, and Civilight
Eterna (+2 Skillful / Arcane layers per 3 funds spent) wearing the packaging plan as often as Muelsyse.

Across the 62 human seats past round 10 (clean HARD / ABYSS):

| | Seats | Wins | Median layers | Median max buys + refreshes a round (r11+) |
|---|---|---|---|---|
| Foresight active 4+ rounds | 17 | 6 (35 %) | 772 | 31 |
| Foresight 1–3 rounds | 7 | 2 (29 %) | 478 | 14 |
| never | 38 | 22 (58 %) | 461 | 14 |

All 6 seats that bought or refreshed 60+ times in a round ran it, and the top 5 by layers (2,900–4,600). **It makes
stacks, not wins**, and it isn't a Du Yaoye engine. The packaging cycle without Foresight's discount has no free cycle
to run; it stays in `dyy-muelsyse` (default 24) but can't matter on a Du Yaoye board.

## The Isomorphs the bots waste, and `iso-pair` (2026-11-13)

A 变形同构体 grants the Alliance of another item worn beside it (one with `giveBondId`: 36 items over 14 Alliances,
维式重锤 → Victoria and so on), and nothing alone. Records (scratchpad isopair.mjs; bot games recorded with
`botrecords.mjs --scenario`):

| | Isomorphs worn | with an Alliance item beside | Alliance items gained a seat |
|---|---|---|---|
| humans, clean HARD / ABYSS seats with any Isomorph (39) | 144 | 114 (79 %) | 6.8 (5.4 bought) |
| legmu3, mu-scroll, 10 games | 22 | 5 (23 %) | 1.1 |

So most of the clone's Isomorphs did nothing, which fits the clone losing. Legacy's `morphPlan` already chooses the
carrier (the lineup score of the granted Alliance); what it lacks is the item: §37.39 keeps it from buying shop
equipment, and with no partner the Isomorph goes on alone.

**`iso-pair`** (27002c44, `botTacticsDyy.js`, outside the race pools): while an Isomorph grants nothing, every shop the
buy loop sees (after each refresh) is searched for an Alliance item one more deployed member would make worth it (1 if
the Alliance is active, +2 per tier it adds, ×2 for a core one; 0 if no deployed operator could join it); held ones are
kept, then paired: with a lone worn Isomorph, or a loose one goes on with it onto a deployed non-member (the planned
carry first; never Muelsyse). Unit test in `bot-tactics-dyy.test.js`.

In the same 10 games it pairs 6 of 20 (from 5 of 22) and buys 1.2 Alliance items a seat. The limit is the board:
a Du Yaoye board is mostly Yan, so the Yan item is worth nothing, and two copies of an item merge into its + version,
so an Alliance gains one member this way (Victoria: one per item kind). The Isomorph pays only where another Alliance
is one member short or active. Queue26 measures it anyway (mu-scroll 1–80, normal 1–160).

## Queue25: dyybot minus one tactic at a time (2026-11-13)

Solo Ultimate, Du Yaoye forced, paired by seed against the full dyybot (`loo-full`, the profile as a file: it plays
dyybot3's 160 normal games seed for seed). Code 1c88dbaa.

| Without | mu-scroll, 80 seeds (full: 8; legacy 19) | p | Normal, 160 seeds (full: 17) | p |
|---|---|---|---|---|
| dyy-muelsyse | 14 (+6 / −0) | 0.03 | 17 (+2 / −2) | 1.00 |
| dyy-level (human schedule) | 11 (+8 / −5) | 0.58 | 13 (+7 / −11) | 0.48 |
| plan-iso | 9 (+4 / −3) | 1.00 | 21 (+6 / −2) | 0.29 |
| carry-iso | 12 (+5 / −1) | 0.22 | 16 (+0 / −1) | 1.00 |
| carry-hologram | 8 (no seed changes) | – | 17 (no seed changes) | – |
| plan-items | 8 (+3 / −3) | 1.00 | 17 (+5 / −5) | 1.00 |
| **dyy-shop** | 13 (+10 / −5) | 0.30 | **33 (+27 / −11)** | **0.01** |

- **`dyy-shop` costs half the wins in normal games.** Without it dyybot wins 33 of 160 (legacy: 20 in the 05
  baseline; queue26 reruns legacy on this code). The difference opens at round 11: board value 39 vs 35 (round 13: 49
  vs 42), elites 2.3 vs 1.8 (3.6 vs 3.0), deployed 7.7 vs 7.0 at round 13, Final Assault leaks 4.4 vs 6.6. Buying every
  Yan operator not yet owned, and selling Bench pieces for them, costs merges. Queue28 turns its three parts off one
  at a time (side-Alliance buys, selling for room, the Yan hunt).
- **The Muelsyse clone is what loses in the scenario** (+6 / −0 without it); in normal games she rarely comes, so it
  changes 4 seeds.
- `carry-hologram` never acted (博士投影 is Muelsyse's Strategy item; it seldom reaches a Du Yaoye seat).
- The rest are within noise.

## Queue26: iso-pair, and legacy on the same code (2026-11-13)

Code 27002c44. Paired by seed.

| | Against | Wins | Seeds better / worse | p |
|---|---|---|---|---|
| legacy + iso-pair, mu-scroll 80 | legacy 19 | 16 | 6 / 9 | 0.61 |
| legmu3 + iso-pair, mu-scroll 80 | legmu3 13 | 12 | 1 / 2 | 1.00 |
| legacy + iso-pair, normal 160 | legacy 20 | 20 | 1 / 1 | 1.00 |
| dyybot + iso-pair, normal 160 | dyybot 17 | 16 | 0 / 1 | 1.00 |
| **dyybot without dyy-shop**, normal 160 | **legacy 20** | **33** | **21 / 8** | **0.02** |

- **iso-pair changes almost no game.** On a Du Yaoye board the Isomorphs have little to grant (05 above), so the
  tactic stays a draft (not in any profile).
- **dyybot without dyy-shop is the first Du Yaoye profile that beats legacy** (legacy reran on this code: 20 of 160,
  as in the baseline). The full dyybot is legacy's equal (17 vs 20, n.s.).

## Queue28: which part of dyy-shop (2026-11-13)

dyybot with one of dyy-shop's switches off, seeds 1–160, paired with the full dyybot (17 wins; legacy 20):

| dyy-shop with | Wins | Seeds better / worse | p |
|---|---|---|---|
| `side` off (no Foresight / Marvel / Investor operator buys) | 24 | 16 / 9 | 0.23 |
| `sellToBuy` off (no Bench sales for room) | 23 | 8 / 2 | 0.11 |
| `hunt` off (no Yan refreshes) | 21 | 8 / 4 | 0.39 |
| the whole tactic off | 33 | 27 / 11 | 0.01 |

Each part costs a few wins, none all of them: what's left with all three off is the buying of every Yan operator not
yet owned, ahead of legacy's own choices. **So dyybot drops dyy-shop** (feature/bot-plan-tactics, the commit after
27002c44; `--bot dyybot` now plays queue25's `loo-no-dyy-shop` seed for seed: checked on seeds 1–20). `fish-dyy`
keeps it, as Fish's original list.

**Queue29, fresh seeds 161–320** (c8b01929, the new dyybot against legacy): 30 wins against 21, 19 seeds better / 10
worse (p 0.14, score +0.063, t 1.67). The same direction, a little smaller, as expected after choosing on seeds 1–160.
Both sets together: 63 against 41 of 320, 40 / 18 seeds (p 0.005).
