## 2026-11-13

### Jetman and Blackhorn Rhuul show their missing official skill effects

- With official effects on, Jetman now shows its official jets when it takes off, and Blackhorn Rhuul shows its
  official mark on the operator it charges and its official hit when the push fails, as in the official game.
- Before: these effects did not show.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | under 0.001 / 0 MB/s (under 0.01 / 0 GB/day) | under 0.001 / 0 MB/s (under 0.01 / 0 GB/day) |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | under 0.001 / 0 MB/s | under 0.001 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.01 / 0 MB/s (under 0.5 / 0 GB/day) | under 0.02 / 0 MB/s (under 1 / 0 GB/day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.01 ms/round |

- Cap: one small effect event (about 60 bytes) per Jetman take-off and two per Blackhorn Rhuul charge; each of them
  takes off at most once per block and charges at most once per cooldown.
- Estimated, not measured: display only; the battle's numbers and results are unchanged.
