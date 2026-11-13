## 2026-11-13

### No stage setup reroll in public matches

- Rerolling the stage setup is meant for friends playing privately, or for solo play. It is now off in public Grand
  Alliances and in any team or Grand Alliance that used Find Teammates or took players from Solo Matchmaking, even if
  the room was made private again before the start. In those matches the button is greyed out, with "No reroll in
  public matches" beside it.
- Before: anyone in any room could start a reroll vote.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | under 0.00001 / 0 MB/s (23 bytes more in each match update of a public match) | 0.00023 / 0 MB/s (match updates at their 10 per second cap) |
| Bandwidth out / in, per room (4 players; 8 in a Grand Alliance) | under 0.0001 / 0 MB/s | 0.0019 / 0 MB/s |
| Bandwidth out / in, 300 players | 0.0035 / 0 MB/s (0.3 GB/day, estimated at one match update per 2 s) | 0.069 / 0 MB/s (6 GB/day only if every player were in a public match with updates at the cap all day) |
| Server CPU | 0 % (one check per match start and per reroll request) | 0 % |
| Memory | 0 MB (one flag per room) | 0 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: the match update's `rerollOff` field is one short word, sent only in public matches, and match updates are
  already capped at 10 per second (`DELAYS.PUBLIC_THROTTLE`). Refused reroll requests send nothing more than the error
  every refused request already gets, and they stay in the connection's heavy-message bucket (2 per second).
- Estimated from the field size and the update cap.

News:

- point: Stage setup reroll is now only for private rooms and solo, not public matches
  zh: 重刷本局现在只能在私人房间和单人游戏中使用，公开对局不能重刷
  ja: 開始条件の再抽選はプライベートルームとソロ専用になり、公開マッチでは使えなくなりました
  ko: 시작 조건 재추첨은 이제 비공개 방과 솔로 전용이며, 공개 매치에서는 사용할 수 없습니다
  zh-TW: 重刷本局現在只能在私人房間和單人遊戲中使用，公開對局不能重刷
