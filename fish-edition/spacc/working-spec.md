# SPA-CC working spec

Working document for the SPA-CC Risk tags: names, numbers, new ideas. ROADMAP.md "SPA-CC" keeps the design decisions.

State as of 2026-10-15, branch `wip/vengeance-junk` (on `wip/famiglia`). Every tag is a lobby rule in `shared/rules.js` (category `risk`); the
numbers are in `shared/ruleData.js` `CC`. A tag with levels is one rule, so its levels exclude each other. With any
cheat on, the total Risk counts as 0.

The tags' names are Fish's (the Spec below); the grid's tiles show them (see "Tile names"). The **Name** / **Current
label** lines of the older notes predate that.

## Spec (Fish's)

The tags as Fish designs them — the source of truth; the implementation notes below follow it. (Merged in from
`fish-edition/untracked/spacc-live-spec.md`, which stood in for this file while git had lost it.)

### Clarifications

Sub-waves added to all fields should be only one per field, not one per side. Path should all start going leftward, then alternate left and right per loop (rather than going left every loop) (for fields with 2 players alive).

### General

- Objective: Investor 1 - Operators on the bench no longer count toward activating Investor
- - Objective: Investor 2 - Muelsyse, Kjera, Flametail's Attributes trigger on sell instead of when obtained
- Objective: Swift - Swift formula nerfed from 20 + 0.35 × stacks to 20 + 0.25 × stacks
- Objective: Foresight - Foresight operators have -20 ASPD
- Objective: Strategy 1 - All strategies that name a specific round number, trigger 1 round later instead; does not affect even/odd rules (ex. Jessica equipment comes rounds 5, 8, 11, and 14)
- - Objective: Strategy 2 - Russell buff caps at 50%. Du Yaoye only affects 1 refresh per round instead of 2. Amiya requires 1 more active alliance to get her buffs.
- Objective: Intern - Starting on round 3, the first tier 1 unit you buy that round costs 1 more
- Originium Zone: Arts - Final boss gains 50 RES after taking 50% max HP as Arts damage
- Originium Zone: Physical - Final boss gains 5000 DEF after taking 50% max HP as Physical damage
- Originium Zone: Activation 1/2/3 - Final boss gains +50/150/400% max HP and +15/25/50% ATK
- Originium Zone: Lockout 1/2/3 - Final boss becomes invulnerable for 10 seconds (in-game time) every 68/28/18% max HP lost
- Environment: Suffocation 1/2/3 - Operators' auto recovery skills gain SP slower by 0.2/0.5/0.8 SP/s
- Objective: Barge 1 - Upgrading barge from tier 4 to tier 5 costs 2 additional Funds
- - Objective: Barge 2 - Also affects tier 5 to tier 6, and penalty increased to 3 Funds
- Originium Zone: Elements 1/2 - Leader enemies have 50/90% Physical and Arts DR while not under an elemental burst effect.
- Objective: Deep Infiltration - DP generation rate reduced by 50%
- Objective: Low Efficiency - Friendly units have their redeployment time increased by 75%
- Objective: Last Line of Defense - First leak each round deducts an additional 2 life points. Applies even if Unite Phase has no leaks. Ignores 10 life points loss per round limit.
- Objective: Junk 1 - At the start of the match, all players receive a Cursed Hammer: Cannot be destroyed, equipped operator has -50% ATK, does not have any interaction with Damazti Isomorph.
- - Objective: Junk 2 - Cursed Hammer additionally reduces income for the round by 1 if not equipped.

### Famiglia group (pick one)

- Famiglia: Cleaner 1 - On rounds 10~13, the player with the least total stacks will have 5 Famiglia Shadow Silencer added to their wave.
- - Famiglia: Unending 2 (2 risk) - Blood Debt and Asset Liquidations are permanently active, for everyone (Asset Liquidations does not summon more Famiglia Shadow Silencer)
- - Famiglia: Unending 3 (3 risk) - Adds Zaaro, "Signore dei Lupi" to the sub-wave. Zaaro, "Signore dei Lupi" costs 5 life points if leaked.
- - Famiglia: Seasonal 2 (2 risk) - Blood Debt is permanently active, for everyone. Blood Debt triggers Asset Liquidations at 200 points instead of 500. Starting on round 10, Blood Debt starts 50% full. (Asset Liquidation summons Famiglia Shadow Silencer as normal)
- - Famiglia: Seasonal 3 (3 risk) - Adds Zaaro, "Signore dei Lupi" to the sub-wave. Zaaro, "Signore dei Lupi" costs 5 life points if leaked.

