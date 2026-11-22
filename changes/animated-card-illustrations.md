## 2026-11-22

### Animated operator illustrations on the result, room and Grand Alliance cards

- The cards on the result screen, in the room and in the Grand Alliance room now play the operators' official animated illustrations, with their effects and backgrounds, framed as on the official end-of-match card. An operator without one keeps its picture.
- They load only after the last battle of a match is over. The result screen waits for them for at most 3 seconds after the settlement pause and opens as soon as they are ready; a card that is still loading shows its picture and switches when ready. [src: crew-docs/l2d-art-proposal.md §1 Decisions D11]
- Before: every card showed a still picture.

### Result cards enter as in the official client

- Each result card now plays the official entrance, one card after another: it fades in, the operator drops into place, the name card slides up, and a cleared card gets the light beam, the teal frame and strip and the colour wash (a failed one the grey frame and strip).
- Before: the cards faded in with a simple animation of our own.

### New settings: Animated Illustrations and Result Card Art

- Settings → Animated Illustrations: **Off**, **Mine Only** (default on phones) or **Everyone** (default on PC).
- Settings → Result Card Art: each result card shows the doctor's **Card Operator** in their outfit, or the **Best Unit** of their final lineup.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player (game socket) | 404 B / 0 per match end: m.public `ending` (202 B in a 4-player match, 51 B a player) rides 2 m.public frames [src: work/dev-52/ending-size.mjs, 4-player harness match] | 8-player room: about 840 B per match end [unverified] (estimated: 2 × 8 × 51 B) |
| Bandwidth out / in, per room | 4 players: 1.6 KB per match end [src: work/dev-52/ending-size.mjs: 2 frames × 202 B × 4] | 8 players: 6.7 KB per match end [unverified] (estimated) |
| Bandwidth out / in, 300 players (game socket) | 0.00004 MB/s, 0.004 GB/day [unverified] (estimated: 75 rooms of 4, one match each per 2,700 s) | 0.00008 MB/s, 0.007 GB/day [unverified] (estimated: 38 rooms of 8) |
| Art downloads from the origin, both servers (static files behind Cloudflare) | 0.010 MB/s, 0.9 GB/day [unverified] (estimated: each server's set refills once a day, 301 MB full + 148 MB half tier on the wire per server, from Dev 49's extraction report summ.cjs / wire.cjs) | cache rule broken, Grand Alliance at 300 players, 8 cards each match, all cold: about 2.8 MB/s, 238 GB/day [unverified] (estimated: 300 × 8 × 3.1 MB on the wire ÷ 2,700 s) |
| Art a player downloads | 3.1 MB per illustration on a PC, 1.5 MB on a phone (half pages) [unverified] (Dev 49's report: wire sizes, arithmetic) | 8 illustrations on a screen: 24.8 MB on a PC [unverified] (arithmetic) |
| Server CPU | 0 % [unverified] (one lineup sort per player at the match's end, results.js endingView) | 0 % [unverified] |
| Memory | 0 MB [unverified] (the `ending` object until the match closes) | 0 MB [unverified] |
| Disk | 0 MB/day [src: server/match/results.js endingView writes nothing]; the art itself is 591.6 MB per server, both tiers [src: Dev 49's extraction report, summ.cjs over the 98 illust.json files] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: `ending` is sent once per match (results.js endingView, one entry per player, at most 8 [src: shared/largeRoom.js LARGE_ROOM_SEATS]); the art is content-hashed and immutable, so each file downloads once per player until it changes, and a screen holds at most 8 illustrations [src: crew-docs/l2d-art-proposal.md §6].
- The art sizes are Dev 49's measured extraction (98 illustrations); the per-day figures are arithmetic on them.
- The card entrance adds 10 small UI sprites from the public mirror, about 37 KB together [src: public/assets/ui/settleCard 15,676 B for 8 + ui/uiFxMask 21,843 B for 2, wc -c], downloaded once per player like the other art.

Operator notes:

- After the merge, `node tools/fetch-assets.mjs --add-only` on each server fetches the 10 new sprites (`ui/settleCard/*`, `ui/uiFxMask/*`); then the art upload as usual.

News:

- highlight: Result, room and {term:大同盟} cards now play the operators' official animated illustrations
  zh: 结算、同盟房间和{term:大同盟}的卡片现在会播放干员的官方动态立绘
  ja: リザルト、同盟ルーム、{term:大同盟}のカードでオペレーターの公式の動く立ち絵が再生されるようになりました
  ko: 결과, 동맹 방, {term:大同盟} 카드에서 오퍼레이터의 공식 움직이는 일러스트가 재생됩니다
  zh-TW: 結算、同盟房間和{term:大同盟}的卡片現在會播放幹員的官方動態立繪
- point: New settings {term:动态立绘} and {term:结算卡片立绘}
  zh: 新增设置{term:动态立绘}和{term:结算卡片立绘}
  ja: 新しい設定{term:动态立绘}と{term:结算卡片立绘}
  ko: 새 설정 {term:动态立绘}, {term:结算卡片立绘}
  zh-TW: 新增設定{term:动态立绘}和{term:结算卡片立绘}
