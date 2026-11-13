## 2026-11-13

### A unite phase can no longer get stuck

- Grand Alliance: when the unite battle's helpers were offline, it sat at "Uniting" with the countdown at 00 for minutes
  and then charged the leakers as if nobody had played it. The browsers did run it, but their answers were refused once
  more than 4 players were in it. They now count, and the round goes on as soon as the battle ends. If the browsers
  still cannot run it, the room now waits for two of them, not for every player in turn. A unite with 5 or more
  helpers also counts their result again (it used to name only 4 of them and was refused).
- If something goes wrong while the unite phase ends, the match no longer stays on "Uniting" with the countdown at 00.
  Once the phase is well past its time, the server closes the unite battle with what it has and moves on to the
  results. If no result came in, the leakers lose LP for their own leaks, as when the unite battle cannot run.
  Before: one error on the way out of the unite phase left the whole room stuck there.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: server/match/match/unitePhase.js:174 one timer, no message] | 0 / 0 MB/s |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s [src: per player × seats] | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: per player × 300] | 0 / 0 MB/s |
| Server CPU | 0 % of one core [src: server/match/match/unitePhase.js:177 one timer per unite phase] | under 0.01 % of one core: one settle a stuck room would have done anyway [unverified] |
| Memory | 0 MB [src: server/match/Match.js:613 one timer handle per match] | 0 MB |
| Disk | 0 MB/day [src: server/match/match/unitePhase.js:209 one log line only when overdue; server/lobby.js:937 one line per refused message type] | under 0.003 MB per match: 11 refused-frame lines of about 200 bytes [src: server/lobby.js:308 REJECTED_LOG_MAX 10, server/lobby.js:932 one more line] plus two watchdog lines [unverified] |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: at most one watchdog timer per match, re-armed only by the next unite phase and cancelled by settlement
  [src: server/match/match/settle.js:17]; it acts at most twice per unite phase [src: server/match/match/unitePhase.js:212].
- The answer limit (4 → 8 players) [src: shared/protocol.js:51]: those frames already reached the server and were refused, so
  inbound bytes stay the same and one BAD_MSG reply per refused frame goes away; the progress they carry is what a 4-player
  room already publishes [unverified].
- A normal / 联防 bot field is offered to at most 2 browsers [src: server/match/match/botBattles.js:22, server/match/match/botBattles.js:77]:
  fewer b.botBattle frames than before, never more.
- Estimated from the code, not measured: no new message, field or snapshot data.

News:

- point: A unite phase can no longer get stuck on "Uniting" with the countdown at 00
  zh: 联防阶段不会再卡在“联防中”、倒计时停在 00
  ja: 防衛支援フェーズが「防衛支援中」でカウントダウン 00 のまま止まることがなくなりました
  ko: 연합 방어 단계가 카운트다운 00에서 "연합 방어 중"으로 멈추지 않습니다
  zh-TW: 聯防階段不會再卡在「聯防中」、倒數停在 00
