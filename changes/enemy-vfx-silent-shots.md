## 2026-11-13

### Heavy Crossbowman Ambusher and Lost Colossus show their shots

- Heavy Crossbowman Ambusher: its stunning bolt now flies with the official trail and hits with the official effect.
  Before: nothing showed between its aim and the stun.
- Lost Colossus: its stunning boulder now flies with the official trail and hits with the official effect. Before:
  nothing showed until the operator was stunned.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | under 0.00001 / 0 MB/s while these enemies are on the field |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | under 0.0001 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | under 0.003 / 0 MB/s (under 0.3 / 0 GB/day, if every player fought them all day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | 0 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: one new effect event of about 60 B per shot. The Crossbowman fires at most every 8 s, the Colossus every
  13 s.
- Estimated from the code, not measured (`server/sim/content/enemies/invisible.js`, `leaders.js`).
