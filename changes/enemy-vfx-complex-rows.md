## 2026-11-13

### Leader and boss effects on the operators they reach

- With official effects on, these now show the game's own effect on the units they reach, for as long as it lasts:
  - Zaaro, Signore dei Lupi: the fear cage on the operators it catches, and the hit when it ends. Its own glow shows
    while they wait for the cure, and its fear aura shows on the operators around it.
  - Degenbrecher's second-form SP clear, on each operator it reaches.
  - OpFor: Quagmire's parasite, on the operator it latches onto.
- These now show the game's own hit effect on the operators they strike:
  - Jesselton Williams's armour-piercing strike.
  - 'Gunshatter' running operators over while it chases its gun.
- Before: the operators showed nothing.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | under 0.0001 / 0 MB/s (under 0.01 / 0 GB/day): these leaders and bosses come in a few rounds only | 0.0004 / 0 MB/s while Zaaro holds 3 caged and 4 slowed operators and the others are on the field |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | under 0.0008 / 0 MB/s | 0.0032 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.03 / 0 MB/s (under 2.6 / 0 GB/day) | 0.12 / 0 MB/s (10 / 0 GB/day, if every player fought them all at once all day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB (one state probe per Zaaro) |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | under 0.01 ms/round (nothing new runs in the battle's ticks) |

- Cap: one effect row (about 40 B) per affected unit and effect. The one-shot hits last 0.3 s, Degenbrecher's for the
  clear's duration. They go out when they change, plus a full set once a second (shared/fxsDiff.js).
- Estimated from the code and the row sizes, not measured: display-only buff keys, short rows and one snapshot-time
  probe; no event, no state the battle reads.

News:

- point: {name:enemy_1535_wlfmster}'s fear cage and fear aura now show their official effects on the operators they hold
  zh: {name:enemy_1535_wlfmster}的恐惧牢笼和恐惧光环现在会在受影响的干员身上显示官方特效
  ja: {name:enemy_1535_wlfmster}の恐怖の檻と恐怖のオーラが、影響を受けたオペレーターに公式エフェクトを表示するようになりました
  ko: {name:enemy_1535_wlfmster}의 공포의 우리와 공포 오라가 이제 영향을 받은 오퍼레이터에게 공식 이펙트를 표시합니다
  zh-TW: {name:enemy_1535_wlfmster}的恐懼牢籠和恐懼光環現在會在受影響的幹員身上顯示官方特效
- point: {name:enemy_1525_blkswb}, {name:enemy_1516_jakill}, {name:enemy_9007_acelem} and {name:enemy_9018_actrpa} now show their official effects on the operators they hit
  zh: {name:enemy_1525_blkswb}、{name:enemy_1516_jakill}、{name:enemy_9007_acelem}和{name:enemy_9018_actrpa}现在会在被命中的干员身上显示官方特效
  ja: {name:enemy_1525_blkswb}、{name:enemy_1516_jakill}、{name:enemy_9007_acelem}、{name:enemy_9018_actrpa}が命中したオペレーターに公式エフェクトを表示するようになりました
  ko: {name:enemy_1525_blkswb}, {name:enemy_1516_jakill}, {name:enemy_9007_acelem}, {name:enemy_9018_actrpa}이(가) 이제 적중한 오퍼레이터에게 공식 이펙트를 표시합니다
  zh-TW: {name:enemy_1525_blkswb}、{name:enemy_1516_jakill}、{name:enemy_9007_acelem}和{name:enemy_9018_actrpa}現在會在被命中的幹員身上顯示官方特效
