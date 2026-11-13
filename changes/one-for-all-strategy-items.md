## 2026-11-13

### One for All: strategy and operator item gifts no longer use the shop's stock

- In One for All every player holds the same strategy. The items strategies and operators' garrison effects give are
  now separate from the shop and reward stock: every player gets them, they take no copies from the shop, and selling
  or destroying them gives nothing back to it. The shop and rewards keep their normal copies.
  Before: these items came out of the room's stock, which is sized for one holder per strategy, so the last players got
  nothing. With 8 players, the 8th Muelsyse holder got no advanced Doctor Hologram, 4 of 8 Malkiewicz holders no
  Commercial Packaging Plan, and 2 of 8 Justin Jr., Jessica, Fang, Orchid or 'Damazti Cluster' holders missed later
  items.
- Every other mode keeps the official rule: equipment from any source takes up the stock.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | under 0.0001 / 0 MB/s: one more item in a prep update, a few times a match |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | under 0.001 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | under 0.03 / 0 MB/s for a moment at a prep start (under 0.01 GB/day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB (one more item per player, a small number on each such item) |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: the grants the strategies and garrison effects already make (a strategy at most 4 per match); only One for All
  rooms change.
- Estimated from the code, not measured: `server/match/effectsMeta.js` makeCtx marks a strategy's or garrison effect's
  item grant in One for All (`offStock`), and `server/match/pool.js` leaves those copies out of the stock count; no new
  event or snapshot field.

News:

- point: In One for All, items from strategies and operators no longer use up the shop's stock, so every player gets theirs
  zh: 一策同心中，策略与干员给予的装备不再占用商店库存，每位玩家都能获得
  ja: ワン・フォー・オールでは、戦略やオペレーターから得る装備がショップの在庫を消費しなくなり、全プレイヤーが受け取れるようになりました
  ko: 원 포 올에서 전략과 오퍼레이터가 주는 장비가 더 이상 상점 재고를 소모하지 않아 모든 플레이어가 받을 수 있습니다
  zh-TW: 一策同心中，策略與幹員給予的裝備不再佔用商店庫存，每位玩家都能獲得
