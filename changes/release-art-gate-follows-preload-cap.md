## 2026-11-24

### The release's art gate follows the preloader's limit

- The gate before `prepare` counts the files the preload manifest would list (not the Live2D cards) against the
  preloader's own `MAX_MANIFEST_FILES`, from the art list the release already reads. It also stops on a folder in
  `public/assets` or `public/fonts` named like an art backup, which the higher limit alone would no longer catch.
- Before: it stopped at 60,000 files of `public/`, the preloader's old limit.

Kind: internal

Server cost: none
