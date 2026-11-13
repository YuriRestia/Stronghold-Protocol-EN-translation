## 2026-11-13

### Armor of the Empire's barrage gives a warning

- Armor of the Empire's entrance barrage now works as in the official game. It first marks the unit with the highest
  HP for 5.8 s. 0.8 s later its range shows on the 3×3 tiles around that spot, and 8 shells fall there one by one,
  0.53 s apart. Each shell hits the unit with the most HP in that area at that moment. You can move a unit out of the
  marked area before the shells land, and the shells keep falling even if Armor of the Empire is defeated meanwhile.
- Before: all 8 hits landed at once, 0.5 s after it appeared, with no warning.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (one barrage per Armor of the Empire, when it appears) | 0.00012 / 0 MB/s for the 6 s of a barrage on the field watched |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s | 0.0005 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s | 0.036 / 0 MB/s (3.1 GB/day only if every field had a barrage falling all day) |
| Server CPU | under 0.01 % of one core | under 0.01 % |
| Memory | 0 MB | under 0.01 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.01 ms/round (the same 9 timers in a host-browser battle) |

- Cap: per barrage, one range `fx` and 8 shell `fx` events (about 60 bytes each), plus one mark row in the snapshot's
  `fxs` for 5.8 s (about 30 bytes, sent when it changes plus the full set once a second, shared/fxsDiff.js): about
  0.7 KB per Armor of the Empire, once per fight. Before, one range `fx` event was sent.
- Estimated from the event sizes; the barrage adds 9 one-shot timers per Armor of the Empire, each picking among the
  units of a 3×3 area, with no new sends or file writes.

News:

- point: {name:enemy_10027_vtsk}'s barrage now marks its target and shows its range before the shells land
  zh: {name:enemy_10027_vtsk}的炮击现在会先标记目标并显示范围，然后炮弹才会落下
  ja: {name:enemy_10027_vtsk}の砲撃は、砲弾が着弾する前に対象をマークし範囲を表示するようになりました
  ko: {name:enemy_10027_vtsk}의 포격이 이제 포탄이 떨어지기 전에 대상을 표시하고 범위를 보여줍니다
  zh-TW: {name:enemy_10027_vtsk}的砲擊現在會先標記目標並顯示範圍，然後砲彈才會落下
