// render/dynillust/progress.js — (fork) the stage's download progress: a fetch that counts the bytes as they arrive and
// how many downloads are still open, so the room can tell a slow download (bytes keep coming) from a stalled one (one is
// open and nothing came for a while; ui/dynCards.js DOWNLOAD_STALL_MS). Building an illustration after its files are in
// is no download, so a slow computer never reads as a stall.
//
//   const net = newNet();  const f = countingFetch(fetch, net);   net: { open, received, moves }
//
// `open` counts the responses whose body is still being read; `moves` goes up with every response's headers and every
// chunk of a body. A response that is not ok, or one whose body cannot be streamed here, is not counted as open (the
// loaders throw on it unread, or read it whole): it can never hold a stall check open.

/** A stage's download counters. */
export function newNet() { return { open: 0, received: 0, moves: 0 }; }

/**
 * `base` wrapped so every response's body is counted into `net` as the reader takes it.
 * @param {(url: any, o?: any) => Promise<Response>} base
 * @param {{ open: number, received: number, moves: number }} net
 */
export function countingFetch(base, net) {
  return async (url, o) => {
    net.open++;
    let closed = false;
    const close = () => { if (!closed) { closed = true; net.open--; } };
    let res;
    try { res = await base(url, o); } catch (err) { close(); throw err; }
    net.moves++;
    if (!res || !res.ok || !res.body || typeof res.body.getReader !== 'function' || typeof ReadableStream !== 'function'
      || typeof Response !== 'function') { close(); return res; }
    const reader = res.body.getReader();
    const body = new ReadableStream({
      async pull(c) {
        try {
          const { done, value } = await reader.read();
          if (done) { close(); c.close(); return; }
          net.received += value?.byteLength || 0;
          net.moves++;
          c.enqueue(value);
        } catch (err) { close(); c.error(err); }
      },
      cancel(reason) { close(); return reader.cancel(reason); },
    });
    return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
  };
}
