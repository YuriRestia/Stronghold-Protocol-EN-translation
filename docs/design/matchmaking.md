# DESIGN §90 — Matchmaking

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

## 90. Matchmaking by room merge (搜寻队友) — `server/matchmaker.js`, `server/lobby.js`, `ui/matchSearch.js`

The official 搜寻队友 pairs strangers through a queue, which §0 left out of scope. Here searching co-op rooms merge in the lobby instead, and lone Doctors queue without a room (§90.1). ▸ marks a choice the owner left open.

- **Protocol**: `room.search {on}` (host, co-op lobby; `NOT_HOST`, `ROOM_STARTED`, `ROOM_FULL` for solo or full rooms, `NOT_READY`; `PLUGIN_BLOCKED` with gameplay plugins and `BAD_TARGET` in a test room: both are joined by code only), `room.state.searching` / `searchSince`, `room.closed {reason:'merged'}` for a spectator that does not fit.
- **Pools** (fork, 2026-11-08): a room meets only rooms of its pool — the same official version (§90.3), difficulty and size (a Grand Alliance only Grand Alliances, §90.4): `poolKey` in `server/matchmaker.js`.
- **Ready gate**: the host can search only while every other human is connected and ready. A searching room that stops being ready (an un-ready, a friend joining by code, a difficulty change, a drop) pauses until it is ready again.
- **Seats**: AI seats count as filled and are never displaced.
- **Merges** (`planMerges`, same pool only): exact fills to 4 first, bigger groups and older searches first. ▸ After `partialMergeAfterMs` (10 s) a room also merges with any room it fits, so 1+1 becomes a searching pair. Rooms move whole into the target (the bigger group, then the older search), which keeps its code and host. Moved humans arrive ready and keep their seat data (loadout, 补位 not-owned list, 自选编队 picks); their sessions follow the new code without a `room.closed`.
- **Start**: a full searching room starts at once, within `maxMatchesPerAddr` — (fork) a room of another version once every page has loaded its data (§90.3). Rooms that do not search keep the manual start. ▸ The search does not resume after the match.
- **Client**: the host's 搜寻队友 switch sits right above the big button (pref `room.findMates`, on by default), showing only its label and 开启 / 关闭; what each state means is its tooltip. A full room keeps its place empty, so the seat cards do not resize. While it is on and a seat is free, the big button is 搜寻队友 / 停止搜寻 instead of 开始模拟; it cannot be switched off mid-search. Empty seats read 搜寻中, the status line shows the search time, and a merge toasts 搜寻成功!. No queue size is shown anywhere: an empty-looking queue keeps people out of it (`sys.online.searching` is still sent, unused). The strings use the official `AUTO_CHESS_*` wording of each client where one exists.
- Tests: `test/matchmaker.test.js`, `test/lobby-matchmaking.test.js`.

### 90.1 Solo queue (单人匹配) — `server/soloQueue.js`, `ui/soloQueue.js`

A lone Doctor queues from the lobby without a room, so a room never takes solos one by one (each with a chance to leave) and the solo never sees a room screen.

