## 2026-11-15

### Big battles keep full animation longer, and your own operators keep it longest

- In big fights, units switch to simplified animation (a cached picture redrawn every few frames) only after the frame rate has stayed low for a while, and switch back once it has been steady again. The first seconds of each battle no longer count, and every battle starts fresh.
- Enemies are simplified first. Your operators and your helpers' operators keep full animation as long as possible.
- Before: one slow moment at the start of a battle, while effects loaded, could put the whole field on simplified animation, and it carried over into later battles.

### New setting: Simplified Sprite Animation

- Settings → Simplified Sprite Animation has three choices:
  - **Auto** (default): full animation; if the frame rate drops, units switch to simplified animation until it recovers.
  - **Quality**: units keep full animation even if the frame rate drops. Very large crowds (about 90+ units) still use simplified animation.
  - **Unlimited**: every unit is always fully animated.

Kind: player

Server cost: none (client rendering only: public/js/render and the Settings screen; no server, network or bot code)

News:

- point: Big battles keep full animation longer, and enemies switch to simplified animation before your operators do
  zh: 大规模战斗中单位会更久地保持完整动画，并且敌人会先于你的干员切换为简化动画
  ja: 大規模な戦闘でユニットがより長くフルアニメーションを保ち、敵があなたのオペレーターより先に簡略化アニメーションに切り替わるようになりました
  ko: 대규모 전투에서 유닛이 더 오래 전체 애니메이션을 유지하고, 적이 내 오퍼레이터보다 먼저 간소화 애니메이션으로 전환됩니다
  zh-TW: 大規模戰鬥中單位會更久地保持完整動畫，並且敵人會先於你的幹員切換為簡化動畫
- point: New setting {term:简化单位动画}: Auto, Quality or Unlimited
  zh: 新增设置{term:简化单位动画}：自动、画质优先或无限制
  ja: 新しい設定{term:简化单位动画}：自動・画質優先・無制限
  ko: 새 설정 {term:简化单位动画}: 자동, 품질 우선, 무제한
  zh-TW: 新增設定{term:简化单位动画}：自動、畫質優先或無限制
