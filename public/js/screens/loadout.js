// 干员调配 (Operator loadout, DESIGN §16): choose the equipped skill of every chess and the module of its elite before a
// match (official rule: "开始游戏前无法调整干员的等级，但可调整其所携带的技能和模组"). A full-screen overlay opened
// from the lobby, the room and the briefing (INFO_CHECK) — `openLoadout(from)` / <LoadoutButton/>; <LoadoutHost/> is
// mounted once by main.js. Styles: css/screens/loadout.css (official preset sprites from the local-client art when
// present: operator_preset, image_skill_select_outline, skill_select_deco, icon_equip_non; the module type icons of
// groups.module — lettered tiles without them).
//
// (fork, 2026-11-08) The roster is the card view below — the list view (one aligned row per operator, PR #301's quick
// choices laid out by the owner's decision of 2026-10-08) was removed by the user's call of 2026-11-08. The drawer
// holds the selected chess — its 潜能 / 练度,
// its 特质 (the in-match card's block, PR #301), skills (icon, name, 默认,
// SP recovery, 初始 / 消耗 SP, duration, description at 普通 Lv.4 or 精锐 Lv.7), 局内数值 (the stats, 攻击范围, 特性 and
// 天赋 the chosen variant — 精锐 first, 普通 on the toggle — fights with under the chosen skill and module: the detail
// card's own block and pure functions, GitHub issue #64) and the elite's modules (不装备 / X / Y … with the stat bonus,
// the trait upgrade and the talent changes), 恢复默认; 全部恢复默认 in the top bar. The detail's 普通 / 精锐 skill toggle is one
// preview for the skills, the 特质 and the rows' skill details (display only: never stored).
// The loadout lives in ui/loadoutSync.js (localStorage + room.loadout); the model is ui/loadoutModel.js.
// The second tab, 干员持有 (0.2.0 补位, screens/ownership.js): which NORMAL chess the player owns — a chess marked 未持有 is
// deployed as its official stand-in (room.ownership; ui/ownershipModel.js) — with its own 导出 / 导入 / 全部持有.
// 自选编队 (0.2.0 DIY, screens/diy.js): the operators of the four DIY slots (room.diy; ui/diyModel.js), a card each in
// the deck (fork: no tab or overview of its own; 导出 / 导入 / 清空 in 更多).
// Keyboard: Esc closes, ←/→ move through the (filtered) roster when focus is not in the search field (干员调配 tab).
// 卡片视图 (PR #643 split item 5 / PR #811; the only view since the fork's 2026-11-08 change): the 干员调配 tab laid out after the event's 物资调配处 — the roster as cards in tier groups scrolling
// sideways (two rows a group, a tall tier marker before each), one card per 自选编队 slot closing tiers 5 and 6 (it opens
// that slot's picker as a page in place of the deck: the card view has no 自选编队 overview), a bottom
// bar jumping to a tier. Each card has its own skill / module column (screens/loadoutDeck.js DeckOpSide: S1–S3, one module button stepping through
// the modules) and 「详情」 adds the descriptions and every module beside the cards (DeckOpMore); the fork removed 快速配置.
// A card opens the Detail in a drawer over the left of the deck; Esc peels back one layer at a time on this tab (a
// popover, the drawer, then the overlay), and leaving the tab closes them. 「简洁 / 详情」 sit in the top bar; the choice
// is kept in this browser (loadPref 'loadout.details').
// Sources: the tier marker is the official shopLevelSprite/shop_level_tag_1..6 (data/assets.json; also in the local
// client's ui/outer set) with a CSS marker as its fallback — [ASSUMED] that the event's 物资调配处 draws this sprite (its
// name and its look: 'NO.' and the framed Roman numeral), shown at its design size (150 × 595 design px). The official
// activity_table act2autochess.shopLevelDisplayDataDict confirms one display group per shop level (1–6) and lists two
// DIY slots in tiers 5 and 6 (charChessDiySlotIdList). [ASSUMED] (no screenshot or video of the event screen offline):
// the card frame and its colours, the two-row flow, the bottom tier bar, the cards' skill / module column and 「详情」 panel, the 转场 timings
// (css/screens/loadout.css); the official data lists two slots per tier, one card each here.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, MicroLabel, Button, TierChip, TextField, Countdown, Spinner, confirmDialog, hasDeadline, Modal, Fragment } from '../ui/components.js';
import { useNameFit } from '../ui/nameFit.js';
import { Img, UnitThumb } from '../ui/gameComponents.js';
import { uiUrl } from '../ui/assetUrls.js';
import { GarrisonBlock } from '../ui/detailPanel.js';
import { data, useData, localAsset, DATA_FILES } from '../data.js';
import { useStore, savePref } from '../store.js';
// (fork) 「详情」's state, shared with the 自选编队 picker page (ui/loadoutDetails.js)
import { DETAILS_PREF, loadoutDetailsPref, detailsStore, outfitViewStore, OUTFIT_VIEW_PREF } from '../ui/loadoutDetails.js';
export { loadoutDetailsPref, detailsStore };
import { PHASE } from '../../../shared/constants.js';
import { ruleOption } from '../../../shared/plugins/rules.js';
import {
  MODULE_NONE, rosterOf, filterRoster, recordsOf, chessOptions, effectiveChoice, setChoice, resetChoice,
  changedCount,
  setOps, resetOps,
} from '../ui/loadoutModel.js';
import { loadoutStore, openLoadout, closeLoadout, backFromLoadout, setEntries, setOpsMap, applyLoadoutEntries, setNotOwned, applyOwnershipImport, setDiyPicks, applyDiyImport, importedEntries, importedNotOwned } from '../ui/loadoutSync.js';
// 皮肤 (docs/SKINS.md): a self-contained section — everything it does lives in ui/skinPicker.js, so this screen keeps
// one import and one line in its detail body
import { SkinSection } from '../ui/skinPicker.js';
import { CultivationSection, cultivationView, potentialEditable } from './cultivation.js';
import { outfitStore, applyOutfitsImport, outfitsOf } from '../ui/outfits.js';
import { cultivationCharIds } from '../../../shared/protocol.js';
import { setOwned, notOwnedCount } from '../ui/ownershipModel.js';
import { BACKUP_PARTS, BACKUP_IMPORT_MAX_BYTES, serializeBackup, readBackup, backupFileKind } from '../ui/backupModel.js';
import { OwnershipPanel, useOwnershipRoster } from './ownership.js';
import { diyData, DiyDeckSlot, DiyPicker, DiyDetail } from './diy.js';
// the roster's detail sections and their pieces live in screens/loadoutSections.js (the 自选编队 picker draws the same
// ones); re-exported here, where the tests and the screen have always imported them from
import { ModuleInfo, SkillSection, ModuleSection, ProfFilter } from './loadoutSections.js';
// (fork) the card view's card, deck, bar and drawer: one copy, shared with the 自选编队 picker (screens/loadoutDeck.js)
import { LevelPill, OutfitSide, DeckOpSide, DeckOpMore, DeckOpCard, GroupMark, GroupBar, GroupBarLive, useGroupDeck, DeckDrawer, DeckDetail, DetailsToggle, slideDetails, useDetailsSync, useOutfitView, setOutfitView, CardSide, bondsInOrder } from './loadoutDeck.js';
import { speakSelect, touchOperator, resetLoadoutVoice } from '../ui/loadoutVoice.js';
export { ModuleInfo };
export { ModuleGlyph, SkillOption } from './loadoutSections.js';
import { LoadoutStats } from '../ui/loadoutStats.js';
import { useSkillRangePreview } from '../ui/rangePreview.js';
export { LoadoutStats, statsPreview } from '../ui/loadoutStats.js';
import { diyCount, sanitizeDiyPicks, setPick, diySlotList, pickOptions } from '../ui/diyModel.js';
import { t, tParts, N_, getLang } from '../../../shared/i18n.js';
import { copyText } from '../ui/clipboard.js';
import { toast } from '../ui/toasts.js';

export { openLoadout, closeLoadout, backFromLoadout };

const cx = (...p) => p.flat().filter(Boolean).join(' ');
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

// ---- export / import (干员调配 presets) -----------------------------------------------------------------------------
//
// The payload is the versioned envelope of ui/loadoutModel.js (exportPayload / parseImport): a downloaded file and a
// pasted string are the SAME object, so 导出 and 导入 both funnel through applyLoadoutEntries
// (sanitise → persist → room.loadout). The dialog is a shared Modal rendered next to the overlay, not inside it.

/** Save `text` as a download. Silent no-op when the browser refuses downloads — 复制 stays available. */
function downloadText(filename, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* ignore */ }
}

/** Read a picked file as text (`File.text()`, with a FileReader fallback for older Safari). */
function readFileText(file) {
  if (typeof file?.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(fr.error || new Error('read failed'));
    fr.readAsText(file);
  });
}

/** `stronghold-loadout-20261003-1245.json` (`-ownership-`, `-diy-`, `-outfits-` for one other part, `-all-` for several) */
function exportFilename(now = new Date(), what = 'loadout') {
  const p = (n) => String(n).padStart(2, '0');
  return `stronghold-${what}-${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.json`;
}




// ---- detail --------------------------------------------------------------------------------------------------------------

/** The same attribute records and rich-text renderer as the in-match card, including literal trigger markers. */
export function LoadoutGarrisons({ chess, m }) {
  const records = (chess?.garrisonIds || []).map((id) => data.lookup('garrisons', id)).filter(Boolean);
  return records.length ? html`<section class="lo-garrisons" data-variant=${chess.isGolden ? 'elite' : 'normal'}>
    ${records.map((garrison) => html`<${GarrisonBlock} key=${garrison.garrisonId} garrison=${garrison} m=${m} />`)}
  </section>` : null;
}


/** The name of a chess's 补位 stand-in (data/backups.json), or null. */
const standInName = (chess) => data.get('backups')?.units?.[chess?.backup?.charId]?.name ?? null;

