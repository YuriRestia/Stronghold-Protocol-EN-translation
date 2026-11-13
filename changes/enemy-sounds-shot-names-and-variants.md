## 2026-11-13

### More enemy attacks play their official sounds

- Death blasts now have their official explosion sound: Infused Originium Slug, Infused Glacial Originium Slug and an
  ignited Cabbage Seedling. OpFor: Fissure's poison lob at its killer now sounds as it launches.
- Diver's arrows land with their official water splash, and Corrupted Knight's blows with their splash blade, each beside
  the impact they already had.
- Some enemies attack differently in another form, and now play that form's own sound: Degenbrecher's second form
  strikes with its heavy slash, 'Echoes' in its dark form with that form's own strike, and Sarkaz Wither Vanguard (and Elite) on
  an infection tile with its Originium sword.
- Before: these were silent, or played the usual attack sound.

Kind: player

News:

- point: More enemy attacks now play their official sounds, such as {name:enemy_1021_bslime}'s death blast and {name:enemy_1525_blkswb}'s second-form slash
  zh: 更多敌人的攻击现在会播放官方音效，例如{name:enemy_1021_bslime}的死亡爆炸和{name:enemy_1525_blkswb}第二形态的斩击
  ja: より多くの敵の攻撃が公式の効果音を再生するようになりました（{name:enemy_1021_bslime}の死亡時の爆発、{name:enemy_1525_blkswb}の第二形態の斬撃など）
  ko: 더 많은 적의 공격이 이제 공식 효과음을 냅니다(예: {name:enemy_1021_bslime}의 사망 폭발, {name:enemy_1525_blkswb}의 2형태 베기)
  zh-TW: 更多敵人的攻擊現在會播放官方音效，例如{name:enemy_1021_bslime}的死亡爆炸和{name:enemy_1525_blkswb}第二形態的斬擊

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) during play; under 0.02 MB once (estimated: the new sounds of one match's enemies, then cached) | 0.055 MB once (all 5 new files), then cached |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s (0 / 0 GB/day); under 0.08 MB once | 0.44 MB once |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day); under 0.006 GB once (estimated) | 0.017 GB once |
| Server CPU | 0 % | 0 % |
| Memory | 0 MB | 0 MB |
| Disk | 0.055 MB once (5 new sound files to upload), then 0 MB/day | 0.055 MB once |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: a fixed set of 5 static sound files (0.055 MB to upload), each fetched at most once per browser and then cached;
  the client plays at most one extra impact per attack and one sound per death blast, under the existing sound limiter and
  the official per-bank voice caps.
- No server, network or bot code changes: the asset generator (`tools/assets/`) and the client's sound player
  (`public/js/audio.js`) only. Estimated from the file sizes, not measured.
