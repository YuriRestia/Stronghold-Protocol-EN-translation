// Challenges (GitHub #192): the lobby plate, the panel it opens and the Settings rows (fish-edition/untracked/challenge-system-draft.md).
// Everything is local: the panel is generated here from this browser's own finished matches (challenges/generate.js) and the state
// lives in localStorage (challenges/persist.js); nothing is sent anywhere and nothing expires. No badge, no sound, no timer.
//
// One shared state (module level) so the plate, the panel and the Settings rows always agree; every button is one pure action of
// challenges/state.js, run with the prior (challenges/prior.json, fetched once) and the history (read when the panel opens).

import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, confirmDialog } from './components.js';
import { t } from '../../../shared/i18n.js';
import { loadChallenges, saveChallenges, localHistory } from '../challenges/persist.js';
import { ensure, reroll, easier, harder, toggleFreeze, setEnabled, setShowPopup, reset, complete } from '../challenges/state.js';
import { factsFromClientRecord } from '../challenges/facts.js';
import { setChallengePts } from './stats.js';
import { toast } from './toasts.js';
import { describeCard } from '../challenges/texts.js';
import { ability } from '../challenges/model.js';
import { useLang } from './lang.js';
import { data, loadData } from '../data.js';

let state = null;
let prior = null;
let history = null;
const subs = new Set();
const get = () => (state ??= loadChallenges());
function put(next) { state = next; saveChallenges(next); subs.forEach((f) => f()); }
async function loadPrior() {
  if (!prior) { const r = await fetch(new URL('../challenges/prior.json', import.meta.url)); prior = await r.json(); }
  // the custom operators this game version lets a player pick (backups.diy.ownedPool), for the "field one of …" condition
  try { await loadData('backups'); prior = { ...prior, customPool: data.get('backups')?.diy?.ownedPool ?? [] }; } catch { /* no pool: no such condition */ }
  return prior;
}
/** The local history, read once per opening of the panel (a match played meanwhile is read the next time it opens). */
const freshHistory = () => (history = localHistory());

/** Runs one action of state.js with the prior and the history. */
async function act(fn) {
  const p = await loadPrior();
  put(fn(get(), history ?? freshHistory(), p));
}
export const challengeActions = {
  /** Fills a panel that has none yet (the first time it opens, or after a reset). */
  open: () => { freshHistory(); return act(ensure); },
  reroll: () => act(reroll), easier: () => act(easier), harder: () => act(harder),
  freeze: (i) => put(toggleFreeze(get(), i)),
  enable: (on) => { put(setEnabled(get(), on)); },
  popup: (on) => put(setShowPopup(get(), on)),
  reset: () => { history = null; put(reset(((Date.now() / 1000) | 0) || 1)); },
};
/**
 * A match has just been recorded (main.js, right after ui/stats.js recordResult stored it): checks the open cards against it, writes
 * the points into that record (so the LV recomputed from the records counts them), spends the completed cards and draws their
 * replacements, and, when the pop-up is on, says what was done. Never throws: a failure here must not touch the result screen.
 * @param {any} rec the record just stored (ui/stats.js buildRecord shape)
 */
export async function completeFor(rec) {
  try {
    const s0 = get();
    if (!s0.enabled || !rec) return null;
    const facts = factsFromClientRecord(rec);
    if (!facts) return null;
    const p = await loadPrior();
    const hist = freshHistory();
    const r = complete(get(), facts, hist, p);
    if (!r.completed.length) return null;
    setChallengePts(rec.id, r.points);
    put(r.state);
    if (get().showPopup) {
      for (const c of r.completed) toast(t('挑战完成：{text}（+{n}）', { text: describeCard({ parts: c.parts }, undefined).title, n: c.points }), 'success');
    }
    return r;
  } catch (e) {
    console.warn('[challenges] completion check failed', e);
    return null;
  }
}

export function useChallenges() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return get();
}

/** "about 1 match in N" for a card, from the player's own level: only ever shown on the info page. */
export function chanceText(theta, rating) {
  const p = 1 / (1 + Math.exp(-(theta - rating)));
  if (p < 0.02) return t('很难完成');
  if (p > 0.9) return t('几乎每局都能完成');
  const n = Math.round(1 / p);
  return n <= 1 ? t('几乎每局都能完成') : t('约每 {n} 局完成 1 次', { n });
}

/** A completed challenge as one line: the outcome, then every condition it had (a card's conditions are part of what was done). */
const doneText = (d, lang) => { const c = describeCard({ parts: d.parts }, lang); return [c.title, ...c.lines].join(' · '); };

function Card({ card, index, lang }) {
  const { title, lines } = describeCard(card, lang);
  return html`<li class=${`chal-card${card.frozen ? ' is-frozen' : ''}`} data-testid="challenge-card">
    <span class="chal-card__n num">${index + 1}</span>
    <div class="chal-card__body">
      <b class="chal-card__title">${title}</b>
      ${lines.length ? html`<ul class="chal-card__lines">${lines.map((l, i) => html`<li key=${i}>${l}</li>`)}</ul>` : null}
    </div>
    <span class="chal-card__pts num">${t('{n} 点', { n: card.points })}</span>
    <button type="button" class=${`chal-card__freeze${card.frozen ? ' is-on' : ''}`} aria-pressed=${card.frozen ? 'true' : 'false'}
      title=${t('冻结后，重抽与调整难度都会保留这条挑战')} onClick=${() => challengeActions.freeze(index)}>${card.frozen ? t('已冻结') : t('冻结')}</button>
  </li>`;
}

