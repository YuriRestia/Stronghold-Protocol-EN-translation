## 2026-11-13

### Enemy skill sounds follow the official sound limits

- Enemies casting the same skill together no longer silence each other: every cast plays its sound, and only the
  official limit for that sound holds it back, as in the official game, which keeps no time gap between two plays of a
  sound [src: official Il2Cpp dump.cs SoundFXBank / Bank fields] [src: official audio_data soundFXBanks maxSoundAllowed
  / popOldest]. A crowd of ten casters rings as that limit allows: most enemy skill sounds keep two at once, the oldest
  giving way to the newest [src: official audio_data soundFXBanks maxSoundAllowed, 137 of the 141 enemy cast banks].
- Sounds the official data plays a moment late now wait that moment: the Echoes' delayed ensemble sounds, Armor Cleaver
  and Armor Crusher being shot down, and the skill start sounds of Bubble's S2, Mostima's S3 and Waai Fu's S2
  [src: official audio_data soundFXBanks sounds[].delay: acdums_audio[passion][delay] / [depassion][delay] 0.7,
  acstma_s_1[special_stun] / acstmb_s_1[special_stun] 0.27, skchr_bubble_2 / skchr_mostma_3 0.1, skchr_waaifu_2 0.05].

Kind: player

Server cost:

| Measure (measured: the diff against dev-0.2) | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (the client plays sounds for events it already gets) [src: git diff dev-0.2: no server/ file changed] | 0 / 0 MB/s [src: git diff dev-0.2: no server/ file changed] |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s [src: git diff dev-0.2: no server/ file changed] | 0 / 0 MB/s [src: git diff dev-0.2: no server/ file changed] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 GB/day) [src: git diff dev-0.2: no server/ file changed] | 0 / 0 MB/s (0 GB/day) [src: git diff dev-0.2: no server/ file changed] |
| Server CPU | 0 % [src: git diff dev-0.2: no server/ file changed] | 0 % [src: git diff dev-0.2: no server/ file changed] |
| Memory | 0 MB [src: git diff dev-0.2: no server/ file changed] | 0 MB [src: git diff dev-0.2: no server/ file changed] |
| Disk | 0 MB/day (no new files) [src: git diff dev-0.2: data/assets.json unchanged] | 0 MB/day [src: git diff dev-0.2: data/assets.json unchanged] |
| Bot budget | 0 ms/round [src: git diff dev-0.2: no server/ file changed] | 0 ms/round [src: git diff dev-0.2: no server/ file changed] |

- Cap: no new messages, files or server work; in the browser, each bank's official cap bounds the sounds at once.
- Code: public/js/audio.js only (the cast path and its bank playback).

Operator notes:

- None: no asset upload, no server change.

News:

- point: Enemies casting the same skill together no longer silence each other's skill sounds
  zh: 多个敌人同时释放同一技能时，不再互相吞掉技能音效
  ja: 複数の敵が同じスキルを同時に使っても、スキル効果音が互いに消されなくなりました
  ko: 여러 적이 같은 스킬을 동시에 사용해도 스킬 효과음이 서로 묻히지 않습니다
  zh-TW: 多個敵人同時施放同一技能時，不再互相吞掉技能音效
