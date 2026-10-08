# DESIGN §27 — Matchmaking

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

## 27. Matchmaking by room merge (搜寻队友) — `server/matchmaker.js`, `server/lobby.js`, `ui/matchSearch.js`

The official 搜寻队友 pairs strangers through a queue, which §0 left out of scope. Here searching co-op rooms merge in the lobby instead, and lone Doctors queue without a room (§27.1). ▸ marks a choice the owner left open.

- **Protocol**: `room.search {on}` (host, co-op lobby; `NOT_HOST`, `ROOM_STARTED`, `ROOM_FULL` for solo or full rooms, `NOT_READY`), `room.state.searching` / `searchSince`, `room.closed {reason:'merged'}` for a spectator that does not fit.
- **Ready gate**: the host can search only while every other human is connected and ready. A searching room that stops being ready (an un-ready, a friend joining by code, a difficulty change, a drop) pauses until it is ready again.
- **Seats**: AI seats count as filled and are never displaced.
- **Merges** (`planMerges`, same difficulty only): exact fills to 4 first, bigger groups and older searches first. ▸ After `partialMergeAfterMs` (10 s) a room also merges with any room it fits, so 1+1 becomes a searching pair. Rooms move whole into the target (the bigger group, then the older search), which keeps its code and host. Moved humans arrive ready and keep their seat data (loadout, 补位 not-owned list, 自选编队 picks); their sessions follow the new code without a `room.closed`.
- **Start**: a full searching room starts at once, within `maxMatchesPerAddr`. Rooms that do not search keep the manual start. ▸ The search does not resume after the match.
- **Client**: the host's strip above the room bar holds the 搜寻队友 switch (pref `room.findMates`, on by default). While it is on and a seat is free, the big button is 搜寻队友 / 停止搜寻 instead of 开始模拟; it cannot be switched off mid-search. Empty seats read 搜寻中, the status line shows the search time, and a merge toasts 搜寻成功!. No queue size is shown anywhere: an empty-looking queue keeps people out of it (`sys.online.searching` is still sent, unused). The strings use the official `AUTO_CHESS_*` wording of each client where one exists.
- Tests: `test/matchmaker.test.js`, `test/lobby-matchmaking.test.js`.

### 27.1 Solo queue (单人匹配) — `server/soloQueue.js`, `ui/soloQueue.js`

A lone Doctor queues from the lobby without a room, so a room never takes solos one by one (each with a chance to leave) and the solo never sees a room screen.

- **Protocol**: `queue.join {difficulty}` (`ROOM_STARTED` from a running match; leaves a lobby room; a repeat keeps the wait), `queue.leave`, `queue.ai`. The server answers `queue.state {queued, difficulty, since, aiAt}` or `{queued:false, placed?}`. Disconnect, expiry, `room.create`, `room.join` and `room.spectate` leave the queue.
- **Placement** (`planSolos`, every matchmaker pass, before room merges, per difficulty): searching rooms, oldest search first, take the longest-waiting solos only when that fills them to exactly 4 (a room needing more than are left is skipped); the rest form new co-op rooms of exactly 4, hosted by the longest waiter whose network is under `maxMatchesPerAddr`. Fewer wait. Seats arrive ready with the session's loadout / not-owned / 自选 picks, and the match starts before any `room.state` goes out, so the first one already says `inMatch`.
- **AI fallback**: after `soloAiAfterMs` (2 min) `queue.ai` makes a co-op room of the Doctor and 3 AI and starts it (`NOT_READY` before then).
- **Client**: the 单人匹配 card is the third mode card, after 同盟模拟, and is the default on a first visit (pref `lobby.mode`). While queued the create box becomes the wait panel (time, 取消匹配, and 改为与 AI 队友模拟 once `aiAt` passes); the mode and difficulty cards and joining by key are locked, 返回 leaves the queue, a lost connection drops it with a toast. No queue size is shown.
- Tests: `test/lobby-soloqueue.test.js`.
