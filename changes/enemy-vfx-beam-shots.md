## 2026-11-13

### Enemy channel and lasso skills show their official effects

- Sarkaz Royal Court Elite Caster: its Death Eye channel now draws the official line to its target, with the
  official hit as it lands, and the burst at the end plays the official explosion. Before: a plain purple beam.
- Festival Jazz Musician: its channel now throws the official lasso rope, with the official hit on every tick.
  Before: a plain beam per tick.
- 'Samivilinn,' the Resolution of the Very North: its lasso now puts the official stun effect on each target. Before:
  a plain beam.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | under 0.00001 / 0 MB/s while an Elite Caster channels |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | under 0.0001 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | under 0.001 / 0 MB/s (under 0.1 / 0 GB/day) |
| Server CPU | 0 % of one core | 0 % of one core |
| Memory | 0 MB | 0 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: the Elite Caster's burst effect carries two more numbers (who and at whom), about 20 B, at most once per cast
  (its cooldown is 24 s plus the channel). Nothing else on the server changes; the rest is drawn by the client.
- Estimated from the code, not measured (`server/sim/content/enemies/element.js`).
