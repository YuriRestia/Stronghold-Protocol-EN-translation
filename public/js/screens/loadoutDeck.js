// (fork, 2026-11-08) The card view's building blocks, ONE copy for both of its screens: 干员调配's deck (screens/loadout.js)
// and the 自选编队 picker page (screens/diy.js), which is that deck for 自选 operators. The card (DeckOpCard) with its skill /
// module column (DeckOpSide) and its 「详情」 panel (DeckOpMore), the sideways deck of groups — a marker each (GroupMark), mouse
// drag, wheel, the group at the left edge and the jump to one (useGroupDeck, GroupBar / GroupBarLive) —, the drawer over
// the deck's left (DeckDrawer, a pure overlay) and the detail it holds (DeckDetail: 调配 / 时装, the head, the body). The
// screens pass only what is theirs: 干员调配 its stored choices and tiers; the picker its DRAFT, its classes, a taken
// operator and a prototype's locked skill and module. Neither screen may draw its own copy of these (the user's rule of
// 2026-11-08: one place to maintain). This module imports neither screen (screens/loadout.js imports screens/diy.js).
// Styles: css/screens/loadout.css (.lo-op, .lo-tmark, .lo-bbar, .lo-drawer, .lo-detail).

import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { nameWords } from '../ui/nameFit.js';
import { Component } from '../../vendor/preact.module.js';
import { html, Icon, TierChip } from '../ui/components.js';
import { OperatorImage, Img, PromotionIcon } from '../ui/gameComponents.js';
import { profGlyphUrl, subProfIconUrl, bondIconUrl } from '../ui/assetUrls.js';
import { data } from '../data.js';
import { useStore, createStore } from '../store.js';
import { detailsStore, outfitViewStore } from '../ui/loadoutDetails.js';
import { setOutfit, outfitStore, outfitsOf } from '../ui/outfits.js';
import { reducedMotion } from '../ui/device.js';
import { speakOutfit } from '../ui/loadoutVoice.js';
import { VoiceLangPicker } from '../ui/voiceLang.js';
import { MODULE_NONE, PROF_NAME, skillLabel, moduleBadge, quickSkillTags } from '../ui/loadoutModel.js';
import { SkillIcon, ModuleGlyph, SkillOption, ModuleSection } from './loadoutSections.js';
import { OutfitSwitch, OutfitPanel, outfitArtUrl } from './outfits.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const bondName = (id) => data.lookup('bonds', id)?.name || id;

/** Bond records of these ids in the roster's order: core first, then the bond order, then the name. */
export function bondsInOrder(ids) {
  const used = new Set(ids);
  return (data.list('bonds') || []).filter((b) => b && used.has(b.bondId))
    .sort((a, b) => (b.isCore ? 1 : 0) - (a.isCore ? 1 : 0) || (a.bondOrder ?? 0) - (b.bondOrder ?? 0) || String(a.name).localeCompare(String(b.name), 'zh'));
}

// ---- quick choices (PR #301's, by @farridge) ------------------------------------------------------------------------

/**
 * One skill to tap: its icon, the equipped one ringed; the label / tooltip says slot, name, SP and duration. `locked`: a
 * static cell (a prototype's skill: nothing to choose), `disabled`: a button that does nothing (a taken operator).
 */
export function QuickSkill({ m, opt, on, elite, onPick, disabled = false, locked = false }) {
  const rec = elite ? opt.elite || opt.normal : opt.normal || opt.elite;
  const icon = html`<${SkillIcon} m=${m} rec=${rec} index=${opt.index} on=${on || locked} size="q" />`;
  if (locked) {
    const label = `${skillLabel(opt.index)} · ${rec?.name || ''} · ${t('锁定')}`;
    return html`<span class="lo-q lo-q--skill is-on" data-skill=${opt.index} title=${label} aria-label=${label}>${icon}</span>`;
  }
  const tags = quickSkillTags(rec);
  const label = `${skillLabel(opt.index)} · ${rec?.name || t('未知技能')} · ${tags.sp} · ${t('初始')} ${tags.init ?? '—'} / ${t('消耗')} ${tags.cost ?? '—'} · ${t('持续')} ${tags.duration}`;
  return html`<button type="button" class=${cx('lo-q', 'lo-q--skill', on && 'is-on')} data-skill=${opt.index} aria-pressed=${on ? 'true' : 'false'}
      aria-label=${label} title=${label} disabled=${disabled} onClick=${() => onPick(opt.index)}>${icon}</button>`;
}

const modName = (mo) => (!mo || mo.id === MODULE_NONE ? t('不装备模组') : `${mo.rec?.typeName || ''} · ${mo.rec?.name || mo.id}`);

/** One module to tap (不装备 first): the type icon with its letter in the corner. `locked` / `disabled` as QuickSkill. */
export function QuickModule({ m, opt, on, onPick, disabled = false, locked = false }) {
  const label = modName(opt);
  const inner = html`<${ModuleGlyph} m=${m} rec=${opt.rec} id=${opt.id} size="q" />
    ${opt.id !== MODULE_NONE ? html`<b class="lo-q__type num" aria-hidden="true">${moduleBadge(opt.rec, opt.id)}</b>` : null}`;
  if (locked) return html`<span class="lo-q lo-q--mod is-on" data-module=${opt.id} title=${label} aria-label=${label}>${inner}</span>`;
  return html`<button type="button" class=${cx('lo-q', 'lo-q--mod', on && 'is-on')} data-module=${opt.id} aria-pressed=${on ? 'true' : 'false'}
      aria-label=${label} title=${label} disabled=${disabled} onClick=${() => onPick(opt.id)}>${inner}</button>`;
}

// ---- the card --------------------------------------------------------------------------------------------------------

/**
 * The levels on a card's rail: the normal and the elite form's promotion icon and level (the elite's in gold), and under
 * them `potential` (潜能 1–6, PotBadge; null: not shown — an operator whose 潜能 changes nothing, a prototype).
 */
export function LevelPill({ m, base, golden = null, potential = null }) {
  return html`<span class="lo-op__lv" title=${t('普通 / 精锐等级')}>
    <span class="lo-op__lvrow"><${PromotionIcon} m=${m} phase=${base?.status?.phase} class="lo-op__phase" /><b class="num">${base?.status?.level ?? '—'}</b></span>
    ${golden ? html`<span class="lo-op__lvrow is-elite"><${PromotionIcon} m=${m} phase=${golden.status?.phase} class="lo-op__phase" /><b class="num">${golden.status?.level ?? '—'}</b></span>` : null}
    <${PotBadge} n=${potential} />
  </span>`;
}

