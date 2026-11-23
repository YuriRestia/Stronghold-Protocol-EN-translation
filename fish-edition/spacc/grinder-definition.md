# SPA-CC bot grinder: a proposed rubric (#124 level 3; Fish's TODO, 2026-11-18)

Today's rubric (#168): 100 × solo Ultimate win rate + 100 × 4-man Ultimate win rate (4 clones), 0–200. Level 3 adds
entries of the form "100 × solo Ultimate win rate with these tags on".

## The data

- **Humans:** Fish's records of 2026-11-18 (`logs/records-4.tar.xz`, 271 matches, 2026-10-27 to 11-17, all with a human
  seat). 146 have Risk tags; 127 of those are on Ultimate, 61 of them with no cheat on (11 won). Analysis:
  `untracked/spacc-grinder-2026-11/human-tags.mjs` → `human-tags.md`.
- **Bots:** botbench, solo Ultimate, paired seeds from 762481 (random start), on `mini/0.3.3-2` after #166. The bot
  doesn't know the tags (`--rules`), so this is what a tag costs a tag-unaware player. Raw:
  `untracked/spacc-grinder-2026-11/` (`tagcost/`, `sets/`, `big/`).

## 1. What humans take

**Picks** (Ultimate, no cheat, 61 matches): Activation 54, Swift 52, Strategy 47, Foresight 46, Barge 46, Deep
Infiltration 43, Low Efficiency 43, Junk 41, Lockout 41, Vengeance 39, Last Line 35, Elements 34, Suffocation 33, Intern
33, OZ Physical 30, Investor 28, OZ Arts 26, Patriot 24, Delegation 20, **Famiglia 9**.

**Humans play one kit and add to it.** The common pairs are all inside the same group: Swift, Strategy, Foresight,
Barge, Deep Infiltration, Low Efficiency, Junk, Last Line (Deep Infiltration + Low Efficiency are the tightest pair, lift
1.42). On top, players add the combat and boss tags at their lowest level: Activation 1, Lockout 1, Suffocation 1,
Vengeance 1, OZ Arts. Famiglia, Delegation and Patriot are the least picked.

**The clean clears** (no cheat, Ultimate):

| Date | Seats | Risk | Seeded | Tags |
|---|---|---|---|---|
| 2026-11-05 | 1 human | **26** | yes | Investor 2, Swift, Foresight, Strategy 2, Intern, Barge 2, Suffocation 3, Activation 3, Elements 1, Deep Infiltration, Low Efficiency, Last Line, Junk 2, OZ Arts, OZ Physical, Patriot 1, Delegation 1, Vengeance 1 |
| 2026-11-04 | 1 human | 22 | yes | Investor 2, Swift, Foresight, Strategy 2, Barge 2, Suffocation 2, Activation 3, Deep Infiltration, Low Efficiency, Junk 2, OZ Arts, OZ Physical, Patriot 1, Delegation 1, Vengeance 1 |
| 2026-11-04 | 1 human | **18** | | Swift, Foresight, Strategy 2, Intern, Barge 2, Suffocation 1, Activation 1, Elements 1, Deep Infiltration, Low Efficiency, Last Line, Junk 2, Lockout 1, Famiglia Cleaner 1, Vengeance 1 |
| 2026-11-04 | 1 human | 15 | yes | Investor 2, Swift, Foresight, Strategy 2, Intern, Elements 2, Deep Infiltration, Low Efficiency, Lockout 3, Famiglia Cleaner 1 |
| 2026-11-05 | 1 human | 15 (×3) | | Swift, Foresight, Strategy 2, Barge 1, Suffocation 1, Activation 1, Deep Infiltration, Low Efficiency, Last Line, Junk 2, OZ Arts, Lockout 1, Vengeance 1 |
| 2026-11-08 | 4 humans | 15 | yes | Swift, Foresight, Intern, Barge 2, Suffocation 1, Activation 1, Elements 1, Junk 2, OZ Arts, OZ Physical, Lockout 1, Famiglia Cleaner 1, Vengeance 1 |
| 2026-11-04 | 3 humans | 10 | | Swift, Foresight, Strategy 2, Intern, Barge 1, Suffocation 1, Activation 1, Junk 1, Patriot 1 |

