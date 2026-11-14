## 2026-11-14

### Skills that need a target wait for one

- Passenger's S3 and Degenbrecher's S3 now wait with full SP until an enemy is inside the skill's own range, as in the official game, instead of going off with no enemy near. Passenger's S3 counts its large x-3 range, Degenbrecher's S3 her x-1; flying enemies count for both. [src: docs/history/0.3.4.md §37.103]
- The same official rule also covers Degenbrecher's S2 (ground enemies on its range in front of her) and Irene's S3 (x-1, flying enemies too), which now wait too. Irene's S2 already waited. [src: docs/history/0.3.4.md §37.103]
- Before: these skills fired the moment their SP was full and could be wasted on an empty field. [src: data/chess.json skill.trigger SP_FULL]

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day): no message, event or field added [src: server/sim/content/kits/ops/chess_char_6_05-pasngr.js trigger only] | 0 / 0 MB/s [src: no network code changed] |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s [src: no network code changed] | 0 / 0 MB/s [src: no network code changed] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: no network code changed] | 0 / 0 MB/s [src: no network code changed] |
| Server CPU | under 0.01 % of one core, estimated [unverified] | under 0.01 % of one core, estimated [unverified] |
| Memory | 0 MB [src: no new state; skills.js caches the trigger keys it already has] | 0 MB [src: same] |
| Disk | 0 MB/day [src: nothing written] | 0 MB/day [src: nothing written] |
| Bot budget | under 0.01 ms/round, estimated [unverified] | under 0.1 ms/round, estimated [unverified] |

- Cap: the extra work is one enemy lookup on at most 25 tiles per tick, only for these five skills and only while their SP is full and no enemy is in range [src: server/sim/skills.js _tickRuleSatisfied CUSTOM_RANGE / ACTIVE_RANGE; range_table x-3 = 25 tiles].
- Battles run in the players' browsers; the server simulates only fields with no connected human (bots), so the CPU lines are those bot battles. Estimated from the code, not measured. [src: docs/design/network.md §14]

News:

- point: {name:char_472_pasngr} and {name:char_4116_blkkgt}'s S3 now wait for an enemy in range
  zh: {name:char_472_pasngr}与{name:char_4116_blkkgt}的三技能现在会等到范围内有敌人时才释放
  ja: {name:char_472_pasngr}と{name:char_4116_blkkgt}のS3は範囲内に敵がいるときだけ発動するようになりました
  ko: {name:char_472_pasngr}와 {name:char_4116_blkkgt}의 3스킬이 이제 범위 안에 적이 있을 때만 발동합니다
  zh-TW: {name:char_472_pasngr}與{name:char_4116_blkkgt}的三技能現在會等到範圍內有敵人時才釋放
