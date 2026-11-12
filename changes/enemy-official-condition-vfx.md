## 2026-11-13

### Enemies show their official glows while their talents are active

- These enemies now show the official effect while their talent's condition holds, as in the official game:
  Sarkaz Wither Tank and Advanced Sarkaz Wither Tank while their polluted shot is charged; Diver in deep water;
  Caster Speedboat's wake on deep water; Dublinn Companion Guard, Elite Companion Guard and Elite Companion Shadowblade
  while a Guard and a Shadowblade stand together; Arc Frontliner while it is unbalanced; Sarkaz Wither Vanguard and
  Elite Sarkaz Wither Vanguard on originium tiles; Sarkaz Lancer while it charges; Shrine Swordsman from its first
  enhancement on.
- Before: these effects never showed.

### Enemies show the official effects their talents trigger

- Scarlet Singer glows as a warning when its song is close, bursts when it sings, and every enemy it speeds up shows the
  official glow while the speed-up lasts.
- 'Forsaken One' glows once its attacks have stacked three times, Nucleic Maleficent and Allotropic Maleficent once
  they have been hit, Lucky Flyfin while it sprints after the first hit, and OpFor: Bonespur while it is hidden, with the
  official burst each time it hides or shows itself.
- Before: none of these effects showed.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0.0003 / 0 MB/s (0.02 / 0 GB/day) | 0.004 / 0 MB/s during a Scarlet Singer song with 60 enemies up; 0.03 MB/s at the 600-enemy cap |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0.001 / 0 MB/s (0.002 in Grand Alliance) | 0.016 / 0 MB/s (0.032 in Grand Alliance) |
| Bandwidth out / in, 300 players | 0.08 / 0 MB/s (about 1.6 GB/day: these enemies are on the field a quarter of the time or less) | 1.2 / 0 MB/s, if every field had a singing Scarlet Singer with 60 enemies at once |
| Server CPU | under 0.01 % of one core | under 0.05 % of one core |
| Memory | under 0.1 MB | under 0.5 MB (one probe per affected enemy) |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round (the probes run only when a snapshot is taken, never in the battle's ticks) |

- Cap: one effect row per enemy and effect, about 50 B each. Rows go out when they change, plus a full set once a
  second (shared/fxsDiff.js). The Scarlet Singer's speed-up glow puts one row on every living enemy of its field for
  10 s per song; the field's living enemies (MAX_ALIVE_ENEMIES, 600) bound it.
- Estimated from the code, not measured: display-only state probes and timed effect rows in
  `server/sim/content/enemies/*.js`; nothing the battle reads.
