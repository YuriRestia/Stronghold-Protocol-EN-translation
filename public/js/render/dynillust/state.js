// render/dynillust/state.js — the official card's action state machine (UICharacterDynIllust), pure logic.
//
// Read from the CN client (GameAssembly.dll disassembled; notes: dev50-l2d-o1-o3-findings.md). The card drives an
// illustration instance (render/dynillust/instance.js) that answers `playingAction`, `playingTime` and
// `changeAction(action, loop)`; this file decides WHEN the special idle plays.
//
//   Appearing: the end-screen card activates with fastMode = true, allowMulti = true: alpha 1 at once (no fade) and
//   OnActivated → JUST_ACTIVATED; the instance itself is already looping Idle (its OnEnable). Start is never played on
//   appearing [src: official GameAssembly.dll card _RenderIllust 0x28E180B–0x28E1815; UICharacterIllustController.
//   _ActivateIllust 0x1452E03 → _ActivateIllustImmediately 0x1452771; DynIllustBase.OnEnable 0x1442335].
//   JUST_ACTIVATED: playing Interact → INTERACTION, Start → START, else IDLE; the special-idle timer resets, INIT when
//   the instance plays Idle (or nothing), RESUME after Special / Start / Interact [src: _UpdateState 0x1494FEB–
//   0x1495044; _OnActionJustActivated 0x14946D7].
//   IDLE: while the instance plays Idle and its idle track has run `target` s, it plays Special once (loop 1) and the
//   timer resets with RESUME [src: _UpdateState 0x1494EE6–0x1494FE6; _OnActionSpecialIdle 0x1494752].
//   INTERACTION / START: once the instance no longer plays that action, RESUME and back to IDLE [src: _UpdateState
//   0x1494E5D–0x1494ED6].
//   Timer: INIT (3, 9), RESUME (10, 24) [src: UICharacterDynIllust..ctor 0x14950FA–0x1495162]; the target is
//   UnityEngine.Random.Range(int min, int max) — an integer, max exclusive [src: ActionTimer.Create 0x148D57D;
//   RandomUtil.Range 0x6992E80]; it fires when playingTime >= target [src: ActionTimer.CheckIfAction 0x148D451].
//   _UniformSPActionTime (INIT only): an instance already playing Idle shifts the range by round-half-even(its idle
//   time so far), unless that reaches the range's max [src: _ResetSpecialIdleTimer 0x1494A2C; _UniformSPActionTime
//   0x1494C57–0x1494D84].
//   Tap: none — the card never calls SetConfig(onClick) [src: card _RenderIllust: no SetConfig call]; the config's
//   autoIdleSpecialDisable stays false (a struct default) so the special idle runs.

/** DynIllustAction [src: official dump.cs DynIllustAction]. */
export const ACTION = Object.freeze({ NONE: -1, IDLE: 0, SPECIAL_IDLE: 1, START: 2, INTERACTION: 3 });
/** UICharacterDynIllust.State [src: official dump.cs UICharacterDynIllust.State]. */
export const STATE = Object.freeze({ DEACTIVATED: 0, JUST_ACTIVATED: 1, IDLE: 2, INTERACTION: 3, START: 4 });
/** SP_IDLE_TIME [src: official GameAssembly.dll UICharacterDynIllust..ctor 0x14950FA (3, 9), 0x1495135 (10, 24)]. */
export const SP_IDLE_TIME = Object.freeze({ INIT: Object.freeze([3, 9]), RESUME: Object.freeze([10, 24]) });
/** (fork) Ticks a fired special idle waits at most for its turn (CardIllustState mayStartSpecial): two frames. */
export const SPECIAL_WAIT_MAX = 2;

/** UnityEngine.Random.Range(int min, int max): an integer in [min, max) (min when the range is empty). */
export function rangeInt(min, max, rng = Math.random) {
  if (min > max) { const t = min; min = max; max = t; }   // RandomUtil.Range swaps [src: 0x6992E85]
  if (max <= min) return min;
  return min + Math.min(max - min - 1, Math.floor(rng() * (max - min)));
}

