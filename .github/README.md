# 卫戍协议：盟约 · Stronghold Protocol: Alliance

> English translation of [README.md](../README.md). The Chinese original is the authoritative version.

An **unofficial fan remake** of *Stronghold Protocol: Alliance*, the seasonal auto-chess tower-defense mode of *Arknights*: play instantly in the browser, solo or 1–4 player online co-op.

![version](https://img.shields.io/badge/version-0.2.4-2ea44f)
![license](https://img.shields.io/badge/code%20license-GPL--3.0--or--later-blue)
![node](https://img.shields.io/badge/node-22%20%7C%2024-339933)

## Disclaimer

> [!IMPORTANT]
> - This project is an **unofficial fan work** made by players. It has **no relationship whatsoever** with Shanghai Hypergryph Network Technology Co., Ltd. (Hypergryph), Yostar or their affiliates, and is not authorized or endorsed by them.
> - The names, characters, art, music, sound effects, text, data and other material related to *Arknights* and *Stronghold Protocol* are copyright of their respective owners. This material is **not** covered by this project's GPL-3.0 license; the GPL covers only the code written by this project.
> - For study, discussion and personal non-commercial use only. **Any form of profit is strictly prohibited**, including but not limited to: selling this project or its bundles, paid downloads or paid distribution, paid servers or paid hosting-for-hire, ads / tips / memberships or any other monetization, and any other commercial use.
> - The source repository does not contain the game's art or audio (only data generated from the official data tables and a few game screenshots, which are likewise not covered by the GPL). The full bundles in [Releases](../../../releases/latest) include the assets for players' convenience (the lite bundles do not; they download them from public mirrors on first start); downloading one means you agree to this disclaimer. Do not use the assets for anything other than this project, and do not redistribute them separately. The full terms are in [NOTICE.en.md](../NOTICE.en.md).
> - If a rights holder believes this project infringes their rights, please contact us through an Issue and we will **remove the content immediately**.
> - This project is provided "as is", **without any warranty**; use it at your own risk.

| Alliance room | Strategy draft | Rest Phase (shop / Alliances) |
|---|---|---|
| ![Room](../docs/img/room.jpg) | ![Strategy](../docs/img/band-draft.jpg) | ![Rest Phase](../docs/img/prep.jpg) |
| **Deployment direction wheel** | **Battle** | **Final Assault** |
| ![Direction](../docs/img/facing-wheel.jpg) | ![Battle](../docs/img/combat.jpg) | ![Final Assault](../docs/img/final-assault.jpg) |

## Contents

- [Disclaimer](#disclaimer) · [Introduction](#introduction) · [Features](#features)
- [Quick start](#quick-start): [All-in-one bundle](#option-1-all-in-one-bundle-recommended) · [Run from source](#option-2-run-from-source) · [System requirements](#system-requirements) · [Ports and configuration](#ports-and-configuration) · [LAN play](#playing-with-friends-lan)
- [Online play](#online-play) · [Controls](#controls) · [Documentation](#documentation) · [Development and testing](#development-and-testing) · [Project structure](#project-structure)
- [License](#license) · [Credits and data sources](#credits-and-data-sources) · [Contributing](#contributing)

## Introduction

*Stronghold Protocol: Alliance* is auto-chess + tower defense: during the Rest Phase you recruit Operators at the Dispatch Center, arrange your formation and assign Equipment; during the Battle Phase your Operators deploy automatically and hold off the enemies pouring out of the red gates, and every enemy that gets through costs you LP. This project recreates the mode in the browser, with rules and numbers checked as closely as possible against the official data tables and PRTS.

- **Solo Simulation** (single player) and **Team Simulation** (1–4 player **co-op**, no PvP; empty seats can be filled with AI teammates).
- The server is a single Node.js program. **Combat is simulated in each player's browser** (just like the official game); the server only handles the economy and rounds, so a low-power mini PC can host.
- Current version 0.2.4: the shared card pool and equipment stock are completed per the official rules; the rules for Raid revive targeting, Clementia, Skadi the Corrupting Heart and Durable are corrected; Raid can jump to an empty half in online Leader battles; and the issues reported by players and on GitHub after the 0.2.3 release are fixed — see [CHANGELOG.en.md](../CHANGELOG.en.md). A few rules are still implemented by inference — please report anything that differs from the official game in an Issue.

## Features

- **A complete match**: Confirm Match Info → Strategy draft (40 Strategies) → 14 rounds → result titles; on Perilous and above, meeting the conditions unlocks round 15, the "Hidden Core".
- **4 difficulties**: Standard / Perilous / Dire / Ultimate, each with its own parameter set for Solo and Team, all taken from official data.
- **Rest Phase**: Recruit, Refresh, Freeze and upgrade the Dispatch Center; Bench and Temporary Bench; drag from the Bench onto the board to deploy, and choose a facing with the **direction wheel**. Team Simulation shares one recruit pool.
- **Elite promotion**: 3 copies of the same Operator automatically merge into an Elite Operator, and grant one free recruit of the next tier up.
- **Operators and loadouts**: 112 recruitable Operators (+ Elites) with their skills, talents and traits; before the match you can choose which skill each Operator carries (all 283 skills implemented by hand) and the Module for Elites.
- **Alliances and Stacks**: 23 Alliances (8 faction Core Alliances + Add-on Alliances); Stacks persist for the whole match, up to 999 Stacks per Alliance.
- **Equipment and Improv**: Equipment and Arts; same-name Equipment merges, and certain combinations grant Alliance effects; Equipment that has been assigned is locked to its Operator. Some rounds start with an Improv card pick (Equipment, Funds, Operators, Stacks, Bounties, etc.).
- **Auto-battle**: skills fire according to the official "skill strategy" rules; blocking is by contact radius, and when a blocker falls a touching Operator takes over; Elemental Damage and elemental bursts; summons are placed by hand; push / pull is computed from force and weight; knocked-out Operators stay in place showing a redeploy countdown.
- **Terrain and enemies**: Barricades, Ranged Tiles, Originium-flow blowers, swamps, exhaust grilles, rising tides and other terrain devices; aerial and low-hover enemies, Bounty enemies.
- **Unite**: when someone leaks enemies and a teammate has a perfect battle, the teammate with the perfect battle brings their formation to help intercept the leaked enemies.
- **Final Assault and Hidden Core**: two players share one battlefield and the whole team whittles down a single Leader HP bar; 10 Enemy Leaders, huge Leaders with a hit area of about 5×3 tiles, and the official damage-cap rules.
- **Result titles**: 6 titles such as Stronghold Star, Steadfast Alliance and Rock-Solid Defense.
- **Reconnect**: in Team Simulation, reopen the page within 10 minutes of a disconnect to return to your seat — while you are away your formation fights automatically, or you can "Step Away" and hand over to AI Autopilot; a Solo Simulation can be resumed within 24 hours (same browser).
- **Interaction details**: the LP in the top bar drops live as enemies leak (settled at the end of the round); selecting, drag-and-drop and assigning Equipment all work by board tile; buying, upgrading and Improv card picks all need two taps to confirm; with only one player, nothing is timed except battles.
- **Visuals and sound**: real Spine chibis, official BGM and sound effects, emotes (6 sets × 6), battle effects; optional official 3D board (requires textures extracted from a local game client).
- **Phone and PC**: touch drag, long-press for details, landscape recommended; graphics quality can be lowered in Settings.

## Quick start

### Option 1: All-in-one bundle (recommended)

[Releases](../../../releases/latest) offers two bundles with exactly the same code and runtime dependencies; pick one. If you already have 0.2.x installed, you only need the update bundle to upgrade:

- **Full bundle** `Stronghold-Protocol-v<version>.zip` (about 505 MB, about 710 MB unzipped): includes all art / audio (including both the Chinese and Japanese Operator voices and the official 3D board textures). Unzip it and play — nothing else to download. **Recommended.**
- **Lite bundle** `Stronghold-Protocol-v<version>-lite.zip` (about 22 MB): no assets; on first start it automatically downloads the art, Spine models, audio, fonts, emotes and the "How to Play" tutorial images from public mirrors (about 550 MB; can be interrupted, and the next start resumes). Local-client assets such as the official 3D board are not included (see "Local-client assets" below). Useful when downloading large files is inconvenient.
- **Update bundle** `Stronghold-Protocol-v<version>-update.zip` (available from 0.2.1; its size depends on how much changed, usually only a few MB): contains only the files changed since the earlier 0.2.x versions, to upgrade an existing 0.2.x install (installed from the full or the lite bundle) to the new version without downloading the whole bundle again. How to use it: first stop the server (close the window; if you installed start on boot, run `scripts\install-service-windows.ps1 -Stop`), then merge the entire contents of the `Stronghold-Protocol` folder in the zip into your install folder, overwriting files with the same name (copy and paste in Windows Explorer works; on macOS do not drag and drop in Finder, which replaces the whole folder — use `unzip -o`, see section 1.5 of [docs/DEPLOY.en.md](../docs/DEPLOY.en.md)), and then start it as usual. On start it first verifies all program files and deletes old files the new version no longer uses, then runs normally; if the folder is not the version the update bundle is for (e.g. 0.1.x, or program files have been modified), it tells you to download the full bundle and the server does not start. For a fresh install use the full or the lite bundle.

Both bundles contain only the files needed to run and deploy (server, client, data, start scripts, the setup / doctor / asset download tools, licenses and notices, [docs/PLAYING.md](../docs/PLAYING.md) and [docs/DEPLOY.md](../docs/DEPLOY.md)); tests, development tools and design docs are only in the source repository.

1. **Install Node.js 22 or 24 (LTS)**
   - Windows: run `winget install OpenJS.NodeJS.LTS` in PowerShell, or download the installer from <https://nodejs.org/en/download>.
   - macOS: `brew install node@22`, or download the installer from the official site.
   - Linux: your distribution's package manager, nvm or fnm.
2. **Download**: download the latest full bundle (or lite bundle) from the [Releases](../../../releases/latest) page and unzip it into a folder with a short path (on Windows, preferably not inside a OneDrive-synced folder).
3. **Start**
   - Windows: double-click **`scripts\start-windows.bat`**. If a "Security Warning" pops up, click "Run"; if the Windows Firewall prompt appears, tick "Private networks" and allow it.
   - macOS / Linux: run `./scripts/start.sh` (or `bash scripts/start.sh`) inside the unzipped folder.
4. The browser opens `http://localhost:3000` automatically. The LAN addresses listed in the window can be sent straight to friends on the same network. Close the window (or press `Ctrl+C`) to stop the server.

### Option 2: Run from source

```bash
git clone https://github.com/sganggs/Stronghold-Protocol.git
cd Stronghold-Protocol
npm install        # install dependencies (postinstall copies pixi / preact / three into public/vendor)
npm run setup      # check the environment and download ~550 MB of art / audio from public mirrors (can be interrupted; re-running resumes)
npm start          # start the server: http://localhost:3000
```

You can also run the start script directly (Windows `scripts\start-windows.bat`, macOS / Linux `scripts/start.sh`): on first run it installs dependencies and downloads the assets automatically, then starts the server and opens the browser.

- **Local-client assets (optional)**: the official 3D board, some official UI icons (the frames of the Chat button and emote panel, Module type icons, etc.) and the official models of the Blazing / Pyric Originium Slugs and 39 summons (most of them Custom Squad summons) must be extracted from a local *Arknights* PC client (the native Windows client, or CrossOver / PlayCover on macOS). When `npm run setup` detects a client it asks whether to extract (requires Python 3.8+; dependencies are installed into the project's own `.venv-extract` and do not touch the system). Afterwards you can re-extract with `node tools/setup.mjs --local`, or point at a path with `--game "<…/StreamingAssets/AB/Windows>"`. Without a client the game runs normally and these few things use substitutes: a 2D board, similar-looking icons, recolored regular Originium Slugs, and summon avatars. The emotes and the "How to Play" tutorial images are downloaded from public mirrors together with the assets above and do not need a client. A server without a client (e.g. a Linux VPS) can also copy `public/assets/local/` and `data/local-assets.json` from the bundle (the full bundle; the lite one does not have them) of **the same version**; see "Local-client assets" in [docs/DEPLOY.en.md](../docs/DEPLOY.en.md).
- Asset downloads try GitHub first and automatically fall back to the jsDelivr mirror on failure.
- `npm run doctor` (i.e. `node tools/doctor.mjs`) diagnoses things at any time: Node version, asset completeness, port usage, LAN addresses and the firewall.

### System requirements

| Item | Requirement |
|---|---|
| Host computer | Windows / macOS / Linux, Node.js 22 or 24 (LTS); about 700–850 MB of disk (assets, dependencies and the locally extracted textures: the full bundle is about 710 MB unzipped); about 100 MB of free memory, plus a few MB per match |
| Players | A modern browser with WebGL (latest Chrome / Edge / Firefox / Safari), on PC, phone or tablet (landscape) |
| Network | On first entering the game each player downloads a few dozen MB of assets from the host (browser-cached afterwards); traffic during a match is very small |

On weak GPUs you can lower the graphics quality in "Settings", or add `?board=2d` (force the 2D board) / `?render=fallback` (simplified non-WebGL rendering) to the URL.

### Ports and configuration

Listens on **TCP 3000** by default. To change the port: add `--port 3001` to the start script, or set the `PORT` environment variable.

| Environment variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Listen port |
| `HOST` | `::` | Listen address. The default `::` is dual-stack: the same port accepts both IPv6 and IPv4; `0.0.0.0` = IPv4 only; `127.0.0.1` = local machine only, use it behind a reverse proxy |
| `SP_COMBAT` | `client` | `client`: each player's browser simulates its own battle (very low server load); `server`: the server simulates and streams it |
| `SP_VERIFY` | `off` | Server re-simulates the battle results reported by clients: `off` / `sample` (spot-check about 1 in 8) / `all` (re-simulate everything, more CPU) |
| `TRUST_PROXY` | `auto` | Whether to trust forwarding headers such as `X-Forwarded-For`: `auto` trusts only proxies on the local machine / private network; `1` always; `0` never |
| `DEBUG` | empty | Set to any value for verbose logs |
| `SP_NO_BROWSER` | empty | Set to `1` so the start script does not open the browser |
| `SP_BOT_EMOTES` | empty | AI teammates' in-match emote reactions (instant `m.emote` broadcasts on battle, Rest Phase, merges, Joint Defense and gifts); set to `0` to turn them off entirely |

How to set them: macOS / Linux `PORT=8080 npm start`; PowerShell `$env:PORT=8080; npm start`; cmd `set "PORT=8080" && npm start`. Health check: `GET /healthz`.

### Playing with friends (LAN)

1. Open the page → enter a nickname → **Team Simulation** → create a room. The host chooses the difficulty and can add / remove AI teammates; before starting, the host can also remove other Doctors from the room (they can rejoin with the key).
2. Send friends the 4-letter **Alliance Key**, or the `http://<address>:3000/?room=KEY` link from "Copy Link".
3. Once everyone has clicked "Ready", the host starts.
4. Friends on the same Wi-Fi / router just open the address listed in the start window (like `http://192.168.x.x:3000`). If it won't open it is most likely the firewall: on first start on Windows allow "Private networks" in the prompt, or run `npm run doctor` for the exact commands; guest Wi-Fi often has "AP isolation" enabled, which also blocks connections.

After a page refresh or disconnect, reopen the page within 10 minutes (Team Simulation) or 24 hours (Solo Simulation) to return to your seat. The server keeps rooms and matches in memory, so **restarting the server ends every match**.

## Online play

When your friends are not on the same LAN, here are a few common approaches — pick whichever suits you. This is only a brief overview; the tools and services mentioned are just examples, this project has no relationship with them and does not endorse them. Refer to each one's official documentation for installation, pricing and terms of use. Deployment details (firewall, start on boot, reverse proxy and HTTPS, Docker) are in **[docs/DEPLOY.en.md](../docs/DEPLOY.en.md)**.

| Approach | How | Good for |
|---|---|---|
| **Direct LAN connection** | Send friends the LAN address from the start window | Same home, dorm or internet café |
| **Mesh VPN tool (virtual LAN)** | e.g. Tailscale, ZeroTier, EasyTier, Oray PGY: the host and friends all install the same tool and join the same network; friends open `http://<virtual IP>:3000` using the host's virtual IP | A fixed group of acquaintances; nothing exposed to the public internet. Friends need to install a client too, some tools require an account, and across regions traffic may go through a relay and be slower |
| **NAT traversal / tunnel** | Only the host runs a client; friends just open a URL. e.g. self-hosted frp (needs a server with a public IP), Cloudflare's `cloudflared tunnel --url http://localhost:3000` (temporary address that changes every start; latency from mainland China may be high), or public tunnel services such as Sakura frp in China (usually require real-name verification; mainland nodes serving web pages may need ICP filing) | No router changes, no public IP; on free low-bandwidth routes the first asset load will be slower |
| **Cloud server / VPS deployment** | Run the bundle on a VPS, or use the repository's `Dockerfile`; add HTTPS with Caddy / Nginx. Pick a region close to the players with good routes (for players in mainland China, watch the return route of overseas data centers, or evening-peak latency can be very high; binding a domain to a mainland server requires ICP filing) | Long-running servers, players spread across regions |

General notes:

- The game is a **single long-running Node.js process + WebSocket** (path `/ws`). Only one instance can run, and it must be deployed at the root path of the domain; serverless platforms like Vercel and static hosting like GitHub Pages will not work. Your reverse proxy must forward WebSocket upgrades.
- The game has no account system — **anyone who knows the address can get in**. Only share the address with friends; do not publish it or run a public lobby. This also reduces the copyright risk around the assets.
- With a public IPv4 address you can also forward a port on your router, but that exposes your home computer directly to the internet — prefer the approaches above.

## Controls

| Action | How |
|---|---|
| Buy / upgrade the Dispatch Center / Improv card pick | Tap once to select, tap again to confirm (`D` upgrades) |
| Deploy / move an Operator | Drag from the Bench onto a board tile → the direction wheel appears → swipe up / right / down / left to choose a facing and release; release in the center or tap "✕ Tap to cancel" to cancel. While dragging, the tile under your pointer / finger is where it lands; when it can be placed there, the model stands right on that tile (when it can't, it follows under the pointer) |
| Change facing | Drag the Operator back onto its own tile, then choose a direction |
| Sell / Retreat / Destroy Equipment | Tap the tile the unit is on → the bottom buttons "Sell +1" and "Retreat"; you can also drag an Operator from the board back to the Bench to retreat it. Equipment and Arts on the Bench can only be "Destroyed"; assigned Equipment is locked to its Operator (it returns to the Bench when the Operator is sold or merged into an Elite) |
| Equipment | Drag Equipment onto the tile an Operator is on (2 per Operator; when full a replace dialog pops up and the replaced piece is destroyed); drag Arts onto a tile and choose a direction |
| View details | Right-click or long-press a unit / card (stats are live values: green when above base, red when below) |
| Shortcuts | `R` Refresh · `F` Freeze · `D` Upgrade · `Q` Retreat / `X` Sell the selected Operator · `Space` Ready · `Esc` Cancel / Close; all except `Esc` can be rebound under "Settings → Hotkeys" ([gameplay guide §11](../docs/PLAYING.en.md#11-hotkeys)) |
| Direction wheel keyboard controls | Arrow keys to preview · `Enter` to confirm · `Esc` to cancel |
| Pause (Solo Simulation) | During a battle (including Final Assault / Hidden Core) click "Pause" in the top bar or press `Space`; click "Resume Battle" (or `Space`) to continue. Team Simulation battles cannot be paused |
| Emotes | "Chat" in the bottom-left corner; swipe left / right (or arrow keys) to switch sets; 1-second cooldown |
| Spectate | After your own battle ends (or during the Rest Phase), click a teammate's avatar on the left → "Go View"; friends who are not playing can enter the Alliance Key in the lobby and click "Spectate" (up to 2 spectators per alliance; new in this remake) |
| Stats (local) | "Stats" in the top-right of the title screen, in the lobby and in the room: win rate, Strategy clear rates, titles, battle totals and match history (click a row to review its result screen); stored only in this browser, can be exported / imported; matches left before the first round is cleared are not counted ([gameplay guide §12](../docs/PLAYING.en.md#13-stats-local)) |

Full rules, numbers and tips are in **[docs/PLAYING.en.md](../docs/PLAYING.en.md)** (there is also "How to Play" in the bottom-left corner in game).

## Documentation

| Document | Contents |
|---|---|
| [CHANGELOG.en.md](../CHANGELOG.en.md) | Change log: what each version fixed, and which reports were verified not to be problems |
| [docs/PLAYING.en.md](../docs/PLAYING.en.md) | Gameplay guide: flow, economy, recruiting and promotion, formations, Unite, Alliances, Final Assault, result titles |
| [docs/DEPLOY.en.md](../docs/DEPLOY.en.md) | Deployment guide: hosting on Windows and starting on boot, firewall, mesh VPN / tunnels, reverse proxy and HTTPS, Docker, systemd, troubleshooting |
| [docs/WINDOWS.en.md](../docs/WINDOWS.en.md) | Windows portable bundle: how to build a "zero-install" bundle (`scripts/make-windows-bundle.mjs`), what goes in it, licensing notes |
| [docs/DESIGN.md](../docs/DESIGN.md) | Architecture and contracts (English): an index that finds files by section number; the current rules are in `docs/design/` (scope and directory responsibilities, coordinates and time, battle engine, match, network protocol, rendering and UI), and the rule revisions after each playtest and release, with their evidence, in `docs/history/` |
| [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) | Code map (English): the server, the network protocol and the battle simulation shared by client and server, the directory layout after the 0.2.0 refactor, data flow, golden results and import boundaries, where common changes start |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contributing: setting up, running tests, the fidelity principles, commit and PR conventions, how to add a Custom Squad Operator (Chinese, with an English summary at the end) |
| [docs/SIM.md](../docs/SIM.md) | Battle simulation engine reference (English): hooks, skill description format, profession default behavior |
| [docs/META.md](../docs/META.md) | Match and economy engine (English): implementation details of the round flow, shop, Unite and Final Assault |
| [docs/DATA.md](../docs/DATA.md) | Game data generated from the official data tables (English) |
| [docs/ASSETS.md](../docs/ASSETS.md) | Asset sources, directory layout and manifest (English) |
| [docs/I18N.md](../docs/I18N.md) | Interface languages (English): how UI text, game texts and server messages are translated, and the coverage; **adding a language only takes one language file in `public/i18n/`** (community translation steps under "Adding a language", pack format in [docs/PACKS.md](../docs/PACKS.md)) |
| [docs/BALANCE.md](../docs/BALANCE.md) | Difficulty model and measurements (English) |
| [docs/research/](../docs/research/00-INDEX.md) | Research notes on the official rules, data and UI |

## Development and testing

```bash
npm run dev                 # node --watch: restarts automatically when server code changes
node --test                 # unit + integration tests (about 3170; cases that need assets / a browser skip themselves)
SP_E2E=1 node --test test/ui/mock.e2e.test.js        # browser end-to-end tests, need a local Chrome (CHROME_PATH sets the path)
SP_REAL_E2E=1 node --test test/ui/real.e2e.test.js   # needs Chrome + the downloaded assets
RENDER_E2E=1 node --test 'test/render/*.browser.test.js'   # rendering tests, some need the locally extracted board textures
GOLDEN_FULL=1 node --test test/golden.test.js           # golden results: summaries of whole battles and bot matches with fixed seeds (by default only a quick subset runs)
node tools/perfbench.mjs --cpu 1,4,6 --profile             # frame-time benchmark of real battles (Chrome CPU throttling approximates low- to mid-range phones); needs Chrome + the downloaded assets
```

- Game data is generated from the official data tables by `npm run build-data` (`tools/build-data.mjs`); do not edit `data/*.json` by hand.
- Performance testing: `/dev/battle-perf.html` runs a real battle in the browser (the battle runner, simulation and rendering a match uses) and shows the frame rate and per-frame time live; open it on a phone and tap "Start measuring (10 s)", and the report it produces can be copied and attached to feedback. The battles it uses come from data `node tools/capture-specs.mjs` captures from fixed-seed bot matches (`public/dev/perf/`).
- A commit that only refactors, without changing gameplay, must not change `test/golden/*.json`; when you change gameplay on purpose, run `npm run golden:update`, check the differences, and commit them with the change (see [test/golden/README.md](../test/golden/README.md)).
- GitHub Actions ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs `npm ci`, `node --test` and a server smoke test on Ubuntu and Windows with Node 22 / 24.
- For how the code is layered and which file to start from when changing a rule, see [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

## Project structure

| Path | Contents |
|---|---|
| `server/` | Entry point `index.js`; Node HTTP static server + WebSocket (`/ws`, code in `http/`), lobby, match engine (`match/`), battle simulation (`sim/`, shared by browser and server) |
| `shared/` | Constants and network protocol shared by client and server |
| `public/` | Browser client (native ES modules, PixiJS + pixi-spine, three.js 3D board, Preact + htm UI) |
| `data/` | Game data generated from the official data tables, and the asset manifest `assets.json` |
| `tools/` | `setup.mjs` / `doctor.mjs`, asset download `fetch-assets.mjs`, data build, local extraction `local-extract/` |
| `scripts/` | Start scripts (Windows / macOS / Linux), Windows start-on-boot |
| `docs/` | Documentation and research |
| `test/` | `node:test` tests |

## License

- **Code**: the code written by this project is released under **GPL-3.0-or-later**; the full text is in [LICENSE](../LICENSE). There is also an additional permission under GPL section 7 allowing combined distribution with the Spine Runtimes in pixi-spine (see [NOTICE.en.md](../NOTICE.en.md)).
- **Game assets are not covered by the license**: the art, music, sound effects, text, data and other material related to *Arknights* are copyright of their respective owners and not covered by the GPL; see the [Disclaimer](#disclaimer) above and [NOTICE.en.md](../NOTICE.en.md) for the usage restrictions.
- **Third-party components** follow their own licenses: libraries installed via npm (the bundle's `node_modules` includes each one's license file), the algorithm in `tools/local-extract/aklz4.py` (BSD-3-Clause), fonts, etc. The list and full license texts are in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).

## Credits and data sources

- Game data: [Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData).
- Asset sources: [yuanyan3060/ArknightsGameResource](https://github.com/yuanyan3060/ArknightsGameResource), [fexli/ArknightsResource](https://github.com/fexli/ArknightsResource), [isHarryh/Ark-Models](https://github.com/isHarryh/Ark-Models), [ArknightsAssets/ArknightsAssets2](https://github.com/ArknightsAssets/ArknightsAssets2); fonts from [TimWangZi/The-font-of-Arknights](https://github.com/TimWangZi/The-font-of-Arknights) and Google Fonts (Noto Sans SC). See [docs/ASSETS.md](../docs/ASSETS.md).
- Rules cross-checked against: [PRTS, the Chinese Arknights wiki](https://prts.wiki/).
- LZ4AK unpacking: the algorithm in `tools/local-extract/aklz4.py` comes from [isHarryh/Ark-Unpacker](https://github.com/isHarryh/Ark-Unpacker) (BSD-3-Clause, via MooncellWiki/UnityPy); Unity assets are parsed with [UnityPy](https://github.com/K0lb3/UnityPy) (MIT).
- Libraries: [PixiJS](https://pixijs.com/) (MIT), [pixi-spine](https://github.com/pixijs/spine) (MIT; the Spine Runtime it contains is additionally subject to the [Spine Runtimes License](https://esotericsoftware.com/spine-runtimes-license)), [three.js](https://threejs.org/) (MIT), [Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm) (MIT), [ws](https://github.com/websockets/ws) (MIT).

Thanks to the authors and maintainers of the projects above, and to Hypergryph for this game.

## Contributing

Issues reporting bugs, differences from the official rules or suggestions for improvement are welcome, as are Pull Requests:

- Setup, running tests, the fidelity principles and the commit conventions are in [CONTRIBUTING.md](../CONTRIBUTING.md).
- Run `node --test` before submitting and update the related docs; docs are written in Simplified Chinese, code and comments in English.
- Submitted code will be released under GPL-3.0-or-later.
- Do not commit any game asset files (`public/assets/` and similar directories are excluded by `.gitignore`).
- This project is strictly non-commercial: do not submit ads, payments, tips or any other monetization features.
