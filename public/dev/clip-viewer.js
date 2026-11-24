// public/dev/clip-viewer.js — dev page: every Spine clip of one model, each looping in its own labelled cell, so a clip
// can be judged on its own (the Steam Knight slice's review: which official clip goes where).
// Query: ?id=<model id, default enemy_1533_stmkgt> &clips=<name,name,…> (default: all) &cols=<n> &speed=<x> &scale=<x>
//        &time=<s> (paused at that clip time in every cell) &label=0
// Puppeteer hook: window.__clips = { ready, error, names }

import { ensurePixi } from '../js/render/app/pixi.js';
import { assets } from '../js/assets.js';

const q = new URLSearchParams(location.search);
const api = { ready: false, error: null, names: [] };
window.__clips = api;

(async () => {
  try {
    const P = await ensurePixi();
    await assets.ready?.();
    await assets.local?.();
    const id = q.get('id') || 'enemy_1533_stmkgt';
    const entry = assets.spineEntry(id, { back: false });
    if (!entry) throw new Error(`no model for ${id}`);
    const data = await assets.spine.acquire(entry);
    const host = document.getElementById('field');
    const app = new P.Application({ resizeTo: host, backgroundColor: 0x1a201e, antialias: true });
    host.appendChild(app.view);
    const all = (data.animations || []).map((a) => a.name);
    const want = (q.get('clips') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const names = want.length ? want.filter((n) => all.includes(n)) : all.filter((n) => !/^Default/.test(n));
    api.names = names;
    const cols = Math.max(1, Number(q.get('cols')) || Math.ceil(Math.sqrt(names.length * 16 / 9)));
    const rows = Math.ceil(names.length / cols);
    const speed = Number(q.get('speed')) > 0 ? Number(q.get('speed')) : 1;
    const fixed = q.get('time') != null ? Number(q.get('time')) : null;
    const cells = [];
    const layout = () => {
      const W = app.renderer.width, H = app.renderer.height, cw = W / cols, ch = H / rows;
      const s = (Number(q.get('scale')) || 1) * Math.min(cw, ch) / 900;
      cells.forEach((c, i) => {
        const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
        c.sp.position.set(x + cw / 2, y + ch * 0.86);
        c.sp.scale.set(s);
        c.box.clear().lineStyle(1, 0x3a4742).drawRect(x + 1, y + 1, cw - 2, ch - 2);
        c.txt.position.set(x + 8, y + 6);
        c.txt.style.fontSize = Math.max(12, Math.round(ch / 14));
      });
    };
    for (const name of names) {
      const sp = new P.spine.Spine(data);
      sp.autoUpdate = false;
      sp.state.setAnimation(0, name, true);
      const box = new P.Graphics();
      const dur = data.findAnimation(name)?.duration ?? 0;
      const txt = new P.Text(`${name}  ${dur.toFixed(2)} s`, { fill: 0xe8f0ec, fontFamily: 'Bender, sans-serif', fontSize: 16 });
      if (q.get('label') === '0') txt.visible = false;
      app.stage.addChild(box, sp, txt);
      cells.push({ sp, box, txt, dur, name });
    }
    layout();
    app.renderer.on?.('resize', layout);
    window.addEventListener('resize', layout);
    if (fixed != null) for (const c of cells) { c.sp.state.tracks[0].trackTime = Math.min(fixed, c.dur); c.sp.update(0); }
    else app.ticker.add(() => { const dt = app.ticker.deltaMS / 1000 * speed; for (const c of cells) c.sp.update(dt); });
    api.ready = true;
  } catch (err) {
    api.error = String(err && err.message || err);
    document.body.append(Object.assign(document.createElement('pre'), { textContent: api.error, style: 'color:#f88' }));
  }
})();
