The second mini release on 0.3.3, released as **0.3.4-3**. It brings:
- Mod Z / W v2: new memberships and effects for 14 modules, three new W modules, and fixes found on the way;
- two new cheats, Alliance Stack limit 9999 and No boss hit limit;
- auto-awarded free Risk tags (a lobby rule) with a panel that says why a tag wasn't awarded;
- AI profile strength scores in the popup and in the bot selector;
- clearer player texts from the blind-read retro;
- Yuri's changes of 2026-11-13 to 11-15.

Base: `main`. Branch `mini/0.3.3-2` (working name; the real version is `0.3.4-3`). It is squash-merged, and the squash commit's message is this description's changelog, so the changes stay readable in `main`'s history.

## Changelog

### Cheats (Custom Lobby Modifications)
- **Mod Z / W v2** (Fish's second drafts): new Alliance memberships for Typhon Z, Rosa Z, Eunectes Z, Phantom Z, Shining Z, Siege Z and W, Weedy Z and W, Zuo Le Z and Saileach W; Typhon Z and Thorns Z are at max SP the first time their skill ends; Eunectes gives her Alliances +3 Stacks when an enemy dies in her range; Phantom gives +3 per deployment, and items give him Alliances without the Damazti Isomorph; Shining's Immortal is given to every Operator at the start; Fiammetta has new ammo numbers, reloads and doubles the Laterano ATK effect; Viviana's bursts also lower DEF; Zuo Le's hits always add Burn and Arts; Typhon W adds the first 30 fallen enemies to the wave again; Weedy W, Siege W and Saileach W are new modules. Kal'tsit Esperanta is deferred (#187, #182).
- New cheat, **Alliance Stack limit 9999**: every Alliance's Stack limit goes from 999 to 9999 (#186, issue #174).
- New cheat, **No boss hit limit**: a single hit of 300000 or more on a Leader is no longer cancelled; meant to go with the Stack limit, but separate (#186, issue #174).

### Lobby rules
- New rule (not a cheat), **Auto-award free Risk tags**: Risk tags the room didn't take are added when the match shows they changed nothing (Investor, Swift, Foresight, Strategy 1 and 2, then Intern, Barge, Last Line of Defense and Junk 1 in rooms without bots), shown as orange chips on the end screen. The "Why weren't other tags auto-awarded?" panel says what happened in the match (#170, #173, #179, issue #125).

### Bots
- AI profiles: one strength score after each name (the Ultimate solo and team-of-4 win rates added up, 0–200, ± 1 standard deviation), with the match counts; legacy's and evobot's numbers pool 300 more matches per mode, which moves evobot's team win rate from 78% to 71% (#168, #178, issue #124).
- The room's bot selector shows each bot's score next to its name (#185, issue #172).

### Interface and text
- Clearer player texts from blind reads: Swift, Booster Packs, Transmitter+, Isomorph, Alliance bans, the Mod Z tab and the AI profile texts (#181).
- Viviana's Mod Z warning shows the 13-tile diamond it will hit (#185, issue #175).

### Fixes
- HR File works under the +2 deployment-limit cheat, still +1 over the limit (#184, issue #183).
- Siege's Mod Z no longer wastes DP at the 99 cap: her player's DP cap is 999 while she is on the field (#184, issue #176).

### Sync and tools
- Yuri's English translation, 2026-11-13 to 11-15 (#166).
- `tools/bench-share.mjs --rules` shares SPA-CC grinder sets as compute jobs (#171).

Closes #172
Closes #174
Closes #175
Closes #176
Closes #183

## Known issues
- Mod Z / W v2 is not playtested; Weedy W's Water Cannon cooldown has no test, and Typhon W's effect on Kjerag Stacks is not benched.
- Viviana's DEF shred is worth only about +12% damage on human boss boards (measured); it may change.
- Some Mod Z / W texts still read unclear in blind reads (Phantom's Raid line, Typhon Z's split, Siege's DP limit against its drain, Viviana's diamond, Hellagur's Tenacity).
- Kal'tsit Esperanta's Mod Z is deferred to the next release.
- Auto-award's "Low Efficiency" tag waits on a decision; #125 and #124 stay open for later levels.
