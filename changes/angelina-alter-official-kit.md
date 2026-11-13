## 2026-11-14

### Angelina the Mellow Wish now fights like the official game

- Her attacks fly as her own projectiles at 10 tiles/s and hit when they arrive, instead of at once [src: official projectile_chr_aglna2 prefab _speed].
- After S1 and S2 end she plays her 1 s landing before she touches down; S3's take-off takes 1 s before she can fly or attack [src: official char_1015_aglna2 skel Skill_1_End / Skill_2_End / Skill_3_Begin durations].
- S3: she only takes off between attacks, flies to a random flyer she can block, along the official speed curve (2.4 slowing to 2.0 tiles/s) and turning after a target that moves; when the skill ends she holds for 0.333 s, immune to stun and freeze, then returns home [src: official projectile_chr_aglna2_s3_fly prefab; RestoreAbility Skill_3_Restart_Begin].
- S3's shelter for airborne allies now also lowers damage over time.
- Before: she floated at a flat 1.3 tiles, her hits were instant, she landed the moment a skill ended, S3 left mid-attack, always chased the nearest flyer and jumped home at once, and damage over time ignored the shelter.

### Her effects and sounds

- S2's glide shows its trail and ground mark, enemies she lifts show her own lift effect, S3's flight plays her flying animation and her S3 attacks while blocking use her S3 combat animation.
- She flies at her official height: 0.8 tiles up, rising over 0.8333 s (S2 rises over 1 s once its chant ends), landing over 0.8333 s as her landing starts, and 0.4 on high ground during S3 [src: official buff_template_data aglna2_height_ctrl[tween], aglna2_s_2[chant_end], aglna2_s_3[mode]].
- Her skill hits, S2's second attack sound, S3's start, her deployment, the glide, the lift and ground-bind, each S3 flight, the return home and every landing now play their official sounds.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day): the new events are display-only and stay in the browser that runs the battle [src: docs/design/network.md §14]; 0.2 MB once for the new sounds, then cached [src: data/assets.json stats.bytes +221385] | the same |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s; 0.8 MB once at most [src: 4 × 0.2 MB] | the same |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day); 0.06 GB once at most [src: 300 × 0.2 MB, estimated] | the same |
| Server CPU | about 0 % of one core: one flight step per tick while her S3 flight runs, in fields the server simulates [unverified] | about 0 % [unverified] |
| Memory | 0 MB [unverified] | 0 MB [unverified] |
| Disk | 0.2 MB once (13 new sound files), then 0 MB/day [src: data/assets.json stats.files +13] | 0.2 MB once |
| Bot budget | 0 ms/round: bots do not field her flight differently, display events are not read [unverified] | 0 ms/round [unverified] |

- Cap: one flight per S3 move (the move check runs every 0.1 s, at most one flight at a time) [src: server/sim/content/kits/ops/op-aglna2.js MOVE_CHECK]; 13 static sound files, each fetched at most once per browser.
- Code: her kit (`server/sim/content/kits/ops/op-aglna2.js`), the projectile switch for melee shots (`server/sim/ai.js`), the client's bindings and the sound plan. Estimated from file sizes, not measured.

Operator notes:

- Upload the 13 new sound files (0.2 MB, under `public/assets/audio/sfx/`) with the next art upload; the release art gate lists them from `data/assets.json`.


News:

- point: {name:char_1015_aglna2} now fights, moves, flies and sounds like the official game
  zh: {name:char_1015_aglna2}的战斗、移动、飞行高度和音效现在与官方游戏一致
  ja: {name:char_1015_aglna2|Angelina the Mellow Wish}の戦闘・移動・飛行の高さ・効果音が公式ゲームと同じになりました
  ko: {name:char_1015_aglna2|Angelina the Mellow Wish}의 전투, 이동, 비행 높이, 효과음이 이제 공식 게임과 같습니다
  zh-TW: {name:char_1015_aglna2}的戰鬥、移動、飛行高度和音效現在與官方遊戲一致
