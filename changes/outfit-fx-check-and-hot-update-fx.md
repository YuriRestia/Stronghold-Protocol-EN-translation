## 2026-11-27

### Outfit effects check; the effects extractor reads the client's hot update

- `tools/local-extract/fx.py` reads the CN client's hot-update bundles (`Arknights_Data/PersistentData/Bundles`) before the shipped ones, as the illustration and voice extractors do. New outfits' effect twins arrive there first; a run on the shipped bundles alone missed the 26 twins of Dark Proton and Beneath the Bark.
- New `tools/assets/outfit-fx-check.mjs`: lists outfits whose own official effects the local fx index lacks, or whose client effect bundle changed since the last fx run, with the command that fills them. `tools/fetch-assets.mjs` runs it at its end (warnings only).
- Client discovery (`tools/local-extract/client-candidates.json`) looks on drives C to Z, not C to H.
- docs/OUTFITS.md "Adding outfits" is the checklist for new outfits.

Kind: internal

Server cost: none (extraction tooling and docs; no server, network or bot code)
