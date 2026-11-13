## 2026-11-13

### One for All: every player gets their strategy's item

- In One for All every player holds the same strategy, and a strategy that gives an item now gives it to every player.
  Before: the items came out of the room's equipment stock, which is sized for one holder per strategy, so the last
  players got nothing. With 8 players, the 8th Muelsyse holder got no advanced Doctor Hologram, 4 of 8 Malkiewicz
  holders no Commercial Packaging Plan, and 2 of 8 Justin Jr., Jessica, Fang or 'Damazti Cluster' holders missed
  their later items.
- The copies past the stock count as held, so the shop offers fewer of those items while they are held, as with any
  held copy. Other matches keep the stock rule.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | under 0.0001 / 0 MB/s: one more item in a prep update, a few times a match |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | under 0.001 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | under 0.03 / 0 MB/s for a moment at a prep start (under 0.01 GB/day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB (one more item per player, one debt entry per item) |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: one item per strategy grant per player, the grants the strategy already makes (at most 4 per match); only One
  for All rooms change.
- Estimated from the code, not measured: `server/match/effectsMeta.js` grantItem passes `displayed` to
  `acquireItem` for a strategy's grant in One for All; no new event or snapshot field.

News:

- point: In One for All, a strategy that gives an item now gives it to every player, not only until the room's stock runs out
  zh: 一策同心中，会给予装备的策略现在会给每位玩家都发放，不再因房间库存不足而漏发
  ja: ワン・フォー・オールでは、装備を与える戦略が、ルームの在庫切れに関係なく全プレイヤーに装備を与えるようになりました
  ko: 원 포 올에서 장비를 주는 전략이 이제 방의 재고가 떨어져도 모든 플레이어에게 장비를 줍니다
  zh-TW: 一策同心中，會給予裝備的策略現在會給每位玩家都發放，不再因房間庫存不足而漏發
