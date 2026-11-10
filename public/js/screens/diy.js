// 自选编队 (0.2.0 DIY; research 0.2.0 §2, the owner's decisions of 2026-10-05), in the 干员调配 overlay
// (screens/loadout.js). Four slots — 5阶 ×2, 6阶 ×2 — each filled with an operator: a 6★ the player owns outside the
// chess pool (any of its three skills, any module of its elite form but a 集成战略 one) or a prototype (原型干员, its skill
// and module locked as when it stands in). Only operators with a kit are listed (the server's welcome.diyKitted). The
// slot picker lists the legal picks of the slot's tier — avatar, name, class, the bonds derived from its factions, a
// 原型 / 已持有 tag —, an operator held by another slot greyed out with where it is. In the match the operator is sold
// only in this player's shop, from 调度中心 level 5 (tier 5) / 6 (tier 6), and fights with the pick (server/match/player
// /diy.js). Out of match: the next match takes the picks. The picks live in ui/loadoutSync.js (localStorage + room.diy);
// the model is ui/diyModel.js. Styles: css/screens/loadout.css (diy-*). An owned pick's 潜能 / 练度 are the
// same per-operator settings as 干员调配 (0.2.2, screens/cultivation.js, `ops`); a prototype has neither. (fork,
// docs/OUTFITS.md) The picker's detail has the 干员调配 detail's 调配 / 时装 switch: 时装 is the outfit panel of the
// operator being picked (screens/outfits.js OutfitPanel).
//
// Since 0.2.2 the picker is the roster's own screen (screens/loadoutSections.js holds the detail sections both draw): its
// one semantic difference is the DRAFT — a card's quick choice writes it (确认 saves it, the top bar's back / Esc drop it) while a 潜能 /
// 练度 write (in the detail) stays immediate like the roster's; a taken option disables its card, a prototype's locked
// cells are static. (fork, 2026-11-08) The picker is the 干员调配 card view for 自选 operators: its operators are that
// view's cards (DiyCard: the same .lo-op css) in a sideways deck grouped by class — a marker per class, as the roster's
// tiers — with a bottom bar that jumps to a class, and a card opens the detail in the card view's drawer over the deck's
// left (收起; the open card again closes it; Esc folds it first). The card view opens it from a slot card in its deck
// (DiyDeckSlot) as a page of its own; its top bar holds the roster's 筛选 (search, class, bond: `filters`) and 「简洁 /
// 详情」. The list view, its 自选编队 tab and that tab's slot overview were removed (the user's call of 2026-11-08).

import { useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, Button, TierChip } from '../ui/components.js';
import { OperatorImage, Img } from '../ui/gameComponents.js';
import { profGlyphUrl, skillRecordIconUrl, moduleTypeIconUrl } from '../ui/assetUrls.js';
import { data } from '../data.js';
import { MODULE_NONE, PROF_ORDER, PROF_NAME, skillLabel, moduleBadge, opsOf, chessOptions } from '../ui/loadoutModel.js';
import { diySlotList, pickChoices, pickOptions, slotRecord, defaultPick } from '../ui/diyModel.js';
// 皮肤 (docs/SKINS.md): the same self-contained section the 干员调配 detail draws, keyed by the operator being picked
import { SkinSection } from '../ui/skinPicker.js';
import { LoadoutStats } from '../ui/loadoutStats.js';
import { useSkillRangePreview } from '../ui/rangePreview.js';
import { CultivationSection, cultivationView } from './cultivation.js';
import { SkillSection, ModuleSection } from './loadoutSections.js';
// (fork) the card view's card, deck, bar and drawer: the 干员调配 deck's own (one copy, screens/loadoutDeck.js)
import { LevelPill, OutfitSide, DeckOpSide, DeckOpMore, DeckOpCard, GroupMark, GroupBarLive, useGroupDeck, DeckDrawer, DeckDetail, DetailsToggle, useDetailsSync, useOutfitView, CardSide } from './loadoutDeck.js';
import { speakSelect, touchOperator } from '../ui/loadoutVoice.js';
import { useNameFit } from '../ui/nameFit.js';
import { t, getLang } from '../../../shared/i18n.js';
import { detailsStore } from '../ui/loadoutDetails.js';
import { outfitsOf } from '../ui/outfits.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** The data the 自选 rules read (shared/diy.js): chess.json + backups.json (localized copies). */
export const diyData = () => ({ chess: data.get('chess'), backups: data.get('backups') });

