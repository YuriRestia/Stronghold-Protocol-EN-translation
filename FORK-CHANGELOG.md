# Fork changelog (dev-0.2)

Changes made in this fork ([YuriRestia/Stronghold-Protocol-EN-translation](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation))
on top of the upstream game ([sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)). Upstream's
own changes aren't repeated here; each upstream merge links the upstream commit it brought in, and
[CHANGELOG.en.md](CHANGELOG.en.md) covers what that release contains. Newest first.

## 2026-11-14

### Skills that need a target wait for one

- Passenger's S3 and Degenbrecher's S3 now wait with full SP until an enemy is inside the skill's own range, as in the official game, instead of going off with no enemy near. Passenger's S3 counts its large x-3 range, Degenbrecher's S3 her x-1; flying enemies count for both.
- The same official rule also covers Degenbrecher's S2 (ground enemies on its range in front of her) and Irene's S3 (x-1, flying enemies too), which now wait too. Irene's S2 already waited.
- Before: these skills fired the moment their SP was full and could be wasted on an empty field.

### OpFor: Gun speeds up the official way

- OpFor: Gun's attacks now speed up from its first hit: each hit on the same target adds 80 attack speed on top of its base 20, up to 5 stacks (ASPD 100, 180, 260, 340, 420), and switching targets starts over at one stack.
- Before: its first hit on a target added nothing and the bonus was counted from 0 instead of 20, so it fired slower (ASPD 20, 80, 160, 240, 320, 400 over its first six hits).

### Attack intervals of OpFor: Gun, Pipe and String on their cards

- Their cards, the codex and the enemy previews now show their official attack intervals (22.5 s, 15 s and 25 s) without marking them as slowed; a faster OpFor: Gun shows its speed-up in green.
- Before: the battle card showed "22.5s +18.00" in red for OpFor: Gun, and the codex showed 4.5 s, 3 s and 5 s.

### Angelina the Mellow Wish now fights like the official game

- Her attacks fly as her own projectiles at 10 tiles/s and hit when they arrive, instead of at once.
- After S1 and S2 end she plays her 1 s landing before she touches down; S3's take-off takes 1 s before she can fly or attack.
- S3: she only takes off between attacks, flies to a random flyer she can block, along the official speed curve (2.4 slowing to 2.0 tiles/s) and turning after a target that moves; when the skill ends she holds for 0.333 s, immune to stun and freeze, then returns home.
- S2 starts in the official order: her take-off (0.333 s), the glide, which now moves at its official speed and reaches 4 tiles in about 0.77 s, her 1 s glide end and her 1 s rise; the 22 s skill starts after that. She can't be hurt or controlled and doesn't attack during any of it.
- S3's shelter for airborne allies now also lowers damage over time.
- Before: she floated at a flat 1.3 tiles, her hits were instant, she landed the moment a skill ended, S2 played its rise before the glide and then waited out the data's 2.5 s chant time, her glide was too fast, S3 left mid-attack, always chased the nearest flyer and jumped home at once, and damage over time ignored the shelter.

### Her effects and sounds

- S2's glide shows its trail and ground mark, enemies she lifts show her own lift effect, S3's flight plays her flying animation and her S3 attacks while blocking use her S3 combat animation.
- She flies at her official height: 0.8 tiles up, rising over 0.8333 s (S2 rises over 1 s at the end of its start sequence), landing over 0.8333 s as her landing starts, and 0.4 on high ground during S3, aglna2_s_2[chant_end], aglna2_s_3[mode]].
- Her skill hits, S2's second attack sound, S3's start, her deployment, the glide, the lift and ground-bind, each S3 flight, the return home and every landing now play their official sounds.

### Flying units and take-offs at their official heights

- Flying enemies now hover at the height the official game gives each of them: most drones 1.2 tiles, a few at 1.0, 0.8 or 1.5, and they appear at that height instead of rising into it. Yan's Protection hovers at 1.0.
- Operators that take off now rise to their own official height on the official timing: Tippi to 0.8 tiles over 0.83 s, Leizi the Thunderbringer to 0.4 tiles (and down while her skill runs), and Kal'tsit Esperanta stays on the ground.
- Before: every flyer and every skill take-off hovered at one flat 1.3 tiles, and talent take-offs at 0.3.

## 2026-11-13

### A unite phase can no longer get stuck

- Grand Alliance: when the unite battle's helpers were offline, it sat at "Uniting" with the countdown at 00 for minutes
  and then charged the leakers as if nobody had played it. The browsers did run it, but their answers were refused once
  more than 4 players were in it. They now count, and the round goes on as soon as the battle ends. If the browsers
  still cannot run it, the room now waits for two of them, not for every player in turn. A unite with 5 or more
  helpers also counts their result again (it used to name only 4 of them and was refused).
- If something goes wrong while the unite phase ends, the match no longer stays on "Uniting" with the countdown at 00.
  Once the phase is well past its time, the server closes the unite battle with what it has and moves on to the
  results. If no result came in, the leakers lose LP for their own leaks, as when the unite battle cannot run.
  Before: one error on the way out of the unite phase left the whole room stuck there.

### Delayed attack sounds follow the game speed

- Operator attack and hit sounds the official data plays a moment late now count that moment in game time too, as the
  official game does (every official sound keeps its delay on game time).ignoreTimeScale, false on
  13990 of 13990 sounds]. At 2× Ch'en's attack sound waits 0.3 s instead of 0.6 s.delay 0.6], a speed change takes hold within a
  moment, and the dev sandbox's pause holds a waiting sound until the battle goes on.

### Delayed skill sounds follow the game speed

- Skill sounds the official data plays a moment late now count that moment in game time, as the official game does
  (every official sound keeps its delay on game time).ignoreTimeScale, false on 13990 of 13990 sounds]. At
  2× the Echoes' 0.7 s delay becomes 0.35 s[delay]
  sounds[].delay 0.7], a speed change takes hold at once, and the dev sandbox's pause holds a waiting sound until the
  battle goes on.

### Enemy skill sounds follow the official sound limits

- Enemies casting the same skill together no longer silence each other: every cast plays its sound, and only the
  official limit for that sound holds it back, as in the official game, which keeps no time gap between two plays of a
  sound. A crowd of ten casters rings as that limit allows: most enemy skill sounds keep two at once, the oldest
  giving way to the newest.
- Sounds the official data plays a moment late now wait that moment: the Echoes' delayed ensemble sounds, Armor Cleaver
  and Armor Crusher being shot down, and the skill start sounds of Bubble's S2, Mostima's S3 and Waai Fu's S2
.delay: acdums_audio[passion][delay] / [depassion][delay] 0.7,
  acstma_s_1[special_stun] / acstmb_s_1[special_stun] 0.27, skchr_bubble_2 / skchr_mostma_3 0.1, skchr_waaifu_2 0.05].

### One for All: strategy and operator item gifts no longer use the shop's stock

- In One for All every player holds the same strategy. The items strategies and operators' garrison effects give are
  now separate from the shop and reward stock: every player gets them, they take no copies from the shop, and selling
  or destroying them gives nothing back to it. The shop and rewards keep their normal copies.
  Before: these items came out of the room's stock, which is sized for one holder per strategy, so the last players got
  nothing. With 8 players, the 8th Muelsyse holder got no advanced Doctor Hologram, 4 of 8 Malkiewicz holders no
  Commercial Packaging Plan, and 2 of 8 Justin Jr., Jessica, Fang, Orchid or 'Damazti Cluster' holders missed later
  items.
- Every other mode keeps the official rule: equipment from any source takes up the stock.

### Enemy revives, form switches and tiers play their official sounds

- Enemies that revive now sound like the official game: the knock-out and the stand-up of Degenbrecher, Zaaro, Free,
  Jesselton Williams and The Big Ugly Thing, and the Dublinn Flamechasers' ember and their return. Zaaro's knock-out
  holds its official loop until Zaaro stands up again.
- Other official moments that were silent now play too: Jetman's landing, OpFor: Bonespur's switches, Gunshatter's
  shield taking hits, the Echoes' form switches and ensembles, Alistair's golden shield and advance, Samivilinn's doom,
  Lucky Flyfin taking off, Snowchild hitting high ground, the OpFor blades being shot down, and more (24 enemies).

- Sounds that belong to a moment inside an enemy's animation now play at that moment of the animation, as in the
  official game: Jesselton Williams's three knock-out sounds, the Shoulder Cannon Crawler's volley, each shot of it.

- Mudrock's attacks now change sound as Mudrock's charge grows, by the official rule: tiers 4 and 5 swing with their own heavy
  sounds.; server/sim/content/enemies/leaders.js:65]
- Yans Protection's flame holds its official looping sound while its skill runs.

### More enemy skill impacts can be heard

- These enemy skills now play their official impact sound when they hit, with battle effects on or off:
  - Sarkaz Royal Court Elite Caster: its lock-on line and the burst at its end
  - Withered Knight: its explosive arrows
  - OpFor: BlackCloud: devouring flying enemies
  - Yan's Protection: each hit of its flame line
  - OpFor: Gun (Hidden Core): its chain reaching a spring
  - Alistair, Final Flame of the Empire: [Royal Decree]
  - 'Samivilinn,' the Resolution of the Very North: [Surge of Nature]
  - Novice Acolyte: the heal when defeated (the flask thrown, then landing)
  - Jesselton Williams: the shot that stuns several units (Jailer Form)
- Before, these impacts were silent.
- Each one is timed like the official game: the Elite Caster's line and the Withered Knight's arrows ring when they reach
  their target (at the official projectile speed, so a farther target hears it later, and the arrow's look lands at the
  same moment), BlackCloud's grab rings at its official attack moment, and the Acolyte's flask lands at the end of its
  official flight. The timing follows the battle's speed.

### More enemy attacks play their official sounds

- Death blasts now have their official explosion sound: Infused Originium Slug, Infused Glacial Originium Slug and an
  ignited Cabbage Seedling. OpFor: Fissure's poison lob at its killer now sounds as it launches.
- Diver's arrows land with their official water splash, and Corrupted Knight's blows with their splash blade, each beside
  the impact they already had.
- Some enemies attack differently in another form, and now play that form's own sound: Degenbrecher's second form
  strikes with its heavy slash, 'Echoes' in its dark form with that form's own strike, and Sarkaz Wither Vanguard (and Elite) on
  an infection tile with its Originium sword.
- Before: these were silent, or played the usual attack sound.

### No frozen battle effects in the shop phase after a background tab

- Fixed: when a round ran while the game was in another tab, coming back showed the shop phase with the last battle's
  effects frozen on the field: orange and black shards from the enemies' deaths over the lanes, the enemy entrance and
  the bench (they could look like a broken operator). The shop phase now starts clean. Battles you watch are unchanged.

### Enemy skills play their official sounds

- Enemy skills now play their official sounds when they are cast, such as Defense Crusher's stunning blow, OpFor:
  Armor's skills and Degenbrecher's blink: 63 enemies whose skills were silent, or played only their effect, now sound
  like the official game.
- A skill's impact plays its own official sound where it lands, such as W's C4 explosion and Free's arrow skill
  (36 skills). These impact sounds follow the skill's impact effect, so they stay silent when battle effects are
  turned off; the cast sounds always play.

### Enemy attacks play their official sounds

- Ranged enemies now play the official impact sound where their shot lands, such as OpFor: Gun's bullets, Free's arts,
  W's grenades and Heavy Crossbowman Ambusher's bolts: 56 enemies that landed their shots in silence now have an impact
  sound, and 16 more play their shot's own impact instead of another attack's.
- Enemies whose official attack has two sounds, a wind-up and a shot or strike, now play both: OpFor: Gun's charge is
  followed by its shot, and so for 20 enemies.
- Enemies with a ranged and a melee attack play each attack's own sounds (22 enemies): Army Veteran Shieldguard's
  shield bash no longer ends in a ranged impact, and Heavy Crossbowman Ambusher's bolts no longer land with a sword
  sound.

### Vendela's skill no longer taunts a summon

- Vendela's skill gives the taunt to the operator with the highest max HP in her attack range, as in the official
  game. Before: a summon with more max HP in her range took the taunt instead.
- Vendela taunting herself is official: when no operator in her range has more max HP than she does, she is the one
  the skill picks (client skill data: the selector does not leave her out). That is unchanged.
- Her talent's healing bonus follows the same rule: it goes to the operator with the highest max HP, never a summon.

### One for All: Duck Lord counts every holder

- In One for All every player holds the winning strategy, and each strategy now applies once per player who holds it.
  For Duck Lord's 'Mystery Customer', each living holder now swaps 0–2 enemies of its own. With 8 players that is up
  to 16 swapped enemies a round, all different units. Every player still faces the same swapped units. Before, Duck
  Lord swapped 0–2 enemies however many players held it.
- This also applies when two squads of a Free pick Grand Alliance both hold Duck Lord: two draws instead of one.
- Every other strategy already applied once per holder (checked one by one). Touch's Field Medic stays one per field.

### No stage setup reroll in public matches

- Rerolling the stage setup is meant for friends playing privately, or for solo play. It is now off in public Grand
  Alliances and in any team or Grand Alliance that used Find Teammates or took players from Solo Matchmaking, even if
  the room was made private again before the start. In those matches the button is greyed out, with "No reroll in
  public matches" beside it.
- Hosts see this before they open a room up: a hint under Public when creating a Grand Alliance, and the same note in
  the tooltips of the room's Public switch and of Find Teammates.
- Before: anyone in any room could start a reroll vote.

### A reroll vote no longer stops the countdown

- The briefing countdown keeps running while players vote on a stage setup reroll. If it reaches zero before everyone
  agrees, the vote fails and the match goes on with the setup on screen. Nobody can hold up the start by opening
  votes over and over, or by leaving one unanswered.
- A reroll everyone agrees to still gives a fresh countdown to read the new setup.
- Before: a vote paused the countdown until everyone had answered, with no time limit.

### OpFor: Quagmire's parasite and Degenbrecher's SP-clear mark show on operators

- With official effects on, the operator an OpFor: Quagmire latches onto now shows the official parasite for as long as
  it clings, as in the official game.
- In Degenbrecher's second form, each operator its SP clear disarms now shows the official mark for as long as the disarm
  lasts.
- Before: neither showed an official effect on the operator.

### Armor of the Empire's barrage gives a warning

- Armor of the Empire's entrance barrage now works as in the official game. It first marks the unit with the highest
  HP for 5.8 s. 0.8 s later its range shows on the 3×3 tiles around that spot, and 8 shells fall there one by one,
  0.53 s apart. Each shell hits the unit with the most HP in that area at that moment. You can move a unit out of the
  marked area before the shells land, and the shells keep falling even if Armor of the Empire is defeated meanwhile.
- Before: all 8 hits landed at once, 0.5 s after it appeared, with no warning.

### Leader and boss effects on the units they reach

- With official effects on, these now show the game's own effect on the units they reach, for as long as it lasts:
  - Zaaro, Signore dei Lupi: the fear cage on the operators it catches, and the hit when it ends. Its own glow shows
    while they wait for the cure, and its fear aura shows on the operators around it.
  - Sarkaz Boneguard Torturer's mark, on every unit around it. Its own heal shows when one of them falls.
  - Yan's Protection's flame channel, as the game's range effect on the enemy it locks onto.
- 'Gunshatter' now shows the game's own hit effect on each operator it runs over while it chases its gun.
- Alistair, Final Flame of the Empire: each piece of equipment he animates now breaks with the game's own effect, in place
  of the usual death puff.
- Before: the units showed nothing.

### Dockworkers' stunning hit shows its official stun mark

- With official effects on, the operator a Dockworker or Dockworker Leader stuns with its heavy hit now shows the
  official stun mark for as long as the stun lasts, as in the official game.
- Before: the stun showed no official mark.

### Defense Crushers, Dockworkers and the Armorless Union Cleanup Squad show their official glow before a special attack

- With official effects on, the Defense Crusher, the Defense Crusher Leader, the Dockworker, the Dockworker Leader and
  the Armorless Union Cleanup Squad now glow, as in the official game, while their next attack is their stunning or
  heavy one. The glow goes away with that attack.
- Before: there was no warning before these attacks.

### Corrupted Knight, Withered Knight and 'Armor of the Empire' show their missing official effects

- With official effects on, the Corrupted Knight's charged hammer now shows its official hit and cross on the operator
  it strikes, the knight left standing shows its official rage glow once its partner falls, and 'Armor of the
  Empire''s multi-hit shows its official hit, as in the official game.
- Before: these effects did not show.

### OpFor: Armor's rolling bombs show their official effects

- OpFor: Armor: each Armor Piercer it launches now rolls with the official rolling effect while it travels, and bursts
  with the official explosion when it reaches its tile or is shot down. Before: the bomb travelled with no effect of
  its own.

### 'OpFor: Gun' charge hits with the official effect

- Each unit that 'OpFor: Gun' runs over in its charge now shows the official hit effect, once, as it is struck.
  Before: the units took the damage with no effect on them.

### Heavy Crossbowman Ambusher and Lost Colossus show their shots

- Heavy Crossbowman Ambusher: its stunning bolt now flies with the official trail and hits with the official effect.
  Before: nothing showed between its aim and the stun.
- Lost Colossus: its stunning boulder now flies with the official trail and hits with the official effect. Before:
  nothing showed until the operator was stunned.

### Enemy shells, bombs and blast arrows show their official effects

- Londinium Precision Mobile Defense Artillery: each shell of its bombardment now lands with the official hit and
  blast. Before: a plain flash.
- W: her C4 now shows on the operator it is stuck to, and goes off with the official blast. Before: a plain warning
  circle and flash.
- Withered Knight: its blast arrows now fly with the official trail, mark each target until they go off, and explode
  with the official blast. A Withered Knight enraged by its partner's death now shows the official rage effect.
  Before: a plain warning cross and flash, and nothing for the rage.

### Jetman and Blackhorn Rhuul show their missing official skill effects

- With official effects on, Jetman now shows its official jets when it takes off, and Blackhorn Rhuul shows its
  official mark on the operator it charges and its official hit when the push fails, as in the official game.
- Before: these effects did not show.

### 'Armor Cleaver', 'Armor Crusher' and the Tyrant Captain show their missing official effects

- With official effects on, 'Armor Cleaver' and 'Armor Crusher' now show their official dizzy effect while they are
  shot down, and Sarkaz Absurdist Tyrant Captain's splashing first attack shows its official hit and its ring on the
  target, as in the official game.
- Before: neither effect showed.

### Enemy channel and lasso skills show their official effects

- Sarkaz Royal Court Elite Caster: its Death Eye channel now draws the official line to its target, with the
  official hit as it lands, and the burst at the end plays the official explosion. Before: a plain purple beam.
- Festival Jazz Musician: its channel now throws the official lasso rope, with the official hit on every tick.
  Before: a plain beam per tick.
- 'Samivilinn,' the Resolution of the Very North: its lasso now puts the official stun effect on each target. Before:
  a plain beam.

### Dublinn Flamechasers rise with their official effect

- When a Dublinn Flamechaser Soldier or Elite is knocked down, its one-second rebirth into the Ember of Resentment now
  plays the official revive effect.
- Before: the rebirth had no effect of its own.

### Rat King marks its targets

- Rat King's Mark now shows the official markers over the unit with the highest Max HP and the unit with the lowest
  Max HP, the two its sand skills hit. When a marked unit falls, the marker moves to the next one; the markers go when
  Rat King is defeated. Its Drift Sand also shows its official ground range on the target.
- Before: Mark did nothing you could see, and Drift Sand had only a plain tile outline.

### Enemy buffs and burns show their official effects on the units that have them

- With official effects on, these now show their official effect for as long as they last, as in the official game:
  'Pompeii''s burn on the operators it hits, 'Gravestone''s barrier around it, Fallen Snowpriest's buff on the
  enemies its chain reaches, and Garum Gourmet's barrel zone on the enemies in it.
- Before: the units showed nothing while they had them.

### Enemy effects: Originium Slug blasts, the Armor Piercer's impact, prop idle effects and more

- Infused Originium Slugs and Infused Glacial Originium Slugs now explode with the game's own blast when they fall,
  instead of a generic flash.
- When OpFor: Armor's Armor Piercer lands, its 3×3 impact area now shows the game's own range effect for as long as
  it lasts.
