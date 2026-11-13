## 2026-11-14

### Flying units and take-offs at their official heights

- Flying enemies now hover at the height the official game gives each of them: most drones 1.2 tiles, a few at 1.0, 0.8 or 1.5, and they appear at that height instead of rising into it. Yan's Protection hovers at 1.0. [src: docs/research/12-flying-visuals-official.md §7]
- Operators that take off now rise to their own official height on the official timing: Tippi to 0.8 tiles over 0.83 s, Leizi the Thunderbringer to 0.4 tiles (and down while her skill runs), and Kal'tsit Esperanta stays on the ground. [src: docs/research/12-flying-visuals-official.md §7]
- Before: every flyer and every skill take-off hovered at one flat 1.3 tiles, and talent take-offs at 0.3. [src: docs/research/12-flying-visuals-official.md §7]

Kind: player

Server cost: none (drawing only; enemies.json and tokens.json gain 25 short `flyHeight` fields, under 1 KB, sent with the data as before) [src: data/enemies.json flyHeight]

News:

- point: Flying enemies and {name:char_4191_tippi}'s take-off now hover at their official heights
  zh: 飞行敌人与{name:char_4191_tippi}的起飞高度现在与官方一致
  ja: 飛行する敵と{name:char_4191_tippi}の飛行高度が公式と同じになりました
  ko: 비행 적과 {name:char_4191_tippi}의 이륙 높이가 이제 공식과 같습니다
  zh-TW: 飛行敵人與{name:char_4191_tippi}的起飛高度現在與官方一致
