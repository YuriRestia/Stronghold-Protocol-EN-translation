Two new cheats into `mini/0.3.3-2`, as separate rules (Fish's comment on this PR: "I think they should be separate cheats").

Closes #174

Base: `mini/0.3.3-2`. Branch: `feature/stack-cap-9999`.

## Alliance Stack limit 9999

In the lobby's Cheats tab: every Alliance's Stack (layer) limit goes from 999 to 9999 for all Doctors. The 999 is the original game's cap; it now comes from `layerCapOf(rules)` in `shared/constants.js`, and every place that applies it uses that (prep gains, battle gains, the settle after a battle, the client-result check, the helper's stack count, the invariants check, the bond strip's live copy in the client). Off by default.

## No boss hit limit (new, separate)

The original game cancels any single hit of 300,000 or more on a Leader, in Final Assault and Hidden Core battles (`BOSS_HIT_LIMIT`, "限伤"). A cancelled hit does no damage at all. Boards at 999 Stacks already kill a Leader in 2 to 4 game seconds, so with ten times the Stacks most hits would pass 300,000 and be cancelled, which makes the boss *harder* to hurt. This cheat (`noHitLimit`) removes the limit; it is meant to go with the Stack limit cheat (the description says so) but works alone. The first version of this PR had the two bundled in one rule.

I first told Fish that I found no damage cap in the sim. That was wrong (I searched for the wrong names): the limit exists.

## Text

Three new texts in all four languages: "Alliance Stack limit {n}" with "Every Alliance's Stack limit goes from 999 to {n}", and "No boss hit limit" with "Normally a single hit of {limit} or more on a Leader is cancelled and does no damage; with this on there is no such limit (useful with the Alliance Stack limit cheat)".

Blind reads (fresh readers, base-game context only, the Cheats tab as a text copy):

| | Alliance Stack limit | Boss hit limit | Whole tab |
|---|---|---|---|
| Bundled, first wording | partly clear ("cancelled or dealt?") | (same line) | 55% |
| Bundled, reworded | read right | (same line) | 45% |
| Split | read right | read right: "removes that; meant for use with the Stack cheat" | 55% (the low scores are the old Transmitter+ and Isomorph lines) |

## Tests

`test/match/big-stacks.test.js` (both rules are cheats and off by default; `layerGainRoom` and `layerCapOf`; layers stop at 999 normally and 9999 with the rule; the hit limit cancels a 500000 hit, the Stack cheat alone does not lift it, `noHitLimit` does), `test/sim/playtest6_limits.test.js` (the battle's live copy clamps at 9999), the language, UI, rules and lobby tests, lint and typecheck pass locally. CI runs the full suite. I haven't clicked the toggles in a browser.

— Claude (orca)
