// 时装 / Outfits (fork feature, docs/OUTFITS.md): the outfit view of the 干员调配 detail (screens/loadout.js). The switch
// above the detail header (OutfitSwitch) turns the detail between its loadout body and this panel: the selected
// operator's full artwork and battle sprite (Spine, tap to play its attack) of the outfit picked in the list — 默认 (the
// operator's own look: its E2 art) first, then every outfit of data/outfits.json — with 导出 / 导入 of the whole choice
// (a JSON file, shared/outfits.js). Picking an outfit wears it at once (ui/outfits.js setOutfit: every player owns every
// outfit), and the preview shows the worn one (no hover preview: the user found it hard to use, 2026-10-12). Clicking
// the artwork opens it full size. The 自选编队 slots open the same panel in a dialog (OutfitDialog, screens/diy.js).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, MicroLabel, Modal, Spinner } from '../ui/components.js';
import { Img } from '../ui/gameComponents.js';
import { data, useData } from '../data.js';
import { useStore } from '../store.js';
import { outfitArtUrl, defaultArtUrl, spineEntry } from '../assets.js';
import { outfitStore, setOutfit, outfitsOf, applyOutfitsImport } from '../ui/outfits.js';
import { serializeOutfits, parseOutfitsImport, OUTFITS_IMPORT_MAX_BYTES } from '../../../shared/outfits.js';
import { copyText } from '../ui/clipboard.js';
import { seedAssets } from '../ui/fieldHost.js';
import { toast } from '../ui/toasts.js';
import { t } from '../../../shared/i18n.js';

const cx = (...a) => a.filter(Boolean).join(' ');

/** The switch above the detail header: 调配 (the loadout body) ⇄ 时装 (OutfitPanel). */
export function OutfitSwitch({ view, onView }) {
  return html`<div class="lo-oswitch" role="tablist" aria-label=${t('调配 / 时装')}>
    <button type="button" role="tab" aria-selected=${view !== 'outfit' ? 'true' : 'false'} class=${cx(view !== 'outfit' && 'is-on')}
      data-testid="outfit-switch-loadout" onClick=${() => onView('loadout')}>${t('调配')}</button>
    <button type="button" role="tab" aria-selected=${view === 'outfit' ? 'true' : 'false'} class=${cx(view === 'outfit' && 'is-on')}
      data-testid="outfit-switch-outfit" onClick=${() => onView('outfit')}>${t('时装')}</button>
  </div>`;
}

// ---- the battle sprite preview (one PIXI app while the panel is open) ----------------------------------------------

// Every operator model is drawn at one scale, the battle's (render/style.js UNIT.modelScale: 320 skeleton units = a tile),
// so the chibis compare as they do on the field. The setup-pose bounds are no use for this: effect attachments make them
// 150–1665 units tall (2026-10-12), and fitting each model to its own box gave wildly different sizes. The canvas
// follows the box (ResizeObserver): a tile is TILE_H of its height, capped so a tile never passes TILE_W of its width.
const SKEL_TILE = 320;
const TILE_H = 0.5, TILE_W = 0.62, FEET = 0.9;

/** Scale and position of a model on a w × h canvas: feet at FEET of the height, centred. */
export function spriteFit(w, h) {
  const k = Math.min(h * TILE_H, w * TILE_W) / SKEL_TILE;
  return { k, x: w / 2, y: h * FEET };
}

/**
 * The battle model of `modelId` (a charId or an outfit id: assets.js spineEntry) on a canvas the size of its box,
 * idling; a tap plays its attack once. Loaded through the shared asset store (its Spine cache), released on change /
 * unmount.
 */
