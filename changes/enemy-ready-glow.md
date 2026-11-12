## 2026-11-13

### Defense Crushers, Dockworkers and the Armorless Union Cleanup Squad show their official glow before a special attack

- With official effects on, the Defense Crusher, the Defense Crusher Leader, the Dockworker, the Dockworker Leader and
  the Armorless Union Cleanup Squad now glow, as in the official game, while their next attack is their stunning or
  heavy one. The glow goes away with that attack.
- Before: there was no warning before these attacks.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | under 0.001 / 0 MB/s (under 0.01 / 0 GB/day) | under 0.002 / 0 MB/s (under 0.1 / 0 GB/day) |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | under 0.001 / 0 MB/s | under 0.002 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.02 / 0 MB/s (under 1 / 0 GB/day) | under 0.05 / 0 MB/s (under 4 / 0 GB/day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.05 ms/round |

- Cap: one short row (about 25 bytes) in a battle snapshot per enemy with an every-Nth-attack skill, only while its next
  attack is that one; the check is one counter test per snapshot, no search.
- Estimated, not measured: display only; the battle's numbers and results are unchanged.