/** A unit summary's avatar / portrait URL (a backups.json unit or a composed record). */
const avatarRecord = (unit, elite = false) => unit && { charId: unit.charId, assets: { avatar: elite ? unit.assets?.avatarGolden : unit.assets?.avatar } };
const classLine = (u) => `${t(PROF_NAME[u?.profession] || '') || ''}${u?.subProfessionName ? ` · ${u.subProfessionName}` : ''}`;
const bondName = (id) => data.lookup('bonds', id)?.name || id;

/** The 原型 / 已持有 tag of a pick. */
function KindTag({ proto }) {
  return html`<span class=${cx('diy-tag', proto ? 'diy-tag--proto' : 'diy-tag--own')}>${proto ? t('原型') : t('已持有')}</span>`;
}

/**
 * (fork, 2026-11-08) One 自选编队 slot as a card of the 干员调配 card view, closing its tier's group (screens/loadout.js
 * DeckView): the pick as an operator card — the deck's own (DeckOpCard: tier and 原型 / 已持有 on the rail, the portrait,
 * its skill and module buttons, the 「展开」 panel; the user's calls of 2026-11-08: the slot's own card looked broken
 * beside the others, and a custom operator acts as any other) — or an empty slot to fill. A press on a filled slot selects
 * it as a press on any card does (`onSel`: 干员调配's drawer shows its DiyDetail), its quick choices write the saved pick
 * (`onQuick(slotId, patch)`; a prototype's are fixed), its bonds stand on the rail and its 原型 / 已持有 tag beside the
 * slot's name above its own, its levels and 潜能 on the rail as any card's, its 更换 button (a mint-ringed icon at the rail's
 * foot, under the bonds) opens the slot's picker (`onOpen`) — as a
 * press on an empty slot does (the card view has no 自选编队 overview: the deck stays where it was) — and its 清空 (an ✕ of
 * the same look at the card's top-right corner; players asked for it, 2026-11-10) empties the slot as the picker's 清空 does
 * (`onClear`), no confirm: only the pick and its skill / module choice go, 潜能 and levels stay the operator's. A pick the
 * current version cannot field is marked as on the overview.
 */
