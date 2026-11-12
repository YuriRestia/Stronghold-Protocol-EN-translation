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

Server cost: none
```

- The first line is `## YYYY-MM-DD`: the day of the change. Then one or more `### Heading` sections, each with at least
  one `- ` bullet. Nothing else at heading level 1 or 2. LF line ends. Last, the `Server cost:` block (below).
- The sections are written exactly as they will read in FORK-CHANGELOG.md (English only, credits as there: "thanks to
  @login" for contributions, upstream merges as one linked line).
- A later fix to the same change edits its fragment while it is still here; once folded, it is a new fragment.
- No fragment for development workflow or tooling-only changes (test plumbing, merge and review process, dev
  tools): the changelog lists what players and server hosts get.

## Server cost

Every fragment ends with a line starting `Server cost:` (the SERVER COST rule, 2026-11-11: the user decides with
numbers). `npm run changelog -- --check` (and `test/changelog.test.js`) refuse a fragment without it.

- `Server cost: none` only when the change touches no server, network or bot code. A reason in parentheses is fine
  (`none (tooling only)`). A `none` line is left out when the fragment is folded into FORK-CHANGELOG.md.
- Otherwise `Server cost:` and the numbers, typical **and** worst case, measured with the dev traffic meter where
  possible (below), arithmetic marked "estimated". The block is folded into FORK-CHANGELOG.md with the entry. It must
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
