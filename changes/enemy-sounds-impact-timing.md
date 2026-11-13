## 2026-11-13

### More enemy skill impacts can be heard

- These enemy skills now play their official impact sound when they hit, with battle effects on or off:
  - Sarkaz Royal Court Elite Caster: its lock-on line and the burst at its end
  - Withered Knight: its explosive arrows
  - OpFor: BlackCloud: devouring flying enemies
  - Yan's Protection: each hit of its flame line
  - OpFor: Gun (Hidden Core): its chain reaching a spring
  - Alistair, Final Flame of the Empire: [Royal Decree]
  - 'Samivilinn,' the Resolution of the Very North: [Surge of Nature]
  - Novice Acolyte: the heal when defeated (the flask thrown, then landing)
  - Jesselton Williams: the shot that stuns several units (Jailer Form)
- Before, these impacts were silent.
- Each one is timed like the official game: the Elite Caster's line and the Withered Knight's arrows ring when they reach
  their target (at the official projectile speed, so a farther target hears it later, and the arrow's look lands at the
  same moment), BlackCloud's grab rings at its official attack moment, and the Acolyte's flask lands at the end of its
  official flight. The timing follows the battle's speed [src: official index.json projectiles.projectile_enemy_dwlock_line / projectile_enemy_dekght_s movement.speed, projectile_enemy_mncrer_heal _lifeTime; official enemy_9009_acfort.skel Skill_1_Begin OnAttack].

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (sounds play from events the battle already sends) [src: public/js/audio.js:2667] | 0 / 0 MB/s [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] |
| Bandwidth out / in, per room (4 players) | 0 / 0 MB/s [src: public/js/audio.js:2667] | 0 / 0 MB/s [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 GB/day) [src: public/js/audio.js:2667] | 0 / 0 MB/s (0 GB/day) [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] |
| Server CPU | 0 % [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] | 0 % [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] |
| Memory | 0 MB [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] | 0 MB [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] |
| Disk | 0 MB/day [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] | 0 MB/day [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] |
| Bot budget | 0 ms/round [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] | 0 ms/round [src: git log --no-merges dev-0.2..HEAD: no server/ file changed] |

- Cap: no new messages or server work; the client picks a sound per event it already gets. The new sound files are
  static assets, downloaded once per player.
- Estimated from the code: the client only chooses among sounds for events it already receives.
- Server upload: the new sound files (under 0.2 MB in all: 31 KB) go up with the next asset upload [src: public/assets/audio/sfx/enemy/e_atk/e_atk_thrwtrpt.mp3 3885 B, e_imp/e_imp_thrwtrpt.mp3 6573 B, e_imp/e_imp_magic_ice.mp3 12974 B, e_skill/e_skill_mephiimp.mp3 7750 B].

Operator notes:

- data/assets.json gains `fxHits` for 11 enemy ids (tools/assets/plan.mjs ENEMY_FX_SOUND_BANKS). Every time there is
  official client data, each comment naming its file and field: `speed` (a projectile's movement speed: the sound waits
  the distance between the units at the fx over it), `after` (a projectile's life, a spine attack event) and `gap` (a
  chain projectile's life), all in battle seconds; public/js/audio.js turns them into real time at the view's playback
  rate (screens/game.js setBattleView). The renderer flies those two shots at the same official speed (skills.js
  `flyDur: 'speed'`) [src: tools/assets/plan.mjs:174].

News:

- point: More enemy skills now play their impact sound when they hit, even with battle effects off
  zh: 更多敌人技能命中时会播放命中音效，即使关闭战斗特效也会播放
  ja: より多くの敵スキルが命中時にヒット音を再生するようになりました（戦闘エフェクトがオフでも再生されます）
  ko: 더 많은 적 스킬이 적중할 때 적중 효과음을 재생합니다(전투 이펙트를 꺼도 재생됩니다)
  zh-TW: 更多敵人技能命中時會播放命中音效，即使關閉戰鬥特效也會播放
