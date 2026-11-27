The first mini release on 0.3.3. It brings:
- four new cheats: Mod Z / Mod W (draft), Damazti Isomorph+, Transmitter+, and lobby rules that remember themselves;
- the evobot profile;
- the shared deck popup;
- Improv's "View Fields";
- an opt-in public name in match records;
- replayable, continuable match records;
- four fixes.

It also gives the Fish Edition changelog its own fragment files, so pull requests stop conflicting on it.

Base: `main`. Branch `mini/0.3.3-1`. It is squash-merged, and the squash commit's message is this description's changelog, so the changes stay readable in `main`'s history.

## Changelog

### Cheats (Custom Lobby Modifications)
- New cheat, **Mod Z / Mod W (draft)**: Fish Edition's own modules for 13 Operators the official game never buffed. The host turns them on per Operator: Typhon Z or W, and Z for Rosa, Eunectes, Fiammetta, Hellagur, Phantom, Saileach, Shining, Siege, Thorns, Weedy, Viviana and Zuo Le. Each module has a behaviour test (#142).
- New cheat, **Damazti Isomorph+**: worn with the Isomorph, more items that sound like an Alliance's make the holder its member (#150, issue #134).
- New cheat, **Transmitter+**: the first Transmitter on a 6-star Operator offers Muelsyse; any other use offers an Operator of your strongest Alliance (#155, issue #133).
- A room you create starts with the rules you last used, and the rules dialog has "Clear all" (#148, issue #143).
- The rules button glows until you first open it, so new players find the cheats and Risk tags (#149, issue #139).

### Bots
- New bot profile, **Evobot**: the weekend evolution search's best basic bot (late-game sells, stack and fund items). It is proven stronger than legacy: 43.8 % vs 40.8 % wins on 2,000 paired Ultimate seeds, p = 0.008 (#159).
- Rehearsals prefer the board that clears the round sooner among equal boards (#156, issue #117). The golden match results are regenerated for it (#164).
- The AI badge names its profile, and a popup describes every AI profile, with its strength: the Ultimate solo win rate and the win rate of a team of four (#151, issue #87).

### Interface
- Shared deck: the shop's Deck button shows the copies left of each Operator in the shared deck (#152, issue #132).
- Improv: "View Fields" pulls the overlay away to check the Fields; the tab at the top brings it back (#153, issue #105).
- Settings: "Name in match records", off by default, credits your clears to a public name (#154, issue #118).

### Fixes
- Blaze takes the skill chosen for Catherine when the Blaze rule is on (#144, issue #116).
- The LP loss shown during a battle and in the round's result box includes Last Line of Defense's extra 2 LP (#145, issue #123).
- Strategy 2 texts for Ioleta, Du Yaoye and Amiya. Release zips carry the server's version information. The Chinese guide links Fish Edition's repository (#147).

### Records and tools (for server owners and researchers)
- Match records log the shop a refresh leaves after its effects, such as Du Yaoye's Yan offer (#146, issue #90).
- Records keep each seat's setup; `tools/replay-record.mjs` rebuilds a match, stops at any round, or hands it to a bot, optionally on another seed (#157, issue #104).
- Changelog fragments: pull requests add `changes-fish/<PR>-<what>.md` / `.en.md` instead of editing the changelog; the server folds them into the release notes (#160, issue #158).
- For contributors: `fish-edition/COLLABORATION.md` (the pinned work board #161, where things live, compute jobs) and `tools/bench-share.mjs`, paired bot-strength runs whose results fit in a GitHub comment (#162).
- CI: the golden match results regenerated for #156 (#164), and a loop in Transmitter+ names its cap (#165).

Closes #87
Closes #90
Closes #104
Closes #105
Closes #116
Closes #117
Closes #118
Closes #123
Closes #132
Closes #133
Closes #134
Closes #139
Closes #143
Closes #158

## Known issues
- Mod Z is a draft: the numbers its texts leave open are marked `[DRAFT]` in `server/sim/content/modZ.js`. Viviana's is the closest to overpowered, and Shining can't heal allies already at full HP just to grant Immortal.
- The full CI's Windows shards have failed intermittently since 0.3.1-1 (no single file; the logs can't be read from orca).
- The scope is closed (2026-11-18): everything in this release is merged into `mini/0.3.3-1`.

— Claude (orca)
