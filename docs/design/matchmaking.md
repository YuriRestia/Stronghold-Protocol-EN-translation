# DESIGN §26 — Matchmaking

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

## 26. Matchmaking by room merge (搜寻队友) — `server/matchmaker.js`, `server/lobby.js`, `ui/matchSearch.js`

The official 搜寻队友 pairs strangers through a queue, which §0 left out of scope. Here searching co-op rooms merge in the lobby instead; there is no queue and no new screen. ▸ marks a choice the owner left open.

- **Protocol**: `room.search {on}` (host, co-op lobby; `NOT_HOST`, `ROOM_STARTED`, `ROOM_FULL` for solo or full rooms, `NOT_READY`), `room.state.searching` / `searchSince`, `room.closed {reason:'merged'}` for a spectator that does not fit.
- **Ready gate**: the host can search only while every other human is connected and ready. A searching room that stops being ready (an un-ready, a friend joining by code, a difficulty change, a drop) pauses until it is ready again.
- **Seats**: AI seats count as filled and are never displaced.
- **Merges** (`planMerges`, same difficulty only): exact fills to 4 first, bigger groups and older searches first. ▸ After `partialMergeAfterMs` (10 s) a room also merges with any room it fits, so 1+1 becomes a searching pair. Rooms move whole into the target (the bigger group, then the older search), which keeps its code and host. Moved humans arrive ready and keep their seat data (loadout, 补位 not-owned list, 自选编队 picks); their sessions follow the new code without a `room.closed`.
- **Start**: a full searching room starts at once, within `maxMatchesPerAddr`. Rooms that do not search keep the manual start. ▸ The search does not resume after the match.
- **Client**: the host's search strip sits above the room bar, empty seats read 搜寻中, the status line shows the search time, and a merge toasts 搜寻成功!. The lobby shows a one-time announcement (pref `news.matchSearch`). The strings use the official `AUTO_CHESS_*` wording of each client where one exists.
- Tests: `test/matchmaker.test.js`, `test/lobby-matchmaking.test.js`.
