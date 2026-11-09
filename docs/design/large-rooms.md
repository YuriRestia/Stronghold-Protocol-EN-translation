# DESIGN §91 — Grand Alliance

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

## 91. Grand Alliance (大同盟, 8 seats) — `shared/largeRoom.js`, `server/lobby.js`, `server/match/match/largeRoom.js`, `ui/largeRooms.js`

`[ASSUMED]` A remake-only mode with no official source: the maintainer's decisions of 2026-11-08. A co-op room may have 8
seats instead of 4. It is for humans only and is off unless the server sets `SP_LARGE_ROOMS=1` (lobby option `largeRooms`).

- **Protocol**: `room.create { capacity: 8, password? }` (co-op on the default version only; `BAD_MSG` while the server keeps them
  off; `password`, 4 letters, creates it private, and `BAD_MSG` on any other room), `room.state.capacity` / `locked` / `password` (the password in the host's copy only; omitted for a normal room), `room.moveSeat { seat }`
  (any member, before the match, to an empty seat), `room.swapSeats { a, b }` (the host, either seat may be empty),
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
- **Squads**: seats 1–4 are squad A, 5–8 squad B, where the players sat. Nobody balances them: players move to an empty
  seat and the host swaps two seats, so 6 players may be 3+3 or 4+2. With players in both squads the match has squads;
  everyone in one squad plays today's rules (still humans only).
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
  who leaves, or is removed for idling, keeps their board in the match under the AI instead of being eliminated. Its prep
  and battles run in a browser — a squadmate's first (the host when the host is in that squad, else the lowest seat),
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
- **联防 helpers**: a departed player whose board the AI plays is never a helper, in either relay round.