The Risk 15 set of 2026-11-05 was played 3 times and won 3 times: it's the community's standard kit. With cheats on,
people go to Risk 39 (every tag at its top); the full list is in `human-tags.md`.

Note: #121 (last updated 2026-11-05 from the older records) lists Risk 15 as the solo record; these records add the
Risk 18, 22 and 26 clears. #121 is due a refresh.

## 2. What each tag costs a bot (evobot, one tag at a time, 40 seeds; no tags: 15 of 40)

| Tag version | Risk | Wins of 40 | |
|---|---|---|---|
| Activation 2, 3 · Elements 2 · Lockout 1, 2, 3 · Famiglia Unending 2, 3 · Patriot 2, 3 | 1–3 | **0** | wall |
| Patriot 1 | 1 | 1 | wall |
| Famiglia Seasonal 3 · Elements 1 | 3 · 1 | 2 | near-wall |
| Activation 1 · Famiglia Seasonal 2 · Suffocation 3 | 1 · 2 · 3 | 5 | heavy |
| Delegation 1, 2, 3 · Suffocation 2 · Famiglia Cleaner 1 · OZ Physical · Vengeance 2 | 1–3 | 6–9 | heavy |
| Vengeance 3 · Strategy 1, 2 | 3 · 1–2 | 11–12 | light |
| Foresight · Junk 1, 2 · Last Line · Suffocation 1 · Vengeance 1 | 1–2 | 13 | light |
| Low Efficiency · OZ Arts · Swift · Intern | 1 | 14 | ~free |
| Deep Infiltration · Investor 1, 2 · Barge 1, 2 | 1–2 | 15–17 | free (noise) |

(±1 SD on 40 matches is about ±3 wins, so only the walls and the free tags are firm.)

**Humans and bots agree on what's cheap.** The human kit is the bot's free and light tags. Where they part is the
boss: humans add Activation 1 and Lockout 1 and win, while any boss tag stops the bot. **The bots' weakness is boss
damage**, not SPA-CC as such.

## 3. Sets, and how bots score on them (solo Ultimate)

| Set | Risk | What it is | Evobot | Legacy |
|---|---|---|---|---|
| No tags | 0 | | 78 / 200 | 75 / 200 |
| **H5** | 5 | human kit, small: Swift, Foresight, Deep Infiltration, Low Efficiency, Strategy 1 | 13 / 40 | 15 / 40 |
| **H10** | 10 | human kit: Swift, Foresight, Strategy 2, Barge 1, Deep Infiltration, Low Efficiency, Junk 2, Last Line | 5 / 40 | 8 / 40 |
| **F9** | 9 | the other cheap tags: Investor 2, Barge 2, Deep Infiltration, Swift, Intern, OZ Arts, Low Efficiency | 38 / 200 | 41 / 200 |
| **C3** | 3 | light combat: Suffocation 1, Vengeance 1, OZ Physical | 32 / 200 | 31 / 200 |
| S1 | 5 | Investor 1, Swift, Strategy 1, Barge 1, Junk 1 | 55 / 200 | 54 / 200 |
| S2 | 5 | Suffocation 1, Vengeance 1, Delegation 1, OZ Arts, Last Line | 9 / 200 | 6 / 200 |
| S3 | 10 | Investor 2, Strategy 2, Barge 2, Junk 2, Intern, Foresight | 35 / 200 | 24 / 200 |
| S4 | 11 | Suffocation 2, Vengeance 2, Delegation 2, Deep Infiltration, Low Efficiency, OZ Physical, Famiglia Unending 2 (no wall) | 0 / 40 | 0 / 40 |
| **H15** | 15 | the human standard kit (won 3 of 3) | 0 / 40 | 0 / 40 |
| **H18** | 18 | the solo unseeded record | 0 / 40 | 0 / 40 |
| **S5** | 15 | the solo seeded record of 2026-11-04 (run unseeded) | 0 / 40 | 0 / 40 |
| **S6** | 15 | bosses, low levels: Activation 1, Elements 1, Lockout 1, Patriot 1, Famiglia Seasonal 2, Suffocation 3, Vengeance 3, Delegation 3 | 0 / 40 | 0 / 40 |
| S7, S8 | 21, 25 | bosses at higher levels | 0 / 40 | 0 / 40 |

