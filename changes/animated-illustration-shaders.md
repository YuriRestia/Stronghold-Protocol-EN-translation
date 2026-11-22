## 2026-11-22

### Shaders for the animated illustrations

- The official effect player gains the shaders the animated illustrations' effects use, each after the game's own
  program: Dissolve Double edge (AB and Add), Disturb GrabPass and GrabPassOnce, Particle-Blur, RGBsplit, Unlit-Outline
  (with its outline pass), Mask/Erase, 3D/Toon, 3D/MatCapTransparent, Particles-Poker-Reflect, UI/AlphaBlend and
  Disturb2 (AlphaBlend and Add).
- Dusk's Elite 2 illustration no longer shows a blown-out white background: its ink-wash layers use Disturb2, which
  was drawn with another shader's program; they now show the grey-blue wash of the game's art.
- The illustrations' Spine skeletons draw with the game's Spine materials (alpha split, bleed, Tint Black, the PMA
  Multiply material, gray) and spine-unity's vertex colours, in one batch per material.
- Dusk "Hazy Jade" no longer shows a blank face: a clipping mask the skeleton swaps out at idle stayed on and hid her
  eyes, brows, horns and props; her multiply-mode hair shadows now blend normally, as her material in the game does.
- Battle effects are unchanged.

Kind: internal

Server cost: none (browser rendering only; no server, network or bot code)
