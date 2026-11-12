## 2026-11-13

### OpFor: Quagmire's parasite and Degenbrecher's SP-clear mark show on operators

- With official effects on, the operator an OpFor: Quagmire latches onto now shows the official parasite for as long as
  it clings, as in the official game.
- In Degenbrecher's second form, each operator its SP clear disarms now shows the official mark for as long as the disarm
  lasts.
- Before: neither showed an official effect on the operator.

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

- Cap: one short row (about 30 bytes) in a battle snapshot per marked operator, only while the parasite clings or the
  disarm lasts.
- Estimated, not measured: display only; the battle's numbers and results are unchanged.
