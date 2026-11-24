## 2026-11-24

### Corrosion works on bosses

- Final Assault and Hidden Core bosses now take Corrosion like every other Elemental Injury: the bar fills to 2000 and bursts for 5000 Elemental damage and a permanent, stacking DEF -120.
- Clementia's third skill now bombs a boss whose Corrosion bursts, and Thumpy's and Muelsyse's Corrosion effects work on bosses too.
- Before: bosses ignored Corrosion completely, a rule from a loading tip that only the Chinese server's Season 2 Part 1 had. Boss HP is unchanged.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) [src: server/sim/content/bosses.js:329 one battle hook removed, no message added] | 0 / 0 MB/s [src: server/sim/content/bosses.js:329] |
| Bandwidth out / in, per room | 0 / 0 MB/s [src: server/sim/content/bosses.js:329] | 0 / 0 MB/s [src: server/sim/content/bosses.js:329] |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) [src: server/sim/content/bosses.js:329] | 0 / 0 MB/s [src: server/sim/content/bosses.js:329] |
| Server CPU | 0 % of one core: battles run in the players' browsers [src: docs/design/network.md:352] | 0 % [unverified] |
| Memory | 0 MB [src: server/sim/content/bosses.js:329 nothing stored] | 0 MB [src: server/sim/content/bosses.js:329] |
| Disk | 0 MB/day [src: server/sim/content/bosses.js:329 writes nothing] | 0 MB/day [src: server/sim/content/bosses.js:329] |
| Bot budget | 0 ms/round: no bot code changed, one hook fewer per battle [unverified] | 0 ms/round [unverified] |

- Cap: a boss bursts at most once per 8 s lock [src: server/sim/constants.js:104].
- Estimated, not measured: the change only removes a battle hook.

News:

- point: Bosses now take Corrosion: it bursts on them, and {name:char_4231_clemnt}'s third skill bombs them
  zh: 领袖现在会受到侵蚀损伤：侵蚀损伤可在领袖身上爆发，{name:char_4231_clemnt}的三技能也会轰炸领袖
  ja: ボスが侵蝕損傷を受けるようになりました。ボスでも侵蝕損傷が爆発し、{name:char_4231_clemnt}のスキル3がボスを砲撃します
  ko: 이제 리더도 침식 손상을 받습니다. 리더에게도 침식 손상이 폭발하며, {name:char_4231_clemnt}의 3스킬이 리더를 폭격합니다
  zh-TW: 領袖現在會受到侵蝕損傷：侵蝕損傷可在領袖身上爆發，{name:char_4231_clemnt}的三技能也會轟炸領袖
