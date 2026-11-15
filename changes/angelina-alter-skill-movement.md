## 2026-11-15

### Angelina the Mellow Wish: S2 flies her forward

- During S2's take-off her body now glides forward with the sweep, along her facing, holds there while the take-off ends and returns to her tile as the skill begins, as in the official game. Her tile, blocking and range do not move.
- Before: she stayed on her tile while only the sweep's trail went forward.
- Her S3 flight is unchanged: as in the official game, she only flies toward an unblocked flying enemy in her range while she blocks no one.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: crew-rules.md SERVER COST, battles run in the players' browsers (Match clientCombat), sim fx never cross the server] | 0 / 0 MB/s |
| Bandwidth out / in, per room | 0 / 0 MB/s [src: as above] | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: as above] | 0 / 0 MB/s |
| Legacy SP_COMBAT=server only | about 0.5 KB more per S2 cast (504 bytes of `follow` on the glide fx, 30 on the release fx) [src: I:/ClaudeCrew/work/dev-29/size.mjs JSON length] | the same per cast, one cast per S2 use |
| Server CPU | 0 % of one core [src: no server code runs it in client combat] | 0 % |
| Memory | 0 MB [src: no state kept on the server] | 0 MB |
| Disk | 0 MB/day [src: nothing written] | 0 MB/day |
| Bot budget | under 0.01 ms/round [unverified] (one small object per S2 cast in the host browser's sim) | the same |

- Cap: one `follow` object (23 step numbers) per S2 cast [src: server/sim/content/kits/ops/op-aglna2.js GLIDE_STEPS].
- The zeros follow from client combat (no measurement needed); the legacy bytes are measured JSON lengths; the bot cost is estimated.

News:

- point: {name:char_1015_aglna2}'s S2 now flies her forward with the sweep
  zh: {name:char_1015_aglna2}的二技能现在会随冲击向前飞行
  ja: {name:char_1015_aglna2|Angelina the Mellow Wish}のS2で、本人が衝撃と共に前方へ飛ぶようになりました
  ko: {name:char_1015_aglna2|Angelina the Mellow Wish}의 2스킬이 이제 충격파와 함께 앞으로 날아갑니다
  zh-TW: {name:char_1015_aglna2}的二技能現在會隨衝擊向前飛行
