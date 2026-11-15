## 2026-11-15

### Dev sandbox: pick a round's enemy variant

- The dev sandbox's "Season, map and enemies" box has a Variant picker (Tactical Training/Special, Flying, Frequency,
  Elements, Continuous, Invisible, Refraction) and a Training enemy picker for every round, Final Assault and Hidden Core,
  on every map and in every season. The enemies come from the match's own wave generator, so a picked variant spawns
  exactly what a match round of that type spawns. "Official pick" keeps the captured round as before.
- Before: each round always fought the one variant its capture happened to draw.

Kind: internal

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: server/match/waves.js:144 adds no message; the sandbox page is dev-only] | 0 / 0 MB/s |
| Bandwidth out / in, per room | 0 / 0 MB/s [src: no protocol change] | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: per player × 300] | 0 / 0 MB/s |
| Server CPU | 0 % of one core [src: server/match/waves.js:144 same filter, same draw; matches never pass entryKey] | 0 % |
| Memory | 0 MB [src: no new state] | 0 MB |
| Disk | 0 MB/day [src: nothing written] | 0 MB/day |
| Bot budget | 0 ms/round [src: pickRoundEntry draws as before, test/ui/dev-sandbox-variants.test.js] | 0 ms/round |

- Cap: the change is a refactor of the match's entry filter plus an option only the dev sandbox page passes [src: server/match/waves.js:144].
- Estimated, not measured: no message, timer or write is added, so there is nothing for the traffic meter to count [src: server/match/waves.js:144].
