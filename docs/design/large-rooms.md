# DESIGN §91 — Grand Alliance

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

## 91. Grand Alliance (大同盟, 8 seats) — `shared/largeRoom.js`, `server/lobby.js`, `server/match/match/largeRoom.js`, `ui/largeRooms.js`

`[ASSUMED]` A remake-only mode with no official source: the maintainer's decisions of 2026-11-08. A co-op room may have 8
seats instead of 4. It is for humans only and is off unless the server sets `SP_LARGE_ROOMS=1` (lobby option `largeRooms`).

- **Protocol**: `room.create { capacity: 8, password? }` (co-op on the default version only; `BAD_MSG` while the server keeps them
  off; `password`, 4 letters, creates it private, and `BAD_MSG` on any other room), `room.state.capacity` / `locked` / `password` (the password in the host's copy only; omitted for a normal room), `room.moveSeat { squad }`
  (any member, before the match, to the other squad's lowest free seat; an old page's `{ seat }` names that seat's squad;
  `BAD_TARGET` inside the own squad or into a full one, `RATE` over the squad-move limit), `room.swapSeats { a, b }` (the
  host, two seats of different squads, either may be empty; `BAD_TARGET` inside one squad),
  `room.setLock { on, password? }` (the host; 4 letters A–Z), `room.join` / `room.spectate { password? }` (`ROOM_LOCKED`
  without it or with a wrong one, `RATE` after 6 wrong ones in a minute from a session), `rooms.watch { on }` →
  `rooms.list { rooms: [{ code, host, seats, capacity, difficulty, squads, locked?, region? }] }` while watched,
  `welcome.largeRooms`, `room.closed { reason: 'idle' }`, `m.public.players[].squad`, `m.public.draft.lanes` /
  `sp.lanes`.
- **Humans only**: `room.addBot` and 「允许观战者接替 AI」 are refused. (2026-11-08) `room.search` is allowed, locked rooms
  too: matchmaking fills the empty seats with other Grand Alliances whose squads fit whole and with opted-in Doctors from
  the solo queue, never with a 4-seat room ([§90.4](matchmaking.md)). The lobby has a Grand Alliance mode (大同盟), and Team Simulation (选择同盟方式) a Grand
  Alliance card; both open a full-screen room browser of
  the open (not started, not full) rooms of this server, oldest first, at most 50 (2026-11-10: with regions, the linked
  servers' rooms too, each card naming its server and that server's ping — [§8.7](network.md); a key names its server,
  so Join reaches a room on the other one, password and all), with filters for public (公开) and
  private (私密) rooms, and a button that creates one; a key joins from anywhere. (2026-11-08) 创建大同盟 first opens
  选择模拟协议, where the host picks the difficulty and 公开 / 私密 (with the 4-letter password), so no room is made only
  to change its settings. In the room, a box beside the alliance key holds the host's 公开 | 私密 switch, which applies at
  once: 私密 gives the room 4 random letters as its password, shown beside the switch in a field the host types into (4 letters save on Enter or leaving the field; Esc puts the old ones back).
  Everyone else sees a read-only 公开 / 私密 label. It is not in 同盟设置, which keeps only the difficulty. The UI says private; the protocol keeps its `locked` / `room.setLock` names. Only the host gets that
  control and the password (the server puts it in the host's room.state alone; a new host gets it on migration). A private
  room still shows in the browser, marked, and joining or watching it — from the browser, by key or by invite link —
  asks for the password. The lock is a casual one: the 6-wrong-tries-a-minute limit
  counts per session, so a reconnect resets it, and 4 letters are about 457,000 combinations — enough to keep strangers
  out, not a secret. Gameplay plugins, plugin modes and other official versions
  are refused.
- **Squads**: seats 1–4 are squad A, 5–8 squad B, where the players sat. Nobody balances them: players join the other
  squad and the host swaps two players across the squads, so 6 players may be 3+3 or 4+2. With players in both squads the
  match has squads; everyone in one squad plays today's rules (still humans only).
- **Squad moves** (the user's decision of 2026-11-11, after a player hopped seats to spam the room): a member chooses a
  squad, never a seat, since the seat inside a squad means nothing in play (the draft order is shuffled). The page shows
  加入小队 (Join Squad) on the other squad's empty seats only; the server seats the mover in that squad's lowest free
  seat. [ASSUMED] One move per 5 s and at most 4 a minute per player (`shared/largeRoom.js` SQUAD_MOVE_*), kept on the
  room in memory (at most 16 players, 4 times each), so a reconnect or a rejoin does not reset it; the page counts its
  own moves the same way and shows the wait on the button. A move un-readies the mover; a host swap un-readies both
  players, never the host. The host's swap has no limit (the host already controls the room) but only crosses squads.
- **Pool**: one pool for the whole room. With more than 4 players at the start, every operator's and equipment's copies
  are multiplied by players ÷ 4, rounded up (tier 6: 10 → 20 at 8), so everyone fights over the same pool across squads.
  Bans are one draw for the room; each player's 自选 stock stays theirs.
- **Drafts** (with squads): each squad drafts on its own, both at once. The strategy draft goes in turn inside a squad
  with the usual turn time and skips, and 队友已选 holds inside the squad only. The 机变 draft gives each squad its own 6
  cards and turn order. The page shows its own squad's draft (`main.js squadView`). An AI-played seat takes the rule's
  pick at once (the highlighted or default strategy, a random card).
- **联防** (with squads): a relay. Round 1 is today's. What still gets through goes to the next 2 perfect players who have
  not helped yet, from either squad, with the round's normal time limit. After 2 rounds what is left is settled. Helpers of
  both rounds keep their kill bounties.
- **Final boss**: unchanged rules with more players: the living players are paired at random across the room, each pair
  on its own boss field, all fields drawing on one HP pool of base × players alive, and one team LP.
- **Scaled rules**: the Hidden Core threshold × players ÷ 4 (rounded up); the leader fight's overtime drain × players ÷ 4
  (2 LP a second at 8).
- **Absent players**: a disconnected player's board goes to the AI at once (`autoplay`) and back on reconnect. A player
  who leaves, is removed for idling, or does not come back before the rejoin window ends is eliminated, as in every room
  type (user, 2026-11-11): a battle they were fighting plays out to its end in a browser, and from the next round on
  nothing of theirs runs, no AI board, no prep, no battles. While the AI plays a dropped player's board, its prep and battles run in a browser — a squadmate's first (the host when the host is in that squad, else the lowest seat),
  then anyone's in the room — never on the server: the match always runs with host-side bots' browser mode
  (`botExecution: 'host'`, `botBattles: 'host'`), whatever the server's settings say. With no browser at all a battle
  gets host-side bots' synthetic result. The executor's result is checked on bounds only; the maintainer accepts that a
  browser could fake such a result within those bounds.
- **Idle seats**: a seat the prep deadline had to ready up 3 times in a row is removed (warned after the 2nd); any intent
  of its own resets the count.
- **Old generations**: a retired generation that still runs a large-room match (`/healthz` `largeMatches` > 0) is stopped
  105 minutes after it retired instead of 60: an 8-seat match with a relay 联防 can run about 91 minutes if every timer runs
  out (`scripts/generations.mjs` `LARGE_MAX_AGE_MS`). Every other generation keeps 60 (`MAX_AGE_MS`).
- **Idle count**: only the player's own prep and draft actions, emotes and chat reset it — never what the page sends by
  itself (battle reports, bot work for others, unit stats, a watch change).
- **联防 helpers**: a departed player is eliminated, so never a helper, in either relay round.

### 91.9 One for All — `server/match/match/oneForAll.js`, `ui/protocolBoot.js` (`reveal`)

`[ASSUMED]` A remake-only option of a Grand Alliance, the user's decisions of 2026-11-12: the room votes on one strategy in
secret and everyone plays the winner.

- **Room**: the host's 策略 switch (Free pick | One for All) at the bottom left of the room bar, before the match, Grand
  Alliances only (`room.create { oneForAll }`, `room.setOneForAll { on }`: `NOT_HOST` / `WRONG_PHASE` / `BAD_MSG`;
  `room.state.oneForAll`, `rooms.list[].oneForAll`; the browser's badge and filter). Switching it un-readies nobody; a
  room that is matchmaking restarts its search, since One for All rooms merge only with each other and take only solo
  Doctors who ticked 「包括 One for All 房间」 with the Grand Alliance tick ([§90.4](matchmaking.md)). The match gets
  `oneForAll: true` beside `largeRoom: true`.
- **The vote** (replaces the turn draft and the squad lanes): everyone votes at once, both squads together, on the usual
  draft screen with one 50 s clock (a single human: untimed). The page shows only the player's own card and 「已锁定的博士
  n / N」. All 40 strategies are votable, with no 队友已选; 本局禁用 marks stay; no skip. 确认选择 (`g.band`) locks the
  vote for good (`ALREADY` after it, for `g.bandFocus` too). The vote ends at once when no voter is left deciding: a
  dropped seat (the AI plays it) is not waited for.
- **Secret**: `m.public.draft = { mode: 'vote', voters, locked, order, picks: {}, turnDeadline, turnSeconds, untimed }`
  carries counts only; the player's own vote is `m.private.vote { bandId, locked }` (bandId once locked).
- **The close**: a vote not locked counts the highlighted strategy (`g.bandFocus`), else a random one; a dropped seat votes
  at random unless it had locked; a seat that left before the close loses its vote; AI seats never vote. Random = the
  mode's allowed strategies minus those built around a bond the mode switches off, drawn from `rngDraft` in seat order.
  Most votes wins; a tie is drawn from `rngDraft` among the tied strategies. Every seat gets the winner the way a pick
  does (its starting LP; a departed seat keeps its 0).
- **Reveal**: `m.public.draft = { mode: 'vote', reveal: { picks, random, counts, winner } }` during BATTLE_CHECK, which
  runs 7.5 s in this mode (`shared/largeRoom.js` ONE_FOR_ALL_CHECK_SECONDS) with no held draft screen. 协议启动！ shows
  up to 8 cards; each pick lands in a volley 70 ms apart (the room-join sound, panned by side), a random vote in a dashed
  frame marked 「未投票 · 随机」; the lines grow into a slot in the centre of the ship with the match-found cue, whose
  high note is the reveal (0.86 s after the lines start): the winner bursts into the slot under a gold 「全员！」 with the
  vote counts. The losing picks glitch one after another (the roguelike distortion cue, `sfx.ui.distort`) and snap to the
  winner (`itemMerge`); the unified screen holds about 3 s.
- **Effects**: each player gets the strategy's effects as their own; a global one applies once however many hold it
  (鸭爵 finds the first holder: `test/one-for-all.test.js`).
- **Stats**: `m.result.mode = 'oneForAll'`; the stats page lists it as its own mode.