/**
 * The selected chess in the drawer (screens/loadoutDeck.js DeckDetail, shared with the 自选编队 picker): 已调整 / 默认配置
 * and 恢复默认 in its head, then 外观, 潜能与练度, 特质, 技能, 局内数值 and 模组 — the stored loadout's choices. A locked
 * match is said once, by the bottom bar (§35.18), not here.
 */
function Detail({ m, chess, golden, entries, ops = {}, onChange, onOps, onReset, level = 'normal', onLevel, notOwned = false, view = 'loadout', onView,
  statLevel: statLevelIn = null, onStatLevel = null }) {
  // 局内数值: the 精锐 shows the chosen module's effect. (fork) The screen keeps the choice (`statLevel`), so it stays
  // where it was left when the drawer closes and opens again (搜索 closes it); drawn alone, the Detail keeps its own
  const [statLevelOwn, setStatLevelOwn] = useState('elite');
  const statLevel = statLevelIn ?? statLevelOwn;
  const setStatLevel = onStatLevel ?? setStatLevelOwn;
  useSkillRangePreview(); // (fork) 局内数值's 攻击范围 技能 toggle (ui/rangePreview.js)
  const setLevel = onLevel;
  const bodyRef = useRef(null);
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [chess?.chessId]);
  if (!chess) return html`<aside class="lo-detail lo-detail--empty"><p class="t-dim">${t('没有符合条件的干员')}</p></aside>`;
  const opt = chessOptions(chess, golden);
  const choice = effectiveChoice(entries, chess, golden);
  const cv = cultivationView(chess.charId, ops);
  const changed = choice.changed || cv.changed;
  return html`<${DeckDetail} m=${m} rec=${chess} tier=${chess.tier} name=${chess.name} en=${chess.appellation} portrait=${golden || chess}
      fallback=${html`<${UnitThumb} kind="chess" id=${chess.chessId} size="lg" />`} voiceCharId=${chess.charId} view=${view} onView=${onView} outfitChess=${chess}
      bodyRef=${bodyRef}
      chips=${changed ? html`<span class="lo-badge lo-badge--changed">${t('已调整')}</span>` : html`<span class="lo-badge lo-badge--plain">${t('默认配置')}</span>`}
      action=${html`<${Button} variant="ghost" size="sm" icon="refresh" class="lo-dhead__reset" disabled=${!changed} onClick=${onReset}>${t('恢复默认')}<//>`}>
      ${/* 外观 (docs/SKINS.md) sits directly under the operator's name, before 潜能与练度 and above the 技能 /
           局内数值 / 模组 sections: a skill and a module usually keep their default and the two selects are a one-off,
           while the appearance is what a player opens the panel to change. The section itself lives in ui/skinPicker.js
           (one line here, so upstream rewriting this panel costs one line rather than a conflict). Whether it exists
           is a GLOBAL question — any operator of the manifest wearing something — so an install without a cosmetic
           layer keeps the panel's shape, while a loaded plugin gives every operator the section (one 默认 tile when
           it has no skin). */ null}
      <${SkinSection} charId=${chess.charId} />
      <${CultivationSection} charId=${chess.charId} ops=${ops} onSet=${onOps} standIn=${notOwned} />
      <${LoadoutGarrisons} chess=${level === 'elite' && golden ? golden : chess} m=${m} />
      <${SkillSection} m=${m} chess=${chess} golden=${golden} skillOptions=${opt.skillOptions} skill=${choice.skill} level=${level}
        onLevel=${setLevel} onPick=${(i) => onChange({ skill: i })} />
      <${LoadoutStats} base=${chess} golden=${golden} entries=${entries} ops=${ops} level=${statLevel} onLevel=${setStatLevel} />
      <${ModuleSection} m=${m} golden=${golden} moduleOptions=${opt.moduleOptions} module=${choice.module}
        onPick=${(id) => onChange({ module: id })} potential=${cv.potentialOn ? cv.potential : null} />
      ${notOwned ? html`<p class="lo-locknote lo-locknote--standin" data-testid="loadout-standin-note"><${Icon} name="info" />${standInName(chess) ? t('干员持有中标记为未持有：此棋子由替补干员 {name} 上场，技能与模组固定（补位干员技能不可更改）；这里的调配在改回「持有」后生效', { name: standInName(chess) })
        : t('干员持有中标记为未持有：此棋子由替补干员上场，技能与模组固定（补位干员技能不可更改）；这里的调配在改回「持有」后生效')}</p>` : null}
  <//>`;
}

// ---- filters -------------------------------------------------------------------------------------------------------------

/**
 * The roster's filters, the top bar's 筛选 popover: tier, search, class, bond, 仅看已调整. (fork) The 自选编队 picker page
 * shares them without the tier row and 仅看已调整 (`tiers` / `changed` false): one tier, no defaults to change.
 */
export function Filters({ m, filters, onFilters, bonds, tiers = true, changed = true }) {
  const set = (patch) => onFilters({ ...filters, ...patch });
  return html`<div class="lo-filters">
    <div class=${cx('lo-frow', !tiers && 'lo-frow--search')}>
      ${tiers ? html`<div class="lo-chips" role="group" aria-label=${t('阶级')}>
        <button type="button" class=${cx('lo-chip', !filters.tier && 'is-on')} onClick=${() => set({ tier: null })}>${t('全部')}</button>
        ${[1, 2, 3, 4, 5, 6].map((tier) => html`<button key=${tier} type="button" class=${cx('lo-chip', 'lo-chip--tier', `lo-chip--t${tier}`, filters.tier === tier && 'is-on')}
          aria-pressed=${filters.tier === tier ? 'true' : 'false'} title=${t('{tier}阶', { tier })} onClick=${() => set({ tier: filters.tier === tier ? null : tier })}><span class="num">${ROMAN[tier]}</span></button>`)}
      </div>` : null}
      <${TextField} size="sm" icon="search" value=${filters.query || ''} placeholder=${t('搜索干员 / 职业 / 盟约')} class="lo-search"
        onInput=${(v) => set({ query: String(v).slice(0, 24) })} />
    </div>
    <div class="lo-frow">
      <${ProfFilter} m=${m} prof=${filters.prof} onProf=${(prof) => set({ prof })} />
      <label class="lo-select">
        <span class="lo-select__k">${t('盟约')}</span>
        <select value=${filters.bond || ''} onChange=${(e) => set({ bond: e.currentTarget.value || null })} aria-label=${t('按盟约筛选')}>
          <option value="">${t('全部盟约')}</option>
          ${bonds.map((b) => html`<option key=${b.bondId} value=${b.bondId}>${b.name}</option>`)}
        </select>
      </label>
      ${changed ? html`<button type="button" class=${cx('lo-toggle', filters.changedOnly && 'is-on')} aria-pressed=${filters.changedOnly ? 'true' : 'false'}
        onClick=${() => set({ changedOnly: !filters.changedOnly })}><i class="lo-toggle__box"><${Icon} name="check" /></i>${t('仅看已调整')}</button>` : null}
    </div>
  </div>`;
}

// ---- 卡片视图 (物资调配处) ------------------------------------------------------------------------------------------------
//
// The 干员调配 tab's view (see the header). DeckCard / TierMark / DeckBar are hook-free (the
// tests draw them).

/**
 * (fork) The top bar's 「详情」: a big block where 快速配置 stood (its look: the user's request of 2026-11-08 — a small
 * button went unnoticed), mint while on; a magnifier with a plus (筛选 keeps the plain one). Hook-only: its own store.
 */
/**
 * (fork) 筛选 as a block of its own beside 干员持有 (the user's call of 2026-11-08: the small chip was easy to miss): its
 * popover holds `children`; `n` the filters on. `id` the menu it opens (LoadoutScreen's `menu`).
 */
/**
 * (fork) 导出 / 导入, one above the other in the top bar's tray (the user's calls of 2026-11-09): `testid` their prefix
 * (`<testid>-export`, `<testid>-import`).
 */
function IoStack({ testid, exportOff, importOff, onExport, onImport, exportTitle, importTitle }) {
  return html`<div class="lo-tray__stack">
    <button type="button" class="lo-tray__btn" data-testid=${`${testid}-export`} disabled=${exportOff} onClick=${onExport} title=${exportTitle}><${Icon} name="download" /><span>${t('导出')}</span></button>
    <button type="button" class="lo-tray__btn" data-testid=${`${testid}-import`} disabled=${importOff} onClick=${onImport} title=${importTitle}><${Icon} name="upload" /><span>${t('导入')}</span></button>
  </div>`;
}

function FilterButton({ menu, id, n, testid, title, onMenu, children }) {
  const open = menu === id;
  return html`<div class="lo-popwrap">
    <button type="button" class=${cx('lo-filterbtn', 'lo-popbtn', (open || n) && 'is-on')} aria-expanded=${open ? 'true' : 'false'}
        data-testid=${testid} onClick=${() => onMenu(open ? null : id)} title=${title}>
      <span class="lo-filterbtn__icon"><${Icon} name="search" /></span>
      <span class="lo-filterbtn__txt"><span>${t('搜索') /* en: "Search" (the user's call of 2026-11-09) */}</span></span>
      ${n ? html`<b class="lo-filterbtn__n num">${n}</b>` : null}
    </button>
    ${open ? html`<div class="lo-pop lo-pop--filter">${children}</div>` : null}
  </div>`;
}

/**
 * (fork) The card that holds still on screen while 「详情」 unfolds or folds: the selected card when any of it is in view,
 * else the card in view nearest the view's centre (its own centre; the user's choice of 2026-11-08). `viewLeft`: where
 * the view starts on screen (after the drawer). Null without a card in view.
 * @param {Element} deck @param {string|null} selId @param {number} viewLeft
 */
