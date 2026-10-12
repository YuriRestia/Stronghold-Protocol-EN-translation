# main/wip

- [x] Figure out what tool this app was apparently vibe coded with
- [x] Translate documentation files to English (ex. README.md -> README.en.md). Do not modify the original file.
- [x] Determine if the game is possible to build and run locally in this container. Are we just missing dependencies? If we cannot do a full build and run inside the container, then what is possible to test?
- [x] Determine which game rules are owned by this repo, and which ones are downloaded on the fly (would need patching at runtime if we want to change them).

Status (2026-10-11)

- Merged into main: lobby rules / Custom Lobby Modifications (+2 Deployment Limit, +2 Funds, untimed), difficulty details (#7), keyword popup (#8), branch conventions (#5), stale-browser-data note (#6).
- Open PRs into main: `wip/sync-yuri-dev` (Yuri's 4 commits after 1f05351c), `wip/lobby-rules-i18n` (ja / ko / zh-TW strings of the lobby modifications, plus Fish's ROADMAP commit).
- Next sync with yuri/dev-0.2 brings in Yuri's merged versions of #3 (English docs) and #4 (difficulty details, with Text Size); expect conflicts with our own copies, resolve in favour of Yuri's. After it, main's keyword popup CSS needs `font-size: calc(.14 * var(--t))` (Text Size), as on `yuri/keyword-popup`.

Server maintenance (ROADMAP "Reboot for updates"), branch `wip/server-maintenance`

- [x] See live matches: `npm run maintenance -- --status` (also `/healthz`).
- [x] No new matches this session: `--close` (enforced in Lobby.startMatch, so matchmaking can't slip past it).
- [x] Scheduled maintenance with a live countdown for players: `--in 15` / `--at 21:30`.
- [x] Smart stop, once, cancellable: `--stop-when-idle` / `--keep-running` / `--cancel`.
- Design for the ROADMAP usability check (2026-10-12):
  - [x] One copy-paste command for non-technical hosts who run from source, in README.en.md and README.md:
    `npm run maintenance -- --close --stop-when-idle --back-in 20 --wait && git checkout -- data/assets.json && git pull && npm ci && scripts/start.sh`
    (Windows: end in `scripts\start-windows.bat`; cmd or PowerShell 7, since Windows PowerShell 5 has no `&&`). Release-bundle
    hosts use the update bundle, service setups follow DEPLOY. Nothing in our tools runs `git pull` on its own.
  - [x] `--wait`: block until the server has stopped (exit 0); no server answering = exit 1, so the chain never pulls by
    mistake; Ctrl+C leaves the maintenance set and says how to cancel.
  - [x] `--back-in` / `--back-at`: expected downtime; when the server stops it tells players "back around 21:45", shown
    while the page reconnects, cleared when the new server answers.
  - [x] `--message`: free text in the bar. `announce.mjs` stays for one-off notices; its help points here for reboots.
  - [x] One-shot for real: the server consumes the file when it stops and drops a stale one at start.
  - [x] `--stop-when-idle` alone also shows players a bar ("restarts when current matches end").
  - [x] Stable interfaces documented (`logs/maintenance.json`, `/healthz` `maintenance`, `--status --json`, `--wait` exit
    codes); script text output and bar wording are for humans and may change.
  - [x] DEPLOY: how to start again per setup, `Restart=on-failure` does not restart after the idle stop (exit 0), and use
    `--close --stop-when-idle` rather than reading `--status` and stopping by hand.

Feedback for feature/lobby-rules

- Looks good, plays correctly
- PR approved
- [x] May want to change the text "Lobby Rules" to "Custom Lobby Modifications" so it's more obvious that this wasn't in the original game and some players would probably consider it cheating
- I noticed the graphics are ugly. This is probably just inherited from the previous repo
- [x] We should add the originals as alternate remotes as well: https://github.com/sganggs/Stronghold-Protocol < https://github.com/YuriRestia/Stronghold-Protocol-EN-translation < https://github.com/evenifyouforget/Stronghold-Protocol-EN
- [x] And then check if sganggs can be merged into here. Maybe the original CN is ahead with better graphics already? Make a new branch to try merging. (Merging into en-translation gave 57 conflicting files, almost all T() vs upstream's t(); main was rebuilt on yuri/dev-0.2 instead, which includes sganggs/master.)

Known issue: stale browser data (2026-10-10)

- Two players on `main` both got "3D/WebGL rendering is unavailable on this device" and the plain 2D view; a full refresh plus clearing the browser cache fixed it for both. Treat as busted for now, but more cache bugs are likely after future updates; find a lasting fix.
- That message appears whenever the 3D engine fails to start within 12 s for any reason (public/js/ui/fieldHost.js LOAD_TIMEOUT_MS), not only without WebGL; the real cause is in the browser console line "[field] render engine unavailable, using the simplified view: …". Ask for that line next time.
- Not reproduced in a fresh headless Chromium: the engine mounts in about 1.3 s.
- What the browser keeps (server/http/files.js cacheControlFor): html, code and data are `no-cache` (revalidated every load); public/assets, public/fonts and public/vendor are cached for 1 day; `?v=` URLs are immutable. The asset-preload Service Worker (public/resource-sw.js) also stores /assets, /fonts and /media in Cache Storage. The vendor libraries did not change between en-translation and main, so the 1-day cache and the Service Worker's stored art are the leading suspects.
- Possible fixes to look at: version-stamp the 1-day-cached URLs per build (`?v=<build>`), show a "new version, reload" prompt when the build changes (upstream already detects new builds, CHANGELOG 0.2.2), and have the engine-failure toast offer a reload / cache clear.

# to be ported to yuri

- [x] English docs (README, CHANGELOG, NOTICE, DEPLOY, PLAYING, WINDOWS `.en.md`): Yuri #3, merged, then updated by Yuri for the current repo state.
- [x] Difficulty details: Yuri #4, merged; Yuri moved its font sizes onto Text Size (`--t`).
- [ ] Keyword popup: `yuri/keyword-popup` pushed, PR not opened yet (description drafted; its CI is red only because of the stale reroll test below, so open it after Yuri #5).
- [ ] Reroll test expects the old 25 s co-op briefing (Yuri raised it to 45 s in d7f4e8d7): `yuri/fix-briefing-timer-test`, Yuri #5 (open), CI green on GitHub. Makes dev-0.2's CI green again.
- [ ] Server maintenance: port `wip/server-maintenance` once it passes the ROADMAP usability check (Yuri runs a public server).
- [ ] Custom Lobby Modifications (lobby rules): main only for now. Ask Yuri whether gameplay mods are welcome as dormant code behind a server option (off by default) before porting.
