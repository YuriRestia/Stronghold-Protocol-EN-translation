## 2026-11-11

### Every change states its server cost

- Behind the scenes: every changelog fragment now ends with a `Server cost:` block, either `none` or the numbers
  (typical and worst case per player, per room and for 300 players: bandwidth in MB/s and GB/day, server CPU, memory,
  disk, the host bots' time per round, and the cap that bounds it). `npm run changelog -- --check` refuses a fragment
  without one (format in `changes/README.md`).
- `npm run server-cost` checks a branch: when it touches server code, the protocol, the host-browser bot budget or adds
  network sends, repeating timers or file writes, one of its fragments must have the numbers. The lead's merge checks
  run it.
- A dev-only traffic meter: a dev server started with `SP_TRAFFIC_METER=1` counts WebSocket messages and bytes per
  message type, per room and per second; `npm run traffic-report` prints a test match's traffic in MB/s and GB/day,
  per player and for 300 players. It is never on in production or in a packaged release.
