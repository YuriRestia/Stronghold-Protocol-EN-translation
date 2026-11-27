No longer read-only. Reorganized 2026-10-24, and the folder renamed from `remove-before-merge/` to `fish-edition/`: what is done is a list with pointers, the open ideas and the designs the
code still points to keep Fish's wording. SCOPING.md (Phase 2's feasibility study, written against the pre-rebuild code)
was removed. Its still-open questions are below.

# About

Hi Claude. You can call me Fish. This game (Stronghold Protocol Alliance) has passed through some different hands, until it ended up open source. I felt the original had some missed opportunities, so I forked the repo so I could mod it myself.

I'm opting to try an AI-first workflow - meaning I'll manually code if needed, but I always offer you the first attempt at any task. Don't delete this fish-edition/ directory - that is the human's responsibility to do manually.

For branding purposes, this fork is Fish Edition, because I am Fish.

How we work: STANDARD_LOOP.md (the order of a session), BRANCHES.md (main / mini / upstream branches), TODO.md (what is
in flight), MISC_USER_QUESTIONS.md (questions and scenarios).

When choosing what to do next, priority factors in:

- Hard dependencies
- Soft dependencies (one feature acts as a prototype or gives useful insights for another)
- Ease of implementation
- Possibility of parallel independent PRs
- User demand/urgency

# Done

