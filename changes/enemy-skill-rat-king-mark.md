## 2026-11-13

### Rat King marks its targets

- Rat King's Mark now shows the official markers over the unit with the highest Max HP and the unit with the lowest
  Max HP, the two its sand skills hit. When a marked unit falls, the marker moves to the next one; the markers go when
  Rat King is defeated. Its Drift Sand also shows its official ground range on the target.
- Before: Mark did nothing you could see, and Drift Sand had only a plain tile outline.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (Rat King is a rare bounty enemy) | 0.00006 / 0 MB/s while a Rat King fights on the field watched |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s | 0.00024 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s | 0.018 / 0 MB/s (1.6 GB/day only if every field fought a Rat King all day) |
| Server CPU | under 0.01 % of one core | under 0.01 % |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.01 ms/round (the same pick in a host-browser battle) |

- Cap: two marker rows per Rat King (about 55 bytes), sent in the snapshot's `fxs` only when they change plus the full
  set once a second (shared/fxsDiff.js); one `cast` event (about 20 bytes) when Mark is cast, once per fight.
- Estimated from the row size and the once-a-second resend; the pick compares the field's units each tick (a few
  dozen at most), no new timers, sends or file writes.

News:

- point: {name:enemy_1509_mousek}'s Mark now shows its markers on the units it targets
  zh: {name:enemy_1509_mousek}的标记现在会在其目标单位上显示标记特效
  ja: {name:enemy_1509_mousek}のマーキングが対象ユニットに表示されるようになりました
  ko: {name:enemy_1509_mousek}의 표식이 이제 대상 유닛에 표시됩니다
  zh-TW: {name:enemy_1509_mousek}的標記現在會在其目標單位上顯示標記特效
