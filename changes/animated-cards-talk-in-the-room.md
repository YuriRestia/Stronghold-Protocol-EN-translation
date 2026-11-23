## 2026-11-23

### Animated cards talk in the room and the Grand Alliance room

- Now and then, one operator whose card is animated says one of their official home-screen lines: a Talk line or the Idle line. A line comes only after two to three minutes of quiet, never while another voice plays, and a click, tap or key press (typing in chat too) starts the quiet again, like the official home screen's idle line. The cards take turns, and one card speaks at most once every five minutes.
- A player who joins with an animated card says Appointed as Squad Leader, a Deployment line or their Greeting as their card comes alive. When several players join one after another, each says about two words before the next one talks over them, and the last one finishes their line.
- The lines follow your voice language, the per-operator voice choice and the outfit's own voice. Nothing plays with the voice muted or at zero, and only cards that are animated on your screen speak.
- The lines are downloaded only when they play, and Preload Assets includes them with your voice pack.

Kind: player

News:

- point: Animated cards now talk now and then in the room and the {term:大同盟} room, and greet the room when a player joins with one.
  zh: 房间和{term:大同盟}房间里的动态立绘干员会不时说话，带着动态立绘加入的玩家也会打招呼。
  ja: ルームと{term:大同盟}ルームで、Live2Dカードのオペレーターが時々話し、Live2Dカードで参加したプレイヤーはあいさつします。
  ko: 방과 {term:大同盟} 방에서 움직이는 카드의 오퍼레이터가 가끔 말을 하고, 움직이는 카드로 들어온 플레이어는 인사합니다.
  zh-TW: 房間和{term:大同盟}房間裡的動態立繪幹員會不時說話，帶著動態立繪加入的玩家也會打招呼。

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Game socket, per player / per room / 300 players | 0 MB/s, 0 GB/day [src: public/js/ui/lobbyVoice.js sends nothing; joins and seat cards come from room.state, public/js/screens/room.js] | 0 MB/s, 0 GB/day |
| Static files (voice lines behind Cloudflare), per player | about 0.35 MB per 5-minute room wait [unverified] (estimated: 1 chatter line per 150 s × 171 KB average English line, crew-docs/l2d-lobby-voice-proposal.md §3) | 1 line per 120 s while the room stays quiet: 0.0014 MB/s [unverified] (estimated: 171 KB ÷ 120 s); joins add 38–107 KB a line [unverified] |
| Static files, per room (8-player Grand Alliance) | about 2.8 MB per 5-minute wait [unverified] (estimated: 8 × 0.35 MB) | 0.011 MB/s [unverified] (estimated: 8 × 0.0014 MB/s) |
| Static files, 300 players, served by Cloudflare | 0.03 MB/s, 2.4 GB/day [unverified] (estimated: a 5-minute wait per 45-minute match, 2 lines of 171 KB) | 0.42 MB/s, 36 GB/day [unverified] (estimated: all 300 in quiet rooms all day, 1 line per 120 s) |
| Origin (our server) | under 0.5 GB/day per Cloudflare data centre [unverified] (estimated: /assets/ cached at the edge with max-age=86400, server/http/files.js:80, so each file leaves the origin at most once a day per data centre) | the Cloudflare rule broken: 0.42 MB/s, 36 GB/day [unverified] |
| Server CPU | 0 % [unverified] (static files only) | 0 % |
| Memory | 0 MB [unverified] | 0 MB |
| Disk | 0 MB/day; about 455 MB once per server for the new lines in all dubs, and the same again inside the full release zip [unverified] (estimated from the mirror's file sizes, proposal §3) | same |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Cap: one chatter line per 120 s of quiet per player (the official home-screen timer) plus a random 0–60 s, one card at most once per 300 s, at most 8 waiting join lines (a room's seats); lines only for animated cards on screen, never with the voice off [src: public/js/ui/lobbyVoice.js CHATTER_QUIET_MS / CARD_REST_MS / JOIN_QUEUE_MAX].
- The socket numbers are from the code (nothing sent); the file numbers are arithmetic on the mirror's sizes, estimated.
