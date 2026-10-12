# Phase 1 findings

Answers to the items in [TODO.md](TODO.md), investigated 2026-10-09 on branch `bookkeeping-tasks`.

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
