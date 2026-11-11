# Host-browser bots: design and work split

Status: **pieces 1–4 and 6–11 built (off by default, not live); piece 5 not started.** Written 2026-11-07 against
`dev-0.2` at `580c2708`. Each later piece waits for approval.

The rule this serves: the server has to carry hundreds of players with 3 bots each, so the host's browser does **all**
bot calculation (economy, picks, layout building, simulation). The server only sends state and applies moves.

## Summary

The real bot code (`server/match/bot.js`, unedited) runs in a Web Worker on the host's browser, against a local copy of
the match called the **shadow match**. Every game action the bot takes on the shadow is recorded as a normal `g.*`
intent. The server applies that list through the same validated handlers a human uses. Bot seats play one at a time per
room.

Reading the code turned up four things the brief did not have. They change the plan and the estimate:

| # | Finding | Consequence |
|---|---------|-------------|
| 1 | **Bot seats' real battles also run on the server.** `_authorityFor` skips bots, so every bot field goes to `_runOnServer('no-human')` (`server/match/match/clientCombat.js:84`, `:123`). | At the live setting (`SP_BOT_REHEARSAL=0`) this is about half of the server's bot CPU today. It has to move too (piece 8). "Only simulation is delegated" covered rehearsals only. |
| 2 | **A move list cannot be computed from public state alone.** `ps.refresh()` draws new shop cards from the server's `rngShop`, and the bot reacts to them in the same prep (3.7 refreshes per prep in the traced match). Bought pieces get uids from a match-wide counter. | Bot seats get their own random streams and a reserved uid block while bot moves run (Part B3). |
| 3 | **The snapshot is much bigger than 34 + 60 fields.** That count is the text of `bot.js` alone. The handlers the bot calls read more. A live trace gives 47 + 27 on the match and 40 + 82 on the seat, plus 29 fields on teammates. | Send the whole seat, not a hand-picked list, and guard it with a strict test (Part B4, Part D). |
| 4 | **The 20 gate lines need no edits.** On the shadow, `m.botRehearsal` is simply the host's layout count, so upstream's logic runs as written. | `bot.js` stays almost upstream-identical, and later merges get easier (Part B12). |

**Estimate: 38–57 h across 11 pieces.** The earlier rough 10–20 h counted neither bot battles nor the seat streams.

## Part A: what the code does today

### Where the bot runs

| Entry point | File | What it computes |
|-------------|------|------------------|
| Prep (economy, layouts, rehearsal) | `match/prep.js` `scheduleBotPrep` | `prepBegin` → job → `prepEnd`, in sliced generators |
| Strategy draft | `match/phases.js:132` `scheduleBandBot` | `pickBand` |
| Card draft | `match/spDraft.js:82` `scheduleSpBot` | `pickCard` |
| Personal choice | `match/spDraft.js` `autoPickPersonalChoice('bot')` | `pickCard` (bounty scorer), called inside prep |
| Real battle of a bot field | `match/clientCombat.js` `_runOnServer` | a full headless battle |
| Bot-only boss field | `match/clientCombat.js` `_bossServerRun` | a real-time server run |
| Plugin offer window | `match/offers.js:153` `_offerBot` | no bot calculation: `_offerDefault` |

Only the rehearsal step can leave the server today, and only for `ps.isBot` seats. AI takeover seats never leave.

### Plugin and old-version rooms today

Checked in the code and by running the real match host: a child process with the real `Match`, 1 autoplay seat + 3 bots,
`SP_BOT_REHEARSAL=0` in the parent as on the live server. The data-plugin and old-version runs went to round 4. A normal
room ran 15 rounds as the control.

Cosmetic-only plugin rooms are ordinary rooms and run in the main process. The table covers gameplay plugins and old
official versions, which each run in their own child process (`server/lobby.js:2150`).

| What | Gameplay-plugin room | Old-version room | Evidence |
|------|----------------------|------------------|----------|
| How it starts | Server owner installs the plugin, the room host picks it. This repo ships only `plugins/_template`. | Room vote, on versions the server offers | `lobby.js`, `server/index.js:188` |
| AI seats allowed | Yes | Yes | `addBot` has no such check |
| Bot economy, picks, layouts | In the child | In the child | Run: bot preps counted, `prep` meter rises |
| Bot rehearsal | In the child, never offered to a browser (`requireCs`). At `SP_BOT_REHEARSAL=0`: none at all. | Same | Run: `m.botRehearsal=0`, `delegated=0` |
| Bot real battles | In the child | In the child | Run: `ai_1:server ai_2:server ai_3:server` |
| Human real battles | Human's browser | Human's browser | Run: `p_0:client(p_0)` |
| Room's data in browsers | Yes, downloaded and checked | Yes | `public/js/content.js` |
| Plugin `sim` and `meta` scripts in browsers | **Yes, both**, after consent, in the simulation Worker | Not applicable | `shared/plugins/scriptLoad.js:82`, `shared/plugins/sandbox.js:187` |

**Two corrections to the first version of this section.**

- It said plugin `meta` scripts never reach browsers. That was wrong: a consenting browser loads them today. The source of the
  mistake is a comment at `server/match/match/rehearsal.js:79`, repeated in `docs/design/network.md`, saying the browser has
  only official data. That is true only of today's rehearsal Worker, not of browsers in general.
