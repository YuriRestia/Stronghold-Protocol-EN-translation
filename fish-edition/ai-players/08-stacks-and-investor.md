# Stacks and Investor: why bots fall behind (2026-11-12)

Fish's long-term goals (TODO "Bots"): "Why do the bots suck so much at generating 200+ stacks?" and "Be able to play
Investor ... studying human games may be enlightening."

**Data.**
- **Humans:** the human seats of the match records in `logs/` (2026-10-27 → 11-08), Hard and Ultimate, without cheats,
  that passed round 10. That's 62 seats.
- **Bots:** legacy (main, #108) in 30 co-op Ultimate matches (seeds 1–30; seat 0 forced to Du Yaoye). That's 111 seats.
- The teams differ (humans played with humans, bots with bots), so read the gaps as large-scale, not exact.
- Scripts and tables are in `untracked/dyy-2026-11/`: `stacks.mjs` → `stacks.md`.

## The gap

| Per seat | Humans | Bots |
|---|---|---|
| Stacks (medians) at rounds 7 / 10 / 13 / max | 40 / 176 / 437 / 509 | 36 / 104 / 188 / 202 |
| Seats with 200+ / 400+ stacks | 61 / 47 of 62 | 58 / 11 of 111 |
| Investor active at some point | 30 of 62 | 1 of 111 |
| Operators bought | 68 | 30 |
| Operators sold | 48 | 14 |
| Items equipped | 31 | 4 |
| Merge rewards taken | 12.7 | 5.0 |
| Operators gained from effects | 6.7 (3.1 from 获得时 pool garrisons) | 2.2 (0.2) |
| Gold earned (median) | 186 | 148 |

- **Stacks are even until round 7.** The gap opens from rounds 7 to 13: humans gain about 400, bots about 150.
- **The highest human seats are Paganini (Laterano) with Investor:** 1,000–4,600 stacks, with 160–340 sales and
  400–700 gold.
- Every core Alliance shows the gap. Humans reach 1.3× (Kjerag) to 3.9× (Laterano: 763 against 196) the bots' medians; Yan is
  562 against 174.

**One Alliance at 200** (Fish: "you shouldn't need anything advanced … just to get 200 stacks of something"). The
battle specs record each Alliance's stacks at every battle (`untracked/dyy-2026-11/top-bond.mjs` → `top-bond.md`):

| Top single Alliance per seat | Humans (62) | Bots: legacy (111) | Bots: `items-eng` (109) |
|---|---|---|---|
| Median at rounds 7 / 10 / 13 | 22 / 98 / 235 | 18 / 50 / 124 | 18 / 50 / 134 |
| Median best over the match | 292 | 125 | 131 |
| Seats with one Alliance at 200+ | 53 (85 %) | 15 (14 %) | 29 (27 %) |
| Seats with two at 200+ | 20 | 0 | 0 |

- Humans reach 200 in one Alliance in 85 % of seats, by round 12; bots in 14 %. `plan-items` doubles that to 27 %.
- **It isn't spread:** the bots' top Alliance is about two thirds of their total (124 of ~190 at round 13), the
  humans' about half (235 of 437). The bots don't split their stacks too thinly; they make too few.
- The gap opens between rounds 7 and 10: the humans' top Alliance gains 76, the bots' 32.
- The humans' 200+ Alliances: Yan 10, Victoria 9, Laterano 8, then Siracusa, Sargon, Ægir. The bots': Kjerag 4,
  Siracusa 3.

**What the 200+ humans do differently** (`untracked/dyy-2026-11/stackers-vs.mjs` → `stackers-vs.md`; the 43 human
seats whose top Alliance reached 200, against all bot seats, battles of rounds 7–13):

| Per battle | Humans (200+) | Bots |
|---|---|---|
| The top Alliance's tier (mean) | 1.32 | 1.33 |
| Its members on the board | 4.4 | 3.9 |
| Active Alliances | 4.2 | 4.9 |
| Operators / elites deployed | 8.0 / 2.5 | 8.0 / 2.1 |

**Not Alliance activation:** the same tier, and the bots even have more active Alliances. **The operators:**

| Operator | Humans (share of battles) | Bots | What it does |
|---|---|---|---|
| 空弦 | 40 % | 7 % | prep start: itself and the piece in front, each active Alliance +3 |
| 断崖 | 27 % | 2 % | prep end: itself and the piece behind, the same |
| 圣约送葬人 | 23 % | 3 % | in battle: per 7 bullets, Laterano +7, Foresight +3 (up to 7×) |
| 白面鸮 | 23 % | 7 % | copies the front piece's prep-start trait |
| 塞雷娅 | 20 % | 1 % | copies the front piece's prep-end trait |
| 铃兰 | 13 % | 3 % | prep start: re-triggers the front piece's on-obtain effect |
| 伊内丝, 薄绿, 夕, 烛煌 | 13–16 % | 3–9 % | prep-end / on-obtain stackers |
| 刺玫 | 13 % | 31 % | prep end: Victoria +1 (the bots' favourite) |

**Combos:** humans build trait chains with the copy operators, bots don't:

| A trait piece in front of … | Humans | Bots |
|---|---|---|
| 白面鸮 (copies prep start) | 59 % of 103 battles (空弦 48) | 6 % of 49 |
| 塞雷娅 (copies prep end) | 60 % of 83 (山 14, 溯光星源 9, 夕 8) | 0 % of 6 |
| 铃兰 (re-triggers on-obtain) | 55 % of 60 | 26 % of 19 |

So 白面鸮 behind 空弦 doubles 空弦's +3 per Alliance per round; 塞雷娅 does the same behind 断崖 or 山. Legacy's
placement knows the `copy` kind (§37.37), but it rarely owns both halves, and its buy score doesn't value a copy
operator for the partner it could copy. 圣约送葬人 explains much of the Laterano battle gap above.

## Why: the operators deployed and the items, more than cycling

**Where the stacks come from, rounds 7–13** (`untracked/dyy-2026-11/stack-sources.mjs` → `stack-sources.md`). Each
round's gain is split into estimates:
- 获得时: the "on obtain" traits of the operators obtained, ×2 under Investor;
- the engine: operators obtained × the deployed 小满 / 夕 / 山 ("each operator gained this round");
- the rest: everything else (the prep-start and prep-end traits of deployed operators, items, Alliance effects).

| Per seat, rounds 7–13 (median / mean) | Humans | Bots |
|---|---|---|
| Stacks gained | 410 / 594 | 169 / 188 |
| 获得时 traits | 36 / 75 | 32 / 37 |
| Engine (小满 / 夕 / 山) | 0 / 89 | 0 / 21 |
| Rest | 336 / 430 | 112 / 130 |
| Operators obtained | 30 / 43 | 17 / 17 |

- **Buying to feed the 获得时 traits explains little.** The median seat gets about the same from them on both sides.
  The engine matters for a minority of human seats (Investor, Yan with 夕), so the mean differs, but the median
  doesn't. (An earlier draft of this note blamed cycling first. This split corrects that.)
- **Most of the gap is the rest: about 340 against 110.**

**What humans deploy** (rounds deployed per seat, rounds 7–13; `fielded.mjs`, in the same md):

| Operator | Trait | Humans | Bots |
|---|---|---|---|
| 空弦 | prep start: itself and the piece in front, each active Alliance +3 | 2.8 | 0.4 |
| 断崖 | prep end: itself and the piece behind, each active Alliance +3 | 2.1 | 0.1 |
| 薄绿 | +2 Victoria per different-tier Victoria operator | 1.3 | 0.3 |
| 夕 | +2 Yan / Arcane per operator gained | 1.2 | 0.5 |
| 烛煌 | 获得时 +5 Yan / Victoria | 1.0 | 0.3 |
| 伊内丝 | prep end: its own active Alliances +5 | 0.7 | 0.3 |
| 山 | +1 Investor per operator gained | 0.6 | 0.0 |

- **The position stackers 空弦 and 断崖** each add +3 to every active Alliance of two operators, every round. Next to
  an operator with 3 active Alliances (and 2 of its own), that is 15 a round from one piece.
- **Legacy undervalues them.** Its engine bonus (`engineFor`, +10) only sees a trait that names the focus Alliance or
  says "自身所属／自身已激活的盟约". "使自身及身前一格干员的已激活盟约…" matches neither, so they get only the generic
  `recurring × 4`. Legacy does place them well once owned (§37.37 `positionTraitsOf`).
- **Not on every map:** a match bans about 22 operators per seed (`SharedPool.banned`); 空弦 and 断崖 were both out in
  seeds 1 and 3. The humans' matches ban too, so the comparison holds.

**Items:** humans equip 18 in rounds 7–13 (31 over the match), bots 2.4 (4). The bots don't leave them in the hand:
they never buy them. §37.39 stopped legacy buying shop equipment, except the elite items and, in solo, the dolls.
Per seat, whole match (`items.mjs` → `untracked/dyy-2026-11/items.md`):

| Item | Humans: obtained / equipped | Bots |
|---|---|---|
| 盟约之币 (1 fund, gives 1 fund back) | 6.3 / 4.3 | 0.6 / 0.5 |
| 变形同构体 (Isomorph) | 1.6 / 3.7 | 0.2 / 0.2 |
| 简易通讯机 (2: an operator of the bearer's Alliances) | 1.5 / 1.5 | 0.01 |
| 见钱眼开玩偶 (1: +2 funds next round) | 1.4 / 1.4 | 0.01 |
| 骑士储蓄罐 (3: 1–6 funds) | 1.3 / 1.3 | 0.01 |
| 寻呼模块 (4: a free pick of 3 operators of the bearer's Alliances) | 1.0 / 1.0 | 0.02 |
| 精打细算玩偶 (3: +1 fund every later round) | 0.5 / 0.5 | 0 |

**In battle against the rest** (`untracked/dyy-2026-11/battle-stacks.mjs` → `battle-stacks.md`). Every normal battle of
rounds 7–13 is replayed from its BattleSpec, and the stacks the battle itself gave each bond are read (`layerGains`).
Replays of older human records don't always match exactly (324 of 425 battles give the recorded digest; bots 648 of
730), so read these as close estimates.

| Per seat, rounds 7–13 (means) | Humans | Bots |
|---|---|---|
| Stacks gained | 594 | 188 |
| of which in battle | 229 | 88 |
| of which outside battle (prep, 获得时, items, engines) | 365 | 100 |

So the bots miss both: about a third of the gap is battle stacks, two thirds outside battle. By bond, in-battle stacks
per round while the bond is active (rounds active in brackets):

| Bond | Humans | Bots |
|---|---|---|
| Laterano | 58.7 (94) | 10.3 (61) |
| Sargon | 37.9 (34) | 22.7 (39) |
| Ægir | 30.6 (42) | 21.7 (56) |
| Resilient | 23.2 (11) | 4.7 (96) |
| Foresight | 20.9 (110) | 0.8 (97) |
| Kazimierz | 20.0 (19) | 15.2 (116) |
| Kjerag | 17.6 (34) | 16.5 (81) |
| Raid | 15.7 (40) | 11.7 (102) |
| Precision | 14.8 (67) | 3.2 (276) |

- **Kjerag (freezing) is already fine:** the bots get about what humans get.
- **Laterano (ammo) is not:** 10 a round against 59. Foresight (1 against 21) and Precision (3 against 15) are the other
  big gaps. Why (which operators are deployed, Mostima's neighbours) is the next thing to look at.

**Turnover still differs** (buys 68 against 30, sells 48 against 14 per match), but the split says it buys fewer
stacks directly than it seemed. Its main effect is probably reaching the stackers and the merges sooner.

## Investor

Investor (投资人) has one threshold:
- **3 members, Bench included.** Then 获得时 effects trigger twice (3 times at 100 stacks), which doubles the engine
  above.
- **Members:** only five operators: Tin Man (tiers 1 and 2), Swire the Elegant Wit (Yan, tier 3), SilverAsh the
  Reignfrost (tier 5), Mountain (tier 5).

| | Humans | Bots |
|---|---|---|
| Most Investor operators held at once: 0 / 1 / 2 / 3+ | 20 / 7 / 6 / 29 | 67 / 38 / 5 / 1 |
| 3 reached, round (median, range) | 10 (8–14) | 10 (one seat) |
| The trios | Tin Man + Swire EW + Mountain (15); Tin Man + Swire EW + SilverAsh (11); other (3) | — |

**67 of 111 bot seats never hold a single Investor operator.** Legacy's buy score values an operator for the board
and its bonds. A Bench-counted bond whose members are spread across tiers 1–5 never gets enough weight. Humans assemble
it around round 10, when level 5 shows the tier-5 members.

Investor alone doesn't explain the stacks. Human seats with Investor have 569 stacks, without it 461. Both are far
above the bots' 200, so the deployed stackers and items above are the bigger part.

## A first tactic: `plan-bond` (writes legacy's internal state)

Legacy already has a plan for its own seat: `ps._botSelf`, written each prep by `selfPlan`. It names the focus bond,
and legacy reads it everywhere:
- buying: a member it doesn't own scores + priority × 6;
- the lineup: the same weight;
- its sales: a member is kept while selling it would lower the bond's active tier (`planProtected`).

The external advisor uses the same channel (`aiPlan.js`), which also has `keep`, `buy` and `items` fields.

`plan-bond` (`server/match/botTacticsResearch.js`, branch `feature/bot-plan-tactics`) adds one bond to that plan from
a round on. Its parameters are the bond (default Investor), the priority (1–5) and the start round. It changes data
only, never an action. It's the first tactic for Fish's "a tactic that writes each variable of the internal state".

**Smoke run** (co-op Ultimate, seeds 1–3, 12 seats), priority 3 from round 6:

| | legacy | `plan-bond` |
|---|---|---|
| Most Investor operators held at once: 0 / 1 / 2 / 3 | 8 / 4 / 0 / 0 | 7 / 2 / 1 / 2 |
| Investor active | 0 of 12 | 2 of 12, at rounds 12 and 14 |

It changes play, but too late and too rarely at these settings.

**Measured** (`untracked/queue2-2026-11-12.sh` → `untracked/investor-2026-11/`, `compare-*.md`): co-op Ultimate seeds
1–40, all seats the same bot.

| | legacy | priority 3 from round 6 | priority 5 from round 4 |
|---|---|---|---|
| Wins | 27 | 26 (lost 6, gained 5; p 1.00) | 22 (lost 7, gained 2; p 0.18) |
| Reached the boss | 39 | 36 | 34 |
| Rounds passed (mean) | 13.70 | 13.53 | 13.43 |
| LP left (mean) | 36.8 | 32.3 | 31.7 |
| Bounties leaked | 56 | 53 | 68 |
| Stacks at rounds 7 / 10 / 13 (mean per team) | 40 / 111 / 258 | 37 / 104 / 265 | 36 / 103 / 266 |
| Leader damage (mean) | 3.16 M | 3.27 M | 3.53 M |

**Verdict: neither setting helps.** Stacks at round 13 barely move (+3 %), and both lose defence: fewer teams reach the
boss and less LP is left. Priority 5 is clearly worse. Chasing Investor through the plan's buy weight alone takes
board strength without enough stack return; the cheap members are weak units. If Investor is retried, it should be
the timing tactic below (members on the Bench, not the board), measured with records for how often it activates.

## A second tactic: `plan-engines` (writes legacy's internal state)

`plan-engines` (same file and branch, 78b911a6) puts the position stackers into the plan's `buy` list from a round on,
and the owned ones into `keep`:
- `buy`: legacy buys a listed operator outright when the shop shows it, above its reserve (`planSpendSteps`), and its
  copies until the merge;
- `keep`: +18 in the bench and sale scores.

Parameters:
- `kinds`: `pos` (空弦, 断崖, 引星棘刺, 见行者), or `pos+own`, which adds the prep-time "own active Alliances +n"
  operators (伊内丝, 赫默, 莱恩哈特, 蒂比);
- `fromRound` (4) and `toRound` (11);
- `max` (2): no new kinds are bought once that many are owned.

Like `plan-bond`, it changes data only.

**Measured** (`untracked/queue4-2026-11-12.sh` → `untracked/engines-2026-11/`, `compare-eng-pos*.md`). botbench,
co-op Ultimate seeds 1–40, against queue2's legacy, paired:

| | legacy | `eng-pos` | `eng-pos-own` (max 3) |
|---|---|---|---|
| Wins of 40 | 27 | 22 (7 lost / 2 gained, p 0.18) | 14 (15 / 2, p 0.002) |
| Reached the boss | 39 | 34 | 31 |
| LP left (mean) | 36.8 | 27.8 | 27.7 |
| Bounties leaked | 56 | 65 | 77 |
| Stacks at rounds 7 / 10 / 13 (mean per team) | 40 / 111 / 258 | 39 / 108 / 266 | 35 / 106 / 252 |
| Leader damage (mean) | 3.16 M | 3.48 M | 2.20 M |

The records (seeds 1–30, seat 0 Du Yaoye, against `dyy-2026-11/bot-legacy`; legacy there is main's, so the code
differs slightly): `eng-pos` deploys 空弦 1.03 rounds per seat in rounds 7–13 (legacy 0.40) and 断崖 0.80 (0.10), but
the median stacks stay at 38 / 87 / 156 at rounds 7 / 10 / 13 (legacy 35 / 100 / 150).

**Verdict: deploying the position stackers doesn't give the stacks the humans get, and costs defence.** The bots now
field 空弦 and 断崖 2–8× as often, and stacks rise by 3 % at most. `pos+own` is clearly worse. Why it fails is not
measured yet. Likely reasons:
- 空弦 / 断崖 are weak units, and they take a board slot from a fighter;
- their +3 goes to "each active Alliance" of the piece beside them, so it pays only next to a piece with several active
  Alliances (not checked: how many the bots' neighbours have);
- the placement problem (09): the rehearsal still leaves the front empty half the time. queue7 (the leak allowance)
  runs on top of `eng-pos` to test this one.

## A third tactic: `plan-items` (the plan, plus one buy step)

`plan-items` (same branch, f93e6db6) puts shop consumables into the plan's `items.buy` from a round on, up to the Final
Assault prep:
- `set`: `stack` (随身身份牌, 简易通讯机, 寻呼模块), `coin` (见钱眼开玩偶, 骑士储蓄罐, and 精打细算玩偶 while 5+ rounds remain), or
  `both`;
- `fromRound` (4) and `reserve` (0).

The plan alone wasn't enough: in two solo test matches the shop showed 见钱眼开玩偶 in rounds 4–5 and 寻呼模块 in rounds
8–10, and legacy's buy loop spent the funds on operators and refreshes first. So the tactic also buys the listed items
the shop shows before legacy's loop starts; legacy equips them itself. 盟约之币 and Isomorph are left out: the coin is
neutral, and Isomorph is DYYBot's step 3 (05).

**Measured** (`untracked/queue5-2026-11-12.sh` → `untracked/engines-2026-11/`, `compare-items*.md`). botbench, co-op
Ultimate seeds 1–40, against queue2's legacy, paired; `set` both:

| | legacy | `items` | `items-eng` (+ `plan-engines`) |
|---|---|---|---|
| Wins of 40 | 27 | 27 (7 lost / 7 gained) | 27 (8 / 8) |
| Reached the boss | 39 | 37 | 35 |
| LP left (mean) | 36.8 | 29.7 | 28.8 |
| Bounties leaked | 56 | 65 | 72 |
| Stacks at rounds 7 / 10 / 13 (mean per team) | 40 / 111 / 258 | 41 / 113 / 275 | 40 / 115 / 285 |
| Leader damage (mean) | 3.16 M | 3.63 M | 3.63 M |

The records (`items-eng`, seeds 1–30, seat 0 Du Yaoye; `records-items/`), per seat, with `eng-pos` alone on the same
code and seeds:

| | legacy (main) | `eng-pos` | `items-eng` |
|---|---|---|---|
| Median stacks at rounds 7 / 10 / 13 | 35 / 100 / 150 | 38 / 87 / 156 | 34 / 105 / 216 |
| Seats with 200+ stacks (of 120) | 58 | 60 | 69 |
| Matches won (of 30) | 8 | 11 | 16 |

**Verdict: the first tactic that moves stacks.** Buying the stack and coin consumables raises round-13 stacks by 7 %
(`items`) to 10 % (`items-eng`) in the means, and the records' median by 40 %. Leader damage rises by 15 %. Wins stay
the same on 40 seeds, and the funds cost some defence (more leaks, less LP). In the records `items-eng` won 16 of 30
against `eng-pos`'s 11 on the same code; that's suggestive, not significant. Next: the items' split (stack against
coin) and a reserve, so the defence cost shrinks.

## Fish's small tweaks (TODO, 2026-11-12): `plan-commit`, `plan-keepers`, `plan-combos`

Built on `feature/bot-plan-tactics`; all write legacy's plan, default-off, for the evolution pool:

| TODO item | Tactic (param) |
|---|---|
| Commit to Ægir if got Gladiia | `plan-commit` (`gladiia`): 歌蕾蒂娅 owned → Ægir into the plan bonds at `priority` (4) |
| Commit to Laterano if got Mostima or Executor | `plan-commit` (`laterano`) |
| Commit to Yan or Arcane if got Dusk | `plan-commit` (`dusk`): the one with more members owned |
| Commit to Kjerag if got SilverAsh Alter and 3 Kjerag | `plan-commit` (`silverash`) |
| Executor Alter over Ines if Foresight is active | `plan-keepers` (`executor`): 圣约送葬人 kept, 伊内丝 not |
| Take Yu and field Yu | `plan-keepers` (`yu`): taken from merge rewards (tier 6), kept |
| Swire in inventory, don't sell before the boss | `plan-keepers` (`swire`) |
| Put Archetto behind an operator with good Alliances | legacy's positional value already counts the front piece's active Alliances (§37.37) |
| 2 Marvel for cheaper refreshes | `plan-bond` with `bond: miraShip` (no new tactic) |
| Kjerag: Ascalon custom operator + Nevermeltice | `diy-picks` (below) fields custom operators; an Ascalon choice and the Nevermeltice pairing are not built yet |
| The copy combos and 圣约送葬人 (08 above) | `plan-combos` |

**`plan-combos` measured** (queue10, `untracked/combos-2026-11/`): botbench co-op 1–40 against queue2's legacy: wins
27 → 24 (7 lost / 4 gained, p 0.55), team stacks at round 13 703 → 706, leader damage 12.6 → 13.0 M; LP 36.8 → 29.3.
The records (seeds 1–30) show why nothing changes: **the pieces are bought, the combos don't form.**

| | legacy records | `plan-combos` records | Humans |
|---|---|---|---|
| 白面鸮 deployed (battles) / with a prep-start stacker in front | 53 / 6 % | 69 / 4 % | 103 / 59 % |
| 塞雷娅 deployed / with a prep-end stacker in front | 6 / 0 % | 41 / 17 % | 83 / 60 % |
| 白面鸮 battles with 空弦 also on the board; adjacent | — | 23 of 69; 6 | — |
| 塞雷娅 battles with a prep-end stacker on the board; adjacent | — | 36 of 41; 19 | — |

Two failures: the lineup often benches the partner, and when both are fielded the placement rarely puts the copier
behind it. The second is the 空弦 problem of 09: a copied prep-time trait is invisible to the rehearsal, so the
combo layout loses to any layout with one more kill. **Queued:** queue12, `plan-combos` with `legacy-arrange`
`prepTiebreak 1` and `leakAllow 1.5` (records and botbench, after queue11).

**`plan-commit` and `plan-keepers` measured** (queue11, `untracked/tweaks-2026-11/`, botbench co-op Ultimate 1–40,
paired against queue2's legacy; `untracked/paired.mjs`):

| Profile | Wins (legacy 27) | Better / worse seeds | p (McNemar) | Score diff (t) |
|---|---|---|---|---|
| `plan-commit` | 27 | 3 / 3 | 1.00 | −0.007 (−0.11) |
| `plan-keepers` | 27 | 2 / 2 | 1.00 | +0.005 (+0.09) |
| `plan-combos` (queue10) | 24 | 4 / 7 | 0.55 | −0.067 (−0.75) |
| all three together | **20** | 1 / 8 | **0.04** | −0.168 (−2.21) |

Each alone changes almost nothing (they act on a few seeds: the key operators are rare). Together they lose: the
combos and the commitments both pull the plan's buys and keeps, and the bench can't hold all of it. They stay in the
evolution pool one by one, default off; the race decides whether any pair works.

**`place-copiers` measured** (queue15, 6fe043c0; `untracked/combos-2026-11/`). After the rehearsed layout, it moves a
copier onto the tile behind its partner. Placement in 30 recorded co-op Ultimate games (seat 0), share of the
copier's battles with a partner in front:

| | `plan-combos` | `plan-combos` + layout tie-break (`combos-place`) | `plan-combos` + `place-copiers` | Humans |
|---|---|---|---|---|
| Ptilopsis | 5 % | 2 % | **38 %** | about 49 % |
| Saria | 15 % | 25 % | **71 %** | about 50 % |

The placement gap is closed. Wins (botbench 1–40, paired against legacy's 27):

| Profile | Wins | Better / worse seeds | p (McNemar) |
|---|---|---|---|
| `copiers` (`place-copiers` + `plan-combos`) | 24 | 4 / 7 | 0.55 |
| `copiers-only` | 27 | 0 / 0 | 1.00 |
| `combos-place` (queue12) | 22 | 5 / 10 | 0.30 |

`copiers` wins the same as `plan-combos` alone (24). The placement doesn't cost wins, but doesn't add any either.
`copiers-only` matches legacy on every seed: without `plan-combos` buying the pairs, the bots seldom own both.

## Custom operators for bots: `diy-picks` (2026-11-12)

Fish: "I thought I was already asking for bots to use custom operators. yes, 100% I approve". Until now bots never
had custom operator picks: only a human's seat got them (`PlayerState`: `if (!this.isBot && seat.diy)`).

**What the humans pick.** The records don't store the picks, but the battle specs carry each fielded custom piece
(`untracked/dyy-2026-11/`, clean Hard/Ultimate games, seats that passed ≥ 10 rounds): 17 of 62 human seats fielded
one. Tier 5: Ch'en the Dawnstreak S3 (6), Kal'tsit·Esperanta S2 (4), Clementia (2); tier 6: Togawa Sakiko S3 (2),
Angelina the Mellow Wish, Wang (1 each). (A first count that also took cheat games, with booster packs, had 67 of 269
and Sakiko first: cheat games are left out everywhere below.)

**Built** (`feature/bot-plan-tactics` c72a5eea): a tactic may now declare `diyPicks(params)`. The match calls it for
each bot seat at setup, before the custom stock is drawn, so it also works once bots run in the browser. `diy-picks`
params: `t5a`, `t5b`, `t6a`, `t6b` (none, Ch'en the Dawnstreak, Shu, Wang, Kal'tsit, Logos, Sakiko, Haruka,
Goldenglow; each with the humans' favourite skill and module), and `buy` / `keep`. Defaults: Fish's (05): Ch'en the
Dawnstreak and Shu on tier 5, nothing on tier 6.

A first smoke run showed the shop offering the pieces in rounds 10–14 and legacy never buying them: with a full board
it buys a new operator only when the lineup improves, and a lone piece seldom does. So `buy` / `keep` put the slotted
pieces into legacy's plan (buy +24, keep +18); then they were bought in 2 of 4 seeds, one merged into an elite.

**Measured** (queue13, co-op Ultimate, 40 seeds, paired against legacy's 27 wins):

| Profile | Wins | Better / worse seeds | p (McNemar) |
|---|---|---|---|
| `diy` (Ch'en the Dawnstreak S3 + Shu S3, bought and kept) | 23 | 5 / 9 | 0.42 |
| `diy-saki` (+ Sakiko S3 on tier 6) | 27 | 8 / 8 | 1.00 |
| `diy-nobuy` (picks only) | 27 | 6 / 6 | 1.00 |

No significant change. The pieces do arrive: in 8 recorded `diy` games, 18 of 32 bot seats owned one. But they
arrived late, between round 7 and 14 (usually about round 11), and fought in 1–5 battles each. Tier-5 pieces need the
shop level the bots reach late. So the picks work, but too late to change much. Kept in the pool.

**The Isomorph gap (Fish: the custom operator in Ægir is "to give a huge buff to a core dps operator who is at the
start of the snake").** Morph Isomorph worn with an Alliance item makes its wearer a member of that Alliance. In the
battle specs:

| Clean games | Humans | Bots |
|---|---|---|
| Seats that wear an Isomorph (`isomorph.mjs`) | 37 of 62 (60 %) | 16 of 111 (14 %) |
| Paired with an Alliance item (seat × item) | Victoria 32, Kjerag 13, Precision 6, Arcane 5, Ægir 3, … | Yan 3, Kjerag 1, Sargon 1, Swift 1 |

Most bots that wear one wear it alone, where it grants no Alliance. The few human Ægir carriers are damage dealers
(Pramanix the Prerita, Exusiai the alter, Archetto). Humans also get more Isomorphs: 0.8 a seat from merge rewards
against 0.2, because they merge twice as often (below). Next tactic: put the
Isomorph and an Alliance item on the main damage dealer, and for Ægir place it where the chain feeds it.

## The economy gap: humans cycle, merge and buy items (2026-11-12)

Fish: "keep it up with investigating human games and learning from them". A broad per-seat comparison
(`untracked/dyy-2026-11/gaps.mjs`, `econ.mjs`, `cycle.mjs`): clean Hard/Ultimate games, seats that passed ≥ 10
rounds. Humans: 62 seats (38 co-op Ultimate, 20 solo Ultimate, 4 co-op Hard); bots: 111 legacy seats, co-op Ultimate.

| Per seat | Humans | Bots |
|---|---|---|
| Gold spent | 228 | 142 |
| Operators bought (R1–4 / R5–8 / R9+) | 6.5 / 9.5 / 38.5 | 9.4 / 6.7 / 13.1 |
| Operators sold | 48 | 14 |
| … sold in the round they were bought | **25.6** | 3.1 |
| Merges | 9.1 | 4.8 |
| Items bought (gold) | 13.4 (29) | 0.6 (2) |
| Items equipped | 31 | 3.7 |
| Refreshes | 50 | 40 |
| Shop freezes | 3.6 | 1.2 |
| Round 5: LP / elites / active Alliances | 22.9 / 0.4 / 1.5 | 32.0 / 1.2 / 2.9 |
| Round 12: LP / elites / items held / layers | 13.3 / 2.9 / 3.9 / 421 | 10.7 / 1.8 / 0.7 / 134 |

Humans play a weaker early game (lower LP at round 5, fewer elites and Alliances) and a much richer late one. The
stacks gap of the earlier sections is mostly an **economy** gap.

**Cycling.** Most of the extra buying is buy-and-sell in the same prep, from round 9 on, of operators whose trait
fires when gained or sold. Net cost is the price minus the sale (mostly 3 − 1 = 2; Minimalist costs 1, so 0):

| Cycled (per seat) | Trait |
|---|---|
| Minimalist 2.5 | buys for 1: free to cycle (an on-gain trigger for whatever counts gains) |
| Pinecone 1.8 | on sale: a free tier-1 special recruit (tier 5 once she is elite) |
| Ashlock 1.5 | on gain: +3 layers to the most-stacked active Alliance |
| Swire 1.4 | on gain: an Alliance Coin |
| Wild Mane 1.3, Gnosis 0.9 | on gain: +2 / +5 layers to their own Alliances (no activation needed) |
| Texas 1.3, Provence 1.1 | a free refresh on sale / on gain |
| Flametail 1.2 | on gain: a Wild Mane or Greyy (a second trigger) |
| Exusiai 1.0 | on gain: +1 gold next prep |
| Kjera 0.9 | on gain: a Nevermeltice |
| Mudrock 0.9 | on sale: +2 gold next prep (net 0) |

The Alliances most often active while cycling: Elite, Agile, Foresight, Laterano, Solo. queue3's `trade1.5` (legacy's
own trade at half the bar) was worse; it trades by lineup value, not by trait. A trait-driven cycle is a different
tactic.

**`cycle-econ` measured** (queue14, 81669c73; `untracked/cycle-2026-11/`, botbench co-op Ultimate 1–40, paired
against legacy's 27). It buys an operator whose trait pays back and sells it in the same prep:

| Profile | Wins | Better / worse seeds | p (McNemar) | Score diff (t) |
|---|---|---|---|---|
| `cycle` (defaults: profit ≥ 0, ½ gold per layer) | 23 | 6 / 10 | 0.45 | −0.080 (−0.71) |
| `cycle-strict` (profit ≥ 1) | 26 | 0 / 1 | 1.00 | −0.046 (−1.38) |
| `cycle-free` (no reserve) | 25 | 5 / 7 | 0.77 | −0.043 (−0.44) |

None helps. `cycle-strict` changed the outcome of just one seed, so a profit bar of 1 almost never lets it buy. The
looser versions cycle and win a little less, but not significantly. Humans cycle where a stacker is deployed (above),
and the bots seldom have one deployed, so the cycle mostly feeds nothing. It stays in the pool; paired with
`plan-engines` (which deploys the stackers) is the race's call. `buy-minimalist` (queue17) is the cheapest case.

**Shop items.** Legacy buys an item only to complete an item merge (§37.39). The humans' items are mostly economy:
Simple Communicator 1.5, Money-Grubbing Doll 1.3, Knightly Savings 1.2, Alliance Coin 1.2, Dispatch Module 0.9,
Mimic Matter 0.6, Originium Solvent 0.6, Budget-Savvy Doll 0.5, then Alliance items (Victorian Hammer 0.5, Arcane Arts
Circle 0.4, …).

## Fish's TODO tactics, measured (queues 16–17, 2026-11-12)

botbench co-op Ultimate 1–40, paired against legacy's 27 wins (`untracked/carryiso-2026-11/`, `untracked/todo-2026-11/`):

| Profile | TODO item | Wins | Better / worse seeds | p (McNemar) | Score diff (t) |
|---|---|---|---|---|---|
| `carry-iso` | Isomorph + Alliance item on the carry | 27 | 0 / 0 | 1.00 | 0 |
| `carry-iso-any` | the same, any active Alliance | 27 | 0 / 0 | 1.00 | 0 |
| `carry-iso-buy` | + `plan-iso` | 23 | 1 / 5 | 0.22 | −0.102 (−1.58) |
| `marvel` | 2 Marvel (`plan-bond miraShip`) | 23 | 3 / 7 | 0.34 | −0.112 (−1.28) |
| `minimalist` | always buy Minimalist, sell at once | 26 | 2 / 3 | 1.00 | −0.015 (−0.25) |
| `minimalist-merge` | always buy Minimalist, keep a pair | 29 | 5 / 3 | 0.73 | +0.054 (+0.69) |
| `ammo` | Mostima next to an ammo user | 29 | 2 / 0 | 0.50 | +0.064 (+1.58) |
| `ascalon` | Ascalon S2 + Nevermeltice | 29 | 9 / 7 | 0.80 | +0.046 (+0.43) |

- **`carry-iso` never fired:** identical to legacy on every seed. Legacy's own Isomorph rule (morphPlan) equips a new
  Isomorph in the same prep it arrives, before the Alliance item `carry-iso` asks for can be bought. To work, it has to
  hold the Isomorph until the item comes: built (491b87c1, the plan's `items.hold`, which legacy's equip loops skip),
  rerun in queue18. Then, after Fish's note that humans equip either item first on a carry they've planned, the
  default became `order: either` with the carry kept across rounds (176fb58c, queue19); `hold` stays as an option. `carry-iso-buy`'s loss is
  `plan-iso`'s merge-reward picks (05).
- **Three small positives:** `minimalist-merge`, `ammo` and `ascalon` each win 2 more than legacy. None is
  significant, and `ammo` changed only 2 seeds (Mostima with an ammo user is rare). Into the race pool.
- **`marvel`:** 4 fewer wins, not significant. Like `plan-bond` for Investor, a forced Alliance plan pulls the
  buys away from the lineup.

## Next tactics (not built)

1. **Investor timing:** hold Tin Man and Swire EW on the Bench from early on, and look for the tier-5 member at
   level 5.
2. **Cycling:** from round 7, buy the cheapest operator that feeds an active 获得时 or engine rule and sell it next
   prep. Lower priority after the split above. queue3's `trade1.5` (legacy's own trade at half the bar,
   co-op Ultimate seeds 1–40, paired) tested the cheap version: **worse.** Wins 27 → 23 (8 lost / 4 gained, p 0.39),
   round-13 team stacks 703 → 650, leader damage 12.6 M → 10.4 M. With Investor at priority 5 it is clearly worse
   (17 wins, p 0.03; stacks 534). Trading more with legacy's trade rule churns the board without feeding a stacker.

**Queue order** (log `untracked/queue-2026-11-12.log`): the balance sweep and the DYY baseline → queue2 (Investor) →
queue6 (DYY Isomorph, 05) → queue4 (`plan-engines`) → queue5 (`plan-items`) → queue3 (`trade1.5`) → queue7 (the
leak allowance, 09). queue4 and queue5
run in sp-plan-run2 at 58d6c04a; their tactics' code is the same as at 78b911a6 and f93e6db6.

**To measure:** stacks (botbench `--layers`) and boss damage, paired by seed against legacy. Wins alone need hundreds
of seeds (07).

## Fish's gift scenarios (queue27, 2026-11-13)

Every gift at round 5's prep (`untracked/scenario-2026-11/gifts/`), solo Ultimate, the bot's own Strategy pick, seeds
1–80, paired by seed. Code 27002c44. Ascalon is a custom operator only (no shop piece), so the Kjerag gift is SilverAsh
the Reignfrost, Pramanix and Gnosis, and its tactic profile adds her through `diy-picks`. "Swire" is the Foresight one.

| Gift | Legacy with it (no gift: 27) | p | Tactic profile | With it | p |
|---|---|---|---|---|---|
| Foresight (Ines, Swire) | 43 (+25 / −9) | 0.01 | plan-bond Foresight | 40 (+8 / −11) | 0.65 |
| Investor (Mountain, Tin Man) | 28 (+13 / −12) | 1.00 | plan-bond Investor | 31 (+11 / −8) | 0.65 |
| Kjerag (3) | 62 (+40 / −5) | < 0.001 | plan-commit + diy-picks Ascalon | 63 (+12 / −11) | 1.00 |
| Gladiia | 40 (+22 / −9) | 0.03 | **plan-commit (Ægir)** | **27 (+7 / −20)** | **0.02** |
| Kazimierz (3) | 46 (+25 / −6) | < 0.001 | plan-bond Kazimierz + place-fartooth | 46 (+14 / −14) | 1.00 |
| Laterano (3) | 45 (+26 / −8) | < 0.001 | plan-commit + place-ammo | 38 (+9 / −16) | 0.23 |

- **Legacy scales from five of the six gifts by itself**, Kjerag most (27 → 62 of 80). It already builds around a
  strong start; "does the bot know how to scale" is yes for these.
- **Except Investor**: two Investor operators change nothing (28 vs 27). The same gap as the records (Investor active
  in 30 of 62 human seats, 1 of 111 bot seats); `plan-bond` doesn't close it (31, n.s.).
- **Committing to Ægir on Gladiia loses** (40 → 27): `plan-commit` steers legacy into Ægir, and with only Gladiia that
  costs more than legacy's own choice. Fish's tweak "Commit to Aegir if got Gladiia" doesn't work as drafted for bots.
- The others: no gain over legacy with the same gift.
