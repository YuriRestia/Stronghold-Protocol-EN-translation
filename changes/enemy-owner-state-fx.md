## 2026-11-13

### 'Armor Cleaver', 'Armor Crusher' and the Tyrant Captain show their missing official effects

- With official effects on, 'Armor Cleaver' and 'Armor Crusher' now show their official dizzy effect while they are
  shot down, and Sarkaz Absurdist Tyrant Captain's splashing first attack shows its official hit and its ring on the
  target, as in the official game.
- Before: neither effect showed.

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

- Cap: one display-only field on a buff the sim already adds, and one display-only state set once per Tyrant Captain;
  both are read only when the browser takes its own snapshot of the battle.
- Estimated, not measured: display only, no new messages; the battle's numbers and results are unchanged.
