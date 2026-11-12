## 2026-11-13

### 'OpFor: Gun' charge hits with the official effect

- Each unit that 'OpFor: Gun' runs over in its charge now shows the official hit effect, once, as it is struck.
  Before: the units took the damage with no effect on them.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day): 'OpFor: Gun' is a boss round enemy | 0.00004 / 0 MB/s during a charge that hits every unit |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | 0.0003 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.001 / 0 MB/s (under 0.1 / 0 GB/day) | 0.012 / 0 MB/s, only during the 1 s after a charge's hits (a charge every 30 s at most) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB (one hit entry per unit hit, for 1 s) |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.1 ms/round (one entry per unit the charge already hits) |

- Cap: one hit row per unit a charge hits (each unit is hit once per charge), about 36 B each, gone after 1 s.
  They go out when they appear and go, plus in the full set once a second (shared/fxsDiff.js). No new event.
- Estimated from the code, not measured: the sim change is a display-only state (`Battle.fxState`) the battle never
  reads, in `server/sim/content/bosses.js` kitGun.
