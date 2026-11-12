## 2026-11-12

### The link between the servers survives a broken direct route

- When a server's direct posts to the main server's socket host (`SP_REGION_SOCKETS`) fail 3 times in a row, the
  link posts through the main server's public site address instead. Every 5 minutes it tries the direct host again and
  goes back to it once it answers. Each switch is logged once.
- Before: a broken direct route left the link down until the route came back by itself, and cross-server matchmaking,
  counts and the room browser stayed local all that time.
- Only the link between the servers switches. Players' sockets and ping tests keep the direct host; nothing they see
  changes.
- While every post fails, the posts slow down from every 2 s to every 30 s, and go back to every 2 s once one gets
  through. `/healthz` shows `peer.fallback: true` while the link uses the fallback.
