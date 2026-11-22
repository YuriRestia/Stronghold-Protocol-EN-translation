// render/dynillust/instance.js — one official dynamic illustration instance (DynIllust / DynIllustBase), pure logic
// over two small adapters: the skeleton (render/dynillust/skeleton.js wraps a pixi-spine Spine) and the effect layer
// (the illustration's effect prefab: which nodes are on, FxDelay, Animator triggers). Read from the CN client
// (GameAssembly.dll disassembled; notes: dev50-l2d-o1-o3-findings.md):
//
//   Animation names Idle / Special / Start / Interact [src: official dump.cs DynIllustActNames;
//   DynIllustBase.GetNormalAnimationName 0x1441B2F–0x1441BC5].
//   ChangeAction(a, loop): track 0 SetAnimation(name, loop <= 0); a missing animation keeps the previous action
//   [src: DynIllust.ChangeAction 0x1430F1C–0x1430F44; _ApplyAnimation 0x14317C8, 0x1431869–0x143188A].
//   playEnd = loop <= 0 ? +inf : Time.time + duration · loop; Update returns to looping Idle once Time.time passes it
//   [src: _ApplyAnimation 0x1431904–0x1431942; DynIllustBase.Update 0x1442987–0x1442A00].
//   _animTimeFixed: LateUpdate also returns to Idle once a non-looping track-0 entry's trackTime reaches its duration
//   [src: DynIllustBase.LateUpdate 0x1441F77–0x1442023].
//   Action particles: on every apply, each whose action is the new one goes active (an active one keeps playing);
//   every other — with _fixFxDelay its FxDelay forced to its end first — goes inactive [src: _ApplyAnimation
//   0x1431962–0x1431A4D]. Awake starts them all inactive [src: DynIllustBase.Awake 0x14413BE].
//   Animator triggers on every apply: IDLE OnIdle, SPECIAL_IDLE OnSpecial, START OnStart, INTERACTION OnInteract
//   [src: DynIllustBase..cctor 0x1442E42–0x1442E9D; _ApplyAnimation 0x1431A96–0x1431BDB].
//   Extra tracks: max(2, trackIndex), a name that is none of the four, looping, re-set when another animation plays
//   there [src: DynIllustBase.EnsureExtraTrackAnimations 0x144173F; TryGetValidExtraTrackAnimation 0x144284D].
//   OnEnable: not already Idle → ChangeAction(IDLE, −1) [src: DynIllustBase.OnEnable 0x1442335–0x1442394]; the first
//   enable always plays Idle: the constructor sets the playing action to NONE [src: DynIllustBase..ctor 0x1442FC0–
//   0x144300F, loop −1 at 0x1443065].
//   90 s re-sync: a skeleton whose animations are only Idle (+ Start) restarts its Idle on an Idle loop's completion
//   once Idle has run 90 s without a break [src: DynIllust._OnSpineAnimationComplete 0x1431D4F–0x1431EDE;
//   IsIdleResyncEligible 0x1431360–0x1431396; IDLE_COMPLETE_SYNC_THRESHOLD_SECONDS 90 at 0x70AEC70].
//   The continuous-idle clock starts when a looping Idle is applied (kept while it runs), −1 otherwise and on enable /
//   disable [src: _RefreshIdleContinuousTimerOnActionApply 0x1431F5F–0x1431F80; OnEnable 0x143151D; OnDisable
//   0x143145E].

import { ACTION } from './state.js';

export const ACTION_NAMES = Object.freeze({ [ACTION.IDLE]: 'Idle', [ACTION.SPECIAL_IDLE]: 'Special', [ACTION.START]: 'Start', [ACTION.INTERACTION]: 'Interact' });
export const ANIMATOR_TRIGGERS = Object.freeze({ [ACTION.IDLE]: 'OnIdle', [ACTION.SPECIAL_IDLE]: 'OnSpecial', [ACTION.START]: 'OnStart', [ACTION.INTERACTION]: 'OnInteract' });
/** IDLE_COMPLETE_SYNC_THRESHOLD_SECONDS [src: official dump.cs DynIllust; GameAssembly.dll 0x70AEC70]. */
export const IDLE_RESYNC_S = 90;
/** EXTRA_TRACK_START_INDEX [src: official dump.cs DynIllustBase]. */
export const EXTRA_TRACK_START = 2;
const RESERVED = new Set(Object.values(ACTION_NAMES));

/** IsIdleResyncEligible: has Idle, and every animation is Idle or Start (ordinal compare). */
export function idleResyncEligible(names) {
  let idle = false;
  for (const n of names || []) {
    if (n === 'Idle') idle = true;
    else if (n !== 'Start') return false;
  }
  return idle;
}