- The 14 prop enemies (Wooden Seal through Iron Lampstand) now show their own idle effect for as long as they stand.
- Operators bled by a Rotchaser or a Rampaging Rotchaser now show the game's bleeding effect while it lasts.
- 'Sand Voyager' now shows the game's effect for how many passengers it carries (one to four), switching as they
  board and leave.
- 'Unicycle Toy' now throws its second harpoon with the game's own second harpoon effect. Before, both harpoons looked
  the same.

### Enemies show their official glows while their talents are active

- These enemies now show the official effect while their talent's condition holds, as in the official game:
  Sarkaz Wither Tank and Advanced Sarkaz Wither Tank while their polluted shot is charged; Diver in deep water;
  Caster Speedboat's wake on deep water; Dublinn Companion Guard, Elite Companion Guard and Elite Companion Shadowblade
  while a Guard and a Shadowblade stand together; Arc Frontliner while it is unbalanced; Sarkaz Wither Vanguard and
  Elite Sarkaz Wither Vanguard on originium tiles; Sarkaz Lancer while it charges; Shrine Swordsman from its first
  enhancement on.
- Before: these effects never showed.

### Enemies show the official effects their talents trigger

- Scarlet Singer glows as a warning when its song is close, bursts when it sings, and every enemy it speeds up shows the
  official glow while the speed-up lasts.
- 'Forsaken One' glows once its attacks have stacked three times, Nucleic Maleficent and Allotropic Maleficent once
  they have been hit, Lucky Flyfin while it sprints after the first hit, and OpFor: Bonespur while it is hidden, with the
  official burst each time it hides or shows itself.
- 'Echoes of Cracked Pipe' / 'Echoes of Broken Strings' burst as they switch form, Decode Basis α as it changes into its
  new form, and Snowchild when it is knocked into high ground (at most once every 5 seconds, as in the official game).
- Farseer and Novice Acolyte play their official burst where they fall, OpFor: Fissure too when its target kills it,
  and a Cabbage Seedling burns with the official fire while it is ignited.
- Recidivist and Infamous Recidivist play their official burst as their first liberation frees every prisoner.
- Before: none of these effects showed.

### 'Free' marks its next target and its cross hits as in the official game

- 'Free' now shows its official mark on the unit its Weft and Warp cross will hit next: the nearest unit,
  and in its second form also the farthest one. The mark moves as soon as another unit becomes the nearer (or
  farther) one. Before: nothing showed which unit it was aiming at.
- The cross now lands with the official hit effect on its target. Before: a plain red outline we made up.

### Enemy auras show their official glow on the units they reach

- With official effects on, the units an enemy aura reaches now show that aura's official effect while they are in it,
  as in the official game: the other enemies near a Defender-4 (its DEF glow), operators near a Frost (its frost),
  a Dublinn Phalanx Infantry or Commander next to another one, and operators in an activated Profane Chimera's
  pollution aura.
- Before: only the enemy's own range ring showed; the units it buffed or slowed showed nothing.

### OpFor: BlackCloud shows its official effects

- When OpFor: BlackCloud grabs flying enemies, each grabbed enemy now shows the official trapped effect until it is
  devoured. Before: nothing showed on them, and a red flash we made up played instead.
- Its salvo now fires the official shells, one per stored ammo and 0.3 s apart, each with its own impact. Before: a
  plain red line per shot.
- While it holds ammo it can't fire yet, it now glows as in the official game.

### Room chat: the emote button shows its icon again

- Fixed: in the room screen's chat (team and Grand Alliance rooms), the emote button beside Send was a dark square
  with a tiny "Chat" label and no icon on the live servers. It shows the emote face again and opens the emotes as
  before. The emote button in a match is unchanged.

## 2026-11-12

### Transmitter can't go on a Custom Squad Operator (from upstream)

- Transmitter's text says it cannot be equipped by Custom Operators, and now the game agrees: dragging it no longer
  offers a Custom Squad Operator, and the server refuses it. Before, equipping it there destroyed the Operator and
  gave nothing back.
