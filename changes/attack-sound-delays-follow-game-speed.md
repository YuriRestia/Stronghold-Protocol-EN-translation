## 2026-11-13

### Delayed attack sounds follow the game speed

- Operator attack and hit sounds the official data plays a moment late now count that moment in game time too, as the
  official game does (every official sound keeps its delay on game time) [src: official Il2Cpp dump.cs
  SoundFXBank.SoundFX delay / ignoreTimeScale] [src: official audio_data soundFXBanks sounds[].ignoreTimeScale, false on
  13990 of 13990 sounds]. At 2× Ch'en's attack sound waits 0.3 s instead of 0.6 s [src: official audio_data
  soundFXBanks battle.ON_ABILITY_START.char_010_chen.attack sounds[].delay 0.6], a speed change takes hold within a
  moment, and the dev sandbox's pause holds a waiting sound until the battle goes on.

Kind: player

Server cost:

| Measure (measured: the diff against dev-0.2) | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (the client times sounds for events it already gets) [src: git diff dev-0.2: no server/ file changed] | 0 / 0 MB/s [src: git diff dev-0.2: no server/ file changed] |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s [src: git diff dev-0.2: no server/ file changed] | 0 / 0 MB/s [src: git diff dev-0.2: no server/ file changed] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 GB/day) [src: git diff dev-0.2: no server/ file changed] | 0 / 0 MB/s (0 GB/day) [src: git diff dev-0.2: no server/ file changed] |
| Server CPU | 0 % [src: git diff dev-0.2: no server/ file changed] | 0 % [src: git diff dev-0.2: no server/ file changed] |
| Memory | 0 MB [src: git diff dev-0.2: no server/ file changed] | 0 MB [src: git diff dev-0.2: no server/ file changed] |
| Disk | 0 MB/day (no new files) [src: git diff dev-0.2: data/assets.json unchanged] | 0 MB/day [src: git diff dev-0.2: data/assets.json unchanged] |
| Bot budget | 0 ms/round [src: git diff dev-0.2: no server/ file changed] | 0 ms/round [src: git diff dev-0.2: no server/ file changed] |

- Cap: no new messages, files or server work; in the browser, the attack pools' existing request bounds still hold, and a
  waiting sound re-reads the speed once per battle tick and is dropped on a field change or mute.
- Code: public/js/audio.js only (the attack pools' delay).

Operator notes:

- None: no asset upload, no server change.

News:

- point: Delayed attack sounds now follow the game speed
  zh: 延迟播放的攻击音效现在会跟随游戏速度
  ja: 遅れて鳴る攻撃効果音がゲーム速度に合わせて再生されるようになりました
  ko: 지연되어 재생되는 공격 효과음이 이제 게임 속도를 따릅니다
  zh-TW: 延遲播放的攻擊音效現在會跟隨遊戲速度
