// server/match/shadowMatch.js — (fork) the match restored from a snapshot (server/match/botWorld.js), which the real bot
// code plays against in the host's browser (docs/host-browser-bots.md Part B5). It borrows the real method bodies from
// the real containers and the real PlayerState, and turns everything that talks to the outside into a no-op. Match.js
// itself is not imported: it would bring the LLM gate's Node imports and the whole phase machine.
//
// Runs in Node and in a browser Worker: no Node APIs.

import { createRng } from '../sim/rng.js';
import { EffectDispatcher } from './effectsMeta.js';
import { PlayerState } from './PlayerState.js';
import { SharedPool, SharedItemPool } from './pool.js';
import { DiyStock, diyGameData } from './player/diy.js';
import { MatchInfra } from './match/infra.js';
import { MatchCombat } from './match/combat.js';
import { MatchSpDraft } from './match/spDraft.js';
import { MatchViews } from './match/views.js';
import { MatchPhases } from './match/phases.js';
import { decode } from './botWorld.js';

/** The real methods the bot and the prep handlers call, by container (a live trace; the strict shadow test reports others). */
const BORROWED = [
  [MatchInfra, ['alivePlayers', 'bossGroupOf', 'deployFieldOf', 'deployMapFor', 'dispatch', 'dispatchItem', 'nextUid',
    'teamMedicGranted', 'humans', 'bondInPool', 'bondLive', 'scaled', 'reportError', 'guard', 'soloUntimed']],
  [MatchCombat, ['newBattle', '_normalOpts', '_sanitizeSpawns']],
  [MatchSpDraft, ['autoPickPersonalChoice', 'pickPersonalChoice', 'addBounty', 'offerBountyChoice', 'rollItemId', 'rollPool', 'spCardAvailable']],
  [MatchViews, ['_bossMateOf', 'bossMateView', 'nextEnemiesFor', 'prepMapChars']],
  [MatchPhases, ['bandTaken']],
];

const noop = () => undefined;

/** What reaches the outside on the real match: nothing leaves the copy, and it never schedules anything. */
const SILENT = ['flush', 'markPublic', 'markPrivate', 'toast', 'tickerFor', 'sendTo', 'broadcast', 'onReadyChanged', 'maybeEndPrep',
  'emote', 'cancel', 'setDeadline', 'offersChanged', 'cancelSetupVote'];

export class ShadowMatch {
  /**
   * @param {any} world the snapshot
   * @param {{ data: any, gd: any, ds: any, registry: any, BattleClass: any, strategyOf: (id: string) => any, log?: any,
   *   misses?: Set<string> }} env the static side: this match's data and GameData, the registry and the strategies.
   *   `misses` (tests): every read of a field the snapshot did not bring is added to it.
   */
  constructor(world, env) {
    Object.assign(this, decode(world.match));
    this.world = world;
    this.opts = { soloUnlimited: world.soloUnlimited === true };
    this.data = env.data;
    this.gd = env.gd;
    this.ds = env.ds;
    this.registry = env.registry;
    this.BattleClass = env.BattleClass;
    this.log = env.log || {};
    this.stage = this.stageId ? this.gd.stage(this.stageId) : null;
    this.strategies = world.strategies;
    this.strategyOf = env.strategyOf;
    // the task's streams and uid block; the same state the server's task starts from
    this.rngShop = createRng(world.task.seeds.shop);
    this.rngMeta = createRng(world.task.seeds.meta);
    this.rngBots = createRng(world.task.seeds.bots);
    this.uidSeq = world.task.uidBase;
    // the executor's count of layouts: every `m.botRehearsal` gate in bot.js reads this and needs no edit
    this.botRehearsal = world.task.count;
    this.botRehearsalDelegate = false;
    this.simPool = null;
    this.externalAI = null;
    this.fields = [];
    this.test = false;
    this.ended = false;
    this.disposed = false;
    this.errors = [];
    this.errorCount = 0;
    this.sched = { now: () => world.now, instant: false, virtual: true };
    this.later = noop;
    this._privDirty = new Set();
    /** @type {any} */
    const self = env.misses ? reportingMisses(this, env.misses) : this;
    this.dispatcher = new EffectDispatcher(self, env.registry);
    self.players = new Map();
    self.order = world.seats.map((seat) => {
      const ps = restoreSeat(seat, self);
      self.players.set(ps.playerId, ps);
      return ps;
    });
    self.pool = new SharedPool(env.gd, { banned: self.bannedChess ?? [] });
    self.pool.entries = new Map(world.pool.map(([id, cap, left, tier]) => [id, { cap, left, tier }]));
    self.itemPool = new SharedItemPool(env.gd, () => self.order, self.roomScale ?? 1);
    self.itemPool.debt = new Map(world.itemDebt);
    return self;
  }

  botFor(ps) { return this.strategyOf(this.strategies[ps.seat]); }
}

for (const [part, names] of BORROWED) {
  for (const name of names) {
    const d = Object.getOwnPropertyDescriptor(part.prototype, name);
    if (!d) throw new Error(`shadowMatch: ${part.name}.${name} does not exist`);
    Object.defineProperty(ShadowMatch.prototype, name, d);
  }
}
for (const name of SILENT) ShadowMatch.prototype[name] = noop;

/** A real PlayerState holding the snapshot's fields. */
function restoreSeat(seat, m) {
  const ps = Object.create(PlayerState.prototype);
  Object.assign(ps, decode(seat, { stock: () => new DiyStock() }));
  ps.m = m;
  ps.gd = ps._diyRecords?.size ? diyGameData(m.gd, ps._diyRecords) : m.gd;
  ps._deployMap = null;
  return ps;
}

/** Fields the bot only ever creates itself, on first use: reading them before that is expected. */
const LAZY = /^(_bot|_advisor)/;

function reportingMisses(target, misses) {
  return new Proxy(target, {
    get(t, k, receiver) {
      if (typeof k === 'string' && !(k in t) && !LAZY.test(k)) misses.add(k);
      return Reflect.get(t, k, receiver);
    },
  });
}
