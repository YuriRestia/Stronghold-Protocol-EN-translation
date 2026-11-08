# DESIGN §91 — Grand Alliance

Part of [DESIGN.md](../DESIGN.md) (the index; section numbers are global).

## 91. Grand Alliance (大同盟, 8 seats) — `shared/largeRoom.js`, `server/lobby.js`, `server/match/match/largeRoom.js`, `ui/largeRooms.js`

`[ASSUMED]` A remake-only mode with no official source: the maintainer's decisions of 2026-11-08. A co-op room may have 8
seats instead of 4. It is for humans only and is off unless the server sets `SP_LARGE_ROOMS=1` (lobby option `largeRooms`).

- **Protocol**: `room.create { capacity: 8 }` (co-op on the default version only; `BAD_MSG` while the server keeps them
  off), `room.state.capacity` / `locked` / `password` (the password in the host's copy only; omitted for a normal room), `room.moveSeat { seat }`
  (any member, before the match, to an empty seat), `room.swapSeats { a, b }` (the host, either seat may be empty),
  `room.setLock { on, password? }` (the host; 4 letters A–Z), `room.join` / `room.spectate { password? }` (`ROOM_LOCKED`
  without it or with a wrong one, `RATE` after 6 wrong ones in a minute from a session), `rooms.watch { on }` →
  `rooms.list { rooms: [{ code, host, seats, capacity, difficulty, squads, locked? }] }` while watched,
  `welcome.largeRooms`, `room.closed { reason: 'idle' }`, `m.public.players[].squad`, `m.public.draft.lanes` /
  `sp.lanes`.
- **Humans only, no matchmaking**: `room.addBot`, `room.search` and 「允许观战者接替 AI」 are refused; matchmaking and the solo
  queue never place anyone in one. The lobby has a Grand Alliance mode (大同盟), and Team Simulation (选择同盟方式) a Grand
  Alliance card; both open a full-screen room browser of
  the open (not started, not full) rooms of this server, oldest first, at most 50, with filters for open and locked
  rooms, and a button that creates one; a key joins from anywhere. The host may lock the room with a 4-letter password
  from the lock button beside the alliance key — not in 同盟设置, which keeps only the difficulty. Only the host gets that
  control and the password (the server puts it in the host's room.state alone; a new host gets it on migration). A locked
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
