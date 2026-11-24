## 2026-11-24

### Hidden Core OpFor: Gun: its attack timing follows the official client

- A hit now counts for its attack speed as its shot lands, not as it is fired. [src: official uc/projectiles.ab projectile_enemy_achunt AdvancedMovement _speed]
- An operator stepping into one of its beams to the carts counts as a hit for its attack speed, each time it steps in;
  the link to the cart itself does not. [src: official uc/projectiles.ab projectile_enemy_achunt_ray LaserHitBehaviour]
- A cast that is not its normal attack (the opening beams, the cart call) restarts its attack timer for a full period, and
  a change of attack speed keeps the timer's progress instead of restarting it. So its first shot comes later than before.
  [src: official enm_pfb_28.ab enemy_9017_achunt Skills/3]

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Bandwidth out / in, per room (8 players) | 0 / 0 MB/s [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Server CPU | 0 % of one core: per gun and tick a few comparisons and one distance per beam and operator, only in a Hidden Core field [unverified] | under 0.1 % [unverified] |
| Memory | 0 MB [src: server/sim/content/bosses.js kitGun keeps a handful of numbers and one small set per beam] | 0 MB |
| Disk | 0 MB/day [src: server/sim/content/bosses.js writes nothing] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Bandwidth, memory and disk from the code (nothing sent or stored); CPU estimated, not measured.
- Cap: one 5 s cast per gun and call, at most two guns per field [src: server/sim/content/bosses.js kitGun].

Operator notes:

- Golden moved (fields.json, matches.json): `boss-boss_2-solo` and `boss-boss_2-pair` (the attack timer and the landing hit apply to
  every gun), `hidden-boss_9-solo`, `hidden-boss_9-pair` (timer restart by the opening cast and the call, landing hits, beam
  step-ins) and `coop2-ABYSS-10-boosted` (its Hidden Core is the gun pair). Nothing else moved.