export function deckAnchor(deck, selId, viewLeft) {
  const box = deck.getBoundingClientRect();
  const inView = (r) => r.width > 0 && r.right > viewLeft + 1 && r.left < box.right - 1;
  // (the 自选编队 picker's deck: its cards carry data-char, its selection .is-sel)
  const sel = selId ? deck.querySelector(`.lo-op[data-chess="${selId}"]`) : deck.querySelector('.lo-op.is-sel');
  if (sel && inView(sel.getBoundingClientRect())) return sel;
  const cx = (viewLeft + box.right) / 2, cy = (box.top + box.bottom) / 2;
  let best = null, bd = Infinity;
  for (const el of deck.querySelectorAll('.lo-op[data-chess], .lo-op[data-char]')) {
    const r = el.getBoundingClientRect();
    if (!inView(r)) continue;
    const d = Math.hypot((r.left + r.right) / 2 - cx, (r.top + r.bottom) / 2 - cy);
    if (d < bd) { best = el; bd = d; }
  }
  return best;
}

const DECK_TIERS = [1, 2, 3, 4, 5, 6];
const NO_DIY_FILTERS = Object.freeze({ query: '', prof: null, bond: null });
/** The bonds of a 自选编队 slot's operators, in the deck's own order (core first): the picker's 筛选 bond list. */
const diyPickBonds = (slotId, picks, kitted) => bondsInOrder(pickOptions(slotId, picks, diyData(), kitted).flatMap((o) => o.bonds || []));

/**
 * One operator card (screens/loadoutDeck.js DeckOpCard): tier, the normal / elite levels and 潜能 (when editable:
 * cultivationView; the pentagram, PotBadge) on the rail, the portrait, a 替补 ribbon when marked not owned, its skill / module column (DeckOpSide) and its
 * 「详情」 panel (DeckOpMore) — the stored loadout's choices (`onChange(chessId, patch)`). 潜能 and 练度 are set in the Detail
 * (the drawer).
 */
export function DeckCard({ m, chess, golden, entries, ops = {}, selected = false, onPick, onChange, notOwned = false, worn = null }) {
  const choice = effectiveChoice(entries, chess, golden);
  const opt = chessOptions(chess, golden);
  const cv = cultivationView(chess.charId, ops);
  const changed = choice.changed || cv.changed;
  const modules = [...opt.moduleOptions].sort((a, b) => Number(b.id === MODULE_NONE) - Number(a.id === MODULE_NONE));
  const onSkill = (skill) => onChange(chess.chessId, { skill });
  const onModule = (module) => onChange(chess.chessId, { module });
  return html`<${DeckOpCard} m=${m} attrs=${{ 'data-chess': chess.chessId }} tier=${chess.tier} selected=${selected}
    cls=${[changed && 'is-changed', notOwned && 'is-standin']} onPick=${() => onPick(chess.chessId)} name=${chess.name} portrait=${chess} sub=${chess}
    railTop=${html`<${TierChip} tier=${chess.tier} size="sm" class="lo-op__tier" />`}
    rail=${html`<${LevelPill} m=${m} base=${chess} golden=${golden} potential=${cv.potentialOn ? cv.potential : null} />
      ${changed ? html`<span class="lo-op__mark" title=${t('已调整')} aria-label=${t('已调整')}></span>` : null}`}
    ribbon=${notOwned ? html`<span class="lo-op__ribbon" title=${t('未持有（干员持有）：由替补干员上场')}>${t('替补')}</span>` : null}
    bonds=${chess.bonds || []}
    side=${html`<${CardSide} k=${chess.chessId}
      outfit=${() => html`<${OutfitSide} m=${m} charId=${chess.charId} name=${chess.name} list=${outfitsOf(chess.charId)} worn=${worn} />`}
      skills=${() => html`<${DeckOpSide} m=${m} testid="loadout-card-side" skills=${opt.skillOptions} skill=${choice.skill} elite=${!!golden}
        modules=${golden ? modules : null} module=${choice.module} onSkill=${onSkill} onModule=${onModule} />`} />`}
    moreTestid="loadout-card-more"
    more=${html`<${DeckOpMore} m=${m} src=${chess} golden=${golden} skills=${opt.skillOptions} skill=${choice.skill} level=${golden ? 'elite' : 'normal'}
      modules=${modules} module=${choice.module} potential=${cv.potentialOn ? cv.potential : null} onSkill=${onSkill} onModule=${onModule}
      locale=${`${getLang()}|${data.locale()}`} />`} />`;
}

/**
 * A tier group's tall marker: the official shopLevelSprite/shop_level_tag_N (it carries 'NO.', the numeral and the
 * event's own vertical line) or, without that art, the CSS marker (NO. and the Roman numeral); the group's count below.
 */
export function TierMark({ m, tier, count }) {
  return html`<${GroupMark} cls=${`tier--${tier}`} count=${count}>
    <${Img} src=${uiUrl(m, `shopLevelSprite/shop_level_tag_${tier}`)} class="lo-tmark__art"
      fallback=${html`<span class="lo-tmark__css"><span class="lo-tmark__no">NO.</span><b class="lo-tmark__n">${ROMAN[tier]}</b></span>`} />
  <//>`;
}

/**
 * The deck: one group per tier present in `list` (a tall marker, then the cards flowing in two rows), the 甄选 card closing
 * tiers 5 / 6 (not while filtering). Its drag, wheel, left-edge group and jumps are the shared deck's (`deckProps`:
 * screens/loadoutDeck.js useGroupDeck).
 */
function DeckView({ m, list, getChess, st, selId, onPick, onChange, onDiySlot, diySlots, diyLegal, deckRef, drawer, deckProps, filtered,
  selSlot = null, onSelSlot = () => {}, onQuickSlot = () => {}, onBlank = null }) {
  useDetailsSync(deckRef); // 「详情」's panels for cards drawn now (a filter, the first draw with it on)
  useNameFit(deckRef); // (fork) the names fitted to their cards (ui/nameFit.js)
  // (fork) the 时装 view: the columns show the outfits, the worn one ringed (each card's column switches on its own:
  // CardSide — the deck is not redrawn for it)
  const { wornOf } = useOutfitView();
  const groups = DECK_TIERS.map((tier) => ({ tier, items: list.filter((c) => c.tier === tier) }))
    .filter((g) => g.items.length || (!filtered && diySlots.some((s) => s.tier === g.tier)));
  if (!groups.length) return html`<div class="lo-deck lo-deck--empty" ref=${deckRef}><p class="lo-empty t-dim">${t('没有符合条件的干员')}</p></div>`;
  return html`<div class=${cx('lo-deck', drawer && 'has-drawer', detailsStore.get().on && 'is-details')} ref=${deckRef} ...${deckProps} onClick=${onBlank}
      role="list" aria-label=${t('干员列表')} data-testid="loadout-deck">
    ${groups.map((g) => html`<section key=${g.tier} class=${cx('lo-tgroup', `lo-tgroup--t${g.tier}`)} data-group=${g.tier} data-tier=${g.tier}>
      <${TierMark} m=${m} tier=${g.tier} count=${g.items.length} />
      <div class="lo-tgrid">
        ${g.items.map((c) => html`<${DeckCard} key=${c.chessId} m=${m} chess=${c} golden=${c.goldenId ? getChess(c.goldenId) : null}
          entries=${st.entries} ops=${st.ops} selected=${!selSlot && c.chessId === selId} onPick=${onPick} onChange=${onChange}
          notOwned=${(st.notOwned || []).includes(c.chessId)} worn=${wornOf(c.charId)} />`)}
        ${filtered ? null : diySlots.filter((sl) => sl.tier === g.tier).map((sl) => html`<${DiyDeckSlot} key=${sl.slotId} m=${m} slot=${sl}
          pick=${st.diy?.[sl.slotId] || null} illegal=${!!st.diy?.[sl.slotId] && !diyLegal[sl.slotId]} onOpen=${onDiySlot} ops=${st.ops}
          selected=${selSlot === sl.slotId} onSel=${onSelSlot} onQuick=${onQuickSlot} wornOf=${wornOf} />`)}
      </div>
    </section>`)}
  </div>`;
}

/**
 * The deck's bottom bar: jump to a tier (the open 自选 slots above 5 / 6; screens/loadoutDeck.js GroupBar, `sink`: lit by
 * the deck's scroll — GroupBarLive — so only the bar redraws, not the overlay and its 112 cards, PR #811 review), and — while this
 * match's loadout is locked (`locked`: the full notice, its title) — a 「本局已锁定 · 下一局生效」 chip: the bar is the one
 * strip every width keeps on screen (the top bar's note is cut short or hidden on narrow screens).
 */
export function DeckBar({ counts, active = null, sink = null, onJump, diyOpen, locked = null, tools = null }) {
  const items = DECK_TIERS.map((tier) => ({ key: String(tier), disabled: !counts[tier], title: t('{tier}阶', { tier }), attrs: { 'data-tier': tier },
    content: html`${diyOpen[tier] ? html`<span class="lo-bbar__diy" title=${t('{tier}阶 还有 {n} 个自选名额', { tier, n: diyOpen[tier] })}><${Icon} name="user" /><b class="num">${diyOpen[tier]}</b></span>` : null}
      <span class="lo-bbar__roman num">${ROMAN[tier]}</span><span>${t('{tier}阶', { tier })}</span>` }));
  const bar = { items, onJump: (key) => onJump(Number(key)), label: t('按阶级跳转') };
  return html`<nav class="lo-bbar" aria-label=${t('按阶级跳转')}>
    ${sink ? html`<${GroupBarLive} ...${bar} sink=${sink} />` : html`<${GroupBar} ...${bar} active=${active == null ? null : String(active)} />`}
    ${locked ? html`<span class="lo-bbar__lock" role="status" data-testid="loadout-deck-locked" title=${locked}><${Icon} name="info" /><span>${t('本局已锁定 · 下一局生效')}</span></span>` : null}
    ${tools ? html`<div class="lo-bbar__tools">${tools}</div>` : null}
  </nav>`;
}

