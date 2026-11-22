## 2026-11-22

### Animated illustrations: the renderer and its official timing

- New `public/js/render/dynillust/`: one shared WebGL renderer draws every animated operator illustration of a page
  (Spine skeleton, its official effect layer and background) in the official card framing and copies it into each
  card's own canvas. Not shown in game yet: the result, room and Grand Alliance screens mount it in a later change.
- The official card's action timing is read from the client: idle, a special idle 3–8 s after appearing and then every
  10–23 s, the 90 s idle re-sync, action effects with their delays [src: official GameAssembly.dll
  UICharacterDynIllust..ctor 0x14950FA; RandomUtil.Range 0x6992E80; DynIllust IDLE_COMPLETE_SYNC_THRESHOLD_SECONDS].
- The official effect player gains an illustration mode (effects that never end, nodes switched by their owner, delays
  counted from each switch-on, nodes that follow skeleton bones). Battle effects are unchanged.

Kind: internal

Server cost: none (client rendering only; no server, network or bot code)
