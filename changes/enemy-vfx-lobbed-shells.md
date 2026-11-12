## 2026-11-13

### Enemy shells, bombs and blast arrows show their official effects

- Londinium Precision Mobile Defense Artillery: each shell of its bombardment now lands with the official hit and
  blast. Before: a plain flash.
- W: her C4 now shows on the operator it is stuck to, and goes off with the official blast. Before: a plain warning
  circle and flash.
- Withered Knight: its blast arrows now fly with the official trail, mark each target until they go off, and explode
  with the official blast. A Withered Knight enraged by its partner's death now shows the official rage effect.
  Before: a plain warning cross and flash, and nothing for the rage.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | under 0.00005 / 0 MB/s while these enemies fire |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | under 0.0004 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | under 0.015 / 0 MB/s (under 1.3 / 0 GB/day, if every player fought them all day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round (nothing runs in the battle's ticks) |

- Cap: each shell, C4 and arrow effect carries one or two more numbers (who fired, at whom), about 20 B. A Withered
  Knight's arrows add up to 3 effect rows of about 36 B for their 2.5 s fuse, and an enraged knight one row. Rows
  go out when they change, plus a full set once a second (shared/fxsDiff.js).
- Estimated from the code, not measured (`server/sim/content/enemies/leaders.js`, `special.js`).