export function DiyDeckSlot({ m, slot, pick, illegal, onOpen, onClear = null, selected = false, onSel = () => {}, onQuick = () => {}, ops = {}, wornOf = () => null }) {
  const D = diyData();
  const rec = pick ? slotRecord(slot.slotId, pick, D) : null;
  const elite = pick ? slotRecord(slot.slotId, pick, D, { elite: true }) : null;
  const label = t('{tier}阶 自选', { tier: slot.tier });
  const bad = t('这项自选在当前版本不可用，开局时会被移除');
  if (!rec) {
    return html`<button type="button" class=${cx('lo-op', 'lo-op--diy', `lo-op--t${slot.tier}`, 'is-empty', pick && 'is-bad')} data-diy-tier=${slot.tier}
        data-slot=${slot.slotId} onClick=${() => onOpen(slot.slotId)} aria-label=${t('{slot}：选择干员', { slot: label })} title=${pick ? bad : label}>
      <span class="lo-diy__frame"><${Icon} name="plus" class="lo-diy__glyph" /></span>
      <span class="lo-diy__label">${t('选择干员')}</span>
      <small class="lo-diy__note">${t('调度中心等级 {level} 起出现在商店', { level: slot.shopLevel })}</small>
      ${pick ? html`<${Icon} name="warn" class="lo-diy__bad" />` : null}
    </button>`;
  }
  const proto = !!D.backups?.diy?.prototypes?.[slot.tier]?.includes(pick.charId);
  const ch = rowChoices(pick.charId, slot.slotId, D);
  const { skill, module, skills, modules } = ch ? pickState(ch, pick) : { skill: rec.skill?.index ?? null, module: null, skills: [], modules: [] };
  const onSkill = (i) => onQuick(slot.slotId, { skillIndex: i });
  const onModule = (id) => onQuick(slot.slotId, { uniEquipId: id === MODULE_NONE ? null : id });
  const change = t('更换'); // en: "Change"
  const clear = t('清空'); // en: "Clear"
  const cv = proto ? null : cultivationView(pick.charId, ops);
  return html`<${DeckOpCard} m=${m} attrs=${{ 'data-slot': slot.slotId, 'data-char': rec.charId, 'data-diy-tier': slot.tier }} tier=${slot.tier}
    selected=${selected} cls=${['lo-op--diy', 'lo-diy--filled', illegal && 'is-bad']} onPick=${() => onSel(slot.slotId)}
    pickTitle=${illegal ? bad : `${label} · ${rec.name}`} name=${rec.name} portrait=${elite || rec} sub=${rec}
    bonds=${rec.bonds || elite?.bonds || []}
    railTop=${html`<${TierChip} tier=${slot.tier} size="sm" class="lo-op__tier" />`}
    rail=${html`<${LevelPill} m=${m} base=${rec} golden=${elite} potential=${cv?.potentialOn ? cv.potential : null} />
      ${illegal ? html`<${Icon} name="warn" class="lo-diy__bad" />` : null}`}
    railFoot=${html`<button type="button" class="lo-diy__change" data-testid="diy-slot-change" title=${`${change} · ${label}`} aria-label=${`${change} · ${label}`}
        onClick=${(e) => { e.stopPropagation(); onOpen(slot.slotId); }}><${Icon} name="swap" /></button>`}
    corner=${onClear ? html`<button type="button" class="lo-diy__clear" data-testid="diy-slot-clear" title=${`${clear} · ${label}`} aria-label=${`${clear} · ${label}`}
        onClick=${(e) => { e.stopPropagation(); onClear(slot.slotId); }}><${Icon} name="close" /></button>` : null}
    meta=${html`<span class="lo-diy__meta"><${KindTag} proto=${proto} /><span class="lo-diy__label">${label}</span></span>`}
    side=${html`<${CardSide} k=${slot.slotId}
      outfit=${() => html`<${OutfitSide} m=${m} charId=${pick.charId} name=${rec.name} list=${outfitsOf(pick.charId)} worn=${wornOf(pick.charId)} />`}
      skills=${() => html`<${DeckOpSide} m=${m} skills=${skills} skill=${skill} elite modules=${modules} module=${module ?? MODULE_NONE}
        onSkill=${onSkill} onModule=${onModule} locked=${!!ch?.proto} />`} />`}
    moreTestid="diy-slot-more"
    more=${ch ? html`<${DeckOpMore} m=${m} src=${ch} golden=${ch.elite} skills=${skills} skill=${skill} level="elite" modules=${modules}
      module=${module ?? MODULE_NONE} locked=${!!ch.proto} onSkill=${onSkill} onModule=${onModule} locale=${`${getLang()}|${data.locale()}`} />` : null} />`;
}

/**
 * What a pick shows as chosen and the choices it offers (`ch`: ui/diyModel.js pickChoices): a prototype its locked
 * selection, one skill and one module; an owned operator its pick's (or the default: the last skill, the first module),
 * every skill, and 不装备 + its modules. `module` null = 不装备.
 */
function pickState(ch, pick) {
  const lk = ch.locked || null;
  const def = { skill: ch.skills.length ? ch.skills[ch.skills.length - 1].index : null, module: ch.modules[0]?.uniEquipId ?? null };
  const skill = ch.proto ? lk?.skillIndex ?? null : pick?.skillIndex ?? def.skill;
  const module = ch.proto ? lk?.uniEquipId ?? null : pick?.uniEquipId === undefined ? def.module : pick.uniEquipId;
  const skills = (ch.proto ? ch.skills.filter((x) => x.index === skill) : ch.skills).map((x) => ({ ...x, isDefault: false }));
  const modules = ch.proto ? [{ id: module ?? MODULE_NONE, rec: ch.modules.find((x) => x.uniEquipId === module)?.rec ?? null }]
    : [noneOpt, ...ch.modules.map(moduleOpt)];
  return { skill, module, skills, modules };
}