- It said `SP_BOT_REHEARSAL=0` does not reach these rooms. That was wrong for data plugins, DSL plugins, trusted plugins and
  old versions: a plain `fork` inherits the environment, and the run shows `m.botRehearsal=0`. Only **sandbox script** sets
  lose it, because `forkSandbox` builds a fixed environment (`childHost.js:17`). So those would fall back to the default of 6
  layouts. The environment was checked directly, but no sandbox-script room was run.

**What this means for the design.** Both kinds of room can use the host's browser. Everything the bot needs already reaches a
seated, consenting human's browser, so the rule holds in these rooms too (piece 11). Two things need doing:

| Gap | Fix |
|-----|-----|
| The child does not know the host: `wireOptions` drops `hostId` outside test rooms, and `setHost` is not forwarded (the run shows `hostId=null`) | Forward both, and the new bot frames. **Approved by the user, 2026-11-07.** |
| The bot Worker must load a room's content, one set per Worker | Reuse the simulation Worker's loader. Sandbox scripts need `eval`, so the bot Worker also needs the `SIM_WORKER_CSP` header, which `server/http/static.js:435` gives only to `simWorker.js` today. |

Browsers load `meta` handlers today but nothing there calls them yet; only the server child does. This has not been run in a
browser, so piece 11's parity test must include a script plugin, not only a data plugin. A plugin room also costs a second copy
of the room's data on the host, beside the battle Worker's.

**The plugin script limit is not a real gap.** It is 8,000 plugin handler calls, per plugin and round, counted across all seats
(`_allowScript`, `DEFAULT_BUDGET`). The shadow would count only its own seat, so the two could disagree only near the limit. Then
the bot's moves go stale and it ends up keeping its board. The server stays correct either way. Do nothing unless parity shows
otherwise.

**As built (piece 11):** frames name the room's set in a plugin or old-version room. The Worker loads that set in the order the match
host does: lockdown when it has scripts, the engine, the scripts, then the match's modules. It is served with `SIM_WORKER_CSP` and has
no fetch. A browser without the set, or without consent for its scripts, answers `error` and the server asks the next human. Every
room's Worker now gets the whole data set, because the match code reads `config`, `choices` and more, which the simulation's 11 files
do not include. The official data goes as bytes, so the Worker parses it and the page's main thread does not. The child process
checks each revealing move against what it computes, so stale, failover and error counts of 0 in `test/e2e/bot-host-rooms.e2e.test.js`
are the parity check for these rooms.

### Measured cost

One match: seed 7, NORMAL, 1 autoplay seat + 3 bots, 6 host layouts, 14 rounds, on this desktop. It is a single run, so
read the numbers as a size, not a benchmark. The tracing script is outside the repo.

| Kind (from `simMeter`) | Total, 4 seats | Per seat, per match |
|------------------------|----------------|---------------------|
| `prep` (economy + layout planning) | 11.5 s | 2.9 s |
| `rehearsal` | 89.9 s | 22.5 s |
| `headless` (real battles, 55 fields, about 200 ms each) | 10.9 s | 2.7 s |

Per seat, per prep:

| Round | Plan ms | Rehearsal ms | Candidates | Moves (max) | Prep time, co-op |
|-------|---------|--------------|------------|-------------|------------------|
| 1 | 32 | 75 | 3 | 8 | 65 s |
| 4 | 97 | 589 | 5 | 25 | 95 s |
| 7 | 199 | 1,679 | 8 | 42 | 105 s |
| 11 | 462 | 1,896 | 7 | 35 | 125 s |
| 13 | 322 | 2,162 | 7 | 32 | 150 s |
| 14 (boss) | 374 | 6,610 | 9 | 43 | 195 s |

Single-human rooms have no prep clock at all (`soloUntimed`).

Moves across the 56 preps of that match:

| Bot calls | Intent | Count |
|-----------|--------|-------|
| `ps.move` | `g.move` | 800 (+4 refused) |
| `ps.refresh` | `g.refresh` | 207 |
| `ps.buy` | `g.buy` | 118 |
| `ps.setReady` | `g.ready` | 56 |
| `ps.sell` | `g.sell` | 50 |
| `ps.pickReward` | `g.reward` | 26 |
| `ps.levelUp` | `g.levelUp` | 16 |
| `ps.equip` | `g.equip` | 10 |
| `ps.useArt` | `g.art` | 7 |
| `ps.freeze` | `g.freeze` | 6 |
| `ps.destroy` | `g.destroy` | 0 here |
| `m.autoPickPersonalChoice` → `pickPersonalChoice` | `g.choice` | not counted |
| `ps.resolveTemp` (`bot.js:4495`) | none: needs one internal move, see Part B6 | 0 here |

### Field counts, re-verified

| Scope | `m.*` | `ps.*` |
|-------|-------|--------|
| Text of `bot.js` (the old "34 and 60", which include methods) | 34 (24 fields, 10 methods) | 60 (33 fields, 27 methods) |
| Text of all bot modules | 44 (30, 14) | 64 (37, 27) |
| **Live trace, including the handlers the bot calls** | **47 fields, 27 methods** | **own seat 40 fields, 82 methods; teammates 29 fields** |
| All own fields on the object | 135–141 | 55–61 |

The trace covers one seed, one difficulty and the legacy strategy, so it is a floor. Fields added after match start
(the 10 `_bot*` memos) are not in the trace figures.

### Import graph, re-verified

| Graph | Files | Size | Node imports |
|-------|-------|------|--------------|
| `bot.js` | 60 (34 sim, 13 shared, 12 match, `data.js`) | 1,113 KiB | none |
| `bot.js` + `PlayerState.js` + `effectsMeta.js` | 99 | 1,755 KiB | none |
| `Match.js` | 169 | 2,625 KiB | `llmGate.js`, `llmRelease.js` (`node:fs`, `node:path`, `node:url`) |