// ---- screen -------------------------------------------------------------------------------------------------------------

const SYNC_TEXT = {
  idle: ['', ''], pending: [N_('保存中…'), 'is-busy'], sending: [N_('同步中…'), 'is-busy'], synced: [N_('已同步'), 'is-ok'],
  locked: [N_('本局已锁定 · 下一局生效'), 'is-warn'], error: [N_('同步失败'), 'is-bad'],
};
/** The 干员持有 tab's status line: the setting never applies to a running match. */
const OWN_SYNC_TEXT = { ...SYNC_TEXT, locked: [N_('下一局生效'), 'is-warn'] };
/** The 自选编队 tab's status line (msgids, translated where shown): out of match, like 干员持有. */
const DIY_SYNC_TEXT = { ...OWN_SYNC_TEXT };

/**
 * The game-data files a tab cannot work without — its roster and its import's sanitiser: chess.json, plus backups.json
 * for 自选编队 (its slots and the picks' forms) — that did not load. useData counts a file that never arrived (a 404, a
 * blocked request, bad JSON: status 'missing') as settled like a loaded one, so the tab drew an empty roster and an
 * import sanitised every entry away (GitHub #173). Empty while the files load and once they have.
 * @param {string} tab 'loadout' | 'ownership' | 'diy'
 * @param {(name: string) => string} [status] the data store's status (data.status)
 * @returns {string[]} data file names
 */
export function missingGameData(tab, status = data.status) {
  return (tab === 'diy' ? ['chess', 'backups'] : ['chess']).filter((name) => status(name) === 'missing');
}

/**
 * Why an import of `kind` cannot run now, as its toast — the files still loading, or the game data missing — or null.
 * Either way nothing is applied: sanitised against absent data, the 干员持有 / 自选编队 imports stored an empty list over
 * the saved one (GitHub #173).
 * @param {string} kind the dialog's tab @param {boolean} ready the screen's files are settled
 * @param {(name: string) => string} [status]
 * @returns {{ text: string, tone: 'warn'|'error' } | null}
 */
export function importRefusal(kind, ready, status = data.status) {
  if (!ready) return { text: t('干员数据仍在载入，请稍候再导入'), tone: 'warn' };
  if (missingGameData(kind, status).length) return { text: t('导入失败：游戏数据没有载入，未做任何改动。请刷新页面；仍不行时，请检查广告拦截插件和网络'), tone: 'error' };
  return null;
}

/**
 * A loadout payload that carries `ops` (including empty `ops`) replaces 潜能 / 练度. 自选 operators are in that list
 * and only backups.json names them, so the refusal is the 自选编队 one: chess.json and backups.json both loaded.
 * Null when the payload has no `ops` (an older file leaves the current 练度 alone) or that data is ready (GitHub #538).
 * @param {Record<string, any> | null | undefined} ops
 * @param {boolean} ready
 * @param {(name: string) => string} [status]
 * @returns {{ text: string, tone: 'warn'|'error' } | null}
 */
export function loadoutOpsImportRefusal(ops, ready, status = data.status) {
  if (ops == null) return null;
  return importRefusal('diy', ready, status);
}

/** In place of a tab whose game data did not load (missingGameData): which files, and what to try (GitHub #173). */
export function DataMissing({ files }) {
  const urls = files.map((name) => `/data/${DATA_FILES[name] || `${name}.json`}`);
  return html`<div class="lo-loading lo-missing" role="alert" data-testid="loadout-data-missing">
    <${Icon} name="warn" />
    <b>${t('游戏数据没有载入')}</b>
    <p>${t('{files} 没有下载成功，这一页无法显示；已保存的设置不受影响。请刷新页面；仍不行时，请检查广告拦截插件和网络。', { files: urls })}</p>
  </div>`;
}

