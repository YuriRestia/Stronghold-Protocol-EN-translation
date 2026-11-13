## 2026-11-13

### Enemy attacks play their official sounds

- Ranged enemies now play the official impact sound where their shot lands, such as OpFor: Gun's bullets, Free's arts,
  W's grenades and Heavy Crossbowman Ambusher's bolts: 56 enemies that landed their shots in silence now have an impact
  sound, and 16 more play their shot's own impact instead of another attack's.
- Enemies whose official attack has two sounds, a wind-up and a shot or strike, now play both: OpFor: Gun's charge is
  followed by its shot, and so for 20 enemies.
- Enemies with a ranged and a melee attack play each attack's own sounds (22 enemies): Army Veteran Shieldguard's
  shield bash no longer ends in a ranged impact, and Heavy Crossbowman Ambusher's bolts no longer land with a sword
  sound.

Kind: player

News:

- point: Enemy attacks now play their official sounds, such as {name:enemy_9017_achunt}'s shots
  zh: 敌人的攻击现在会播放官方音效，例如{name:enemy_9017_achunt}的射击
  ja: 敵の攻撃が公式の効果音を再生するようになりました（{name:enemy_9017_achunt}の射撃など）
  ko: 적의 공격이 이제 공식 효과음을 냅니다(예: {name:enemy_9017_achunt}의 사격)
  zh-TW: 敵人的攻擊現在會播放官方音效，例如{name:enemy_9017_achunt}的射擊

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) during play; about 0.1 MB once (estimated: the new sounds of one match's enemies, then cached) | 0.57 MB once (all 63 new files), then cached |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s (0 / 0 GB/day); about 0.4 MB once | 2.3 MB once |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day); about 0.03 GB once (estimated) | 0.17 GB once |
| Server CPU | 0 % | 0 % |
| Memory | 0 MB | 0 MB |
| Disk | 0.57 MB once (63 new sound files), then 0 MB/day | 0.57 MB once |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: a fixed set of 63 static sound files (0.57 MB), each fetched at most once per browser and then cached; the client
  plays at most one wind-up, one shot and one impact per attack, under the existing sound limiter and the official
  per-bank voice caps.
- No server, network or bot code changes: the asset generator (`tools/assets/`) and the client's sound player
  (`public/js/audio.js`) only. Estimated from the file sizes, not measured.

Operator notes:

- Upload the 63 new enemy sound files (0.57 MB, under `public/assets/audio/sfx/enemy/`) with the next art upload; the
  release art gate lists them from `data/assets.json`.