This branch is the tradeoff between having all enemies constantly buffed, or a risk of spawning more Famiglia Shadow Silencer for everyone due to Asset Liquidation triggering.

### Patriot group (pick one)

- Patriot: Undying 1 - Round 9 improv always offers Patriot as an option, worth 0 Funds (no bounty). Not taking Patriot causes final boss to have +200% max HP. Patriot costs 5 life points if leaked. Patriot uses Level 1 stats.
- - Patriot: Undying 2 - In Marching Stance, <Patriot> receives 90% less physical and Arts damage from Operators who are not blocking him. <Patriot> gains +200% HP, is immune to Slow, Stun, Bind, Cold, Frozen, Frighten, Sleep, Fear, Levitate, and Lure while in Marching Stance, and Movement Speed cannot be lower than base speed (both phases). Penalty for not taking Patriot also gives final boss +100% ATK.
- - Patriot: Undying 3 - Adds 5 Guerrilla Shieldguard to the sub-wave. Adds the sub-wave again to final boss round(s). (all fields, not just the player who selected Patriot) All enemies have +40% MSPD and +40 ASPD while Patriot is alive.

### Delegation group (pick one)

- Delegation: United 1 - Degenbrecher, 5 Delegation Shieldbearer, and 5 Delegation Centurion Champion are added to the final boss round(s). Degenbrecher uses Level 1 stats. Degenbrecher, Delegation Shieldbearer, and Delegation Centurion Champion from this sub-wave have 200% max HP.
- Delegation: United 2 - Final boss cannot die as long as Degenbrecher is alive. Sub-wave max HP increased to 300%, and ATK increased to 150%. Degenbrecher gains MSPD while unblocked, up to +300% after 10 seconds, resetting when blocked or unable to move.
- Delegation: United 3 - Sub-wave max HP increased to 500%. Degenbrecher's Momentum Murder triggers every 9% max HP instead of 25%. Degenbrecher has a hard HP gate every 9% max HP, and cannot lose further HP until she finishes casting Momentum Murder.

### Vengeance group (pick one)

Note: Hateful Avenger here refers to the leader enemy enemy_1539_reid aka Reid (as known by players). Not the mid-tier mob. It's probably best for the in-game text to say Reid, "Hateful Avenger" for clarity even though that's not the official name.

- Vengeance: Invincible Blade 1 - At battle start, add 1 Hateful Avenger to the wave if player has 200 or more stacks of a single active Alliance. In final boss round(s), Hateful Avenger is always added to the wave.
- Vengeance: Invincible Blade 2 - Hateful Avengers have +150% max HP and +50% ATK. Hateful Avengers have Status Resistance, 30% Physical and Arts DR when at <50% HP, and are invulnerable for 15 seconds after revival.
- Vengeance: Invincible Blade 3 - Spawns more Hateful Avenger based on the player's highest stacked active alliance: one additional Hateful Avenger per 200 stacks above 200. In final boss round(s), calculates based on the highest stacked active alliance of any player. Hateful Avengers have +100 ASPD. When Hateful Avengers are below 50% HP, they have 60% Physical and Arts DR and immunity to Slow, Stun, Bind, Cold, Frozen, Frighten, Sleep, Fear, Levitate, and Lure.

Vengeance seemed to be too strong in the initial design, due to spawning a large number of Reid that remain invulnerable for 15 seconds. Even with advanced techniques such as using Surtr's immortality to stall, it wasn't possible to stop that many Reid. A typical player's best option is probably to use Mostima skill 3 for the 90% slow field, but this is an extremely specific solution that can't be reliably obtained in SPA.

