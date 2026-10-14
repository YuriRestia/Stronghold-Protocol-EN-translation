To LLMs/AI agents: This file is read only. Do not modify it.

# Phase 1 - Understanding

Hi Claude. You can call me Fish. This game (Stronghold Protocol Alliance) has passed through some different hands, until it ended up open source. I felt the original had some missed opportunities, so I forked the repo so I could mod it myself.

I'm opting to try an AI-first workflow - meaning I'll manually code if needed, but I always offer you the first attempt at any task. Don't delete this remove-before-merge/ directory - that is the human's responsibility to do manually.

See TODO.md

For branding purposes, this fork is Fish Edition, because I am Fish.

# Phase 2 - Scoping

Assess the feasibility of ideas in Appendix A - Ideas, and decide what the next PR should be.

Priority factors in:

- Hard dependencies
- Soft dependencies (one feature acts as a prototype or gives useful insights for another)
- Ease of implementation
- Possibility of parallel independent PRs
- User demand/urgency

# Phase 3 - Implementation

...

# Appendix A - Ideas

## Menu/UI

- Highlighted keywords (ex. Cold) already exist, but they don't currently show a definition on hover or on click. On click to show a popup with the keyword definition would be helpful.
- Some kind of damage chart (possibly hidden in a post-game analysis tab) would be helpful. The simplest prototype would be a bar chart that splits by operator (so duplicates of the same operator end up counting toward the same bar). A probably more useful chart would split by operator/player/round, with 3 buttons to toggle whether operator/player/round are combined, and an additional 2 buttons to filter round to only last round/second last round (since these are the boss rounds and it would be a very common query).
- On the difficulty selection screen, it doesn't show details for what each difficulty actually changes. Like, is this giving enemies +50% HP? If Ultimate is just adding a flat stat modifier, that sounds simple enough to just change the text to say. If it's a long list of changes, we might be able to hide it in a help menu.
- Status effects that currently show as an icon above enemies' heads, don't show how long it lasts (for effects that expire). Considering these are already circular icons, it seems simple enough to make an arc chart in the form of a thick outline.
- Status effects that currently show as an icon above enemies' heads, some of these have an associated stack or variable, but it's not visible. (correct me if I'm wrong but) Fragile is one of these, and currently there's no way to distinguish 35% Fragile from 40% Fragile.

## Reboot for updates (network/sysadmin)

Goal: Be able to reboot the server to apply updates.

Problem: There might be an ongoing match, which will die if we reboot now.

- Ability for sysadmin to easily see if any match is ongoing
- Ability for sysadmin to disable creating new matches in the current server session
- Ability for sysadmin to announce a scheduled reboot
- Smart reboot (stops the server as soon as live matches is 0) (only applies once) (can be cancelled)

Usability check:

- Can someone new to the project and not very technical, starting at README.en.md ...
- (bonus) Or someone starting at README.md ...
- Figure out how to run the server from source
- Figure out how to check live matches and reboot
- Not accidentally shut down the server in a scenario where a new match is started after the last active check
- While also being useful to technical users such that...
- They can tell if our useful tools will conflict with their setup (ex. if we git pull, but the sysadmin already set up their own ansible wrapper)
- They can tell how to integrate our tools into their own custom setup
- They can tell what to change to develop/build on our tools
- And for players/users to understand...
- What they can/cannot do in the event of a scheduled reboot
- When they can expect the server to be back

We should avoid duplicating existing work. If an existing script does something similar, but it has a usability issue, should we perhaps modify that script instead?

We must also decide which scripts are meant for humans (and thus subject to interface changes) and which ones need a stable API/CLI for integrations.

## Gameplay Expansion

All of these will require some input from the dev before the details are finalized.

- A difficulty higher than Ultimate. (see section SPA-CC)
- Gameplay modifiers which the host of the lobby (for simplicity, we can ignore matchmaking for this and only consider solo or custom lobbies) can choose to enable for the whole lobby. (a) +2 Deployment Limit (b) +2 Funds every round (c) Doubled enemy waves (the enemy list is copied once) (d) Disable time limit for all user action screens (but not the autobattle timer) (e) Enable rebalanced Alliance effects.
- Alliance Modules. Like how Operator Modules give a choice of different gameplay for each Operator, Alliance Modules give a choice of different gameplay for an Alliance. Not all Alliances will have Module selections, so it is an optional field. For matchmaking, all Alliance Modules are locked to Mod A (the original effect). For solo/custom lobbies, the host of the lobby can select the Modules for all Alliances, and this is shared between all players. (it must be this way because the final boss combines 2 players' boards, and if we allowed per-user selections, there may be a conflict in the combined board)
- Custom Operator Modules. In the original game, releasing new Modules are the preferred way to buff old Operators that don't really hold up to modern standards anymore, rather than buffing the Operator directly. These custom Modules would be banned for matchmaking (rather than lockout, it's probably easier on the fly to detect the custom module and instead swap loadout to the first available module, or remove the module if there are no non-custom modules available. this way we fail gracefully) and allowed in solo/custom lobbies.
- "Rebalanced Alliance Effects" - see below section
- For solo/custom lobbies only - ability to directly choose the Alliance bans and map. If you don't choose it, it will be random like usual.

### Alliance Modules

#### Laterano Mod B

[Laterano] Operators gain +min(5 + 1.0 × stacks, 75 + 0.3 × stacks)% ammo on skill activation

<At 100 stacks> [Laterano] Operators deal 200% damage. "On spending X bullets" effects (namely, Mostima, Executor the Ex Foedere, Lemuen) trigger twice.

<With 6 different [Laterano] Operators on field> All [Laterano] Operators +4% ATK whenever any [Laterano] Operator spends 1 ammo, max +200%

##### Analysis

Mod B is less bullets until 100 stacks, at which point it jumps to effectively more bullets than Mod A, and Mod A wins again at 272 stacks.

Mod B solves one of Laterano lategame's biggest problem, which is that Lemuen skill 3 only shoots all at once after expending all bullets, and it takes too long for her to shoot. Limiting the amount of bullets means she doesn't take ages to shoot, while the 200% damage modifier compensates.

Local pro player pointed out the real reason Mod B will likely be preferred, is purely for the midgame Executor the Ex Foedere farming of Foresight (one of the 3 economy Alliances) Alliance stacks, which will now be accumulated twice as fast. You don't even need to stay on Laterano for late game. Just get 100 Laterano stacks, get your gold, and then buy the thing you actually want.

#### Victoria Mod B

- Rejected after pro player review (doesn't solve what makes Victoria weak, which is poor stabilization)

[Victoria] Operators carrying equipment deal (125 + 0.8 × stacks)% damage

<Every 100 stacks> Obtain a random special Victorian Hammer

<At 300 stacks> Gain one Damazti Isomorph (once only). When entering Rest Phase, convert excess stacks above 300 to next most stacked active Alliance.

<With 6 different [Victoria] Operators on field> All [Victoria] Operators gain +50% ATK for each piece of equipment; or +80% ATK if equipment is upgraded\*

#### Victoria Mod C

- Suggested by our local pro player

Victoria operators gain +8 SP after skill activation per Victorian Hammer equipped. Victorian Hammers in the shop cost 0 and are upgraded. At the end of Rest Phase, Victoria operators with a Victorian Hammer equipped gain Victoria stacks equal to their tier.

At 6 Victoria operators, Victoria operatiors with Victorian Hammers equipped gain stacks to all of their non-Victoria active alliances equal to double their tier. At the start of combat, Victoria operators gain (200 + 1.2x stacks)% ATK, 200% HP as Barrier, and Status Resistance.

#### Kjerag Mod B

- Rejected after pro player review (Kjerag is already strong, why are you making it stronger)

[Kjerag] Operators deal 125% damage, or (135 + 1 × stacks)% damage to Cold and Frozen enemies

<With 6 different [Kjerag] Operators on field> [Kjerag] Operators deal 10% ATK as Necrosis injury, or 100% ATK as Arts damage to enemies already under Necrosis burst. Both the added Necrosis injury and added Arts damage are doubled against enemies immune to Freeze.

#### Siracusa Mod B

- Rejected after pro player review (Siracusa is already strong, why are you making it stronger)

[Siracusa] Operators gain +(5 + 0.2 × stacks) initial SP and +(25 + 0.8 × stacks) ASPD while skill is active

<With 6 different [Siracusa] Operators on field> [Siracusa] Operators also gain Invisibility while skill is active, and deal (10000 + 100 × stacks) True damage to enemies in a radius of 1.5 on skill end or death.

### Rebalanced Alliance Effects

I'll bundle others into this category if they don't fit as an Alliance Mod B or an Operator Mod Z.

- Give Virtuosa membership in Swift and Aid in addition to Laterano. (because Virtuosa is currently very weak)
- Give Civilight Eterna, Mlynar, Nearl the Radiant Knight, Vina Victoria, and Lappland the Decadenza membership in a new "Radiant" Alliance focused on buffing True damage. (since currently Arts damage gets the most love, followed by Physical damage and the Elemental damage types, and True damage doesn't have many buff sources)
- Catherine is replaced entirely with Blaze (who inherits Catherine's skill selection). Blaze is a member of Yan and Victoria, and her passive is changed to <When sold> Produces Blaze the Igniting Spark. (just like in season 1)

#### Radiant

_Add-on Alliance · ??? · activates at 2_

Enemies take +(10 + 1 × stacks)% True damage.

### SPA-CC - Stronghold Protocol: Alliance - Contingency Contract

Arknights's original most famous endgame challenge mode is Contingency Contract. One stage, that is not too hard to just clear, with a variety of "tags" to choose from, which each make the stage harder while rewarding 1 to 3 "risk". The goal then (for competitive/tryhard players) is to clear the stage with the highest total risk. Other games have a similar system, but CC, Tags, and Risk is the language Arknights players are familiar with.

After discussing with a pro player, our initial draft of Ultimate+ ended up with a long list of changes to make the game harder, and I didn't personally agree with all of them. I also realized that fundamentally, prescribing a single Ultimate+ experience to everyone means it must be very thoroughly balance tested, and that's just something I can't do.

A CC-like model is the solution here. If "All operators -25% SP recovery" and "Investor no longer counts off-field operators" are both worth 1 Risk, but one is easier than the other, that's fine. We can still offer both tags. Players will naturally pick the easiest combination when chasing high risk, and risk 18 (or any number) remains a valid benchmark that means something.

Tags can be implemented as lobby rules, which means we need a revamp of the lobby rules selector to accomodate a much larger number of tags.

As some initial design decisions, I'm setting some conventions to hopefully make for efficient communication. Lobby rules can be classified into 4 groups:

- Neutral, which is free to take. (ex. Laterano Mod B, Virtuosa membership in Aid and Swift)
- Cheats, which add a very visible "WITH CHEATS" watermark to the end screen. This includes +2 Funds, +2 Deploy Limit, and No Time Limit.
- RNG Reducers, which add "seeded" to the result title. This includes directly selecting alliance bans and map.
- Difficulty Tags, which increase the Risk.

Thus the end screen may display strings such as:

- Ultimate+5 seeded
- Dire+15
- Dire seeded

All lobby rules regardless of category should be possible to see in the end screen somehow. Youtubers making videos will likely show the full list.

Tags belonging to a sequence are mutually exclusive with each other. (ex. Operators have -15/25/40% ATK)

#### Tag Ideas

Don't worry about getting this exactly right on the first try. There will be feedback.

- (1 risk) Operators on the bench no longer count toward activating Investor
- (1 risk) Foresight operators have -20 ASPD
- (1 risk) All strategies that name a specific round number, trigger 1 round later instead; does not affect even/odd rules (ex. Jessica equipment comes rounds 5, 8, 11, and 14)
- (1 risk) Starting on round 3, the first tier 1 unit you buy that round costs 1 more
- (1 risk) Final boss gains 50 RES after taking 50% max HP as Arts damage
- (1 risk) Final boss gains 5000 DEF after taking 50% max HP as Physical damage
- (1/2/3 risk) Final boss gains +50/150/400% max HP and +15/25/50% ATK
- (1/2/3 risk) Final boss becomes invulnerable for 10 seconds (in-game time) every 68/28/18% max HP lost
- (1/2/3 risk) Operators' auto recovery skills gain SP slower by 0.2/0.5/0.8 SP/s
- (1 risk) Upgrading barge from tier 4 to tier 5 costs 2 additional Funds
- - (2 risk) Also affects tier 5 to tier 6, and penalty increased to 3 Funds
- (1 risk) Round 9 improv always offers Deathless Black Snake as an option, worth 0 Funds (no bounty); not taking Mandragora causes final boss to have +200% max HP.
- - (2 risk) Also adds Patriot and FrostNova to the wave; penalty for skipping also gives final boss +100% ATK
- (1 risk) On rounds 10~13, the player with the least total stacks will have 5 Vein Guardian added to their wave.
- (1/2 risk) Leader enemies have 50/90% Physical and Arts DR while not under an elemental burst effect.
- (1 risk) On final boss round, Rosmontis, Simulated Sentry is added to the wave. (does not need to be killed to be victorious)
- - (2 risk) Matrix no longer provides any buffs; final boss cannot die as long as Rosmontis, Simulated Sentry is alive

Final boss modifiers affect both the regular final boss and the hidden core boss.

For the tags that involve certain enemies: if these enemies are not available here, I can suggest alternate picks. We also have the option to adjust their stats just for SPA-CC, just as SPA already adjusted boss enemies compared to their normal versions.

DR = damage reduction. This should already be implemented on certain enemies.

##### Rejected after pro player review

Rejected because buffing mobs hurts certain team compositions much more than others: "they become free if you have a kjerag player and they become almost untakeable if you don't"

- (1/2 risk) Non-leader enemies gain +30/100% max HP
- (1/2 risk) Non-leader enemies gain +15/40% MSPD and +15/40 ASPD