/**
 * (fork) A 自选 pick's detail (screens/loadoutDeck.js DeckDetail): the picker's drawer for its draft, and 干员调配's drawer
 * for a slot's saved pick (the user's call of 2026-11-08: a custom operator's card opens the same detail as any other).
 * 调配 / 时装 on top — 时装 the full outfit panel —, the head with the dub picker, then 外观, 潜能与练度, 技能, 局内数值 and
 * 模组 in 干员调配's order; a 自选 operator has no 特质 (shared/diy.js), and a prototype's skill and module are its locked
 * selection (the cards drawn disabled, and `onPick` never called for it). `onPick(patch)`: { skillIndex } or
 * { uniEquipId } (null = 不装备). Hook-free; null when the pick has no record.
 */
export function DiyDetail({ m, slot, pick, ops = {}, onOps = null, level = 'elite', onLevel = () => {}, view = 'loadout', onView = () => {}, onPick = () => {} }) {
  const D = diyData();
  const ch = pick ? rowChoices(pick.charId, slot.slotId, D) : null;
  const unit = pick ? D.backups?.units?.[pick.charId] : null;
  if (!ch || !unit) return null;
  const potential = opsOf(ops, pick.charId).potential;
  const base = slotRecord(slot.slotId, pick, D, { potential });
  const golden = slotRecord(slot.slotId, pick, D, { elite: true, potential });
  if (!base) return null;
  const { skill: skillOn, module: modOn, modules: moduleOptions } = pickState(ch, pick);
  const previewEntries = { [base.baseId || base.chessId]: { skill: skillOn, module: modOn || 'none' } };
  const previewChess = (id) => (id === golden?.chessId ? golden : base);
  // the 默认 badge is suppressed: on a slot record `isDefault` marks the CURRENT pick (shared/standIn.js composeUnitRecord),
  // not the operator's official default; the module list itself is the DIY one (ui/diyModel.js), 不装备 first
  const skillOptions = (ch.proto ? ch.skills.filter((x) => x.index === skillOn) : chessOptions(base, golden).skillOptions).map((x) => ({ ...x, isDefault: false }));
  const pickSkill = (i) => { if (!ch.proto) onPick({ skillIndex: i }); };
  const pickModule = (id) => { if (!ch.proto) onPick({ uniEquipId: id === MODULE_NONE ? null : id }); };
  return html`<${DeckDetail} m=${m} rec=${base} tier=${slot.tier} name=${base.name || unit.name} en=${base.appellation || unit.appellation}
      portrait=${golden || base} fallback=${html`<b class="diy-pick__glyph">${[...(unit.name || '?')][0]}</b>`}
      chips=${html`<${KindTag} proto=${ch.proto} />`} voiceCharId=${pick.charId} view=${view} onView=${onView} outfitChess=${base}
      bodyCls="diy-pick__detail">
    ${/* 外观 (docs/SKINS.md): keyed by the pick's charId, what the manifest groups skins under and the server stores
         (ps.skins[charId]), so a slot fielded as its golden form keeps the appearance */ null}
    <${SkinSection} charId=${pick.charId} />
    ${ch.proto
      ? html`<p class="lo-locknote"><${Icon} name="info" />${t('原型干员没有潜能与练度')}</p>`
      : onOps ? html`<${CultivationSection} charId=${pick.charId} ops=${ops} onSet=${onOps} />` : null}
    <${SkillSection} m=${m} chess=${base} golden=${golden} skillOptions=${skillOptions} skill=${skillOn} level=${level}
      onLevel=${onLevel} onPick=${pickSkill} locked=${!!ch.proto} />
    <${LoadoutStats} base=${base} golden=${golden} entries=${previewEntries} level=${level}
      onLevel=${onLevel} getChess=${previewChess} ops=${ch.proto ? null : ops} />
    <${ModuleSection} m=${m} golden=${golden} moduleOptions=${moduleOptions} module=${modOn ?? MODULE_NONE}
      onPick=${pickModule} potential=${ch.proto ? null : potential} locked=${!!ch.proto} />
    ${ch.proto ? html`<p class="lo-locknote"><${Icon} name="info" />${t('原型干员的技能与补位时一致，不可更改')}</p>` : null}
  <//>`;
}

