## 2026-11-15

### Solo matchmaking works with older seasons at any difficulty

- Each ticked season now waits at the difficulty it has: with Ultimate picked and every season ticked, Season 2 Part 2
  matches at Ultimate and Season 1 and Season 2 Part 1 match at Dire, the way creating a room of those seasons does.
- The matchmaking dialog says which ticked seasons will be matched at a lower difficulty before you start.
- Before: a pick that only Season 2 Part 2 has (Ultimate) with only an older season ticked was refused with "That
  version cannot be used in this room".

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out, per player | 99 B more per welcome (3 older seasons × 33 B of `coop`) [src: measured string length of the added field] + 0–86 B more per queue.state [src: measured string length of `at` with 3 seasons] | the same: both are sent on connect / queue change only [src: server/lobby.js sendQueue] |
| Bandwidth out / in, per room (4 players) | 0 MB/s: nothing is sent during a match [src: no match message changed] | 0 MB/s |
| Bandwidth out, 300 players | about 0.3 MB/day, estimated as 300 players × 10 connects a day × 99 B [unverified] | under 0.0001 MB/s at peak if all 300 reconnect within 1 s, 30 KB once [unverified] |
| Server-to-server (cross-region digest, every 2 s) | 0 MB/s while nobody waits at a lower difficulty [src: server/peerLink.js:26] | 0.013 MB/s, 1.1 GB/day if all 300 players sit in the queue with 3 lower seasons at once, estimated as 300 × 86 B every 2 s [unverified] |
| Server CPU | under 0.01 % of one core: one fallback per ticked season per queue.join [unverified] | the same per queue.join [unverified] |
| Memory | under 0.03 MB, estimated as 300 queued Doctors × about 100 B of `at` [unverified] | the same [unverified] |
| Disk | 0 MB/day [src: no file writes] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: `at` holds at most the enabled seasons (4) per queued Doctor [src: shared/versions.js VERSIONS]; welcome's `coop` at most 4 difficulties per season [src: shared/constants.js DIFFICULTIES]; the digest only lists Doctors already in the queue.
- Not measured with the traffic meter: only two optional fields are added; the numbers are the byte lengths of those fields.