/** The overlay screen. */
function LoadoutScreen({ st }) {
  const ready = useData('chess', 'bonds', 'assets', 'local', 'backups', 'garrisons', 'effects');
  const phase = useStore((s) => s.match?.public?.phase || null);
  const inMatch = useStore((s) => !!s.room?.inMatch);
  useEffect(() => { resetLoadoutVoice(); }, []); // (fork) a fresh visit: the first operator opened speaks (ui/loadoutVoice.js)
  // co-op briefing (INFO_CHECK, 25 s): the overlay covers the briefing's own countdown, so it shows the time left — the
  // match locks the loadout when it runs out (review fix: edits were silently only for the next match)
  const infoDeadline = useStore((s) => (s.match?.public?.phase === PHASE.INFO_CHECK ? s.match.public.deadline : 0));
  const m = data.get('assets');
  const getChess = (id) => data.lookup('chess', id);
  const getBond = (id) => data.lookup('bonds', id);
  const roster = useMemo(() => rosterOf(data.list('chess')), [ready, data.locale(), data.contentId()]); // names follow a language switch; the list follows the room's content and a version switch (§35.36, §35.23)
  const bonds = useMemo(() => bondsInOrder(roster.flatMap((c) => c.bonds || [])), [ready, roster]);
  const list = filterRoster(roster, st.filters, st.entries, getChess, getBond, st.ops, potentialEditable);
  const selId = st.sel && roster.some((c) => c.chessId === st.sel) ? st.sel : list[0]?.chessId || roster[0]?.chessId || null;
  const { base, golden } = selId ? recordsOf(selId, getChess) : { base: null, golden: null };
  const nChanged = changedCount(st.entries, getChess, st.ops, roster, potentialEditable);
  const rules = useStore((s) => s.room?.content?.rules ?? null);
  const seatReady = useStore((s) => !!s.match?.private?.ready);
  // prepLoadout 'prep': the panel stays editable in 休整期 until this seat presses 准备
  const prepOpen = phase === PHASE.PREP && ruleOption(rules, 'prepLoadout') === 'prep' && !seatReady;
  const locked = ((inMatch && phase && phase !== PHASE.INFO_CHECK && phase !== PHASE.LOBBY) && !prepOpen) || st.sync === 'locked';
  const fileRef = useRef(null);                            // hidden <input type=file> of the 导入 dialog
  // the detail's 普通 / 精锐 skill toggle: one preview for its skills, its 特质 and the rows' skill details (display only)
  const [previewLevel, setPreviewLevel] = useState('normal');
  const [statLevel, setStatLevel] = useState('elite'); // (fork) 局内数值's 普通 / 精锐, kept while the drawer closes (Detail)
  const [io, setIo] = useState(null);                      // 导出 / 导入 dialog: { mode, text } | null
  // 卡片视图: 「简洁 / 详情」, the detail drawer, the 筛选 / 更多 popovers, ⓘ, the tier at the deck's left edge
  // 「详情」 (detailsStore, no redraw here) unfolds the panels already drawn in every card; the selected card (or the one
  // nearest the view's centre) holds still
  // (fork) the switch's third choice, 'outfits': the 时装 view — compact, so 「展开」 folds (the user's call of 2026-11-09)
  const setDetails = (v) => {
    setMenu(null);
    const outfit = v === 'outfits';
    const on = v === true;
    // the deck on screen: the card view's, or the 自选编队 picker page's (its selection the anchor)
    const deckNow = () => (diySlot ? document.querySelector('.lo [data-testid="diy-deck"]') : null) || deckRef.current;
    // the cards near the view switch at once, the rest while idle (loadoutDeck.js setOutfitView)
    const showOutfits = (x) => { if (x !== outfitViewStore.get().on) { setOutfitView(x, deckNow()); savePref(OUTFIT_VIEW_PREF, x); } };
    if (on === detailsStore.get().on) { showOutfits(outfit); return; }
    // (fork) 展开 and 时装 never swap in one step: the swap redraws the deck, and a redraw while the panels slide reset its
    // open layout under them (the cards flew a screen across and snapped back — the user's report of 2026-11-09). 时装 →
    // 展开: the skill columns come back first, then the panels slide out; 展开 → 时装: the panels fold, then the outfits show
    const slide = () => {
      // the deck on screen: the card view's, or the 自选编队 picker page's (its selection the anchor)
      const pickerDeck = diySlot ? document.querySelector('.lo [data-testid="diy-deck"]') : null;
      const deck = pickerDeck || deckRef.current;
      const drawerEl = deck?.parentElement?.querySelector(':scope > .lo-drawer');
      const anchor = deck ? deckAnchor(deck, pickerDeck || selSlot ? null : selId, deck.getBoundingClientRect().left + (drawerEl?.offsetWidth || 0)) : null;
      detailsStore.set({ on });
      savePref(DETAILS_PREF, on);
      // (a later press may have changed the choice before the fold ends: only a fold still wanted shows the outfits)
      slideDetails(deck, on, anchor, outfit ? () => { if (!detailsStore.get().on) showOutfits(true); } : null);
    };
    if (on && outfitViewStore.get().on) { showOutfits(false); setTimeout(slide); return; } // after the redraw (a microtask)
    slide();
  };
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(null);                  // null | 'filter' | 'more'
  // 更多's items act after the menu folds: the focus goes back to ⋯ first, so a dialog they open (导入 / 导出, a confirm)
  // hands it back there on closing — the item itself is gone by then
  const deckRef = useRef(null);
  // drag, wheel, the tier at the left edge (the bar), jumps; (fork) a drag closes the detail drawer (the user's call of
  // 2026-11-09: whoever drags the deck is done with it)
  const deckNav = useGroupDeck(deckRef, { onDragStart: () => setDrawer(false) });
  const ui = useRef({});
  ui.current = { drawer, menu, setDrawer, setMenu };
  const diySlots = ready ? diySlotList(diyData()) : [];
  const [detailView, setDetailView] = useState('loadout'); // (fork, docs/OUTFITS.md) the detail's 调配 / 时装 switch
const outfitsNow = useStore((s) => s.outfits, Object.is, outfitStore); // (fork) the rows' and the header's art follow the outfit choice
  useData('outfits');

  // (fork) 干员调配 and 干员持有: 自选编队 has no tab of its own (its slots are cards in the deck); an old 'diy' is the deck
  const tab = st.tab === 'ownership' ? 'ownership' : 'loadout';
  // leaving 干员调配 (干员持有, or openLoadout naming a tab) closes the card view's layers: hidden, they
  // used to swallow the first Esc there and came back stale on return (PR #811 review)
  // (fork) the 自选编队 slot whose picker is open over the deck (the card view has no 自选编队 overview: a slot card opens
  // its picker in place, and closing it leaves the deck where it was)
  const [diySlot, setDiySlotPicking] = useState(null);
  // (fork) a filled 自选编队 slot selected as a card (the user's call of 2026-11-08: a custom operator acts as any other —
  // the drawer shows its detail, screens/diy.js DiyDetail, and its 更换 button opens the slot's picker); its own 普通 /
  // 精锐 preview, the elite first (a 自选 operator is fielded elite)
  const [selSlot, setSelSlot] = useState(null);
  const [slotLevel, setSlotLevel] = useState('elite');
  // (fork) the slot's picker is a page of its own in place of the deck (the user's call of 2026-11-08: a layer over the
  // live deck kept both decks drawn and lagged); the deck comes back where it was, without its opening 转场
  const deckScroll = useRef(null);
  const [cameBack, setCameBack] = useState(false);
  // the picker page's own 筛选 (its top bar): search, class, bond — the deck's filters without the tier row or 仅看已调整
  const [diyFilters, setDiyFilters] = useState(NO_DIY_FILTERS);
  const openDiyPicker = (id) => {
    deckScroll.current = deckRef.current?.scrollLeft ?? null;
    setDrawer(false); setMenu(null); setCameBack(true); setDiyFilters(NO_DIY_FILTERS); setDiySlotPicking(id);
  };
  const closeDiyPicker = () => { setMenu(null); setDiySlotPicking(null); };
  useLayoutEffect(() => {
    if (diySlot || deckScroll.current == null || !deckRef.current) return;
    deckRef.current.scrollLeft = deckScroll.current;
    deckScroll.current = null;
  }, [diySlot]);
  useEffect(() => { if (tab !== 'loadout') { setDrawer(false); setMenu(null); setDiySlotPicking(null); } }, [tab]);
  const lost = ready ? missingGameData(tab) : [];
  const ownRoster = useOwnershipRoster(ready);
  const nNotOwned = notOwnedCount(st.notOwned, ownRoster);
  // 自选编队 (0.2.0 DIY): the stored picks, those the server would keep (the kit list of the last welcome)
  const nDiy = diyCount(st.diy);
  const diyLegal = ready ? sanitizeDiyPicks(st.diy, diyData(), st.diyKitted || []) : {};
  const setDiySlot = (slotId, pick) => setDiyPicks(setPick(loadoutStore.get().diy, slotId, pick));
  // a filled slot's card: selected as any card (a pick this version cannot field opens its picker instead); its quick
  // choices and its detail write the saved pick
  // (fork) a press away from the operator in the drawer — another card's skill or module, the deck's empty space, a
  // drag, opening 搜索 (its results start at the deck's left, under the drawer, a pure overlay) — closes the drawer; a
  // quick choice still applies. Another card's portrait opens that operator at once (the
  // user's calls of 2026-11-09)
  const isOpenOn = (chessId, slotId = null) => drawer && (slotId ? selSlot === slotId : !selSlot && loadoutStore.get().sel === chessId);
  const selectSlot = (slotId) => {
    const p = loadoutStore.get().diy?.[slotId];
    if (!p || !diyLegal[slotId]) { openDiyPicker(slotId); return; }
    if (drawer && selSlot === slotId) { setDrawer(false); return; }
    setSelSlot(slotId);
    setDrawer(true);
    speakSelect(diyData().backups?.units?.[p.charId] || { charId: p.charId });
  };
  const quickSlot = (slotId, patch) => {
    const p = loadoutStore.get().diy?.[slotId];
    if (p) { setDiySlot(slotId, { ...p, ...patch }); touchOperator(p, patch); }
    if (drawer && !isOpenOn(null, slotId)) setDrawer(false);
  };
  const setTab = (t) => loadoutStore.set({ tab: t });
  const toggleOwned = (id, owned) => setNotOwned(setOwned(st.notOwned, id, owned), { base: st.notOwned });
  const ownAll = async () => {
    if (!nNotOwned) return;
    const ok = await confirmDialog({ title: t('全部持有'), text: t('将 {nNotOwned} 名未持有的干员恢复为持有（由本人上场）？', { nNotOwned }), okText: t('全部持有') });
    if (ok) setNotOwned([]);
  };
  // the cards: a card opens the drawer, the open card again closes it
  const pick = (id) => {
    if (drawer && !selSlot && loadoutStore.get().sel === id) { setDrawer(false); return; }
    setSelSlot(null);
    loadoutStore.set({ sel: id });
    setDrawer(true);
    speakSelect(getChess(id)); // 选中干员, once per visit (ui/loadoutVoice.js; the user's calls of 2026-11-08 / -09)
  };
  // a card's quick choice (PR #301's): the same setChoice / setEntries path
  // (the edit is made on the view this render drew, with this render's records: written back through that view's map —
  // a click that lands while another version's data replaces it is re-based, never filed under another operator,
  // DESIGN §35.23)
  const quickChange = (id, patch, select = true) => {
    const recs = recordsOf(id, getChess);
    setEntries(setChoice(st.entries, recs.base, recs.golden, patch), { base: st.entries });
    touchOperator(recs.base, patch); // a skill / module pick speaks as an open, once per visit (ui/loadoutVoice.js)
    if (select) loadoutStore.set({ sel: id });
  };
  // (fork) a card's own skill / module choice changes only that choice: the selection and the drawer stay as they were
  const deckChange = (id, patch) => { quickChange(id, patch, false); if (drawer && !isOpenOn(id)) setDrawer(false); };
  // the deck's empty space (not a card, nor a slot)
  const deckBlank = (e) => { if (drawer && !e.target?.closest?.('.lo-op')) setDrawer(false); };
  const change = (patch) => { if (base) { setEntries(setChoice(st.entries, base, golden, patch), { base: st.entries }); touchOperator(base, patch); } };
  // 0.2.2: an operator's 潜能 / 练度 (by charId: its normal, elite and 自选 forms share them)
  const setOpsOf = (charId, patch) => { setOpsMap(setOps(loadoutStore.get().ops, charId, patch)); touchOperator({ charId }); };
  const resetOne = () => {
    if (!base) return;
    setOpsMap(resetOps(loadoutStore.get().ops, base.charId));
    setEntries(resetChoice(st.entries, base.chessId), { base: st.entries });
  };
  const resetAll = async () => {
    if (!nChanged) return;
    const ok = await confirmDialog({ title: t('全部恢复默认'), text: t('将 {nChanged} 名干员的技能、模组、潜能与练度恢复为默认配置？', { nChanged }), okText: t('恢复默认'), danger: true });
    if (!ok) return;
    // the roster's operators only: a 自选 pick's settings belong to the 自选编队 tab
    const rosterChars = new Set(roster.map((c) => c.charId));
    const keep = {};
    for (const [id, e] of Object.entries(loadoutStore.get().ops || {})) if (!rosterChars.has(id)) keep[id] = e;
    setOpsMap(keep);
    setEntries({});
  };

  // (fork) 导出 / 导入 (ui/backupModel.js; the user's call of 2026-11-09): one dialog for the four settings this browser keeps.
  // `io`: { mode: 'export', parts } — the parts ticked (one: that page's own file; more: one file of them all); or
  // { mode: 'import', text, skip } — the text read, and the parts found in it the player unticked
  const backupCounts = { loadout: nChanged, ownership: nNotOwned, diy: nDiy, outfits: Object.keys(outfitsNow || {}).length };
  const PART_LABEL = { loadout: N_('干员调配'), ownership: N_('干员持有'), diy: N_('自选编队'), outfits: N_('时装') };
  // the dialog's own msgids — en: 导出：调配、持有、自选编队、时装 "Export: loadout, roster, Custom Squad, outfits", 导入：任一
  // 页面导出的文件，包括旧版本 "Import: a file any page exported, older versions too", 全部恢复默认 / 清空自选编队 "Reset all to
  // default / clear the Custom Squad", 导出数据 "Export Data", 导入数据
  // "Import Data", 勾选要导出的内容… "Tick what to export. With one item ticked, the file is that page's own export.",
  // 粘贴导出的内容… "Paste an export, or press Choose File. A file from any page works, older versions included, as does a
  // file with several items.", 没有勾选任何内容 "Nothing ticked", 在此粘贴导出的内容… "Paste the exported text here…",
  // 这份文件包含以下内容… "This file holds the items below. Importing replaces the current settings of the ticked ones:"
  const openExport = (parts = BACKUP_PARTS.filter((p) => backupCounts[p] || (p === 'loadout' && Object.keys(st.ops || {}).length))) =>
    setIo({ mode: 'export', parts });
  const openImport = () => setIo({ mode: 'import', text: '', skip: [] });
  const backupSrc = () => {
    const s0 = loadoutStore.get();
    return { byChar: s0.byChar || {}, ops: s0.ops || {}, notOwnedChars: s0.notOwnedChars || [], diy: s0.diy || {}, diyVersion: s0.diyVersion ?? null, outfits: outfitsNow || {} };
  };
  const ioText = !io ? '' : io.mode === 'export' ? serializeBackup(backupSrc(), io.parts) ?? '' : io.text ?? '';
  const ioRead = io?.mode === 'import' && ioText.trim() ? readBackup(ioText) : null;
  const ioChosen = ioRead?.ok ? BACKUP_PARTS.filter((p) => ioRead.parts[p] && !io.skip.includes(p)) : [];
  const ioCopy = async () => {
    const ok = await copyText(ioText);
    toast(ok ? t('已复制到剪贴板') : t('复制失败，请在文本框中手动全选复制'), ok ? 'success' : 'warn');
  };
  const ioDownload = () => downloadText(exportFilename(new Date(), backupFileKind(io.parts)), ioText);
  const ioPick = () => fileRef.current?.click();
  const ioFile = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = ''; // picking the same file twice must fire again
    if (!f) return;
    // refuse a huge pick before reading it into memory (a real payload is a few KB)
    if (f.size > BACKUP_IMPORT_MAX_BYTES) { toast(t('文件过大，请选择「导出」下载的文件'), 'error'); return; } // en: "The file is too large: choose a file that Export downloaded"
    try { setIo({ ...io, mode: 'import', text: await readFileText(f), skip: [] }); } catch { toast(t('读取文件失败'), 'error'); }
  };
  // each part as its own page's import applies it (sanitised against the data on screen); a result to toast, `stop` when
  // nothing was changed
  const applyPart = {
    loadout: (res) => {
      // ops replaces 潜能 / 练度, including 自选 operators that only backups.json names. Missing data used to drop
      // them and still save, clearing a 练度 the file did not mean to erase (GitHub #538).
      const opsRefused = loadoutOpsImportRefusal(res.ops, ready);
      if (opsRefused) return opsRefused;
      // 0.2.2: a payload with `ops` replaces the 潜能 / 练度 too (an older export leaves them alone)
      const opIds = res.ops ? cultivationCharIds(data.get('chess'), data.get('backups')) : null;
      // (v2 by operator, v1 by 第二期下半's chess ids: as entries of the data on screen — DESIGN §35.23)
      const r = applyLoadoutEntries(importedEntries(res), getChess, res.ops ? { ops: res.ops, isOperator: (id) => opIds.has(id) } : {});
      const { applied, dropped } = r;
      const nOps = r.ops ?? 0;
      // nothing survived sanitising (unknown chess, or every choice already the default): keep the current loadout
      if (!applied && !nOps) return { text: t('导入失败：这份数据在当前版本没有可用的调配，未做任何改动'), tone: 'error' };
      return { text: !applied ? t('已导入 {n} 名干员的潜能与练度', { n: nOps })
        : dropped ? t('已导入 {applied} 名干员（另有 {dropped} 项未导入）', { applied, dropped })
          : t('已导入 {applied} 名干员的调配', { applied }), tone: dropped ? 'warn' : 'success', ok: true };
    },
    ownership: (r) => {
      const { applied, dropped } = applyOwnershipImport(importedNotOwned(r), getChess);
      return { text: applied ? (dropped ? t('已导入：{applied} 名干员未持有（另有 {dropped} 项无效，未导入）', { applied, dropped }) : t('已导入：{applied} 名干员未持有', { applied }))
        : t('已导入：全部持有'), tone: dropped ? 'warn' : 'success', ok: true };
    },
    diy: (r) => {
      const { applied, dropped } = applyDiyImport(r.picks, diyData(), loadoutStore.get().diyKitted || []);
      return { text: applied ? t('已导入 {n} 个自选名额', { n: applied }) + (dropped ? t('（另有 {n} 项不可用，未导入）', { n: dropped }) : '') : t('已导入：全部名额为空'),
        tone: dropped ? 'warn' : 'success', ok: true };
    },
    outfits: (r) => {
      if (!data.get('outfits')) return { text: t('时装数据仍在载入，请稍候再导入'), tone: 'warn' }; // en: "Outfit data is still loading: try the import again in a moment"
      const { applied, dropped } = applyOutfitsImport(r.outfits, r.asked);
      return { text: applied ? t('已导入 {n} 名干员的时装', { n: applied }) + (dropped ? t('（另有 {n} 项不可用，未导入）', { n: dropped }) : '')
        : t('已导入：全部干员使用默认外观'), tone: dropped ? 'warn' : 'success', ok: true };
    },
  };
  const ioApply = () => {
    if (!ioRead?.ok || !ioChosen.length) return;
    // an import before chess.json is loaded, or when it never arrived, would sanitise every entry away — refuse instead
    // of wiping the loadout
    for (const p of ioChosen) {
      if (p === 'outfits') continue;
      const refused = importRefusal(p, ready);
      if (refused) { toast(refused.text, refused.tone); return; }
    }
    let any = false;
    for (const p of ioChosen) {
      const r = applyPart[p](ioRead.parts[p]);
      toast(`${t(PART_LABEL[p])} · ${r.text}`, r.tone);
      any = any || !!r.ok;
    }
    if (any) setIo(null);
  };

  // Esc closes; ←/→ browse the filtered roster (not while typing in the search field)
  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal')) return; // a confirm dialog handles its own keys
      if (e.key === 'Escape' && document.querySelector('.diy-pick')) return; // the 自选 picker's Esc closes only the picker (diy.js)
      const typing = e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation();
        // the card view peels back one layer at a time on its tab: a popover, the drawer, then the overlay
        // (on 干员持有 none of them is drawn, so the first Esc closes the overlay)
        const u = ui.current;
        const onDeckTab = loadoutStore.get().tab !== 'ownership';
        if (onDeckTab && u.menu) { u.setMenu(null); return; }
        if (onDeckTab && u.drawer) { u.setDrawer(false); return; }
        backFromLoadout(); return;
      }
      if (typing) return;
      // (a row's quick choices: ←/→ stay with the focused group, PR #301)
      if (e.target?.closest?.('.lo-quick') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) return;
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && loadoutStore.get().tab !== 'ownership') {
        const ids = filterRoster(rosterOf(data.list('chess')), loadoutStore.get().filters, loadoutStore.get().entries, getChess, getBond, loadoutStore.get().ops, potentialEditable).map((c) => c.chessId);
        if (!ids.length) return;
        const cur = Math.max(0, ids.indexOf(loadoutStore.get().sel));
        const next = ids[(cur + (e.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length];
        loadoutStore.set({ sel: next });
        e.preventDefault();
      }
      // swallow single-key game shortcuts (R / F / D / Space …) while the overlay is open
      if (e.key.length === 1 || e.key === ' ') { e.stopImmediatePropagation(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  // openLoadout's `reveal` (an operator of the S.W.E.E.P.报告): once the roster is there, clear the filters that hide it
  // and open its detail as a pick would (the card view's drawer)
  const [revealed, setRevealed] = useState(0);
  const centerNext = useRef(false);                        // the revealed row comes to the middle, later picks to the nearest edge
  useEffect(() => {
    const id = st.reveal;
    if (!id || !ready || !roster.length) return;
    loadoutStore.set({ reveal: null });
    if (!roster.some((c) => c.chessId === id)) return;
    if (!list.some((c) => c.chessId === id)) clearFilters();
    setDrawer(true);
    centerNext.current = true;
    setRevealed((n) => n + 1);
  }, [st.reveal, ready, roster]);
  // keep the selected card in view (the deck scrolls sideways)
  useEffect(() => {
    const el = deckRef.current?.querySelector(`[data-chess="${selId}"]`);
    if (!el || typeof el.scrollIntoView !== 'function' || !el.getClientRects().length) return;
    el.scrollIntoView({ block: centerNext.current ? 'center' : 'nearest', inline: 'nearest' });
    centerNext.current = false;
  }, [selId, revealed]);
  // the drawer: the deck makes room on its left and nothing jumps; the selected card comes into view beside it
  const slotSel = selSlot && st.diy?.[selSlot] ? diySlots.find((sl) => sl.slotId === selSlot) || null : null;
  const slotDetail = slotSel ? DiyDetail({ m, slot: slotSel, pick: st.diy[selSlot], ops: st.ops, onOps: setOpsOf, level: slotLevel,
    onLevel: setSlotLevel, view: detailView, onView: setDetailView, onPick: (patch) => quickSlot(selSlot, patch) }) : null;
  const drawerOn = drawer && !!(slotDetail || base);
  // a popover closes on a press outside it — not on the version vote floating over this screen (ui/versionVote.js
  // CoveredVersionVote): it gives the focus back to where it was (the popover's search field, say) when it goes
  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (e) => { if (!e.target?.closest?.('.lo-pop, .lo-popbtn, .vervote--covered')) setMenu(null); };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menu]);
  const nFilters = ['tier', 'prof', 'bond', 'changedOnly'].filter((k) => !!st.filters?.[k]).length + (String(st.filters?.query || '').trim() ? 1 : 0);
  const tierCounts = Object.fromEntries(DECK_TIERS.map((tier) => [tier, list.filter((c) => c.tier === tier).length + (nFilters ? 0 : diySlots.filter((s) => s.tier === tier).length)]));
  const diyOpen = Object.fromEntries(DECK_TIERS.map((tier) => [tier, diySlots.filter((s) => s.tier === tier && !diyLegal[s.slotId]).length]));
  const clearFilters = () => loadoutStore.set({ filters: { ...st.filters, tier: null, prof: null, bond: null, query: '', changedOnly: false } });

  const [syncText, syncCls] = tab === 'ownership' ? OWN_SYNC_TEXT[st.ownSync] || OWN_SYNC_TEXT.idle : SYNC_TEXT[st.sync] || SYNC_TEXT.idle;
  // the 自选编队 picker page's chip: the server's copy of the slots
  const [diySyncText, diySyncCls] = DIY_SYNC_TEXT[st.diySync] || DIY_SYNC_TEXT.idle;
  const fromText = st.from === 'briefing' ? t('确认本局信息阶段结束前可调整本局配置') : t('开始模拟前可调整干员携带的技能与模组，以及潜能与练度；干员的局内等级不可调整');
  // 干员持有 is out of match: a running match keeps the list its seat had at its start
  const ownLocked = inMatch && !!phase && phase !== PHASE.LOBBY;
  const ownText = ownLocked ? t('干员持有是局外设置：本局按开局时的设置进行，修改将在下一局生效')
    : t('局外设置，下一局生效 · 联机时只影响你自己的棋子 · 默认全部持有');

  const lockedText = t('本局的调配已锁定（确认本局信息后无法修改），修改将在下一局生效');
  // the card view's top-bar note (cut short on narrow screens: its title holds it whole). A locked loadout is said once
  // in the card view: the bottom bar's chip, which every width keeps on screen — not again in this note, the
  // sync chip beside it or the drawer's detail (§35.18's leftover: three times on a wide screen)
  const deckNote = locked ? null : fromText;
  const filterTitle = t('搜索干员'); // en: "Search Operators"
  const diyPickSlot = diySlot ? diySlots.find((sl) => sl.slotId === diySlot) || null : null;
  const picking = tab === 'loadout' && !!diyPickSlot;
  // the picker page's 筛选: its operators' bonds; the count of filters on
  const nDiyFilters = ['prof', 'bond'].filter((k) => !!diyFilters[k]).length + (String(diyFilters.query || '').trim() ? 1 : 0);
  const diyBonds = picking ? diyPickBonds(diyPickSlot.slotId, st.diy || {}, st.diyKitted) : [];
  const loadoutDetail = html`<${Detail} m=${m} chess=${base} golden=${golden} entries=${st.entries} ops=${st.ops} onChange=${change} onOps=${setOpsOf} onReset=${resetOne}
    level=${golden ? previewLevel : 'normal'} onLevel=${setPreviewLevel} statLevel=${statLevel} onStatLevel=${setStatLevel}
    notOwned=${!!base && (st.notOwned || []).includes(base.chessId)} view=${detailView} onView=${setDetailView} />`;

  // 返回 when openLoadout came with onBack (the S.W.E.E.P.报告): '返回{name}' — en: "Back to {name}";
  // '返回{name} (Esc)' — en: "Back to {name} (Esc)"
  return html`<${Fragment}>
  <div class=${cx('lo', 'lo--deck', cameBack && 'lo--back')} role="dialog" aria-modal="true" aria-label=${t('干员调配')}>
    <div class="lo__bg" aria-hidden="true"></div>
    <header class="lo-top lo-top--deck">
      <div class="lo-top__left">
        ${tab !== 'loadout' || picking
          ? html`<${Button} variant="ghost" size="md" icon="chevronLeft" class="lo-back" onClick=${() => (picking ? closeDiyPicker() : setTab('loadout'))} title=${t('返回干员调配')}>${t('干员调配')}<//>`
          : html`<${Button} variant="ghost" size="md" icon="chevronLeft" class="lo-back" onClick=${backFromLoadout} data-return=${st.backLabel ? 'true' : null}
              aria-label=${st.backLabel ? t('返回{name}', { name: t(st.backLabel) }) : t('返回')}
              title=${st.backLabel ? t('返回{name} (Esc)', { name: t(st.backLabel) }) : t('返回 (Esc)')}>${t('返回')}<//>`}
      </div>
      <div class="lo-top__center">
        ${tab === 'loadout' && !picking ? html`<${MicroLabel} tone="mint">OPERATOR LOADOUT<//>
          ${deckNote ? html`<p class="lo-top__note" title=${deckNote}>${deckNote}</p>` : null}`
        : html`<${MicroLabel} tone="mint">${tab === 'ownership' ? 'OPERATOR ROSTER' : 'SELF-SELECT SQUAD'}<//>
          <h2 class="lo-top__title">${tab === 'ownership' ? t('干员持有') : picking ? t('{tier}阶 自选', { tier: diyPickSlot.tier }) : t('自选编队')}</h2>`}
      </div>
      ${tab === 'ownership' ? html`<div class="lo-top__right">
        ${syncText ? html`<span class=${cx('lo-sync', syncCls)} role="status" data-testid="ownership-sync">${t(syncText)}</span>` : null}
        <span class="lo-count">${t('未持有')} <b class="num">${nNotOwned}</b><span class="num t-dim">/${ownRoster.length}</span></span>
        <div class="lo-tray">
          <${IoStack} testid="ownership" exportOff=${!nNotOwned} importOff=${!ready} onExport=${() => openExport(['ownership'])} onImport=${() => openImport()}
            exportTitle=${t('导出干员持有（可复制或下载）')} importTitle=${t('导入干员持有（粘贴或选择文件）')} />
          <button type="button" class="lo-tray__btn" data-testid="ownership-reset" disabled=${!nNotOwned} onClick=${ownAll}><${Icon} name="refresh" /><span>${t('全部持有')}</span></button>
        </div>
      </div>` : picking ? html`<div class="lo-top__right">
        ${inMatch && hasDeadline(infoDeadline) ? html`<${Countdown} deadline=${infoDeadline} size="sm" gauge=${false} label=${t('调配截止')} class="lo-deadline" />` : null}
        ${diySyncText ? html`<span class=${cx('lo-sync', diySyncCls)} role="status" data-testid="diy-sync">${t(diySyncText)}</span>` : null}
        <div class="lo-tray">
          <${FilterButton} menu=${menu} id="diyfilter" n=${nDiyFilters} testid="diy-filter" title=${filterTitle} onMenu=${setMenu}>
            <${Filters} m=${m} filters=${diyFilters} bonds=${diyBonds} tiers=${false} changed=${false} onFilters=${setDiyFilters} />
            ${nDiyFilters ? html`<div class="lo-pop__row"><button type="button" class="lo-tbtn" onClick=${() => setDiyFilters(NO_DIY_FILTERS)}>${t('清除筛选')}</button></div>` : null}
          <//>
        </div>
      </div>` : html`<div class="lo-top__right">
        ${inMatch && hasDeadline(infoDeadline) ? html`<${Countdown} deadline=${infoDeadline} size="sm" gauge=${false} label=${t('调配截止')} class="lo-deadline" />` : null}
        ${syncText && st.sync !== 'locked' ? html`<span class=${cx('lo-sync', syncCls)} role="status">${t(syncText)}</span>` : null}
          <span class="lo-count">${t('已调整')} <b class="num">${nChanged}</b><span class="num t-dim">/${roster.length}</span></span>
          ${/* (fork) 导出 / 导入 one above the other, left of 搜索, and 全部恢复默认 a button of its own (the user's calls of
               2026-11-09: no ⋯ menu, no 清空自选编队 — a slot's picker clears its own slot) */ null}
          <div class="lo-tray">
            <${IoStack} testid="loadout" exportOff=${!BACKUP_PARTS.some((p) => backupCounts[p]) && !Object.keys(st.ops || {}).length} importOff=${!ready}
              onExport=${() => { setMenu(null); openExport(); }} onImport=${() => { setMenu(null); openImport(); }}
              exportTitle=${t('导出：调配、持有、自选编队、时装')} importTitle=${t('导入：任一页面导出的文件，包括旧版本')} />
            <${FilterButton} menu=${menu} id="filter" n=${nFilters} testid="loadout-filter" title=${filterTitle}
              onMenu=${(v) => { if (v) setDrawer(false); setMenu(v); }}>
              <${Filters} m=${m} filters=${st.filters} bonds=${bonds} onFilters=${(filters) => loadoutStore.set({ filters })} />
              ${nFilters ? html`<div class="lo-pop__row"><button type="button" class="lo-tbtn" onClick=${clearFilters}>${t('清除筛选')}</button></div>` : null}
            <//>
            <button type="button" class="lo-tray__btn lo-resetbtn" data-testid="loadout-reset" disabled=${!nChanged} onClick=${() => { setMenu(null); resetAll(); }}
              title=${t('全部恢复默认')} aria-label=${t('全部恢复默认')}><${Icon} name="refresh" /><span>${t('重置') /* en: "Reset" — short, it is no main control (the user's call of 2026-11-09); the title says what it resets */}</span></button>
          </div>
      </div>`}
    </header>
    ${tab === 'ownership'
      ? html`<p class=${cx('lo-note', ownLocked && 'is-locked')}><${Icon} name="info" />${ownText}</p>` : null}
    ${!ready ? html`<div class="lo-loading"><${Spinner} size="sm" />${t('正在载入干员数据（打开页面后仅载入一次）…')}</div>`
      : lost.length ? html`<${DataMissing} files=${lost} />`
      : tab === 'ownership'
      ? html`<${OwnershipPanel} m=${m} roster=${ownRoster} notOwned=${st.notOwned} onToggle=${toggleOwned} />`
      : picking ? html`<main class="lo-deckwrap">
        <${DiyPicker} m=${m} slot=${diyPickSlot} picks=${st.diy || {}} kitted=${st.diyKitted} ops=${st.ops} onOps=${setOpsOf} filters=${diyFilters}
          onDetails=${setDetails} detailsOff=${!ready || !!lost.length}
          onClose=${closeDiyPicker} onDone=${(p) => { setDiySlot(diyPickSlot.slotId, p); closeDiyPicker(); }}
          onClear=${() => { setDiySlot(diyPickSlot.slotId, null); closeDiyPicker(); }} />
      </main>`
      : html`<main class="lo-deckwrap">
        <${DeckView} m=${m} list=${list} getChess=${getChess} st=${st} selId=${selId} onPick=${pick} onChange=${deckChange}
          onDiySlot=${openDiyPicker} diySlots=${diySlots} diyLegal=${diyLegal} deckRef=${deckRef} drawer=${drawerOn} deckProps=${deckNav.deckProps} filtered=${nFilters > 0}
          selSlot=${slotDetail ? selSlot : null} onSelSlot=${selectSlot} onQuickSlot=${quickSlot} onBlank=${deckBlank} />
        ${drawerOn ? html`<${DeckDrawer} testid="loadout-drawer" onClose=${() => setDrawer(false)}>${slotDetail || loadoutDetail}<//>` : null}
      </main>
      <${DeckBar} sink=${deckNav.sink} counts=${tierCounts} onJump=${deckNav.jump} diyOpen=${diyOpen}
        locked=${locked ? lockedText : null} tools=${html`<button type="button" class="lo-ownbtn" data-testid="loadout-ownership"
            onClick=${() => { setMenu(null); setTab('ownership'); }} title=${t('标记未持有的干员：由官方指定的替补干员上场')}>
            <${Icon} name="users" /><span class="lo-ownbtn__k">${t('干员持有')}</span>
            <b class="lo-ownbtn__v">${nNotOwned ? t('未持有 {n}', { n: nNotOwned }) : t('全部持有')}</b></button>
          <${DetailsToggle} disabled=${!ready || !!lost.length} onSet=${setDetails} outfits />`} />`}
  </div>
  ${io ? html`<${Modal} open=${true} onClose=${() => setIo(null)} title=${io.mode === 'export' ? t('导出数据') : t('导入数据')}
      micro=${io.mode === 'export' ? 'EXPORT' : 'IMPORT'}
      actions=${io.mode === 'export'
        ? html`<${Button} variant="ghost" onClick=${() => setIo(null)}>${t('关闭')}<//>
            <${Button} variant="secondary" icon="copy" data-testid="loadout-io-copy" disabled=${!ioText} onClick=${ioCopy}>${t('复制')}<//>
            <${Button} variant="primary" data-testid="loadout-io-download" disabled=${!ioText} onClick=${ioDownload}>${t('下载文件')}<//>`
        : html`<${Button} variant="ghost" onClick=${() => setIo(null)}>${t('取消')}<//>
            <${Button} variant="secondary" data-testid="loadout-io-pick" onClick=${ioPick}>${t('选择文件')}<//>
            <${Button} variant="primary" icon="check" data-testid="loadout-io-apply" disabled=${!ioChosen.length || !ready} onClick=${ioApply}>${t('导入')}<//>`}>
      ${io.mode === 'export' ? html`
        <p class="lo-io__hint">${t('勾选要导出的内容。只勾选一项时，文件与该页面自己导出的格式相同。')}</p>
        <div class="lo-io__parts" role="group" aria-label=${t('导出数据')}>
          ${BACKUP_PARTS.map((p) => html`<label key=${p} class=${cx('lo-io__part', !backupCounts[p] && p !== 'loadout' && 'is-empty', io.parts.includes(p) && 'is-on')} data-part=${p}>
            <input type="checkbox" checked=${io.parts.includes(p)} data-testid=${`loadout-io-part-${p}`}
              onChange=${(e) => setIo({ ...io, parts: e.currentTarget.checked ? [...io.parts, p] : io.parts.filter((x) => x !== p) })} />
            <span>${t(PART_LABEL[p])}</span><b class="num">${backupCounts[p]}</b></label>`)}
        </div>`
      : html`
        <p class="lo-io__hint">${t('粘贴导出的内容，或点「选择文件」。任一页面导出的文件都能读取，包括旧版本的，以及一次导出多项内容的文件。')}</p>`}
      <textarea class="lo-io__text" data-testid="loadout-io-text" spellcheck=${false} readOnly=${io.mode === 'export'} value=${ioText}
        placeholder=${io.mode === 'export' ? t('没有勾选任何内容') : t('在此粘贴导出的内容…')}
        onInput=${(e) => setIo({ ...io, text: e.currentTarget.value, skip: [] })}></textarea>
      ${io.mode === 'import' && ioRead ? (ioRead.ok ? html`<div class="lo-io__found" data-testid="loadout-io-found">
          <p class="lo-io__hint">${t('这份文件包含以下内容，导入会覆盖勾选项当前的设置：')}</p>
          <div class="lo-io__parts" role="group" aria-label=${t('导入数据')}>
            ${BACKUP_PARTS.filter((p) => ioRead.parts[p] || ioRead.failed[p]).map((p) => html`<label key=${p} class=${cx('lo-io__part', ioRead.failed[p] && 'is-bad', !!ioRead.parts[p] && !io.skip.includes(p) && 'is-on')} data-part=${p}>
              <input type="checkbox" disabled=${!ioRead.parts[p]} checked=${!!ioRead.parts[p] && !io.skip.includes(p)} data-testid=${`loadout-io-part-${p}`}
                onChange=${(e) => setIo({ ...io, skip: e.currentTarget.checked ? io.skip.filter((x) => x !== p) : [...io.skip, p] })} />
              <span>${t(PART_LABEL[p])}</span>
              ${ioRead.failed[p] ? html`<small>${t(ioRead.failed[p].error, ioRead.failed[p].params)}</small>` : null}</label>`)}
          </div></div>`
        : html`<p class="lo-io__bad" role="alert" data-testid="loadout-io-error">${t('导入失败：{error}', { error: t(ioRead.error, ioRead.params) })}</p>`) : null}
      <input type="file" accept=".json,application/json,text/plain" class="lo-io__file" ref=${fileRef} onChange=${ioFile} />
    <//>` : null}
<//>`;
}

/**
 * Whether the overlay must close because its context moved on: opened from the briefing and the match left INFO_CHECK
 * (the strategy draft needs the player), or opened from the lobby / room and a match started (its briefing takes over).
 * @param {{ open: boolean, from: string|null }} st @param {string|null} phase @param {boolean} inMatch @param {boolean} wasInMatch
 * @param {boolean} [ready] this seat has pressed 准备 (closes a panel opened from prep)
 */
export function shouldAutoClose(st, phase, inMatch, wasInMatch, ready = false) {
  if (!st || !st.open) return false;
  if (st.from === 'briefing') return !!phase && phase !== PHASE.INFO_CHECK;
  if (st.from === 'prep') return phase !== PHASE.PREP || !!ready;
  return inMatch && !wasInMatch;
}

/** Mounted once (main.js): renders the overlay while open. */
export function LoadoutHost() {
  const st = useStore((s) => s, Object.is, loadoutStore);
  const phase = useStore((s) => s.match?.public?.phase || null);
  const inMatch = useStore((s) => !!s.room?.inMatch);
  const ready = useStore((s) => !!s.match?.private?.ready);
  const wasInMatch = useRef(inMatch);
  useEffect(() => {
    if (shouldAutoClose(st, phase, inMatch, wasInMatch.current, ready)) closeLoadout();
    wasInMatch.current = inMatch;
  }, [phase, inMatch, st.open, ready]);
  useEffect(() => {
    if (st.open) document.documentElement.classList.add('sp-loadout-open');
    else document.documentElement.classList.remove('sp-loadout-open');
  }, [st.open]);
  if (!st.open) return null;
  return html`<${LoadoutScreen} st=${st} />`;
}

/**
 * The entry button's badge: the same number as the screen's 已调整 N (a stored entry of a chess the data no longer offers
 * never applies) once chess.json is loaded; before that the stored entries (the badge alone must not trigger the 1.6 MB
 * download). Review fix: it counted stale entries the screen does not. With `ops` (0.2.2) the operators whose 潜能 / 练度
 * differ count too (before chess.json: the stored entries plus the stored settings, an operator possibly twice).
 * @param {Record<string, any>} entries @param {((id: string) => any) | null} getChess null while chess.json is not loaded
 * @param {Record<string, any>|null} [ops] @param {any[]|null} [roster] rosterOf(…) of the loaded data
 */
export function badgeCount(entries, getChess, ops = null, roster = null) {
  return getChess ? changedCount(entries, getChess, ops, roster, potentialEditable) : Object.keys(entries || {}).length + Object.keys(ops || {}).length;
}

/**
 * Entry button (lobby / room / briefing).
 * @param {{ from: 'lobby'|'room'|'briefing'|'prep', size?: string, variant?: string, class?: string, label?: string }} props
 */
export function LoadoutButton({ from, size = 'md', variant = 'secondary', class: cls, label = t('干员调配') }) {
  useData('local'); // the official preset icon (re-render once the local-art manifest arrives)
  const entries = useStore((s) => s.entries, Object.is, loadoutStore);
  const ops = useStore((s) => s.ops, Object.is, loadoutStore);
  const notOwned = useStore((s) => s.notOwned, Object.is, loadoutStore);
  const diy = useStore((s) => s.diy, Object.is, loadoutStore);
  const chessReady = data.status('chess') === 'ready';
  const n = badgeCount(entries, chessReady ? (id) => data.lookup('chess', id) : null, ops, chessReady ? rosterOf(data.list('chess')) : null);
  // 0.2.0 补位: how many operators the player marked as not owned (the 干员持有 tab) — easy to forget between sessions
  const off = Array.isArray(notOwned) ? notOwned.length : 0;
  // 0.2.0 自选编队: how many DIY slots the player filled
  const nDiy = diyCount(diy);
  return html`<button type="button" class=${cx('btn', `btn--${variant}`, `btn--${size}`, 'lo-entry', cls)} data-testid="loadout-open"
      onClick=${() => openLoadout(from)} title=${t('调整干员携带的技能与模组 · 干员持有')}>
    <${Img} src=${localAsset('ui/outer', 'operator_preset')} class="lo-entry__icon" fallback=${html`<${Icon} name="edit" class="btn__icon" />`} />
    <span class="btn__label">${label}</span>
    ${n ? html`<span class="lo-entry__n num" aria-label=${t('{n} 名干员已调整', { n })}>${n}</span>` : null}
    ${off ? html`<span class="lo-entry__own" aria-label=${t('{off} 名干员未持有，由替补干员上场', { off })} title=${t('{off} 名干员未持有（由替补干员上场）', { off })}>${t('替补')} <b class="num">${off}</b></span>` : null}
    ${nDiy ? html`<span class="lo-entry__own lo-entry__diy" aria-label=${t('{n} 个自选名额已选择', { n: nDiy })} title=${t('{n} 个自选名额已选择', { n: nDiy })}>${t('自选')} <b class="num">${nDiy}</b></span>` : null}
  </button>`;
}