function SpritePreview({ modelId }) {
  const host = useRef(null);
  const actorRef = useRef(null);
  const [state, setState] = useState('loading');
  useEffect(() => {
    let disposed = false;
    let app = null, actor = null, entry = null, am = null, raf = 0, ro = null;
    setState('loading');
    const fit = () => {
      const el = host.current;
      if (!app || !actor || !el) return;
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      app.renderer.resize(w, h);
      const f = spriteFit(w, h);
      actor.spine.scale.set(f.k);
      actor.spine.position.set(f.x, f.y);
    };
    (async () => {
      const [{ ensurePixi }, assetsMod, { SpineActor }] = await Promise.all([
        import('../render/app/pixi.js'), import('../assets.js'), import('../render/spine.js')]);
      const P = await ensurePixi();
      am = assetsMod.assets;
      seedAssets(am); // the manifest the loadout already has (no second download)
      await am.ready?.();
      entry = am.spineEntry(modelId);
      if (disposed) return;
      if (!entry) { setState('none'); return; }
      const sd = await am.spine.acquire(entry);
      if (disposed) { am.spine.release(entry); return; }
      const el = host.current;
      app = new P.Application({ width: el?.clientWidth || 240, height: el?.clientHeight || 240, backgroundAlpha: 0, antialias: true,
        resolution: Math.min(2, globalThis.devicePixelRatio || 1), autoDensity: true });
      el.appendChild(app.view);
      actor = new SpineActor(sd, entry);
      app.stage.addChild(actor.spine);
      fit();
      if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(fit); ro.observe(el); }
      actor.deploy();
      actorRef.current = actor;
      let last = performance.now();
      const tick = (now) => {
        if (disposed) return;
        actor.update(Math.min(0.1, (now - last) / 1000));
        last = now;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      setState('ready');
    })().catch((err) => { if (!disposed) { console.warn('[outfits] preview failed', err?.message || err); setState('none'); } });
    return () => {
      disposed = true;
      actorRef.current = null;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      try { actor?.destroy(); } catch { /* ignore */ }
      try { app?.destroy(true, { children: true, texture: false, baseTexture: false }); } catch { /* ignore */ }
      if (entry && am) am.spine.release(entry);
    };
  }, [modelId]);
  // a tap plays the attack once (then the idle); a model without one replays its deploy
  const play = () => { const a = actorRef.current; if (!a) return; if (a.roles?.attack) a.attack(1, true); else a.deploy(); };
  return html`<div class="ofit-sprite" ref=${host} onClick=${play} title=${t('点击播放攻击动作')} aria-hidden="true">
    ${state === 'loading' ? html`<${Spinner} size="sm" />` : state === 'none' ? html`<span class="t-dim">${t('无战斗模型')}</span>` : null}
  </div>`;
}

// ---- the panel -----------------------------------------------------------------------------------------------------

