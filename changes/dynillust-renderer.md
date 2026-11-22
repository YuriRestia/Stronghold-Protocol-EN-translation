## 2026-11-22

### Animated illustrations: the renderer and its official timing

- New `public/js/render/dynillust/`: one shared WebGL renderer draws every animated operator illustration of a page
  (Spine skeleton, its official effect layer and background) in the official card framing and copies it into each
  card's own canvas. Not shown in game yet: the result, room and Grand Alliance screens mount it in a later change.
- The official card's action timing is read from the client: idle, a special idle 3–8 s after appearing and then every
  10–23 s, the 90 s idle re-sync, action effects with their delays [src: official GameAssembly.dll
  UICharacterDynIllust..ctor 0x14950FA; RandomUtil.Range 0x6992E80; DynIllust IDLE_COMPLETE_SYNC_THRESHOLD_SECONDS].
- Each card contains the whole official card window, centred, at every screen size: a card of another shape only adds
  art around it, instead of a zoomed picture cut at the bottom (the Grand Alliance card at 1546 × 905 showed 46 % of
  the official height) [src: notes dev49-l2d-review-findings.md §1, §4].
- Skeletons are posed y-up as the official runtime poses them, and path constraints use Spine's own math: Angelina the
  Mellow Wish's face and Exusiai the New Covenant's legs were torn into flat pale shapes [src: notes
  dev50-gpu-skinning-report.md §Pale shapes].
- The half tier draws again (its atlas frames were placed twice as far, so no card went live on a phone), and the
  effect files load for the cards in turn, so the first cards no longer wait behind the others' downloads.
- Cards start smoothly when a page shows many at once: each card's first-draw work (uploads, shader builds, its
  skeleton and effects, the particle prewarm, a warm-up draw) runs in small steps before it reports ready, so the worst
  frame while a page's cards start roughly halves [src: notes dev50-gpu-skinning-report.md §Paging].
- The illustrations no longer look jagged at card size: every atlas page gets mipmaps (Pixi built none for pages whose
  sides are not powers of two, 85 of the 98) [src: notes dev50-gpu-skinning-report.md §Jagged edges].
- Skeletons skin on the GPU (WebGL2, phones included): the CPU keeps only the animation and bone transforms, the
  vertex shader places every vertex. 8 heavy illustrations at once: 35 → 43 fps on the dev PC, the same pixels as the
  CPU path on 17 illustrations [src: notes dev50-l2d-perf-report.md §GPU skinning].
  Without WebGL2 they draw through pixi-spine as before.
- Animation timelines that never move a bone are dropped once per skeleton (about half of all bone timelines), so the
  per-frame animation update costs about 15 % less CPU for the same pixels [src: notes dev50-l2d-perf-report.md
  §Constant timelines].
- Cards never load the tap and entry effects they do not play (31 MB over all 98 illustrations) [src: notes
  dev50-l2d-perf-report.md §Load groups].
- A card's particle warm-up (the prewarm that makes a looping effect start full) runs in 4 ms slices before the card
  is ready, instead of one 37–93 ms frame per card; the particles end exactly the same. Long tasks while a page's cards
  load roughly halve at 4K and on a slowed CPU [src: notes dev50-l2d-perf-report.md §Sliced prewarm].
- A card is ready only once everything it will show is loaded, uploaded and warmed, its special idle included: the
  stage canvas is sized for the whole page, each card takes one real step and a hidden first draw, and each
  illustration runs 40 hidden frames into its special idle on a throwaway copy. Cards whose special idles fall due in
  the same frame start them a frame apart. Pages take about 0.5 s longer to be ready (the user's call: "Wait until
  it's ready, then play the animation") [src: notes dev50-l2d-perf-report.md §Warm before ready].
- The cards are drawn in three Workers, each with its own WebGL context, straight into the cards' canvases: loading,
  warming and every animation frame leave the page's main thread, so the page and its menus stay smooth however heavy
  the cards are. Browsers without Worker canvases draw on the main thread as before [src: notes
  dev50-l2d-perf-report.md §Workers]. The cards are shared out by what each Worker draws now (each illustration
  weighted by its download size plus a fixed part per card), so turning a page spreads the new cards evenly again: the
  busiest Worker on a page 5 → 6 swap went from 61 to 78 fps [src: notes dev50-l2d-perf-report.md §Cost per card].
  The Workers draw under the site's CSP (no eval, as the page does), and a Worker that cannot draw is never given
  cards: it must draw a test square before it starts, else the page draws the cards itself; a card whose stage cannot
  draw at all keeps its 2D art. Before, every card on the real server turned live on an empty background.
- The official effect player gains an illustration mode (effects that never end, nodes switched by their owner, delays
  counted from each switch-on, nodes that follow skeleton bones). Battle effects are unchanged.

Kind: internal

Server cost: none (client rendering only; no server, network or bot code)
