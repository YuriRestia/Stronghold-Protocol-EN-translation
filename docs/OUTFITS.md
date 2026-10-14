# Outfits (时装) — fork feature

Players can dress operators in their official outfits. It's cosmetic only: the battle sim, the golden results and the
match never read an outfit. This feature exists on this fork only (upstream turned a skin system down).

## Rules

- Every player owns every outfit. There is no unlock and no shop.
- A choice is `{ [charId]: skinId }`, stored in the browser (`sp.pref.outfits`) like the loadout. It has its own JSON
  导出 / 导入 (`{ v: 1, kind: 'outfits', outfits }`, shared/outfits.js).
- An outfit replaces the operator's whole look, the E2 (golden) art included, as in the official client:
  - the avatar and the half-body portrait (the 干员调配 rows and header, the shop cards, the bench, the detail card)
  - the battle model (Front and Back)
  - the full artwork (the picker's preview)
  - its summons' looks (`tokenSkinMap`)
  - its own voice set, when it has one
- 默认 (no entry) keeps today's art exactly: E0/E1 art, E2 art when golden. The picker's 默认 card previews the E2
  artwork.
- Other players see your outfits, and you see theirs: on the field, their detail card, a watched teammate's bond popup
  and the result screen's lineups (`UnitThumb` `outfitOwner`). Bots wear the default look. A 补位 stand-in is another operator and wears nothing of
  the one it replaces (it wears its own outfit, if you chose one for it). A 自选 piece wears its pick's outfit.
- The picker: a click on a card wears it, and the preview always shows the worn outfit (no hover preview: hard to use,
  2026-10-12). The artwork takes most of the preview; a click opens it full size. The sprite is drawn at the battle's
  scale (320 skeleton units = a tile, half the box's height), not fitted to its setup-pose bounds, which effect
  attachments make 150–1665 units tall; the canvas follows its box (ResizeObserver).
- 自选编队 operators have no 干员调配 detail: a filled slot whose operator has outfits gets a 时装 button that opens the
  same panel in a dialog (screens/diy.js, OutfitDialog). The slot picker's detail also lists the outfits of the
  operator being picked (OutfitPickSection: compact cards + 预览 for the full panel). Like the voice language next to
  it, a click there wears the outfit at once; it is not part of the pick, so 取消 keeps it.

## Where things live

| Part | File |
|---|---|
| Outfit data (official zh_CN `skin_table`) | `tools/build-outfits.mjs` → `data/outfits.json` (committed) |
| Outfit names in other languages | `tools/build-i18n.mjs` (walks `skin_table`; CN-only names from `tools/i18n/fallback-outfits-en.json`, arknights.wiki.gg) |
| Art, models, voices | `tools/assets/plan.mjs` planOutfits → manifest `outfits` + the voice trees |
| Artwork WebP conversion | `tools/assets/downloader.mjs` convertImage (sharp, optional dependency) |
| Choice rules, export format | `shared/outfits.js` |
| Choice store, sync, resolvers | `public/js/ui/outfits.js` |
| Picker (干员调配 → 时装 switch; 自选编队 slot → 时装 dialog) | `public/js/screens/outfits.js`, `public/js/screens/diy.js`, `public/css/screens/loadout.css` |
| Model / picture by outfit id | `public/js/assets.js` (outfitRec, spineEntry, unitPictureUrl, hasBackSpine) |
| 2D avatar / portrait | `public/js/ui/assetUrls.js` (setOutfitPicker) |
| Battle model | `public/js/render/units.js` (`info.model`, `_modelId`; resolved by `ctx.outfitOf`) |
| Voice | `public/js/audio.js` (setOutfitVoiceResolver, outfitVoiceLine) |
| Server | `shared/protocol.js` `room.outfits`, `server/lobby.js` outfits() + room.state `seats[].outfits` |
| Preload | `shared/resources.js` pack `outfits` (optional, off by default) |
| Tests | `test/outfits.test.js`, `test/outfits-sync.test.js`, `test/render/outfit-model.test.js`, `test/ui/diy-ui.test.js`, `test/ui/outfits.e2e.test.js` |

## Data: `data/outfits.json`

`{ [skinId]: { id, charId, name, series, model, avatar, portrait, voice, tokens, layout } }`, one record per line,
sorted by charId and then by the table's order. It covers the roster's operators (data/chess.json) and the 自选编队
ones (data/backups.json `diy.operators`, also the 补位 stand-ins): `outfitRoster`, which tools/fetch-assets.mjs uses for
the 默认 artwork too. Only outfits with a battle model are kept (every one has one). Build it with `node tools/build-outfits.mjs` (`--check` compares,
`--offline` uses the cache).

- `model`: `battleSkin.skinOrPrefabId`. fexli's folder is the same id with `#` → `_`.
- `voice`: `voiceId` when the outfit has its own voice set (a charword word key), else null. Several outfits can share
  one set (Mudrock's four use `char_311_mudrok#1`).
- `tokens`: `{ [tokenId]: tokenSkinId }`, only summons data/tokens.json or data/backups.json has.
- `layout`: the model's folders on fexli. `fb` = Front + Back. `front` = Front only: the client draws it facing away
  too, and no Back is planned, so no 404 on every run. `single` = one `Spine/` model for both directions. The build
  reads the folders from one GitHub API listing; without it, it keeps the current file's layouts.

## Assets: manifest `outfits`

```js
outfits: {
  chars:    { [skinId]: { avatar, portrait, art, spine: { front: Spine, back?: Spine } } },
  tokens:   { [tokenSkinId]: { token: tokenId, avatar?, spine?: Spine } },
  defaults: { [charId]: { art } },   // the operator's own artwork (E2, else E1): the picker's 默认 card
}
```

- Files live under `public/assets/outfit/`: `avatar/`, `portrait/` (PNG), `art/` (WebP) and `spine/<skinId>/front|back/`.
  The paths are `safeName`d (`#` → `_`).
- The artwork is yuanyan's `skin/<portraitId>b.png` (~3 MB). The download converts it to WebP, fitted inside 1024 px
  (~150–250 KB, alpha kept). The ledger records the converted size, so a re-run skips it. Without sharp, the job fails
  and the next run retries it.
- Outfit voice sets sit in the voice trees (`audio.voice`, `voiceJp`, `voiceEn`, `voiceKr`) under their word key
  (`'char_4064_mlynar_epoque#28'`). The dump's folder keeps the `#` (URL-encoded `%23`); the local folder is
  `safeName`d. A dub that lacks a line leaves it out. CN-only outfits have no EN dub yet, so their EN tree misses them
  and the client falls back EN → JP → 中文.
- Size (2026-10-12, 273 outfits): ~455 MB on disk (models 311 MB, portraits 33 MB, avatars 19 MB, artwork 91 MB).
- The `outfits` preload pack is optional and off by default. Unticked, each file loads when it is first used. Its saved
  files have their own remove button ("删除未勾选的时装", resources/index.js removeOutfitsPack), separate from the
  voices' ("删除未勾选的语音", voice packs only).

## Protocol

- C2S `room.outfits { outfits }`: `shared/protocol.js` isOutfitMap checks the shape (≤ 256 entries, each an outfit of
  its own operator). The lobby keeps the outfits `data/outfits.json` knows and stores them on the session and the seat.
  When they changed, it broadcasts `room.state`. Accepted in any phase: a running match shows the change at once. It is
  one of `HEAVY_TYPES` (server/net.js: ~2 per second, a burst of 6, per connection), so a modified client can't flood
  the room with broadcasts; the client debounces its edits and retries a `RATE` refusal.
- S2C `room.state` `seats[].outfits`: present only when the seat has a choice.
- The client (`installOutfitSync`) sends after every `welcome` and every edit (debounced 500 ms).

## Rendering

A unit's owner is its `ownerId` (sim UnitInfo, scout views). A piece without one is the player's own (the own prep board
and bench). `outfitModelOf(info)` gives:

- an operator: the owner's outfit for `info.spine` (the charId)
- a summon: the look one of the owner's outfits gives it
- otherwise null

`render/units.js` keeps `info.spine` for FORMS, sounds and voice. It draws `info.model` when the manifest has that model
(`_modelId`), else the operator's own model. The outfit is read once, when the view is built, so a change shows on the
views built after it (a new piece, the next battle); a unit already on the board keeps its look until then.