(Sets as `--rules` strings: `sets.txt`, `sets-extra.txt`, `sets-human.txt` in `untracked/spacc-grinder-2026-11/`.)

**Reading.**
- **Tags compound.** S4 has no wall and its tags cost evobot 6–9 wins each, yet together it's 0. Even the cheap tags
  add up (F9: seven nearly free tags, 38 of 200).
- **Only Risk ≲ 10 separates today's bots**, and combat tags cost far more per Risk than economy tags (S2 at Risk 5 is
  harder than F9 at 9).
- **Evobot and legacy can't be told apart here.** On 200 paired seeds no set separates them (p ≥ 0.1; without tags 78
  vs 75). Evobot's edge is real but small (3 points, proven on 2,000 seeds), so a grinder that ranks bots this close
  needs several hundred matches per set.

## 4. Proposal

Score on human-shaped sets; keep the human records and one boss set as headroom.

| Entry | Weight | Why |
|---|---|---|
| Solo Ultimate (today) | 100 | |
| 4-man Ultimate (today) | 100 | |
| **H5** | 100 | the human kit at Risk 5: what a casual SPA-CC player takes |
| **H10** | 100 | the full human kit, no boss tags |
| **F9** | 100 | the cheap tags humans take less (Investor, Barge 2, Intern, OZ Arts) |
| **C3** | 100 | the lightest combat tags |
| **H15** | 100 | headroom: the community's standard kit (won 3 of 3 by humans; bots 0) |
| **H18** | 100 | headroom: the solo record without seeding |
| **S5** | 100 | headroom: the solo seeded record of 2026-11-04 (Elements 2, Lockout 3, Investor 2), run unseeded |
| **S6** | 100 | headroom: the boss tags at low levels; the only set with Patriot and Delegation |

- Maximum 1,000. Evobot today: 44 (solo) + 78 (team) + about 33 + 13 + 19 + 16 (the four scored sets) + 0 × 4 ≈ 200.
- **Coverage:** every tag at some level, 27 of the 41 versions (without S5 and S6: 20, and no Patriot or Delegation).
  The rest are higher levels of Activation, Lockout, Patriot, Famiglia, Delegation, Suffocation and Vengeance: harder
  versions of tags already in, on which every bot scores 0. S4, S7 and S8 would cover them all, for three more
  zeros.
- **Seeded:** humans' best clears were seeded (an RNG reducer on). The grinder runs unseeded, like the bench; the
  seeded records (Risk 22, 26) could come in as headroom with their seeding rules if Fish wants them.
- **Matches:** 200 seeds per set would separate bots about 10 points apart; evobot vs legacy (3 points) would need
  about 2,000 per set. At ~20 CPU-seconds a match, 8 sets × 200 seeds is under 2 hours here.

## 5. The combinatorial alternative

Each match draws its tags at random (each version on with some probability), and the score is the Risk-weighted win
rate.

- **For:** covers combinations no fixed list does, and a bot can't be tuned to a known list.
- **Against:** much noisier for the same matches, and walls make it worse: walls sit in 5 of the 20 tags (Activation,
  Elements, Lockout, Famiglia, Patriot), so a draw above Risk 5 likely contains one and scores 0 for every bot today.
  Fixed sets can also be shown on the AI profiles popup; a distribution can't.
- **Verdict:** fixed sets now. If wanted later, draw from the human pick rates (section 1), so the draws look like real
  games.

## 6. Co-op: the same sets, or its own? (Fish's question; benched 2026-11-19)