/** 导出 / 导入 of the whole choice (the shared Modal; copy, download, paste or pick a file). */
function OutfitIo({ io, setIo, ready }) {
  const fileRef = useRef(null);
  if (!io) return null;
  const exp = io.mode === 'export';
  const n = Object.keys(outfitStore.get().outfits).length;
  const pick = async (e) => {
    const f = e.currentTarget.files && e.currentTarget.files[0];
    e.currentTarget.value = '';
    if (!f) return;
    if (f.size > OUTFITS_IMPORT_MAX_BYTES) { toast(t('文件过大，请选择「导出」下载的时装文件'), 'error'); return; }
    try { setIo({ ...io, text: await f.text() }); } catch { toast(t('读取文件失败'), 'error'); }
  };
  const apply = () => {
    if (data.status('outfits') !== 'ready') { toast(t('时装数据尚未载入，请稍后再试'), 'warn'); return; }
    const r = parseOutfitsImport(io.text);
    if (!r.ok) { toast(t('导入失败：{error}', { error: t(r.error, r.params) }), 'error'); return; }
    const { applied, dropped } = applyOutfitsImport(r.outfits, r.asked);
    setIo(null);
    toast(applied ? t('已导入 {n} 名干员的时装', { n: applied }) + (dropped ? t('（另有 {n} 项不可用，未导入）', { n: dropped }) : '')
      : t('已导入：全部干员使用默认外观'), dropped ? 'warn' : 'success');
  };
  const copy = async () => {
    const ok = await copyText(io.text);
    toast(ok ? t('已复制到剪贴板') : t('复制失败，请在文本框中手动全选复制'), ok ? 'success' : 'warn');
  };
  const download = () => {
    try {
      const p = (x) => String(x).padStart(2, '0');
      const d = new Date();
      const url = URL.createObjectURL(new Blob([io.text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `stronghold-outfits-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { /* copy stays available */ }
  };
  return html`<${Modal} open=${true} onClose=${() => setIo(null)} title=${t(exp ? '导出时装' : '导入时装')} micro="OUTFITS"
    actions=${exp
      ? html`<${Button} variant="ghost" onClick=${() => setIo(null)}>${t('关闭')}<//>
          <${Button} variant="secondary" icon="copy" data-testid="outfit-io-copy" onClick=${copy}>${t('复制')}<//>
          <${Button} variant="primary" data-testid="outfit-io-download" onClick=${download}>${t('下载文件')}<//>`
      : html`<${Button} variant="ghost" onClick=${() => setIo(null)}>${t('取消')}<//>
          <${Button} variant="secondary" data-testid="outfit-io-pick" onClick=${() => fileRef.current?.click()}>${t('选择文件')}<//>
          <${Button} variant="primary" icon="check" data-testid="outfit-io-apply" disabled=${!io.text.trim() || !ready} onClick=${apply}>${t('导入')}<//>`}>
    <p class="lo-io__hint">${exp ? t('共 {n} 名干员穿着时装。复制或下载这份数据，即可在别的设备或浏览器上导入。', { n })
      : t('把导出的时装数据粘贴到下方，或点「选择文件」。导入会覆盖当前的时装设置。')}</p>
    <textarea class="lo-io__text" data-testid="outfit-io-text" spellcheck=${false} readOnly=${exp} value=${io.text}
      placeholder=${exp ? '' : t('在此粘贴导出的时装内容…')} onInput=${(e) => setIo({ ...io, text: e.currentTarget.value })}></textarea>
    <input type="file" accept=".json,application/json,text/plain" class="lo-io__file" ref=${fileRef} onChange=${pick} />
  <//>`;
}

/** The artwork full size (a click on the preview's artwork; Esc / the backdrop close it). */
function ArtViewer({ src, name, onClose }) {
  if (!src) return null;
  return html`<${Modal} open=${true} onClose=${onClose} title=${name} micro="OUTFIT" class="ofit-viewer" width="min(94vw, 150vh)">
    <div class="ofit-viewer__art" data-testid="outfit-art-viewer"><${Img} src=${src} alt=${name} /></div>
  <//>`;
}

/**
 * The cards of one operator: 默认, then its outfits; a click wears one (ui/outfits.js setOutfit). No hooks: the panel
 * and the 自选编队 picker (OutfitPickSection) draw it, and the tests can too.
 * @param {{ m: any, charId: string, name?: string, list: any[], worn: string|null, compact?: boolean }} p
 */
export function OutfitCards({ m, charId, name = '', list, worn, compact = false }) {
  const card = (id, rec) => {
    const on = (id || null) === worn;
    const avatar = id ? outfitArtUrl(m, id, 'avatar') : null;
    return html`<button key=${id || 'default'} type="button" role="radio" aria-checked=${on ? 'true' : 'false'} data-outfit=${id || 'default'}
        class=${cx('ofit-card', on && 'is-on')} onClick=${() => setOutfit(charId, id)}>
      <span class="ofit-card__ava">${id ? html`<${Img} src=${avatar} fallback=${html`<b>${[...(rec?.name || '?')][0]}</b>`} />`
        : html`<${Img} src=${m?.chars?.[charId]?.avatarE2 || m?.chars?.[charId]?.avatar} fallback=${html`<b>${[...(name || '?')][0]}</b>`} />`}</span>
      <span class="ofit-card__text">
        <b class="ofit-card__name">${id ? rec?.name || id : t('默认')}</b>
        <span class="ofit-card__series">${id ? rec?.series || '' : t('干员自身的外观')}</span>
      </span>
      ${on ? html`<span class="lo-badge lo-badge--def ofit-card__on">${t('穿着中')}</span>` : null}
    </button>`;
  };
  return html`<div class=${cx('ofit-list', compact && 'ofit-list--compact')} role="radiogroup" aria-label=${t('选择时装')}>
    ${card(null, null)}
    ${list.map((r) => card(r.id, r))}
  </div>`;
}

/**
 * The 时装 section of the 自选编队 picker (screens/diy.js DiyPickerView): the operator being picked, its cards (a click
 * wears one at once, like the voice language next to it — not part of the pick), and 预览 for the full panel (artwork +
 * sprite) in a dialog. Nothing when the operator has no outfit.
 * @param {{ m: any, charId: string, name?: string }} p
 */
export function OutfitPickSection({ m, charId, name = '' }) {
  const ready = useData('outfits');
  const outfits = useStore((s) => s.outfits, Object.is, outfitStore);
  const [open, setOpen] = useState(false);
  const list = ready ? outfitsOf(charId) : [];
  if (!list.length) return null;
  const worn = outfits[charId] && list.some((r) => r.id === outfits[charId]) ? outfits[charId] : null;
  // '预览' // en: "Preview" · '查看立绘与战斗模型' // en: "View the artwork and battle model" · '立即生效，与自选设置分开保存' // en: "Applies at once, saved separately from the Custom Squad"
  return html`<section class="lo-sec diy-pick__outfits" data-testid="diy-pick-outfits">
    <header class="lo-sec__head">
      <h3>${t('时装')}<${MicroLabel}>OUTFIT<//></h3>
      <span class="lo-sec__note">${t('立即生效，与自选设置分开保存')}</span>
      <${Button} variant="ghost" size="sm" data-testid="diy-pick-outfit-preview" onClick=${() => setOpen(true)} title=${t('查看立绘与战斗模型')}>${t('预览')}<//>
    </header>
    <${OutfitCards} m=${m} charId=${charId} name=${name} list=${list} worn=${worn} compact=${true} />
    ${open ? html`<${OutfitDialog} m=${m} unit=${{ charId, name }} onClose=${() => setOpen(false)} />` : null}
  </section>`;
}

/**
 * The outfit view of the detail: preview (artwork + sprite) of the worn outfit, the cards (默认 + the operator's
 * outfits: a click wears one), and the choice's 导出 / 导入.
 * @param {{ m: any, chess: { charId: string, name?: string } | null }} p `m` = data/assets.json, `chess` = the selected
 *   base chess record (or the 自选编队 operator: only charId and name are read)
 */
export function OutfitPanel({ m, chess }) {
  const ready = useData('outfits');
  const outfits = useStore((s) => s.outfits, Object.is, outfitStore);
  const [io, setIo] = useState(null);
  const [viewing, setViewing] = useState(false);
  useEffect(() => { setViewing(false); }, [chess?.charId]);
  if (!chess) return null;
  const charId = chess.charId;
  const list = ready ? outfitsOf(charId) : [];
  const worn = outfits[charId] && list.some((r) => r.id === outfits[charId]) ? outfits[charId] : null;
  const wornRec = worn ? list.find((r) => r.id === worn) : null;
  const art = worn ? outfitArtUrl(m, worn, 'art') : defaultArtUrl(m, charId);
  const artName = wornRec?.name || chess.name || charId;
  const model = worn && spineEntry(m, worn) ? worn : charId;
  // the artwork button: '点击查看大图' // en: "Click to view full size" · '查看大图：{name}' // en: "View full size: {name}"
  return html`<div class="lo-detail__body ofit" data-testid="outfit-panel">
    <section class="ofit-stage">
      ${art ? html`<button type="button" class="ofit-art" data-testid="outfit-art" onClick=${() => setViewing(true)}
          title=${t('点击查看大图')} aria-label=${t('查看大图：{name}', { name: artName })}>
          <${Img} src=${art} alt=${artName} /><span class="ofit-art__zoom" aria-hidden="true">⤢</span></button>`
        : html`<div class="ofit-art"><span class="t-dim">${t('暂无立绘')}</span></div>`}
      <${SpritePreview} modelId=${model} />
    </section>
    <section class="lo-sec">
      <header class="lo-sec__head">
        <h3>${t('时装')}<${MicroLabel}>OUTFIT<//></h3>
        <span class="lo-sec__note">${t('联机时其他玩家也能看到 · 所有时装均可使用')}</span>
      </header>
      ${!ready ? html`<div class="lo-loading"><${Spinner} size="sm" />${t('正在载入时装…')}</div>`
        : html`<${OutfitCards} m=${m} charId=${charId} name=${chess.name} list=${list} worn=${worn} />`}
      ${ready && !list.length ? html`<p class="t-dim ofit-none">${t('该干员没有时装')}</p>` : null}
      <div class="ofit-io">
        <${Button} variant="ghost" size="sm" data-testid="outfit-export" disabled=${!Object.keys(outfits).length}
          onClick=${() => setIo({ mode: 'export', text: serializeOutfits(outfits) })} title=${t('导出时装（可复制或下载）')}>${t('导出')}<//>
        <${Button} variant="ghost" size="sm" data-testid="outfit-import" disabled=${!ready}
          onClick=${() => setIo({ mode: 'import', text: '' })} title=${t('导入时装（粘贴或选择文件）')}>${t('导入')}<//>
      </div>
    </section>
    <${OutfitIo} io=${io} setIo=${setIo} ready=${!!ready} />
    ${viewing ? html`<${ArtViewer} src=${art} name=${artName} onClose=${() => setViewing(false)} />` : null}
  </div>`;
}

/**
 * The outfit panel of one 自选编队 operator in a dialog (screens/diy.js: the slot's 时装 button) — those operators have
 * no 干员调配 detail of their own.
 * @param {{ m: any, unit: { charId: string, name?: string } | null, onClose: () => void }} p
 */
export function OutfitDialog({ m, unit, onClose }) {
  if (!unit) return null;
  // '{name} 时装' // en: "{name}'s Outfits"
  return html`<${Modal} open=${true} onClose=${onClose} title=${t('{name} 时装', { name: unit.name || unit.charId })} micro="OUTFITS"
    class="ofit-dialog" width="min(96vw, 9.6rem)" actions=${html`<${Button} variant="primary" data-testid="outfit-dialog-close" onClick=${onClose}>${t('完成')}<//>`}>
    <${OutfitPanel} m=${m} chess=${unit} />
  <//>`;
}
