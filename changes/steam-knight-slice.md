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
  - wait for an elite or boss in the lane 5 s, [ASSUMED] as long as the official stance clip [src: official enm_art_17.ab enemy_1533_stmkgt.skel animations Skill_1_Begin_A]; user OK 2026-11-24
  - blocks 1 enemy, [ASSUMED] the least "he blocks" can mean (the official record has 0); user OK 2026-11-24
- Round 2 (the user's review): every normal attack of his plays his mode's combat rows, so the laser on his weapon shows on every swing (`wiring.js` option `alwaysCombat`); his sounds play as bank sounds at one gain, the two spine-event banks in his own mixer group, so the laser is no longer quieter than the rest; the Zantetsuken loops follow their official events (start loops at the cast, start_03 and the weapon glow at the strike, all off at its end) and the Zantetsuken has no camera shake; a leap lands on the free tile nearest the ally blue box (a ground route's end) with a clear lane; he walks only to a standing enemy and steps into contact to block one that passes within reach; a stun cuts the stance, boost or Zantetsuken; the dash ends when its target hides or leaves his line; the effects are cleared between battles and when he dies; a cleared panel field is left out (that part off). Dev page `public/dev/clip-viewer.html` shows every Spine clip of a model.

Kind: internal

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s while playing [src: no protocol or server code path reads the flag]; one download of 1.06 MB only if the host's art pack lists the new files (below) [src: measured, files under public/assets/local] | the same 1.06 MB once, then cached [src: measured] |
| Bandwidth out / in, per room (4 players) | 4.25 MB once [src: 4 × 1.06 MB, estimated] | 4.25 MB once [src: same] |
| Bandwidth out / in, 300 players | 319 MB once (0.32 GB, 0 GB/day after) [src: 300 × 1.06 MB, estimated] | 319 MB once, all new [src: same] |
| Server CPU | 0 % of one core [src: server/sim/content/steamKnight.js runs only when `flags.steamKnight` is set, in the browser] | 0 % [src: same] |
| Memory | 0 MB [src: same] | 0 MB [src: same] |
| Disk | 0 MB/day [src: nothing writes at run time] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Measured with ls / stat on this checkout (the traffic meter was not used: nothing new goes over the socket). The change adds 39 files, 1.06 MB, and no audio. [src: measured, public/assets/local/spine/enemy/enemy_1533_stmkgt, public/assets/local/fx/prefabs]
  - The model: 3 files, 0.41 MB (skel 284 KB, page 125 KB, atlas 4 KB). [src: measured, public/assets/local/spine/enemy/enemy_1533_stmkgt]
  - The effects: 24 prefab files, 0.59 MB, and 12 new texture files, 0.05 MB (the other 36 textures were in the pack already). [src: measured, public/assets/local/fx]
  - `data/assets.json` grew by 4.3 KB on 3.95 MB (+0.11 %) and its `files` count did not change (a `spineLocal` entry is not counted). [src: measured, git diff dev-0.2 data/assets.json]
- Who downloads them: nobody through gameplay, because only the dev sandbox page asks for the files, on demand. They reach a player's preload only if the host's art pack lists them (a local-client model is listed by `data/local-assets.json`, the effects by `data/local-fx.json`: both are written on the machine that extracted them; `tools/package.mjs FULL_ZIP_FX` ships the effects in the full zip). A cheaper design is to leave the knight's model and the stmkgt effects out of those two lists on the production host, so no player downloads them. [src: server/http/assetViews.js, tools/package.mjs FULL_ZIP_FX]
- Cap: the flag exists only in the dev sandbox page (`public/dev/sandbox.js`); no room, match or bot sets it [src: public/dev/sandbox.js skPanel.cfg()].
