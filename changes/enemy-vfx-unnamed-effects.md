## 2026-11-13

### Enemy effects: Originium Slug blasts, the Armor Piercer's impact, prop idle effects and more

- Infused Originium Slugs and Infused Glacial Originium Slugs now explode with the game's own blast when they fall,
  instead of a generic flash.
- When OpFor: Armor's Armor Piercer lands, its 3×3 impact area now shows the game's own range effect for as long as
  it lasts.
- The 14 prop enemies (Wooden Seal through Iron Lampstand) now show their own idle effect for as long as they stand.
- Operators bled by a Rotchaser or a Rampaging Rotchaser now show the game's bleeding effect while it lasts.
- 'Sand Voyager' now shows the game's effect for how many passengers it carries (one to four), switching as they
  board and leave.
- 'Unicycle Toy' now throws its second harpoon with the game's own second harpoon effect. Before, both harpoons looked
  the same.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | under 0.0001 / 0 MB/s (under 0.01 / 0 GB/day): these enemies come in a few rounds only | 0.0007 / 0 MB/s while 10 props, 8 bleeding operators and a full Sand Voyager are on the field at once |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | under 0.0008 / 0 MB/s | 0.006 / 0 MB/s |
| Bandwidth out / in, 300 players | under 0.03 / 0 MB/s (under 2.6 / 0 GB/day) | 0.21 / 0 MB/s (18 / 0 GB/day, if every player fought all of them at once all day) |
| Server CPU | 0 % of one core | under 0.01 % of one core |
| Memory | 0 MB | under 0.01 MB (one state probe per prop and per Sand Voyager) |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round (nothing runs in the battle's ticks) |

- Cap: one effect row per prop (28 B), per bleeding operator (43 B) and per Sand Voyager (33 B). They go out when they
  change, plus a full set once a second (shared/fxsDiff.js).
- Estimated from the code and the row sizes, not measured: the sim change is two snapshot-time probes
  (`server/sim/content/enemies/archetypes.js`, `passengers.js`) and a display-only key on the bleed buff; no event, no
  state the battle reads. The slug blasts, the Armor Piercer and the second harpoon are client effect wiring only.
