# Changelog fragments (fork)

A branch never edits [FORK-CHANGELOG.md](../FORK-CHANGELOG.md) directly. It adds **one file here per change**, named
after what it changes (`changes/<what-it-changes>.md`, lowercase words joined by hyphens), so parallel branches never
conflict on the changelog. The maintainer folds the fragments into FORK-CHANGELOG.md on `dev-0.2` with
`npm run changelog -- --write` (at the latest before each release; it refuses on any other branch) and commits the result.

## Format

```markdown
## 2026-11-11

### What changed, as a player-facing title

- What it does now, in plain English.
- Before: what it did.

### A second section, when one change has two parts

- …

Kind: player

Server cost: none

Operator notes:

- (optional) Anything only our own servers need: hosts, regions, deploy steps, settings we set. Never folded.
```

- The first line is `## YYYY-MM-DD`: the day of the change. Then one or more `### Heading` sections, each with at least
  one `- ` bullet. Nothing else at heading level 1 or 2. LF line ends. Last, the `Kind:` line, the `Server cost:`
  block (below) and, optionally, an `Operator notes:` block, in any order.
- The sections are written exactly as they will read in FORK-CHANGELOG.md (English only, credits as there: "thanks to
  @login" for contributions, upstream merges as one linked line).
- A later fix to the same change edits its fragment while it is still here; once folded, it is a new fragment.
- No fragment is needed for development workflow or tooling-only changes; when one is (a merge guard asks for its
  `Server cost:`), it is `Kind: internal`.

## Kind: player or internal

FORK-CHANGELOG.md is for players. Every fragment says which it is, on one line:

| `Kind: player`: folded into FORK-CHANGELOG.md | `Kind: internal`: checked, then deleted at fold time, never folded |
|---|---|
| Game, UI, balance, sounds and art, fixes players notice, new options in Settings | Release, deploy and server scripts, CI, tests, golden files, hooks, crew tooling, loop caps |
| Credits for contributions, upstream merges | The changelog and fragment machinery itself |
| | Server-only changes players never see (logging, limits, internal refactors) |

No `Kind:` line, or anything else after it, is an error from `npm run changelog` (and from the merge guard). **When
unsure, it is internal.** The update news draft of `scripts/release.mjs` also uses only `Kind: player` fragments.

## News lines (player fragments)

A `Kind: player` fragment whose change players should read about in the lobby's update news carries a `News:` block:
its line(s) for the news, in all five languages the game ships, written with the change so a release never waits on
translation. The release builds the news from these blocks (`scripts/release-news.mjs`). A player fragment without one
is fine (not every change is news); an internal fragment with one is an error. The block is never folded.

```markdown
Kind: player

Server cost: none

News:

- highlight: <@sp.leaf>{term:大同盟}</> rooms now find players through matchmaking
  zh: <@sp.leaf>{term:大同盟}</>房间现在可以通过匹配找到玩家
  ja: <@sp.leaf>{term:大同盟}</>ルームがマッチングでプレイヤーを見つけられるようになりました
  ko: <@sp.leaf>{term:大同盟}</> 방이 이제 매칭으로 플레이어를 찾습니다
  zh-TW: <@sp.leaf>{term:大同盟}</>房間現在可以透過配對找到玩家
- point: {name:char_4247_oxi}'s fireballs now play their sounds
  zh: {name:char_4247_oxi}的火球现在会播放音效
  ja: {name:char_4247_oxi|タルラ}の火球に効果音が付きました
  ko: {name:char_4247_oxi}의 화염구가 이제 효과음을 냅니다
  zh-TW: {name:char_4247_oxi}的火球現在會播放音效
```

- `- highlight:` is a bold line at the top of the news, `- point:` a bullet. The English line follows the colon; the
  `zh:`, `ja:`, `ko:` and `zh-TW:` lines follow, indented. Every item has all five.
- **Names are never typed by hand.** `{name:<id>}` is the game's own name of an operator, token, enemy, item or bond by
  its game-data id (`char_1033_swire2` → Swire the Elegant Wit / 琳琅诗怀雅 / 琳琅スワイヤー / 스와이어 디 엘리건트 위트 /
  琳瑯詩懷雅), filled in per language. `{term:<Chinese UI text>}` is a UI term from the language packs (`{term:大同盟}` →
  Grand Alliance / 大同盟 / 대동맹). Sources, all in git: `data/*.json` (ids → Chinese names), `data/i18n/<lang>.json`
  (the official game data's names), `public/i18n/<lang>.json` (the UI packs). zh-TW falls back to the Chinese name, as
  the game does.
- Only where the game data has no name in a language, write it out: `{name:<id>|<name>}` (Talulah has no Japanese name
  in our data, so `{name:char_4247_oxi|タルラ}`). It is refused when the data has one.
- Colour tags as the game uses them (`<@sp.leaf>…</>`); every language has the same tags and the same placeholders as
  the English line. At most 200 characters a line once the names are filled in. Only what players notice: no server,
  CI, test, tooling, bandwidth or download lines, no "Many fixes" line.
- `npm run changelog` checks all of it and names the problem: a missing language, other placeholders or tags than the
  English line, an unknown id, a missing name, a line too long.
- At release time Notepad shows each line with its translations under it. A line whose English is rewritten there, or
  a new one, has no translations: the release stops, names it (`h1` = first highlight, `p1` = first point) and keeps
  the edit in `logs/news-<id>.draft.txt`. A crew session fills in the four lines there (names as above) and the next
  release run opens it again; or `node scripts/release.mjs --english-only h1,p3` ships those lines in English for now.

## Public sections, operator notes

FORK-CHANGELOG.md is public. Its sections say what players and **any** server host get: features, fixes, credits,
upstream links, and a new setting in general terms ("`SP_X=1` turns on Y"). Our own deployment never goes there.

| Goes in the sections | Goes in `Operator notes:` (or `Server cost:`), never folded |
|---|---|
| "Players connect to the nearest server" | Which servers we run, their regions and SSH aliases |
| "New setting `SP_REGIONS` lists the servers" | The values we set, our domain, IP addresses, the proxy or CDN set-up we use |
| "A prepared version waits 4 hours for activate" | Deploy steps, `ssh` / `sudo` / `systemctl` / `journalctl` commands, `/etc` and `/opt` paths, `peer.env` |
| "Bots run in the host's browser" | Traffic and disk numbers (MB/s, GB/day): they belong in `Server cost:` |
| | Hosting providers, incidents on our servers and their dates |

Both blocks stay in the fragment, where the merge guards read them, and are dropped when the fragment is folded.
`npm run changelog` refuses a section, and FORK-CHANGELOG.md itself, holding any of the right-hand column
(`OPERATOR_ONLY` in `tools/changelog.mjs`: domains other than public references, IP addresses, the server aliases and
region names, server commands and paths, secrets files, provider names, MB/s and GB/day rates). The refusal names the
line; move it under `Operator notes:`.

## Server cost

Every fragment ends with a line starting `Server cost:` (the SERVER COST rule, 2026-11-11: the user decides with
numbers). `npm run changelog -- --check` (and `test/changelog.test.js`) refuse a fragment without it.

- `Server cost: none` only when the change touches no server, network or bot code. A reason in parentheses is fine
  (`none (tooling only)`).
- Otherwise `Server cost:` and the numbers, typical **and** worst case, measured with the dev traffic meter where
  possible (below), arithmetic marked "estimated". The block stays in the fragment; it is never folded into
  FORK-CHANGELOG.md (2026-11-13: the public changelog carries no traffic numbers). It must
  state per player, per room and for 300 concurrent players: bandwidth out / in in **MB/s** at peak and **GB/day**
  (never Mbit/s), server CPU as % of one core, memory MB, disk MB/day, bot ms/round against the budget, and a
  `Cap:` line (what bounds the worst case; no cap, no build):

```markdown
Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0.002 / 0.0005 MB/s (0.17 / 0.04 GB/day) | 0.01 / 0.001 MB/s |
| Bandwidth out / in, per room (4 players) | 0.008 / 0.002 MB/s | 0.04 / 0.004 MB/s |
| Bandwidth out / in, 300 players | 0.6 / 0.15 MB/s (52 / 13 GB/day) | 3 / 0.3 MB/s |
| Server CPU | 0.5 % of one core | 2 % |
| Memory | 1 MB | 4 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: one update per unit per second, at most 32 units per room.
- Measured with tools/traffic-report.mjs over one 4-player test match; CPU and memory estimated.
```

- Fragments written before the rule say `Server cost: none (pre-rule)`, or, for the seven whose change did touch
  server code, `Server cost: unmeasured (pre-rule)`, accepted only from the names in `tools/changelog.mjs`
  `PRE_RULE_UNMEASURED`.
- **The merge check** `npm run server-cost [-- <base> [<head>]] [--json] [--worktree]` (`tools/server-cost-check.mjs`;
  base dev-0.2, head HEAD) fails a branch that touches server code (`server/**`, not comment-only), the protocol
  (`shared/protocol*`), the host-browser bot budget files, or adds WebSocket sends / broadcasts, `setInterval` or file
  writes in `shared/`, `public/js/` or `scripts/`, unless one of its fragments has the numbers. Exit 0 OK, 1
  violation, 2 usage or git error; `test/server-cost-check.test.js` runs it on the current branch.
- **The dev traffic meter** (`server/http/trafficDetail.js`): start a dev server with `SP_TRAFFIC_METER=1` (it stays
  off on production: `NODE_ENV=production`, `SP_GEN`, or a packaged release; off, nothing is wrapped). It counts
  WebSocket messages and payload bytes per message type, per room and per second. `npm run traffic-report -- --reset`
  before a test match, `npm run traffic-report` after it: MB/s and GB/day per player and for 300 players
  (`--players N`, `--json`, `--url`).

## Commands

| Command | What it does |
|---|---|
| `npm run changelog` (or `-- --check`) | Checks every fragment (also done by `test/changelog.test.js`); writes nothing |
| `npm run changelog -- --dry-run` | Prints FORK-CHANGELOG.md with the fragments folded in; writes nothing |
| `npm run changelog -- --write` | Folds them in (newest first within a day, by the time git added the file) and deletes them. Only on `dev-0.2`, and only when `changes/` and FORK-CHANGELOG.md have no uncommitted changes |
| `npm run changelog -- --help` | Prints the usage. It and any unknown option exit 1 and touch nothing |