export class DynIllustInstance {
  /**
   * @param {{
   *   skel: { animationNames: string[], findAnimation(name: string): ({ duration: number }|null),
   *           setAnimation(track: number, name: string, loop: boolean): any, current(track: number): any,
   *           onComplete(cb: (entry: any) => void): void },
   *   fx?: { setActive(node: number, on: boolean): void, forceDelayEnd?(node: number): void,
   *          trigger?(name: string): void } | null,
   *   data?: { fixFxDelay?: boolean, animTimeFixed?: boolean, extraTracks?: { track: number, name: string }[],
   *            particles?: { action: number, node: number }[] },
   *   now: () => number,
   * }} o `now`: the illustration clock in seconds (Unity's Time.time)
   */
  constructor(o) {
    this.skel = o.skel;
    this.fx = o.fx || null;
    this.now = o.now;
    const d = o.data || {};
    // _fixFxDelay defaults to true in the class, the prefab's own value wins [src: DynIllustBase..ctor 0x1442F4E]
    this.fixFxDelay = d.fixFxDelay ?? true;
    this.animTimeFixed = !!d.animTimeFixed;
    this.extraTracks = Array.isArray(d.extraTracks) ? d.extraTracks : [];
    this.particles = Array.isArray(d.particles) ? d.particles.filter((p) => p && Number.isInteger(p.node)) : [];
    this.action = ACTION.NONE;
    this.playingAction = ACTION.NONE;
    this.loop = -1;
    this.playEnd = Infinity;
    this.idleStart = -1;
    this.trackEntry = null;
    this.playingAnim = null;
    this.started = false;
    this.enabled = false;
    this.resyncEligible = idleResyncEligible(this.skel.animationNames);
    this._onComplete = (entry) => this._complete(entry);
    this.skel.onComplete(this._onComplete);
    // Awake: every action particle starts inactive
    for (const p of this.particles) this.fx?.setActive(p.node, false);
  }

  /** OnEnable, then Start on the first one (`started`, which the card's _EnsureViewInst waits for). */
  enable() {
    if (this.enabled) return;
    this.enabled = true;
    this.idleStart = -1;
    if (this.playingAction !== ACTION.IDLE) this.changeAction(ACTION.IDLE, -1);
    this._refreshIdle(this.playingAction, this.loop);
    this.started = true;
  }

  disable() {
    this.enabled = false;
    this.idleStart = -1;
  }

  /** ChangeAction(action, loop): loop <= 0 loops for ever, n plays n times then Idle. */
  changeAction(action, loop) {
    const prevA = this.action, prevL = this.loop;
    this.action = action;
    this.loop = loop;
    if (!this._apply()) { this.action = prevA; this.loop = prevL; return false; }
    return true;
  }

  _apply() {
    const name = ACTION_NAMES[this.action];
    if (!name) return false;
    const anim = this.skel.findAnimation(name);
    if (!anim) return false;
    this._refreshIdle(this.action, this.loop);
    this.playingAnim = anim;
    this.skel.setAnimation(0, name, this.loop <= 0);
    this._ensureExtraTracks();
    this.trackEntry = this.skel.current(0);
    this.playingAction = this.action;
    this.playEnd = this.loop <= 0 ? Infinity : this.now() + anim.duration * this.loop;
    for (const p of this.particles) {
      if (p.action === this.playingAction) this.fx?.setActive(p.node, true);
      else {
        if (this.fixFxDelay) this.fx?.forceDelayEnd?.(p.node);
        this.fx?.setActive(p.node, false);
      }
    }
    const trig = ANIMATOR_TRIGGERS[this.playingAction];
    if (trig) this.fx?.trigger?.(trig);
    return true;
  }

  _ensureExtraTracks() {
    for (const s of this.extraTracks) {
      const track = Math.max(EXTRA_TRACK_START, Number(s.track) | 0);
      const name = s.name;
      if (!name || RESERVED.has(name) || !this.skel.findAnimation(name)) continue;
      const cur = this.skel.current(track);
      if (cur && cur.animation && cur.animation.name === name) continue;
      this.skel.setAnimation(track, name, true);
    }
  }

  _refreshIdle(action, loop) {
    if (action === ACTION.IDLE && !(loop > 0)) { if (this.idleStart < 0) this.idleStart = this.now(); }
    else this.idleStart = -1;
  }

  /** DynIllustBase.Update. */
  update() {
    if (!this.enabled) return;
    if (this.now() >= this.playEnd) this.changeAction(ACTION.IDLE, -1);
  }

  /** DynIllustBase.LateUpdate (after the skeleton advanced). */
  lateUpdate() {
    if (!this.enabled || !this.animTimeFixed) return;
    const e = this.trackEntry;
    if (!e || e.loop || !e.animation) return;
    if (e.trackTime >= e.animation.duration) this.changeAction(ACTION.IDLE, -1);
  }

  _complete(entry) {
    if (!this.enabled || !entry || entry.trackIndex !== 0 || entry !== this.trackEntry) return;
    if (!this.resyncEligible || this.playingAction !== ACTION.IDLE || this.loop > 0) return;
    if (this.idleStart < 0 || this.now() - this.idleStart < IDLE_RESYNC_S) return;
    this.idleStart = -1;
    this.changeAction(ACTION.IDLE, -1);
  }

  /** playingTime: the track-0 entry's trackTime (0 before any animation) [src: DynIllust.get_playingTime 0x1432545]. */
  get playingTime() {
    if (!this.playingAnim) return 0;
    const e = this.skel.current(0);
    return e ? Number(e.trackTime) || 0 : 0;
  }

  /** playingActionDur: the playing animation's duration, −1 without one [src: DynIllust.get_playingActionDur 0x1432495]. */
  get playingActionDur() { return this.playingAnim ? this.playingAnim.duration : -1; }
}
