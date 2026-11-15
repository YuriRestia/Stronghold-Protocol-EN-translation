## 2026-11-15

### Solo matchmaking works with older versions at any difficulty

- Solo matchmaking with only Season 1 or Season 2 Part 1 ticked now queues at the nearest difficulty that version has
  (Abyss becomes Hard), the same way creating a room of that version does.
- Before: it was refused with "That version cannot be used in this room", because only Season 2 Part 2 has Abyss.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 MB/s change: queue.join answers one queue.state instead of one error frame [src: server/lobby.js queueJoin] | 0 MB/s change |
| Bandwidth out / in, per room (4 players) | 0 MB/s change [src: no new message or field] | 0 MB/s change |
| Bandwidth out / in, 300 players | 0 MB/s, 0 GB/day change [src: no new message or field] | 0 MB/s, 0 GB/day change |
| Server CPU | under 0.01 % of one core: two filters over at most 4 versions × 4 difficulties per queue.join [unverified] | the same, per queue.join (the socket's normal rate limit) [unverified] |
| Memory | 0 MB [src: no new state kept] | 0 MB |
| Disk | 0 MB/day [src: no file writes] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: queue.join is rate-limited as before; the work is bounded by the enabled versions (5) × difficulties (4) [src: shared/versions.js VERSIONS, shared/constants.js DIFFICULTIES].
- Not measured with the traffic meter: no message, field or timer is added.