Spawning based on highest alliance rather than total is a significant nerf overall, and I think this will also be easier for players to understand, since they only need to look at the highest stack. It is also generally more healthy to stack several alliances rather than go all-in on one alliance anyway, and Vengeance 3 makes it extra punishing to stack one alliance extremely high.

## Implementation notes

### 1. `ccInvestorBench`

- **Name:**
- **Current label:** "Investor: no Bench"
- **Risk:** 1
- **Effect:** Operators on the Bench no longer count toward activating Investor. The board still counts.
- **Notes:** Investor's alliance text gets a "(Risk: Bench Operators no longer count)" suffix.
- **Investor 2** (Risk 2, includes 1; 2026-10-23): Muelsyse's, Kjera's and Flametail's "When obtained" Attributes (the
  Damazti Isomorph, the Kjeragandr ice, a Pinus Sylvestris operator; elites: 2) trigger when the operator is sold
  instead, and their texts read "<When sold>". Investor's ×2 / ×3 multiplies "When obtained" effects only, so it no
  longer multiplies these. (`ruleDataPatch` turns the six garrisons into `SERVER_CHESS_SOLD` ones, `CC.investorSold`.)

### 2. `ccSwift`

- **Name:**
- **Current label:** "Swift nerf"
- **Risk:** 1
- **Effect:** Swift's SP-recovery chance is 20% + 0.25% × stacks (normally 20% + 0.35% × stacks).

### 3. `ccForesight`

- **Name:**
- **Current label:** "Foresight ASPD -20"
- **Risk:** 1
- **Effect:** every Foresight Operator has −20 ASPD, whether Foresight is active or not.

### 4. `ccStrategyLate`

- **Name:**
- **Current label:** "Strategies delayed"
- **Risk:** 1
- **Effect:** Strategies that name a round take effect 1 round later.
  - Justin Jr. 2/5/8/11, Jessica 5/8/11/14, Fang 9/11/13/15 (round 15 = Hidden Core, only when it's played).
  - Quintus 4, Orchid 11, Yu 9, Pith / Dusk / Muelsyse / Malkie 2.
  - Lee: Funds held on rounds 2 and 3, paid out on round 4.
  - Harold from round 5, Duck Lord from round 6.
- **Unchanged:** Strategies on even/odd rounds or every N rounds (Dobermann, Matsukiri, Narantuya). Damazti also keeps
  5/10/15: its text says "every 5 rounds", although its data stores three named rounds.
- **Strategy 2** (Risk 2, includes 1; 2026-10-23): Ioleta Russell's ATK and HP bonus is at most +50 % each (5 elites
  reach it); only the first manual refresh of a round is Du Yaoye's special one (the data: the first 2); Amiya's tiers
  need 4 / 5 / 6 active alliances (the data: 3 / 4 / 5). The Strategies' own texts are unchanged; the tag's text says it.

### 5. `ccTier1Price`

- **Name:**
- **Current label:** "Tier I price up"
- **Risk:** 1
- **Effect:** from round 3, the first Tier I Operator bought each round costs 1 more.

### 6. `ccUpgrade`

- **Name:**
- **Current label:** "Upgrade cost up 1 / 2"
- **Risk:** 1 / 2
- **Effect:**
  - Level 1: upgrading the Dispatch Center from level 4 to 5 costs +2 Funds.
  - Level 2: 4→5 and 5→6 cost +3 each.

### 7. `ccSpRecovery`

- **Name:**
- **Current label:** "SP recovery -0.2 / -0.5 / -0.8"
- **Risk:** 1 / 2 / 3
- **Effect:** every Operator's automatic (time-based) SP recovery is 0.2 / 0.5 / 0.8 SP per second slower.

### 8. `ccBoss`

- **Name:**
- **Current label:** "Final Leader up 1 / 2 / 3"
- **Risk:** 1 / 2 / 3
- **Effect:** the final boss, Hidden Core included, gets +50 / 150 / 400% HP (its shared pool) and +15 / 25 / 50% ATK.

### 9. `ccLeaderDr`

