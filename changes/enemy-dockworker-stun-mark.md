## 2026-11-13

### Dockworkers' stunning hit shows its official stun mark

- With official effects on, the operator a Dockworker or Dockworker Leader stuns with its heavy hit now shows the
  official stun mark for as long as the stun lasts, as in the official game.
- Before: the stun showed no official mark.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | under 0.001 / 0 MB/s (under 0.01 / 0 GB/day) | under 0.001 / 0 MB/s (under 0.05 / 0 GB/day) |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | under 0.001 / 0 MB/s | under 0.001 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.01 / 0 MB/s (under 0.5 / 0 GB/day) | under 0.02 / 0 MB/s (under 2 / 0 GB/day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.01 ms/round |

- Cap: one short row (about 25 bytes) in a battle snapshot per stunned operator, only while a Dockworker's stun lasts.
- Estimated, not measured: display only; the battle's numbers and results are unchanged.
