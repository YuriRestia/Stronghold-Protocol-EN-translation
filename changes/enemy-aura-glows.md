## 2026-11-13

### Enemy auras show their official glow on the units they reach

- With official effects on, the units an enemy aura reaches now show that aura's official effect while they are in it,
  as in the official game: the other enemies near a Defender-4 (its DEF glow), operators near a Frost (its frost),
  a Dublinn Phalanx Infantry or Commander next to another one, and operators in an activated Profane Chimera's
  pollution aura.
- Before: only the enemy's own range ring showed; the units it buffed or slowed showed nothing.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | 0 / 0 MB/s (0 / 0 GB/day) |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | 0 / 0 MB/s (0 / 0 GB/day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.01 ms/round |

- Cap: two more fields on the aura buff the sim already adds every 0.25–0.5 s per enemy and unit in reach; the effect
  key is read only when the browser takes its own snapshot of the battle.
- Estimated, not measured: display only, no new messages; the battle's numbers and results are unchanged.
