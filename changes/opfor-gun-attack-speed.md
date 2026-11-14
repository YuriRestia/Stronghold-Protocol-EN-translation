## 2026-11-14

### OpFor: Gun speeds up the official way

- OpFor: Gun's attacks now speed up from its first hit: each hit on the same target adds 80 attack speed on top of its base 20, up to 5 stacks (ASPD 100, 180, 260, 340, 420), and switching targets starts over at one stack. [src: docs/history/0.3.4.md §37.103]
- Before: its first hit on a target added nothing and the bonus was counted from 0 instead of 20, so it fired slower (ASPD 20, 80, 160, 240, 320, 400 over its first six hits). [src: docs/history/0.3.4.md §37.103]

### Attack intervals of OpFor: Gun, Pipe and String on their cards

- Their cards, the codex and the enemy previews now show their official attack intervals (22.5 s, 15 s and 25 s) without marking them as slowed; a faster OpFor: Gun shows its speed-up in green. [src: docs/history/0.3.4.md §37.103]
- Before: the battle card showed "22.5s +18.00" in red for OpFor: Gun, and the codex showed 4.5 s, 3 s and 5 s. [src: docs/history/0.3.4.md §37.103]

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 GB/day) [src: server/sim/content/bosses.js sends no message; battles run in the players' browsers, docs/design/network.md §14] | 0 / 0 MB/s [src: same] |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s [src: no message added] | 0 / 0 MB/s [src: no message added] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 GB/day) [src: per player × 300] | 0 / 0 MB/s [src: per player × 300] |
| Server CPU | 0 % of one core [src: same kit hooks, one buff per gun hit as before] | 0 % [src: same] |
| Memory | 0 MB [src: no new state beyond the kit's existing counters] | 0 MB [src: same] |
| Disk | 0 MB/day [src: nothing written] | 0 MB/day [src: same] |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round [src: same] |

- Cap: none needed; the change sends, stores and writes nothing new [src: server/sim/content/bosses.js kitGun].
- Estimated from the code, not measured: no message, timer or file write is added [src: git diff of this branch].

News:

- point: {name:enemy_9017_achunt} now speeds up from its first hit on a target, as in the official game
  zh: {name:enemy_9017_achunt}现在从对目标的第一次攻击起就会提升攻击速度，与官方一致
  ja: {name:enemy_9017_achunt}は目標への最初の攻撃から攻撃速度が上がるようになりました（公式と同じ）
  ko: {name:enemy_9017_achunt}이(가) 이제 대상에 대한 첫 공격부터 공격 속도가 올라갑니다(공식과 동일)
  zh-TW: {name:enemy_9017_achunt}現在從對目標的第一次攻擊起就會提升攻擊速度，與官方一致
