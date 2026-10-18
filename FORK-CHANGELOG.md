# Fork changelog (dev-0.2)

Changes made in this fork ([YuriRestia/Stronghold-Protocol-EN-translation](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation))
on top of the upstream game ([sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)). Upstream's
own changes aren't repeated here; each upstream merge links the upstream commit it brought in, and
[CHANGELOG.en.md](CHANGELOG.en.md) covers what that release contains. Newest first.

## 2026-10-18

### Upstream merge

- Merged upstream 0.3.1 at [`d905c146`](https://github.com/sganggs/Stronghold-Protocol/commit/d905c1464f762a03d236c7ad6bc3ba31a74f4494) (`TBD`).
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
- The service worker no longer fetches the preload manifest for a player who never preloaded (no preload cache).

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

- ESLint skips the local `ArknightsGamedata/` and `stronghold-protocol-alliance-database-main/` clones (their own
  configs broke `npm run lint`); the asset-index test links its folder with a junction, so it runs on Windows without
  symlink rights.
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
  next to the old one, behind a small router (`scripts/router.mjs`) that Caddy talks to. New visitors go to the new
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
- Fixed: the About panel read "Running HEAD @ …" since generations, because each release worktree is detached.
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
- The three performance benchmarks moved out of `npm test` into `npm run test:perf`.

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
