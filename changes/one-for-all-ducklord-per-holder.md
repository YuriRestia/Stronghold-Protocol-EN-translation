## 2026-11-13

### One for All: Duck Lord counts every holder

- In One for All every player holds the winning strategy, and each strategy now applies once per player who holds it.
  For Duck Lord's 'Mystery Customer', each living holder now swaps 0–2 enemies of its own. With 8 players that is up
  to 16 swapped enemies a round, all different units. Every player still faces the same swapped units. Before, Duck
  Lord swapped 0–2 enemies however many players held it.
- This also applies when two squads of a Free pick Grand Alliance both hold Duck Lord: two draws instead of one.
- Every other strategy already applied once per holder (checked one by one). Touch's Field Medic stays one per field.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (the swapped enemies replace wave enemies; the battle sends the same events) | 0 / 0 MB/s |
| Bandwidth out / in, per room (8 players) | 0 / 0 MB/s | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 GB/day) | 0 / 0 MB/s (0 GB/day) |
| Server CPU | under 0.01 % of one core | under 0.01 % (8 draws of one wave list per player and battle) |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.1 ms/round (the same draws in a host-browser battle) |

- Cap: one draw per living holder (at most 8), each of at most 2 units from the wave's own list. No new messages,
  sends or file writes.
- Estimated from the code: a draw shuffles the eligible units of one wave list (tens of entries).

News:

- point: In One for All, {name:band_ducklord}'s 'Mystery Customer' now swaps enemies once for every player who holds it
  zh: 一策同心中，{name:band_ducklord}的“神秘顾客”现在按持有该策略的玩家人数，每人各替换一次敌人
  ja: ワン・フォー・オールでは、{name:band_ducklord}の「謎の客人」が、その戦略を持つプレイヤーごとに敵を入れ替えるようになりました
  ko: 원 포 올에서 {name:band_ducklord}의 '신비한 고객'이 이제 해당 전략을 가진 플레이어마다 적을 교체합니다
  zh-TW: 一策同心中，{name:band_ducklord}的「神秘顧客」現在按持有該策略的玩家人數，每人各替換一次敵人
