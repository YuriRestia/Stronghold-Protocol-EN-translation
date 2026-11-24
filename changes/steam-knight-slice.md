## 2026-11-24

### Steam Knight ally, vertical slice (dev sandbox only)

- With the sandbox flag `&sk=1` and six Victoria operators on the board, 'The Last Steam Knight' (`enemy_1533_stmkgt`) joins the Victoria bond: he drops onto Vina Victoria, blocks, fights at full power from the start (the Boost's speed and attack speed always on, no second phase, no revive) and never damages a friendly operator. Off everywhere else: no room rule, no match, no bot uses it. [src: crew-docs/steam-knight-slice-design.md]
- Every landing starts the pile bunker: a stance, a boost along a straight lane, a shove of the normal enemies at its sides, then one blow on an elite or boss that grows with the distance boosted. His leap is one of his attacks (the Boost's own cooldown, borrowed) and lands at the rear ground tile with the longest clear lane to an elite or boss, then runs the bunker too. [src: official enemy_database enemy_1533_stmkgt skills Boost cooldown 45 initCooldown 25]
- New: `server/sim/content/steamKnight.js` (the kit and the spawn, read from `battle.flags.steamKnight`), the data record and Victoria token (`tools/build-data.mjs`), the extracted model (`tools/local-extract/extract.py ENEMY_SPINES`) and the 24 official `stmkgt` effects (extracted with `--only fx --fx-keys`, 24 prefabs), `render/steamKnightFx.js` (landing, stance, thruster plume, shove and impact looks), the `enemy_1533_stmkgt` clip forms, `Audio.playSteamKnight` (six existing sound files; `e_imp_stmkgt_h2` and `e_atk_stmkgtdie` are in neither local client) and the sandbox panel `public/dev/sandbox-steamknight.js`.
- Official numbers cite their file and field in the code: the 3 hits at 1.25 ATK and 4 SP of Zantetsuken, the Boost's +0.3 move speed and +100 attack speed, the clip lengths of `enm_art_17.ab` (stance 5 s, blow 2.5 s with its strike at 0.7 s, take-off 1.2 s, landing 1.5 s). [src: official enm_art_17.ab enemy_1533_stmkgt.skel animations]
- Start values for the panel, the user's to tune (they have no official source; the panel labels each one "start value, you set it" and keeps it in the URL as `&sk-<name>=`):
  - dash speed 10 tiles/s, [ASSUMED] a 6-tile lane takes 0.6 s [unverified]; user OK 2026-11-24
  - blow damage per tile boosted 0.8 × ATK, [ASSUMED] on top of the official 3.75 × ATK; user OK 2026-11-24
  - side damage 1 × ATK, [ASSUMED] one ordinary hit; user OK 2026-11-24
  - side shove 1.5 tiles, [ASSUMED] clears the lane; user OK 2026-11-24
  - stance after a landing 1.5 s, [ASSUMED] the official 5 s clip played about 3.3 times faster [src: official enm_art_17.ab enemy_1533_stmkgt.skel animations Skill_1_Begin_A]; user OK 2026-11-24
  - wait for an elite or boss in the lane 5 s, [ASSUMED] as long as the official stance clip [src: official enm_art_17.ab enemy_1533_stmkgt.skel animations Skill_1_Begin_A]; user OK 2026-11-24
  - blocks 1 enemy, [ASSUMED] the least "he blocks" can mean (the official record has 0); user OK 2026-11-24

Kind: internal

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s [src: no protocol or server code path reads the flag; the sandbox runs the battle in the page] | 0 / 0 MB/s [src: same] |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s [src: same] | 0 / 0 MB/s [src: same] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 GB/day) [src: same] | 0 / 0 MB/s [src: same] |
| Server CPU | 0 % of one core [src: server/sim/content/steamKnight.js runs only when `flags.steamKnight` is set, in the browser] | 0 % [src: same] |
| Memory | 0 MB [src: same] | 0 MB [src: same] |
| Disk | 0 MB/day [src: nothing writes at run time] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- All numbers above are estimated from the code paths (nothing was measured: no server code runs for the flag).
- Cap: the flag exists only in the dev sandbox page (`public/dev/sandbox.js`); no room, match or bot sets it [src: public/dev/sandbox.js skPanel.cfg()].
- Assets: a sandbox visitor with the flag on loads the model (0.41 MB: skel 284 KB, page 125 KB, atlas 4 KB) and 11 effect files on demand [src: public/assets/local/spine/enemy/enemy_1533_stmkgt]; a player never does.