- **Protocol**: `queue.join {difficulty, versions?, large?}` (`ROOM_STARTED` from a running match; leaves a lobby room; a repeat keeps the wait, also with other versions or opt-in; another difficulty starts over), `queue.leave`, `queue.ai`. The server answers `queue.state {queued, difficulty, since, aiAt, versions?, large?}` or `{queued:false, placed?}` (`versions` omitted for 第二期下半 alone, `large` when off, so a default queue.state is as before). Disconnect, expiry, `room.create`, `room.join` and `room.spectate` leave the queue.
- **Placement** (`planSolos`, every matchmaker pass, before room merges, per difficulty and version): searching rooms, oldest search first, take the longest-waiting solos who queued for their version only when that fills them (a room needing more than are left is skipped); the rest form new co-op rooms of exactly 4, version by version in the official order (第二期下半 first, so it wins a Doctor queued for several), hosted by the longest waiter whose network is under `maxMatchesPerAddr`. Fewer wait. Seats arrive ready with the session's loadout / not-owned / 自选 picks, and the match starts before any `room.state` goes out, so the first one already says `inMatch`.
- **AI fallback**: after `soloAiAfterMs` (2 min) `queue.ai` makes a co-op room of the Doctor and 3 AI, of the first version queued for, and starts it — (fork) another version's once the page has loaded it (§90.3) — (`NOT_READY` before then).
- **Client**: the 单人匹配 card is the third mode card, after 同盟模拟, and is the default on a first visit (pref `lobby.mode`). While queued the create box becomes the wait panel (time, 取消匹配, and 改为与 AI 队友模拟 once `aiAt` passes); the mode and difficulty cards and joining by key are locked, 返回 leaves the queue, a lost connection drops it with a toast. No queue size is shown.
- Tests: `test/lobby-soloqueue.test.js`.

### 90.2 Across regions — `server/crossMatch.js`, `Lobby.cross*`, `public/js/regions.js`

With several servers (§8.7) under `SP_CROSS_MATCH=1` and the same `SP_PEER_SECRET`, matchmaking still fills rooms locally first. A search or a queued Doctor that has waited `crossAfterMs` (`SP_CROSS_AFTER_MS`, default 15 s) also enters a pass on the arbiter, the first region, which sees every region's waiters over the link.

