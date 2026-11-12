## 2026-11-13

### OpFor: BlackCloud shows its official effects

- When OpFor: BlackCloud grabs flying enemies, each grabbed enemy now shows the official trapped effect until it is
  devoured. Before: nothing showed on them, and a red flash we made up played instead.
- Its salvo now fires the official shells, one per stored ammo and 0.3 s apart, each with its own impact. Before: a
  plain red line per shot.
- While it holds ammo it can't fire yet, it now glows as in the official game.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day): BlackCloud only comes from a Multi-Round Bounty | 0.0001 / 0 MB/s while a BlackCloud with prey is on the field |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | 0.0008 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.001 / 0 MB/s (under 0.1 / 0 GB/day) | 0.03 / 0 MB/s (2.6 / 0 GB/day, if every player fought one all day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB (one state probe per BlackCloud) |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round (nothing runs in the battle's ticks) |

- Cap: at most 4 effect rows per BlackCloud (3 grabbed enemies plus its glow), about 36 B each. They go out when they
  change, plus a full set once a second (shared/fxsDiff.js). A grab adds about 650 B per watcher every 10 s
  (its cooldown).
- Estimated from the code, not measured: the sim change is a display-only buff key and a snapshot-time probe
  (`server/sim/content/enemies/fly.js`); no event, no state the battle reads.