/** System.Math.Round(double): half to even [src: _UniformSPActionTime 0x1494CDA–0x1494D4B]. */
export function roundHalfEven(v) {
  const f = Math.floor(v), d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** _UniformSPActionTime: the INIT range seen from an instance that may already be playing Idle. */
export function uniformSPActionTime(range, inst) {
  if (!inst || inst.playingAction !== ACTION.IDLE) return range;
  const n = roundHalfEven(Number(inst.playingTime) || 0);
  if (n >= range[1]) return range;
  return [range[0] + n, range[1] + n];
}

export class CardIllustState {
  /**
   * @param {{ rng?: () => number, autoIdleSpecialDisable?: boolean, onAction?: (a: number) => void, mayStartSpecial?: () => boolean }} [o]
   * `onAction(action)`: told when the card itself starts an action (review pages log it).
   * `mayStartSpecial()`: false when another card of the page started its special idle this frame (renderer.js
   * Stage._specialTurn); the timer stays fired and the special idle starts at the next tick, at most SPECIAL_WAIT_MAX
   * ticks late. The official timer draws whole seconds (rangeInt), so cards that appeared together often fire in the
   * same frame, and each start (Spine's mix, the action particles switched on) is one card's heaviest frame: spread,
   * they cost a frame each (not an official rule: a shift of at most two frames, about 33 ms at 60 Hz).
   */
  constructor(o = {}) {
    this.rng = o.rng || Math.random;
    this.autoIdleSpecialDisable = !!o.autoIdleSpecialDisable;
    this.onAction = o.onAction || null;
    this.mayStartSpecial = typeof o.mayStartSpecial === 'function' ? o.mayStartSpecial : () => true;
    this.specialWait = 0;   // ticks the fired special idle has waited for its turn (mayStartSpecial)
    this.state = STATE.DEACTIVATED;
    this.timer = { has: false, min: 0, max: 0, target: 0 };
  }

  /** OnActivated (slot 23) [src: UICharacterDynIllust.OnActivated 0x1492C72]. */
  activate() { this.state = STATE.JUST_ACTIVATED; }

  /** OnDeactivated: the card stops driving the instance. */
  deactivate() { this.state = STATE.DEACTIVATED; }

  /** _ResetSpecialIdleTimer(type) [src: 0x14948B0]. */
  resetTimer(kind, inst) {
    let r = kind === 'INIT' ? SP_IDLE_TIME.INIT : SP_IDLE_TIME.RESUME;
    if (kind === 'INIT') r = uniformSPActionTime(r, inst);
    this.timer = { has: true, min: r[0], max: r[1], target: rangeInt(r[0], r[1], this.rng) };
  }

  /** ActionTimer.CheckIfAction(seconds) [src: 0x148D44C–0x148D45C]. */
  timerFires(seconds) { return this.timer.has && seconds >= this.timer.target; }

  /** _UpdateState, once per tick (OnTick) [src: 0x1494DD0]. `inst` null or not started: nothing (_EnsureViewInst). */
  tick(inst) {
    if (!inst || !inst.started) return;
    const s = this.state, a = inst.playingAction;
    if (s === STATE.DEACTIVATED) return;
    if (s === STATE.JUST_ACTIVATED) {
      const next = a === ACTION.INTERACTION ? STATE.INTERACTION : a === ACTION.START ? STATE.START : STATE.IDLE;
      // _OnActionJustActivated(cur): RESUME for Special / Start / Interact (cur − 1 <= 2 unsigned), else INIT
      this.resetTimer(a >= ACTION.SPECIAL_IDLE && a <= ACTION.INTERACTION ? 'RESUME' : 'INIT', inst);
      this.state = next;
      return;
    }
    if (s === STATE.IDLE) {
      if (this.autoIdleSpecialDisable || a !== ACTION.IDLE) return;
      if (!this.timerFires(inst.playingTime)) return;
      if (this.specialWait < SPECIAL_WAIT_MAX && !this.mayStartSpecial()) { this.specialWait++; return; }
      this.specialWait = 0;
      inst.changeAction(ACTION.SPECIAL_IDLE, 1);
      if (this.onAction) this.onAction(ACTION.SPECIAL_IDLE);
      this.resetTimer('RESUME', inst);
      return;
    }
    if (s === STATE.INTERACTION || s === STATE.START) {
      const own = s === STATE.INTERACTION ? ACTION.INTERACTION : ACTION.START;
      if (a === own) return;
      this.resetTimer('RESUME', inst);
      this.state = STATE.IDLE;
    }
  }

  /** PlayIdle: ChangeAction(IDLE, −1), then JUST_ACTIVATED [src: UICharacterDynIllust.PlayIdle 0x1493064–0x1493090]. */
  playIdle(inst) {
    if (!inst || !inst.started) return;
    inst.changeAction(ACTION.IDLE, -1);
    this.state = STATE.JUST_ACTIVATED;
  }

  /**
   * PlaySpecial: in state IDLE while the instance plays Idle, ChangeAction(SPECIAL_IDLE, 1) and RESUME (unless the
   * config disables the special idle) [src: UICharacterDynIllust.PlaySpecial 0x14932A7–0x1493349]. Review pages only:
   * the card never calls it.
   */
  playSpecial(inst) {
    if (!inst || !inst.started) return;
    if (this.state !== STATE.IDLE || inst.playingAction !== ACTION.IDLE) return;
    inst.changeAction(ACTION.SPECIAL_IDLE, 1);
    if (this.onAction) this.onAction(ACTION.SPECIAL_IDLE);
    if (!this.autoIdleSpecialDisable) this.resetTimer('RESUME', inst);
  }

  /**
   * PlayStart: only in state IDLE or INTERACTION: ChangeAction(START, 1), state START [src: UICharacterDynIllust.
   * PlayStart 0x14933D1–0x1493470]. Review pages only (the end-screen card never plays Start).
   */
  playStart(inst) {
    if (!inst || !inst.started) return;
    if (this.state !== STATE.IDLE && this.state !== STATE.INTERACTION) return;
    inst.changeAction(ACTION.START, 1);
    if (this.onAction) this.onAction(ACTION.START);
    this.state = STATE.START;
  }
}
