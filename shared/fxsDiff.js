// shared/fxsDiff.js — (fork) the b.snap `fxs` rows on the wire: sent when they change, not in every frame.
//
// A battle snapshot lists every lasting effect a unit shows as `fxs` [[unit id, buff, src, look]] (sim snapshot.js
// fxStateView). Those rows rarely change between two frames, so the server (match/fields.js FieldRunner._emit) sends
// a field's watchers:
//   * a full frame — `fxs` with the whole set (`[]` when there is none) — as the field's first frame, every
//     FXS_FULL_EVERY-th frame after it (1 s at the normal 2× speed), and to a watcher that is not in step: one who just
//     started watching, or whose last frame was dropped (b.snap frames are skipped under backpressure, net.js);
//   * otherwise no `fxs`, and `fxd` [[added or changed rows], [removed [id, buff, src]]] only when the set changed.
// The client (public/js/net.js) keeps each field's last set with FxsResolver and hands every listener a frame with the
// whole `fxs` again (left out when the set is empty), so render/interp.js and the effects read it as before.
// A row is keyed by unit, buff and src; a new look of the same key (a librator's ramp stage) travels as a changed row.

/** A full `fxs` set every this many frames of a field (b.snap every 3 ticks at 30 Hz and 2× speed: 20 a second). */
export const FXS_FULL_EVERY = 20;

/** The fields a client keeps a set for (most recent first); older ones are forgotten, their next full frame rebuilds them. */
export const FXS_FIELDS_MAX = 16;

/** The key of a row [id, buff, src, look?]: one row per unit, buff and giver. */
export const fxsKey = (r) => `${r[0]}|${r[1]}|${r[2] ?? ''}`;

const lookOf = (r) => r[3] ?? null;

/** Server side: one per field. `frames(battle, msg)` turns a field's b.snap frame into the two forms its watchers get. */
export class FxsDiff {
  constructor() {
    this.battle = null;
    this.prev = null;          // Map key → row of the last frame sent
    this.n = 0;                // frames of this battle so far
    this.synced = new Set();   // watchers holding the last frame's set
  }

  /**
   * @param {object} battle the field's battle (a new one starts over with a full frame)
   * @param {object} msg the b.snap frame with its whole `fxs` (absent: none)
   * @returns {{ full: object, shared: object }} `full` for watchers out of step, `shared` for the ones in step (the
   *   same object as `full` on a full frame)
   */
  frames(battle, msg) {
    if (battle !== this.battle) { this.battle = battle; this.prev = null; this.n = 0; this.synced.clear(); }
    const rows = Array.isArray(msg.fxs) ? msg.fxs : [];
    const now = new Map();
    for (const r of rows) if (Array.isArray(r)) now.set(fxsKey(r), r);
    const full = msg.fxs === rows ? msg : { ...msg, fxs: rows };
    let shared = full;
    if (this.prev && this.n % FXS_FULL_EVERY !== 0) {
      const add = [];
      const del = [];
      for (const [k, r] of now) { const p = this.prev.get(k); if (!p || lookOf(p) !== lookOf(r)) add.push(r); }
      for (const [k, p] of this.prev) if (!now.has(k)) del.push([p[0], p[1], p[2] ?? null]);
      const { fxs: _all, ...rest } = msg;
      shared = add.length || del.length ? { ...rest, fxd: [add, del] } : rest;
    }
    this.prev = now;
    this.n++;
    return { full, shared };
  }

  /** After a send: `ok` keeps the watcher in step, a dropped or failed frame puts it out (its next frame is full). */
  sent(pid, ok) { if (ok) this.synced.add(pid); else this.synced.delete(pid); }

  /** Keep only the watchers that still watch this field (one who comes back starts with a full frame). */
  keep(watchers) { for (const pid of this.synced) if (!watchers.includes(pid)) this.synced.delete(pid); }
}

/** Client side: rebuilds the whole `fxs` of each field from full frames and `fxd` changes. */
export class FxsResolver {
  constructor() { this.fields = new Map(); }

  reset() { this.fields.clear(); }

  /**
   * @param {object} frame a b.snap frame from the server
   * @returns {object} the frame with the field's whole set as `fxs` (left out when empty) and no `fxd`
   */
  apply(frame) {
    if (!frame || typeof frame !== 'object') return frame;
    const id = frame.fieldId ?? '';
    let set = this.fields.get(id);
    const full = Array.isArray(frame.fxs);
    if (full) {
      set = new Map();
      for (const r of frame.fxs) if (Array.isArray(r)) set.set(fxsKey(r), r);
    } else {
      if (!set) set = new Map();
      if (Array.isArray(frame.fxd)) {
        const [add, del] = frame.fxd;
        if (Array.isArray(del)) for (const r of del) if (Array.isArray(r)) set.delete(fxsKey(r));
        if (Array.isArray(add)) for (const r of add) if (Array.isArray(r)) set.set(fxsKey(r), r);
      }
    }
    this.fields.delete(id);
    this.fields.set(id, set);
    while (this.fields.size > FXS_FIELDS_MAX) this.fields.delete(this.fields.keys().next().value);
    const { fxs: _all, fxd: _diff, ...rest } = frame;
    return set.size ? { ...rest, fxs: [...set.values()] } : rest;
  }
}
