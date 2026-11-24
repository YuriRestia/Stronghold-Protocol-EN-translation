## 2026-11-24

### Still outfit and Elite 2 art uses the official framing on the solo room and result cards

- The solo room's card and the result screen's team cards now show an operator's full outfit or Elite 2 art where the official client places it on its own result card, instead of the small portrait picture cut by the card [src: docs/design/client.md §10].
- The 98 arts that belong to an animated illustration sit where their animation draws.
- An operator whose full art cannot be placed, or fails to load, keeps the portrait picture.
- Before: these cards showed the portrait picture scaled to fill the card, so the framing differed from the animated card beside it.

### Art without an animated illustration shows more of the figure on the room cards

- On the room and Grand Alliance cards, every full art that has no animated illustration (440 of 538) now shows more of the figure and sits higher, like the art of the animated cards. Tall horns or a halo can pass the card's top edge.
- The 98 arts that belong to an animated illustration stay where they were on those cards.
- Cards that missed the operator's face now show it, such as Hoederer's, Leonhardt's and Hoshiguma's Elite 2 art.
- Before: these arts were zoomed in to a bust close-up, and a few missed the face.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 MB/s of socket traffic; static files downloaded once, then cached: solo 0.19 MB (one art) [src: data/assets.json outfits art, median 193,688 bytes of 538 files] and 7 KB more of the framing table | 0.39 MB for one art; 3.2 MB for eight new arts on a Grand Alliance result [src: data/assets.json outfits art, largest 394,498 bytes of 538 files] |
| Bandwidth out / in, per room (4 players) | at most 4 × 0.19 MB per player, less for art the room cards already loaded [unverified]; an AI seat's art and the "best operator of the lineup" setting are new downloads [unverified] | 4 players × 4 arts × 0.39 MB = 6.3 MB, once [unverified] |
| Bandwidth out / in, 300 players | 60 MB (0.06 GB/day) if all 300 load one new art and the table in a day [unverified] | 950 MB (0.95 GB/day) if all 300 load eight of the largest art and the table in a day, 0.95 MB/s if within 1000 s [unverified] |
| Server CPU | 0 % of one core [src: no server code changed] | 0 % |
| Memory | 0 MB on the server; one decoded image per card in the browser, as the wide cards [src: public/js/ui/dynCards.js CardArt] | 0 MB |
| Disk | 0 MB/day [src: no server code changed] | 0 MB/day |
| Bot budget | 0 ms/round [src: no bot code changed] | 0 ms/round |

- File sizes measured on the files `data/assets.json` lists today (`outfit/art`); the room and 300-player figures are estimated arithmetic, not a traffic-meter run, and do not count the CDN cache. With the 2048-px set (`outfit/art2k`) listed instead, the art would be about 2 to 3 times larger [src: public/assets/outfit/art2k, median 402,830 and largest 1,247,986 bytes].
- Cap: one static file per art, cached by the browser; at most eight cards on a screen. `data/card-art-framing.json` grows from 134,711 to 167,248 bytes raw, 23,919 to 31,130 gzip [src: data/card-art-framing.json]. The browser code grows once by under 4 KB raw [src: git diff dev-0.2, public/js, public/css].
