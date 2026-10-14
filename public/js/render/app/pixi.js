// public/js/render/app/pixi.js — load PIXI and pixi-spine once (one module-level promise).

import { genUrl } from '../../gen.js';

const VENDOR = { pixi: genUrl('/vendor/pixi.min.js'), spine: genUrl('/vendor/pixi-spine.js') };

let pixiPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

/** Make sure PIXI and PIXI.spine exist (classic scripts; loaded once). */
export function ensurePixi() {
  if (globalThis.PIXI && globalThis.PIXI.spine) return Promise.resolve(globalThis.PIXI);
  if (!pixiPromise) {
    pixiPromise = (async () => {
      if (!globalThis.PIXI) await loadScript(VENDOR.pixi);
      if (!globalThis.PIXI?.spine) await loadScript(VENDOR.spine);
      if (!globalThis.PIXI || !globalThis.PIXI.spine) throw new Error('PIXI / pixi-spine unavailable');
      return globalThis.PIXI;
    })();
    pixiPromise.catch(() => { pixiPromise = null; });
  }
  return pixiPromise;
}
