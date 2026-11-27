# Placement: how legacy lays out the board, and Fish's ideas (2026-11-12)

Fish's TODO ("Bots"): "I don't know how the current board layout works, but I suspect there may be better placement
strategies", followed by seven ideas. This note covers how the layout works today, what legacy already does for each
idea, and what the records measure.

## How legacy lays out the board

Each prep, `arrangeSteps` (`server/match/bot.js`) does four things:

1. **The lineup.** Which pieces to deploy (`chooseLineup`: unit values, bond tiers, composition).
2. **Candidate layouts.** `planLayout` places the pieces one by one: blockers first, then dealers by DPS, then healers.
   Each piece takes the free legal tile and facing that adds the most to an **exposure model**:
   - each enemy route spends time on each tile, plus the time blockers hold it there;
   - every unit whose range covers a tile deals its DPS (against the round's armour) there;
   - the value is the expected number of enemies killed;
   - a non-blocker standing on the road is penalised (`roadPenalty`), so dealers already avoid pathable tiles.

   The model runs with several parameter sets (`REHEARSAL_VARIANTS`: more or less blocking time, spread). Extra
   candidates come from:
   - the positional traits (`positionPlanSteps`, §37.37), below;
   - the Ægir devour (§37.70, §37.77);
   - the Final Assault: plans on the leader's body, damage lineups, plans against a blinking leader.
3. **The rehearsal.** Every candidate fights the round's real enemies in the real simulation (a preview battle). The
   winner has, in order:
   - the fewest leaks;
   - then the most leader damage;
   - then the most stacks gained **in the battle**;
   - then the most kills;
   - then the earlier candidate.
4. **Apply** the winner.

**Positional traits** (`positionTraitsOf`). Legacy reads them from the trait data:
- the piece in front or behind (空弦, 引星棘刺, 断崖, 见行者);
- the row (蛇屠箱, 歌蕾蒂娅, 余);
- a trait granted to the piece in front (凛御银灰), or to the rightmost piece of the row (远牙);
- the front piece's trait gains +1 (魔王);
- a trait copied from the front piece (白面鸮, 塞雷娅).

`positionPlanSteps` moves those pieces, or a partner onto the tile they look at, while the positional value grows and
the exposure value stays within 3 % (`POSITION_TOLERANCE`). The result is one more rehearsal candidate, placed first.

## What the records show

From the battle specs of the match records: the same 62 human and 111 bot seats as 08, normal battles from round 4
(`untracked/dyy-2026-11/placement.mjs`). "Front" is one tile along the facing.

| Check | Humans: share (battles) | Bots |
|---|---|---|
| 空弦 / 引星棘刺: a piece in front | 86 % (232) | 56 % (72) |
| 断崖 / 见行者: a piece behind | 97 % (154) | 50 % (18) |
| 魔王: the piece in front gains stacks from a trait | 44 % (48) | 60 % (10) |
| 莫斯提马: Laterano operators among the 4 neighbours (mean) | 1.62 (47) | 0.69 (70) |

The humans' near-100 % confirms the front/behind direction.

**Why bots leave the front of 空弦 empty half the time.** 空弦 adds its stacks at prep start and 断崖 at prep end.
Neither happens in a battle, so the rehearsal never sees them. The positional candidate goes first and wins only a full
tie: any other candidate that kills one more enemy beats it, without leaking less. The 3 % exposure tolerance limits
it further.

Deployment matters more than placement: humans deploy 空弦 and 断崖 7× and 19× as often (08). `plan-engines` (08)
addresses deployment. Once more stackers are deployed, their placement matters more.

## Fish's ideas, one by one

| Idea | Legacy today | Next |
|---|---|---|
| Laterano: Mostima next to an ammo user | Not modelled. Her trait ("自身周围4格的干员每消耗6发弹药" → Laterano +1) is a battle trait, so the rehearsal counts the stacks if a candidate happens to place her well. But no candidate aims for it (`positionTraitsOf` has no "4 neighbours" kind). Bots average 0.7 Laterano neighbours, humans 1.6. | New positional kind `around`: + the ammo users among the 4 neighbours, so `positionPlanSteps` moves her or them. |
| Kjerag: overlap the freeze area with the "on freeze, + stack" range | Not modelled. 初雪 / 银灰 ("范围内1名敌人进入冻结时 … +1") are battle traits: counted by the rehearsal, not aimed for. 凛御银灰's grant to the piece in front is modelled. | Needs a freeze model: where the cold wind and freezes happen (the whole field every 25 s, plus 谢拉格不融冰 hits). Then the exposure model can weight the stack operators' cover of the tiles where enemies stand when frozen. Medium. |
| Kjerag: no freezable tile in front that doesn't make stacks | Not modelled. | Same model: tiles early on the path covered by no stack operator are where freezes are wasted. Comes with the previous one. |
| Civilight (魔王) behind a stack generator | Modelled (`extra`). The records agree (60 % of 10 battles, humans 44 %). | Nothing, unless more data says otherwise. |
| Ægir snake, the dps at the back | Partly. §37.70 models the devour in normal rounds (stacks, the victims that stay down). §37.77 adds Final Assault candidates that feed a dealer (the devoured base ATK and block). The order is the official one: the leftmost and topmost Ægir devours first, and it devours the piece in front. A chain is possible but not aimed for. | Measured (below): humans snake more (65 % of battles against 40 %), but with a cheap Ægir at the back, not the top dealer. A "dealer at the back" candidate is still worth a rehearsal test. |
| Ægir: a non-Ægir dps with Damazti Isomorph + an Ægir item | Isomorph is on DYYBot's list (05, step 3: the Isomorph plan). Legacy equips Isomorph only via 缪尔赛思's plan (`morphPlan`). | Part of the Isomorph tactic. |
| Boss: a carry dps with maximum buffs and healing, on a ranged / fence tile | Mostly there. The road penalty keeps dealers off pathable tiles. Boss rounds get body plans, damage lineups (a strong bench piece swapped in) and the rehearsal's leader-damage ranking. What's missing is buffs: the exposure model knows DPS and healing cover, not the ATK auras or 鼓舞 skills a carry could stand in. | A "carry" candidate for the Final Assault: the top dealer first on the best off-road tile, buffers and healers around it. The rehearsal keeps it if it deals more. |

## The tie-break tried (efd9963b)

`legacy-arrange` has two new tunables, both off by default:
- `prepTiebreak`: each candidate's prep-time positional stacks × this go into the rehearsal's stack tie-break;
- `posTolerance`: the exposure share the positional plan may give up (legacy: 0.03).

Six solo Ultimate matches with `plan-engines`, plain against `prepTiebreak 1` (and against `posTolerance 0.15`), changed
almost nothing: 空弦's front was filled in 42 % and 50 % of 12 battles, and stacks were the same in 5 of 6 seeds.
Tracing seed 5 shows why. The positional candidate exists in rounds 8–10 (+1.8, +5.4 and +7.8 stacks a round over
the default plan), and it leaks more: 8 leaks against 6 in round 9, 8 against 7 in round 10. The tie-break never
comes into play.

So, on these boards, filling 空弦's front costs defence. The humans' 86 % says they pay that price. Whether it pays
depends on what one stack is worth in LP. That's a policy question, not a tie-break.

## Ægir chains in the records

How the devour works in the simulation (`server/sim/content/bonds/core.js`, `devour`): each Ægir operator marks the
piece in front of it and, through a marked Ægir, the pieces in front of that one too. It gains the base ATK and block
of everything it marked, and each mark costs its target 5000 HP. So the back piece of a snake gains the whole chain,
whatever order the devours run in.

Battles from round 4 with 3+ Ægir operators on the board (`untracked/dyy-2026-11/aegir.mjs` → `aegir.md`):

| | Humans | Bots |
|---|---|---|
| Battles (seats) | 75 (7) | 88 (11) |
| Ægir operators per battle | 4.45 | 4.17 |
| Longest chain 1 / 2 / 3 pieces | 26 / 36 / 13 | 53 / 31 / 4 |
| Battles with a snake (2+ pieces marked by one Ægir) | 65 % | 40 % |
| Snake: the back piece has the board's top tier | 4 % | 0 % |
| Snake: the back piece is an elite | 22 % | 40 % |

Back pieces of the snakes: humans 深巡 13, 幽灵鲨 10, 归溟幽灵鲨 7, 海霓 7, 歌蕾蒂娅 6; bots 深巡 13, 幽灵鲨 7, 海霓 5.

- **Humans build snakes more often and longer.** Bots mostly devour one piece at a time.
- **But the recorded humans don't put the top dealer at the back.** The back is usually a cheap Ægir. 深巡 attacks sea
  monsters at 150 %, and 幽灵鲨 / 归溟幽灵鲨 gain stacks when knocked out, so the 5000 HP marks may be part of the plan.
- Only 7 human seats, so this says little about which snake is best. Fish's version (the dealer at the back) is a
  candidate to test in the rehearsal, not something the records already show.

## Ægir seats (`untracked/dyy-2026-11/aegir-seats.mjs` → `aegir-seats.md`)

Seats with Ægir active in 2+ battles of rounds 4–13 (6 human seats, 10 bot seats: small samples):

| | Humans | Bots |
|---|---|---|
| Ægir stacks at rounds 7 / 10 / 13 (median) | 2 / 107 / 228 | 8 / 45 / 107 |
| First round Ægir is active (median) | 7 | 8 |
| Ægir members on the board (per battle) | 4.8 | 4.1 |
| Seats reaching the 5-member tier | 6 of 6 | 7 of 10 |
| Elite Ægir operators deployed (per battle) | 1.5 | 1.1 |
| Devours per battle; mean tier eaten; share eating an Ægir | 3.0; 3.2; 72 % | 2.6; 3.2; 71 % |
| 歌蕾蒂娅 deployed (share of Ægir battles) | 72 % | 41 % |
| 深巡 (tier 1) deployed | 43 % | 71 % |

- **The bots get the structure right:** the same tiers, about the same devours, the same prey (斯卡蒂, 幽灵鲨 first on
  both sides). Fish's "easy to play" holds for activating it.
- **The stacks still halve from round 7 to 10.** In battle, Ægir gives humans 31 stacks a round while active,
  bots 22 (08, replayed battles). The visible differences are 歌蕾蒂娅 (a free 斯卡蒂, 幽灵鲨 or 深巡 each prep
  with 3 operators in her row: more members, merges and elites), one more member on the board, and more elites.
  The bots fill with 深巡 instead.

**Where the in-battle Ægir stacks come from** (`untracked/dyy-2026-11/aegir-sources.mjs` → `aegir-sources.md`).
Every Ægir battle of rounds 7–13 is replayed with each stack gain credited to its source. "Devour" is the bond
crediting the devourer (it gains the eaten piece's tier); "trait" is the operator's own trait.

| Per Ægir battle | Humans (42 battles) | Bots (59) |
|---|---|---|
| All Ægir stacks in battle | 30.6 | 22.4 |
| 归溟幽灵鲨's trait (+5 when knocked out) | 7.6 | 4.7 |
| 幽灵鲨's trait (+3 when knocked out) | 3.4 | 3.5 |
| 斯卡蒂's and 海霓's traits | 4.1 | 4.2 |
| Devours, all devourers | 13.4 | 10.2 |
| … of them by a custom operator (甄选干员, 盟约·辅助干员) | 3.5 | 0 |
| … by 浊心斯卡蒂 | 2.9 | 0.3 |
| Strategy (band) effects (海霓, 水月 bands) | 1.6 | 0 |

- **About 5 of the 8-stack gap per battle are things bots never have:** custom operators that are Ægir members
  (3.5) and the bands' Ægir effects (1.6). Bots field no custom operators (bot.js: "bots field none").
- **归溟幽灵鲨 dies more often on human boards** (+2.9 a battle): +5 per knock-out, and the 5-member revive lets it
  die twice. Placing it where it's knocked out early is worth stacks.
- **Devours:** more devours of higher tier on human boards (浊心斯卡蒂 eats a big piece); bots devour more with
  深巡 and 斯卡蒂. The total from devours is 13.4 against 10.2.
- **Tactic ideas:** an Ægir custom-operator pick for bots (bigger: bots would need custom operators, the same
  prerequisite as Fish's Ascalon idea); 归溟幽灵鲨 in front (the knock-outs); 歌蕾蒂娅 kept with her row filled
  (`plan-commit` `gladiia` does the commit part).

## Proposed experiments, in order

1. **A leak allowance for the positional candidate:** built (7766a87d), behind `legacy-arrange`'s `leakAllow`
   (default 0) and `leakAllowLp` (20). In normal rounds 6–11 while the LP is at least the floor, the rehearsal counts
   the positional candidate's leaks minus `leakAllow`: 0.5 wins a leak tie outright, 1.5 also with one leak more. In a
   two-seed solo smoke run, seed 5 gained 13 stacks by round 14 with the same leaks. **Measured**
   (`untracked/queue7-2026-11-12.sh` → `untracked/placement-2026-11/`): co-op Ultimate seeds 1–80, all seats
   `plan-engines`, paired:

   | | `eng-pos` | `leakAllow` 0.5 | 1.5 | 2.5 |
   |---|---|---|---|---|
   | Wins of 80 | 47 | 48 (2 lost / 3 gained) | 51 (3 / 7, p 0.34) | 52 (4 / 9, p 0.27) |
   | Stacks at round 13 (sum of the team, mean) | 679 | 684 | 676 | 683 |
   | Leaks per game (team) | 192.9 | 192.8 | 194.1 | 194.3 |
   | LP left | 29.7 | 28.7 | 27.4 | 28.0 |
   | Leader damage (team, mean) | 12.6 M | 12.5 M | 12.8 M | 13.1 M |

   **No stack gain** (paired t −0.13 to +0.44), so the positional candidate wins more often but doesn't change the
   stacks that matter. Wins drift up with the allowance (+5 at 2.5), but not significantly. Not worth adopting on this
   evidence; it can stay as a tunable for the evolution race.
2. **The `around` positional kind** for 莫斯提马: built (4bafc1c6), behind `legacy-arrange`'s `aroundValue` (default 0;
   3 means three stacks per battle per ammo user beside her). Ammo users are Laterano members (their skills are ammo
   skills) and the hunter branch. A unit test checks that it moves a Laterano operator next to her. Not measured yet:
   she's deployed in few bot games, so it needs Laterano seats (07's per-Alliance range).
3. **The Final Assault carry candidate.**
4. **The Kjerag freeze model.** The largest of the four.

Measure each with stacks and leader damage, paired by seed (07).