// ---- the picker's cards (the card view's) -----------------------------------------------------------------------------

/**
 * The choices of one picker row (ui/diyModel.js pickChoices) behind a memo: the tier-6 list holds ~81 operators and every
 * row draws its skills and modules, so a search keystroke must not recompose all of them. The memo belongs to the loaded
 * backups.json — a language switch or a data reload replaces that object and drops the memo with it; nothing is cached
 * while the data is absent.
 */
let choicesOf = null;
const choicesMemo = new Map();
function rowChoices(charId, slotId, D) {
  const backups = D?.backups ?? null;
  if (!backups) return pickChoices(charId, slotId, D);
  if (choicesOf !== backups) { choicesOf = backups; choicesMemo.clear(); }
  const key = `${slotId}|${charId}`;
  if (!choicesMemo.has(key)) choicesMemo.set(key, pickChoices(charId, slotId, D));
  return choicesMemo.get(key);
}

/**
 * (fork) A class group's tall marker (the roster's tier marker, screens/loadout.js TierMark, for the picker's classes): the
 * class glyph, its name down the marker, the group's count below. Hook-free.
 */
export function ClassMark({ m, prof, count }) {
  return html`<${GroupMark} cls="diy-cmark" count=${count}>
    <span class="lo-tmark__css diy-cmark__css">
      <span class="diy-cmark__glyph"><${Img} src=${profGlyphUrl(m, prof)} class="lo-profglyph" fallback=${html`<b>${t(PROF_NAME[prof] || '')[0] || '?'}</b>`} /></span>
      <span class="diy-cmark__name">${t(PROF_NAME[prof] || '')}</span>
    </span>
  <//>`;
}

/** (fork) The picker's bottom bar's classes (screens/loadoutDeck.js GroupBar items): glyph and name, a button each. */
const classItems = (m, profs) => profs.map((p) => ({ key: p, title: t(PROF_NAME[p] || ''), cls: 'diy-cbar__btn', attrs: { 'data-prof': p },
  content: html`<${Img} src=${profGlyphUrl(m, p)} class="diy-cbar__glyph lo-profglyph" fallback=${null} /><span>${t(PROF_NAME[p] || '')}</span>` }));

/** The 不装备 option and a module record as a quick choice's option (loadout.js chessOptions' shape). */
const noneOpt = { id: MODULE_NONE, rec: null };
const moduleOpt = (x) => ({ id: x.uniEquipId, rec: x.rec });

/**
 * (fork) One operator of the picker: the 干员调配 card (screens/loadoutDeck.js DeckOpCard, DeckOpSide, DeckOpMore) with its class and
 * 原型 / 已持有 tag on the rail. Its quick choices write the DRAFT through `onQuick` (确认 saves it); a press anywhere
 * else selects the operator (`onSel`). A taken option is dimmed with where it is and does nothing; a prototype's
 * locked skill and module are static cells. 潜能 / 练度 are set in the picker's detail (as in 干员调配). `level` 'elite':
 * the skills' Lv.7.
 */