- Bots (also the ones the host's browser runs) no longer aim Transmitter at a Custom Squad Operator.
- From upstream: sganggs, issue #913.

### AI teammates play again

- Fixed: AI teammates did nothing all match: no strategy, no units bought or placed, funds left unspent. This hit every
  match with an AI seat since bots started running in the players' browsers: AI teammates in solo and co-op rooms, the
  AI seats matchmaking adds, and the AI that takes over a seat. A file the browser's bot needs was not served to it,
  so the bot could never start.

### Civilight Eterna's S3 background stays behind her (from upstream)

- The tall background her S3 raises now draws just behind Civilight Eterna and in front of raised tiles, instead
  of covering her or hiding under the tiles. From upstream: ForkΨKILLET (@ForkKILLET), PR #919 and #924.
- On the 3D boss field, scene parts the game client keeps switched off are no longer drawn, and the scene
  extractor leaves them out (no more white squares on maps that have them). Our current boss fields have no such
  parts, so nothing needs re-extracting. From upstream: sganggs, issue #918.

### Aegir operators already down at co-op defence revive

- An Aegir operator that is already down when co-op defence starts now gets the bond's revive on the battle-start check
  and spends one of the bond's revives, as in the official game. Before, it stayed down for the whole defence and the
  revive was never used. Ported from upstream's fix for
  [issue #882](https://github.com/sganggs/Stronghold-Protocol/issues/882), thanks to @sganggs; reported by @19p-0 with a
  recording by @modongfox.

### Swire the Elegant Wit's champagne bomb leaves with her

- Swire the Elegant Wit's S2 champagne bomb now leaves the field when she does (knocked out, retreated or sold), as in
  the official game. Before, an unexploded bomb stayed behind without her. Only her own bombs leave: other summons and
  other operators' exits are unchanged. From [PR #872](https://github.com/sganggs/Stronghold-Protocol/pull/872)
  (issue #871), thanks to @zasx77771, narrowed to the bomb as @sganggs asked in its review after checking it in the
  official client.

### A quick start keeps your custom squad

- Settings chosen in the lobby (your custom squad and the other room settings that wait for the game data) are sent the moment you enter a room.
- Before: they went out 50 ms later, so pressing Start right after the room appeared could start the match without your custom squad.
- Ported from upstream ([`54d24b2b`](https://github.com/sganggs/Stronghold-Protocol/commit/54d24b2b32d4a1ad8a5f43ee79b61eb562b1b5b7), thanks to @sganggs).

### Reconnecting after the match ended shows your result

- A player whose connection dropped during a match and who comes back after it ended now sees the result screen and their own result, once, even when the room has closed in the meantime.
- Before: if the room was closed before they came back (for example a matchmade room that removed them while waiting for game data), they got no result and sat on the paused board until their session expired. Coming back after the room's own waiting time ran out already worked.
- Ported from upstream's open [PR #912](https://github.com/sganggs/Stronghold-Protocol/pull/912), thanks to @SatsumaUton.

### The difficulty list no longer twitches

- On Select Simulation Protocol, the difficulty cards stay in one layout. At some window sizes they flipped every few
  frames between the long cards with a scrollbar and the short cards, moving the list up and down (a player's report).
- Before: the long cards were kept when they overflowed by under a pixel, which showed a scrollbar. The scrollbar
  narrowed the list, and the narrower list was measured again and changed the layout back.

### Room chat: a resizable MMO-style chat box, and Send / emote at the chat's text size

- In the room screen's chat (team rooms and Grand Alliance rooms), the Send button's label is now as big as the chat's
  own text, and the button is as tall as the message box. The emote button's icon grows with it, and the emote icon and
  the Send label sit in the middle of their buttons. Before: Send used the small button text (about 12 px on a desktop,
  about 6 px in the phone chat sheet) and the emote icon stayed 16 px. Both follow the Text Size setting.
- The ⤢ / ⤡ grow button is gone. Drag the chat's top-right corner to make it any width and height; it never gets so
  small that the message box, Send, emote and fold buttons squeeze into each other, never covers the top bar and never
  leaves the screen. The size is remembered; a double click on the corner goes back to the default size.
- Click anywhere outside the chat (or press Esc) and the chat log darkens and fades: the lines stay readable, and clicks
  go through to any button under it first. Click the faded log anywhere that isn't over a button, or the message box,
  to bring it back. The resize corner stays live while faded: drag it and the chat comes back at the new size.
- The new ▾ button folds the chat down to a small message-box bar that covers no room button; new lines show as an
  unread count on ▴, which opens it again. The phone chat sheet is unchanged.

### The link between the servers survives a broken direct route

- When a server's direct posts to the main server's socket host (`SP_REGION_SOCKETS`) fail 3 times in a row, the
  link posts through the main server's public site address instead. Every 5 minutes it tries the direct host again and
  goes back to it once it answers. Each switch is logged once.
- Before: a broken direct route left the link down until the route came back by itself, and cross-server matchmaking,
  counts and the room browser stayed local all that time.
- Only the link between the servers switches. Players' sockets and ping tests keep the direct host; nothing they see
  changes.
- While every post fails, the posts slow down from every 2 s to every 30 s, and go back to every 2 s once one gets
  through. `/healthz` shows `peer.fallback: true` while the link uses the fallback.

### Grand Alliance: One for All

- A Grand Alliance host can switch the room's strategy from Free pick to One for All. Everyone then votes in secret for
  one strategy, and the whole room plays the winner.
- Everyone votes at the same time, with one 50 s clock. You see only your own card and how many Doctors have locked in.
  Confirm locks your vote. When everyone has locked in, the vote ends at once.
- If you don't confirm, your highlighted strategy counts. With nothing highlighted, you vote for a random strategy (never
  one switched off this match). A tie is a random draw among the tied strategies.
- The reveal plays on Protocol Start!: every Doctor's pick lands on their card, the lines grow into the ship, the winner
  bursts into the centre under a gold ALL!, and the other picks glitch and turn into it.
- One for All rooms have their own badge and filter in the room browser and are matched only with each other. The
  stats page keeps One for All as its own mode.

### Thorns the Lodestar's third skill covers the official area

- Thorns the Lodestar's S3 now works like the official game: one sea area spanning the operators it lands on (the
  shape between them, fixed where it was thrown), burning the enemies inside once per interval. Before, each targeted
  operator got its own ring reaching 1.5 tiles out, moving with them and burning on its own, so an enemy near two of
  them burned twice.
- The area reaches a third of a tile past the line joining the targets on every side; when they stand in one line it
  is a strip two thirds of a tile wide along it. The official line effect now runs around the area's corners.
- Its targets follow the official rule: operators in his range only (he can pick himself), the lowest Block first, a
  tie going to the latest deployed. Alone in range, the area is just his tile: enemies standing on it burn, but huge
  enemies never do, as in the official game; otherwise a huge enemy counts once its body reaches the area's box.
- With official effects off, the area shows as one outline through its corners instead of a ring per operator.

### Lobby update news: Update 0.3.4-2

- The lobby banner now reads "Update 0.3.4-2" and shows again to everyone who closed the last one. Its new highlight: a
  Doctor who leaves is out for good, and the next round no longer waits for them (disconnecting is fine). 0.3.4's highlights stay below it.
- New points: room chat, full skill start animations, official skill and outfit sounds, more official effects, attack
  timing that follows attack speed, and Lemuen, Blaze the Igniting Spark, Talulah and Mizuki as in the official game.
  0.3.4's four main points stay after them; the 0.3.4-1 hotfix lines are gone from the banner and every language pack.
- The banner has colour now: "out for good" in a dark blood red, operator names and room chat in leaf green, smarter
  bots in cyan. The two new colours are text tags (`<@sp.blood>`, `<@sp.leaf>`) that the live news file can use too.

## 2026-11-11

### Plain-text nicknames

- Doctor names follow the same plain-text rules as chat: letters of every language, digits, punctuation and a few signs. Emoji, symbols, HTML tags, invisible "filler" characters and "Zalgo" stacks are removed, and fancy-font letters become normal letters.
- Before: a name could hold emoji, symbols or invisible filler characters (blank-looking names).
- A name made only of removed characters counts as empty, so the title screen asks for another one.

### Chat in the alliance room

- The room screen (4 players or a Grand Alliance's 8) has a chat log under the seat cards: time, name (squad A green, squad B blue, yours gold) and the line, plus who joined or left. Scroll up to read back; a "↓ N new messages" button brings you down again, and ⤢ makes the log taller.
- Each line also pops a bubble over the sender's seat card, emotes too. The mute button on each player's name plate hides their bubbles and their lines (the same mute list as in the match).
- On a phone the log is a Chat button with an unread count and the last line; tap it to open the log over the left half of the screen.
- No kill wallet in the room: anyone seated can talk, up to 100 letters a line. Spectators can read along.
- Spam limits: one line every 1.5 s, 6 lines in any 15 s and 20 lines in any 5 minutes; going over pauses your chat for 30 s, then 60 s, then 120 s. The same line twice within 10 s is dropped. Reconnecting does not reset a pause.
- If the whole server's chat gets too busy, or one room uses more than its fair share, a line is not sent and you see "Chat is busy. Try again in a moment." A room that floods the chat only silences itself, and lobby chat can never use up the part of the budget kept for in-game chat.
- If you lose the connection and come back, you get the lines you had already seen. Someone who joins later does not see older lines. Chat is kept only in the server's memory, never saved, and is gone when the room closes.

### Plain text in both chats

- Match chat and room chat now take plain text only: letters of every language, digits, punctuation, currency signs and a few maths signs. HTML tags, emoji, symbols, invisible characters and "Zalgo" stacks of accents are removed; fancy-font letters become normal letters.
- Before: match chat let emoji and any other character through.
- A match chat line is also at most 100 letters now, whatever your kill wallet holds, and the same spam limits and busy check apply there.

### Summon and talent effects from the game client (part 1)

The game client defines effects for summons and for talents that we never drew. This part adds:

- **Summons know their summoner.** Each summon now tells the game which operator summoned it, so that operator's effects can play on it. Kal'tsit's Mon3tr now shows her S1–S3 buffs, Pozëmka's sub-bow shows hers, Closure's command center shows its S2 and S3 range loops, and Vigil's wolves and Mechanist's summons show their skill buffs.
- **Muelsyse's clones.** A clone that splits during S3 now plays the official split effect, and its official end effect where it stood when it goes.
- **Talent effects on other units.** Pallas's Peak Performance glow on the allies that have it, and her S3 blessing; Texas the Omertosa's S1 cut on the enemies it hits; Eunectes's S2 stun on the enemy she blocks; Astgenne the Lightchaser's S3 link on each linked enemy; Ho'olheyak's S3 lift; Insider's ammo grant on the chosen ally; Shu's S3 seed mark on marked enemies.
- **Talents that fire at a moment.** Necrass's skeleton upgrade glow and her S3 special skeleton's growth; Kal'tsit Esperanta's S3 teleport out and landing; Typhon's S3 aim; Narantuya's S3 boomerang return.
- **Sandbox.** A new `&tokens=` link parameter places summon pieces next to their summoner (Mon3tr, Closure's command center).

### Summon and talent effects from the game client (part 2)

Talent and trait effects that depend on what is happening in the battle now show while that holds:

- **Ready and charged states.** Papyrus's and Lessing's glow while S1 is ready; Leizi the Thunderbringer's and Młynar's trait glow grows with their attack ramp.
- **Effects while something lasts.** Nasti's S2 shield while it holds; Lucilla's S2 talent boost while S2 runs; Heavyrain's S2 aura on the allies inside it; Humus's recycle shield while it holds; Lee's guard while it is up, and its hit when it cancels a stun.
- **Marks and moments.** Carnelian's S3 mark on enemies, part-charged and full; Swire the Elegant Wit's merchant payment and revive; Humus's trait heal; Aroma's S2 landing; Тоска's heal and SP grant on the ally.

### Grand Alliance: join a squad instead of hopping seats

- In a Grand Alliance room you now change squad with Join Squad A / Join Squad B, shown on the other squad's empty seats. You take that squad's first free seat.
- You can't move inside your own squad any more, and you can change squad at most once every 5 seconds and 4 times a minute. The button counts down while you wait.
- Changing squad clears your Ready. The host can still swap two players, but only between the squads.
- Before: every empty seat had a Sit here button for every player, with no limit, so one player could jump around the room and make everyone's screen jump.

### Official effects that skills put on the targets they hit

- Pepe's normal attack and S3 now show their official impact effects on the enemy they hit. Before, they showed only a generic spark.
- Closure's S3 now sends her official airplane to each target her attack marks.
- The S3 hits of Specter the Unchained, Saga and Typhon, Executor the Ex Foedere's S3 finishing shot and Folinic's S2 hit (on enemies) now show their official effects.
- Lee's S3 shows its knockback burst around him on each attack.
- Vigil's wolves now show their own bite effect, and the enemies Burning Vine and 'Hateful Avenger' show their own attack effects.
- When the game picks one of several versions (Pepe's S3 by stacks, Vigil's wolves by pack size), the plain version shows, since the battle doesn't tell the board which one applies.
- The effect extractor now reads these buffs on attacks (and the ones projectiles leave as they end) and records which branch of a condition each effect sits on. A relink run (`--fx-relink`) adds them to the effect index; no new effect files are needed.

### AI players in a player's browser can use Ioleta's adaptive AI

- New server setting `SP_HOST_BOT_STRATEGY` picks the AI that bots play when they run in a human's browser (`SP_BOT_EXECUTION=host`, and every Grand Alliance room). Bots the server plays itself keep the original AI, and a per-seat setting still wins. Unset, nothing changes.
- An unknown AI name in the setting stops the server at startup with a clear message.
- New tool `tools/hostbotbench.mjs` times the real browser bot Worker in a GPU Chrome over whole matches, per AI and room size, against the bot time budget.
- Measured on a desktop (14 preps, the same boards for both AIs): Ioleta's adaptive AI thinks less than the original. A whole round of bots took 3.8 s at the median and 18 s in the slowest round with 4 players (original AI: 6.4 s and 34 s), and 12.8 s and 79 s with 8 players (original AI: 17.1 s and 134 s). Only the last prep goes over the bot budget (42 s typical, 60 s there); the bots then place the best layout tried so far.

### A skill with a start animation plays it in full before the skill begins

- When an operator casts a skill that opens with a start animation, the animation now plays to its end before the skill takes effect, as in the official game, and the operator's attacks wait for it. This covers 138 skills of 91 operators, such as Mizuki S3, Ayerscarpe S2 and Gavial the Invincible S2; the start animations last 0.1 to 1.5 s.
- Being stunned, frozen or put to sleep during the animation cancels the cast and keeps the skill points.
- Before: the skill took effect at once, and the first attack cut its start animation off.
- Skills without a start animation, such as Mostima S3, are unchanged. This changes battle results a little.

### Skill marks now show on the unit that holds them

- The official mark a skill puts on another unit now shows on that unit while it lasts: an enemy it locks, binds or puts to sleep, an ally it shields or heals, or the operator's own summons.
- Before: the screen was never told which unit held the mark, so most of these marks never appeared.
- This covers 41 of the 43 missing marks on 27 operators. Fights don't change, and bot battles do no extra work.
- Two marks stay out on purpose: Mon3tr's model hide (the official game hides her body, not an effect), and Titi S3's line, which belongs to the planned line-effects work.

| Operator | Mark that now shows |
|---|---|
| Papyrus | S2: the lock mark on the ally she heals, and her own glow |
| Titi | S2: the glow on the ally she puts to sleep with her; S3: the mark on sleeping enemies, with its burst as they wake |
| Lee | S2: the paper mark on his target |
| Mostima | S2: the time-lock glow on every enemy she stops |
| Degenbrecher | S2: the slashes on each enemy she hits |
| Zima the Raging Tide | S3: the bind on the enemies the hammer pins |
| Blemishine | S2: the sleep glow on the enemies on her tile |
| Saria | S3: the calcification on the enemies around her |
| Closure | S1: the shield on the allies it covers |
| Tin Man | S2: the heal glow on allies standing in the zone |
| Entelechia | S2: the blood scythes around her second unit |
| Heavyrain | S1: the camouflage glow on the ally she hides |
| Warfarin | S2: the plasma glow on her and the ally she picks |
| Exusiai the New Covenant | S2: the mark on the operator she steals attack speed from |
| Pith | S2: the glow on every Caster her skill boosts |
| Pozëmka, Thorns, Swire, Gladiia | S1 / S2 / S1 / S3: the skill's own glow on themselves |
| Mon3tr | S3: the glow as she moves to the Reconstruction and back |
| Raidian, Ling, Stainless, Magallan, Jessica the Liberated | The skill's glow on their summons while it runs |
| Тоска, Angelina the Mellow Wish (not on EN yet) | S1 glow on the ally; S3 weapon glow and range ring |

### Damage-over-time and heal ticks show their official hit effects

Many skills hit or heal again and again over time: a poison cloud, a heal rain, a pulse every second. The official game plays an effect, and often a sound, on each unit at every tick. The battle never told the screen about those ticks, so 18 such effects never showed. Now each tick sends a display-only signal, and the screen plays the official effect on the right unit, even after the skill has ended (Lumen's S1 heals keep going after the cast). Nothing in combat changes.

| Operator | Skill | What now shows at each tick |
|---|---|---|
| Tin Man | S1, S2 | The hit on every enemy in the alchemy unit's area, with its sound |
| Lumen | S1 | The heal splash on each ally the rain heals |
| Necrass | S2 | The hit on each linked enemy, with its sound |
| Penance | S2 | The weapon slam on Penance and the hit on each enemy every second |
| Haruka | S3, talent | The hit on each floating enemy; the burst on an ally whose bubble breaks and heals, with its sound |
| Tragodia | S2 | The hit on each enemy the summon's burst left delirious, with its sound |
| Thorns the Lodestar | S2 | The hit on every enemy in the drifting alchemy unit, with its sound |
| Hoshiguma the Breacher | S2 | The hit on each enemy the circling shield strikes, with its sound |
| SilverAsh the Reignfrost | S2 | The slash's hit on each enemy |
| Titi | S3 | The burst on each enemy that wakes up, with its sound (instead of the plain wave) |
| Yu | S2 | The teleport effect on each enemy pulled to Yu (instead of the plain flash) |
| Muelsyse | S3 | The pull ring on each melee Flow at every pulse, with its sound |
| Closure | S2 | The refund glow on an operator deployed in range |
| Mechanist | S3 | The hit on each enemy Mechanist blocks |
| Тоска (CN) | S3 | The start effect on the ally that receives the S3 effect |

- 7 new sound files (87 KB) for the server and the preload zip.

### Slow attackers swing at their own speed, as in the official game

- Each operator's attack now slows its animation only as far as the official game allows that attack: its own limit, read from the game client (`docs/research/15-attack-anim-scale.json`, 239 units). Until now every operator could slow down to 2.5×.
- Most operators have a limit of 1×: a slow attacker swings at its normal speed and its hit lands at the swing's strike frame, early in its attack interval. Mostima's hit now lands 0.70 s after her swing starts instead of 1.17 s; Mizuki, Ashlock, Warfarin, Greyy and Ptilopsis gain about 0.7 s. A few attacks have a limit of 1.1×, 1.2× or 2×, and 62 have none.
- Attack effects follow the same limit.
- This changes battle results a little: in the test battles kills rise 0.7 %, healing 2.2 %, and the bot matches win one more (20 of 21).
- Not yet modelled: in the official game an enemy effect that slows a unit's animation also limits its swing further.

### Attack effects speed up with the attack, as in the official game

- When a unit attacks faster than its attack animation lasts (attack-speed buffs, fast skills), the effects of its attack now play faster too, as the official game plays them: the swing and skill effects the game marks for it (2,976 of the 10,330 effect files, mostly attack and skill starts), their delays included, so a flash or a wave stays with the swing. Vulpisfoglia's S3 now plays its swing effects at 2×, Archetto's S3 and Swire's S2 at about 1.25×.
- Each effect keeps the official limit: most may play at most 2× as fast in real time, so at 2× battle speed they keep their normal speed. A few have no limit or a higher one.
- A slow attack slows its effects only as far as its swing may slow (the attack's own limit, above). Effects the game doesn't mark (buffs, statuses, most hits) keep their speed; only their official start delay shortens with the attack, as in the game.
- Display only: battle results and bots are unchanged.

### Территория's talent lands 0.1 s after a withdrawal

- When Территория leaves the field for any reason other than a knock-out (a retreat, a forced exit, a raid jump), the talent 此身为界 now deals its damage, stuns and shows its tile effect 0.1 s after the exit, as the official game's withdraw shot does. Before, it all happened in the same instant. A knock-out still lands 0.7 s later, as before.
- The official withdraw shot is an invisible projectile that lives 0.1 s and hits as it stops. Its only visual is the tile effect on every tile of the operator's field (国度), which we already played; it has no sound of its own.

### Effects that stay after a skill ends

- Pramanix the Prerita's idle glow now goes away while any of her skills is on and comes back when it ends, as in the official game. Before, it stayed on through her skills.
- Nasti's S1 glow is now the other way round from before: it shows while S1 is off (from deployment) and disappears while S1 is on. Before, it only showed during S1.
- Gavial the Invincible's S3 now leaves its bleed effect on her for 20 seconds after the skill ends (the skill's own final duration). Before, it never showed.
- Their outfits use their own versions of these effects.
- The effect extractor now records the duration of a buff that a skill creates, not only its parent's, so effects like these play for the official time.

### Every skill plays its own official sounds

- Skills now play their own sounds from the official audio data for every operator, not just a few picked by hand. Before, 72 skills on 66 operators made no sound of their own (Texas S2 Sword Rain, Ifrit S2, Ch'en S1, Mudrock S2 …). Now 71 of them do, and 91 of the 122 skills that were missing some of their sounds have more of them.
- The sound files decide where each sound goes: a skill's own swing and impact play on its attacks while it runs, its cast plays when it starts (beside the activation sound when it has one), a looping sound (Ifrit S3's flamethrower) holds until the skill ends, and its end sound plays when it ends.
- Blaze the Igniting Spark, Lemuen, Mostima and Talulah keep their hand-made sound setups.
- 197 new sound files (5.8 MB) for the server and the preload zip.
- Not covered yet: sounds the game plays on its own triggers inside a skill (custom triggers, check points, attack finishes), which need per-operator work.

### Lasting skill glows that only start partway through now show

Many official skills light up a lasting glow only when something happens mid-fight: a charge is stored, an overload begins, an enemy dies, an ally's bubble or shield goes up. The battle never told the screen about those moments, so the glows never appeared. They now show for 23 operators, and stop when the official game stops them:

| Operator | What now shows |
|---|---|
| Horn | S2 / S3 overload glow, from the moment the overload begins |
| Leizi the Thunderbringer | S1: one ring per stored charge |
| Ascalon | S2: the debuff glow on enemies around a kill, stronger at full stacks |
| Тоска | S1 shield, S2 attack-speed and S3 attack glows on the ally whose trigger effect fired |
| Lumen, Gnosis | S2: the one-charge and two-charge glows |
| Mon3tr, Caper | S1: the ready glow |
| Minimalist | S2: the weapon and body glows while the skill is ready |
| Ch'en the Holungday | S2: the half and full charge glows |
| Haruka | The bubble's glow on the ally holding it (S1) |
| Philae | S2: the attack glow after the first element hit, with its start burst |
| Lessing, Vulpisfoglia | S2 glow while blocking; S3 camouflage glow while not blocking |
| Civilight Eterna, Muelsyse | S2 rope / S3 water on the enemies they bind |
| Executor the Ex Foedere | S3: the aim mark on every enemy he hits, until the skill ends |
| Schwarz, Bellone | The DEF-down mark on the enemies they weaken |
| Silence the Paradigmatic | S3: the glow on an ally kept alive at the brink |
| Ch'en the Dawnstreak | S2: the glows after she comes back |
| Angelina the Mellow Wish | S3: the wing glow on the side she faces |
| Nearl the Radiant Knight | S3: the combo glow when deployed right after a Kazimierz operator |

Fights don't change, and bot battles do no extra work.

### Shots leave from the right spot when a model has no usual muzzle point

- Ch'en the Holungday in her Holiday HD79 outfit: her S2 and S3 water bursts now leave her water gun. That outfit's model has different muzzle bones from her default look, so they used to start below her feet. A muzzle point now also tries the usual muzzle bones of the model actually drawn.
- A unit with no muzzle point at all (Santalla, Viy) now aims from its feet, as in the official game, where the animator hands over the foot point when there is no muzzle. Before, it was a guessed spot 0.4 tiles up.

### External AI is shelved: locked in every build

- External AI (the `sp-ai/1` advisor / plan / LLM integration, shelved upstream since 2026-11-05) is now off in every build, development checkouts included. Selecting it (`SP_BOT_STRATEGY=external`, a seat override, a match's `botStrategy: 'external'`, any `SP_EXTERNAL_AI_*` / `SP_LLM_*` setting) logs one line and the built-in bot plays. `SP_UNSHELVE_EXTERNAL_AI=1` brings it back; the code is unchanged.

### Outfits with their own official battle sounds play them

- Three outfits have official battle sounds of their own, and now play them: Goldenglow's Party In The Garden, Executor the Ex Foedere's The Train Runner and Eyjafjalla's Fluffy Little Witch (the Sanrio outfits). Their attacks, impacts and skill sounds use the outfit's files; anything the outfit has no sound for stays the operator's. Eyjafjalla's outfit also has an S2 explosion sound of its own.
- It works for any outfit: the asset build finds an outfit's sound banks in the official audio data by name, so a new one needs no code. Skadi the Corrupting Heart's Red Countess already played its own voice lines; its sound effects are the same as the default outfit's.
- Goldenglow's drones were silent in every outfit. Each drone hit, a drone's self-destruct and S2 / S3's drone launch now play their official sounds. Eyjafjalla's attacks now have their impact sound (in her Sanrio outfit, S3's impact is its own).
- The rest of these three operators' official battle sounds play too, in every outfit: Goldenglow's own S1 / S2 shot when she sends out drones, and each drone's signal 0.6 s after launch; Eyjafjalla's S2 swing and its hit; Executor the Ex Foedere's talent double strike (its own sound in S3) and his S3 final verdict. His Sanrio outfit's S2 attack also plays its second shot sound.
- Behind the scenes: the dev sandbox plays an outfit's own battle sounds too, and an outfit sound's pitch and delay settings are found under the file's served name.
- Server: 41 new sound files (26 for the outfits, 15 default ones for these three operators), all in data/assets.json.

### Blaze the Igniting Spark can no longer use skills while downed

- While her talent From the Ashes has her downed, she can no longer start a skill, as in the official game, where the downed state silences her. Her SP still recovers, so a full skill starts the moment she stands back up.

### Line and path effects: Территория's kingdom, Aphrissa's S2 beam, Angelina the Mellow Wish's S3 range line

- Территория's kingdom now shows the official kingdom look: the kingdom effect on every tile of it and the official line along its outer edge. It follows his range as it grows and shrinks, and fades shortly after he leaves. Before, the game drew a stand-in purple field.
- Aphrissa's S2 beam now draws the official beam: one line from her weapon along the beam's path, bending where her relays and allied operators turn it, with the official start, relay and end point effects, for as long as S2 runs. Before, nothing showed the beam.
- Angelina the Mellow Wish's S3 now shows the official range line around her running attack range: her original skill range plus the tiles around her, following her as she flies.
- The points come from the battle: Aphrissa's S2 start now sends the beam's path, and Angelina the Mellow Wish's S3 start sends her skill range. These are display fields on events the battle already sent, so battles play out exactly as before. The new `render/vfx/pathfx.js` traces a tile set's outer edges into closed outlines through the tile corners, as the official range line does, and draws any official line through many points.
- Not covered: Aphrissa's normal attack line and a beam path that changes during S2 (it keeps its starting path). Thorns the Lodestar's S3 polygon line is a separate follow-up.

### Lemuen's skills show every official effect

A full check of all 31 of Lemuen's effects, in her default look and Requiem Vesperis, found these pieces we never drew or drew wrong:

- **S3 aim beams.** Each S3 lock now drops a beam onto the locked enemy (`lemuen_skill_03_trail_01`), gold in Requiem Vesperis. The beams stack, one per lock, and each stays until its shell lands, as in the official game.
- **S2 aim reticle.** The aim line now also puts its reticle on the aimed enemy (`lemuen_skill_02_crosshair_01`, the line's own end effect), until her shot.
- **Talent 2 (Extradition Procedure).** When it activates, its loop (`lemuen_talent_buff_02`) now plays on her for the rest of her deployment, instead of a stand-in burst.
- **Outfit effects inside effects.** Effects that an effect starts on its own now use the unit's outfit version. In Requiem Vesperis, Lemuen's S1 glow showed a default-look piece; other operators' outfits that work the same way are fixed too.
- **S2 aimed shot.** Her aimed S2 shot now plays its muzzle flash (`lemuen_skill_02_start_02`, the back-facing `_back` when she faces up, with `_start_01`) and flies its own projectile to the target, whose hit plays as it lands. Her ordinary shots during S2 now look like her normal shots; before, they borrowed the aimed shot's look and the aimed shots had no flash.
- **Deploy effect in prep.** Putting an operator on the board in prep, and the round-start landing, now play the official deploy effect: the generic one, or the outfit's own (Requiem Vesperis: `lemuen_birth_01`). Before, only a stand-in flash showed. This applies to every operator.

### A player who leaves is out for good, and the next round doesn't wait for them

- Leaving a match now eliminates the player in every room type, Grand Alliance included. Before, a Grand Alliance player who left (or was removed for idling) stayed in the match and the AI played their board every round. This also applies when a dropped player doesn't come back before the rejoin window ends. During that window nothing changes: in a Grand Alliance room the AI still plays a dropped player's board until they come back.
- A battle the player was fighting when they left plays out to its end as usual. It goes at once to another player's browser (the host first, or the boss partner), the same way a disconnect's does. Before, a Grand Alliance player leaving mid-battle made everyone wait about a minute, then the server ran their board.
- From the next round on, nothing of theirs runs any more: no AI board, no prep, no battles, on any player's browser or on the server.
- The Grand Alliance idle warning now says the next idle round removes the player and eliminates them, instead of saying the AI takes over their board (all languages).

### Blaze the Igniting Spark looks and sounds complete

- Her S1 now shows its red smoke ring around the operator it picks, for the skill's 20 seconds.
- Her S2 leaves burning ground on every tile it strikes, until the skill ends.
- The fire ring of her talent From the Ashes no longer burns at her feet all fight. It now appears only while she is downed, and she kneels inside it as in the official game. Standing back up plays the official burst.
- Her outfits use their own versions of all these effects.
- New sounds: her S3's ability end (alongside its closing sound), going down, standing back up, and her Meltdown talent's Burn burst.
- A skill can now play several official sounds when it starts or ends, not just one.

### Element bursts sound as in the official game

- When an element gauge fills and bursts, the official burst sound now plays. As in the official game, the sound belongs to the unit that bursts:

  | Element | On an enemy | On an operator |
  |---|---|---|
  | Burn | no sound | the burn sound, layered with a flare |
  | Necrosis | the necrosis sound (slightly quieter) | the same |
  | Nervous Impairment | no sound | the nervous impairment sound |
  | Corrosion | no sound | the corrosion sound |

- The sounds come from the official buff templates of each burst, which name the sound each one plays. They are in `tools/assets/plan.mjs` (`BURST_SOUND_BANKS`) and the manifest's new `audio.sfx.burst`, and they follow each official sound's own pitch range, volume and how many can play at once. Five new sound files.

### Lemuen's Wanted mark looks as in the official game

- An enemy that Lemuen's talent marks as Wanted now carries the official mark, a loop on the enemy (`lemuen_talent_buff_01`), for as long as it stays Wanted: until it dies or leaves, or the Lemuen it counts for leaves. It was a short stand-in reticle drawn by the game.
- In Requiem Vesperis (`char_4193_lemuen@ambienceSynesthesia#7`) the mark uses the outfit's own version.
- It shows whatever skill she has equipped. Its sound (`p_imp_lmwlcrstrmk`) already played as the mark appears; that is unchanged.

### Talulah (塔露拉): her talent's sword effects, her S2 stack as in the official game, no stand-in overload glow

- Talent 1 (怒火): her blade glows (the official oxi_buff_02) while she holds any 怒火 layer, and embers run along it (oxi_buff_03) once the layers are full. An attack that spends a layer ends the embers.
- S2: while its stack holds, her attacks land the official BuffedAttack impact sound (p_imp_xtlfgbw_h) instead of her normal one, and the stack's flame (oxi_skill_02_buff_01) lasts until the last layer runs out. It used to end one stack duration after the cast.
- S3: the overload no longer draws a made-up orange glow on her. The official game plays only its sound there, which stays.
- Her S3 still ends without a closing sound: the official client plays that sound (b_char_boostclose) only when a player stops the skill by hand, which this mode doesn't allow.
- Behind the scenes: the battle sends her 怒火 and S2 layer counts to the client as a display-only fx (`buffLayers`). No battle result changes; only the fx counts of the two Talulah golden scenarios (diy-140, diy-141) moved.

### Mizuki's skills play their own animations and impact sounds

- Mizuki now animates each skill as in the official game, in every outfit. Her S2 (Prisoner's Dilemma) attacks with its own swing and rests in her normal pose. Her S3 (Moon in the Water) opens with its start animation, swings its own attack, stands in its skill stance between attacks and closes with its end animation. An S1 (Awaken) charge is her normal swing. Before, the game paired her animations with her skills by their names, which her model doesn't follow: S2 played S3's animations, S3 swung her plain attack and S1 played S2's swing.
- Her attacks now land with their impact sound, and an S1 charge has its own impact instead of S2's. During S2 and S3 she swings with her normal swing sound and each hit lands with that skill's own impact. Before, the impact sound played at the swing.

## 2026-11-10

### Operators attack as in the official game: the swing starts, then the hit lands

- An operator's attack now follows the official order. When its attack is ready and an enemy is in range, the attack animation starts from its first frame, and the damage (or heal) lands at the animation's strike frame. Before, the damage landed the moment the attack was ready and the animation was fitted around it, so the swing often had to be squeezed or restarted: the visible twitch before many strikes, and the first attack of a fight started mid-swing.
- The strike frame comes at the official time: the animation is sped up or slowed to the operator's attack interval as in the official game (between 0.1× and 2.5× its normal speed), so a faster attacker swings faster and its hit comes sooner.
- The target is chosen when the swing starts, as in the official game: an enemy that walks out of range during the swing is still hit; an enemy that arrives during it waits for the next attack. If the target dies first, the hit goes to another enemy in range, or the swing stops.
- A stun, freeze, sleep or Disarm during the swing interrupts it: no hit, and the operator attacks again as soon as it can. A skill that starts or ends during the swing makes the hit pick its targets for the skill's attack (so a heal never lands on an enemy).
- This changes battle results a little (every hit lands slightly later than before). Operators and summons with no attack animation in the game data, and the older game versions, keep the old timing.
- Logos's S2 still attacks exactly every 0.5 s: its fixed rhythm now counts from the start of each swing.
- Behind the scenes: a bot battle's progress timeline now ends at exactly the battle's reported end time (both to the millisecond).

### The lobby's update news can change without a new release

- The servers can now replace the lobby's Update banner at any time: one news file holds every language, and `node scripts/deploy-regions.mjs news --hosts <servers> news.json` sends it to every server (`--show` and `--clear` too; `scripts/news.mjs` on one server). Online players see the new banner within about 10 seconds, without a reload, and it shows again for players who closed an earlier one. A new release is still needed for anything else.
- Each player sees the news in their own language, else in the file's English, else the banner built into the release. Lines can use the game's own colour tags (blue, red, orange, mint, grey); there is no HTML and no links.
- The file is checked before it is sent and again on each server: size, lengths, languages and line breaks. A refused file changes nothing. Notes in `docs/DEPLOY.md` / `DEPLOY.en.md` §1.7.
- Server side: the notice, maintenance and news boards now share one file-polling base (`server/fileBoard.js`) instead of separate copies.

### Update news: 0.3.4-1

- The lobby banner now announces Update 0.3.4-1, and it shows again for players who closed the 0.3.4 one. Its five headline lines are unchanged.
- Seven new points come first: skills cast when the official game casts them; official element burst effects and the element ring under the feet; Mostima's, Lemuen's and Reed the Flame Shadow's S3 look and sound as in the official game; attacks no longer twitch before the strike; stored skill charges show over the operator's head; Damage Stats keep every round; and the Custom Squad's easier-to-spot swap button and ✕ to clear a slot.
- Kept: Profile Icon, SilverAsh the Reignfrost's S3 with 20+ operators' attacks, 7 new outfits, and smarter bots. Dropped from the banner and the language packs: the lines about skills that replace an attack, the Viviana VFX fix, and skill cast sounds.

### Streak and spike particles point the right way

- Stretched particles (streaks, spikes, speed lines) now draw their texture in the official direction: the pointed end trails behind the particle instead of leading. Blaze the Igniting Spark's S3 hit becomes a burst of thorns pointing outward, as in the official game, instead of a pale disc of blades pointing inward. Every effect that uses stretched particles changes the same way.

### Blaze the Igniting Spark sounds like the official game

- Her S1 now plays its own cast and impact sounds, and the bolts of her S2 and S3 land with their own impact sounds instead of her normal attack's.
- Her S3 plays its activation sound when it starts and its closing sound when the last bolt is spent.

### Reed the Flame Shadow's S3 blast looks and sounds as in the official game

- During Reed the Flame Shadow's S3 (Ember of Life), an enemy that is defeated while carrying Cinder now bursts with the official blast effect on the ground where it fell, with the official explosion sound. Before, the game drew a stand-in orange ring, with no sound.
- Each outfit (Curator, Summer Flowers FA075, Glowing Flame in the Night) shows its own version of the blast, as in the official game. All outfits use the same sound, as in the official data.
- What the blast does is unchanged: arts damage to the enemies within 1.7 tiles and Cinder on each of them, so a blast can set off the next one. This already matched the official game. One official sound file was added.

### Plugin rooms survive a busy server

- A plugin room's match no longer ends with "the match host stopped" when the server is busy as the match starts. The hang watchdog (10 s without a heartbeat) counted from the moment the match process was created, so a slow start (Node itself, its modules, the room's 13 MB of data) on a loaded machine looked like a hung plugin. The watchdog now counts from the process's first heartbeat, sent as soon as the room's data arrives and before any plugin code runs; a process that sends nothing at all for 60 s still ends as a start failure. While it checks and reads the data, the match process now lets its heartbeats out between files.

### Element bursts look as in the official game

- When an element gauge fills and bursts, the unit now shows the official effect instead of the same orange flash for every element:

  | Element | On an enemy | On an operator |
  |---|---|---|
  | Burn | a white-hot flash, then flames for the whole burst | flames on the operator for the whole burst |
  | Necrosis | a dark hit, then dark mist for the whole burst | the same |
  | Nervous Impairment | a nerve flash, then the Palsy effect while its stacks last | a nerve flash, next to the stun |
  | Corrosion | a water hit, then a water mark while the DEF cut lasts | a water explosion, then the DEF-down mark while the DEF cut lasts |

- Blaze the Igniting Spark's S3 no longer draws an orange ring on every hit on top of her official hit explosion.
- Palsy (from Nervous Impairment and other sources) now shows its official effect on the unit while the stacks last, and a spark each time a stack interrupts an attack.
- The effects come from the official buff data and buff templates for each burst. `tools/local-extract/fx.py` names them in new `burst` and `fx` groups of the effects index, and ten new effect files are extracted.

### Attacks no longer twitch before the strike

- In battles your browser runs (the sandbox, and match battles simulated in your browser), operators no longer flash their resting pose for a couple of frames just before each strike and then jump back into the swing at high speed. Every operator did this at 1× and most did at 2× (Reed the Flame Shadow's S3, Surtr, Exusiai, Texas the Omertosa…).
- The battle on screen now trails the simulation by 0.2 game seconds, as server-run battles already do, so each attack's wind-up starts in time and plays out in full. In matches (2×) that is 0.1 s; in the sandbox at 1×, 0.2 s. Sandbox: `?lookahead=off` shows the old behaviour for comparison.

### Element damage shows as the official ring under the feet

- Elemental damage (Burn, Nervous Impairment, Corrosion, Necrosis) now shows the way the official game shows it, drawn with the official client's own art: a ring in the element's color under the unit's feet, with a white arc inside it for the element value left. The arc shrinks clockwise from 12 o'clock, and the burst comes when it runs out. Before, a small disc and a white bar sat in a row under the HP bar.
- Operators' rings carry the element's icon and flash on every elemental hit, with a faint trail showing the last drop. An enemy's ring flashes outward when it bursts.
- During the burst cooldown the arc refills at half opacity, as in the official game. Before, the bar turned the element's color and the disc blinked.
- The HP and SP bars stay over the head as before. Until the new art has downloaded, the ring is drawn with the old element disc and a white arc in the same place.

### Skills cast when the official game casts them

- Every skill the mode casts by itself now follows the live official client's rules for when to cast (the trigger table of the current CN season). Before, the game used the previous season's table plus several rules of its own. Skills that cast automatically in the official game anyway (they start by their own rule) are unchanged.
- A skill can now have several conditions, and it casts as soon as any of them is met, as in the official game. Defenders, for example, cast when they're hit or as soon as an enemy is in range. Before, most defenders waited for a hit, and a few cast only with an enemy in range.
- Some skills now cast as soon as their SP is full, wherever the enemies are: Talulah S3 (Corona Ablaze), Degenbrecher S2 and S3, Executor the Ex Foedere S3, Passenger S3, Irene S2 and S3, Ch'en S3, Ch'en the Dawnstreak S2, Aphrissa S3 and Toska S3. Before, they waited for an enemy near them.
- Snipers and casters cast with an enemy in their attack range or in their skill's own range. Medics cast for an injured ally in their attack range or skill range. A skill with a range of its own (Blaze the Igniting Spark S2 and S3, for example) also casts once an enemy enters that range.
- Two of the game's earlier choices stay, because they play better than the official behaviour: Yu's S2 casts only with an enemy within two tiles, never from a hit (officially a ranged hit casts it with nobody to pull). Seven skills that grow the attack range by a tile or more still cast once an enemy enters the larger range: Archetto S3, Passenger S2, Hellagur S3, Saga S3, Pallas S2, Hoederer S3 and Jessica the Liberated S3 (officially they wait for the normal range).

### Mostima swings on every S3 attack

- Mostima's S3 (Key of Chronology), in every outfit, now plays her attack swing on each attack and stands in her S3 stance between attacks, as in the official game. Before, she raised her staff when the skill began and then held a still pose for the whole skill: the game had given her S3 the animations of her S2 (Lock of Shattered Time), going by the animation names, and that pose has no swing. The official game data now decides which animations each of her skills uses.
- Her S2 now plays the channelling pose it was missing, and her S1 no longer plays a skill pose: she keeps attacking normally, as in the official game.

### Stored skill charges show over the operator's head

- An operator whose skill holds more than one charge (Talulah's S2 holds 5, Warfarin's S1 2) now shows how many are stored, as in the official game: a yellow ring that turns slowly, with the count in the middle in the game's own font (Novecento Wide), above the bars and status icons. It shows while at least one charge is stored. Before, nothing showed the charges.
- It uses the official ring and disc art from the battle UI. The servers need the two new images (`ui/battleUi/sprite_auto.png`, `ui/battleUi/sprite_circle.png`); without them a stand-in ring in the same yellow shows.

### Mostima's and Lemuen's skills look and sound as in the official game

- Mostima in Ethereal Harmony (`char_213_mostma@ambienceSynesthesia#6`): every S3 attack now sends out its wave again. The outfit's wave waits 0.8 s before it appears, and the effects layer ended an attack's effects after 0.6 s, so it never showed: enemies were hit and pushed back with nothing on screen. An effect part that is still waiting when an attack's effects end now plays once, as authored. Her default outfit's wave already played.
- Lemuen in Ambience Synesthesia (`char_4193_lemuen@ambienceSynesthesia#7`): her S3 lock crosshairs and shell bursts now use the outfit's own effects instead of the default ones. Any skill effect tied to a sim event this way now follows the operator's outfit.
- Lemuen's S3 (every outfit) now plays its official pieces that were missing: the shell falling from the sky onto each spot (it was a stand-in shell drawn by the game), the lock-on mark on each locked enemy, and her salute as the skill ends.
- Mostima's S2 (Lock of Shattered Time) no longer draws its attacks with her S3 ripple. The game took the attack mode that belongs to her S3 for her S2 too, because of its name; the official data now decides. Mizuki's S1 had the same mix-up. During her S3, the old stand-in ring no longer draws under the official wave.
- Mostima's and Lemuen's sounds now follow the official game. Mostima: her attack impact, her S2 time lock as it starts, its strike every second and its impact on each stunned enemy, and her S3 activation sound; her S3 ripple lands without a separate impact sound, and her S2 attacks no longer use the S3 sound. Lemuen: her S1 and S2 impacts, her S2 attack, aim and aimed-shot sounds, her S3 lock, shell launch and shell impact sounds, the closing sound when a skill's ammo runs out, and the sound of the Wanted mark. Twelve official sound files were added.
- Mostima's S2 now shows its official hit on each stunned enemy every second. Lemuen's S2 now shows the official aim reticle and aim line while she aims, and her aimed shot lands with the official S2 hit. Both replace stand-in effects.
- Neither outfit (Ethereal Harmony, Ambience Synesthesia) has sounds of its own in the official data: both use the operators' default sounds.
- Mostima's S3 wave now arrives with each blow. Its built-in delay counted from the hit instead of from the start of her swing, so the wave came about 0.4 s after the enemies were already hit and pushed back. Any operator's attack effect with such a delay now counts it the same way when the attack shows up without a wind-up.
- A sound cut short by a newer copy of itself (each sound has an official limit of copies at once) now fades out over 15 ms instead of stopping dead, which clicked. Mostima's 5.6 s S3 ripple sound was cut this way on every attack, which sounded like static.

### Big Grand Alliance fights stay smooth on a PC

- On a computer at High quality, units now switch to impostors (sprites that redraw their pose every few frames) only past about 88 units on the field, not 44, as long as the frames keep up. A Grand Alliance relay field of 70–90 units is now drawn in full motion instead of in low-frame-rate sprites. If the frames fall behind during such a crowd, the field goes back to the old 44-unit limit until the crowd thins out. Phones and tablets, and Medium / Low quality, keep the old limits.
- On a computer, the impostor atlas can now use 5 pages instead of 3, so a big crowd no longer runs out of room once impostors are on.
- On a crowded field (more than 60 units), the official effects play a hit that repeats on the same unit within 0.1 s only once, and new hit effects wait while more than 1,200 particles are live (800 on the light effects tier). Skill loops, projectiles and other held effects always play. A fast Agile stack hitting one enemy no longer stacks dozens of identical sparks on it.
- The dev sandbox's battle bar shows the frame rate, the units on the field, whether impostors are on, and the live effects and particles (with the crowd budget's merges).

### Clear a Custom Squad slot from its card

- A Custom Squad operator's card in Operator Loadout has a round ✕ button at the top of its skill column, styled like the swap button beside the portrait (dark fill, red ring and ✕), the same size. Pressing it empties that slot back to "Choose an Operator", as the picker's Clear does, without opening the picker. The skill and module (or outfit) column moves down a little, so the ✕ never covers or takes a tap meant for the button under it. It doesn't ask to confirm: only the pick and its skill and module choice go, and the operator's potential and levels stay. Players asked for it.

### The Custom Squad swap button is easier to spot

- On a Custom Squad operator's card in Operator Loadout, the round button at the bottom of the left rail that opens the picker to choose another operator now has a mint ring and a mint swap icon, and fills the rail's width. Before, it was grey like the Alliance discs above it, and players said they couldn't find it. It stays in the same place and works the same way.

### The result screen scrolls through every player in Grand Alliance

- With more players than fit on the screen (Grand Alliance, up to 8), the player cards on the "Simulation Complete" screen now scroll sideways: with the mouse wheel, by dragging, by swiping on a phone, with the ← / → keys, or with the round ‹ › buttons at the sides. The screen opens with your own card in the middle and keeps it there if the window resizes or a phone goes fullscreen, until you scroll; the edges fade where more cards are hidden. Before, the cards past the screen edges couldn't be reached. A 4-player result looks exactly as before. The scrolling is a shared piece, so other rows that outgrow the screen can use it too.

### Grand Alliance leader HP grows with every player

- In a Grand Alliance room, the leader's HP in the Final Assault and the Hidden Core now grows with every player still alive when the fight starts: 6 players face 6 times the leader's HP for that difficulty, and 8 players face 8 times. Before, it stopped growing at 4 players, so a room of 6 or 8 fought the HP meant for 4 players. Rooms of 4 or fewer players are unchanged.

### Mostima's Ethereal Harmony S3 no longer covers her and her neighbours

- In Mostima's Ethereal Harmony outfit (`char_213_mostma@ambienceSynesthesia#6`), the big castle of her S3 drew over her and over the operators around her. Its mesh sits behind her in the official effect, so it now draws behind the units, as in the official game. The moon, violin, trumpet and stars stay in front of her, as they are authored. The same rule now applies to any effect mesh placed behind its unit this way (183 effects, mostly outfit skill buffs). Operators whose skill aura hid them the same way now show in front of it too: Civilight Eterna S3, Młynar S3, Qiubai S3, Gavial the Invincible S2 and Texas the Omertosa S3 in Wingbreaker.

### Damage Stats keep every round of the match

- The settlement's Full Report → Damage Stats could show only one round (a player saw just "Round 13" after a 15-round Grand Alliance match). The game threw away the match's earlier rounds whenever the match view went empty for a moment or showed an older round (a reconnect or a state resync can do that), and when the room went back to its lobby before the report was opened. Now the stats start over only when a new match begins, so By Round shows a segment for every round fought and the totals are the whole match's. This is a browser-side fix; nothing changes on the servers.

### Bond strip: no more scrolling line

- The in-battle bond strip shows as many bonds as fit its width (fewer on phones) and no longer scrolls, so the thick grey scrollbar is gone.
- When you have more, a "+N" button after the last bond opens the rest in a small grid under the strip. Tap a bond there for its details as usual; the button, Esc or a tap elsewhere closes it.

### Grand Alliance rooms from every server

- The Grand Alliance room browser now lists the open rooms of every linked server, not only the server your page is on. Each card says which server the room is on, with that server's ping. Join works for a room on the other server too, including a private room: you enter its password as usual, and the game moves you to that server. If the link between the servers is down, the list shows your own server's rooms only.

### Room cards show every player's outfit

- In the room lobby, each player's big portrait card now shows that player's outfit for the operator they picked, on everyone's screen. Before, you saw your own outfit on your own card, but the other players' cards showed the default art, or your own outfit choice for that operator if you had one. The Strategy Draft's player cards follow the same rule. When the outfit has no portrait, or its picture fails to load, the card shows the default art.

## 2026-11-09

### Phones go fullscreen and turn to landscape on the first tap

- On an Android phone (and other phone browsers with fullscreen), the first tap on the page now makes the game fullscreen and locks the screen in landscape. Browsers only allow fullscreen from a tap, so it can't happen as the page loads. That same tap still starts the opening film as before. If the player leaves fullscreen, the next tap doesn't force it back; the ⛶ button just enters and leaves fullscreen, and nothing is remembered. The game is meant to be played in landscape, so whenever the phone is held upright the "Rotate your device to landscape" screen now also says "Tap to switch to landscape", and a tap there goes fullscreen and turns the screen again. A browser that refuses to turn the screen gets the old "rotate by hand" screen. Tablets, desktops and touch laptops are not affected.
- A phone is now told to tap: from the first moment the opening's black card says "Tap to start", with a pulsing ring and "Full screen · landscape" under it (it used to say only "Loading" until the files were in), and that one tap starts the opening, makes the game fullscreen and turns it to landscape. A phone held upright gets the card too, over the "Please rotate your device" screen, so the opening now plays for it after the turn; before, it got no opening and no word about tapping. When there is no opening this time (it already played in this tab, or reduced motion is on), the same card asks for the tap over the screen. It only shows on a phone that still needs that tap; desktops, tablets and iPhones see no change.
- Phones whose browser also reports a mouse-style pointer or hover (some Android browsers) now get the first-tap fullscreen too, and a tap whose touch events were swallowed still enters on its click. While the page is fullscreen it's no longer mistaken for the installed app.
- On an Android phone, going fullscreen with that tap no longer hides the opening: the fullscreen page was drawn over it, so only its sound played. The opening is now put back on top as the page goes fullscreen.
- Adding `?fsdebug=1` to the address shows on screen why a phone did or didn't go fullscreen: each condition, the tap's events, and the browser's answers.
- iPhone Safari has no fullscreen for web pages and can't lock the screen's turn, so the "Rotate your device to landscape" screen now tells iPhone players how to add the game to the Home Screen, which opens it without Safari's bars.

### Outfit summons for Swire the Elegant Wit and Catherine

- Swire the Elegant Wit's outfit A Prosperous Visage and Catherine's outfit Cozy Bakery now give their summons the outfit's own look in battle (8 files, 138 KB) instead of the default one. The dev sandbox also draws a summon in its owner's outfit, as a match does.

### Operator Loadout's detail drawer on phones

- On a phone in landscape the operator drawer is now half the screen wide (320–400 px instead of 256 px), and the whole drawer scrolls as one, header first. Skills, modules, stats and outfits get the drawer's full height instead of the 27–117 px that was left under a fixed header.
- Reset to Default sits under the name instead of over it; Loadout / Outfits share the Collapse row; stat labels such as Attack Interval wrap instead of being cut; an outfit's Wearing badge no longer covers its name.
- On touch screens every button in the drawer is at least 32 px. The same applies to the Custom Squad picker's drawer. Desktop is unchanged.

### Exusiai the New Covenant's outfit speaks English, and the EN texts are current

- Exusiai the New Covenant's outfit The Legend Seeker (`char_1041_angel2@iteration#6`) now has its English and Korean voice lines. Before, it spoke Japanese under the English setting. The download mirror is a copy of the Chinese client, which doesn't have those dubs yet, so a new tool (`tools/local-extract/voice.py`, docs/ASSETS.md) reads them from a local EN client: 28 lines, 0.9 MB.
- The English game texts are rebuilt from the official EN data of 2026-11-05 (data 52.4.0, was 51.10.0), for the current season and the three older ones. Players see the official names: the band effect Knot's Secret (was Phylactery Secret), Mon3tr's outfit Sharpened Claws (was Sharpened Blades), and Kal'tsit Esperanta (was "Kal'tsit - Esperanta"), with her official Esperanto skill names. Viy's, Closure's and Kal'tsit Esperanta's skills, talents and modules in the Custom Squad now use the official wording, and six Alliance module texts plus one enemy description have small official fixes.
- Eleven other voice sets still have no English or Korean dub to take: Sakiko Togawa's collab voice is Japanese only, and the rest aren't in the EN client yet. They keep falling back as before.

### Browsers no longer offer to translate the English site

- The page was still marked as Chinese (`<html lang="zh-CN">`) until the game had loaded, and the portrait "rotate your device" screen and the no-JavaScript notice were Chinese text, so Chrome and other browsers offered to translate a site that already shows English. The page is now marked as English from the first byte; a player who picked 中文 (or opened a `?lang=` link) has their language set before the game loads. The rotate screen and the loading-failure messages follow the chosen language.

### No image menu on a long press in the Operator Loadout

- Holding a finger on an operator's card, the details drawer, the outfit pictures or a Custom Squad picker card no longer opens the phone browser's image menu (Open image in new tab, Download image). A mouse right-click and text fields keep their menus, and the deck still scrolls by dragging.

### Official effects that only skill templates name now play in battle

- The extractor links the effects that a skill's action templates create (buffs named by key, buffs inside serialized action graphs, and the templates those create) to their skills and talents. A new `--fx-relink` run adds those links to the shared effect index without changing any earlier record. 87 of the 175 template-only effects now have a place in a skill or talent plan, including the S2 and S3 buffs of Тоска (`char_4244_tocka`), the S3 control buffs of Kal'tsit Esperanta and the S2 shield ends of Mechanist (`char_4230_mcnist`).
- 26 official projectile shots that were extracted but never shown are now bound to the battle events that stand for them: Clementia's (`char_4231_clemnt`) S2 cabin and vortex, Mechanist's S3 token throws (by direction and facing), Mon3tr's S2 second chain from her rebuilt body, Kal'tsit Esperanta's S2 follow-up splash, Территория's (`char_4246_dminon`) death and withdraw tile hits, and the hits of Mantra S3, Archetto S1, Civilight Eterna's talent motes, Lee S2, Qiubai S1, Ch'en the Dawnstreak S3, Fiammetta S2, Wang S3 and Тоска S2. Six battle events carry one more field the client needs (who fired, or which side was hit); the battle itself is unchanged.
- Talulah (`char_4247_oxi`): her S2 buff now stays for its official 10 s instead of vanishing with the instant cast, her guard's strike back shows its official hit, and her talent footprints show the official fire field instead of a plain circle. Her S1 strike, S2 cast, S2 strike back and footprints now play their official sounds (5 new sound files).

### Operator Loadout voice lines once per visit

- Opening an operator's card on the Operator Loadout, or picking one in the Custom Squad picker, plays a Selecting Operator line only on the first touch; a skill or module change counts as that first touch too. Further clicks on the same operator (its skill, module, a reopen) stay silent until you touch another operator. Each return then takes that operator's other line, never the one it said last. Switching to an outfit with its own voice always speaks, in that voice: a Selecting or Deployment line (or any line it has). Any other outfit change counts as an ordinary click. The newest line cuts the previous one off, and the voice language and volume settings apply. No new downloads.

### Larger profile icon button in the lobby

- The profile chip in the lobby's top bar (your icon, which opens the icon picker) is now as tall as the version chip beside it, and its edit pen is easier to see: 17 px on a 1920×1080 screen (was 13 px). On a phone the whole button grows from 18×16 px to 41×40 px, over the 32 px touch minimum, with a 16 px pen (was 10 px).
- In English at Large and Extra Large text on a 640–667 px phone, the top bar had no room for it (the chip already covered part of the Discord button). There, Back shows only its arrow and the online count drops the word "online"; their tooltips still name them. Other languages and text sizes are unchanged.
- The lobby layout test now also checks that the profile chip stays clear of the top-bar buttons and meets the touch minimum.

### Returning players load the game's code from their own browser

- Behind the zero-downtime generations (a hosted server), every script and style of a version was sent as "ask again every time", so a returning player's browser asked the server about each of the game's 250-odd code files on every visit, one chain step after another, which costs a distant player about 0.2 s per step even when a CDN holds the file. A version's code can never change under its address (each version is one commit, and every update gets a new address), so these files are now kept for a year by the browser and by a CDN. Measured on a local copy of the live setup, a second visit asked the server for 25 files instead of 272, and none of the 252 code files. The page itself, the service worker, the health check and the game data still ask every time, and a server started without versions (`npm start`) keeps asking for everything, so an edited file still shows on reload. A CDN cache rule for scripts is no longer needed.

### Ping shows the connection, not the frame rate

- The ping shown in the title screen, lobby, room and battle bar no longer grows when the game draws slowly. The browser handles the server's answer between frames, so on a slow battle render the shown ping included up to a whole frame: on a local server (real round trip about 1 ms) it read 31 ms at 33 fps, 101 ms at 10 fps and 251 ms at 4 fps. It is now worked out from the server's own receive time, which frames don't delay, and reads 1–3 ms at every one of those frame rates. A slower connection still shows. A page that is already slow when its first answer comes back still shows the old measured value until it has one quick answer to compare against.

### Operator Loadout cards on short phones

- On a phone in landscape (520 px tall or less, such as 640×360 or 844×390), the Operator Loadout deck is one row of cards instead of two, each card using the deck's full height. The cards keep their whole design there: every module as its own button under the skills, the promotion icons over the levels, the potential star, the branch icon and the alliance icons. Before, two rows squeezed the cards: the branch icon shrank to nothing at Extra Large and the alliance icons were cut off at the card's bottom. A Custom Squad slot keeps its full-size frame, count and label. Compact, Expanded and Outfits all use the one row, and so does the Custom Squad picker. Fewer cards fit on screen at once (4 at 640×360, 5 at 844×390); swipe to see more. Taller windows and desktops look the same as before.
- Operator names on the loadout cards never break inside a word any more ("Matterhor/n", "Lightning/bearer" were split at Extra Large on a phone). A name wraps only at its spaces, never at a hyphen or dot, in at most two lines, and a name that is still too long gets a slightly smaller font until it fits the card, the way the official client fits text. Checked with the longest English, Chinese and Japanese names (such as Skadi the Corrupting Heart, Greyy the Lightningbearer, 泰拉大陆调查团, ヴィーナ・ヴィクトリア) on phones and desktops, at Medium and Extra Large. The Custom Squad picker's cards follow the same rule.
- On those phones the bottom bar's Own All button (now just its icon) and the Compact / Expanded / Outfits switch are drawn smaller and stay that size at any text size, so all six tier buttons fit beside them. At 640×360 Extra Large two tiers used to be cut off.

### Bot turns are cheaper to work out

- The bots' layout search no longer copies lists it only looks through: board tile names are read without temporary lists, the "do I already own this operator?" checks stop at the first match instead of listing and sorting every piece, and each move the search tries no longer copies the whole plan. The bots make exactly the same choices (same boards, hands and shops in 40 checked rounds), and a late-round bot turn takes about 20% less time (the busiest bot of the test match: 281 → about 220 ms on the same loaded machine; the whole 10-round match 2.5-3.0 → 2.0-2.2 s).

### Chat button on small touch screens without the client art

- When the game runs without the local client art (for example a lite install), the Chat button falls back to a plain text button. On a 640×360 phone that button was only 22 px tall, squeezed between the settings gear just above and the screen edge, so its tap area was 31 px, below the 34 px minimum. On touch screens the text button is now as tall as the art button (35 px), so the corner keeps the same layout with or without the art. The art button is unchanged.

### Bot helper review fixes

- A host's page could claim "my bot helper is still starting" on every bot turn and hold each bot for up to 40 s. The server now allows that start time only until the helper has been up once on the connection, and again after a reconnect.
- Once every player is Ready, a bot whose helper is still starting gets 10 s instead of 30 s, and the page stops waiting for the screen to finish loading.
- A warm-up left over from a match that just ended no longer starts a helper in the next match.
- With bot rehearsals in the host's browser, a host that reconnects or reloads gets its helper warmed again, and a helper stopped by a cancel is replaced by a warm one. Rooms whose bots already play in the host's browser no longer keep an idle rehearsal helper.

### Bot rehearsals in the host's browser answer from round 1

- With the optional host rehearsal setting on, the host's browser now starts its rehearsal helper during the briefing, once the screen has loaded, instead of on round 1's first task. Round 1's AI layouts used to miss their short answer window while the helper started, so the server always worked them out itself. Nothing changes with the setting off (the default).

### Crowded battles use their light-weight models from the start

- The outlines of every model's animations, which size the light-weight copies that keep big fights fast, are now measured once on the server after the art is downloaded or extracted (`npm run clip-bounds`, run by `npm run assets` and `npm run assets:release-local`) and sent with the game as one small file (about 94-98 KB compressed). Browsers no longer spend the first seconds of a crowded battle measuring them while drawing every unit in full. In the 120-unit stress scene no unit waits for its outline any more (before: up to 14 did) and the browser spends no time measuring them (before: 2.4-2.7 s in the first 20 s). The outlines are the browser's own measurement, rounded slightly outward, so no model is cut off; a model the file does not cover (plugins, DIY, art added later) is still measured in the browser as before. The time spent measuring a model the file does not cover no longer counts as a slow device (which used to lower the animation rate) and no longer enlarges its own budget. A server without the file answers with an empty table instead of an error. Server owners: run `npm run clip-bounds` after a local-client extraction (docs/DEPLOY.en.md).

### Confirm Match Info and Equipment Supply on short landscape phones

- On phones held sideways (360–390 px tall, e.g. 640×360 and 844×390), Confirm Match Info is now drawn at a phone's scale. The step header, section bars, enemy leader card, core and addon bond rows, banned operators, footer and Ready button are all a size smaller, with tighter spacing, so more of the briefing fits without scrolling. The section bars drop their small English captions there.
- The Equipment Supply header (title, description, turn line and countdown) is a size smaller on the same phones.
- Larger text sizes (Large, Extra Large) still grow a little, by the same capped steps the draft screen uses. Desktop and taller windows are unchanged.

### Spectate, filter popover, Final Assault watch, protocol list

- Pressing Spectate right after entering the lobby could fail with "too many requests", because entering the lobby spends the server's budget for heavy messages (loadout, ownership, outfits and more). Spectate now tries again after 1.2 s, at most twice. Proposing a version already did this.
- In Operator Loadout, answering the floating version vote no longer closes an open Filter popover. The vote gives the focus back to the popover's search field when it closes.
- An eliminated player watching the Final Assault now gets the ‹ › buttons to switch between the two halves again. The board they followed during prep no longer holds the screen once the battle starts.
- The Select Protocol list fits itself one frame after its size changes, instead of in the same frame. This stops "ResizeObserver loop" errors at some language and text-size combinations. It looks the same.

### Bot helper loads after the band draft's art

- With bots run in the host's browser, the page started the bots' background worker (424 small script files) right as the briefing opened, so it shared a slow connection with the briefing and the band draft's art. On 10 Mbps the band icons came about 4 s later, and on 5 Mbps the first AI pick ran out of time and fell back to a rule pick. The worker now starts once that art has loaded (10 s at most). The server also gives the first AI pick its 10 s from the moment the worker is ready rather than from when the task arrived, with a 30 s limit on the start, so a slow connection no longer counts against the player and a worker that never starts still falls back to the rule pick.

### Crowded battles switch to light-weight models within seconds

- In a big fight (many units arriving at once: a battle's start, Joint Defense, a boss) each unit is drawn in full until the game has measured the outline of every animation its model plays; only then can it use the light-weight copy that keeps crowds fast. On a busy battle that measuring took 50 seconds to over two minutes, so the whole fight could run at 10-20 fps. The game now gives the measuring a larger share of a slow frame (a third of it, at most 33 ms; quick frames are unchanged) and measures first the models the most waiting units share. In the 120-unit stress scene the measuring now finishes in 14-20 s instead of 48-57 s. The measured outlines are exactly the same as before (checked on all 721 models and 6,678 animations), so no model is cut off or drawn larger.

### Room privacy bar follows the text size

- The Public / Private bar in the room and its password box now grow with the Text Size setting like the rest of the room. On phones they used a fixed size. Desktop sizes are unchanged; on a phone they stay the same at Medium and are 2 px smaller at Small.

### Match briefing and Equipment Supply headers on small phones

- On phones (screens up to 520 px tall), the Confirm Match Info list now ends above the footer instead of running under it, so no enemy or alliance text shows through behind Reroll, Operator Loadout or Ready, the way the original reroll banner kept it before the reroll moved into the footer. At the Large and Extra Large text sizes, the Reroll button shows only its icon in English, Japanese and Korean (its name stays in the tooltip), so it no longer runs under Operator Loadout. "已就绪" no longer breaks across two lines. Taller windows and desktops are unchanged.
- In the strategy draft overlay (Equipment Supply and the other draft screens), the description now sits under the title on phones narrower than 768 px at every text size, as it already did at Large and Extra Large. At Medium on a 640 px phone, "Obtain equipment without spending any funds." took one word per line beside the title and ran into "Your turn to decide".

### Operator Loadout fits every UI size and text size

- At the Extra Large text size on a 640×360 phone, each card's level pill ended 4 px below the card. The branch icon above it now shrinks to make room when the rail is too short; every other size looks as before.
- The card view's own spacing (the Owned button, the Export / Import parts list, the card's meta and alliance column, the Custom Squad card) now follows the UI size setting like the rest of the interface. The top-bar tray keeps the 32 px touch minimum every other control uses (it had 36 px, which only showed at UI sizes 75–80 % on small screens).
- The Export / Import dialog highlights a ticked part without the CSS `:has()` selector, so it also works on Firefox ESR 115 and Safari before 15.4. It looks the same.
- Tests brought up to date with the card view: the bottom switch has three buttons (Compact / Expanded / Outfits), the drawer lies over the deck without moving it, module tiles accept the downloaded type icons when the local game art is missing, and a leftover list-view helper is gone from the loadout rows test.

### Small fixes

- UI plugins can't send the Grand Alliance room browser's `rooms.watch` request any more. The plugin bridge refuses every message the game itself sends to the server, but its list didn't include the new `rooms.*` messages.
- The battle view now removes its WebGL context-loss listeners when it closes. The afterimage fix of 2026-10-15 added them, but only setup's own cleanup removed them, so every battle view that started successfully left two listeners on its canvas.

### Update news

- The Update 0.3.4 banner in the lobby adds "New Operator Loadout" to its highlight lines. Its points now start with "Profile Icon added" and include "Fixed Viviana VFX". The damage meter and four new Modules lines are gone from the banner and from the en, ja, ko and zh-TW packs. The dismiss key stays `news.0.3.4`: the live server still shows 0.3.0's banner, so no player has closed this one yet.

### Effects no longer stall on their first frame

- The first time an effect drew, the browser stopped for every new shader it needed until the graphics driver had compiled it: 10–60 ms per shader on Windows (ANGLE on Direct3D 11). Civilight Eterna's Condolence trails drew a 115 ms and a 108 ms frame when they first appeared (259–387 ms when they were the first effect of the page), and a battle opened with 10–16 frames of 12–57 ms while the warm-up compiled one shader per frame. Shaders now compile in the background where the browser offers parallel shader compiling (measured in Chrome): the trails' first frames take 4–22 ms, a battle's opening frames stay under 24 ms, and the warm-up starts every shader of the battle at once. Until a shader is ready, the parts of the effect that use it wait, as they already did for a texture still loading; that's only ever 2–3 frames, and only the first time an effect plays before the warm-up has reached it. Browsers without parallel compiling build shaders as before.
- Small tidy-up: the particle system's "is it full" check no longer sits between the spawn function and its description.

### Every effect follows the game engine's particle rules

- The two particle rules read from the game's own engine for Viviana's S2 staircase now apply to every operator's effects. Mesh particles place their pivot as the engine does: scaled by the particle's size and turned with it. Looping effects that start already running are filled to their longest particle lifetime, not just one loop. For example, Phantom's Focus attack now shows the red swipes seen in the official game, Lappland the Decadenza's deploy pillars rise on her own tile instead of the enemy's, and Nymph's S2 dots stay at her feet. Viviana's special case is gone.
- Lifetimes far longer than a loop (Exusiai the New Covenant's 999-second halo) stop prewarming once the effect has had time to fill: at least 30 seconds, never more than 120.
- Civilight Eterna's Condolence effects no longer freeze the game for 1.3–6 seconds when they appear, or drop frames to 150 ms while they last. Their flower particles ask to emit 10,000,000 per second with room for one, and the emitter tried every one of them each frame. A full particle system now stops trying, which leaves the particles exactly as before. Those spawns now take 1–6 ms.

## 2026-11-08

### Units draw in the official order

- Units now draw in the order the official game uses: farthest first by the depth of each model's flat plane along the camera's view (the client's battle camera sorts see-through renderers orthographically, and no battle code sets a sorting order). Every model faces the camera head-on, so its height, size and leaps don't change the order. An operator's model sits 0.100 in front of her feet and most enemies' 0.152, read from each unit's official skin. So an enemy in an operator's row now draws over her, as in the official close-ups of Viviana's normal attack (the robot covers her reindeer's antlers). Raised blocks still hide the units behind them (`units.js` `skinPlaneDepth`, `PLANE_DEPTH`).
- This replaces the earlier same-day rule that put operators over every enemy in their row. In the official footage of Viviana's S2, she turns see-through and vanishes into the dash, and the slash effects (which have their own sorting order) cover the enemies; her body is never lifted over them.
- The `vfx-talents` "group choice (select)" test asked for successive picks with one attack count; it now uses one count per attack, as the attack clip picks have since the clip change earlier today.

### Grand Alliance: Public and Private

- The lock is now called Private. Beside the alliance key, the host has a Public | Private switch that applies at once: Private gives the room a random 4-letter password, shown next to the switch; the host changes it by typing into it there. Everyone else sees whether the room is Public or Private. The room browser's filters and badges say Public and Private, and joining a Private room asks for its password as before.
- Create Grand Alliance first opens the protocol screen: pick the difficulty and Public or Private (with the password) before the room exists, instead of creating a room and changing it afterwards (`room.create { capacity: 8, password }`).
- A Grand Alliance's Find Teammates switch is remembered apart from a normal room's and starts on.
- Solo Matchmaking's card now reads "Join automatically when a room is found.", and its protocol screen no longer shows the "starts as soon as 4 Doctors are found" line.

### Matchmaking: game versions and Grand Alliances

- Matchmaking now matches by game version. Rooms of any game version can use Find Teammates, and they only merge with rooms of the same version and difficulty. Before, rooms of different versions could merge, and a host who switched version while searching could pull strangers into another version.
- Solo Matchmaking shows on every lobby version. Its protocol screen has a tick for each game version the server offers (the lobby's ticked by default), so a Doctor can queue for several. A new room plays the first version, in the official order, that 4 of them share.
- A matchmade room of another version now waits until every player's page has loaded that version's data before it starts. Before, an automatic start skipped that check. A page that can't load it, or is still not ready after 60 s, leaves the room, and the room searches on.
- Grand Alliances, locked ones included, get the Find Teammates switch. They're filled only by Doctors who tick "Also join Grand Alliances" in Solo Matchmaking and by other searching Grand Alliances whose squads fit whole into one of theirs; a 4-player room never merges in. Matchmade Doctors skip the password. A Grand Alliance that has searched 10 s also takes opted-in Doctors who waited 10 s, who then wait in its room until it fills. It starts by itself at 8. No AI seats are added.
- Across regions, all of this works as before: own server first, the other after 15 s (`SP_CROSS_AFTER_MS`). Only game versions both servers enable are matched across, and a moved Grand Alliance player arrives in the squad the server held for them.
- Test rooms no longer search (they're joined by key only).

### UI Size

- The profile icon picker's grid in landscape on a phone, the match chat's Text bar and the space for its letter counter now shrink with the UI Size setting, like the rest of the interface. They had fixed pixel minimums, which failed the `ui-size` guard. The Text bar keeps a 32 px minimum, as touch targets do. The chat bubble only has a minimum font size, and font sizes never scale.

### Update news

- The lobby banner now announces Update 0.3.4. Four lines in the highlight style name Toska, Territoriya and Talulah, match chat, Grand Alliance (up to 8 Doctors in two squads) and a second server region. The points below cover SilverAsh the Reignfrost's S3 effects and the attack clips, full skill clips for skills that replace an attack, 7 new outfits, skill cast sounds, the damage meter's modes, four new Modules and smarter bots. It has a new dismiss key, `news.0.3.4`, so it shows again for players who closed 0.3.0's, and the 0.3.0 lines are gone from the en, ja, ko and zh-TW packs.
- The lobby's Combat Tips box is always as tall as its longest tip, so a rotating tip no longer moves the update banner above it up and down. Its count and arrows stay on the title's row: the small TACTICAL TIPS label hides itself when it doesn't fit, instead of pushing them onto an empty row of their own.

### Profile icons

- Doctors can pick a profile icon from a new profile chip in the lobby's top bar or from the icon on their own seat card in a room. The picker has two tabs. Operators lists every operator a seat card can show, with search and rarity tabs, worn in the player's outfit; its first tile, Assistant Operator, follows the room card's operator. Icons holds the game's 200 official profile icons, grouped as the game groups them (Dynamic Icon, Unique unlock, Event Icon, Default Icon). The pick is saved in the browser (`sp.pref.profile.avatar`) and comes back on the next visit, like the room's portrait operator (`sp.pref.room.card`, already saved).
- Everyone sees the icon on the room's seat cards, the team panel, the strategy draft and the results. It travels in `hello.avatar`, and the server keeps only an id of `data/avatars.json`. A player without one (or on an older client) shows the official default icon. An operator icon is checked against the room's seat-card operators, like the room card. AI teammates now show their operator's avatar everywhere (the strategy screen, the team panel, the results), as their room seat card already did, instead of the robot icon. The band icon becomes a corner badge on a player's icon once a band is picked.
- The icon names are the official English ones. Eight icons the English data doesn't have yet use the English server's names from the wiki. 31 CN-only icons use our own translations, marked "Unofficial translation" in the picker.
- New: `tools/build-avatars.mjs` (writes `data/avatars.json`) and `tools/i18n/fallback-avatars-en.json`. `tools/build-i18n.mjs` now reads the icon table, and the data texts of every language were rebuilt. The art is extracted from the CN client as WebP (1.8 MB, local art group `avatar`, `extract.py --only avatar`), so a server needs that folder and an updated `data/local-assets.json`, and the preload zip picks it up. Without the art the chip shows the name's first letter and the picker stays closed.
- The match screen now waits for the icon data (`avatars` joins `GAME_FILES` in `ui/gameComponents.js`), and it's downloaded with the other match data as soon as you're in a room. Icons on the team panel, the draft and the results no longer appear late. Older-season rooms use the same file, since icons aren't season content.

### Grand Alliance: 8-player rooms

- New Grand Alliance: a co-op room with 8 seats, for humans only. It's off unless the server sets `SP_LARGE_ROOMS=1`.
  The lobby then has a Grand Alliance mode, and Team Simulation a Grand Alliance card; both open a full-screen room browser of the open rooms, with Open and
  Locked filters, and a button that creates one. Matchmaking never fills them, and they take no AI teammates.
- The host can lock the room with a 4-letter password from the lock button beside the alliance key. Only the host sees
  that button and the password. Locked rooms still show in the browser with a lock, and joining from the browser, by key
  or by invite link asks for the password. Wrong guesses are limited to 6 a minute.
- Seats 1–4 are squad A and 5–8 squad B. Players pick their seat or move to an empty one, and the host can swap two seats;
  nobody balances them. Everyone in one squad plays the normal rules.
- With players in both squads: each squad drafts strategies and 机变 cards on its own, both at once, with its own 6 cards.
  The whole room fights over one operator and equipment pool, which grows with the room (×2 at 8). Defence relays across
  the room: what still gets through goes to the next 2 perfect players, for at most 2 rounds. Everyone fights one shared
  Enemy Leader in random pairs, as before. The Hidden Core threshold and the leader fight's overtime drain scale with the
  room too.
- A dropped player's board goes to the AI at once and back when they return, and a player who leaves keeps their board in
  the match under the AI. That AI always runs in a browser, a squadmate's first, never on the server. A player idle for
  3 prep rounds in a row is removed, with a warning after the 2nd.
- An old server version that is still running an 8-player match now keeps running for 105 minutes after a deploy instead
  of 60, so a long match isn't cut off. Every other old version still stops after 60.
- Design: DESIGN §91 (`docs/design/large-rooms.md`). Squad, draft and relay ideas follow the GPL-3.0 forks
  [LongQianChen/Stronghold-Protocol](https://github.com/LongQianChen/Stronghold-Protocol) and
  [zhewang448/Stronghold-Protocol](https://github.com/zhewang448/Stronghold-Protocol), adapted to this code.

### Operator Loadout cards

- Operator Loadout is cards only: the list view is gone, along with its Custom Squad tab and slot overview.
- Every card has its skills (S1–S3, only the ones the operator has) at the top of a column on its right and its modules at the bottom, "No Module" first. On a PC or tablet every module is its own button, like the skills. On a short screen (a phone in landscape) one module button steps to the next module, with small dots showing how many there are. A tap changes only that choice: it doesn't open the operator's details or select the card.
- A long operator name wraps onto a second line instead of being cut off with "…".
- The name sits at the bottom of the card, a size bigger, and the Alliance icons stand down the left edge. Potential is a third row of the level badge: the mode's pentagram, its strokes lit in the game's order (earlier ranks white, the current rank in the elite icon's yellow, all five yellow at Potential 6), instead of six diamonds.
- A Custom Squad operator is a card like any other: levels, potential and Alliances on the left, its skill and module buttons on the right, Owned or Prototype beside "Tier 6 Custom" above its name, and Expanded's panel. Tapping it opens the same details as any operator, and its choices save straight to the slot; the swap icon under its Alliances opens the picker to choose another operator.
- The portrait is the whole card's background, shaded at the left, the right and the bottom so the tier and levels, the skill and module buttons and the name stay readable, with no frame and no pale grey card behind it: behind the operator is near-black with a faint glow at the head, so dark hair still stands out. The class branch icon moved from the portrait to the rail, under the tier.
- In Expanded, the modules are a list, one full-width row each like the skills, with Default beside the name.
- A Compact / Expanded switch at the right of the bottom bar, both choices always in view, slides out each card's skill descriptions and every module, with its bonuses, beside the card. Nothing reloads: the panels are already there, folded away. The selected card stays where it is on screen while they slide, or the card nearest the middle of the screen when the selected one is off screen.
- Expanded's panels show each skill whole (icon, name, badges, SP tags and description) and only the chosen module's stat bonus and trait lines, in full. The chosen skill shows Equipped beside its name instead of Default, and its Initial, Cost and Duration share one line: the panel is a little wider for it. The module's title and talents are in the operator's details, one tap away. A long module name wraps instead of being cut off with "…".
- Folding back to Compact fades each panel out as it slides back, instead of showing it under the card. The scrollbar no longer jumps around while the panels open.
- The details drawer lies over the left of the cards and no longer moves or scrolls them when it opens or closes (picking a card and closing its details used to leave the cards shifted by up to a card width).
- Scrolling the cards is much smoother, in Expanded as in Compact: the deck now scrolls on the GPU, and starting or ending a drag no longer stalls the page (up to half a second in Expanded on a large screen before). Letting go of a mouse drag glides on and slows down like scrolling on a phone. A drag can start anywhere on a card, its Expanded panel included.
- A click on the cards while they are still moving (a glide, the mouse wheel, a jump to a tier) only stops them, as on a phone: no card or skill is picked until the deck is still.
- Picking an operator's card plays its selection voice line, as tapping it in a match does.
- Expanded answers much faster: only the cards on screen and just beside it open at once, and the rest follow in the background while the page is idle. From the press to the first frame it now takes 0.2–0.55 s on a slow (phone-like) CPU instead of 1–1.8 s, and 40–100 ms on a PC.
- The top bar's right is one tray in the look of the Compact / Expanded / Outfits switch: Export and Import (one above the other), Search (which also filters by class and Alliance) and a small Reset (it asks first). Operator Roster's page has the same tray (Export, Import, Own All), and the Custom Squad picker's Search sits in one too. The ⋯ menu and Clear Custom Squad are gone (a slot's picker clears its own slot). "Synced" now reads "Saved". Operator Roster moved to the bottom bar, left of the switch.
- Outfits is the third choice of the Compact / Expanded switch (a shirt icon), in Operator Loadout and in the Custom Squad picker: each card's skill and module buttons become its outfits, as portrait icons; tap one to wear it. Going from Expanded to Outfits folds the panels first and then shows the outfits (before, the cards flew a screen across and snapped back). Leaving Outfits no longer freezes the page for a quarter of a second: the cards on screen switch at once and the rest follow while the page is idle.
- Module icons are drawn at one scale, as in the game: a narrow icon (Virtuosa's X) no longer looks thin beside a wide one, and every operator's pair matches. In the details drawer the Default tag sits small on the icon's top edge, so a long module name such as "The Decrescendo" keeps whole words on a line (the Expanded panel has it small beside the module type, RIT-X).
- With an operator's details open, a press on the deck's empty space, on another card's skill or module button (the choice still applies), a drag of the deck or opening Search closes them (a search's results start at the left, under the drawer); another operator's portrait opens that operator's details at once.
- A click right after a search (or after the details drawer opens) picks the card again; only a deck that is really still moving (a glide, the wheel, a jump) ignores a click.
- Export lets you tick what to include (Loadout, Operator Roster, Custom Squad, Outfits): one item gives that page's own file, several give one file with all of them. Import reads any of those files, older versions included, shows what it found, and imports the items you keep ticked.
- Quick Setup is gone. Potential and Development are set in the operator's details.
- The card view's ⓘ guide is gone.
- The Custom Squad's four slots are cards at the end of tier V and VI, showing the pick or "Choose an Operator". Tapping one opens the picker as its own page, and Back (top left), Confirm or Clear brings you back to the cards exactly where you were. Custom Squad export and import are part of the top bar's Export / Import.
- The picker is the loadout's card page for custom operators: the same cards, grouped by class with a marker for each class, and a bottom bar that jumps to a class. Drag with the mouse to scroll. Its Filter has the loadout's search, class and alliance filters, and the Compact / Expanded switch sits in its bottom bar too. Tapping an operator picks it and opens its details in the drawer on the left, with Collapse; Esc folds the drawer, then closes the picker. Prototypes show their fixed skill and module, and an operator already in another slot is dimmed and says where.
- The picker's drawer is Operator Loadout's own detail: the Loadout / Outfits switch (Outfits has the full outfit panel), the voice language picker, Appearance, Potential and Development, skills, battle stats and modules.
- In an operator's details, the English "Development" label no longer runs into its buttons: Potential and Development share a label column as wide as the longer word, and on a short screen each label sits above its buttons.
- Scrolling the cards is smooth again: the lobby's radar no longer animates behind the loadout, and folded Details panels stay out of the page's layout until Details is on.
- Opening the cards and tapping a skill is faster: cards off screen are skipped until they scroll into view.
- Under the hood, both screens draw the same card, deck, bottom bar, drawer and detail (`public/js/screens/loadoutDeck.js`) instead of keeping two copies.

### S.W.E.E.P. Report

- An operator in an alliance's Operators list now opens Operator Loadout at that operator, selected and scrolled into view, with its detail open. A filter that would hide it is cleared. Back (or Esc) there returns to the report as it was left: same tab, alliance, scroll position, and focus on that operator. Opened the usual way, Back works as before. The report and the loadout always show the same season version, so every operator listed has a row.

### Viviana's skills

- S3 now looks like the official game in every outfit. Her first cast of a battle plays the "A" clip set (Idle and a 2-hit attack) with its own effects and aura; every later cast plays the "B" set with the 3-hit attack and its two auras. Later casts start with the B Begin clip and no cast plays an End clip, as the official skill data has it. Before, none of S3's effects played and only one of its clips did.
- S1: a plain cast is her normal attack swing with the 2-hit effects. It no longer flashes the charged-stance clips and aura for a moment. With both charges stored she takes the charged stance (its idle and aura), and the cast that spends them swings `Skill_1_Attack` with the 3-hit effects.
- S2 shows the second hit's effect whenever the battle rolls her double hit, instead of guessing single or double on its own.
- Votive Offering's S2 staircase of glowing planks now spirals right beside her, rising on her left and fading as it turns behind her, as in the official game. It had been drawn as a ring over five tiles wide, spinning across the board the other way. It now follows the game engine's own rules, read from the client's `UnityPlayer.dll`: the mesh pivot runs along each step's length and scales with its size, rotation is not mirrored, and prewarm fills the whole staircase before S2 starts. Its mountain is drawn at its node's scale on each axis, as the engine does for a locally aligned billboard. Hand-fitted values replaced.
- Her talent shield (the melee-blocking layer she gets from hitting elites and leaders) now shows its official effect, in each outfit's own version, while she has a layer. Before, nothing official ever played for it: the battle keeps that shield in the talent's own data, which the client never saw.
- Outfit effect swaps are kept per outfit. Operators can share an outfit tag, so Horn's The First Gleam and Bagpipe's Echo of Bagpipes played Viviana's deploy effect, and every `epoque#40` wearer swapped a heal hit and a burning effect for other operators' versions. The fx index gained a `skinPairs` map (`tools/local-extract/fx.py`); older clients still read `skinFx`.

### Trait text

- Blemishine's and Degenbrecher's deploy traits (`garrison_106_a/b`, `garrison_155_a/b`) now read "On deployment … (up to N stacks per battle)", as the Chinese and the game code have it. The official English added an "on skill activation" trigger that doesn't exist and gave the cap as "Can stack up to Nx". The fix is in `tools/i18n/corrections-en.json`.
- 23 more traits gave their cap as "Can stack up to Nx", which reads like a number of triggers. They now say what the Chinese and the code cap: "up to N stacks per battle" ("per round" for Aroma and Angelina, "each" where two alliances each have their own cap). Executor's bullet trait now reads "up to 7 times per battle", and its Foresight part adds stacks, not "Alliances". The traits belong to Executor the Ex Foedere, Warfarin, Kroos the Keen Glint, Virtuosa, Surtr, Fartooth, Aroma, Titi and Angelina, plus the traits Warfarin, Kroos and Fartooth hand out.
- Season 1 and Season 2 part 1 rooms get the same trait fixes. Their English texts (`data/versions/<slug>/i18n/en.json`) were rebuilt, and 7 Season 1 traits with Season 1's own caps (10 / 20 stacks) got their own corrections. The rebuild also brings in what the older-season texts were missing since the last build: 7 outfit names, the Rampage, Arcane Surge and Trigger effect keywords, and Rampage in the Elemental Injury list.
- The traits Warfarin and Kroos the Keen Glint hand out at Elite (`garrison_95_b`, `garrison_96_b`) now state their per-battle cap, which the game code has always applied but neither the Chinese nor the English text gave. Each season shows its own number: Warfarin's is 14 stacks now, 24 in Season 2 part 1 and 20 in Season 1; Kroos's is 20 in every season. Older seasons read their numbers from their own `tools/i18n/corrections-en.<slug>.json`, which `tools/build-i18n.mjs` now tries before the shared corrections.

### Room screen

- The AI teammates' avatars in the room now come from the small URL helpers (`ui/assetUrls.js`) instead of `assets.js`, so a vanilla page no longer loads the asset store at start, as `test/ui/plugins-client.test.js` requires. `test/ui/playtest6-unite.test.js` now expects the team panel's leak tag to name a teammate through `shownName()`, which is how AI teammates show their operator's name.
- `test/ui/text-scale.test.js` now lists the match chat's bubble (`.cbubble`) as in-match HUD text that the Text Size setting leaves alone, like the emote bubble and the chat panel it sits with.

### Several servers, one game

- The game can now run on more than one server, so players connect to the nearest one with better ping. It's off unless the operator sets `SP_REGIONS`, and a single server behaves as before (`docs/DEPLOY.en.md` §2.7).
- The website stays on the main domain, so players keep their stats, settings, loadouts and art cache, and only the game connection goes to the other server. That server needs no art, so origin traffic doesn't double.
- The first letter of an alliance key names its server, so keys and invite links work from anywhere, even while the servers can't reach each other.
- Matchmaking looks at the player's own server first, then after 15 seconds across servers. It only moves a group into a match that starts at once, on the server with the most humans.
- Browsers pick the faster server by ping, with an Auto choice or a named server in Settings, and the server's name appears beside the ping. A page that loses another server falls back to the main one.
- The server choice moved from Settings to the lobby: tap the server name and ping at the top left to pick Auto or a server, each with its live ping and the one you're on marked. As before, a change waits until you leave your alliance or queue, and a match never moves.
- The online count's tooltip lists each server's players (hover, focus or tap the count), with yours marked; the count itself stays the total of every linked server.
- The online count now updates at most once a minute for players already connected (a new player still gets it at once), instead of whenever it changed, checked every 2 seconds.
- The online count covers every server. `scripts/deploy-regions.mjs` deploys one build to every server in two steps, so nobody is sent to a build that isn't ready, and old generations stay up while a match on the other server still needs them.

## 2026-11-07

### Match chat

- Text chat in a match, deliberately cruel: last round's kills are the letters you can type until the next round's result. Round 1 and zero kills leave you with emotes. The server enforces it all and chops anything over the limit; a faked kill count buys no more than the enemies it sent. Lines show as avatar bubbles and are never stored or replayed, and spectators can read but not write. Each line costs about 143 B per recipient, around 1% of a match's traffic in normal use. Mute is per page; `SP_CHAT=0` turns chat off.

### First-visit loading

- The entry film now plays with its sound on a first visit, however slow the connection. What the opening needs (film art, entry cue, lobby music) downloads first, from page load and at high priority, behind a Loading card; the card asks for the tap once they're in. A tap made while loading counts. The battle renderer's scripts and a resuming asset preload wait until those files are in. Before, the film was dropped if its art took over 1.2 s, and the sound only started downloading after the tap.
- In a room and a match, what the screen needs loads first (`public/js/loadLater.js`). The leader and downed plates, the pre-game boot art, the render engine's code ahead of the match, the battle effects index and the simulation's scripts wait until the screen's images, the board, operator models and music are in (at most 20 s), and the simulation's warm-up only starts from the prep on. On a first visit the field no longer times out into its simplified view while files compete for connections.

### Battle effects

- SilverAsh the Reignfrost's S3 now shows its official effects: the skill range around him, the bird landing when it starts, a curved bird slash leaving him toward his target with each attack, and the official hit as it reaches each enemy. The bird art was never extracted because the skill names its projectiles only as a buff template's default value; `tools/local-extract/fx.py` now follows those too. The server and the preload zip need the new art.
- SilverAsh the Reignfrost's normal attacks now play the animation that matches their effect: Attack_A, B or C with the same stab or slash, instead of always Attack_A.
- 20 more operators whose attacks pick between animations now play the one that matches their effect instead of always the first: Rosmontis, Wiš'adel (with her down-facing animations), Chongyue, Ascalon, Crownslayer, Bellone, Mountain, Vigil, Entelechia, Qiubai, Pramanix the Prerita, Vina Victoria, Tragodia, Wang, Ebenholz, Lin, Hoederer, Logos, Haruka and Aphrissa. The official sources are listed at `ATTACK_CLIPS` in `public/js/render/vfx/wiring.js`. Random attacks that never repeat also picked their wind-up and strike effects separately, so the two could differ; they are now one pick. A pick between two also repeated for about 7 attacks on average, now about 2; that fix (`seedOf`) changes the random effect picks of every operator, not only these 20.
- A skill that replaces the next attack (Vina Victoria's S1 and 25 more) now plays its whole animation once in place of that attack: once its SP is full the clip starts from the first frame a full wind-up before the predicted strike (the end of its attack cooldown, or when an enemy it can hit reaches its range, first attack of a fight included), with its cast effects, so the leap plays out and the blow lands on the hit; a strike that comes later than predicted is waited for just before the blow. Before, only the clip's last part showed, sometimes looped into a second swing, and from the second cast on the previous attack's clip often replaced it.
- Talulah's S3 now plays its official sounds: the cast, each volley's launch, each fireball's impact and the overload.
- Talulah's S3 now shows its official fireballs flying down every lane and exploding on the enemy they hit. The art was never extracted because the skill fires them from a buff template, and nothing drew them. `tools/local-extract/fx.py` now follows projectiles that an operator's buff templates fire, so local copies need `extract.py --only fx --fx-set used --fx-add-only`; until then the game keeps the procedural ring.

### Outfits

- Added the seven outfits CN released since our last outfit refresh: SilverAsh the Reignfrost's Snowfall Over Londinium, Swire the Elegant Wit's A Prosperous Visage, Blaze the Igniting Spark's Nocturnal Firelight, Shu's Everflowing Waters, Horn's The First Gleam, Viviana's Votive Offering and Catherine's Cozy Bakery. Their skill effects come along through the outfit effect twins. The server and the preload zip need the new art.

### Upstream merge

- Merged upstream's unreleased 0.3.4 work (`dev` branch) at [`eff7d93a`](https://github.com/sganggs/Stronghold-Protocol/commit/eff7d93abbd1bd6986e2e9c2d7a1e066b1975bbc) (`4d12f915`). Fork-side decisions:
  - Release notes open only from the title footer's button (no automatic opening: the lobby has its own update banner). Non-Chinese pages read `CHANGELOG.en.md`.
  - The entry film plays every time the login screen is entered. A page load that lands in the lobby plays it once per browser tab session.
  - The three-level deploy-fold setting is taken; it still defaults to off. P2P stays off (`SP_P2P` unset).
  - Toska (冻河), Territoriya (国度) and Talulah (塔露拉) get English text in `tools/i18n/fallback-new-ops-en.json`, using names and terms from arknights.wiki.gg, until official EN data covers them.
  - Not ready to deploy: upstream's new bot logic runs on the server. All bot calculation must move to the host's browser first.
- Merged upstream 0.3.2 at [`c9d804f4`](https://github.com/sganggs/Stronghold-Protocol/commit/c9d804f470b8d7422ae04eb66faf671cef21ad52) (`a47b3db4`), through
  [#14](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/14), thanks to @evenifyouforget. dev-0.2 had fixed the same Windows test problems itself; upstream's versions of
  those three test files are taken.
- Merged upstream 0.3.3 at [`f07b8965`](https://github.com/sganggs/Stronghold-Protocol/commit/f07b8965061bbc311ad7aa815879b09264a1e47d) (`d4958737`), through
  [#22](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/22), thanks to @evenifyouforget. The fork's matchmaking, outfits, notices, maintenance and generations are kept
  inside upstream's new lobby, room, loadout, custom-squad and briefing screens. On avatars and portraits an outfit wins
  over an upstream skin. Upstream already had the sim side of [#18](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/18) and all of [#19](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/19) (upstream PR #862), so
  those merged into the same code.
- English README: `--game` also takes the install directory, as in upstream's Chinese README.

### Contributions

- Battle view: invulnerable units wear two spinning gold ribbons, after the original game's look. Multi-tile bosses
  wear them three times as big ([#12](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/12), thanks to @evenifyouforget).
- Official effects: the airstrike from Exusiai the New Covenant's talent plays its own official strike (a shell falling
  with a smoke trail and a red-white burst). Before, it drew the procedural blast that looks like Lemuen's S3
  ([#18](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/18), thanks to @evenifyouforget).
- Official effects: Lemuen's S3 lock crosshair stays until her own shell lands, also where a defeated target stood.
  Before, it vanished about 1 s after each lock ([#19](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/19), thanks to @evenifyouforget).
- Battle view: a liftoff that only a talent grants (Kal'tsit - Esperanta, Leizi the Thunderbringer) is a low hover of
  about a quarter tile. A skill's liftoff still flies at a flying enemy's height ([#20](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/20), thanks to @evenifyouforget).
- Setup: `npm run assets:release-local` downloads a release's local art (`public/assets/local/` and
  `data/local-*.json`, about 200 MB of the full package) for an install without a game client, such as a VPS. Setup's
  hint names it ([#21](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/21), thanks to @evenifyouforget).
- GitHub: English issue and PR templates ([#17](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/17), thanks to @evenifyouforget).

### Changes

- Host-browser bots, pieces 4 and 8, off by default and not live yet: with `SP_BOT_BATTLES=host`, a field of bots runs in a human's browser instead of on the server, and falls back to the next human, then to a synthetic result. `public/js/battle/botWorker.js` and `botHost.js` run bot work in a Worker, and `/match/` now serves exactly the modules that Worker imports, computed from its imports (`server/http/botModules.js`).
- Host-browser bots, piece 6, off by default and not live yet: with `SP_BOT_EXECUTION=host`, a bot seat's whole prep runs in a human's browser over live frames. The server only applies its moves. A silent, failed, hidden or lost browser hands the seat to the next human, and with nobody left the seat keeps its board and readies up. Fixed piece 8's check, which treated every normal room as a plugin room because normal rooms carry a content hash too.
- Host-browser bots, piece 10: removed the fork's host rehearsal additions (`SP_BOT_REHEARSAL_HOST`, `botRehearsalHost`, its default-on). Upstream's delegation stays, off by default, so `server/match/bot.js` is back to upstream's lines but for its CPU meter. Without `SP_BOT_EXECUTION=host`, no browser rehearses layouts for bots any more.
- Host-browser bots, review fixes: any field with no connected human goes to a browser, a disconnected or departed human's field included, at the start or mid-battle; no player's board runs on the server, and with no browser at all the synthetic result stands. A bot task takes one receipt and one plan batch, so repeated frames cannot stall a prep. A departed co-op seat's strategy pick is never asked of the seat's AI strategy, as before.
- AI teammates show their operator's name in the page's language, everywhere a name appears (`AI · Warfarin` instead of `AI · 华法琳`). It's decided by the seat being an AI: a human player named after an operator keeps their name exactly as typed.
- In the room, AI teammates show their operator's icon instead of the robot. The art pack gains Amiya's and Dobermann's avatar and portrait for this, since they aren't in this mode's roster. A full room keeps the Find Teammates switch's place empty, so the seat cards don't resize when the last seat fills.
- English text: the Rampage damage name and the Elemental Injury description now show five elements, several operators' potential-locked texts are translated, the 0.2.6 changelog and missing Playing Guide sections are in English, and the host rehearsal docs match the code.
- Skill cast sounds follow the equipped skill. 23 operators get a cast sound they never played, such as Ch'en S2, SilverAsh S2 and Toska S3, because it wasn't on their primary skill. On 54 operators the primary skill's sound no longer rings on a skill that has no cast sound of its own, such as Exusiai the New Covenant S1 and S3; those skills now cast silently, as the official bank table says. A server needs 9 new files in `audio/sfx`.
- Room screen: the Find Teammates switch shows its text again. The room layout from upstream 0.3.3 painted its background over it, leaving only its track visible. It now sits directly above the big button, which uses the Start Simulation look (amber with dark text while searching), and its description line is gone so the centre stays clear. On phones the switch, Add AI Teammate, the settings popup and the version tag are larger, and a seat's Preparing state can be read over light art.
- Lobby: the update news panel uses its full width and scrolls inside itself when space is short, so it no longer pushes Achievements, Join with Key and Combat Tips off the screen. The mode buttons sit together as one group of equal cards (the long descriptions used to spread them apart): each description now wraps above its card, who plays first, the rest under it. "Solo Matchmaking" is no longer cut off.
- Damage meters show one metric at a time. The result screen's Damage Stats and the in-match Combat statistics panel get a Damage / DPS / Healing / HPS selector (kept until the page reloads); rows sort by it, the top value fills its bar, and the row's width goes to the bar, so operators compare at a glance. Removed the panel's title, rank numbers, four-number rows, sort label and explanation box, and the chart's per-row DPS / healing text and All Rounds tag; hover a row for all four numbers.
- `fetch-assets` names the operators missing from the local FX index. Their per-skill sounds are then planned differently,
  which can make the run refuse to write `data/assets.json`, and retrying the downloads never helps. The refusal now says
  so and gives the extract command that fills the index.
- Sound: `data/assets.json` is rebuilt on a complete FX index. 19 older-season operators get their battle voices, and
  operators such as Glider and Ceylon get attack sounds they were missing. A server needs `node tools/fetch-assets.mjs`
  for the new files (about 1,300 more in the manifest, 34 MB).
- Outfits: the operators of the other official versions get theirs too (26 more, on the 19 operators only Season 1 has,
  such as Ceylon's Holiday HD49).
- English: Season 1 and Season 2 part 1 rooms now show English game text. Each version has its own overlay
  (`data/versions/<slug>/i18n/en.json`, built by `tools/build-i18n.mjs --data`), 99 % translated. They stayed Chinese before.

## 2026-10-18

### Upstream merge

- Merged upstream 0.3.1 at [`d905c146`](https://github.com/sganggs/Stronghold-Protocol/commit/d905c1464f762a03d236c7ad6bc3ba31a74f4494) (`99bcb678`).
  Upstream's plugin skins (`room.skins`, 显示其他玩家的皮肤) are merged but dormant next to the fork's outfits
  (`room.outfits`), which stay the skin system players use; no skin plugin is installed.
- Damage meter: the fork's damage meter (`ui/damageChart.js`, `damageLog.js`) is replaced by upstream's Combat
  statistics, which is now always on (upstream's opt-in setting is removed; an old stored value is dropped). Each
  record is tagged with its round, and the result screen's Full Report shows a whole-match chart split By Round or
  By Type, with Total Damage, Total Healing and DPS / HPS.
- Settings: Fold Shop While Deploying defaults to off. The fork's English voice default and match alert stay;
  upstream's Ammo and Energy Counts setting is taken.
- English UI: upstream's new strings use the fork's Alliance / Stacks wording.

### Changes

- Host bandwidth: the four big file lists (`data/assets.json`, `data/local-assets.json`, `data/local-fx.json` and the
  preload's `resource-manifest.json`, about 1.75 MB gzipped together) are also served at content-hashed URLs,
  `/data/h/<hash>/<name>`, marked `immutable` while the hash is current, so a CDN can keep them; another hash gets the
  current file with `no-cache`. A generation's page names the hashes in a `<meta name="sp-data-hashes">` tag
  (`shared/dataHash.js`, `public/js/dataUrls.js`); without it the plain URLs are used as before. A CDN needs a cache
  rule for paths containing `/data/h/`.
- Site policy: `SP_CF_ANALYTICS=1` lets the Cloudflare Web Analytics beacon through the page's Content-Security-Policy
  (its script host in `script-src` and its reporting host in `connect-src`). Off by
  default; the policy is otherwise unchanged.
- Site policy: `SP_CSP_NONCE=1` adds a fresh random nonce to `script-src` in every response's policy header, so
  Cloudflare's JavaScript Detections (Bot Fight Mode) can run: Cloudflare copies the header's nonce onto the script it
  injects. The game's pages still have no inline script of their own. Off by default.
- The service worker no longer fetches the preload manifest for a player who never preloaded (no preload cache).
- Sakiko S2: a cast that starts Fever no longer uses up her one switch. She stays on piano, the skill goes off again
  and charges, and her next cast switches to organ. Before, an S2 Sakiko next to an S3 one could get stuck on piano
  with no SP for the rest of her deployment, since the gauge refilled during the S3's Fever and her first cast
  started a new one.
- Sakiko's skill stings, the official short piano / organ clips: S1 plays one of three on every cast, Fever recasts
  included (at most two at once); S2 plays its organ sting when she switches to organ (not when the cast starts
  Fever); S3 plays its sting and holds its ambient loop for the skill, except when Fever is running or the gauge is
  full, as in the game's client. The stings play on their own voices (the busy battle mix no longer drops them) and
  load as soon as she is on the field, so none plays late. A server running locally needs
  `node tools/fetch-assets.mjs --add-only` for the seven new sound files.
- Sakiko's note sounds follow the game's own rules: each note sound plays at most twice at once (a new one cuts the
  oldest) with a slight random pitch, instead of up to 48 stacked copies. A Fever volley no longer buries the Fever
  song.
- The sound mix follows the game client's own mixer: music, voice lines and every battle and interface sound play at
  the levels of the official mixer groups their sounds belong to (attacks, impacts, skills, enemies, alerts …), with
  the client's compressors on the normal battle sounds and on skill sounds, and the normal battle sounds dipping under
  an operator's voice line. Music sits about 6 dB higher against the battle sounds than before, so the Fever song
  carries over Sakiko's volley. The round's track now fades out over 2 seconds when the Fever song starts, as in the
  game, instead of cutting out.
- Music, Operator Voices and Sound Effects all start at 80. Music used to start at 60, which put the battle sounds
  about 5 dB over the music compared with the game client, where the three default alike. Saved settings keep their
  values.
- Battle sounds the game plays from a spot on the field (attacks, impacts, most skill sounds) are 3 dB quieter when
  the clip is mono, matching how the client spreads them between the speakers. Interface sounds, alerts, skill stings
  and voice lines keep their level.
- Songs carry over the battle (a fork choice, not in the game client): while the Fever song or a singing skill plays
  (Skadi the Corrupting Heart's skills, Civilight Eterna's skills), the song plays 3 dB louder and the attack, impact,
  skill-attack and boss sounds 3 dB quieter. Alerts, skill stings, interface sounds and voice lines don't change.
- Dev sandbox: a Settings button in the panel header opens the game's own settings dialog, so volumes and the voice
  language can be changed while testing.
- Detail card: an operator whose selected skill changes the attack range gets Normal / Skill buttons under its Attack
  Range title. On Skill, the range preview and the highlighted tiles on the field show the range while the skill is
  active; the choice is remembered. The box keeps the size of the larger range, so the buttons never move. In battle
  it uses the battle's own range, so kit-only ranges such as Fartooth S3's line show too. The dev sandbox has it as
  well: its card and field highlight follow the unit's picked skill, and a Custom Squad pick such as Sakiko now
  highlights her range on the field when selected.
- Sakiko's S2 animations follow her official modes: piano attacks play its own attack clip and stance, organ the organ
  pair. Before, she stood in the organ stance from deployment and never played an attack clip in S2.
- Outfit effects follow each outfit's own replacement list from the game client instead of matching names. Sakiko's
  Master of Melodia now plays the outfit's piano and organ attack effects the right way round, with their extra light
  rays, and a few other outfits gain effects the name rule missed. Run `extract.py --only fx` again to pick this up.

### Fixes

- Combat statistics: operator names in the in-battle panel are translated (they showed the Chinese name).

## 2026-10-17

### Changes

- Match Found Sound: the official match-found chime plays as the match briefing opens, however the match started
  (Solo Matchmaking, a room's start, Find Teammates), and also while the game's tab is in the background. On by
  default; Settings → Match Found Sound turns it off. Mute and the SFX volume apply.
- Dev sandbox, round 3 — bonds, stacks and items: bonds are counted from the board and the bench by the match's own
  rules (the server's `bondsMeta.js`, served to the page as `/match/bondsMeta.js`) and go into the battle, so kits that
  stack bonds in battle do it in the sandbox too. A "Bonds & stacks" panel lists each bond's members and tier, with
  "+Count" (extra members) and "Stacks" per bond, both kept in the URL. After a battle, "Bank stacks" adds the stacks
  gained the way the settlement does (capped at 999) and "Bank + next round" also loads the next round's waves; the
  board and the bench stay, and a history lists what each battle stacked. Changing the waves no longer reloads the page.
  Each unit can carry up to two items (kept in the URL), including the pairs that grant a bond.
- Dev sandbox, round 4: Pause / Resume and frame stepping in battle ("+1 frame" / "+10 frames", or Space, "." and
  ">"); a step is exactly that many 1/30 s ticks of the battle, and a paused, stepped battle ends exactly like one run
  straight through. A unit already on the board or the bench can change its skill and outfit from its entry in the list.
  Boss picker: every map's Final Assault (round 14) and Hidden Core (round 15) are in the waves list, fought on the boss
  field with your units on its left half and the captured partner board on the right (boss fields gain no stacks in
  battle, the official rule). `tools/capture-specs.mjs --stages --kind boss,hidden` captures them and keeps the rounds
  already in the index. Core bond presets: "Add the whole bond" puts every Operator of a core bond (normal or elite) on
  the board's free tiles at once, melee ones on melee tiles, and the rest on the bench.
- Dev sandbox, round 5 — the match's own widgets: the bond strip over the field (stacks, active state, live stacks in
  battle, dimmed on boss fields) with its bond popup; clicking a piece, a battle unit, an enemy or the boss opens the
  usual detail card, with live HP and stats in battle; on a boss field in battle, "My side" / "Whole field" / "Partner's
  side" move the camera like the match's ‹ › pill. Icon pickers: "Browse…" shows every Operator as an icon grouped by
  bond (core bonds first, then the others, then the Custom Squad picks, with a filter), and "+ Item…" on a unit shows
  every item as an icon grouped by name (normal and elite side by side).
- Dev sandbox battle meter: Damage, Healing, Stacks and Taken tabs with a bar per Operator (a summon counts for its
  Operator), live during the battle and kept afterwards until the next one starts. Stacks shows which Operator's kit
  stacked which bond and by how much, gains without an Operator (bond effects, items …) on their own rows, and a total
  per bond that matches the stacks "Bank stacks" adds.

### Fixes

- Small phone screens (narrower than 768 px, e.g. 640 × 360): the Damage Stats button sat under the shop bar. It now
  wraps onto its own row above the ⚙ / 📖 / ⛶ buttons, and the card that opens on the left ends above it.
- Sakiko's notes fly to the centre of a multi-tile boss before they strike, like other projectiles, instead of
  striking as soon as they touch the edge of its body.
- The preload manager no longer fails with "Couldn't load the asset list: … Operation too large" once a whole pack is
  saved: Chrome refuses to list a cache of more than about 15,000 files, so the manager then checks each file of the
  asset list on its own.
- Gladiia (normal and elite) can be deployed on Ranged Tiles in every language, not only Simplified Chinese: the
  client's placement check read the translated trait text, so it never found the Chinese one and blocked the drop.
  It now reads the untranslated records; cards and details stay translated. Ported from upstream
  [PR #694](https://github.com/sganggs/Stronghold-Protocol/pull/694) by @hesperine.

## 2026-10-16

### Upstream merge

- Merged upstream 0.3.0 at [`c24e17ee`](https://github.com/sganggs/Stronghold-Protocol/commit/c24e17eec3af1e6dedfa9935a6d15245cf2f4586) (`33221173`).
  Upstream's plugin system, Studio and official battle effects work with the fork's generations router: plugin, sim
  worker, rehearsal, effects and manifest URLs stay in the page's own generation, the CSP also hashes each
  generation's rewritten import map, and `/healthz` carries both sides' fields (plugin content and trusted runtime
  next to generation, loop, sim and maintenance).
- Voice: upstream's voice store replaces the fork's. Its dubs and per-Operator `voiceOverrides` are kept, with the
  fork's rules on top: English by default, a pick → native → voice language → Japanese → Chinese fallback, and
  changing the voice language or the native switch clears every per-Operator pick. The fork's square picker drives
  it, in the Operator detail and on each row of the Custom Squad overview (pick and hear a dub without opening
  Change); picks saved before the merge carry over on first load.
- Bot rehearsals now run in the host's browser by default (`SP_BOT_REHEARSAL_HOST`, 3 layouts; `0` turns it off).
  `SP_BOT_REHEARSAL` is only the server's own count: with `0`, a host that doesn't answer leaves the bot the simple
  placement, at no server CPU.
- Matchmaking: a room with gameplay plugins can only be joined by room code (no Find Teammates, no solo queue; turning
  them on mid-search stops the search). Players merged in by matchmaking don't get the host's cosmetic plugin art.
- One damage meter: the fork's corner button and result chart; upstream's combat-metrics panel and its setting are
  left out. The meter now also counts in plugin rooms, where the battle runs in the browser.
- Left out: the title screen's asset download button (the preloader covers it; the asset import stays, sharing one
  service worker with the preloader).
- Fixes found while merging: Sakiko's Fever is no longer lost when a round's battle ran in the player's browser; her
  note range uses the 0.1 colliders; upstream's cast effects follow the fork's repeating attacks; her note textures
  moved from `fx/oblvns` to `notes/oblvns` (re-extract or move the folder), clear of the official effects' `fx/`.
- Official battle effects are opt-in in 0.3.0: extract them from a local client with
  `tools/local-extract/extract.py --only fx --fx-set used`; without the files the 官方特效 (Official Effects) setting
  stays hidden.

### Changes

- The lobby news banner announces Update 0.3.0 (Sakiko Togawa, official battle effects, official models for High
  Ground, summons and devices, and three gameplay points); everyone who closed the 0.2.6 banner sees it again.
- The preload manager (Settings → Preload Assets) imports a preload zip: `npm run package:preload`
  (`tools/preload-pack.mjs`) writes every file the preload lists, the official battle effects included, into one
  zip a host can offer anywhere; files whose size and SHA-1 match the server's are saved as if downloaded, the rest
  still download. Upstream's title-screen asset import and download buttons are gone (one place for the art).

## 2026-10-15

### Contributions

- Planned server maintenance: `npm run maintenance` closes the server to new matches, shows players a countdown bar,
  and stops it once the running matches end ([#6](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/6), thanks to @evenifyouforget).
- Battle view: operators in liftoff are drawn at a flyer's height, Barrier HP is drawn over the HP bar, and status icons
  show their time left as a ring with their value ([#10](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/10), thanks to @evenifyouforget).
- dev-0.2 CI fixed: the BOM regex in `texture-fixes.mjs`, docs-paths exempting `public/fonts/`, and the lobby
  rate-limit and flood tests on slow Windows runners ([#11](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/11), thanks to @evenifyouforget).

### Changes

- Sakiko Togawa can be picked in the Custom Squad, with her full kit: notes that wander, home in and (piano) pass
  through, using the official note flight data; her continuous attack; S1's eight-note volley, S2's piano → organ
  switch, S3's double-timbre volley; and the Ave Mujica Fever gauge (450 points, 20 s), shared by every Sakiko on a
  field and carried into the unite phase. High Swift layers lock S1 out of Fever, as in the game.
- Sakiko Togawa (丰川祥子) is no longer left out of the Custom Squad data with the other collab operators: her units,
  her Master of Melodia outfit and the Fever / Ave Mujica keywords are built (she becomes pickable with her kit). Her
  only dub is the Japanese collab one, so the Chinese voice setting plays those lines, as the game does.
- Status keyword names follow the current official EN data: Sluggish (was Dull), DP Lower Limit (was Minimum DP), and
  Necrosis / Corrosion / Nervous Impairment - Ally (was - Player).

## 2026-10-14

### Changes

- `GET /healthz?traffic=1` (loopback / private-network clients only, as before) also reports what blocks the main
  thread: `loop`, the event loop's lateness per minute (mean / p50 / p99 / max from `monitorEventLoopDelay`, and how
  often a 10 ms tick fired 50 / 100 / 250 / 1000 ms late, with the longest), and `sim`, the time the server's own
  battle simulation took per minute, by kind (`headless` bot seats and takeovers, `rehearsal`, `prep` bot decisions,
  `boss`, `runner`) with the longest single slice and the longest burst of back-to-back slices (`server/http/loopStats.js`, `server/match/simMeter.js`). The wait a player's action sees
  is the `loop` delay; when `sim` rises with it, the simulation is what holds the thread. A measurement on the public
  server (2026-10-14, about 150 matches and 30 AI seats) had found stalls of 100 ms to 1 s several times a minute.
- One log line per combat start: `[match CODE] R<n> combat: <fields> field(s), <k> server-run`, so the server journal
  can be read against those stalls (`server/match/match/combat.js`).
- `SP_BOT_REHEARSAL` (0–8, default 3) sets how many layouts an AI teammate rehearses with the real simulation per Rest
  Phase; `0` skips the rehearsal. A knob for a public host, README env table.
- Afterimages on mobile fixed: after switching apps and back on Android Chrome / Brave (a GPU process restart;
  `chrome://gpucrash` reproduces it), units drawn through the impostor atlas (crowds, and clipped skeletons in prep)
  piled every new pose onto the old ones and showed pieces of other units until a reload. The slot erase is now a
  scissored `gl.clear` instead of an ERASE-blend quad, and returning to the page or a restored WebGL context resets
  PIXI's GL state, clears every atlas page and redraws every impostor. A failed atlas pass and context loss / restore
  are written to the diagnostics log (`public/js/render/impostor.js`, `public/js/render/app.js`).
- HP bars, projectiles, redeploy rings and other drawn HUD pieces no longer vanish after that GPU restart: Chrome
  blanks every GPU-backed 2D canvas when its GPU process restarts, and PIXI re-uploaded those empty canvases. Every
  canvas the game draws a texture on (and every canvas PIXI makes for itself, `Texture.WHITE` and text) is now kept in
  CPU memory (`willReadFrequently`), which a GPU restart doesn't touch (`cpuCanvas` in `public/js/render/app/pixi.js`).
- Lobby announcement bumped to Update 0.2.6 and shown again to everyone (new dismiss key `news.0.2.6`): Outfits stay on
  top, then Suzuran without glasses, the official scenes' lighting, raised / water platforms and sealed ground on the
  scenes, the round-start deploy replay, the Ammo Count setting, uncut models on crowded boards and Wiš'adel's summons
  on deploy tiles.

### Fixes

- The last 15 cut-off models are fixed: the clip measurement also poses every animation key (and the instant before
  it), so a pose shown for a single frame between two samples is in the box (Hellagur's katana, Veen's shadow, Dusk,
  Ulpianus, the strawberry of Eyjafjalla the Hvít Aska's Epoque outfit, Fartooth's whirlwind outfit…). All 483
  Operator and outfit models now keep every pose they play inside their box. A model's box takes about twice as many
  frames to measure (median 22 frames instead of 10, 2.5 ms each).
- Ines's attack no longer shows a stray slash beside her: her slash effects wait about 1600 units to her right while
  hidden, and the short crossfade into her attack slid them in from there. While two clips crossfade, a slot drawn far
  outside both clips is hidden if the outgoing clip doesn't show it, and the crossfade is cut if it does (her 'boc'
  outfit's body rose from 900 units below her on its way back to idle). A crossfade that leaves the impostor box is
  drawn directly for those frames.
- Ines's 'boc' (Bloodline of Combat) outfit no longer dashes in from the left on each normal attack. Her attack
  switches to a second copy of her body whose bones wait about 900 units away while hidden, and the 0.06 s crossfade
  blended that copy in from there. A crossfade that mostly draws slots the outgoing clip doesn't show (over 40% of the
  visible slots) now swaps straight to the new clip. Skadi and Bagpipe (and their outfits) swap bodies the same way
  and are cut too.
- Bagpipe's S2 (next attack ×2) plays its double shot again. The sim turns a charge skill on, attacks and turns it off
  in the same tick, so the skill-off cut the Skill_2_Loop shot straight into Skill_2_End and idle. A skill that switches
  off during its own attack clip now lets that attack play out, then plays its End clip.
- Ines strikes the enemy she blocks with her melee clip (Combat, and Skill_2_Combat during S2) instead of her ranged
  shadow throw (Attack / Skill_2_Attack), as in the official game. The sim's attack event doesn't say which, so the view
  checks whether the target is blocked and standing on her tile.
- Suzuran's default model no longer looks like she's wearing glasses: the dark outer rims of her eyelid patches are
  painted skin-coloured in her atlas image (the line around each eye stays), so she still blinks. Her outfits are unchanged.
  `fetch-assets` paints the fix itself after every download (tools/assets/texture-fixes.mjs), so an asset refresh keeps it.

## 2026-10-13

### Upstream merge

- Merged upstream 0.2.6 at [`488db49f`](https://github.com/sganggs/Stronghold-Protocol/commit/488db49f11daf862b67ce26fa4cf89aa6cba2466).
  The fork's generations router keeps working with upstream's content-hashed asset URLs, brotli, WebSocket deflate and
  `/healthz?traffic=1` (the generation prefix is stripped first, `/assets` stays unprefixed). Upstream's new
  「弹药数量」 (ammo count) setting sits next to the fork's voice settings. Upstream's per-Operator `voiceOverrides` stays
  out, as before.
- The asset preload works with the content-hashed URLs: the service worker reads `/assets/~<hash>/…`,
  `/fonts/~<hash>/…` and `/media/~<hash>/…` as the plain file's path (`shared/resources.js`, `public/resource-sw.js`),
  so the files the game now requests are answered from the saved copies again instead of always going to the network.
- Impostor boxes (the cached image a unit is drawn through on crowded fields) now come from upstream's runtime
  measurement of every clip a unit can play (#542), grown to the fork's build-time per-clip extents where those reach
  further; the extents alone are the fallback when a model cannot be measured. The melee / ranged twin clips of
  fortress and lord Operators (Horn, Ashlock, Thorns, SilverAsh…) are measured too. Across all 483 Operator and outfit
  models, 15 still have a pose past their box (upstream's box alone: 28, the extents box alone: 28).
  `test/render/impostor-fork-models.test.js` keeps Ashlock's cannon, Sankta Miksaparato's skill, Gummy's Summer easel and
  the twins inside the box.

### Changes

- A Discord button (the blurple Discord mark) on the title screen's top-right corner and the lobby and room top bars
  links to the server's Discord community (`public/js/ui/discord.js`). On screens ≤ 700 px wide it shows the mark only.
- The room's top bar takes the lobby's tool style: Stats, Settings, Guide and Discord are icon-only square buttons in a
  group after a divider (the names stay as tooltips / accessible labels).
- The title screen's Discord button is a filled blurple button with a white mark, its label and a slow glow, so it
  stands out in the top-right corner (no glow with reduced motion).

## 2026-10-12

### Upstream merge

- Merged upstream 0.2.5-dev at [`cf7a9400`](https://github.com/sganggs/Stronghold-Protocol/commit/cf7a9400270d5aa79b2e601e405dab782e25f120).
  Upstream's fix for the trait-gift stock (#488) replaces the fork's port of PR #496: fixed gifts now still take 1 / 2
  copies of the shared stock but are never refused when it runs out (`requirePool:false` + `isUnlimitedGiftItem`).
  The `noPool` marker and its tests are gone. Upstream's one-clip-per-attack Spine timing is taken, and the fork's
  melee / ranged clip twins (Horn, Ashlock, lords) still apply on top of it. The banned-members box beside the
  Alliance tooltip is upstream's single scrollable box now. Upstream's per-Operator voice strings stay out.

### Changes

- Dev sandbox page, `/dev/sandbox.html`: pick any Operator from the pool (normal or elite, a skill, an outfit, a
  facing), add it to the bench and drag it onto the board like in a match (legal tiles light up, drop on a unit to
  swap, off the field to send it back), then start a real battle against captured round-13 waves (the browser sim,
  like the match). The outfit is the sandbox's own per unit and leaves your saved outfit choices alone. Options can draw every unit as an impostor (the crowd path) and switch back to the old impostor box, to
  compare the cut-off sprites with the fix. The board stays in the URL, so a link reopens the same setup.
- Dev sandbox, round 2: sound (BGM, battle SFX and voices at your volume settings); Custom Squad picks (any Operator a
  tier-5 / tier-6 custom slot may field, normal or elite, no module); the match's direction wheel after each drop
  instead of a facing menu (drop a unit on its own tile to turn it); the skill last picked for an Operator is
  remembered; enemy waves of every normal round 1–13 (`public/dev/sandbox/`, `tools/capture-specs.mjs --kind normal`);
  an empty wave you fill enemy by enemy (enemy, route, time, count, interval, HP / ATK ×), saved as a preset in the
  browser. A Map picker offers the 7 maps of the Hard rotation, each with its own 13 rounds from a bot match on that
  map (`tools/capture-specs.mjs --stages`); a preset belongs to the map it was saved on.
- Lobby announcement bumped to Update 0.2.5 - PRTS and shown again to everyone (new dismiss key `news.0.2.5`): Outfits
  on top, then official 3D battlefield scenes, Official Damage Numbers, Alliance stack sounds, pending HP loss,
  uncut Operator models, Horn / Ashlock animations, Fortress Defender arcs and Lord Guard melee, and many fixes.

### Fixes

- Operator sprites no longer get cut off at a straight edge when they attack or use a skill (Ashlock's cannon when
  firing, Sankta Miksaparato's skill, and 159 of 209 Operator models in some pose). On crowded fields a unit is drawn
  through a cached image whose box came from its first rendered pose, usually the start of the deploy drop, so poses
  reaching further were clipped. The asset manifest now carries each clip's extents (`tools/assets/skel.mjs`
  `clipExtents`, `data/assets.json` +0.4 MB) and the box grows with the clips the unit actually plays.
- Horn now plays her cannon animation when she shoots, her skills included; before, every shot played her melee
  swing (her model's `_B` clips are the cannon, the `_A` ones the melee she uses while blocking). Ashlock had the
  opposite problem: he fired his cannon at enemies he was blocking; he now uses his shield bash on them.
- Lords (SilverAsh, Lappland, Thorns, Ayerscarpe, Qiubai and `char_617_sharp2`) now use their melee
  animation on an enemy on their own or front tile and keep the ranged one (SilverAsh's cane point with the eagle) for
  shots further out; their melee strikes no longer fire a tracer. Thorns' clips are the other way round from the
  rest (his default `Attack_1` is the melee, `Attack_2` the ranged throw).
- Fortress shots (Horn, Ashlock) fly in a curved, artillery-shell arc and land with a burst, like in the game, instead
  of a straight tracer. Cosmetic only: the flight time is unchanged, so hits land exactly when they did.

## 2026-10-11

### Upstream merge

- Merged upstream 0.2.4 at [`bc50cac0`](https://github.com/sganggs/Stronghold-Protocol/commit/bc50cac01ff447eff3ab6c35f69d934bbc23b48f) (`7bd9c272`).
  Upstream's per-Operator voice dropdown (its DIY picker import, `.lo-voice` CSS and 3 pack strings, touched by 0.2.4)
  stayed out, so the fork keeps its single voice language system. The matchmaking design section moved from §29 to
  §90 (upstream's 0.2.4 history took §29); §90 and up are reserved for fork sections, and the no-gap check in
  `test/docs-paths.test.js` skips them.

### Changes

- Outfits (时装). Operator Loadout gets a Loadout / Outfits switch above the detail header. The Outfits view shows the
  selected Operator's worn outfit: a large artwork (click it for full size) and the battle sprite at its in-game scale
  (click it to play the attack). Click a card (Default or an official outfit) to wear it. There's a separate JSON
  Export / Import. Custom Squad slots get an Outfits button that opens the same panel, and the Custom Squad operator picker lists
  the outfits of the Operator being picked. Everyone owns every outfit. An outfit replaces the whole look, E2 art
  included: avatar, portrait, shop and bench icons, battle model, its summons' looks and its own voice lines, where the
  outfit has them. Other players see it through `room.outfits` and room.state. It's cosmetic only: no sim or golden
  change. Data comes from `tools/build-outfits.mjs` (`data/outfits.json`, 273 outfits of 174 Operators, Custom Squad ones included). Art and
  models come from the usual dumps. The artwork is converted to WebP on download: sharp, a new optional dependency,
  shrinks ~900 MB of PNGs to ~56 MB. Preload has an optional Outfits pack, with its own "Remove Unticked Outfits" button. CN-only outfit names come from
  arknights.wiki.gg. Docs: `docs/OUTFITS.md`.
- Battle summary screen: the left column no longer scrolls sideways. "Simulation Complete" was too wide for it; an
  alphabetic headline now wraps at its space and shrinks to fit (a fixed size, no container query, so it also works on
  Safari 15 / Firefox ESR 115). The match damage chart uses two columns, and hovering
  a bar segment shows its round and damage. To preview: `/dev/game-mock.html?phase=RESULT&lang=en` (the mock now
  accepts `?lang=` and fills the damage log on RESULT).
- Zero-downtime restarts ("generations"). Each deploy (`scripts/generations.mjs deploy`) starts a new server process
  next to the old one, behind a small router (`scripts/router.mjs`) that the reverse proxy talks to. New visitors go to the new
  generation, and running matches finish on the old one. Old pages get `sys.retire` and move over once no match is on
  screen; a room still waiting is lost. An old generation is stopped when its last human match ends, or after one hour.
  The client builds its URLs through `public/js/gen.js`. Without the router (local play, LAN, tests) nothing changes.
- Fixed: a freshly deployed generation retired itself at startup (the table still named the old one as current),
  so lobby pages reloaded in a loop. A generation now retires only once the table lists it, and `deploy` refuses
  to switch to one that came up retired.
- Fixed: a deploy after an upstream merge that adds an Operator left that Operator's voice and sound files missing
  (Clementia's 404'd, so her voice preview was silent). `deploy` now checks every file `data/assets.json` lists and,
  when some are missing, runs `fetch-assets --refresh-index` (the cached audio indexes predated her). Files still
  missing after that are a warning; the deploy goes on.
- Lobby announcement banner updated for 0.2.4 (shown again to everyone who closed the 0.2.2 one).
- Lobby announcement bumped to Update 0.2.4.1 and shown again to everyone: an emphasized top line "Added the
  Outfits system to Operator Loadout"; the Settings Text Size / Home Screen line is gone.
- EN text corrections layer: `tools/i18n/corrections-en.json` overrides an official EN text that contradicts the
  Chinese data and the engine, before the official data is used. First entry: the Victoria Alliance 6-operator bonus
  reads "+50% ATK per equipment carried, +80% per upgraded" (the official EN read as a flat bonus).
- Fixed ([upstream #488](https://github.com/sganggs/Stronghold-Protocol/issues/488)): Muelsyse's on-acquire Damazti
  Isomorph stopped coming once the shared item stock (3 copies) ran dry. The trait-fixed items of Swire, Carnelian,
  Ela and Muelsyse (and the Damazti Cluster strategy's grant of the same item) now skip the stock and hold no
  copy. Ported from upstream [PR #496](https://github.com/sganggs/Stronghold-Protocol/pull/496) (`1d1ff3b1`).
- Lobby announcement banner lists both fixes above (new dismiss key `news.0.2.4.fixes`, so it shows again).
- Fixed: the About panel read "Running HEAD @ …" since generations, because each release checkout is detached.
  `deploy` now records `app/`'s branch as `SP_BRANCH` in the generation's env file, and `scripts/server-info.mjs`
  uses it when git reports a detached HEAD.

## 2026-10-10

### Upstream merge

- Merged upstream 0.2.3 at [`1db8e510`](https://github.com/sganggs/Stronghold-Protocol/commit/1db8e51023ae6abaec9370beb81a513d5c4d0b01) (`f81c8602`).
  Upstream's per-Operator voice overrides were removed so the fork keeps a single voice language system (the voice
  language picker below).

### Contributions

- English translations of README, CHANGELOG, NOTICE and the DEPLOY, PLAYING and WINDOWS guides
  ([PR #3](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/3), thanks to @evenifyouforget). Kept in
  sync with the Chinese originals from now on, which stay authoritative. The English README lives at
  [.github/README.md](.github/README.md), so GitHub shows it on the repo page; the Chinese README.md stays at the root.
- Lobby "Difficulty Details" dialog: what each difficulty actually changes, side by side for Solo and Team Simulation
  (enemy HP/ATK multipliers per round, Leader HP per Leader, Alliance bans, map pool, Improv rounds, Hidden Core entry,
  battle time limits), read from the same data the match uses
  ([PR #4](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation/pull/4), thanks to @evenifyouforget).

### Changes

- Damage chart: a chart button next to Chat (lower left) opens a bar chart of each of your Operators' damage, live
  during combat and the previous round's during the Rest Phase, with the round total. Copies of the same Operator (and
  its elite form) share one bar, and summons count for their summoner. The result screen adds a match chart under the
  player cards, with each bar split into its rounds. Only your own Operators are shown, since the numbers come from the
  battle your browser runs. They're kept in memory, so a page reload mid-match starts the chart over.
- Briefing: click a core Alliance to tell your teammates which Alliance you're going for; the call shows on the Alliance
  disc, and two players calling the same one are flagged as a conflict (`g.bondCall`). The hint now sits on the Core
  Alliances heading, right after the "Core Bonds" label, as a glowing mint chip ("Click an alliance to call your plan")
  instead of small grey text above the discs; the Core Alliances panel has more room around it.
- Briefing: hovering an alliance with banned operators opens a second box beside its tooltip listing them, each with
  avatar, name and alliances (the hovered one in mint). The shared `Tooltip` gained an optional `aside` for this.
- Briefing: the setup reroll banner is now a single "Reroll stage setup" button at the lower left of the footer; during
  a vote it shows the count and the Agree / Reject / Cancel buttons there, with the explanation and who agreed in the
  tooltip.
- Co-op briefing timer raised from the official 25 s to 45 s, so the team has time to agree on core Alliances (solo
  stays untimed).
- Ready / unready sounds, and a low-timer sound on the Strategy select screen.
- Lobby header redesign; the "Add to Home Screen" button moved into the lobby.
- In-game news updated for 0.2.2.

## 2026-10-09

### Upstream merge

- Merged upstream 0.2.2 at [`62eb1134`](https://github.com/sganggs/Stronghold-Protocol/commit/62eb113419123d9a3a63606107bbf85230c5dd2f) (`60745dd1`).

### Changes

- About server panel on the title screen with the server's contact points.
- Asset preloading: start, pause / resume and finish downloading the game's assets ahead of time; they're used until
  Clear Cache. Based on [xinhai-ai/Stronghold-Protocol](https://github.com/xinhai-ai/Stronghold-Protocol), thanks to
  @xinhai-ai.
- English is the default interface language; voices fall back English → Japanese → Chinese.
- The voice selector shows language names in the current interface language, with a toggle for the native-language dub
  where one exists; the implementation was brought closer to upstream's.

## 2026-10-08

### Changes

- Solo queue matchmaker: players searching alone are grouped into rooms automatically.
- Fixed the link preview (Open Graph / Twitter card) when the site is shared.

## 2026-10-07

### Upstream merge

- Branched from upstream 0.2.0 at [`13033214`](https://github.com/sganggs/Stronghold-Protocol/commit/1303321407f9a9b80c68e0a4d47b40871a5d06c3).
- Merged upstream 0.2.1 at [`c2a2ef77`](https://github.com/sganggs/Stronghold-Protocol/commit/c2a2ef778cf728ff29b953b9842b2a39b1e9cbea) (`6ce79acc`).

### Changes

- Matchmaking and server restart announcements ported over from the 0.1.x fork.
- Player counter in the lobby and while queueing.
- English names, skills, talents and Modules for Operators the EN client doesn't have yet, following the wording of
  [arknights.wiki.gg](https://arknights.wiki.gg/wiki/Operator/List#CN_Operators) (CC BY-SA 4.0).
- Voice language selectors.
- Announcement banner updated for 0.2.1.
