// (fork) A short hold on building the battlefield (ui/fieldHost.js mountFieldView → render/app.js createFieldView, whose
// tile atlas holds the main thread ~1.7 s on a desktop). One for All's reveal (ui/protocolBoot.js) runs its beats on a JS
// clock right as the match screen mounts in BATTLE_CHECK, where the field is built too: with both at once the glitch
// and snap sounds waited behind the build and played together. The reveal holds the build until its picks have
// resolved; the downloads and imports keep going meanwhile, only the build itself waits. Nothing else sets it, so a
// normal match builds its field as before.

/** The longest hold (ms): the 8-seat reveal resolves by ~4.9 s, and BATTLE_CHECK runs 7.5 s in One for All. */
export const FIELD_HOLD_MAX_MS = 5000;

let until = 0;

const now = () => performance.now();

/** Hold the field build for `ms` from now (at most FIELD_HOLD_MAX_MS; a longer hold already set stays). */
export function holdFieldBuild(ms) {
  const ms2 = Math.max(0, Math.min(Number(ms) || 0, FIELD_HOLD_MAX_MS));
  until = Math.max(until, now() + ms2);
}

/** End the hold now (the reveal left early). */
export function releaseFieldBuild() { until = 0; }

/** ms left on the hold (0: none). */
export function fieldBuildHeldFor() { return Math.max(0, until - now()); }

/**
 * Resolves once no hold is on (at once without one); rejects with the signal's reason when it aborts first.
 * @param {AbortSignal} [signal]
 */
export function fieldBuildReady(signal) {
  if (fieldBuildHeldFor() <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer = 0;
    const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? new DOMException('Aborted', 'AbortError')); };
    // re-checked every 100 ms at most, so a release (or a longer hold) is seen; ends by FIELD_HOLD_MAX_MS after the last hold
    const check = () => {
      const left = fieldBuildHeldFor();
      if (left <= 0) { signal?.removeEventListener('abort', onAbort); resolve(); return; }
      timer = setTimeout(check, Math.min(left, 100));
    };
    if (signal?.aborted) { onAbort(); return; }
    signal?.addEventListener('abort', onAbort, { once: true });
    check();
  });
}
