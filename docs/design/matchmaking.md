# DESIGN §90 — Matchmaking

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

## 90. Matchmaking by room merge (搜寻队友) — `server/matchmaker.js`, `server/lobby.js`, `ui/matchSearch.js`

The official 搜寻队友 pairs strangers through a queue, which §0 left out of scope. Here searching co-op rooms merge in the lobby instead, and lone Doctors queue without a room (§90.1). ▸ marks a choice the owner left open.

- **Protocol**: `room.search {on}` (host, co-op lobby; `NOT_HOST`, `ROOM_STARTED`, `ROOM_FULL` for solo or full rooms, `NOT_READY`), `room.state.searching` / `searchSince`, `room.closed {reason:'merged'}` for a spectator that does not fit.
- **Ready gate**: the host can search only while every other human is connected and ready. A searching room that stops being ready (an un-ready, a friend joining by code, a difficulty change, a drop) pauses until it is ready again.
- **Seats**: AI seats count as filled and are never displaced.
- **Merges** (`planMerges`, same difficulty only): exact fills to 4 first, bigger groups and older searches first. ▸ After `partialMergeAfterMs` (10 s) a room also merges with any room it fits, so 1+1 becomes a searching pair. Rooms move whole into the target (the bigger group, then the older search), which keeps its code and host. Moved humans arrive ready and keep their seat data (loadout, 补位 not-owned list, 自选编队 picks); their sessions follow the new code without a `room.closed`.
- **Start**: a full searching room starts at once, within `maxMatchesPerAddr`. Rooms that do not search keep the manual start. ▸ The search does not resume after the match.
- **Client**: the host's 搜寻队友 switch sits right above the big button (pref `room.findMates`, on by default), showing only its label and 开启 / 关闭; what each state means is its tooltip. A full room keeps its place empty, so the seat cards do not resize. While it is on and a seat is free, the big button is 搜寻队友 / 停止搜寻 instead of 开始模拟; it cannot be switched off mid-search. Empty seats read 搜寻中, the status line shows the search time, and a merge toasts 搜寻成功!. No queue size is shown anywhere: an empty-looking queue keeps people out of it (`sys.online.searching` is still sent, unused). The strings use the official `AUTO_CHESS_*` wording of each client where one exists.
- Tests: `test/matchmaker.test.js`, `test/lobby-matchmaking.test.js`.

### 90.1 Solo queue (单人匹配) — `server/soloQueue.js`, `ui/soloQueue.js`

A lone Doctor queues from the lobby without a room, so a room never takes solos one by one (each with a chance to leave) and the solo never sees a room screen.

- **Protocol**: `queue.join {difficulty}` (`ROOM_STARTED` from a running match; leaves a lobby room; a repeat keeps the wait), `queue.leave`, `queue.ai`. The server answers `queue.state {queued, difficulty, since, aiAt}` or `{queued:false, placed?}`. Disconnect, expiry, `room.create`, `room.join` and `room.spectate` leave the queue.
- **Placement** (`planSolos`, every matchmaker pass, before room merges, per difficulty): searching rooms, oldest search first, take the longest-waiting solos only when that fills them to exactly 4 (a room needing more than are left is skipped); the rest form new co-op rooms of exactly 4, hosted by the longest waiter whose network is under `maxMatchesPerAddr`. Fewer wait. Seats arrive ready with the session's loadout / not-owned / 自选 picks, and the match starts before any `room.state` goes out, so the first one already says `inMatch`.
- **AI fallback**: after `soloAiAfterMs` (2 min) `queue.ai` makes a co-op room of the Doctor and 3 AI and starts it (`NOT_READY` before then).
- **Client**: the 单人匹配 card is the third mode card, after 同盟模拟, and is the default on a first visit (pref `lobby.mode`). While queued the create box becomes the wait panel (time, 取消匹配, and 改为与 AI 队友模拟 once `aiAt` passes); the mode and difficulty cards and joining by key are locked, 返回 leaves the queue, a lost connection drops it with a toast. No queue size is shown.
- Tests: `test/lobby-soloqueue.test.js`.

### 90.2 Across regions — `server/crossMatch.js`, `Lobby.cross*`, `public/js/regions.js`

With several servers (§8.7) under `SP_CROSS_MATCH=1` and the same `SP_PEER_SECRET`, matchmaking still fills rooms locally first. A search or a queued Doctor that has waited `crossAfterMs` (`SP_CROSS_AFTER_MS`, default 15 s) also enters a pass on the arbiter, the first region, which sees every region's waiters over the link.

- **Exact fills only** (`planCross`: `planSolos`, then `planMerges` with partial merges off, over both servers' waiters). Nobody moves into a room that does not start at once, and nobody moves twice. A plan inside one region is left to that region's matchmaker. Only default-version rooms without gameplay plugins take part, and only between servers on the same generation, protocol and game data, so a rolling deploy makes each server local until both match.
- **Where it plays.** The region with the most humans; a tie goes to the longest wait.
- **Reserve.** The target server checks its members are still waiting, merges them into one room (a new room hosted by its longest-waiting Doctor when it has only solos) and holds seats for the rest: `room.reservations`, with the group's AI seats added at once. A room holding seats pauses (`groupReady` false), and its held seats are free only to a signed ticket. Any member that stopped waiting refuses the plan before anything moves.
- **Move.** Each other server checks its members the same way, and refuses if their human or AI counts differ from the plan, since a Doctor who joined since would find no held seat. It then sends every Doctor `room.move { region, code, ticket }` and closes the room (`room.closed { reason: 'moved' }`). A spectator stays behind, as one that does not fit a local merge does. A source that refuses is released, and its seats reopen.
- **Arrive.** The browser joins on the target with `room.join { code, ticket }` and sits down ready and `matched`. The client resends its loadout as after any welcome. The match starts when the last one sits down.
- **Never arrives.** Held seats and tickets last `RESERVE_TTL_MS` (15 s). Then the seats reopen, the AI seats leave if none of that group's Doctors came, and the room goes on searching. A browser that cannot reach the target is told so and stays in the lobby on its own server.
- ▸ [ASSUMED] A local solo in a new cross-region room sees the room screen until the others arrive, about 1–3 s, instead of going straight to the match.
- Tests: `test/regions.test.js`, `test/ui/regions.test.js`, `test/ui/regions.e2e.test.js`.