/**
 * The potential mark (the shape of the mode's ui/outer potential_bg and of the game's own badges): a point-down pentagram
 * of five flat strips, each traced corner by corner from the game's 320 × 320 badges (arts/potential_hub.ab potential_0 …
 * _4: the strip each one adds is the one drawn blue), in the order the game adds them — 潜能 1 the bar, 2 left → top-right,
 * 3 top-right → bottom, 4 bottom → top-left, 5 top-left → right. Their box: POT_VIEWBOX.
 */
const POT_VIEWBOX = '15 13 288 288';
const POT_BLADES = [
  '78.5,169.5 264.5,170.5 300.5,193.5 114.5,192.5',
  '17.5,180.5 168.5,72.5 213.5,69.5 62.5,177.5',
  '255.5,27.5 197.5,202.5 163.5,229.5 220.5,56.5',
  '109.5,70.5 166.5,247.5 155.5,291.5 98.5,114.5',
  '73.5,17.5 222.5,123.5 241.5,166.5 91.5,59.5',
];

/**
 * (fork) 潜能 as a row of the level pill: the mode's potential mark (POT_BLADES, the shape of ui/outer potential_bg), no
 * number (its title says it; the user's call of 2026-11-09), lit as the game's badge is — the blades of the ranks below in white (`is-past`), the current rank's in
 * the elite icon's yellow (`is-on`, the game's blue), the rest faint; 潜能 6 all five yellow (the user's calls of 2026-11-08 / 09: the
 * main game's badge too shiny, this one muted as the promotion icons). Null without a number.
 */
export function PotBadge({ n }) {
  if (!Number.isFinite(n)) return null;
  const state = (k) => (n >= 6 || k === n - 1 ? 'is-on' : k < n - 1 ? 'is-past' : null);
  const label = t('潜能 {n}', { n });
  return html`<span class="lo-op__pot" role="img" title=${label} aria-label=${label} data-potential=${n}>
    <svg class="lo-op__potstar" viewBox=${POT_VIEWBOX} aria-hidden="true">${[null, 'is-past', 'is-on'].flatMap((layer) => POT_BLADES.map((pts, k) => (state(k) === layer
      ? html`<polygon key=${k} points=${pts} class=${layer} />` : null)))}</svg>
  </span>`;
}

/**
 * The card's own column at its right: the skills (S1–S3, only those it has) at its top, the modules at its bottom
 * (不装备 first). A tall card (a PC, a tablet, a phone's one-row deck) shows every module as its own button, like the skills; a short one (a
 * phone in landscape: about 140 px at 844 × 390, too short for up to 3 skills and 4 modules at a tappable size) shows
 * ONE module button that steps to the next, its pips saying how many there are and which one is on — both drawn,
 * css/screens/loadout.css shows one by the screen's height. A phone at most 520 px tall lays the deck out in one row
 * at its full height (the user's call of 2026-11-09), tall enough for the list again. A press on the column never picks
 * the card (DeckOpCard).
 * `modules` null: no elite form (no module). `locked`: static cells, the module one cell (a prototype); `disabled`: the
 * buttons do nothing (a taken operator). [ASSUMED] the event's 物资调配处 has no such column (the remake's own).
 */
export function DeckOpSide({ m, skills, skill, elite, modules, module, onSkill, onModule, locked = false, disabled = false, testid = null }) {
  const cur = modules ? modules.findIndex((mo) => mo.id === module) : -1;
  const mod = cur >= 0 ? modules[cur] : null;
  const next = modules && !locked && !disabled && modules.length > 1 ? modules[(cur + 1) % modules.length] : null;
  const modLabel = !modules ? t('无精锐')
    : next ? t('模组：{name} · 点按切换为 {next}', { name: modName(mod), next: modName(next) }) // en: "Module: {name} · tap to switch to {next}"
      : t('模组：{name}', { name: modName(mod) }); // en: "Module: {name}"
  return html`<div class="lo-op__side lo-quick" data-testid=${testid} onClick=${(e) => e.stopPropagation()}>
    <div class="lo-op__skills" role="group" aria-label=${t('选择技能')}>
      ${skills.map((s) => html`<${QuickSkill} key=${s.index} m=${m} opt=${s} elite=${elite} on=${s.index === skill} locked=${locked} disabled=${disabled}
        onPick=${onSkill} />`)}
    </div>
    <div class="lo-op__mods" role="group" aria-label=${t('选择模组')} title=${t('模组仅在精锐形态生效')}>
      ${locked
        ? html`<div class="lo-op__mstep is-always">${mod ? html`<${QuickModule} m=${m} opt=${mod} locked />` : null}</div>`
        : html`${modules ? html`<div class="lo-op__mlist">${modules.map((mo) => html`<${QuickModule} key=${mo.id} m=${m} opt=${mo} on=${mo.id === module}
            disabled=${disabled} onPick=${onModule} />`)}</div>` : null}
          <div class=${cx('lo-op__mstep', !modules && 'is-always')}>
            <button type="button" class=${cx('lo-q', 'lo-q--mod', 'lo-op__mod', mod && mod.id !== MODULE_NONE && 'is-on')} data-module=${modules ? module : ''}
                disabled=${!next} aria-label=${modLabel} title=${`${modLabel}\n${t('模组仅在精锐形态生效')}`} onClick=${() => next && onModule(next.id)}>
              ${modules ? html`<${ModuleGlyph} m=${m} rec=${mod?.rec} id=${module} size="q" />` : html`<span class="lo-op__nomod" aria-hidden="true">—</span>`}
              ${mod && mod.id !== MODULE_NONE ? html`<b class="lo-q__type num" aria-hidden="true">${moduleBadge(mod.rec, mod.id)}</b>` : null}
            </button>
            ${modules && modules.length > 1 ? html`<span class="lo-op__mpips" aria-hidden="true">${modules.map((mo, i) => html`<i key=${mo.id} class=${i === cur ? 'is-on' : ''}></i>`)}</span>` : null}
          </div>`}
    </div>
  </div>`;
}

/**
 * (fork) The card's column in the 时装 view (the third choice of DetailsToggle): the operator's own look first, then each of its outfits
 * (data/outfits.json, `list`), as their portrait icons — the one worn ringed as an equipped skill is; a tap wears it at
 * once (ui/outfits.js setOutfit, as the 时装 page), and the card's portrait follows, and the voice rule of an outfit change applies (ui/loadoutVoice.js
 * speakOutfit). A press here never picks the card.
 * @param {{ m: any, charId: string, name: string, list: any[], worn: string|null }} p
 */
