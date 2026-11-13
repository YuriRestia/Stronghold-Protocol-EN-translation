## 2026-11-13

### Enemy skills play their official sounds

- Enemy skills now play their official sounds when they are cast, such as Defense Crusher's stunning blow, OpFor:
  Armor's skills and Degenbrecher's blink: 63 enemies whose skills were silent, or played only their effect, now sound
  like the official game.
- A skill's impact plays its own official sound where it lands, such as W's C4 explosion and Free's arrow skill
  (36 skills). These impact sounds follow the skill's impact effect, so they stay silent when battle effects are
  turned off; the cast sounds always play.

Kind: player

News:

- point: Enemy skills now play their official sounds, such as {name:enemy_1045_hammer}'s stunning blow
  zh: 敌人的技能现在会播放官方音效，例如{name:enemy_1045_hammer}的眩晕重击
  ja: 敵のスキルが公式の効果音を再生するようになりました（{name:enemy_1045_hammer}のスタン攻撃など）
  ko: 적의 스킬이 이제 공식 효과음을 냅니다(예: {name:enemy_1045_hammer}의 기절 공격)
  zh-TW: 敵人的技能現在會播放官方音效，例如{name:enemy_1045_hammer}的暈眩重擊

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) during play; about 0.1 MB once (estimated: the new sounds of one match's enemies, then cached) | 1.3 MB once (all 96 new files), then cached |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s (0 / 0 GB/day); about 0.4 MB once | 5.2 MB once |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day); about 0.03 GB once (estimated) | 0.39 GB once |
| Server CPU | 0 % | 0 % |
| Memory | 0 MB | 0 MB |
| Disk | 1.3 MB once (96 new sound files), then 0 MB/day | 1.3 MB once |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: a fixed set of 96 static sound files (1.3 MB), each fetched at most once per browser and then cached; the client
  plays at most four start sounds per cast and one impact per skill impact effect, and the same file never twice within
  80 ms, on the official per-bank voice caps.
- No server, network or bot code changes: the asset generator (`tools/assets/`, `tools/fetch-assets.mjs`), the client's
  sound player (`public/js/audio.js`) and one hook in the effect system (`public/js/render/vfx/system.js`). Estimated
  from the file sizes, not measured.

Operator notes:

- Upload the 96 new enemy sound files (1.3 MB, under `public/assets/audio/sfx/enemy/`) with the next art upload; the
  release art gate lists them from `data/assets.json`. Together with the attack sounds (0.57 MB) that is about 1.9 MB.