- **Name:**
- **Current label:** "Leader DR 50% / 90%"
- **Risk:** 1 / 2
- **Effect:** Leaders take 50 / 90% less Physical and Arts damage, except while under an elemental burst effect. True
  damage is unaffected.
- **Leaders here:** the final / Hidden Core bosses and the leader-class enemies (`enemy-palette/leaders.md`), bounty
  ones included.

### 10. `ccDeepInfiltration`

- **Name:** Deep Infiltration
- **Risk:** 1
- **Effect:** DP generation −50 %.

### 11. `ccLowEfficiency`

- **Name:** Low Efficiency
- **Risk:** 1
- **Effect:** every operator's redeployment time +75 %.

### 12. `ccLastLine`

- **Name:** Last Line of Defense
- **Risk:** 1
- **Effect:** when a player's own battle leaks at least one enemy in a round, that player loses 2 more LP, past the
  10-per-round limit. It still applies when the Unite Phase catches every leak.
- **Reading:** normal rounds only; the final boss rounds charge the team's LP their own way and don't get the +2.

### 13. `ccOzArts` / 14. `ccOzPhys`

- **Name:** Originium Zone: Arts / Originium Zone: Physical
- **Risk:** 1 each
- **Effect:** once the final boss has taken 50 % of its pool as Arts (Physical) damage, counting every field together,
  it gets +50 RES (+5000 DEF) for the rest of the fight. The Hidden Core boss too (its own pool, counted afresh).

### 15. `ccLockout`

- **Name:** Originium Zone: Lockout 1 / 2 / 3
- **Risk:** 1 / 2 / 3
- **Effect:** every 68 / 28 / 18 % of the pool lost, the final boss is invulnerable for 10 game seconds. Each step is a
  hard gate: one big hit stops at it. Steps: Lockout 1 at 68 % lost (once), 2 at 28 / 56 / 84 %, 3 at 18 / 36 / 54 /
  72 / 90 %.

### 16. `ccFamiglia` (group)

- **Cleaner 1** (Risk 1), formerly `ccSilencers`: on rounds 10–13, the Doctor with the fewest stacks across all alliances
  gets 5 Famiglia Shadow Silencers in their battle, with no bounty. Ties go to the earliest seat.
- **Unending 2** (Risk 2, includes Cleaner): every battle is an Asset Liquidation from start to end: every enemy +20 %
  ATK and +15 % DEF, the Silencers also +15 % ATK / DEF and +50 ASPD. No Silencer comes from it.
- **Seasonal 2** (Risk 2, includes Cleaner, not with Unending): every battle has its own Blood Ledger, fresh each time.
  It starts empty and fills 3 per game second (+1 per living Zaaro, +35 per second during his Furious Howl).
  At 200 (the official gauge: 500), an Asset Liquidation: the same buffs, one Famiglia Shadow Silencer comes, and the
  Ledger empties over 35 game seconds without filling. From round 10 it starts 50 % full (100). (2026-10-23; before:
  500, starting 25 % full, 75 % from round 10.)
- **Unending 3 / Seasonal 3** (Risk 3): Zaaro joins Cleaner's sub-wave (rounds 10–13, the fewest stacks) and costs 5 LP
  when he leaks.
- **Every battle:** normal rounds, the Unite Phase and the final boss rounds. A Ledger bar sits in the phase capsule at
  the top of the battle screen (the count while it fills, "Asset Liquidation" and a pulse while one lasts).

### 17. `ccPatriot` (group: Undying 1 / 2 / 3, a chain since Fish's playtest of 2026-10-15)

- **Undying 1** (Risk 1): the round-9 Improv always offers a Patriot card (no bounty). Whoever takes it fights him that
  round. If nobody takes him, the final boss gets +200 % max HP. A leaked Patriot costs 5 LP (still within the 10-per-
  round limit). He uses his Level 1 stats (60000 HP, 2000 ATK).
- **Undying 2** (Risk 2): in Marching Stance he takes 90 % less Physical and Arts damage from units not blocking him,
  and is immune to Slow, Stun, Bind, Cold, Freeze, Tremble (Frighten), Sleep, Fear, Levitate and Lure (Attract). +200 %
  max HP and never slower than his base speed, in both stances. Not taking him also gives the final boss +100 % ATK.