export function OutfitSide({ m, charId, name, list, worn }) {
  const cell = (id, rec) => {
    const on = (id || null) === worn;
    const label = id ? rec?.name || id : t('默认');
    const src = id ? outfitArtUrl(m, id, 'avatar') : m?.chars?.[charId]?.avatarE2 || m?.chars?.[charId]?.avatar;
    return html`<button key=${id || 'default'} type="button" role="radio" aria-checked=${on ? 'true' : 'false'} class=${cx('lo-q', 'lo-q--ofit', on && 'is-on')}
        data-outfit=${id || 'default'} title=${label} aria-label=${label} onClick=${() => { if (!on) { setOutfit(charId, id || null); speakOutfit({ charId }); } }}>
      <${Img} src=${src} class="lo-q__ofit" fallback=${html`<b>${[...((id ? rec?.name : name) || '?')][0]}</b>`} /></button>`;
  };
  return html`<div class="lo-op__side lo-quick lo-op__side--ofit" role="radiogroup" aria-label=${t('选择时装')} onClick=${(e) => e.stopPropagation()}>
    ${cell(null, null)}${list.map((r) => cell(r.id, r))}
  </div>`;
}

/**
 * 「详情」: the panel beside a card — its skills with their descriptions (`level` 'elite': the elite's Lv.7) and every
 * module with its bonus, 特性 and talents (at `potential`) — the Detail's own SkillOption and ModuleSection, so a choice
 * here is the same choice. Always drawn, in a wrapper (DeckOpCard's .lo-op__more) that css/screens/loadout.css keeps folded
 * (display: none) until its card's `data-open` slides it out (slideDetails): the toggle adds no element and redraws none.
 * Redrawn only when its own card's inputs change (`src` the card's record, `golden`, the skill and module, `level`,
 * `potential`, `locked`, the interface and data languages `locale`): 112 of them hold ~20 000 elements, and a tap on
 * one card redraws the whole deck. Its handlers read the current props when pressed (Preact keeps `this.props` current
 * when it skips a redraw), so a skipped redraw never writes with an old choice. `golden` null: 无精锐.
 */
export class DeckOpMore extends Component {
  shouldComponentUpdate(n) {
    const p = this.props;
    return n.src !== p.src || n.golden !== p.golden || n.skill !== p.skill || n.module !== p.module || n.level !== p.level
      || n.potential !== p.potential || n.locked !== p.locked || n.locale !== p.locale || n.m !== p.m;
  }

  render({ m, skills, skill, level, golden, modules, module, potential = null, locked = false }) {
    return html`<div class="lo-op__morein">
      <div class="lo-skills" role="radiogroup" aria-label=${t('选择技能')}>
        ${skills.map((s) => html`<${SkillOption} key=${s.index} m=${m} opt=${s} level=${level} on=${s.index === skill} locked=${locked}
          onPick=${(i) => { if (!this.props.locked) this.props.onSkill(i); }} />`)}
      </div>
      ${golden ? html`<${ModuleSection} m=${m} golden=${golden} moduleOptions=${modules} module=${module} locked=${locked} brief
        onPick=${(id) => { if (!this.props.locked) this.props.onModule(id); }} potential=${potential} />`
        : html`<p class="lo-op__none">${t('无精锐')}</p>`}
    </div>`;
  }
}

/**
 * One operator card (the event's 物资调配处 card, the remake's column and panel): the rail — its head (`railTop`: 干员调配
 * the tier, the picker the class), the branch icon (`sub`; under the head, not on the portrait: the user's call of
 * 2026-11-08) and the rest (`rail`: the levels, or 原型 / 已持有) —, the half-body portrait (`portrait`, an OperatorImage:
 * the owner's outfit shows here as everywhere) with a ribbon (`ribbon`), the column (`side`: DeckOpSide),
 * the name (wrapping at its spaces only, its words unbroken, fitted to the card: ui/nameFit.js) after `meta` at the card's foot, the bonds down the rail's foot and `railFoot` under
 * them (the user's calls of 2026-11-08), and the 「详情」 panel (`more`: DeckOpMore). A press on the card
 * picks it (`onPick`) unless it lands on one of its controls or the card is `pickDisabled` (a taken operator).
 * `attrs`: its data-* (data-chess / data-char), `cls` its own classes.
 */
export function DeckOpCard({ m, attrs = {}, cls = null, tier, selected = false, onPick, pickDisabled = false, pickTitle, pickCls = null, railCls = null,
  railTop = null, rail, railFoot = null, portrait, name, sub, ribbon = null, meta = null, bonds = [], side, more, moreTestid }) {
  return html`<div role="listitem" ...${attrs} class=${cx('lo-op', `lo-op--t${tier}`, 'has-side', selected && 'is-sel', cls)}>
    <div class="lo-op__card" onClick=${(e) => { if (!pickDisabled && !e.target.closest?.('button, select, input, .lo-op__side')) onPick(); }}>
      <div class=${cx('lo-op__rail', railCls)}>${railTop}<${Img} src=${subProfIconUrl(m, sub)} class="lo-op__sub" />${rail}
        <span class="lo-op__bonds">${bonds.map((b) => html`<span key=${b} class="lo-op__bond" title=${bondName(b)}>
          <${Img} src=${bondIconUrl(m, b)} fallback=${html`<i class="lo-bond__dot"></i>`} /></span>`)}</span>${railFoot}</div>
      <button type="button" class=${cx('lo-op__pick', pickCls)} aria-pressed=${selected ? 'true' : 'false'} disabled=${pickDisabled}
          title=${pickTitle || name} onClick=${() => onPick()}>
        <span class="lo-op__art">
          <${OperatorImage} m=${m} chess=${portrait} portrait avatarFallback fallback=${html`<span class="lo-op__glyph">${[...(name || '?')][0]}</span>`} />
        </span>
        ${ribbon}
      </button>
      ${side}
      <span class="lo-op__meta">${meta}<span class="lo-op__name">${typeof name === 'string'
        ? nameWords(name).map((w, i) => html`${i ? ' ' : null}<span key=${i} class="lo-op__w">${w}</span>`) : name}</span></span>
    </div>
    <div class="lo-op__more" data-testid=${moreTestid} onClick=${(e) => e.stopPropagation()}>${more}</div>
  </div>`;
}

