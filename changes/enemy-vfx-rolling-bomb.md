## 2026-11-13

### OpFor: Armor's rolling bombs show their official effects

- OpFor: Armor: each Armor Piercer it launches now rolls with the official rolling effect while it travels, and bursts
  with the official explosion when it reaches its tile or is shot down. Before: the bomb travelled with no effect of
  its own.

Kind: player

Server cost:

| Measure | Typical | Worst case |
|---|---|---|
| Bandwidth out / in, per player | 0 / 0 MB/s (0 / 0 GB/day) | 0 / 0 MB/s |
| Bandwidth out / in, per room (4 players; 8 in Grand Alliance) | 0 / 0 MB/s | 0 / 0 MB/s |
| Bandwidth out / in, 300 players | 0 / 0 MB/s (0 / 0 GB/day) | 0 / 0 MB/s (0 / 0 GB/day) |
| Server CPU | 0 % of one core | 0 % of one core |
| Memory | 0 MB | 0 MB |
| Disk | 0 MB/day | 0 MB/day |
| Bot budget | 0 ms/round | 0 ms/round |

- Cap: client only. The server already sends the launch effect and the bomb's arrival and removal; nothing new is
  sent.
- Estimated from the code, not measured (`public/js/render/vfx/skillfx.js`).