`data.js` is already served as a browser stand-in, and `/sim/` already has the battle code. So the shadow match must not
import `Match.js` (see Part B5). The strategy registry `botStrategies.js` pulls `llmGate.js` in, so the Worker imports the
strategies directly.

Bot code writes to the seat only through handlers, apart from its own memos (`_botFocus`, `_botPager` and the rest). It
has no direct writes to board, hand, funds or pieces. That is what makes a move list a complete record.

## Part B: the design

### B1. The pieces at runtime

| Where | New code | Job |
|-------|----------|-----|
| Server | `server/match/match/botTasks.js` | Queue per room, build tasks, apply move lists, stale handling, timers, failover |
| Server | `server/match/botWorld.js` | Build the world snapshot (also used by the shadow to restore it) |
| Browser, Worker | `server/match/shadowMatch.js` | The restored match the real bot code runs against |
| Browser, Worker | `public/js/battle/botWorker.js` (replaces `rehearsalWorker.js`) | Runs a task in slices, records moves |
| Browser, page | `public/js/battle/botHost.js` (replaces `rehearsal.js`) | Socket frames ⇄ Worker, reports hidden tab |

`Match` gets one option, `botExecution: 'local' | 'host'`. `new Match()` defaults to `local`, so tests, tools and golden
results stay as they are. `server/lobby.js` passes `host` when `SP_BOT_EXECUTION=host`. In `host` mode a guard throws if
bot decision code runs on the server. `SP_HOST_BOT_STRATEGY` (`opts.hostBotStrategy`) gives host-run bots a strategy of their
own, e.g. `ioleta-adaptive`, without changing what server-run bots play (docs/BOT_STRATEGIES.md).

**The player's UI never shows a bot's task data.** `botHost.js` hands `b.botTask` straight to the Worker. The frames never
reach the page's game store, so no screen can draw a bot's shop or a teammate's hand from them. A test asserts this.

### B2. One bot prep, step by step

1. PREP starts. The server queues the bot-controlled seats in seat order.
2. For the first seat it reserves a uid block, derives the seat seed, builds the snapshot and sends `b.botTask`.
3. The Worker restores the shadow and runs the real `prepBegin` with `delegate: false, pooled: false`. Economy and the
   default layout land on the shadow and are recorded. The generator returns the rehearsal job.
4. The Worker sends `b.botMoves { batch: 'plan' }` and **waits**. It spends no rehearsal CPU on a plan that might be stale.
5. The server applies the moves in one tick and answers `b.botAck`. If they went stale, see B7.
6. The Worker runs `job.run(sliceMs)` in slices until it finishes, the budget runs out, or a hurry arrives.
7. The Worker runs the real `prepEnd` with `job.best` and sends `b.botMoves { batch: 'final', memo }`, ending in `g.ready`.
8. The server applies them, stores the memo and starts the next seat.

The default layout is on the real board after step 5. If the host vanishes during rehearsal, the bot still has a sensible
board and only needs Ready. These are the two stages the prep already has, so the generators need no change.

Seats run **one at a time per room** because each bot's purchases change the shared pool the next bot rolls from. It also
matches the order of today's virtual-time run, which is what makes the parity test possible.

### B3. Seat streams and uid blocks (the refresh problem)

The bot's next move depends on what `g.refresh` reveals. The options:

| Option | Cost | Verdict |
|--------|------|---------|
| Round trip on each refresh | Bot code is synchronous, so all 7 refresh call sites plus effect code would need rewriting into generators. It would conflict with every upstream bot change. | Rejected |
| Send the match's `rngShop` state | Lets the host see its own future shop | Rejected |
| **Give a bot seat its own streams while its moves run** | Host can see the upcoming shop of the bots it runs, and nothing else | **Chosen** |

While a bot's moves run, on both the shadow and the server, three things are swapped for that seat:

| Match field | Replaced by |
|-------------|-------------|
| `m.rngShop` | stream from `deriveSeed(seed, 'botShop:<round>:<seat>:<attempt>')` |
| `m.rngMeta` | stream from `deriveSeed(seed, 'botMeta:<round>:<seat>:<attempt>')` |
| `m.uidSeq` | a cursor in a block reserved for this task (`base = m.uidSeq; m.uidSeq += 1024`) |

On the server this is one wrapper, `withSeatStreams(ps, fn)`, restored in a `finally` around a synchronous apply. It needs
**no edits** in `server/match/player/*.js`. Human seats keep drawing from the shared streams. The bots' own decision
stream (`m.rngBots`, 4 call sites) becomes one per seat and prep, on the shadow only.

So the Worker can play the whole prep offline and the server gets the same results when it replays the moves, unless the
world changed underneath. That is the stale case.

**The master seed is sent with the snapshot.** It was never secret: `battlePrefix` already puts it in every `battleId` browsers
receive (`Match.js`), and `deriveSeed` can be reversed from any field seed. You also don't mind cheating. Sending it means
`_normalOpts` and `seedFor` run unedited, including a plugin's own salts, with no change to `effectsMeta.js`.

### B4. The snapshot

Sizes are raw JSON, late game, before WebSocket compression.