function DiyCard({ m, slot, opt, ch, takenTier, draft, selected, onSel, onQuick, level, worn = null }) {
  const u = opt.unit;
  const name = u?.name || opt.charId;
  const taken = takenTier != null;
  const note = taken ? t('已在{tier}阶自选中', { tier: takenTier }) : null;
  // what the card shows as chosen: a prototype's locked selection, the draft's choice for the drafted operator, else the
  // operator's own default pick (what a fresh selection would start with — ui/diyModel.js defaultPick)
  const def = ch ? { skill: ch.skills.length ? ch.skills[ch.skills.length - 1].index : null, module: ch.modules[0]?.uniEquipId ?? null } : null;
  const cur = (ch?.proto ? { skill: ch.locked?.skillIndex ?? null, module: ch.locked?.uniEquipId ?? null } : null)
    || (draft && draft.charId === opt.charId
      ? { skill: draft.skillIndex ?? def?.skill ?? null, module: draft.uniEquipId === undefined ? def?.module ?? null : draft.uniEquipId }
      : def) || { skill: null, module: null };
  const curMod = cur.module ?? MODULE_NONE;
  const locked = !!ch?.proto;
  const onSkill = (index) => onQuick(opt.charId, { skillIndex: index });
  const onModule = (id) => onQuick(opt.charId, { uniEquipId: id === MODULE_NONE ? null : id });
  // a prototype shows its one skill and module; an owned operator every skill and 不装备 + its modules
  const skills = (locked ? (ch?.skills || []).filter((s) => s.index === cur.skill) : ch?.skills || []).map((s) => ({ ...s, isDefault: false }));
  const modules = locked ? [{ id: curMod, rec: ch.modules.find((x) => x.uniEquipId === cur.module)?.rec ?? null }] : [noneOpt, ...(ch?.modules || []).map(moduleOpt)];
  return html`<${DeckOpCard} m=${m} attrs=${{ 'data-char': opt.charId }} tier=${slot.tier} selected=${selected}
    cls=${['diy-opt', taken && 'is-taken', opt.proto && 'is-proto']} onPick=${() => onSel(opt.charId)} pickDisabled=${taken} pickTitle=${note || name}
    pickCls="diy-opt__pick" railCls="diy-card__rail" name=${name} portrait=${avatarRecord(u)} sub=${u} bonds=${opt.bonds || []}
    railTop=${html`<${Img} src=${profGlyphUrl(m, u?.profession)} class="diy-card__prof lo-profglyph" title=${classLine(u)} />`}
    rail=${html`<span class="diy-card__kind"><${KindTag} proto=${opt.proto} /></span>`}
    ribbon=${note ? html`<span class="lo-op__ribbon diy-card__taken" title=${note}>${note}</span>` : null}
    side=${html`<${CardSide} k=${opt.charId}
      outfit=${() => html`<${OutfitSide} m=${m} charId=${opt.charId} name=${name} list=${outfitsOf(opt.charId)} worn=${worn} />`}
      skills=${() => html`<${DeckOpSide} m=${m} skills=${skills} skill=${cur.skill} elite=${level === 'elite'} modules=${modules} module=${curMod}
        onSkill=${onSkill} onModule=${onModule} locked=${locked} disabled=${taken} />`} />`}
    moreTestid="diy-card-more"
    more=${ch ? html`<${DeckOpMore} m=${m} src=${ch} golden=${ch.elite} skills=${skills} skill=${cur.skill} level=${level} modules=${modules}
      module=${curMod} locked=${locked || taken} onSkill=${onSkill} onModule=${onModule} locale=${`${getLang()}|${data.locale()}`} />` : null} />`;
}

/**
 * The slot picker: the legal operators of the slot's tier (prototypes first, then the owned 6★; a 原型 / 已持有 filter, the
 * roster's 职业 chips and a search), the chosen one's skill / module (an owned pick) or its locked selection (a prototype),
 * 确认 (fork: no 取消 — the top bar's back, or Esc, leaves without saving; the user's call of 2026-11-09). The state (filter, profession, search, the draft pick, the narrow-screen detail) lives here; DiyPickerView
 * draws it.
 * @param {{ m: any, slot: any, picks: Record<string, any>, kitted: string[]|null, onDone: (pick: any) => void, onClose: () => void,
 *   ops?: Record<string, any>, onOps?: Function|null }} props
 */
