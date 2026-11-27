## 2026-11-27

### Matches with players on another server keep your custom picks

- When matchmaking places you in a room on another server, your DIY squad picks, skill and module choices, potential and training, not-owned list, outfits, skins and seat card now come with you into that match.
- Before: if your arrival filled the room, the match started without them (for example, a DIY operator never appeared in your shop), and they only applied from the next match.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 3 KB out (room.move) and 3 KB in (room.join) once per cross-region move [src: I:/ClaudeCrew/work/dev-79/size.mjs, 20 loadout entries, 10 of each other setting] | 38 KB out and 38 KB in once per move, every setting at its limit [src: size.mjs, all 133 chess, 256 outfits and skins]; never over 60 KB [src: shared/protocol.js CROSS_CARRY_MAX_LEN] |
| Bandwidth out / in, per room (4 players) | 9 KB each way per cross-region room, 3 moved players [unverified] | 114 KB each way [unverified] |
| Bandwidth out / in, 300 players | under 0.001 MB/s each way (under 0.1 GB/day), even if every player moved once per match [unverified] | 0.4 MB/s each way, if all 300 maxed-out players moved in one 30 s window [unverified] |
| Server CPU | under 0.01 % of one core: one HMAC and the six settings checks per moved player, which the page's own resend already ran [unverified] | same |
| Memory | 0 MB kept: the carry is built and sent, never stored [src: server/lobby.js crossCarry] | 0 MB |
| Disk | 0 MB/day [src: no file writes added] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: one carry per moved Doctor per cross-region move, at most 60 KB [src: shared/protocol.js CROSS_CARRY_MAX_LEN]; a longer one is not sent. No server-to-server traffic is added [src: server/lobby.js crossMove].
- Sizes measured from signed carries of real game data; the rates are arithmetic on them, not traffic-meter runs.