Team of 4 evobots (`coop4:ABYSS`, Ultimate), 40 seeds from 762481, beside the solo numbers above (±1 SD at 40 seeds is
about ±3 wins, ±8 points):

| Set | Solo | Team of 4 | |
|---|---|---|---|
| No tags | 39% | 73% | |
| H5 | 33% | 63% | the economy tags cost about the same share in both modes |
| H10 | 13% | 30% | |
| F9 | 19% | 30% | |
| C3 (light combat) | 16% | **55%** | combat tags cost far less in co-op |
| Activation 1 alone | 13% | **45%** | so do boss tags: the whole team damages the boss |
| Patriot 1 alone | 3% | **23%** | |
| Lockout 1 alone | 0% | 0% | still a wall |
| CB2: Activation 1 + Patriot 1 | — | 15% | |
| H10B: H10 + Activation 1 | — | 15% | |
| CO10: the 3-human co-op clear (Risk 10, 2026-11-04) | — | 5% | |
| CO15: the 4-human co-op clear (Risk 15, seeded, 2026-11-08; run unseeded) | — | 0% | |
| H15, H18, S5, S6 | 0% | 0% | |

**Reading.** Your hunch holds for combat and boss tags: they're much easier in co-op, while the economy tags cost about
the same in both modes. In co-op, the boss tags (the bots' main weakness) score above zero, so co-op is where a better
boss bot would show first.

**Draft: a co-op list of its own** (8 sets, 100 each, like solo):

| Co-op set | Evobot | Why | Also in solo? |
|---|---|---|---|
| H5 | 63% | the casual kit | yes |
| H10 | 30% | the full human kit | yes |
| C3 | 55% | light combat | yes |
| **CB2** | 15% | Activation 1 + Patriot 1: boss damage, measurable only in co-op | no (replaces F9: economy tags behave as in solo, so F9 adds little) |
| **H10B** | 15% | the human kit plus Activation 1 | no |
| **CO10** | 5% | headroom: what 3 humans cleared | no (replaces H18, the solo record) |
| **CO15** | 0% | headroom: what 4 humans cleared | no (replaces S5, the solo seeded record) |
| S6 | 0% | headroom: the boss tags at low levels | yes |

Evobot would score about 183 on this list, against about 178 on the solo sets played as 4-clone.

**Recommendation: separate lists, sharing four sets (H5, H10, C3, S6).** Split the level-3 weight 50/50 between the
solo list and the co-op list.
- It measures what is actually different about co-op. Under a plain 50/50 split on the same sets, the co-op half
  measures the economy tags twice. It also puts 200 points on two solo records (H18, S5) that no co-op team, human or
  bot, has been shown to reach, and has no boss-tag gradient.
- Its headroom comes from real co-op clears (CO10, CO15) rather than solo records.
- The four shared sets keep solo and co-op comparable set by set.
- Cost: 12 distinct sets instead of 8, but the same number of matches. Every set is played once per mode either way.

A plain 50/50 split on the same sets would be fine if simplicity matters more: the totals come out almost the same
today (about 178 vs 183). They only drift apart once a bot gets better at bosses.

## Running a set (anyone, from git alone)

Fish's answers (2026-11-18): the eight sets below, 100 each; no fuller coverage for now. With #171,
`tools/bench-share.mjs` takes `--rules`, so each set is a shareable compute job (`fish-edition/COLLABORATION.md`):

```
node tools/bench-share.mjs run --a legacy --b evobot --config solo:ABYSS --seeds 200 --rules <the set's string>
```

| Set | `--rules` |
|---|---|
| H5 | `ccSwift=1,ccForesight=1,ccDeepInfiltration=1,ccLowEfficiency=1,ccStrategyLate=1` |
| H10 | `ccSwift=1,ccForesight=1,ccStrategyLate=2,ccUpgrade=1,ccDeepInfiltration=1,ccLowEfficiency=1,ccJunk=2,ccLastLine=1` |
| F9 | `ccInvestorBench=2,ccUpgrade=2,ccDeepInfiltration=1,ccSwift=1,ccTier1Price=1,ccOzArts=1,ccLowEfficiency=1` |
| C3 | `ccSpRecovery=1,ccVengeance=1,ccOzPhys=1` |
| H15 | `ccSwift=1,ccForesight=1,ccStrategyLate=2,ccUpgrade=1,ccSpRecovery=1,ccBoss=1,ccDeepInfiltration=1,ccLowEfficiency=1,ccLastLine=1,ccJunk=2,ccOzArts=1,ccLockout=1,ccVengeance=1` |
| H18 | `ccSwift=1,ccForesight=1,ccStrategyLate=2,ccTier1Price=1,ccUpgrade=2,ccSpRecovery=1,ccBoss=1,ccLeaderDr=1,ccDeepInfiltration=1,ccLowEfficiency=1,ccLastLine=1,ccJunk=2,ccLockout=1,ccFamiglia=1,ccVengeance=1` |
| S5 | `ccInvestorBench=2,ccSwift=1,ccForesight=1,ccStrategyLate=2,ccTier1Price=1,ccLeaderDr=2,ccDeepInfiltration=1,ccLowEfficiency=1,ccLockout=3,ccFamiglia=1` |
| S6 | `ccBoss=1,ccLeaderDr=1,ccLockout=1,ccPatriot=1,ccFamiglia=4,ccSpRecovery=3,ccVengeance=3,ccDelegation=3` |
| CB2 (co-op draft) | `ccBoss=1,ccPatriot=1` |
| H10B (co-op draft) | `ccSwift=1,ccForesight=1,ccStrategyLate=2,ccUpgrade=1,ccDeepInfiltration=1,ccLowEfficiency=1,ccJunk=2,ccLastLine=1,ccBoss=1` |
| CO10 (co-op draft) | `ccSwift=1,ccForesight=1,ccStrategyLate=2,ccTier1Price=1,ccUpgrade=1,ccSpRecovery=1,ccBoss=1,ccJunk=1,ccPatriot=1` |
| CO15 (co-op draft) | `ccSwift=1,ccForesight=1,ccTier1Price=1,ccUpgrade=2,ccSpRecovery=1,ccBoss=1,ccLeaderDr=1,ccJunk=2,ccOzArts=1,ccOzPhys=1,ccLockout=1,ccFamiglia=1,ccVengeance=1` |

Co-op runs: the same command with `--config coop4:ABYSS`.

**What's worth running:** the four scored sets (H5, H10, F9, C3) at 1,000+ seeds each would put a real number on the
evobot-vs-legacy gap under tags (today it's within noise at 200). The headroom sets score 0 for both bots: 40 seeds is
enough to confirm a new bot still scores 0, more is wasted.

## Questions for Fish

- These eight sets (H5, H10, F9, C3 scored; H15, H18, S5, S6 headroom)? Or full version coverage (add S4, S7, S8)?
- Weights: 100 each, or more for higher Risk?
- Add the seeded records (Risk 22, 26) as headroom with their seeding rules?
- Co-op: a 4-man version of one set (e.g. H10 with 4 clones), or keep level 3 solo only?
- Refresh #121 from these records? (Its solo record is Risk 15; the records show 18 unseeded and 26 seeded.) - yes.

— Claude (orca)

I generally like the 8 proposed sets with 100 weight each. I considered extending up for fuller coverage, but the bots would score 0 on those categories right now, and extreme high risk may require extremely specific strategies and good RNG, which is not that great of a use of our bot research time. If our bots get much much better to where they can already play Ultimate+15, then we can revisit the question.

Solo vs 4-clone... I suppose there can be separate Solo and 4-clone entries. It would be simplest to split each entry as 50 weight solo and 50 weight 4-clone, but based on the human records, this might not actually be appropriate, as certain tags may be easier in coop? Try drafting a version that doesn't use the same tag sets for solo and 4-clone, and then comment on if you would recommend that vs just a 50/50 split.

orca (2026-11-19): drafted in §6 above. I recommend separate lists sharing four sets, 50/50 between them. — Claude (orca)

Fish (2026-11-19): approved the separate co-op list (§6).
