# Fork changelog (dev-0.2)

Changes made in this fork ([YuriRestia/Stronghold-Protocol-EN-translation](https://github.com/YuriRestia/Stronghold-Protocol-EN-translation))
on top of the upstream game ([sganggs/Stronghold-Protocol](https://github.com/sganggs/Stronghold-Protocol)). Upstream's
own changes aren't repeated here; each upstream merge links the upstream commit it brought in, and
[CHANGELOG.en.md](CHANGELOG.en.md) covers what that release contains. Newest first.

## 2026-10-13

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