export function DiyPicker(props) {
  const [previewLevel, setPreviewLevel] = useState('elite');
  useSkillRangePreview(); // (fork) 局内数值's 攻击范围 技能 toggle (ui/rangePreview.js)
  // (fork) the detail is the card view's drawer over the deck's left (open: a card was pressed); the deck makes room
  // for it and scrolls by the same width, so nothing jumps, then shows the chosen card beside it (screens/loadout.js)
  // (a filled slot opens with its operator's detail shown)
  const [narrowDetail, setNarrowDetail] = useState(() => !!(props.picks[props.slot.slotId]));
  const deckRef = useRef(null);
  const cur = props.picks[props.slot.slotId] || null;
  const [detailView, setDetailView] = useState('loadout'); // (fork) the detail's 调配 / 时装
  const [draft, setDraft] = useState(cur ? { ...cur } : null);
  // (fork) the class groups: the 干员调配 deck's drag, wheel, left-edge group and jumps (screens/loadoutDeck.js)
  const deckNav = useGroupDeck(deckRef, { onDragStart: () => setNarrowDetail(false) }); // (fork) a drag closes the detail
  useDetailsSync(deckRef); // 「详情」's panels for the cards drawn now (a filter, the first draw with it on)
  useNameFit(deckRef); // (fork) the names fitted to their cards (ui/nameFit.js)
  // Esc cancels only the picker, like the top bar's back (GitHub #284, idea from PR #286); the 干员调配 overlay's own Esc skips
  // while a picker is open, and a dialog over the picker (导入) still takes Esc first. A layout effect: the listener is
  // attached in the same commit as the picker (a plain effect waits for the next frame, and an Esc pressed in between
  // was swallowed — the overlay skipped it, the picker did not hear it yet; the 0.2.2 full browser pass)
  // (fork) as in the card view, Esc first folds the detail drawer, then cancels the picker
  const drawerOpen = useRef(false);
  drawerOpen.current = narrowDetail && !!draft;
  useLayoutEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (drawerOpen.current) { setNarrowDetail(false); return; }
      props.onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [props.onClose]);
  const { wornOf } = useOutfitView(); // (fork) the outfits worn, for the 时装 view (the switch's third choice, as in 干员调配)
  return DiyPickerView({ ...props, wornOf, previewLevel, onPreviewLevel: setPreviewLevel, narrowDetail, onNarrowDetail: setNarrowDetail,
    draft, onDraft: setDraft, deckRef, detailView, onDetailView: setDetailView,
    deckProps: deckNav.deckProps, profSink: deckNav.sink, onJumpProf: deckNav.jump });
}

/**
 * The picker's view (no hooks: the tests draw it): `filters` the page's 筛选 ({ query, prof, bond }: screens/loadout.js
 * Filters without its tier row), `draft` the pick being made (null = none chosen yet) and its setter, `narrowDetail` the
 * detail drawer open (fork: the 干员调配 card view's drawer over the deck's left), `deckRef` the deck, `deckProps` its
 * drag / scroll handlers, `profSink` / `onJumpProf` the class bar's.
 */