- **Undying 3** (Risk 3): 5 Guerrilla Shieldguards come with him. In the final boss rounds, Patriot and his 5
  Shieldguards come again, once per field. While he is alive (his revive included), every enemy on his field has
  +40 % move speed and +40 ASPD. (The old Support 3 spear — 3 targets, Necrosis — is gone.)

### 18. `ccDelegation` (group: United 1 / 2 / 3, a chain since 2026-10-15)

- **United 1** (Risk 1): in the final boss rounds, every field gets 1 Degenbrecher, 5 Delegation Shieldbearers and 5
  Delegation Centurion Champions, at 200 % of their HP that round. This Degenbrecher uses her Level 1 stats (45000 HP,
  1000 ATK, 800 DEF); a bounty Degenbrecher in a normal round keeps Level 0.
- **United 2** (Risk 2): the final boss cannot die while a Degenbrecher lives on any field (its pool stops at 1 HP).
  The sub-wave has 300 % HP and 150 % ATK. Degenbrecher charges: while unblocked her move speed climbs to +300 % over
  10 s, back to normal when she is blocked or can't move (stunned, frozen, asleep, levitated, bound).
- **United 3** (Risk 3): the sub-wave has 500 % HP. Her Momentum Murder comes every 9 % of her HP (normally 25 %), and
  each step is a hard gate: she loses no HP until the cast ends. (Cloned 3 is gone.)
- Her own ATK buff stays off: the game ties it to Snowfall ("Gains increased ATK during Snowfall"), an event mechanic
  this mode doesn't have (checked 2026-10-16).

### 19. `ccJunk` (Objective: Junk 1 / 2, prototype)

- **Junk 1** (Risk 1): every player starts with a **Cursed Hammer** (a Fish Edition item, made at run time; the Victorian
  Hammer's icon). Its carrier has −50 % ATK. It cannot be destroyed: not sold (no item can be), not destroyed by the
  player (refused), never the item a third equip replaces (picking it is refused; the default "oldest" skips it), never
  expiring in the temporary hand. (One edge left: an item coming back off an operator with the hand and temporary hand
  both full is lost, the Cursed Hammer too — the same for every item.) It gives no
  alliance, so it has no interaction with the Damazti Isomorph.
- **Junk 2** (Risk 2): a round's income is 1 lower while the Cursed Hammer is in the hand or temporary hand (not
  equipped).

### 20. `ccVengeance` (Vengeance: Invincible Blade 1 / 2 / 3, prototype)

Reid, "Hateful Avenger" (`enemy_1539_reid`, the leader), shown in the tag texts as `Reid, <his name>`.

- **Invincible Blade 1** (Risk 1): a normal battle gets 1 Reid when that player has an active alliance at 200 stacks or
  more. In the final boss rounds: always 1, once per field, on the left-first route. (2026-10-23; before: 1 per 300
  total stacks.)
- **Invincible Blade 2** (Risk 2): those Reids have +150 % max HP, +50 % ATK, Status Resistance, 30 % less Physical /
  Arts damage below 50 % HP, and are invulnerable for 15 s after their revive.