// ---- 「展开」's panels: the cards near the view at once, the rest when the page is idle --------------------------------

/** How long 「展开」's panels take to unfold or fold, and their easing (theme.css --ease-out). */
const DETAILS_MS = 240;
const DETAILS_EASE = 'cubic-bezier(.2, .8, .2, 1)';
/** The cards near the view: on screen, or within this share of the deck's width beyond either edge. */
const NEAR = 0.5;
/** Cards opened per idle slice (the far ones, nearest first). */
const SLICE = 8;
/** A card's panel is drawn: an attribute of its own, so a card redrawn by Preact (its class string) keeps it. */
const OPEN = 'data-open';
/** Per deck: the ending of a slide still playing, and the idle job still opening far cards. */
const jobs = new WeakMap();
const jobOf = (deck) => { let j = jobs.get(deck); if (!j) { j = { end: null, idle: null }; jobs.set(deck, j); } return j; };
const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 120 }) : setTimeout(fn, 16));
const unidle = (id) => (typeof cancelIdleCallback === 'function' ? cancelIdleCallback(id) : clearTimeout(id));
const cardsOf = (deck) => [...deck.querySelectorAll('.lo-op.has-side')];
/** A card drawn whole (css: no content-visibility skip), so a scroll only shows what is already painted. */
const WARM = 'data-warm';
/** Cards warmed per idle slice. */
const WARM_SLICE = 6;

/**
 * Draw every card of `deck` whole while the page is idle, nearest the view first, a few at a time: a card skipped off
 * screen (content-visibility) is laid out and painted on the main thread as a scroll brings it in, and a scroll that
 * has to wait for that stutters (a 「展开」 card and its panel most; the user's call of 2026-11-08: as smooth as the tier
 * jumps). Drawn whole, a scroll is the compositor's alone. Waits for any other job of the deck to finish first.
 */
function warmLater(deck) {
  const j = jobOf(deck);
  if (j.idle != null || j.end) return;
  const box = deck.getBoundingClientRect();
  const mid = (box.left + box.right) / 2;
  const cold = cardsOf(deck).filter((el) => !el.hasAttribute(WARM))
    .map((el) => { const r = el.getBoundingClientRect(); return [Math.abs((r.left + r.right) / 2 - mid), el]; })
    .sort((a, b) => a[0] - b[0]).map(([, el]) => el);
  let i = 0;
  const step = () => {
    j.idle = null;
    if (!deck.isConnected) return;
    for (const end = Math.min(cold.length, i + WARM_SLICE); i < end; i += 1) {
      if (!cold[i].isConnected) continue;
      cold[i].setAttribute(WARM, '');
      // its pictures load now: a lazy picture is watched on every frame of a scroll until it loads (the panels' icons
      // made those checks the slowest frames' cost); Preact never rewrites the attribute it set the same
      for (const img of cold[i].querySelectorAll('img[loading="lazy"]')) img.loading = 'eager';
    }
    if (i < cold.length) j.idle = idle(step);
  };
  if (cold.length) j.idle = idle(step);
}
/** Back to skipping the cards off screen, so a press lays out only those in view (warmLater draws them again). */
const coolAll = (deck) => { for (const el of deck.querySelectorAll(`.lo-op[${WARM}]`)) el.removeAttribute(WARM); };

/** Stop what a deck still has going: a slide ends at once, the idle job stops where it is. */
function settle(deck) {
  const j = jobOf(deck);
  j.end?.();
  j.end = null;
  if (j.idle != null) { unidle(j.idle); j.idle = null; }
}

/**
 * Draw the far cards' panels (`cards`: sorted nearest first) a slice at a time while the page is idle. The cards
 * already have their unfolded width (the deck's `is-details`, css), so nothing moves and the scrollbar keeps still;
 * only the panel inside each is drawn. A card already open (a redraw) is skipped.
 */
function openLater(deck, cards) {
  const j = jobOf(deck);
  let i = 0;
  const step = () => {
    j.idle = null;
    if (!deck.isConnected || !deck.classList.contains('is-details')) return;
    for (const end = Math.min(cards.length, i + SLICE); i < end; i += 1) if (cards[i].isConnected) cards[i].setAttribute(OPEN, '');
    if (i < cards.length) j.idle = idle(step);
    else warmLater(deck);
  };
  if (cards.length) j.idle = idle(step); else warmLater(deck);
}

/** The closed cards of `deck`, split into those near the view and the far ones (nearest first). */
function splitNear(deck) {
  const box = deck.getBoundingClientRect();
  const pad = box.width * NEAR, mid = (box.left + box.right) / 2;
  const near = [], far = [];
  for (const el of cardsOf(deck)) {
    if (el.hasAttribute(OPEN)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > box.left - pad && r.left < box.right + pad) near.push(el);
    else far.push([Math.abs((r.left + r.right) / 2 - mid), el]);
  }
  return { near, far: far.sort((a, b) => a[0] - b[0]).map(([, el]) => el) };
}

/** Fold every panel at once (off screen a folded panel costs nothing: content-visibility). */
const closeAll = (deck) => { for (const el of deck.querySelectorAll(`.lo-op[${OPEN}]`)) el.removeAttribute(OPEN); };

/**
 * Unfold or fold 「展开」's panels (the user's calls of 2026-11-08: the press must answer at once, on a phone too, and
 * folding must not show the panel under the card). The deck's `is-details` gives every card its unfolded width at once
 * (css: the scrollbar settles with the press), by FLIP: the deck takes its final layout, scrolled so `anchor` stays
 * where it is on screen, and what is in view glides from where it was (transforms only, no layout per frame). Each
 * panel near the view slides out from under its card fading in, or back fading out first, clipped to its card while it
 * slides; folding plays in the open layout and takes the folded one when it ends. Unfolding draws only the panels near
 * the view now; the far ones are drawn while the page is idle (openLater), so the press costs the cards in view, not
 * all 112. Folding hides every panel at once.
 * @param {HTMLElement|null} deck @param {boolean} on @param {Element|null} anchor
 */