function Info({ s, onBack, lang }) {
  const theta = ability(history ?? [], prior ?? { ratings: {} }).theta;
  return html`<div class="chal-info">
    <p>${t('挑战只在这台浏览器里生成和判定，不会发送给服务器，也不会过期；带作弊或改动的对局也算数，点数只会计入你的卫戍认证。一条挑战的所有条件需要在同一局里同时满足；完成后会换成新的挑战。')}</p>
    <p>${t('为了让挑战贴合你的水平，游戏会根据你在这里打完的对局算出一个自动调节用的数值：它只用于生成挑战，不是评级，不用于匹配，也永远不会发送到任何地方。数值越高，挑战越难。')}</p>
    <p class="chal-info__level">${t('自动调节数值：{theta}（难度步进 {step}）', { theta: theta.toFixed(1), step: s.level > 0 ? `+${s.level}` : String(s.level) })}</p>
    <ul class="chal-info__odds">${s.open.filter(Boolean).map((c, i) => html`<li key=${i}><span class="num">${i + 1}</span> ${describeCard(c, lang).title}: ${chanceText(theta, c.rating)}</li>`)}</ul>
    <${Button} variant="ghost" size="sm" onClick=${onBack}>${t('返回')}<//>
  </div>`;
}

export function ChallengesModal({ open, onClose }) {
  const s = useChallenges();
  const lang = useLang();
  const [info, setInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState(false);
  useEffect(() => { if (open) { setInfo(false); setList(false); challengeActions.open().catch(() => {}); } }, [open]);
  const run = (fn) => async () => { setBusy(true); try { await fn(); } catch { /* the panel just keeps what it had */ } finally { setBusy(false); } };
  return html`<${Modal} open=${open} onClose=${onClose} title=${t('挑战')} micro="CHALLENGES" width="9rem">
    <div class="chal" data-testid="challenges">
      ${info ? html`<${Info} s=${s} lang=${lang} onBack=${() => setInfo(false)} />` : list ? html`<div class="chal-done">
          ${s.done.length ? html`<ul>${[...s.done].reverse().map((d, i) => html`<li key=${i}><span class="num">${new Date(d.at).toLocaleDateString()}</span> ${doneText(d, lang)} <b class="num">+${d.pts}</b></li>`)}</ul>`
            : html`<p>${t('还没有完成过挑战。')}</p>`}
          <${Button} variant="ghost" size="sm" onClick=${() => setList(false)}>${t('返回')}<//>
        </div>` : html`
        <div class="chal-bar">
          <${Button} size="sm" disabled=${busy} onClick=${run(challengeActions.reroll)}>${t('全部重抽')}<//>
          <${Button} size="sm" disabled=${busy} onClick=${run(challengeActions.easier)}>${t('想要更简单')}<//>
          <${Button} size="sm" disabled=${busy} onClick=${run(challengeActions.harder)}>${t('想要更难')}<//>
          <button type="button" class="chal-i" aria-label=${t('说明')} title=${t('说明')} onClick=${() => setInfo(true)}><${Icon} name="info" /></button>
        </div>
        <ol class="chal-cards">${s.open.map((c, i) => (c ? html`<${Card} key=${c.id} card=${c} index=${i} lang=${lang} />` : null))}</ol>
        <div class="chal-foot">
          <${Button} variant="ghost" size="sm" onClick=${() => setList(true)}>${t('已完成（{n}）', { n: s.done.length })}<//>
          <${Button} variant="ghost" size="sm" onClick=${() => { challengeActions.enable(false); onClose?.(); }}>${t('关闭挑战')}<//>
        </div>`}
    </div>
  <//>`;
}

/** The lobby plate that opens the panel; nothing at all while the system is switched off. */
export function ChallengesPlate() {
  const s = useChallenges();
  const [open, setOpen] = useState(false);
  if (!s.enabled) return null;
  return html`<button type="button" class="hub-plate hub-plate--challenges" data-testid="challenges-plate" onClick=${() => setOpen(true)} title=${t('挑战（只在本机生成与判定）')}>
      <span class="hub-plate__glyph"><${Icon} name="crown" /></span>
      <span class="hub-plate__label">${t('挑战')}</span>
    </button>
    <${ChallengesModal} open=${open} onClose=${() => setOpen(false)} />`;
}

/** The Settings rows (B7, B11, B12); `Toggle` is the settings' own switch. */
export function ChallengeSettings({ Toggle }) {
  const s = useChallenges();
  const wipe = async () => {
    const ok = await confirmDialog({ title: t('重置挑战'), text: t('清除这台浏览器里的挑战、难度调节和完成记录。已获得的卫戍认证不受影响。'), okText: t('重置') });
    if (ok) challengeActions.reset();
  };
  return html`<section class="set-challenges" data-testid="challenge-settings">
    <${Toggle} label=${t('挑战')} micro="CHALLENGES" value=${s.enabled} onChange=${challengeActions.enable} />
    <${Toggle} label=${t('挑战完成后弹窗')} micro="POPUP AFTER A MATCH" value=${s.showPopup} onChange=${challengeActions.popup} />
    <div class="set-row"><span class="set-row__label">${t('重置挑战')}</span><${Button} size="sm" variant="ghost" onClick=${wipe}>${t('重置')}<//></div>
  </section>`;
}
