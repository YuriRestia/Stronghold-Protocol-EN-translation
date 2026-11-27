## 2026-11-27

### Dark Proton and Beneath the Bark art framed on the cards

- Astgenne the Lightchaser's Dark Proton and Magallan's Beneath the Bark now show their full art framed on the room, Grand Alliance, solo room and result cards like every other outfit: on the face from the official portrait on the wide cards, where the official client places it on the tall ones.
- Before: the two outfits added on 2026-11-27 had no framing, so their art showed unplaced.

Kind: player

Server cost: none (two entries in a static data file the page already loads; no server, network or bot code)

Operator notes:

- tools/card-art-framing.mjs reads the art where data/assets.json puts it (outfit/art2k), takes `--only <art name>` on every step, and `--check` lists unframed arts; fetch-assets prints that check, and docs/OUTFITS.md "Adding outfits" step 5 has the commands.