export function DiyPickerView({ m, slot, picks, kitted, onDone, onClose, onClear = null, filters = {}, draft, onDraft: setDraft,
  ops = {}, onOps = null, previewLevel = 'elite', onPreviewLevel = () => {}, narrowDetail = false, onNarrowDetail = () => {}, deckRef = null,
  detailView = 'loadout', onDetailView = () => {}, deckProps = {}, profSink = { current: null }, onJumpProf = () => {}, onDetails = null, detailsOff = false, wornOf = () => null }) {
  const D = diyData();
  const cur = picks[slot.slotId] || null;
  const options = pickOptions(slot.slotId, picks, D, kitted);
  const tiers = new Map(diySlotList(D).map((s) => [s.slotId, s.tier]));
  const q = String(filters.query || '').trim().toLowerCase();
  const list = options.filter((o) => (!filters.prof || o.unit?.profession === filters.prof)
    && (!filters.bond || (o.bonds || []).includes(filters.bond))
    && (!q || [o.unit?.name, o.unit?.appellation, o.unit?.subProfessionName, t(PROF_NAME[o.unit?.profession] || ''), ...o.bonds.map(bondName)].some((x) => typeof x === 'string' && x.toLowerCase().includes(q))));
  const ch = draft ? rowChoices(draft.charId, slot.slotId, D) : null;
  // Selecting a card keeps the draft's edits when it is already the chosen operator (the picker's own rule, 0.2.0). (fork)
  // As in the card view: a card opens its detail in the drawer, the open card again closes it.
  const sel = (charId) => {
    if (draft?.charId !== charId) {
      setDraft(cur && cur.charId === charId ? { ...cur } : defaultPick(charId, slot.slotId, D));
      onNarrowDetail(true);
      speakSelect(D.backups?.units?.[charId] || { charId }); // 选中干员, once per visit, as in 干员调配 (ui/loadoutVoice.js)
      return;
    }
    onNarrowDetail(!narrowDetail);
  };
  // a card's quick choice: it writes the DRAFT (确认 saves it, leaving drops it) — starting from the saved pick when the
  // operator is the slot's own, else from what selecting it would give it (ui/diyModel.js defaultPick)
  const quick = (charId, patch) => {
    const from = draft && draft.charId === charId ? draft
      : cur && cur.charId === charId ? { ...cur } : defaultPick(charId, slot.slotId, D);
    setDraft({ ...from, ...patch });
    touchOperator({ charId }, patch);
  };
  const label = t('{tier}阶 自选', { tier: slot.tier });
  // (fork) one group per class, in the roster's class order; each keeps the picker's order (prototypes first)
  const groups = PROF_ORDER.map((prof) => ({ prof, items: list.filter((o) => o.unit?.profession === prof) })).filter((g) => g.items.length);
  // the drawer: the draft's detail (DiyDetail; a prototype's skill and module refuse a draft edit)
  const detail = narrowDetail && draft ? DiyDetail({ m, slot, pick: draft, ops, onOps, level: previewLevel, onLevel: onPreviewLevel,
    view: detailView, onView: onDetailView, onPick: (patch) => { setDraft({ ...draft, ...patch }); touchOperator(draft, patch); } }) : null;
  const drawer = !!detail;
  return html`<section class=${cx('diy-pick', drawer && 'is-detail')} role="dialog" aria-label=${t('{slot}：选择干员', { slot: label })} data-testid="diy-picker" data-slot=${slot.slotId}>
    <div class="diy-pick__main">
      <div class=${cx('lo-deck', 'diy-deck', drawer && 'has-drawer', detailsStore.get().on && 'is-details', !(kitted != null && list.length) && 'lo-deck--empty')} data-testid="diy-deck" ref=${deckRef} ...${deckProps}>
        ${kitted == null ? html`<p class="lo-empty t-dim">${t('连接服务器后才能选择自选干员')}</p>`
          : groups.length ? groups.map((g) => html`<section key=${g.prof} class="lo-tgroup diy-cgroup" data-group=${g.prof} data-prof=${g.prof} aria-label=${t(PROF_NAME[g.prof] || '')}>
            <${ClassMark} m=${m} prof=${g.prof} count=${g.items.length} />
            <div class="lo-tgrid" role="list">
              ${g.items.map((o) => html`<${DiyCard} key=${o.charId} m=${m} slot=${slot} opt=${o} ch=${o.charId === draft?.charId ? ch : rowChoices(o.charId, slot.slotId, D)}
                takenTier=${o.taken ? tiers.get(o.taken) ?? slot.tier : null} draft=${draft} selected=${draft?.charId === o.charId}
                onSel=${sel} onQuick=${quick} level=${previewLevel} worn=${wornOf(o.charId)} />`)}
            </div>
          </section>`)
            : html`<p class="lo-empty t-dim">${t('没有符合条件的干员')}</p>`}
      </div>
      ${drawer ? html`<${DeckDrawer} testid="diy-drawer" onClose=${() => onNarrowDetail(false)}>${detail}<//>` : null}
    </div>
    <footer class="diy-pick__foot lo-bbar">
      ${/* 按职业跳转 — en: "Jump to a class" */ null}
      ${kitted != null && groups.length ? html`<${GroupBarLive} sink=${profSink} cls="diy-cbar" label=${t('按职业跳转')} items=${classItems(m, groups.map((g) => g.prof))} onJump=${onJumpProf} />`
        : html`<span class="diy-cbar"></span>`}
      ${onDetails ? html`<${DetailsToggle} disabled=${detailsOff} onSet=${onDetails} outfits />` : null}
      ${onClear && cur ? html`<${Button} variant="ghost" icon="close" class="diy-pick__clear" data-testid="diy-pick-clear" onClick=${onClear}>${t('清空')}<//>` : null}
      <${Button} variant="primary" icon="check" data-testid="diy-confirm" disabled=${!ch} onClick=${() => onDone(ch.proto ? { charId: draft.charId } : draft)}>${t('确认')}<//>
    </footer>
  </section>`;
}