| Part | Size | Notes |
|------|------|-------|
| Own seat | about 5 KB | everything persistent; `_botRangeRecs` (a 110 KB cache) is never sent |
| Each teammate | about 3–5 KB | the same fields as the own seat; `SharedItemPool.held` walks every seat's pieces |
| Shared pool | under 5 KB | `entries`; `banned` is static |
| Wave, or boss group wave | up to 12 KB | this round only |
| `lastResults` | under 9 KB | can be trimmed to what the bot reads |
| Bot memo | under 4 KB | opaque to the server, see below |
| **Total** | **about 30–45 KB per task** | |

How each match field is handled:

| Handling | Fields |
|----------|--------|
| Sent | `round`, `phase`, `difficulty`, `modeId`, `isSolo`, `stageId`, `version`, `rules`, `disabledBonds`, `order`, `wave`, `lastResults`, `pool`, `itemPool.debt`, and `bossId` / `hiddenBossId` only when they apply |
| Rebuilt in the Worker from static data | `gd`, `ds`, `registry`, `dispatcher`, `stage`, `battleContent`, `BattleClass` |
| No-ops or empties | `log`, `sched`, `later`, `sendFn`, `broadcastFn`, `_timers`, `markPublic`, `markPrivate`, `toast`, `tickerFor`, `onReadyChanged`, `maybeEndPrep`, `externalAI` (null), `fields` (empty), `test` (off) |
| Replaced | `rngShop`, `rngMeta`, `rngBots`, `uidSeq`, `botRehearsal` (task value), `botRehearsalDelegate` (false), `simPool` (null) |
| **Never sent** | the shared streams' state (`rngShop`, `rngMeta`, `rngWaves`, `rngDraft`, `rngSetup`); caches; tokens and session data |

**Bot memory between rounds:** `_botFocus`, `_botFocusId`, `_botPager`, `_botPagerHunt`, `_botSelf`, `_botFaLead`, `_botFaHunt`,
`_botSeenUids`, `_advisorBought`, `botStrategyState`. The Worker returns these as a memo with the final batch. The server
stores it without reading it, capped at 4 KB, and sends it with the next task, so it survives a host change. A bad memo
can only make a bot play badly.

The codec has to carry `Map`, `Set`, `-Infinity` and `undefined` faithfully. Plain JSON does not (`lastEmoteAt` starts at
`-Infinity`), and a round-trip test covers it.

**Traffic:** a full world per task, 3 tasks per prep. For 300 rooms at about 100 s per prep that is roughly 400 KB/s raw,
likely about 100 KB/s after deflate. This is an estimate; piece 2 measures it. The `b.rehearsal` frames it replaces carried
up to 16 battle specs, so it may well be less traffic than today.

### B5. The shadow match

A thin class that borrows the **real** method bodies from the real containers instead of copying them:

| Source | Methods borrowed (from the trace) |
|--------|-----------------------------------|
| `match/infra.js` | `alivePlayers`, `bossGroupOf`, `deployFieldOf`, `deployMapFor`, `dispatch`, `dispatchItem`, `nextUid`, `teamMedicGranted` |
| `match/combat.js` | `_normalOpts`, `_sanitizeSpawns`, `newBattle` |
| `match/spDraft.js` | `autoPickPersonalChoice`, `pickPersonalChoice`, `addBounty`, `offerBountyChoice`, `rollItemId`, `rollPool` |
| `match/views.js` | `_bossMateOf`, `bossMateView`, `nextEnemiesFor`, `prepMapChars` |
| `match/phases.js` | `bandTaken` |

Seats are real `PlayerState` objects restored from the snapshot, with the real effect dispatcher. A test keeps the Worker's
import graph free of `node:*` imports. If borrowing drags in too much, the fallback is a small split of the affected
container. Piece 2 finds this out first.

**Serving it.** The site's rule is "no other server file is ever served". `server/http/static.js` gets an exact allow-list
for `/match/…`, generated from the import graph and tested, like the existing `/match/bondsMeta.js` exception. Relative
imports already work behind a generation prefix for the same reason `/sim/` does (the `_` path segment).

### B6. Moves and how the server applies them

The Worker wraps the handlers in the table above at call depth 0. A refused call has no effect and is not recorded.
A move is the intent plus an optional check:

```
{ t: 'g.refresh', x: 'a41f09c2' }
{ t: 'g.buy', slot: 2, x: '7be1d003' }
{ t: 'g.move', uid: 1042, to: { area: 'board', row: 3, col: 5 }, dir: 'UP' }
```

`x` is a short hash of the seat's state after the move: shop, offers, hand, board, temp, funds. It is set only on moves that
reveal something (`refresh`, `buy`, `reward`, `equip`, `art`, `levelUp`). In tests it is set on every move.

Server rules:

| Rule | Why |
|------|-----|
| Sender must be the task's current executor and the task must be live | A late or forged frame changes nothing |
| Each move passes `validateC2S`, then goes through `Match._handle` | Same legality as a human |
| Allow-list: `g.buy`, `g.refresh`, `g.freeze`, `g.levelUp`, `g.sell`, `g.move`, `g.equip`, `g.art`, `g.destroy`, `g.reward`, `g.choice`, `g.ready`, plus `bot.resolveTemp`, which only the task path accepts and which maps to the rule-level `ps.resolveTemp()` | Never `g.leave`, `g.autoplay`, `g.pause`, `g.test` |
| At most 200 moves per batch, the whole batch in one tick inside `withSeatStreams` | Bounded CPU, and no human ever sees a half-applied batch |

The worst a dishonest host can do is play its bots badly or well, using legal moves. That is no more than it could do with
those seats as a player. It cannot see future waves or anyone's future shop.

### B7. Stale moves

