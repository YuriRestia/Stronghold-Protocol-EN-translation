## 2026-11-13

### Enemy revives, form switches and tiers play their official sounds

- Enemies that revive now sound like the official game: the knock-out and the stand-up of Degenbrecher, Zaaro, Free,
  Jesselton Williams and The Big Ugly Thing, and the Dublinn Flamechasers' ember and their return. Zaaro's knock-out
  holds its official loop until Zaaro stands up again. [src: tools/assets/plan.mjs:164]
- Other official moments that were silent now play too: Jetman's landing, OpFor: Bonespur's switches, Gunshatter's
  shield taking hits, the Echoes' form switches and ensembles, Alistair's golden shield and advance, Samivilinn's doom,
  Lucky Flyfin taking off, Snowchild hitting high ground, the OpFor blades being shot down, and more (24 enemies).
  [src: tools/assets/plan.mjs:164]
- Sounds that belong to a moment inside an enemy's animation now play at that moment of the animation, as in the
  official game: Jesselton Williams's three knock-out sounds, the Shoulder Cannon Crawler's volley, each shot of it.
  [src: official enemy_1516_jakill.skel C1_Die OnPlayAudio; enemy_1273_stmgun_2.skel Skill emit; tools/assets/plan.mjs:172]
- Mudrock's attacks now change sound as Mudrock's charge grows, by the official rule: tiers 4 and 5 swing with their own heavy
  sounds. [src: official buff template enemy_mdrock_s_1[persistent]; server/sim/content/enemies/leaders.js:65]
- Yans Protection's flame holds its official looping sound while its skill runs. [src: official audio_data
  battle.ON_ABILITY_ON.enemy_9012_acloon.Skill_2]

Kind: player

News:

- point: Enemy revives, form switches and tiers now play their official sounds, such as {name:enemy_1525_blkswb}'s revival
  zh: 敌人的复活、形态切换与阶段变化现在会播放官方音效，例如{name:enemy_1525_blkswb}的复活
  ja: 敵の復活・形態変化・段階変化が公式の効果音を再生するようになりました（{name:enemy_1525_blkswb}の復活など）
  ko: 적의 부활, 형태 전환, 단계 변화가 이제 공식 효과음을 냅니다(예: {name:enemy_1525_blkswb}의 부활)
  zh-TW: 敵人的復活、形態切換與階段變化現在會播放官方音效，例如{name:enemy_1525_blkswb}的復活

Server cost:

Default mode (client-side combat, the live setting: `SP_COMBAT` unset, clientCombat true). Battles run in the players'
browsers, and watchers get the field's spec (`b.start`) and simulate it locally. The new display events are made in
each browser and never cross the server. [src: server/match/Match.js:286] [src: server/match/Match.js:478]
[src: server/match/match/watch.js:136] [src: server/match/fields.js:215]

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) for the events [src: server/match/Match.js:286]; about 0.05 MB once (the new sounds of one match's enemies, then cached) [unverified] | 0 / 0 MB/s [src: server/match/Match.js:286]; 1.13 MB once (all 31 new files), then cached [src: data/assets.json audio.sfx.units, new files vs dev-0.2, sizes on disk] |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s [src: server/match/Match.js:286]; about 0.2 MB once [unverified] | 0 / 0 MB/s; 4.5 MB once [src: data/assets.json audio.sfx.units, 1.13 MB × 4] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: server/match/Match.js:286]; about 0.02 GB once [unverified] | 0 / 0 MB/s; 0.34 GB once [src: data/assets.json audio.sfx.units, 1.13 MB × 300] |
| Server CPU | 0 % (the sim runs in the browsers) [src: server/match/Match.js:478] | 0 % [src: server/match/Match.js:478] |
| Memory | 0 MB [src: server/match/Match.js:478] | 0 MB [src: server/match/Match.js:478] |
| Disk | 1.13 MB once (31 new sound files), then 0 MB/day [src: data/assets.json audio.sfx.units, new files vs dev-0.2, sizes on disk] | 1.13 MB once [src: data/assets.json audio.sfx.units] |
| Bot budget | 0 ms/round (display events only; bots do not read them) [src: server/sim/content/bosses.js:759] | 0 ms/round [src: server/sim/content/bosses.js:759] |

Legacy server-combat mode only (`SP_COMBAT=server`, off on the live server). The server runs the battles and streams
each field's events to its watchers, so the new display events cross the wire, about 60 bytes each. [src:
server/match/fields.js:215] [unverified]

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | about 0 / 0 MB/s: a few events per match [unverified] | 0.00005 MB/s (0.004 GB/day if it never stopped) while fighting Gunshatter: 43 to 84 shield-hit events per 200 s battle in the golden Gunshatter rounds, at most 0.84 per second at 2× speed [src: test/golden/fields.json:1204] [src: test/golden/fields.json:1262] |
| Bandwidth out / in, per room (4 players) | about 0 / 0 MB/s [unverified] | 0.0002 MB/s (0.02 GB/day if it never stopped), all four fields fighting Gunshatter [src: test/golden/fields.json:1262] |
| Bandwidth out / in, 300 players | about 0 / 0 MB/s [unverified] | 0.015 MB/s (1.3 GB/day only if every field fought Gunshatter all day) [src: test/golden/fields.json:1262] |
| Server CPU | about 0 %: one stack check before a Mudrock attack, one event per Gunshatter shield hit [unverified] | about 0 % [unverified] |

- Cap: the new display events are at most 5 tier changes per Mudrock, one landing per Jetman take-off, one per Bonespur
  switch, and one per normal physical hit on a Gunshatter's shield; the client plays at most 2 shield hits at once.
  31 static sound files (1.13 MB), each fetched at most once per browser and then cached. The client plays one held
  loop per enemy at most, stopped at its death, its skill's end or the field's change. [src:
  server/sim/content/enemies/leaders.js:65] [src: server/sim/content/bosses.js:759] [src: official audio_data
  battle.ON_CUSTOM_TRIGGER.actrpa_t_1.shield_hit maxSoundAllowed] [src: data/assets.json audio.sfx.units]
- Code: display-only fx in the sim kits (`server/sim/content/`), the asset generator (`tools/assets/plan.mjs`) and the
  client's sound player (`public/js/audio.js`). Event rates measured in the golden runs; bytes per event estimated from
  the event's JSON size; file sizes measured.

Operator notes:

- Upload the 31 new enemy sound files (1.13 MB, under `public/assets/audio/sfx/enemy/`) with the next art upload; the
  release art gate lists them from `data/assets.json`. [src: data/assets.json audio.sfx.units]
