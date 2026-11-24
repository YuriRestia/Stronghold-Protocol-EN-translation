## 2026-11-24

### Still outfit and Elite 2 art is framed on the solo room and result cards

- The solo room's card and the result screen's team cards now show an operator's full outfit or Elite 2 art framed on the operator's face, inside the same card window the animated illustrations use, instead of the small portrait picture cut by the card. Heads, horns and ears are no longer cut off at the top of the card.
- It is the same full art the room and Grand Alliance cards already show, placed by one shared framing rule for all of them.
- An operator whose full art cannot be placed, or fails to load, keeps the portrait picture.
- Before: these cards showed the portrait picture scaled to fill the card, so the framing differed from the animated card beside it.

### Art without an animated illustration is framed like the animated cards

- Every operator and outfit full art that has no animated illustration (440 of 538) now shows the figure in the card, like the animated cards' art the maintainer framed, instead of the bust close-up the earlier rule gave: median art height 3.36 → 2.40 card heights (the linked arts' 2.72), the head's top 0.03 from the card's top (the linked arts' 0.029), the face line 0.38 → 0.157 (the linked arts' 0.159).
- The room, Grand Alliance, solo room and result cards all read the same framing table, so they change together.
- The still rule now uses the illustrations' own zoom range (1–1.35) and the linked arts' placement [design values, user OK 2026-11-24: "follow the linked arts framing style", "the art should be raised higher"].

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 MB/s extra at the server (client display only; the art is a static file, no socket traffic); one-off file download: co-op 0 MB extra, solo 0.40 MB [src: public/assets/outfit/art2k median 402,830 bytes of 538 files] | 1.25 MB once for one art, 5 MB for four arts with the "best operator of the lineup" result setting [src: public/assets/outfit/art2k largest 1,247,986 bytes of 538 files] |
| Bandwidth out / in, per room (4 players) | 0 MB extra in a co-op room (the room's wide cards already loaded the same art file) [src: public/js/screens/room.js full / fullPlain] | 5 MB per player, 20 MB for 4 players, once [unverified] |
| Bandwidth out / in, 300 players | 0 MB/s at the server; 120 MB in one day if all 300 play solo for the first time (0.001 GB/day) [unverified] | 375 MB in a day, 0.4 GB/day, all 300 cold with the largest art; less behind the CDN cache [unverified] |
| Server CPU | 0 % of one core [src: no server code changed] | 0 % |
| Memory | 0 MB on the server; one decoded image per card in the browser, as the wide cards [src: public/js/ui/dynCards.js CardArt] | 0 MB |
| Disk | 0 MB/day [src: no server code changed] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- Measured on the shipped files (sizes); the 300-player day figures are estimated arithmetic, file size × players, not a traffic-meter run.
- Cap: no new traffic channel and no new data file. `data/card-art-framing.json` grows by 539 bytes raw (134,711 → 135,250; 23,919 → 23,364 gzip) [src: data/card-art-framing.json]; the tall framing is computed in the browser from its existing `face` values. The browser code grows once by 7.4 KB raw, 3.4 KB gzip (`shared/cardArtFraming.js` 3,478 bytes raw, 1,618 gzip, plus the lines added in `public/js` 3,954 raw, 1,771 gzip) [src: git diff HEAD, wc -c, gzip -c].
