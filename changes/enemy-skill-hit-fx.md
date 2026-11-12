## 2026-11-13

### Corrupted Knight, Withered Knight and 'Armor of the Empire' show their missing official effects

- With official effects on, the Corrupted Knight's charged hammer now shows its official hit and cross on the operator
  it strikes, the knight left standing shows its official rage glow once its partner falls, and 'Armor of the
  Empire''s multi-hit shows its official hit, as in the official game.
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

- Cap: two small effect events (about 60 bytes each) per charged hammer and one per multi-hit, each at most once per
  skill cooldown; the rage glow is one display-only field on a buff the sim already adds.
- Estimated, not measured: display only; the battle's numbers and results are unchanged.
