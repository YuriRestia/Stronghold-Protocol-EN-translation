Notes of the 2026-11-24 loop, into `mini/0.3.3-2`: only `fish-edition/` files (no code, no tests).

Base: `mini/0.3.3-2`. Branch `wip/loop-notes-2026-11-24`.

- `PLAYER_TEXT.md`: the style rule and the blind-read process for player text (every PR that adds or rewords text gets a fresh reader), with its log of reads.
- `STANDARD_LOOP.md`: scope by milestone instead of labels; the blind-read step; the current templates.
- `ai-players/04`: the boss-board placement ceiling test (a plain local search over tiles reaches the human layouts: 1.33x on their own layout, 1.26x from a random start) and the bot's own layouts on the same boards (a median 63% of the human damage; 5 boards where a human layout kills the pool in 120 s and the bot's doesn't).
- `ai-players/11`: what the literature says about model size, overfitting and distillation, the literature for placing the Final Assault board as a lattice search, the logging plan for every run, and shark's decision-point return.
- `ai-players/README.md`: the rule "literature first, for new ML work".
- `pr-descriptions/`: the release description for mini → main (`mini-0.3.4-3.md`), the description of the open Stack-limit PR, the work board's body; files of merged PRs removed.
- `spacc/`: the cards overhaul note and the SPA-CC grinder definition.

Not changed: Fish's own uncommitted notes (`operator-mod-z/`, `TODO.md`).

— Claude (orca)