| Case | What the server does |
|------|----------------------|
| `plan` batch: a move is refused or its `x` differs | Stop there. Moves already applied stay. Ack with `stale`, send a fresh `b.botTask` with `attempt + 1` |
| `final` batch: a move is refused | Skip it and continue (it is only a layout move, and `tryDo` in the bot already tolerates this) |
| Ready is refused at the end | Rule-level finish: auto-pick the personal choice, `ps.resolveTemp()`, ready |
| 3 attempts used | Keep the board and ready up |
| Answer for a task no longer live | Ignore it |

The usual cause is a human buying from the shared pool between snapshot and apply, which shifts every later roll in that
tier. Only the cheap `plan` stage can go stale, and the rehearsal does not start until `plan` is acknowledged, so a retry costs
hundreds of milliseconds, not seconds. Piece 6 measures how often this happens in a room with several humans.

### B8. Budget

| Value | Proposed default |
|-------|------------------|
| Bot budget for a prep | `clamp(40% of prep time, 15 s, 60 s)`; 30 s when untimed |
| Each seat's share | what is left ÷ seats left, so a fast bot's savings go to the next one |
| Rehearsal slice | 50 ms, so the Worker can hear cancel and hurry without being killed |
| Receipt ack | 5 s, else fail over (2 s lost tasks in a real two-browser game: a page's main thread can be that busy) |
| Plan batch after the receipt | 10 s, else fail over (a first Worker start took about 3.4 s on the desktop) |
| Worker start, after a `starting` receipt | 30 s for `b.botLoaded`, else fail over; the 10 s plan window counts from `b.botLoaded` (the Worker's 424 modules took about 16 s on 5 Mbps / 100 ms). Counted only until that human's Worker has been up once on this connection, and cut to 10 s once every human is Ready |
| Grace on top of the budget | 3 s, else fail over |

**On overrun, keep the best layout.** `RehearsalRun` keeps its best score so far, and the candidates are already ordered with
the default first. When the budget ends, the Worker stops and `prepEnd` applies `job.best`. A slow phone simply tests fewer
candidates.

**Hurry.** If all humans are Ready, the server sends `b.botHurry` and the Worker stops rehearsing at the best so far. Nobody
waits out a budget. This matters most in untimed rooms.

The prep deadline stays as it is. It marks unready seats ready (`prepDeadline`), late moves fail the phase check, and tasks
are cancelled with the prep.

### B9. Who runs the bots, and what if nobody can

| Order | Executor | Condition |
|-------|----------|-----------|
| 1 | Room host | Connected, tab visible, not demoted |
| 2 | Next human by seat | Same conditions |
| 3 | Nobody | Keep the board and ready up |

- A human is demoted for the rest of the match after 2 timeouts.
- `botHost.js` reports a hidden tab, because phones freeze hidden pages. The server fails over at once instead of waiting.
- A failover restarts the seat's task from fresh state with the budget left. Moves already applied stay.
- Host change, disconnect and leave follow the hooks that already exist (`setHost`, `_rehearsalHostChanged`, `onLeave`).

**With nobody available the server does no bot thinking at all:** rule-level auto-pick of a pending choice,
`ps.resolveTemp()`, Ready. That is exactly today's `ready()` fallback in `scheduleBotPrep`. Unspent funds are lost for that
round.

### B10. Drafts and cards

`pickBand` and `pickCard` become small tasks with the same frames, a budget of about 3 s, and one move (`g.band`, or
`g.choice`). With no executor they use the existing rule-level fallback: the deadline's random pick (`spDraft.js:63`) and
`timeoutBand`.

**One window each:** the receipt window is armed once per task and the plan window once, at the first `b.botReceived`. A repeated
receipt, or a second `plan` batch for the same task, is ignored, so an executor looping frames cannot hold an untimed prep open.

**As built (piece 7):** a pick is one `final` batch with one move. It has no budget of its own: the 5 s receipt and 10 s plan windows
apply, and a timed draft turn still ends at its deadline. So the first pick of a match does not wait for a Worker to start, `b.botWarm`
tells the first executor at the briefing, and the page starts the Worker when it is idle.

**As built (bot warm order, 2026-11-09):** what the screen needs now loads first. The page builds the Worker for `b.botWarm` or a
task only once the briefing and the band draft's art are in (`loadLater.js` `whenScreenSettled`, 10 s at most), because its
module graph shared the link with that art: on 10 Mbps / 40 ms the band icons came 4 s later. A battle never waits. While the
Worker is still starting, the receipt says `starting: true`, the server allows 30 s (`BOT_START_MS`) for `b.botLoaded`, and the
10 s plan window counts from there. A slow start is no strike; a Worker that never comes up still fails over within 40 s, and
the band pick then falls back to the next human and `timeoutBand`. (Review, 2026-11-09) `starting` counts only until that human's
Worker has been up once on this connection (a `b.botLoaded`, a plain receipt or a plan): a page that claims it on every task gets
the plain 10 s window, so it can't hold each seat for 40 s. A reconnect, a hidden tab or a departure clears it, since that page's
Worker really is cold. Once every human is Ready, a seat still starting gets 10 s from the hurry, and the page stops waiting for
the screen. A reconnecting first executor gets `b.botWarm` again. The local path runs its picks on seat streams
too when `seatStreams` is on, which keeps the same-seed parity test meaningful.

**The guard:** in host mode the match holds its strategies through `guardBotStrategy`, so `pickBand`, `pickCard`, `prepBegin` and
`prepEnd` throw on the server. The external host's `decide` stays usable, and its fallback goes through the queue (decision 9).

### B11. AI takeover seats

They are `ps.botControlled` like any bot, so they use the same queue, with no special path. This removes the
`!ps.isBot → server` rule in `canDelegateRehearsal`. `transferAiSeat` (`aiTakeover.js:32`) keeps cancelling that seat's task
through the same call, and a human taking a seat back simply returns it to the shared streams.

### B12. The `m.botRehearsal` gates

`grep -c` finds 20 lines: **14 code and 6 comments**. Plus `botAdaptive.js:9`.

| Lines in `bot.js` | What | Change |
|-------------------|------|--------|
| 3109, 3139, 3155, 3163, 3177, 3184, 3194, 3202, 3203, 3852, and `botAdaptive.js:9` | Upstream's logic: Final Assault lineups, leader hold, devour, contact | **None.** The shadow's `m.botRehearsal` is the task's count (default 6), so they all run. |
| 2058, 2105, 2140, 3091 | Fork plumbing: `viaHost`, `count`, `candidateLimit`, the takeover trim | Back to upstream's form in piece 10 |
| 48, 54, 2056, 2081, 2111, 3089 | Comments | Reworded in piece 10 |

The server's `SP_BOT_REHEARSAL=0` then stops mattering in `host` mode, because the server never reaches those lines. As a
bonus, upstream's item hunt (`faLead`) gets per-operator damage, because the rehearsal now runs where the bot does.

### B13. Bot battles on the host

**As built (piece 8):** the code is `server/match/match/botBattles.js`, switched on by `SP_BOT_BATTLES=host`, separate from
`SP_BOT_EXECUTION` so it can go live first. It branches in `_launch`, not `_authorityFor`, because a boss field's handover also
calls `_authorityFor` and boss fields are piece 9. A browser has 30 s to answer one field (`BOT_BATTLE_ANSWER_MS`), and two
timeouts stop a human being asked for the rest of the match. Until piece 11, a gameplay-plugin room or an old version stays on
the server, because the Worker only has the page's official data. Vanilla rooms carry a `cs` too, so the gates test `requireCs`.

`_authorityFor` gets one branch: any field with no connected human goes to the current executor, whether its players are bots,
humans who left the match or humans who are only disconnected. **The user's rule (2026-11-08): no player's board runs on the server**,
with the 8-player mode in mind. The executor could fake such a field's result within the bounds check (`botField`); the user accepted
that risk. A human who disconnects mid-battle hands their field to the same chain (`_authorityLost`, `_bossHandover`; a boss field
goes on live from the field's clock). Back mid-battle, they watch: the executor's result stands, their own reports are ignored, and
the board is theirs again at the next prep. Leaving (g.leave, or the rejoin window running out)
eliminates in every room type, the Grand Alliance included (中途退出, "quitting mid-match"; user, 2026-11-11). A battle the
leaver was fighting plays out to its natural end, handed at once to the same chain as a disconnect's (a boss field to the
partner first): nobody waits for a silent field, and the server never runs it. From the next round on the seat has no
field, no prep and no AI. During the rejoin window (only disconnected) nothing changes. A Worker runs the spec headless and
sends the result early, and the server holds it until the battle's natural end with the existing `_armRelease`, so pacing and
teammates' progress UI do not change.

| Case | Handling |
|------|----------|
| Result arrives | `validateClientResult` as for a human, then release at the natural end |
| Timeout, or host gone | Next human, then a synthetic result (`syntheticResult`: no kills, no leaks). Never `_runOnServer`. |
| Layer traits (`requiresTraitLayerAuthority`, `fields.js:793`) | A field with no connected human is exempt, and gains stay capped by the existing allowance. A field with a connected human keeps upstream's rule (the server runs it). |
| A human's field with that human disconnected, at the start or mid-battle | A browser runs it like a bot field, never the server. With no browser at all, the synthetic result. |
| A field whose humans all left | The same: it was running when they left (leaving eliminates, so later rounds have no such field). It plays out in a browser. |
| Bot-only boss field | Runs live in the Worker on the field's clock and reports at 4 Hz through `b.progress` and `b.result`, so the existing boss rules apply. A silent or lost executor hands it to the next human; with nobody left, a synthetic result stands (piece 9) |
| Bot-only joint field (seen in the run: `ai_2+ai_1:server`) | Same burst path as a normal field |

Battle work and prep work never overlap, because they belong to different phases.

## Part C: what gets retired (piece 10)

**As built:** decision 7 settled the frames and files below. Upstream's `b.rehearsal` frames, `rehearsal.js`, `rehearsalWorker.js`,
`delegateRehearsal` and their tests stay in place, unused in host mode, so upstream merges stay easy. Only the fork's additions went:
`SP_BOT_REHEARSAL_HOST`, `botRehearsalHost`, `canDelegateRehearsal`, the delegation's default-on and the fork's edits to `bot.js`, which
now differs from upstream only by its CPU meter. **So without `SP_BOT_EXECUTION=host` nothing offers a rehearsal to a browser any more:
with the live `SP_BOT_REHEARSAL=0`, bots keep their heuristic layout until the flag is on.**

**One fork addition to the dormant path (2026-11-09):** with `SP_BOT_REHEARSAL=host`, the server sends the host `b.rehearsalWarm` at
the briefing (and a new host on a host change), and `rehearsal.js` builds its Worker and hands it the data once the screen has settled.
A prep's tasks arrive together, each with its own answer window, and a cancel terminates a running Worker, so a cold start answered
none of round 1's tasks (`ioleta-adaptive-ws-delegation`). The windows, the timeout fallback and the cancel rules are unchanged.
(Review, 2026-11-09) A host that reconnects is warmed again (its page dropped the Worker with the socket), a Worker that a cancel
terminated is replaced by a warm one when nothing is queued, and host execution (`SP_BOT_EXECUTION=host`), where the server never
runs a bot prep and so never delegates a rehearsal, sends no warm at all.

| Item | Action |
|------|--------|
| `b.rehearsal`, `b.rehearsalResult`, `b.rehearsalCancel` | Remove from `shared/protocol.js` |
| `public/js/battle/rehearsal.js`, `rehearsalWorker.js` | Remove (replaced) |
| `delegateRehearsal`, `canDelegateRehearsal`, `_onRehearsalResult` and friends | Remove fork-only parts. Upstream's lines stay dormant unless decision 7 goes the other way. |
| `SP_BOT_REHEARSAL_HOST`, `botRehearsalHost` | Remove |
| `SP_BOT_REHEARSAL`, `SP_WORKERS` for bots | No effect in `host` mode, kept for tools and tests only |
| `test/match/rehearsal-delegate.test.js`, `rehearsal-client.test.js` | Replace with the new tests |
| `docs/design/network.md`, `docs/META.md`, `docs/design/match.md`, `DEPLOY` + `.en`, `FORK-CHANGELOG.md` | Update (the host rehearsal text is already stale for the fork) |

## Part D: tests

| Test | What it proves | How |
|------|----------------|-----|
| Snapshot round trip | Nothing is lost | snapshot → restore → snapshot is byte-identical, every prep, several seeds |
| **Same-seed parity** | The Worker path equals the in-process path | Same seed, seat streams on, two matches: `local` versus `host` with an in-process fake host running the real shadow. Compare a per-round hash of funds, shop, hand, board, pool and LP, plus the final summary. 8 seeds at 0 layouts, 2 at 3 layouts, covering all strategies, co-op, boss and DIY. |
| Strict shadow | A new field upstream adds gets caught | In tests the shadow is a Proxy that throws on any field not in the snapshot, naming it |
| Shared streams | Rolls stay separate | Assert the shared streams' states and caches appear nowhere in a serialized task |
| Server guard | The hard rule holds | In `host` mode bot decision code throws on the server, and `simMeter` `prep` / `rehearsal` / `headless` for bot fields stay at 0 |
| Protocol and failure paths | Stale, timeout, host change, forged frame, late frame, hurry, deadline, no host | Targeted Node tests with a scripted fake host |
| Browser parity | Chrome's Worker gives the moves Node gives | Fixture worlds from a Node run go through the real Worker. One targeted `SP_E2E` file. |
| **Phone timing** | Real phones cope | See below |
| Server load | The saving is real | Fake hosts: 50 rooms, 3 bots each. Report CPU per prep. Target about 5 ms per seat, per prep. |

**Phone timing test.** A dev-only page, `/dev/botbench.html`, runs fixture worlds (rounds 5, 10, 14) in the real Worker and
prints plan ms, rehearsal ms, candidates finished within budget, and worker start time. The user opens it on their phone
through a local link and reads the table. Chrome CPU throttling at 4× and 6× gives a repeatable stand-in on the desktop.

| Pass line | Target |
|-----------|--------|
| Worker start, first time in a match | under 5 s |
| `plan` stage, late round, one bot | under 2 s |
| Budget obeyed | within 500 ms |
| 3 bots, round 14 | done inside the prep budget, with at least the default + 2 candidates each |
| Page stays responsive | no long main-thread task from bot work |

**Server load, measured for piece 9 (`test/match/bot-load.test.js`, 2026-11-08):** 10 rooms of 1 human and 3 bots, 12 rounds, CPU time,
no rehearsals, fake battles, one desktop. The 5 ms target is missed, and most of the bot-specific part is applying moves.

| Per bot seat, per prep | CPU |
|---|---|
| Server, whole match, bots in the browser | 14–17 ms |
| of which snapshot and send (58.7 KB of JSON) | 2.3 ms |
| of which applying the moves | 6.6 ms |
| Server, whole match, bots on the server, the baseline | 86–95 ms |

Both whole-match figures include the harness's own frame checks. The baseline leaves out rehearsals and real battles, which cost a
server more, so the real saving is larger than this table shows. The design's 50 rooms took too long while other work ran on the
machine, so this uses 10 rooms; the number wanted is per seat, and two runs agreed within about 15 %.

## Part E: work split

**Stale moves, measured for piece 6:** 0 of 18 tasks went stale over 6 rounds with a human refreshing in the gap of every task,
the worst case the test can stage. These are early rounds with few bot refreshes, so re-measure in a real room with several humans.

Each piece merges on its own, with no live behaviour change until the flag is set in piece 6. Hours are one dev session's
working time, including its targeted tests.

| # | Piece | Needs | Hours | Done means |
|---|-------|-------|-------|------------|
| 1 | Seat streams + uid blocks: `withSeatStreams`, `seatStreams` option (off by default) | none | 2–3 | Same-seed runs stable with it on; golden unchanged with it off |
| 2 | Snapshot + restore: `botWorld.js`, `shadowMatch.js`, codec, Node-free graph check; first measure of size and cost | 1 | 6–8 | Round trip and strict shadow tests pass |
| 3 | Move recording + apply: recorder, `x` hash, allow-list, fake host; **same-seed parity test** | 2 | 4–6 | Parity passes on all seeds. **This is the go/no-go checkpoint.** |
| 4 | Browser delivery: `/match/` allow-list, `botWorker.js`, `botHost.js`, split `botStrategies` from `llmGate` | 3 | 4–6 | Browser parity test passes |
| 5 | Timing page + budgets in the Worker: slices, overrun → best layout, `/dev/botbench.html`, phone run | 4 | 3–4 | Pass lines met, or budgets re-set with the user |
| 6 | Live protocol: `b.botTask` / `botMoves` / `botAck` / `botCancel` / `botHurry`, queue, stale, failover, no-host path, `SP_BOT_EXECUTION=host` | 4 | 5–8 | Failure-path tests pass; a real 2-browser game works |
| 7 | Drafts, cards, AI takeover seats | 6 | 2–3 | Server guard covers all entry points |
| 8 | Bot battles on the host, normal fields | none (can go early) | 3–5 | `headless` meter stays at 0 for bot fields |
| 9 | Bot-only boss fields on the host + server load test | 6, 8 | 3–5 | Guard green on a full match; load report |
| 10 | Retire delegation, restore `bot.js` plumbing, docs and twins, FORK-CHANGELOG, remove `rehearsal*` (last) | 7, 9, 11 | 2–3 | Docs tests pass; `bot.js` diff from upstream shrinks |
| 11 | Old-version and plugin rooms: Worker loads the room's content, proxy forwards `hostId`, `setHost` and the bot frames (do before 10) | 6 | 4–6 | Parity passes on one old version, one data plugin and one script plugin; no bot code runs in the child |
| | **Total** | | **38–57** | |

Pieces 1→2→3 are one chain and are the risky ones. Piece 8 touches different files, so it can run in parallel or first, and it
cuts live server CPU sooner. A full-suite run and the perf benchmarks (`npm run test:perf`, run alone) stay one user-approved
step before merging piece 6 and again at the end.

After these: the existing deploy steps (art upload, preload zip, UpdateNews banner, new generation), and then the live flag.

**Upstream merges.** New files carry almost everything. The touch points in upstream's code are one branch in
`scheduleBotPrep`, one in `_authorityFor`, one line in `effectsMeta.js`, and the protocol entries. The strict-shadow test
names any field a future upstream bot change starts reading.

## Part F: open decisions

| # | Decision | Recommendation |
|---|----------|----------------|
| 1 | Move bot **real battles** to the host too? It is outside the brief's wording, but inside the hard rule. | **DECIDED by the user, 2026-11-07: yes.** |
| 2 | Bot seats get their own shop and meta streams, so the host's browser holds its bots' upcoming shop. | **DECIDED by the user, 2026-11-07: yes,** and the human player's UI must not show it (B1). Cheating is not a concern. |
| 3 | Snapshot shows the host's browser its teammates' whole seats, including shop, and a takeover seat's shop. | **Accepted on the same grounds** as decision 2 (cheating is not a concern), unless the user objects. Not shown in the UI either. |
| 4 | Gameplay-plugin rooms (see "Plugin and old-version rooms today") | **Open.** Recommendation changed after the re-check: **run them on the host like every other room** (piece 11), with no ban on AI seats. Until piece 11 lands, their bots use the no-host path. |
| 5 | Budget numbers in B8, including 6 layouts | **Accepted by the user, 2026-11-07.** Tell the user about anything that later affects the budget: phone test results, changed numbers, overruns. |
| 6 | Bot field with no host: synthetic result (no kills, no leaks, so no LP lost) | **Accept.** It only happens when nobody can run it. |
| 7 | Upstream's dormant delegation code: keep or delete? | **Keep upstream's lines dormant, delete only fork additions.** Fewer merge conflicts. |
| 8 | Bot emotes (`botEmotes.js`) are a trivial cosmetic random roll with no game effect. Keep on the server? | **Keep on the server** and treat it as messaging. Say so if the rule should cover it. |
| 9 | External AI (`decide`) waits on a network call and is off in release builds (`llmGate`). | **Leave as is,** and its fallback goes through the host queue |
| 10 | One Worker or several? Rehearsal alone could run in parallel on phones with spare cores. | **One for now.** Revisit only if the phone run says so. |

Human fields that still run on the server (`SP_VERIFY`, invalid-result takeovers, layer-trait fields) are not bot
calculation, so they are out of scope here. A follow-up could look at them if the load test shows they matter.

## Part G: risks

| Risk | Effect | Mitigation |
|------|--------|------------|
| Borrowed containers drag in much of `Match.js` | Piece 2 grows | Find out first in piece 2; split the container or borrow less |
| Effect handlers depend on something the shadow lacks | Parity fails | Strict shadow names the field; parity covers all strategies |
| Stale rate is high in rooms with several humans | Wasted host CPU, weaker bots | Only the cheap stage retries, capped at 3; measured in piece 6. If high, send the pool again just before each `plan`. |
| Very slow phone | Fewer candidates, in the worst case the default layout only | Budgets; failover to a faster human |
| Bot play quality shifts with shared timing | Differs from today's sweeps | Same code and same candidates; re-run the `tools/matchrun` comparison once at the end |
| A browser's `Math` gives a slightly different result | Different decisions only | Only 2 lines of `bot.js` use such functions and the handlers use none, so the server's results still match |
| Worker memory on phones (static data + 99 modules) | Possible tab kill | Timing page reports it; the page's parsed data is reused |

The biggest unknown is the go/no-go point after piece 3. If parity will not pass there, only about 12–17 h have been spent, and
nothing has changed live.