- **Invincible Blade 3** (Risk 3): 1 more Reid per 200 stacks above 200 of the player's highest stacked active alliance
  (400 → 2, 600 → 3; the final boss rounds: the highest of any alive player's; at most 20), +100 ASPD; below 50 % HP
  60 % less damage instead and immune to Slow, Stun, Bind, Cold, Freeze, Tremble, Sleep, Fear, Levitate and Lure.
  (Before: twice as many.)
- Only the Reids the tag adds get these; a Reid that comes as an ordinary bounty keeps his data.

### Sub-waves on the final boss fields (Patriot Undying 3, Delegation)

Once per field, not once per player (Fish 2026-10-15). Every unit takes a route that goes to the left portal first and
then the right one, leaking at the right door if it gets through — the same one-circuit route half the template's own
mobs take (the other half go right first). A one-player field's routes all go left, so its sub-wave goes left.

## Tile names

The Risk grid's tiles show the tags' names (Fish's, "part of the branding"): Objective: Investor 1–2 / Swift / Foresight /
Strategy 1–2 / Intern / Barge 1–2 / Deep Infiltration / Low Efficiency / Last Line of Defense, Environment: Suffocation 1–3,
Originium Zone: Arts / Physical / Activation 1–3 / Lockout 1–3 / Elements 1–2, Objective: Junk 1–2, Famiglia: Cleaner 1
/ Unending 2–3 / Seasonal 2–3, Patriot: Undying 1–3, Delegation: United 1–3, Vengeance: Invincible Blade 1–3. English is Fish's wording; the Chinese source strings are
translations of it, and Japanese / Korean / Traditional Chinese fall back to the Chinese until someone translates them.

## How the groups work

A group is one rule whose levels form a tree. A level includes the ones above it (Seasonal 3 = Seasonal 2 + Cleaner)
and excludes its siblings (Support 3 or Rampage 3). Its Risk is the chosen level's number, not a sum (Rampage 3 = 3
Risk), as with the other leveled tags. The grid shows siblings side by side under the shared tiers; the chosen tile is
lit, and the tiers it includes are lit faintly.

## Readings I made (correct me)

1. **"All fields":** answered — once per field, left-first route (above).
2. **Undying 1 in co-op:** the draft is shared, so one Patriot card for the team; the penalty applies when nobody took
   him. In co-op's 6-card draft, the Patriot card replaces the last card (a draft shows at most 6).
3. **Undying 3's final-round sub-wave comes whether or not anyone took Patriot on round 9.** A mode without a
   round-9 Improv (training, solo Funny) never offers him, so there's no penalty there.
4. **Level 1 stats:** answered (Fish's note below). The data build now keeps both enemies' Level 1 stats from the game
   data (`level1` in `data/enemies.json`; they match the wiki), and the sim uses them as above.
5. **Delegation's HP / ATK multipliers** apply on top of the round's usual enemy scaling.
6. **Momentum Murder's cast:** this mode had it instant. I gave it 1 s (an assumption) so the gate means something; the
   burst comes at the end of the cast.
7. **Lockout's 10 s** are game seconds (the battles run at 2×, so 5 real seconds).
8. **Blood Ledger, the parts the wiki leaves open:**
   - The Silencers' Liquidation bonus is in their data as a Passive with up to 5 stacks. I read it as one stack per
     Liquidation so far in the battle, only while one lasts (Unending: always 1).
   - A Liquidation's Silencer comes on the field's first ground route, scaled like that round's enemies.
   - Kills add nothing in this mode: the wiki's per-kill amounts are for Famiglia soldiers, casters and capos, which
     this mode doesn't have (only the two Silencers and Zaaro).
   - Furious Howl (Zaaro's `WildCalling` in the data: every 40 s, the first 5 s into his second form, 5.5 s long) only
     adds to the Ledger here; whatever else it does in the event isn't modelled.

Level 1 stats - Level 0 is the default. Some enemies have Level 1 stats used on hard stages, such as Patriot (https://arknights.wiki.gg/wiki/Patriot/Enemy) and Degenbrecher (https://arknights.wiki.gg/wiki/Degenbrecher/Enemy)

Compare:

Level 0 stats

HP ATK DEF RES
28000
A+
900
B+
600
B
50
A

Level 1 stats

HP ATK DEF RES
45000
A+
1000
A
800
B+
50
A

## Questions

1. **Blood Debt / Asset Liquidation** (Famiglia Unending / Seasonal): how does the gauge fill, how full is "full", what
   does Asset Liquidation do and for how long? With that, the Zaaro part of tier 3 is quick (he's in the data with his
   kit).

See https://arknights.wiki.gg/wiki/Blood_Ledger

→ Answered (2026-10-15): built as Famiglia Unending / Seasonal above. Fish: Unending = always in Liquidation, Seasonal =
the running gauge; the Ledger is fresh every battle and runs in every battle.

2. For Cursed Hammer, how is it drawn? Is the current convention to serve a png? Do we have postprocessing effects available ex. screenspace distortion or an animated particle overlay? What solution to make it visually distinct would avoid undue code maintenance problems?

   → Claude: item icons are PNGs from the asset manifest (`data/assets.json` `items`: icon id → `/assets/…` URL, downloaded
   by `fetch-assets`), drawn as plain `<img>` in the DOM — item thumbnails, the detail panel, choice cards, the 2D fallback
   board. (Correction, 2026-10-16: the 3D field (Pixi) does draw them too — an item lying in the hand on the board is a
   plate with its icon, `render/units.js ItemView`, and an operator shows small pips of its equipped items.) The Cursed Hammer reuses the Victorian Hammer's icon, so it
   currently looks identical. The DOM side has CSS only: filters (hue-rotate, saturate, brightness, drop-shadow), CSS
   animations, `::after` overlays; screen-space distortion is possible with SVG filters but heavier and browser-
   inconsistent. Pixi has particles / filters, but items aren't there. Suggestion, the way golden items already work
   (just an `is-golden` class: gold border + glow): the hammer's generated record gets `cursed: true`, the ~5 components
   that draw an item icon add `is-cursed` next to `is-golden`, and one CSS rule gives it a dark-red / purple hue shift,
   darkening and a slow pulsing red glow (optionally a small corner glyph via `::after`). One flag, one rule, a one-line
   hook per place, no assets to maintain. Custom art would look best but needs an image source and the asset pipeline.

3. Is there any current visual representation of invulnerability?

   → Claude: only a status icon: a unit with the invulnerable flag (`UF.INVULN` in the snapshot) gets a gold-rimmed disc
   among the up to 4 status icons above it (`render/units.js _iconKeys`, drawn in `render/textures.js`). That covers
   Reid's 15 s, Patriot's / Degenbrecher's revive invincibility and the final boss during a Lockout. Nothing on the
   model itself (no tint, no shield bubble), and the boss bar in the phase capsule doesn't show it. If Lockout needs to
   read better: a lock marker on the boss bar while the pool is invulnerable, and/or a tint on the model (cheap in
   Pixi).

### Answers (Fish, 2026-10-16)

- Toxic Waste's −50 % ATK stacks additively with other ATK% modifiers (as built).
- A leaked Reid costs 1 LP like most enemies (as built).
- AI teammates ignoring Toxic Waste is fine; revisit if the AI is to play better.
- The Rosmontis tags are scrapped.

## Backlog (ideas not built yet)

(none — every designed tag is built; the Rosmontis tags were scrapped)

## New suggestions

UI tweak for Cursed Hammer: make the "Destroy" button greyed out and unclickable, and change the text to "Cannot be destroyed".

→ Claude (2026-10-16): done — the selection's Destroy button stays, greyed out, reading "Cannot be destroyed".

I want to try developing a visual for the Cursed Hammer that makes it stand out more and not look like a buff item. I'm thinking of a gloomy sinking effect, which could be done with a flame-like overlay (so with varying transparency, and different parts moving at different speeds), but moving down instead of up, dark blue instead of red~yellow, and slow (takes around 5 seconds to cross the height). Flame should be on top of the icon rather than inside it, so it can go outside the square. Not sure if this would be accomplished with particle systems or something else. For the sprite itself, we can give it a purple tint.

→ Claude (2026-10-16): built in both places it shows. The field (Pixi): the hand plate is tinted purple, with 7 soft
dark-blue flame tongues on top that sink from above the plate to below it, each over its own 4–6 s with its own phase,
sway and fading alpha (`render/units.js CursedFlame`, texture `textures.js cursedFlameTexture`); an operator wearing it
shows a purple pip. The DOM thumbnails and the detail panel's icon: a CSS purple filter and two flame layers sinking at
5 s and 6.5 s (`game-panels.css` `.is-cursed`). Both come from one flag on the item record (`cursed: true`). Try it in the
mock: `/dev/game-mock.html?variant=junk`. Numbers to tune: CURSED_TONGUES / CURSED_PERIOD / CURSED_SPAN and the tint in
`render/units.js`, the colours in `cursedFlameTexture`.

For invulnerability, I want to try developing a visual that is close to the original game. The unit will have two ribbons rotating around them as if in 3D space. Ribbon can be considered a cylinder that is not very tall (thickness around 1/4 the size of a tile), that spins around its own axis. Colour should be gold. Addition, overlay, or a similar colour mixing setting can be used. Ribbon should fade transparent to gold to transparent, with 180 degrees being transparent. (the "back side") Ribbon rotates around 1 rotation per second, with the side closer to the camera moving left. Ribbons should be in opposite phase to each other. First ribbon's axis is screen +Y, then tilted 20 degrees left (counterclockwise around the Z axis that cuts through the screen) then 10 degrees toward the camera. Second ribbon is same but 20 degrees right instead of left.

→ Claude (2026-10-16): built to this description (no such effect in our asset sources — see the answer to question 3). Any
unit with the invulnerable flag gets two gold rings, drawn additively as 48 quads each: radius 0.42 tile, thickness 0.25
tile, centred at 45 % of the model's height; the half facing away from the camera is drawn behind the model, the near
half in front. One turn per second with the near side moving left, gold → transparent at 180° along the ribbon, the two
half a turn apart, axes tilted ±20° then 10° toward the camera (`render/units.js InvulnRibbons`, numbers in `RIBBON`).
Check: `RENDER_E2E=1 node --test test/render/invuln.browser.test.js` → `test/e2e/out/invuln-*.png`.

→ Claude (2026-10-16, after Fish's look at it — "3× as many particles; blue on black reads badly; maybe the originium
potion inverted, a cyan potion on white"): the Cursed Hammer's icon is now 源石溶剂 (Originium Solvent)'s vial drawn
colour-inverted — a white plate with a cyan vial (field: the plate canvas inverted, `textures.js itemTexture { invert }`;
DOM: the image inverted on a light tile, so the CSS flames keep their colour) — and the flame has 21 tongues on the field
(`CURSED_TONGUES`), three times the blobs in the CSS layers. The purple tint is gone (the inversion replaces it).

→ Claude (2026-10-16, Fish: "the ribbons look good; radius ~20 % wider for normal units; multi-tile bosses 3× as big"):
radius 0.5 tile (was 0.42); a multi-tile boss (a 巨型 enemy, its data `hitArea` — 假想敌：胄 and the like) wears the
ribbons three times as big, radius and thickness (`RIBBON.giant`). The browser test checks both (`invuln-boss.png`).

→ Claude (2026-10-16): the Cursed Hammer is renamed **Toxic Waste** (Fish: "the new graphic is much more readable; rename
it to Toxic Waste") — its name (有毒废料 / Toxic Waste), item id `fish_item_toxic_waste`, the code's constants and
comments. The tag keeps its name, Objective: Junk. (The notes above still say "Cursed Hammer": they're the history.)

Nerf Cursed Hammer so the -1 Funds doesn't apply on round 1. Currently it affects round 1, so you start with only 3 Funds, and it is much harder.

→ Claude (2026-10-16): done — Junk 2's −1 starts from round 2.

New cheat mod: Double initial LP

New cheat mod: Start with one random operator of each tier

This should make testing significantly faster.

It's also unnecessary to set the score to 0 when cheats are used, since the cheat watermark is already there. I think it's better to not set the score to 0, so it can be shown on the end screen.

→ Claude (2026-10-16): done, all three. Two new cheats in the rules dialog's Cheats section: **Double starting LP**
(`doubleLp`: twice the strategy's LP) and **Start with one operator of each tier** (`tierStart`: at round 1, one random
operator of each tier I–VI from the shared pool, on its own seeded stream so the match's other draws don't change; they
land in the hand, overflow in the temporary hand). Both carry the "WITH CHEATS" watermark like the others. And the Risk
is no longer zeroed with cheats: the result title shows it next to the watermark (`shared/rules.js ruleLabels`); the
dialog's "Risk counts as 0" note is gone.
