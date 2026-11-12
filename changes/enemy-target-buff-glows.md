## 2026-11-13

### Enemy buffs and burns show their official effects on the units that have them

- With official effects on, these now show their official effect for as long as they last, as in the official game:
  'Pompeii''s burn on the operators it hits, 'Gravestone''s barrier around it, Fallen Snowpriest's buff on the
  enemies its chain reaches, and Garum Gourmet's barrel zone on the enemies in it.
- Before: the units showed nothing while they had them.

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

- Cap: two more fields on buffs the sim already adds; the effect key is read only when the browser takes its own
  snapshot of the battle.
- Estimated, not measured: display only, no new messages; the battle's numbers and results are unchanged.
