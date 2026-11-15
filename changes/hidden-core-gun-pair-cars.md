## 2026-11-15

### Hidden Core OpFor: Gun with two players: the cars visit both players

- On the two-player Hidden Core field the second gun now arrives right as the fight starts and the first one 10 s
  later, as in the official game, so the two guns call the cars in turn and the cars drive to each player's half.
  Before, both guns arrived together and the right one always called last, so the cars only ever gathered on the
  right. [src: official level_act1autochess_h08_02.json]
- Damage on a car now passes only to one gun, as in the official game; it no longer also drains the other cars.
- A gun's 80 % damage reduction now lasts while one of the units it found when it appeared lives, as in the official
  game: with two players the first gun loses it once the cars are destroyed, the second keeps it while the first gun
  stands. Before, any gun or car on the field counted. [src: official enm_pfb_28.ab enemy_9017_achunt achunt_passive]

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Bandwidth out / in, per room (8 players) | 0 / 0 MB/s [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: no network or protocol code changed] | 0 / 0 MB/s [src: no network or protocol code changed] |
| Server CPU | 0 % of one core: one scheduled check per battle, and only a server-run Hidden Core pair field gets its second gun 9.9 s sooner [unverified] | under 0.1 % [unverified] |
| Memory | 0 MB [src: server/sim/content/bosses.js branchAtStart keeps no state beyond the existing mirrored set] | 0 MB |
| Disk | 0 MB/day [src: server/sim/content/bosses.js writes nothing] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Bandwidth, memory and disk from the code (nothing sent or stored); CPU estimated, not measured.
- Cap: one branch check per battle and at most one extra gun per pair field, the one the template already lists [src: server/sim/content/bosses.js branchAtStart].

News:

- point: {name:enemy_9017_achunt_2} with two players: the two guns now call the cars in turn, so the cars reach both players
  zh: 双人{name:enemy_9017_achunt_2}：两个铳现在轮流召唤战车，战车会前往两名玩家的半场
  ja: 2人での{name:enemy_9017_achunt_2}：2体の銃が交互に車両を呼ぶようになり、車両が両プレイヤーの側へ向かいます
  ko: 2인 {name:enemy_9017_achunt_2}: 두 총이 이제 번갈아 차량을 불러, 차량이 두 플레이어 쪽 모두로 갑니다
  zh-TW: 雙人{name:enemy_9017_achunt_2}：兩個銃現在輪流召喚戰車，戰車會前往兩名玩家的半場
- point: Damage on {name:enemy_9018_actrpa} and the other cars now passes only to one gun, no longer to the other cars
  zh: {name:enemy_9018_actrpa}等战车受到的伤害现在只传递给一个铳，不再分摊给其他战车
  ja: {name:enemy_9018_actrpa}などの車両が受けたダメージは銃1体にのみ伝わり、他の車両には分配されなくなりました
  ko: {name:enemy_9018_actrpa} 등 차량이 받은 피해는 이제 총 하나에만 전달되고 다른 차량에는 나뉘지 않습니다
  zh-TW: {name:enemy_9018_actrpa}等戰車受到的傷害現在只傳遞給一個銃，不再分攤給其他戰車
- point: With two players, the first {name:enemy_9017_achunt_2} loses its damage reduction once the cars are destroyed
  zh: 双人时，先出现的{name:enemy_9017_achunt_2}在战车全部被摧毁后失去减伤
  ja: 2人の場合、先に現れた{name:enemy_9017_achunt_2}は車両がすべて破壊されると被ダメージ軽減を失います
  ko: 2인일 때 먼저 등장한 {name:enemy_9017_achunt_2}는 차량이 모두 파괴되면 피해 감소를 잃습니다
  zh-TW: 雙人時，先出現的{name:enemy_9017_achunt_2}在戰車全部被摧毀後失去減傷