- **Exact fills only** (`planCross`: `planSolos`, then `planMerges` with partial merges off, over both servers' waiters). Nobody moves into a room that does not start at once, and nobody moves twice. A plan inside one region is left to that region's matchmaker. Rooms without gameplay plugins take part, (fork) of any version every region enables (each digest lists `versions`; a queued Doctor's versions are narrowed to those), and only between servers on the same generation, protocol and game data, so a rolling deploy makes each server local until both match.
- **Where it plays.** The region with the most humans; a tie goes to the longest wait. (fork) A Grand Alliance plan plays where its target room is (§90.4).
- **Reserve.** The target server checks its members are still waiting, merges them into one room (a new room hosted by its longest-waiting Doctor when it has only solos) and holds seats for the rest: `room.reservations`, with the group's AI seats added at once. A room holding seats pauses (`groupReady` false), and its held seats are free only to a signed ticket. Any member that stopped waiting refuses the plan before anything moves.
- **Move.** Each other server checks its members the same way, and refuses if their human or AI counts differ from the plan, since a Doctor who joined since would find no held seat. It then sends every Doctor `room.move { region, code, ticket }` and closes the room (`room.closed { reason: 'moved' }`). A spectator stays behind, as one that does not fit a local merge does. A source that refuses is released, and its seats reopen.
- **Arrive.** The browser joins on the target with `room.join { code, ticket }` and sits down ready and `matched`. The client resends its loadout as after any welcome. The match starts when the last one sits down.
- **Never arrives.** Held seats and tickets last `RESERVE_TTL_MS` (15 s). Then the seats reopen, the AI seats leave if none of that group's Doctors came, and the room goes on searching. A browser that cannot reach the target is told so and stays in the lobby on its own server.
- ▸ [ASSUMED] A local solo in a new cross-region room sees the room screen until the others arrive, about 1–3 s, instead of going straight to the match.
- Tests: `test/regions.test.js`, `test/ui/regions.test.js`, `test/ui/regions.e2e.test.js`.

### 90.3 Official versions (fork, 2026-11-08) — `poolKey`, `Lobby.waitContent`, `ui/screens/lobby.js` QueueOptions

The owner's decision of 2026-11-08: matchmaking matches by version, and a queued Doctor chooses which versions to be matched for.

- **Rooms.** A room of any official version (§35.23) may search; it merges only with rooms of its version. A version switch while searching keeps the search, in the new version's pool (a lone host's switch applies at once; otherwise the others are un-readied and the room pauses). It is refused (`NOT_READY`) while the room holds seats for a group from another server, which queued for its version; a merge into the room or a solo placement voids an open version vote, as a join does.
- **Queue.** `queue.join.versions` lists the versions (left out: 第二期下半 alone). One this server does not enable is `VERSION_UNKNOWN`; one whose data is not available, or without co-op rooms at that difficulty, is dropped, and none left is `VERSION_UNSUPPORTED`. A Doctor queued for several sits in the first room of any of them that fills; a new room plays the first of the versions in the official order that 4 of them share.
- **Loading.** A matchmade room of another version starts once every human's page has loaded that version's data (`seats[].content` ready, as `room.start` requires): until then the full room keeps searching and each pass tries the start again. A page that reports `ok: false`, or any page not ready after `contentWaitMs` (60 s [ASSUMED]), leaves the room with `room.closed { reason: 'content' }` and the room searches on. The wait belongs to a full, ready room: it starts over once the room is that again. A merged seat keeps its content check only when both rooms play the same content set. A room formed from the queue for another version searches while it waits, so it fills again if someone leaves.
- **Client.** The 单人匹配 card shows on every lobby version. 选择模拟协议 there ticks the versions (`lobby.queueVersions`, default the lobby's; at least one stays ticked); the difficulties shown are the lobby version's, and the server drops a ticked version without that difficulty. 搜寻队友 shows in rooms of every version.
- Tests: `test/matchmaker.test.js`, `test/lobby-soloqueue.test.js`, `test/lobby-matchmaking.test.js`.

### 90.4 Grand Alliances (fork, 2026-11-08) — `fitSquads`, `Room.freeSeatIn`

The owner's decision of 2026-11-08 reverses "Grand Alliances never get matchmaking" (§91): every Grand Alliance, locked or not, has the 搜寻队友 switch to fill its empty seats.

- **Who fills them.** Only Doctors from the solo queue who opted in (`queue.join.large`, offered only while the server has Grand Alliances and 第二期下半 is ticked: they play it alone), and other searching Grand Alliances. A 4-seat room never merges into one.
- **Merges.** Grand Alliances merge only with Grand Alliances, and only when every squad of the source fits whole into one squad of the target (`fitSquads`, squad A tried first); the rest is §90: exact fills to 8 first, a partial merge after `partialMergeAfterMs`.
- **Solos.** Exact fills first, as for any room. ▸ [ASSUMED] A Grand Alliance that has searched `partialMergeAfterMs` also takes opted-in Doctors who waited that long, after the queue has formed what normal rooms it can: they sit in its room screen until it fills (8 would almost never fill exactly). They go to the first empty seat.
- **Locked rooms.** A search lets matchmade Doctors in without the password: by searching, the host opened the room. The room stays locked for joins by key.
- **Start.** Full at 8, it starts at once like any matchmade room.
- **Across regions.** As §90.2, exact fills only: digests carry `cap` and `squads`; the plan plays where its target room is; the target holds seats per squad (`reservations[].squads`), the reserve answer names each incoming room's target squads (`assign`) and each queued Doctor's (`soloSquads`), `room.move` carries `squad`, and `room.join { ticket, squad }` sits in that squad (another with a held seat when it is full). A key join to a room with held seats takes a seat only in a squad with room beyond them.
- **AI.** No AI seat is ever added: Grand Alliances take humans only, so matchmaking adds nothing to the bot budget.
- Tests: `test/matchmaker.test.js`, `test/lobby-matchmaking.test.js`, `test/regions.test.js`.
- **One for All** (fork, 2026-11-12, [§91.9](large-rooms.md)): `oneForAll` is part of the pool key, so a One for All
  Grand Alliance merges only with other One for All rooms, and keeps the flag through a merge. It takes only solo-queue
  Doctors who ticked 「也可加入一策同心房间」 (`queue.join.oneForAll`, only with `large`; off by default). Switching it
  while searching restarts the search. [ASSUMED] Own server only for now: the cross-region matchmaker never plans a One
  for All room (a later step).
