## 2026-11-13

### Dublinn Flamechasers rise with their official effect

- When a Dublinn Flamechaser Soldier or Elite is knocked down, its one-second rebirth into the Ember of Resentment now
  plays the official revive effect.
- Before: the rebirth had no effect of its own.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s | under 0.00001 / 0 MB/s |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s | under 0.00004 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 GB/day) | under 0.003 / 0 MB/s (under 0.26 GB/day, a field full of Flamechasers falling all day) |
| Server CPU | 0 % of one core | under 0.01 % |
| Memory | 0 MB | 0 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: one `cast` event (about 20 bytes) per knock-down, and each Flamechaser is knocked down once.
- Estimated from the event size; no new timers, sends or file writes.

News:

- point: {name:enemy_1288_duskls} now plays its official effect when it rises as an ember
  zh: {name:enemy_1288_duskls}化为余烬重生时现在会播放官方特效
  ja: {name:enemy_1288_duskls}が残火として復活する時、公式エフェクトが再生されるようになりました
  ko: {name:enemy_1288_duskls}이(가) 잔불로 부활할 때 이제 공식 이펙트가 재생됩니다
  zh-TW: {name:enemy_1288_duskls}化為餘燼重生時現在會播放官方特效
