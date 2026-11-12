## 2026-11-13

### 'Free' marks its next target and its cross hits as in the official game

- 'Free' now shows its official mark on the unit its Weft and Warp cross will hit next: the nearest unit,
  and in its second form also the farthest one. The mark moves as soon as another unit becomes the nearer (or
  farther) one. Before: nothing showed which unit it was aiming at.
- The cross now lands with the official hit effect on its target. Before: a plain red outline we made up.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day): 'Free' only comes from a bounty | 0.00002 / 0 MB/s while a 'Free' is on the field |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | 0.0002 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.001 / 0 MB/s (under 0.1 / 0 GB/day) | 0.006 / 0 MB/s (0.5 / 0 GB/day, if every player fought one all day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB (two mark entries per 'Free') |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 1 ms/round (one distance sort of the units every 0.1 s while a 'Free' stands) |

- Cap: at most 2 mark rows per 'Free', about 36 B each. They go out when the marked unit changes, plus a full set
  once a second (shared/fxsDiff.js). No new event: the cross's hit plays for the fx the battle already sends.
- Estimated from the code, not measured: the sim change is a display-only state (`Battle.fxState`) the battle never
  reads, refreshed every 0.1 s in `server/sim/content/enemies/leaders.js`.