export function slideDetails(deck, on, anchor, done = null) {
  if (!deck) { done?.(); return; }
  settle(deck);
  coolAll(deck); // the press lays out only the cards in view; they are drawn whole again when idle
  const j = jobOf(deck);
  const { near, far } = on ? splitNear(deck) : { near: [...deck.querySelectorAll(`.lo-op[${OPEN}]`)], far: [] };
  const items = [...deck.querySelectorAll('.lo-tmark, .lo-op')];
  const box = deck.getBoundingClientRect();
  const seen = (r) => r.right > box.left && r.left < box.right;
  const before = items.map((el) => el.getBoundingClientRect());
  const ax = anchor ? anchor.getBoundingClientRect().left : 0;
  const keep = () => { if (anchor) { const dx = anchor.getBoundingClientRect().left - ax; if (Math.abs(dx) >= 0.5) deck.scrollLeft += dx; } };
  const s0 = deck.scrollLeft;
  deck.classList.toggle('is-details', on);
  if (on) for (const el of near) el.setAttribute(OPEN, '');
  keep();
  if (reducedMotion()) { if (on) openLater(deck, far); else { closeAll(deck); warmLater(deck); } done?.(); return; }
  const after = items.map((el) => el.getBoundingClientRect());
  const s1 = deck.scrollLeft;
  const moving = items.map((el, i) => [el, before[i], after[i]]).filter(([, b, a]) => seen(b) || seen(a));
  // the sliding cards (and their panels) rendered now, not frame by frame as they enter the view (content-visibility),
  // and clipped to their own box while they slide (css .is-sliding)
  for (const [el] of moving) el.classList.add('is-sliding');
  if (!on) { deck.classList.add('is-details'); deck.scrollLeft = s0; } // folding plays in the open layout
  // every read before the first animation: a read after one forces a fresh style and layout pass (a layout per card,
  // 14–16 a press, measured 2026-11-08); the panels share one width (--morew)
  const shown = new Set(near);
  const morew = moving.find(([el]) => shown.has(el))?.[0].querySelector('.lo-op__more')?.offsetWidth || 0;
  const opts = { duration: DETAILS_MS, easing: DETAILS_EASE, fill: on ? 'none' : 'forwards' };
  const anims = [];
  for (const [el, b, a] of moving) {
    const dx = on ? b.left - a.left : a.left - b.left;
    if (Math.abs(dx) >= 0.5) {
      const frames = [{ transform: `translateX(${dx}px)` }, { transform: 'translateX(0)' }];
      anims.push(el.animate(on ? frames : frames.reverse(), opts));
    }
    // its panel slides out from under the card, fading in; folding, it fades out within the first half of the slide, so
    // it never shows through the card as it goes back under it
    const more = shown.has(el) && morew ? el.querySelector('.lo-op__more') : null;
    if (more) {
      anims.push(more.animate(on
        ? [{ transform: `translateX(${-morew}px)`, opacity: 0 }, { transform: `translateX(${-morew * 0.35}px)`, opacity: 1, offset: 0.55 }, { transform: 'translateX(0)', opacity: 1 }]
        : [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-morew * 0.3}px)`, opacity: 0, offset: 0.45 }, { transform: `translateX(${-morew}px)`, opacity: 0 }], opts));
    }
  }
  const end = () => {
    if (j.end !== end) return;
    j.end = null;
    if (!on) { deck.classList.remove('is-details'); closeAll(deck); deck.scrollLeft = s1; }
    for (const an of anims) an.cancel();
    for (const [el] of moving) el.classList.remove('is-sliding');
    if (on) openLater(deck, far); else warmLater(deck);
    done?.();
  };
  j.end = end;
  if (anims.length) anims[0].finished.then(end, () => {}); else end();
}

/**
 * Keep a deck's cards in step with 「展开」 after each of its draws: cards drawn later (a filter, a version switch, the
 * deck's first draw with it already on) draw their panels — those near the view at once, the far ones when idle — and
 * none stays drawn while it is off. A slide still playing is left alone. The deck's job stops when it goes.
 * @param {{ current: HTMLElement|null }} deckRef
 */
export function useDetailsSync(deckRef) {
  useLayoutEffect(() => {
    const deck = deckRef.current;
    if (!deck || jobOf(deck).end) return;
    if (!detailsStore.get().on) { closeAll(deck); warmLater(deck); return; }
    const { near, far } = splitNear(deck);
    if (!near.length && !far.length) { warmLater(deck); return; }
    if (jobOf(deck).idle != null) { unidle(jobOf(deck).idle); jobOf(deck).idle = null; }
    for (const el of near) el.setAttribute(OPEN, '');
    openLater(deck, far);
  });
  useEffect(() => () => { if (deckRef.current) settle(deckRef.current); }, []);
}

/**
 * (fork) The outfits a deck's cards wear (干员调配's, the 自选 picker's): `wornOf(charId)` the worn one (null: the
 * operator's own look). Whether a card shows them is CardSide's own (the 时装 view, card by card).
 */
export function useOutfitView() {
  const outfits = useStore((s) => s.outfits, Object.is, outfitStore);
  const wornOf = (charId) => (outfits?.[charId] && outfitsOf(charId).some((r) => r.id === outfits[charId]) ? outfits[charId] : null);
  return { wornOf };
}

// ---- 时装 view, card by card ------------------------------------------------------------------------------------------

/**
 * (fork) Which cards draw their outfits (OutfitSide) in place of their skill / module column: `on` the 时装 view,
 * `pending` the cards (their keys) not switched to it yet. Each card's column follows it on its own (CardSide), so a
 * switch redraws only the cards that change — those near the view at once, the rest a slice per idle moment, nearest
 * first. Redrawing every card in one go was one task of 250–450 ms when leaving 时装 (measured 2026-11-09, the user's
 * call: no freeze).
 */
const sideStore = createStore({ on: outfitViewStore.get().on, pending: null });
const SIDE_SLICE = 8;
let sideJob = null;
/** A card's key in the DOM: 干员调配's card its chess, a 自选编队 slot its slot, a picker card its operator. */
const sideKey = (el) => el.dataset.chess || el.dataset.slot || el.dataset.char || null;
const sideShown = (s, k) => (s.pending?.has(k) ? !s.on : s.on);

/**
 * Turn the 时装 view on or off (outfitViewStore, the switch's state; the caller saves the pref): the cards of `deck`
 * (the deck on screen) near the view switch now, the far ones while the page is idle. Without a deck every card switches
 * at once. A switch while one is still going starts over from what each card shows.
 * @param {boolean} on @param {HTMLElement|null} deck
 */
export function setOutfitView(on, deck = null) {
  if (sideJob != null) { unidle(sideJob); sideJob = null; }
  if (outfitViewStore.get().on !== on) outfitViewStore.set({ on });
  const s0 = sideStore.get();
  const far = [];
  if (deck?.isConnected) {
    const box = deck.getBoundingClientRect();
    const pad = box.width * NEAR, mid = (box.left + box.right) / 2;
    for (const el of cardsOf(deck)) {
      const k = sideKey(el);
      if (!k || sideShown(s0, k) === on) continue;
      const r = el.getBoundingClientRect();
      if (!(r.right > box.left - pad && r.left < box.right + pad)) far.push([Math.abs((r.left + r.right) / 2 - mid), k]);
    }
  }
  const keys = far.sort((a, b) => a[0] - b[0]).map(([, k]) => k);
  sideStore.set({ on, pending: keys.length ? new Set(keys) : null });
  let i = 0;
  const step = () => {
    sideJob = null;
    i += SIDE_SLICE;
    const rest = keys.slice(i);
    sideStore.set({ pending: rest.length ? new Set(rest) : null });
    if (rest.length) sideJob = idle(step);
  };
  if (keys.length) sideJob = idle(step);
}

/**
 * A card's column: `outfit()` (its OutfitSide) in the 时装 view, else `skills()` (its DeckOpSide) — `k` the card's key
 * (sideKey). Only this redraws when the view switches. Drawn by the unit tests outside a render (their expand calls
 * components as functions, where a hook throws), it reads the store directly.
 */
export function CardSide({ k, outfit, skills }) {
  let show;
  try { show = useStore((s) => sideShown(s, k), Object.is, sideStore); } catch { show = sideShown(sideStore.get(), k); }
  return show ? outfit() : skills();
}

// ---- 「详情」 ---------------------------------------------------------------------------------------------------------

/**
 * 「简洁 / 展开」 at the right of the bottom bar of both pages (the user's calls of 2026-11-08: both ways of showing the
 * cards in view, the header's look, at the bottom): 简洁 the card and its own skill / module column; 展开 adds each card's
 * panel — the skill descriptions and every module — beside it. `onSet(on)` slides them (slideDetails); the state is
 * detailsStore, so only the switch redraws.
 */
export function DetailsToggle({ disabled = false, onSet, outfits = false }) {
  const on = useStore((st) => st.on, Object.is, detailsStore);
  const outfit = useStore((st) => st.on, Object.is, outfitViewStore);
  return DetailsToggleView({ on, disabled, onSet, outfit: outfits ? outfit : null });
}

/**
 * DetailsToggle's view (hook-free: the tests draw it): `on` the current 「展开」. (fork) With `outfit` (not null: 干员调配's
 * bar) a third choice, 时装 — a compact deck whose columns show the outfits (outfitViewStore, OutfitSide; the user's call
 * of 2026-11-09: one switch, as the 时装 view is compact): `onSet('outfits')`.
 */
export function DetailsToggleView({ on, disabled = false, onSet, outfit = null }) {
  const cur = outfit ? 'outfits' : on;
  const opt = (v, icon, label, sub, title, testid) => html`<button type="button" role="radio" aria-checked=${cur === v ? 'true' : 'false'}
      class=${cx('lo-dswitch__opt', cur === v && 'is-on')} data-testid=${testid} disabled=${disabled} title=${title}
      onClick=${() => cur !== v && onSet(v)}>
    <${Icon} name=${icon} /><span class="lo-dswitch__txt"><span>${label}</span><small>${sub}</small></span>
  </button>`;
  // en: "Card display"; "Compact" — "Show only the cards with their skill / module buttons"; "Expanded" — "Show the skill
  // descriptions and every module beside each card"; "Outfits" — "Pick each operator's outfit in its card's column"
  return html`<div class="lo-dswitch" role="radiogroup" aria-label=${t('卡片显示')} data-on=${on ? 'true' : 'false'}>
    ${opt(false, 'cardCompact', t('简洁'), 'CARDS', t('只显示卡片与其技能 / 模组按钮'), 'loadout-compact')}
    ${opt(true, 'cardDetail', t('展开'), 'SKILL · MODULE', t('在每张卡旁显示技能说明与全部模组'), 'loadout-details')}
    ${outfit == null ? null : opt('outfits', 'shirt', t('时装'), 'OUTFIT', t('在每张卡的右栏选择干员的时装'), 'loadout-outfitview')}
  </div>`;
}

// ---- the deck of groups ----------------------------------------------------------------------------------------------

/** A group's tall marker frame (`children`: 干员调配's tier art, the picker's class glyph and name) with its count below. */
export function GroupMark({ cls = null, count, children }) {
  return html`<div class=${cx('lo-tmark', cls)} aria-hidden="true">${children}<span class="lo-tmark__cnt num">${count}</span></div>`;
}

/**
 * The sideways deck's behaviour, for a scroller whose groups are `.lo-tgroup[data-group]`: mouse drag (useDragScroll's
 * swallowed click), a vertical wheel scrolling it sideways (not over a select or a 「详情」 panel), the group at its left
 * edge reported to the bar (`sink`, GroupBarLive: no redraw of the screen), and `jump(key)` scrolling to a group — a jump
 * keeps its group lit while its own scroll runs (the last groups cannot reach the left edge), until a hand scrolls again.
 * With the drawer open (.has-drawer) the edge is 40 % in. Spread `deckProps` on the scroller. `onDragStart`: a press
 * became a drag (the screens close their detail drawer: the user's call of 2026-11-09).
 * @param {{ current: HTMLElement|null }} deckRef @param {{ onDragStart?: Function }} [opts]
 */
export function useGroupDeck(deckRef, { onDragStart = null } = {}) {
  const { handlers: drag, stop: stopGlide } = useDragScroll({ onDragStart });
  const sink = useRef(null), raf = useRef(0), jumped = useRef(null);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const hand = () => { jumped.current = null; stopGlide(); };
  const edge = (el) => el.getBoundingClientRect().left + (el.classList.contains('has-drawer') ? el.clientWidth * 0.4 : 24);
  const onScroll = (e) => {
    drag.onScroll(e);
    const el = e.currentTarget;
    if (jumped.current != null) { sink.current?.(jumped.current); return; }
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const left = edge(el);
      let cur = null;
      for (const sec of el.querySelectorAll('.lo-tgroup[data-group]')) if (cur == null || sec.getBoundingClientRect().left <= left) cur = sec.dataset.group;
      if (cur != null) sink.current?.(cur);
    });
  };
  const onWheel = (e) => {
    hand();
    const el = e.currentTarget;
    if (e.ctrlKey || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
    if (e.target?.closest?.('select, .lo-op__more')) return;
    el.scrollLeft += e.deltaY;
    e.preventDefault();
  };
  const jump = (key) => {
    const deck = deckRef.current;
    const sec = deck?.querySelector(`.lo-tgroup[data-group="${key}"]`);
    if (!deck || !sec) return;
    stopGlide();
    jumped.current = String(key);
    deck.scrollTo({ left: Math.max(0, sec.offsetLeft - (deck.classList.contains('has-drawer') ? deck.clientWidth * 0.4 : 0)), behavior: reducedMotion() ? 'auto' : 'smooth' });
    sink.current?.(String(key));
  };
  return {
    deckProps: { ...drag, onPointerDown: (e) => { hand(); drag.onPointerDown(e); }, onTouchStart: hand, onKeyDown: hand, onScroll, onWheel },
    sink, jump,
  };
}

/**
 * The bottom bar's group buttons: `items` [{ key, content, title, disabled?, cls?, attrs? }], the `active` one lit (the
 * mint underline). Hook-free; GroupBarLive holds `active` from the deck (useGroupDeck's sink).
 */
export function GroupBar({ items, active, onJump, label, cls = null }) {
  return html`<div class=${cx('lo-bbar__tiers', cls)} role="group" aria-label=${label}>
    ${items.map((it) => html`<button key=${it.key} type="button" ...${it.attrs || {}} class=${cx('lo-bbar__tier', it.cls, active === it.key && 'is-on')}
        disabled=${!!it.disabled} data-group=${it.key} onClick=${() => onJump(it.key)} title=${it.title}>${it.content}</button>`)}
  </div>`;
}

/** GroupBar with the group at the deck's left edge as its own state (`sink`): the deck's scroll redraws only the bar. */
export function GroupBarLive({ sink, items, ...props }) {
  const [active, setActive] = useState(null);
  sink.current = setActive;
  useEffect(() => () => { if (sink.current === setActive) sink.current = null; }, []);
  const first = items.find((it) => !it.disabled)?.key ?? null;
  return html`<${GroupBar} ...${props} items=${items} active=${items.some((it) => it.key === active && !it.disabled) ? active : first} />`;
}

/** The glide's slowing each 60th of a second after a drag lets go (a phone browser's feel). */
const FRICTION = 0.965;
/**
 * A deck whose last two scrolls came this close and this recently is still moving: a press on it stops it and picks
 * nothing (useDragScroll). Two: a glide, a wheel or a jump scrolls on every frame, while one lone scroll is the deck
 * jumping once — a search that shortened it, the drawer making room — and a press right after it must pick (a click
 * after a search was swallowed and the drawer kept the previous operator: the e2e run of 2026-11-09).
 */
const STILL_MS = 120;

/**
 * The grabbing hand while a drag moves a deck: a clear sheet over the page (css .lo-grabsheet). A class on the deck
 * would restyle every card under it, 165–187 ms each switch in 「展开」 (measured in the user's Vivaldi, 2026-11-08);
 * the sheet is one element. The drag's pointer is captured by the deck, so its moves still reach it; any press, release
 * or buttonless move that reaches the sheet itself means the drag ended where the deck could not hear it, and the sheet
 * goes (`onLost`: the drag's owner forgets it), so it can never stay over the page.
 */
let sheet = null, sheetLost = null;
function grabSheet(on, onLost = null) {
  if (!on) { sheet?.remove(); sheetLost = null; return; }
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.className = 'lo-grabsheet';
    const lost = (e) => {
      if (e.type === 'pointermove' && e.buttons) return;
      const f = sheetLost;
      grabSheet(false);
      f?.();
    };
    for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'pointermove']) sheet.addEventListener(type, lost);
  }
  sheetLost = onLost;
  if (!sheet.isConnected) document.body.appendChild(sheet);
}

/**
 * Mouse drag scrolls a sideways deck (a desktop has no swipe): past a few pixels the press becomes a drag and the click
 * that ends it is swallowed, so a card is not picked by letting go. The deck follows the pointer once a frame (one scroll
 * write a frame, however many moves came in), and let go it glides on at the pointer's speed and slows down as a phone
 * browser's scroll does (the user's call of 2026-11-08), until a press, a wheel or a touch stops it (`stop`; none with
 * reduced motion). Touch and pen keep the browser's own scrolling. Spread the handlers on the scroller.
 * A press while the deck still moves (a glide, a wheel, a group jump, a touch fling) only stops it: its click picks
 * nothing, as a tap on a phone's moving list does (the user's call of 2026-11-08: a card waits for the deck to stop).
 * (fork) `onDragStart` runs when a press becomes a drag. A scroll the deck takes from elsewhere during the drag (the
 * drawer closing gives its room back) moves the drag's origin with it, so the cards stay under the pointer.
 */
export function useDragScroll({ onDragStart = null } = {}) {
  const drag = useRef(null), swallow = useRef(false), glide = useRef(0), frame = useRef(0);
  const started = useRef(onDragStart);
  started.current = onDragStart;
  // write the drag's scroll; a scroll from elsewhere since the last write first moves its origin by as much
  const apply = (d) => {
    const ext = d.el.scrollLeft - d.wrote;
    if (Math.abs(ext) >= 1) { d.left += ext; d.to += ext; }
    d.el.scrollLeft = d.to;
    d.wrote = d.el.scrollLeft;
  };
  // when the deck last scrolled and the time before, and whether the press now down came while it moved
  const scrolled = useRef(-Infinity), scrolledBefore = useRef(-Infinity), pressMoving = useRef(false);
  // nothing on the deck changes while it moves (see grabSheet): its cards keep their hover, which costs next to nothing
  const stop = () => { if (glide.current) cancelAnimationFrame(glide.current); glide.current = 0; };
  useEffect(() => () => { stop(); cancelAnimationFrame(frame.current); if (drag.current?.moved) grabSheet(false); }, []);
  // a drag let go where the deck could not hear it: forget it, no glide
  const lost = () => { drag.current = null; cancelAnimationFrame(frame.current); frame.current = 0; };
  const end = (e) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved) return;
    const el = d.el;
    cancelAnimationFrame(frame.current);
    frame.current = 0;
    apply(d);
    grabSheet(false);
    swallow.current = true;
    setTimeout(() => { swallow.current = false; }, 0);
    // the pointer's speed over its last moves (≤ 100 ms) carries the deck on
    const now = performance.now();
    const recent = d.samples.filter((p) => now - p.t <= 100);
    if (reducedMotion() || recent.length < 2 || e.type !== 'pointerup') return;
    const first = recent[0], last = recent[recent.length - 1];
    let v = -(last.x - first.x) / Math.max(8, last.t - first.t); // px of scroll a ms
    if (Math.abs(v) < 0.08) return;
    let at = now;
    const tick = (time) => {
      const dt = Math.min(34, Math.max(0, time - at));
      at = time;
      const was = el.scrollLeft;
      el.scrollLeft = was + v * dt;
      v *= Math.pow(FRICTION, dt / 16.67);
      glide.current = Math.abs(v) < 0.02 || !el.isConnected || Math.abs(el.scrollLeft - was) < 0.01 && dt > 0 ? 0 : requestAnimationFrame(tick);
    };
    glide.current = requestAnimationFrame(tick);
  };
  return {
    stop,
    handlers: {
      onScroll: () => { scrolledBefore.current = scrolled.current; scrolled.current = performance.now(); },
      onPointerDown: (e) => {
        pressMoving.current = performance.now() - scrolled.current < STILL_MS && scrolled.current - scrolledBefore.current < STILL_MS;
        if (pressMoving.current && !glide.current && e.pointerType === 'mouse') {
          // a wheel's or a jump's smooth scroll stops where it is, as a glide does
          e.currentTarget.scrollTo({ left: e.currentTarget.scrollLeft, behavior: 'instant' });
        }
        stop();
        // a press on a 「展开」 panel drags too: it is near half of each card (24 of 25 drags that did not move the deck
        // started on one in the user's test, 2026-11-08); the wheel over a panel still scrolls the panel
        if (e.pointerType !== 'mouse' || e.button !== 0 || e.target?.closest?.('select, input, textarea')) return;
        drag.current = { id: e.pointerId, el: e.currentTarget, x: e.clientX, left: e.currentTarget.scrollLeft, to: e.currentTarget.scrollLeft,
          wrote: e.currentTarget.scrollLeft, moved: false, samples: [{ t: performance.now(), x: e.clientX }] };
      },
      onPointerMove: (e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        // let go outside the deck before it became a drag (a press dragged straight down onto the bottom bar): no
        // button is down now, and the press is over
        if (!(e.buttons & 1)) { if (d.moved) end(e); else drag.current = null; return; }
        const dx = e.clientX - d.x;
        if (!d.moved) {
          if (Math.abs(dx) < 6) return;
          d.moved = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          grabSheet(true, lost);
          started.current?.();
        }
        d.samples.push({ t: performance.now(), x: e.clientX });
        if (d.samples.length > 12) d.samples.shift();
        d.to = d.left - dx;
        if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; if (drag.current === d) apply(d); });
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end, // after a pointerup it finds no drag; without one (the deck redrawn mid-drag) it ends it
      onClickCapture: (e) => {
        // a key's click (detail 0) is never one of these
        const moving = pressMoving.current && e.detail > 0;
        pressMoving.current = false;
        if (swallow.current || moving) { swallow.current = false; e.stopPropagation(); e.preventDefault(); }
      },
    },
  };
}

// ---- the drawer ------------------------------------------------------------------------------------------------------

/*
 * (fork) The drawer lies over the deck's left and nothing else: the deck neither makes room for it nor scrolls when it
 * opens or closes (the user's call of 2026-11-09: a pure overlay — the room and its scroll made a select and deselect
 * shift the cards, and a drag that closed it jump). A card under it stays under it. The deck keeps `.has-drawer` for the
 * group bar, whose left edge is the drawer's right then.
 */
/** The drawer itself: 收起 on top, then `children` (an DeckDetail). */
export function DeckDrawer({ testid, onClose, children }) {
  return html`<div class="lo-drawer" data-testid=${testid}>
    <button type="button" class="lo-drawer__close" onClick=${onClose} title=${t('收起 (Esc)')}><${Icon} name="chevronLeft" />${t('收起')}</button>
    ${children}
  </div>`;
}

/**
 * The detail in the drawer: 调配 / 时装 on top (`view`; 时装 the full outfit panel of `outfitChess`), the head — the
 * portrait (`portrait`, `fallback`), the tier chip and `chips`, the name and its English, class and branch, bonds, the
 * dub picker (`voiceCharId`) and `action` (干员调配's 恢复默认) — then `children`, the screen's sections. `rec` the
 * record the head reads (profession, subProfessionName, bonds).
 */
export function DeckDetail({ m, rec, tier, name, en, portrait, fallback, chips = null, action = null, voiceCharId, view, onView, outfitChess, bodyRef = null, bodyCls = null, children }) {
  return html`<aside class="lo-detail" aria-label=${t('{name} 调配', { name })}>
    <div class="lo-dtop"><${OutfitSwitch} view=${view} onView=${onView} /></div>
    <div class="lo-dhead">
      <div class=${cx('lo-dhead__art', `lo-dhead__art--t${tier}`)}>
        <${OperatorImage} m=${m} chess=${portrait} portrait fallback=${fallback} />
      </div>
      <div class="lo-dhead__info">
        <div class="lo-dhead__chips"><${TierChip} tier=${tier} size="md" />${chips}</div>
        <h2 class="lo-dhead__name">${name}</h2>
        <span class="lo-dhead__en">${en || ''}</span>
        <span class="lo-dhead__class">
          <${Img} src=${profGlyphUrl(m, rec.profession)} class="lo-dhead__prof lo-profglyph" />${t(PROF_NAME[rec.profession] || '')}
          <i class="lo-sep"></i><${Img} src=${subProfIconUrl(m, rec)} class="lo-dhead__prof" />${rec.subProfessionName || ''}
        </span>
        <span class="lo-dhead__bonds">${(rec.bonds || []).map((b) => html`<span key=${b} class="lo-bond">
          <${Img} src=${bondIconUrl(m, b)} class="lo-bond__icon" fallback=${html`<i class="lo-bond__dot"></i>`} />${bondName(b)}</span>`)}</span>
        <${VoiceLangPicker} charId=${voiceCharId} class="lo-dhead__voice" />
      </div>
      ${action}
    </div>
    ${view === 'outfit' ? html`<${OutfitPanel} m=${m} chess=${outfitChess} />`
      : html`<div class=${cx('lo-detail__body', bodyCls)} ref=${bodyRef}>${children}</div>`}
  </aside>`;
}
