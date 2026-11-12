## 2026-11-12

### Civilight Eterna's S3 background stays behind her (from upstream)

- The tall background her S3 raises now draws just behind Civilight Eterna and in front of raised tiles, instead
  of covering her or hiding under the tiles. From upstream: ForkΨKILLET (@ForkKILLET), PR #919 and #924.
- On the 3D boss field, scene parts the game client keeps switched off are no longer drawn, and the scene
  extractor leaves them out (no more white squares on maps that have them). Our current boss fields have no such
  parts, so nothing needs re-extracting. From upstream: sganggs, issue #918.
