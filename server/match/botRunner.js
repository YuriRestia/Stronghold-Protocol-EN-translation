// server/match/botRunner.js — (fork) one bot seat's prep played on the restored match (docs/host-browser-bots.md Part B2):
// the real strategy runs against the copy, and every game action it takes there is recorded as the `g.*` intent a human
// would send. Used by the host's Worker and, in Node, by the parity test's fake host; it has no idea which one runs it.
//
//   const run = createBotRun(world, env);
//   run.plan()          → { moves }: economy and the default layout (`batch: 'plan'`)
//   run.rehearse(ms)    → true when finished, false when `ms` ran out (the best layout so far stands)
//   run.finish()        → { moves, memo }: the rehearsed layout, temp and Ready (`batch: 'final'`)
//   run.pick()          → { moves, memo }: a band or card pick (`world.pick`), one move in one `final` batch
//
// Runs in Node and in a browser Worker: no Node APIs.

import { encodeMemo, seatHash } from './botWorld.js';
import { ShadowMatch } from './shadowMatch.js';
import { chooseBotBand } from './match/phases.js';

/** Handlers whose outcome the bot can react to: their moves carry the seat hash, which the server compares. */
const REVEALING = new Set(['g.refresh', 'g.buy', 'g.reward', 'g.equip', 'g.art', 'g.levelUp', 'g.choice']);

/** Seat handler → the intent it answers. A handler a bot starts from another handler is not a move of its own. */
const SEAT_HANDLERS = {
  buy: (slot) => ({ t: 'g.buy', slot }),
  refresh: () => ({ t: 'g.refresh' }),
  freeze: () => ({ t: 'g.freeze' }),
  levelUp: () => ({ t: 'g.levelUp' }),
  sell: (uid) => ({ t: 'g.sell', uid }),
  move: (uid, to, dir) => ({ t: 'g.move', uid, to, ...(dir !== undefined ? { dir } : {}) }),
  equip: (itemUid, targetUid, replaceUid) => ({ t: 'g.equip', itemUid, targetUid, ...(replaceUid != null ? { replaceUid } : {}) }),
  useArt: (itemUid, row, col, dir) => ({ t: 'g.art', itemUid, row, col, ...(dir !== undefined ? { dir } : {}) }),
  destroy: (uid) => ({ t: 'g.destroy', uid }),
  unequip: (itemUid) => ({ t: 'g.unequip', itemUid }),
  pickReward: (idx) => ({ t: 'g.reward', idx }),
  setReady: (on) => ({ t: 'g.ready', ready: !!on }),
  resolveTemp: () => ({ t: 'bot.resolveTemp' }),
};

/**
 * @param {any} world server/match/botWorld.js buildWorld
 * @param {any} env ShadowMatch's static side; `hashEvery` (tests) puts the seat hash on every move
 */
export function createBotRun(world, env) {
  const m = new ShadowMatch(world, env);
  const ps = m.order.find((p) => p.seat === world.seat);
  if (!ps) throw new Error(`no seat ${world.seat} in the snapshot`);
  const bot = m.botFor(ps);
  let moves = [];
  let depth = 0;

  /** Run one handler; at depth 0 a call that succeeded is a move. A refused call changed nothing and is not sent. */
  const recording = (fn, toMove, self) => (...args) => {
    depth++;
    let res;
    try { res = fn.apply(self, args); } finally { depth--; }
    if (depth === 0 && !(res && res.error)) {
      const move = toMove(...args);
      if (env.hashEvery || REVEALING.has(move.t)) move.x = seatHash(ps);
      moves.push(move);
    }
    return res;
  };
  for (const [name, toMove] of Object.entries(SEAT_HANDLERS)) ps[name] = recording(ps[name], toMove, ps);
  m.pickPersonalChoice = (() => {
    const real = m.pickPersonalChoice;
    return (who, idx, choiceId) => (who === ps
      ? recording(() => real.call(m, who, idx, choiceId), () => ({ t: 'g.choice', idx, choiceId }), m)()
      : real.call(m, who, idx, choiceId));
  })();

  const take = () => { const out = moves; moves = []; return out; };
  /** Step a generator to its end. */
  const drive = (gen) => { let r; do { r = gen.next(); } while (!r.done); return r.value; };

  let job = null;
  return {
    m,
    ps,
    plan() {
      job = drive(bot.prepBegin(m, ps, { delegate: false, pooled: false })) || null;
      return { moves: take() };
    },
    rehearse(budgetMs = Infinity) {
      if (!job || job.done) return true;
      return job.run(budgetMs);
    },
    pick() {
      let move;
      if (world.pick === 'band') move = { t: 'g.band', bandId: chooseBotBand(m, ps) };
      else {
        const avail = m.sp.cards.filter((c) => m.spCardAvailable(c)).map((c) => c.idx);
        move = { t: 'g.choice', idx: bot.pickCard(m, ps, m.sp.cards, avail) };
      }
      return { moves: [move], memo: encodeMemo(ps) };
    },
    finish() {
      // out of budget: `job.best` holds the best layout so far (bot.js createRehearsalJob), which stands as the result
      if (job && !job.done) job.done = true;
      drive(bot.prepEnd(m, ps, job));
      return { moves: take(), memo: encodeMemo(ps) };
    },
  };
}
