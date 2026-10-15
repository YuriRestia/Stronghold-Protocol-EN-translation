// server/sim/fever.js — the Fever gauge of Ave Mujica (env_033_fever; gamedata_const feverGameData { feverNeed 450,
// feverDuration 20 }, term ba.fever "Fever累计至450点时，任意一位Ave Mujica成员手动触发技能后，在场所有Ave Mujica成员20秒内会持续释放
// 当前技能"). One gauge per battle field (the official one is per map, shared by every member; the owner's decision
// 2026-10-15: a field here, so every 丰川祥子 on it shares it) — created by the first member's kit (`feverOf`).
// - Gains: AddFeverBySourceIfNotFull (oblvns_t_2[fever] ON_OUTPUT_DAMAGE): + n while not full; it fills during Fever too.
// - Start: TryActiveFeverIfFull on a manual cast of a member (the kit decides what counts as one): the whole gauge is
//   spent (arknights.wiki.gg Fever "will consume the entire Fever meter"), Fever runs `duration` s.
// - During Fever the kits keep their members casting (their own rules); `onStart` / `onEnd` listeners run for each.
// - A new battle starts at 0 (every round is a new battle, owner 2026-10-15); 联防 carries the gauge of the helpers' own
//   combats — the higher one with two helpers [ASSUMED, owner 2026-10-15] — through PlayerBattleInput `feverCarry`
//   (BattleResult perPlayer `fever`, match/unite.js).
// Display: snapshot `fever` (battle/events.js) — every member shows the field's gauge.

/** gamedata_const feverGameData (zh_CN, 2026-10-15). */
export const FEVER_NEED = 450;
export const FEVER_DURATION = 20;

export class FeverGauge {
  constructor(battle, { need = FEVER_NEED, duration = FEVER_DURATION } = {}) {
    this.battle = battle;
    this.need = need;
    this.duration = duration;
    this.value = 0;
    this.activeUntil = -Infinity;
    this.starter = null;      // the member whose manual cast started the running Fever
    this.members = new Set(); // units that show the gauge (Ave Mujica members' kits register)
    this._listeners = [];
    this._endTimer = null;
    let carry = 0;
    for (const ps of battle.players || []) if (Number.isFinite(ps.feverCarry) && ps.feverCarry > carry) carry = ps.feverCarry;
    if (carry > 0) this.value = Math.min(need, carry);
  }

  get full() { return this.value >= this.need - 1e-9; }
  get active() { return this.battle.time < this.activeUntil - 1e-9; }
  get timeLeft() { return Math.max(0, this.activeUntil - this.battle.time); }

  /** AddFeverBySourceIfNotFull: + n, capped at the need. */
  add(n) {
    if (!(n > 0) || this.full) return;
    this.value = Math.min(this.need, this.value + n);
  }

  /** { onStart(gauge), onEnd(gauge) } — kits react to the state (all members on the field). */
  listen(l, owner) {
    this._listeners.push({ l, owner });
  }

  /**
   * TryActiveFeverIfFull: a member's manual cast while the gauge is full and no Fever runs — the gauge is spent and
   * Fever starts. Returns true when it started.
   */
  tryStart(member) {
    if (!this.full || this.active) return false;
    const b = this.battle;
    this.value = 0;
    this.starter = member;
    this.activeUntil = b.time + this.duration;
    b._ev(['fx', 'fever', 0, 0, { on: 1, id: member ? member.id : null, dur: this.duration }]);
    for (const { l, owner } of this._listeners.slice()) if (l.onStart) b._safe(() => l.onStart(this, member), 'fever.onStart', owner);
    this._endTimer = b.after(this.duration, () => this._end(), {});
    return true;
  }

  _end() {
    const b = this.battle;
    this._endTimer = null;
    this.activeUntil = -Infinity;
    const starter = this.starter;
    this.starter = null;
    b._ev(['fx', 'fever', 0, 0, { on: 0 }]);
    for (const { l, owner } of this._listeners.slice()) if (l.onEnd) b._safe(() => l.onEnd(this, starter), 'fever.onEnd', owner);
  }

  /** snapshot rows: [[memberId, fill, active]] for the members on the field. */
  view() {
    const out = [];
    const fill = Math.round((this.value / this.need) * 1000) / 1000;
    const on = this.active ? 1 : 0;
    for (const u of this.members) if (u.alive && u.deployed && !u.hidden) out.push([u.id, fill, on]);
    return out;
  }
}

/** The field's gauge, created on first use (a kit's install). */
export function feverOf(battle) {
  if (!battle.fever) battle.fever = new FeverGauge(battle);
  return battle.fever;
}
