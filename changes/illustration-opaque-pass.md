## 2026-11-23

### Animated illustrations: the game's draw order for solid 3D pieces

- Solid 3D pieces in an animated illustration (W's Elite 2 bullets and grenades) now draw before the painted art and
  hide or are hidden by it by depth, as the game draws them; the art's skeleton tests depth like its game material.
- W's bullets still appear and disappear without fading, as they do in the game: their game shader has no fade.

Kind: internal

Server cost: none (browser rendering only; no server, network or bot code)
