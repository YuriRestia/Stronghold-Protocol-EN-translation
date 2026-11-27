# 12. Bots with Mod Z picks (2026-11-18)

Question (#128, #142): can a bot use the Mod Z modules? Does a Mod Z custom pick play better than the same pick with
its official module?

## Setup

- Branch `research/modz-bots` (commit `b286f3de4`): #142 (Mod Z) merged with #137 (bot plan tactics). It adds Mod Z
  choices to `diy-picks` and a new tactic, `field-picks`: at `finishLayout` it swaps an owned custom piece onto
  the tile of the lowest-tier non-custom board Operator (never the only blocker or healer).
- Solo Ultimate, 600 paired seeds from 707635836 (random start), `botbench --jobs 8`. Scripts and raw results:
  `fish-edition/untracked/modz-bots/` (orca only).
- Variants, all built on evobot (`sell-singles`, `plan-items`):
  - **A:** evobot, Mod Z rule on.
  - **B:** `diy-picks` (Typhon Z, Fiammetta Z, Zuo Le Z, Thorns Z), official modules.
  - **C:** B with the Mod Z rule on.
  - **F:** B plus `field-picks`.
  - **G:** C plus `field-picks`.

## Results

| Variant | Wins of 600 |
| --- | --- |
| A | 234 (39.0 %) |
| B | 183 (30.5 %) |
| C | 184 (30.7 %) |
| F | 70 (11.7 %) |
| G | 74 (12.3 %) |

Paired (seeds won by the second, lost by it; exact sign test):

- A → B: +70 / −121, p = 0.0003. Spending the tier 5–6 custom picks costs about 8 points even though the pieces rarely
  reach the board (legacy's lineup scores Alliances, and custom pieces have none).
- B → C: +1 / −0. Unfielded, the module can't matter.
- B → F: +1 / −114, p ≈ 10⁻³². Fielding them in place of the weakest Operator is a disaster: the swap breaks
  Alliance counts, and the plan never builds around the custom piece.
- F → G: +4 / −0, p = 0.13. Fielded, Mod Z is slightly better than the official module, as expected, but far too
  small to make picking worth it.

## Conclusion

- A bot gains nothing from custom picks as they're built now, with either module. Mod Z's difference is real in
  direction but tiny next to the cost of the pick itself.
- So the bench can't judge Mod Z balance: that stays with human play and the per-operator benches
  (`operator-mod-z/*.md`, team-bench).
- To make it useful, a bot would have to plan its lineup around the custom piece (count it toward the Alliances it
  holds, or keep its slot), which is new tactic work and falls under the EOS freeze. Not planned.

## Evolution race (2026-11-18)

`evolve.mjs --race --budget 2400 --pool diy-picks,field-picks,sell-singles,plan-items --rules modZ=ALL --seed 17`,
training seeds from 62065712, 5 iterations, 1,860 matches. Results in `untracked/modz-bots/race/`.

- No profile with `diy-picks` survived. In iteration 0, `diy-picks()` alone scored +0.041 per match against legacy
  (16 of 40), below the item and sell tactics.
- `field-picks` led early only in profiles without `diy-picks`, where it never fires (nothing custom is owned), so it
  was noise. The search dropped it by iteration 2.
- Best: `plan-items(fromRound=7)`, +0.094 per match against legacy (71 of 160). The next three are `plan-items`
  variants, the same tactic evobot already uses.

The race agrees with the bench: no tuning of the current pick tactics helps a bot. Closed until a lineup tactic that
counts the custom piece exists.
