# Phase 1 findings

Answers to the questions Fish listed in TODO.md (2026-10-09; the list is in git history), investigated 2026-10-09 on branch `bookkeeping-tasks`.

## Update (2026-10-11)

The sections below describe the old `en-translation` code. `main` is now based on `yuri/dev-0.2` (which includes
sganggs/master 0.2.2). What changed, per section:

1. **Tool: still Claude Code, now more strongly.** The sentence "There is no `CLAUDE.md` / `AGENTS.md`" is out of date:
   upstream added both in 0.2.2 (`713a2924`, sganggs, "an entry point for AI coding assistants", GitHub #379).
   `CLAUDE.md` is Claude Code's own convention; it just points to `AGENTS.md`. `tools/i18n/official-en.mjs`, quoted
   as evidence, no longer exists (see 2).
2. **Translations:** refreshed against the 0.2.2 Chinese docs and merged upstream (Yuri #3), then updated by Yuri.
   `tools/i18n/glossary.json` is gone. Terms now come from `public/i18n/en.json` (UI) and `data/i18n/en.json` (game
   texts, `tools/build-i18n.mjs`).
3. **Build and test:**
   - Still builds and runs here. The test suite is bigger: about 5,800 tests (`wip/keyword-popup`: 5797, 5752 pass).
   - `test/static-local-art.test.js` no longer fails: the failure came from the old `en-translation` layer (PR #2 fixed
     it there), and the new base never had that layer.
   - New: `test/ipv6-bind.test.js` fails in this container only, because it has no IPv6. It passes on GitHub.
   - Upstream's own CI is `npm run ci` (tools/ci.mjs: tests, smoke, lint, imports, typecheck); `--only=` and
     `--keep-going` select steps. GitHub Actions now runs on the fork too.
   - Assets are about 550 MB now (Chinese and Japanese voices), not 270 MB.
   - Browser language: `public/js/i18n.js` and `resolveLang()` are gone. The language comes from `ui/lang.js` and
     `shared/i18n.js`. `?lang=zh` in the URL pins Chinese, which the e2e helpers still need (they click "开始").
     The browser suites (`SP_E2E`, `SP_REAL_E2E`, `RENDER_E2E`) have not been re-run on the new base.
4. **Rules ownership: still accurate.** Nothing is downloaded or patched at runtime; every `fetch()` in
   `server/`, `shared/` and `public/js/` still targets the game's own server. Additions and corrections:
   - New generated files: `data/i18n/<lang>.json` (game texts in en, ja, ko, zh-TW) and `data/terms.json` (status
     keyword glossary).
   - New runtime-read files on disk: `logs/announce.json` (operator notices, `scripts/announce.mjs`) and `packs/`
     (content and language packs, `server/packs.js`).
   - The browser can now keep assets in Cache Storage through the asset-preload Service Worker
     (`public/resource-sw.js`). It still fetches from the game's own server only.
   - The table's advice "Edit the JSON directly" now conflicts with an upstream hard rule (AGENTS.md: never hand-edit
     `data/*.json`; change `tools/build-data.mjs` and regenerate). For fork changes, use code or an override layer.

## 1. What tool was this vibe coded with?

**Verdict: almost certainly Claude Code** (high confidence, but circumstantial — nothing in the repo names the tool outright).

Evidence:

- **Upstream ignores `.claude/` from the very first commit.** `01a44cd` ("卫戍协议：盟约 web remake — initial import", sganggs, 2026-09-29) already has `.claude/` in `.gitignore`. When `a1b1b1a` ("Open-source release 0.1.0") added `.dockerignore`, `.claude` was the third line, right after `.git` and `.github`. `docs/WINDOWS.md` also lists `.claude/` among the "local files that may contain secrets" kept out of the Windows bundle. `.claude/` is the per-project directory of Claude Code. No other agent's directory (`.cursor/`, `.codex/`, `.aider*`, `.windsurf/`, `.gemini/`) is ignored anywhere.
- **Scale and speed.** The initial import is a single commit of 408 files and **308,986 inserted lines**. The 0.1.0 public release came 3 days later, after six "Playtest #N fixes" commits whose messages each bundle a dozen unrelated fixes. That output rate isn't realistic by hand.
- **House style typical of Claude-written code.** It has very dense, essay-length header comments in every file (e.g. `server/sim/simdata.js` and `tools/build-data.mjs`), JSDoc on most functions, and `// =====` section banners. Docs cite "DESIGN §14"-style section numbers across files. `docs/research/*` is structured as "official vs inferred" research notes. Commit messages are long run-on summaries joined by commas and colons.
- **The later EN-translation layer is explicitly Claude.** A commit message in the inherited `en-translation` history (by Yuri Restia, the contributor before Fish) says *"EN translation done via claude & referencing https://ak-spa-database.pages.dev"*. `tools/i18n/official-en.mjs` describes its layers as "agent translations < SPA DB 2.1 < official EN game data".
- **Nothing contradicts it.** There is no `CLAUDE.md` / `AGENTS.md` / `.cursorrules` / `copilot-instructions.md` in the tree (these would normally be gitignored or never committed), and there are no `Co-authored-by:` trailers. The upstream author commits as `sganggs@users.noreply.github.com`.

I couldn't check the upstream GitHub repo (issues / discussions) for a direct statement, because `gh` isn't authenticated in this container.

## 2. English translations of the docs

These docs were translated. The originals are untouched and the Chinese stays authoritative (each `.en.md` says so at the top):

| Original | Translation |
|---|---|
| `README.md` | `README.en.md` (replaced the `TODO` stub) |
| `CHANGELOG.md` | `CHANGELOG.en.md` |
| `NOTICE.md` | `NOTICE.en.md` (legal text, translated faithfully) |
| `docs/DEPLOY.md` | `docs/DEPLOY.en.md` |
| `docs/PLAYING.md` | `docs/PLAYING.en.md` |
| `docs/WINDOWS.md` | `docs/WINDOWS.en.md` |

How the translations were done:

- **Terms** follow the official EN client via `public/i18n/en.json`, the zh→en dictionary built from ArknightsGamedata/en. Examples: 盟约 → Alliance, 联防 → Unite, 机变 → Improv, 同盟模拟 → Team Simulation, 目标生命值 → LP, and operator/enemy names such as 荒芜拉普兰德 → Lappland the Decadenza. Where `tools/i18n/glossary.json` disagrees with `en.json`, I used `en.json` because it is the official data. Examples: 独行 → "Solo" rather than "Lone Wolf", and 绝技 → "Elite" rather than "Virtuoso". The "Elite" Alliance name collides with Elite (精锐) Operators, so the text writes it as *the "Elite" Alliance* where it matters.
- **Links** between translated docs point to the `.en.md` siblings. Docs that were already English (DESIGN, SIM, META, DATA, ASSETS, BALANCE, research/) are linked as-is.
- **Not translated**, per scope: DESIGN / SIM / META / DATA / ASSETS / BALANCE / research/*. These are already English prose with Chinese game terms inline.
- **Literal Chinese left on purpose**: the 卫戍协议：盟约 title, the bundle's real filenames `启动游戏.bat` / `README-开箱即用.md` (with glosses), and one 迷彩 (to distinguish two statuses that both map to "Camouflage" in English).

## 3. Can it build and run in this container?

**Yes: it builds and runs fully here, and almost everything is testable.** The container has Node v22.23.1, npm 10.9.8, `/usr/bin/chromium`, python3 and internet access. Nothing was missing; the only setup needed was `npm ci` and the asset download.

| Step | Result |
|---|---|
| `npm ci` (postinstall copies `public/vendor`) | ✅ 116 packages, 9 s |
| `node tools/setup.mjs --check --no-local` | ✅ |
| `node --test` (same as CI) | ⚠️ 3509 tests: **3479 pass, 1 fail, 29 skipped**, ~2.2 min |
| Server smoke test (same as CI): boot, `/healthz`, `/`, `/data/config.json`, `/sim/Battle.js`, `tools/doctor.mjs` | ✅ |
| `node tools/fetch-assets.mjs` (~270 MB of art/audio/fonts into the gitignored `public/assets`, `public/fonts`) | ✅ 4016 files in 130 s. 1 enemy icon failed, so it exits 1 and on purpose keeps `data/assets.json` unchanged. Rerunning retries. The game falls back for that icon |
| `SP_REAL_E2E=1 node --test test/ui/real.e2e.test.js` (real server + real browsers: co-op 2 humans + AI through round 4; solo two rounds → abandon) | ✅ **2/2**, only with Chromium in Chinese (see below) |
| `SP_E2E=1 node --test test/ui/mock.e2e.test.js` (UI against a mock harness) | ⚠️ 10/31. The other 21 are all navigation timeouts (environment, see below) |
| `RENDER_E2E=1 node --test 'test/render/*.browser.test.js'` | ⚠️ 16/33. 9 timeouts, plus animation-timing asserts under software rendering. The 3D board suite skips because it needs local-client art |

**The one unit-test failure is inherited, not caused by this container.** `test/static-local-art.test.js` › "docs and messages say what falls back without the local art… (GitHub issue #42)" expects the Chinese string `未提取：${LOCAL_ART_FALLBACK}（${LOCAL_ART_COPY_HINT}）` in `tools/doctor.mjs`. The `en-translation` commits (Yuri Restia, d533439 / 3f330de) replaced that message with English. Either the test or the doctor message needs updating, which would be a small PR.

**Browser tests need Chromium in Chinese.** Since the zh/en language switch (99af5f9), `public/js/i18n.js` `resolveLang()` follows `navigator.languages`. Headless Chromium reports `en-US`, so the UI renders in English and the e2e suites can't find their Chinese selectors (`button "开始"` etc.). Setting `LANG` / `LANGUAGE` doesn't help. A wrapper works:

```sh
printf '#!/bin/sh\nexec /usr/bin/chromium --lang=zh-CN --accept-lang=zh-CN,zh "$@"\n' > /tmp/chromium-zh && chmod +x /tmp/chromium-zh
export CHROME_PATH=/tmp/chromium-zh
```

A follow-up PR could make the tests pin the language themselves, by setting the saved-language `localStorage` key or passing `--accept-lang` in the launch args.

**Why the remaining browser tests time out.** There is no GPU, so WebGL runs on SwiftShader (`ANGLE … SwiftShader driver`). The mock suite opens `/dev/game-mock.html` with `waitUntil: 'networkidle0'`. With `render=fallback` that page is idle in 0.9 s. With `render=engine` (WebGL), all 299 requests finish within 5 s, none stay pending and the game screen is ready, but Chrome never reports network-idle, so `goto` times out after 30 s. This is an environment and harness issue, not a game bug. Upstream CI never runs these suites (`SP_E2E=0`, `RENDER_E2E=0`), so they have only been run on a machine with a real GPU.

**What you can test here:**
- All game logic: `node --test` (sim, match, content, UI-logic units). This is the main safety net, and it matches CI.
- The server, including headless co-op/solo play end-to-end through real browsers (`real.e2e`, with the zh wrapper).
- Rendering and UI in fallback (non-WebGL) mode, plus screenshots for eyeballing (`test/e2e/out/`).
- Local play: `npm start`, then open the forwarded port 3000 in your own browser on the host. That gets real GPU rendering.

**What you can't test here:**
- Anything needing the local Arknights client: `tools/local-extract`, i.e. the 3D board, some official UI icons and two enemy models. These need a Windows/macOS game install. A server can copy `public/assets/local/` + `data/local-assets.json` from a release bundle of the same version.
- WebGL-engine browser tests that rely on network-idle or tight frame timing. Run those on a machine with a GPU, or fix the harness.

## 4. Which game rules are owned by this repo vs downloaded on the fly?

**Short answer: nothing is downloaded or patched at runtime. Every rule the game uses is in this repo** — either hand-written JS or JSON committed under `data/`. The only network fetches happen in offline developer tools: the data build, the asset download and the i18n build. A running server and its browsers only talk to each other.

### Runtime data flow

- `server/data.js` reads every `data/*.json` once at startup (deep-frozen). `server/match/gamedata.js` layers typed defaults on top.
- The server serves `/data/` → `data/`, `/sim/` → `server/sim/` (`.js` only) and `/shared/` → `shared/` (see the header of `server/index.js`).
- The browser fetches `/data/*.json` (`public/js/data.js`) and imports the battle sim from `/sim/` (`public/js/battle/runner.js`). **The client runs the server's own sim code.** Changing `server/sim/**` changes both sides, so client-side combat and server verification (`SP_VERIFY`) stay consistent.
- I grepped `server/`, `shared/` and `public/js/` for non-localhost URLs and `fetch()` targets. All of them hit the game's own server. None reach an external host.

### Where each kind of rule lives

| Rule category | Source | How to change it |
|---|---|---|
| Operator stats, skills' numbers/blackboards, ranges, modules, tokens | **Generated & committed:** `data/chess.json`, `data/tokens.json` ← `tools/build-data.mjs` from `Kengxxiao/ArknightsGameData` zh_CN `excel/*_table.json` | Edit the JSON directly, or change `build-data.mjs` and regenerate |
| Alliances (bonds), thresholds, effect values | **Generated:** `data/bonds.json`, `data/effects.json` | Same as above |
| Equipment / Arts | **Generated:** `data/items.json` | Same as above |
| Strategies (bands) | **Generated:** `data/bands.json` | Same as above |
| Improv events, card pools, round schedule | **Generated:** `data/choices.json` (official tables + `docs/research/01-core-data.json`) | Same as above |
| Enemies, waves, stages/terrain, factions, leaders | **Generated:** `data/enemies.json`, `waves.json`, `stages.json`, `factions.json`, `bosses.json` | Same as above |
| **Difficulties / modes**: rounds, timers, shop odds, economy, enemy scaling per round, leader HP, bans | **Generated:** `data/config.json` (`modes`, `constants`, `titles`, …) | Edit `config.json` or `build-data.mjs` §config. Defaults if keys are missing: `server/match/gamedata.js` `DEFAULTS` |
| Result-title overrides | **Hand-maintained:** `data/tuning.json` (merged over `config.titles`; the old enemy HP/ATK multiplier knobs were removed and are ignored) | Edit the JSON |
| Research inputs (inferred rules, maps, asset ids) | **Hand-maintained:** `docs/research/*.json`, read by `build-data.mjs` | Edit, then regenerate |
| **Behaviour**: how every skill, talent, trait, alliance effect, item, strategy, enemy ability, boss mechanic and terrain device actually works | **Hand-written code:** `server/sim/content/**` (`kits/`, `bonds/`, `items/`, `bands/`, `garrisons/`, `bosses.js`, `enemies.js`, `devices.js`, …) plus the engine in `server/sim/*.js` | Edit JS |
| Match flow: rounds, shop, economy, Unite, Final Assault, bots | **Hand-written code:** `server/match/*.js` | Edit JS |
| Emotes, asset manifest | **Generated & committed:** `data/emotes.json` (`tools/build-emotes.mjs`), `data/assets.json` (`tools/fetch-assets.mjs`) | Regenerate |
| English text | **Generated & committed:** `public/i18n/en.json` (`tools/i18n/*`, from ArknightsGamedata/en + overrides) | Edit overrides, rebuild |

### Notes for modding (Phase 2)

- `build-data.mjs` downloads the official tables only when they're missing from `.cache/gamedata/` (gitignored), with `--refresh` / `--offline` switches. The output is deterministic. The README says "don't hand-edit `data/*.json`". For a fork that's a style rule, not a technical one: nothing re-downloads or overwrites it at runtime. The real risk is that someone re-runs `build-data` and drops hand edits. **Recommendation:** put fork-specific changes either in code or in a dedicated override layer like `tuning.json`, not in the generated JSON.
- Numbers come from data, but **mechanics come from code**. A new difficulty or lobby modifiers (Appendix A) would touch `data/config.json` `modes` plus `server/match/*`. Alliance Modules would touch `data/bonds.json` / `effects.json` plus `server/sim/content/bonds/*`.
- The game art and audio (`public/assets/**`, `public/fonts/**`) are downloaded once by `tools/fetch-assets.mjs` from community mirrors of the official client and served locally. They're presentation only and contain no rules.

## 5. SPA-CC feasibility (2026-10-15)

ROADMAP "SPA-CC": a Contingency-Contract-style difficulty above Ultimate, made of Risk tags. Each tag below is rated by
effort, given what the code already has after PR B (`wip/custom-lobby`: the rules registry with categories, the
rules dialog, the result labels, rules in every battle spec).

### Groundwork every tag shares (do first)

- **Risk rules in `shared/rules.js`**: a tag sequence (1/2/3 risk) is one `choice` rule (`off` / level 1 / 2 / 3) with
  a risk per option; `ruleLabels` already sums risk and forces it to 0 with cheats. Mutually exclusive sidegrades are
  one choice rule too.
- **Result title**: "Ultimate+5 seeded" — the label code exists; it needs the `+risk` part.
- **Rules dialog**: the current list fits ~10 rules. ~20 tags need the CC grid view ROADMAP describes (risk rows,
  sequences in columns, the combined effects listed below), probably as a "Risk" tab next to today's list. Tag icons
  are an open art question (no CC tag icons in our assets; text tiles would work first).
- **Effort**: about one PR, before or with the first batch of tags.

### Per tag

| Tag | Effort | Notes |
|---|---|---|
| Bench no longer counts for Investor | Easy | Investor is marked "counts the bench" in data (`countsHand`); the rule flips it in the bond count, and the alliance text needs a variant. |
| Swift 20 + 0.35 × stacks → 20 + 0.25 × stacks | Easy | Exactly the data's numbers (`base_prob` 0.2, `prob_per_stack` 0.0035): one override in battle, plus the text. |
| Foresight operators −20 ASPD | Easy | A passive buff on every Foresight member at battle start (active alliance or not — to confirm). |
| Strategies naming a round trigger 1 round later | Medium | ~15 Strategies name rounds (Justin 1/4/7/10, Jessica 4/7/10/13, Fang 8/10/12/14, Quintus 3, Yu 8, Orchid 10, Lee 1–3, Pith / Dusk / Muelsyse 1, Harold from 4, Duck Lord from 5, Damazti every 5 …). Each is coded separately, so it's one change per Strategy, plus texts. Open: Fang's 14 → 15 is the Hidden Core round (not always played); Lee's "held on 1 and 2, released on 3" → 2/3 → 4? |
| From round 3, the first tier-1 operator bought each round costs +1 | Easy | The shop has a price hook (`onPrice`, as Sciurus's "first Kjerag operator costs 1"). |
| Shop upgrade 4→5 +2 Funds (2: also 5→6, +3) | Easy | Upgrade prices are data (`upgradePrices` 5/8/11/12/13 → the 4→5 step is 12): a per-match override. |
| Auto-recovery skills −0.2/0.5/0.8 SP/s | Easy | `spRecoveryFlat` exists and affects only time-based SP: a passive buff on every operator. |
| Final boss +50/150/400 % max HP, +15/25/50 % ATK | Easy–Medium | The shared boss pool's size is computed on the server (`bossPoolHp`); ATK through the boss spawns' stat mods. Applies to the Hidden Core boss too. |
| Leaders 50/90 % Physical and Arts DR unless under an elemental burst | Easy–Medium | A damage hook on leader units; the burst state is on the unit already (`burstLock`). To confirm: "leaders" = the bounty leaders of the regular rounds and the final / hidden bosses? |
| Final boss +50 RES after 50 % max HP taken as Arts (+5000 DEF after 50 % Physical) | Hard | The boss's HP is a pool shared by every player's field; each browser runs its own field and only reports damage totals. Counting damage **by type** across fields needs new reports, and the server must decide the threshold and broadcast it (with the pool updates, `b.pool`). |
| Final boss invulnerable 10 s every 68/28/18 % lost | Hard | Same reason: the threshold is pool-wide, so the server detects it and broadcasts "invulnerable for 10 s"; each field applies it on its own clock (fields are already only kept plausible, not re-simulated). |
| Round 9 Improv always offers Deathless Black Snake (0 Funds); skipping → boss +200 % HP (2: also Patriot and FrostNova; +100 % ATK) | Very hard as written | Improv offers enemy cards with bounties ("bounty drafts"), so a forced card fits. But Deathless Black Snake, Patriot and FrostNova are not in this mode: each needs its data built in, its art downloaded and a hand-written kit (multi-phase story bosses). **Easy–Medium with substitutes** from the 29 leaders this mode already has. |
| Rounds 10–13: the player with the fewest stacks gets 5 Famiglia Shadow Silencers | Easy–Medium | The enemy is in the data with a kit. Adding units to one player's wave has precedent (the bounty cards). Tie-break to decide. |
| (2) Blood Debt and Asset Liquidations always on | Hard | Both are event mechanics the sim never modelled (the code lists them as "no counterpart in this mode"): they'd need a spec and a new implementation. |
| Final round: Rosmontis, Simulated Sentry joins (need not be killed) | Very hard as written | Not in this mode (a Contingency Contract boss with drones): data, art and a kit. Substitute possible. |
| (2) "Matrix" gives no buffs; boss can't die while the Sentry lives | Unknown | No "Matrix" exists in our texts, data or code — which mechanic is it? The "cannot die while X lives" part is easy (several leaders link HP or immortality already). |

### Suggested order

1. Groundwork (risk rules, grid view, "+risk" title).
2. The easy batch, about 9 tags: Investor, Swift, Foresight, tier-1 price, shop upgrades, SP recovery, boss
   HP/ATK, leader DR, Silencers. This gives enough risk to try "Ultimate+10".
3. Strategies one round later.
4. The pool-wide boss tags (Arts/Physical thresholds, invulnerability): one shared server mechanism.
5. Enemy tags: substitutes first; real new enemies only if worth a kit each.

### Questions for Fish

1. Substitutes for Deathless Black Snake / Patriot / FrostNova / Rosmontis, Simulated Sentry from the leaders this mode
   has? (List on request.)
2. What is "Matrix"?
3. Foresight −20 ASPD: every Foresight operator, or only while Foresight is active?
4. "Leader enemies": the bounty leaders in regular rounds, the final / hidden bosses, or both?
5. Strategy round shifts: Fang's round 14 → 15 (Hidden Core only), and Lee's held Funds.
6. Silencers: tie-break when several players share the fewest stacks (all of them? random?).
7. Blood Debt / Asset Liquidations: the intended mechanics, since the sim has neither.

### Fish's answers (2026-10-15)

1. Keep the chosen bosses (related, uniquely challenging). This mode has 249 enemies, 29 of them leaders with kits —
   mostly ones that already appear as bounties, so not hard enough. The four are in the full game data
   (`enemy_1515_bsnake`, `enemy_1506_patrt`, `enemy_1505_frstar` / `_1510_frstar2`, `enemy_8007_eltrsm`): each needs its
   data built into the mode, its art in the download list and a kit. Suggestion: one as a pilot to measure the cost.
2. "Matrix" = what that Rosmontis (a different event's version) spawns when her sub-entity dies; it buffs her allies.
   Part of her kit.
3. Foresight −20 ASPD: every Foresight operator, even when Foresight is not active.
4. "Leaders" as worded: the final / hidden bosses and the leader-class bounty enemies.
5. Strategy shifts: yes, Fang 14 → 15 (Hidden Core) and Lee's held Funds 2 / 3 → released on 4.
6. Silencers: one player, ties to the earliest seat (p1 before p2).
7. Blood Debt / Asset Liquidation are stage mechanics of their Siracusa event, not of the enemies: a Blood Debt gauge
   fills as enemies fall (Zaaro's lines add to it), and 清算时刻 (Asset Liquidation) follows from it. The level files
   that define them are not in our data. What the enemy data does hold: the Silencers' buffs while it is on (+50 ASPD,
   +15 % ATK, +15 % DEF, up to 5 stacks); in this mode only the two Silencers react to it (5 enemies do in the whole
   game). This mode's Silencer kit is stealth only. A custom version needs: when the gauge fills, what Asset
   Liquidation does, how long it lasts, and how the Silencers' 5 stacks build.

## 6. Our gameplay changes as plugins (#52, 2026-10-27)

Yuri's proposal (Yuri issue #13, 2026-10-21): if the Custom Lobby Modifications and SPA-CC can be made into plugins under
upstream's 0.3.x plugin system, Yuri would merge them and host them on weishuxieyi.icu. Read against sganggs `dev` (0.3.3
plus fixes): docs/PLUGINS.md §10–§13, docs/PLUGIN-API.md, docs/META.md §2.

**Verdict: feasible for most of it.** Nearly every rule fits one of upstream's plugin parts, and the battle half of
SPA-CC (`server/sim/content/risk.js`) is already written the way a script plugin is: `battle.on(…)` hooks and passive
buffs, keyed off the rules. Six pieces need a small engine change in upstream, or are lost (below). The result labels
are the biggest loss.

### What upstream's plugin system offers

| Part | Code? | What it can do | Server needs |
|---|---|---|---|
| Data patches (`content`) | no | change any number in `data/*.json` (`set` / `merge` / `append` …), add records: operators, enemies, items, bonds, modes. A value can come from a plugin setting (`{ "$setting": … }`) | nothing: on by default |
| Rule switches | no | four fixed switches only (`shopBias`, `prepLoadout`, `morphPairing`, `unequip`); not extensible | nothing |
| DSL | no | JSON skills, talents and small prep effects (funds, layers, grant an item), with conditions | nothing |
| Offers | no | "pick one of N cards" windows at round start: funds, layers, an item or an operator | nothing |
| Script: meta (`sp.meta.register`) | yes | the prep-side hooks of META §2: `onIncome`, `onPrice`, `onRoundStart`, `onSold`, `onBattleStart` (edit the battle input and the spawns), `onBattleResult` … | `SP_PLUGIN_SCRIPTS=sandbox` |
| Script: battle (`sp.content.register({ install })`) | yes | per-battle `battle.on(…)` hooks, `sp.kit.statBuff`, new enemy kits, replacing an official kit (`overrides`) | same |
| Cosmetic | no | art, models, audio, for records the installation already has the files of | nothing |
| Interface (`ui`) | sandboxed iframe | a read-only panel; can't change the match | nothing |

- **Settings:** a plugin may declare up to 32 settings, each a `boolean`, an `integer` (min/max) or an `enum`. The room's
  host sets them in the room's 插件 panel (`room.setPlugins { plugins: [{ id, settings }] }`), and they are part of the
  content hash. A Risk tag with levels 0–3 is one integer setting, so our rules map onto settings almost one to one.
- **Marks:** every plugin room is marked 非官方 (unofficial) in the room, briefing, HUD and result, and kept out of the
  statistics overview. This fits our categories in spirit, but replaces them (see the losses).
- **Scripts are off by default.** A server runs them only with `SP_PLUGIN_SCRIPTS=sandbox` (SES compartments, a browser
  Worker, a child process on the server). Without it, only the data / DSL / offers parts work. Yuri's site would need
  sandbox mode on. Upstream marks the script API **experimental** (it may change within 0.3.x).
- Per-battle state goes in `unit.mem` or a WeakMap; randomness comes from `battle.rng`; a callback budget of 8000 per
  battle per plugin. risk.js already keeps to these.

### Rule by rule

| Our rule | Plugin part | Notes |
|---|---|---|
| +2 Funds | data or DSL | `economy.income` patch, or a prep-DSL funds grant each round |
| Untimed | data | the modes' `prepTime` and `config.timers` (the training mode already uses 999) |
| +2 Deployment Limit, double LP, one operator per tier, Booster Pack, Equipment Booster Pack | meta script (+ data for the two packs' item records) | `onBattleStart` / `onRoundStart` grants. The packs' sprites go in a cosmetic part, if the art is in the installation |
| Laterano Mod B, Victoria Mod C | meta script (and battle script where the effect is in battle) | `bond:` handlers; plus the alliance texts through the plugin's `i18n` |
| Virtuosa in Swift and Support, Blaze replaces Catherine | data | chess `bonds` patches; Blaze's record swap. To check: whether the shop-slot replacement fits `set` on the chess record |
| Chosen map | partly | not a room option upstream. A mode per stage (a mode with a fixed stage) would do it, but clutters the mode list |
| Chosen bans | partly | modes have `inactiveBondIds`; a fixed ban set per mode works, a host-picked set doesn't (32 settings can't hold one switch per alliance) |
| Investor bench, Strategies one round later, tier-1 price, shop upgrade prices, Last Line | meta script | `onPrice`, `onLevelUp`, counters, `onBattleResult`. The Strategy delays touch ~15 band handlers: the plugin would wrap or replace their `band:` keys |
| Swift 0.25 | data | one bond number |
| Foresight −20 ASPD, SP recovery, leader DR, boss ATK, Deep Infiltration, Low Efficiency, Toxic Waste's ATK, Vengeance, Famiglia's ledger | battle script | already the shape of risk.js. The engine fields they use (`spRecoveryFlat`, `redeployMul`, `dpPerSec`, `burstLock`, `enemyScale`, `lpr`) all exist upstream |
| Final boss HP | meta script | the pool size: `config.bossHpScale` patch, or `onBattleStart` |
| Toxic Waste (the item) | data + meta script | a new item record; its "can't be replaced" rules need `item:` handlers |

### What doesn't fit (needs upstream engine changes, or is lost)

1. **The result labels.** "WITH CHEATS", "seeded" and "Ultimate+5" are drawn by core screens. A plugin room shows
   非官方 and the plugin list instead. An interface plugin could show the Risk total in a side panel, not on the result
   title. To keep them, upstream would need a small "plugin-supplied result label" API.
2. **The rules dialog and its Risk grid.** Plugin settings show as generic controls in the 插件 panel. Usable, but not
   the CC-style grid.
3. **The shared boss pool's tags** (Originium Zone Arts / Physical, Lockout, Delegation United 2). These need the server
   to hold and broadcast pool-wide state (`sharedBoss.setHold`, server/sim/bossRisk.js), which only exists on our fork.
   It would be an upstream PR first: a generic "pool threshold" hook that plugins can use.
4. **Patriot** (Undying). His record and stats come from our `tools/build-data.mjs` (`FORK_ENEMY_KEYS`), and his model
   from our manifest entry. A plugin can add the enemy record and its kit (`sp.enemies.register`), but not his art
   unless the installation already has it. His `moveFloor` mod is fork-only too.
5. **Delegation United 3.** Its gate lives inside the official Degenbrecher kit (enemies/leaders.js). A plugin can only
   replace that kit whole (`overrides`), which means copying upstream's kit and re-copying it after every upstream
   change.
6. **The fork's engine fixes are not gameplay mods**: shift physics and block shifting (#67), the match records, the
   Windows zip fallback. They stay as code, and are better offered upstream as ordinary PRs.

### Suggested split

- **`fish-cheats`**: the seven cheats; data + meta script.
- **`fish-alliances`**: Alliance Modules and the rebalanced alliances; data + meta script. No Risk, so it could even be
  offered without the "cheat" framing.
- **`spa-cc`**: the Risk tags; meta + battle script, needs sandbox mode. Patriot, the pool tags and United 3 stay out
  until upstream has the hooks for them.
- Seeded map and bans: drop, or propose upstream as a room option.

### Cost and benefit

- **Benefit:** the fork's gameplay diff against upstream (about 2,000 added lines across `shared/rules.js`, `ruleData.js`,
  `risk.js`, `bossRisk.js`, `lobbyRules.js`, the match and kit hooks) would mostly move into `plugins/`, which syncs never touch.
  Yuri would host it, so players on weishuxieyi.icu get it.
- **Cost:** a rewrite against an experimental API, roughly one PR per plugin. It's best built on 0.3.3 (our main is on 0.3.1 until
  the next sync), the version Yuri's site will run. We'd lose the labels and the Risk grid, unless upstream
  adds hooks. Settings ≤ 32 per plugin is enough for each of the three.
- **Not verified yet:** that each hook does what its docs say for our cases (e.g. writing the deploy limit in
  `onBattleStart`, `onLevelUp`'s price, the plugin settings panel at 20+ settings). A pilot would settle it.

**Suggested next step:** a pilot plugin with three tags, one of each kind: Swift 0.25 (data), the tier-1 price (meta
script), and Deep Infiltration (battle script). Built against 0.3.3 with `node tools/plugin.mjs new / check / test`,
it shows how much of the rest is mechanical.