- **Menu/UI:**
  - keyword popup on click (#8);
  - difficulty details (#7);
  - status icons with a ring for the time left and their value, e.g. 35 % vs 40 % Fragile (#12).
- **Reboot for updates:** `npm run maintenance` (`--status`, `--close`, `--in` / `--at`, `--stop-when-idle`, `--wait`, `--back-in`), the one-line update command in both READMEs, and DEPLOY's per-setup restart notes (docs/DEPLOY.en.md).
- **Custom Lobby Modifications** (shared/rules.js), grouped by the categories under SPA-CC:
  - +2 Deployment Limit, +2 Funds, no time limit on action screens (cheats);
  - choosing the map and the Alliance bans (RNG reducers);
  - Alliance Modules Laterano Mod B and Victoria Mod C (neutral);
  - Virtuosa in Swift and Aid, Blaze replacing Catherine (neutral). Blaze (agreed 2026-10-14) takes Catherine's slot
    (tier 4, price 3) and the skill / module chosen for her; selling her takes Blaze the Igniting Spark from the shared
    pool, so none once its copies are gone;
  - later cheats: double LP, one operator of each tier, Booster Pack, Equipment Booster Pack;
  - a room with any rule set can't search for teammates: strangers play the original game.
- **SPA-CC:** the Risk grid and the tags. The live spec is spacc/working-spec.md.

# Open ideas

## Menu/UI: damage chart

Some kind of damage chart (possibly hidden in a post-game analysis tab) would be helpful. The simplest prototype would be a bar chart that splits by operator (so duplicates of the same operator end up counting toward the same bar). A probably more useful chart would split by operator/player/round, with 3 buttons to toggle whether operator/player/round are combined, and an additional 2 buttons to filter round to only last round/second last round (since these are the boss rounds and it would be a very common query).

Status (2026-10-24): upstream added a Combat Analysis panel (作战统计, `public/js/ui/combatMetrics.js`). It shows your own units, for the current battle or the match so far, by damage type. Still missing: the player / round grouping and the last-round filters.

## Doubled enemy waves (lobby modifier (c))

The enemy list is copied once. Questions to settle before building it (from SCOPING.md):
- Does the copy spawn alongside the original or after it?
- Does the battle time limit grow?
- Does the per-round LP loss cap (10) stay?
- Do leader rounds and Joint Defense (联防) double too?

## Alliance Modules

Like how Operator Modules give a choice of different gameplay for each Operator, Alliance Modules give a choice of different gameplay for an Alliance. Not all Alliances will have Module selections, so it is an optional field. For matchmaking, all Alliance Modules are locked to Mod A (the original effect). For solo/custom lobbies, the host of the lobby can select the Modules for all Alliances, and this is shared between all players. (it must be this way because the final boss combines 2 players' boards, and if we allowed per-user selections, there may be a conflict in the combined board)

### Laterano Mod B

Built (`lateranoMod: 'B'`). Kept here as the design the code points to.

[Laterano] Operators gain +min(5 + 1.0 × stacks, 75 + 0.3 × stacks)% ammo on skill activation

<At 100 stacks> [Laterano] Operators deal 200% damage. "On spending X bullets" effects (namely, Mostima, Executor the Ex Foedere, Lemuen) trigger twice.

<With 6 different [Laterano] Operators on field> All [Laterano] Operators +4% ATK whenever any [Laterano] Operator spends 1 ammo, max +200%

Analysis: Mod B is less bullets until 100 stacks, at which point it jumps to effectively more bullets than Mod A, and Mod A wins again at 272 stacks. Mod B solves one of Laterano lategame's biggest problem, which is that Lemuen skill 3 only shoots all at once after expending all bullets, and it takes too long for her to shoot. Limiting the amount of bullets means she doesn't take ages to shoot, while the 200% damage modifier compensates. Local pro player pointed out the real reason Mod B will likely be preferred, is purely for the midgame Executor the Ex Foedere farming of Foresight (one of the 3 economy Alliances) Alliance stacks, which will now be accumulated twice as fast.

Readings agreed 2026-10-14: the bullet-spending Attributes count bullets as usual and trigger twice each time. The Attribute's owner decides, so Mostima's doubles on a non-Laterano neighbour's bullets too. Both triggers count toward the per-battle limit. The 6-member ATK per bullet does not double.

### Laterano Mod C (open)

[Laterano] Operators gain +(5 + 1.5 × stacks)% ammo on skill activation

<With 6 different [Laterano] Operators on field> All [Laterano] Operators +15% ATK (additive) whenever any [Laterano] Operator spends 1 ammo, no limit, but requirement doubles after each trigger

### Victoria Mod C

Built (`victoriaMod: 'C'`), suggested by our local pro player. Kept here as the design the code points to.

Victoria operators gain +8 SP after skill activation per Victorian Hammer equipped. Victorian Hammers in the shop cost 0 and are upgraded. At the end of Rest Phase, Victoria operators with a Victorian Hammer equipped gain Victoria stacks equal to their tier.

At 6 Victoria operators, Victoria operatiors with Victorian Hammers equipped gain stacks to all of their non-Victoria active alliances equal to double their tier. At the start of combat, Victoria operators gain (200 + 1.2x stacks)% ATK, 200% HP as Barrier, and Status Resistance.

Readings agreed 2026-10-15:
- The SP comes when the operator's skill ends, 8 per hammer it carries, like Swift.
- The free upgraded hammers apply only while Victoria is active.
- The 6-member part is one tier.
- Mod C replaces Mod A entirely, so there is no hammer every 25 stacks.

### Rejected after pro player review

- **Victoria Mod B:** doesn't solve what makes Victoria weak, which is poor stabilization. Mod C replaced it.
- **Kjerag Mod B and Siracusa Mod B:** both alliances are already strong.

## Custom Operator Modules (Mod Z)

In the original game, releasing new Modules are the preferred way to buff old Operators that don't really hold up to modern standards anymore, rather than buffing the Operator directly. Enabling them is a cheat for SPA-CC scoring. Without the rule, an operator with a Mod Z selected falls back to its first other module, or to none. The designs are in operator-mod-z/ (about.md and one file per operator).

## Rebalanced Alliance Effects (open items)

Virtuosa and Blaze are built (above). Still open:

- Give Civilight Eterna, Mlynar, Nearl the Radiant Knight, Vina Victoria, and Lappland the Decadenza membership in a new "Radiant" Alliance focused on buffing True damage. (since currently Arts damage gets the most love, followed by Physical damage and the Elemental damage types, and True damage doesn't have many buff sources)
- Nearl the Radiant Knight moved to tier 5; Mlynar moved to tier 6 but base stats increased by +40% ATK, DEF, HP
- Hoshiguma gains Durable

### Radiant

_Add-on Alliance · ??? · activates at 2_

Enemies take +(10 + 1 × stacks)% True damage.

To decide (from SCOPING.md): the thresholds, the stack sources and the icon. Building it needs a new bond record (layers, weight, icon, texts), an installer, the membership and every mode's active alliances. The bans, the bots and the alliance UI then pick it up.

# SPA-CC - Stronghold Protocol: Alliance - Contingency Contract

The tags, their numbers and their status are in spacc/working-spec.md. This section keeps the design decisions.

Arknights's original most famous endgame challenge mode is Contingency Contract. One stage, that is not too hard to just clear, with a variety of "tags" to choose from, which each make the stage harder while rewarding 1 to 3 "risk". The goal then (for competitive/tryhard players) is to clear the stage with the highest total risk.

Prescribing a single Ultimate+ experience to everyone means it must be very thoroughly balance tested, and that's just something I can't do. A CC-like model is the solution here. If "All operators -25% SP recovery" and "Investor no longer counts off-field operators" are both worth 1 Risk, but one is easier than the other, that's fine. We can still offer both tags. Players will naturally pick the easiest combination when chasing high risk, and risk 18 (or any number) remains a valid benchmark that means something.

Lobby rules can be classified into 4 groups:

- Neutral, which is free to take. (ex. Laterano Mod B, Virtuosa membership in Aid and Swift)
- Cheats, which add a very visible "WITH CHEATS" watermark to the end screen. This includes +2 Funds, +2 Deploy Limit, and No Time Limit.
- RNG Reducers, which add "seeded" to the result title. This includes directly selecting alliance bans and map.
- Difficulty Tags, which increase the Risk.

Thus the end screen may display strings such as "Ultimate+5 seeded", "Dire+15", "Dire seeded". All lobby rules regardless of category should be possible to see in the end screen somehow. Youtubers making videos will likely show the full list.

Tags belonging to a sequence are mutually exclusive with each other. (ex. Operators have -15/25/40% ATK) The Risk grid follows CC's layout: a column per sequence (risk 1 / 2 / 3 top to bottom), sidegrades next to each other, support tags (ours: the cheats) top right.

Final boss modifiers affect both the regular final boss and the hidden core boss.

For the tags that involve certain enemies, we can adjust their stats just for SPA-CC, just as SPA already adjusted boss enemies compared to their normal versions.

Plugins (#52, Fish, 2026-10-27): SPA-CC stays in Fish Edition, since Lockout and others can't be plugins. The
compatible subset is ported as plugins in `evenifyouforget/spa-fish-edition-plugins`. The feasibility study is in
FINDINGS.md §6.

Rejected or scrapped tags:
- **Buffs to non-leader enemies** (+30/100% max HP; +15/40% MSPD and ASPD), rejected after pro player review. Buffing mobs hurts certain team compositions much more than others: "they become free if you have a kjerag player and they become almost untakeable if you don't".
- **The Rosmontis, Simulated Sentry tags**, scrapped by Fish on 2026-10-16.
