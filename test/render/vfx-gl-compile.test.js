// test/render/vfx-gl-compile.test.js — (fork) the fx programs build without stalling a frame: with
// KHR_parallel_shader_compile FxGL.program starts the build, asks only COMPLETION_STATUS_KHR (which never waits) until
// the driver is done and skips the draw meanwhile; without it the build blocks as before. The warm-up starts every
// queued program in one frame and keeps the unfinished ones queued in order. A fake WebGL2 context counts the queries
// that wait for the compile (COMPILE_STATUS / LINK_STATUS).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { FxGL } from '../../public/js/render/vfx/gl.js';
import { OfficialFx, WARM_MS } from '../../public/js/render/vfx/system.js';

const COMPLETION = 0x91b1;

/** A WebGL2 stand-in: constants are their own names, unknown calls return a fresh object. */
function fakeGl({ parallel = true, linkOk = true } = {}) {
  const st = { done: false, blocking: 0, completionAsks: 0, linked: 0 };
  const ext = parallel ? { COMPLETION_STATUS_KHR: COMPLETION } : null;
  const own = {
    getExtension: (n) => (n === 'KHR_parallel_shader_compile' ? ext : null),
    getContextAttributes: () => ({ depth: true }),
    getShaderParameter: (s, p) => { if (p === 'COMPILE_STATUS') st.blocking++; return true; },
    getProgramParameter: (prog, p) => {
      if (p === COMPLETION) { st.completionAsks++; return st.done; }
      if (p === 'LINK_STATUS') { st.blocking++; return linkOk || prog.depth; }
      if (p === 'ACTIVE_UNIFORMS') return 0;
      return null;
    },
    getProgramInfoLog: () => 'bad link',
    linkProgram: () => { st.linked++; },
    createProgram: () => ({ depth: st.linked === 0 }),   // the first program is the depth pre-pass (blocking, in _init)
  };
  const gl = new Proxy(own, {
    get: (t, k) => (k in t ? t[k] : typeof k === 'string' && /^[A-Z0-9_]+$/.test(k) ? k : () => ({})),
  });
  return { gl, st };
}

const lib = { texture: () => null, mesh: () => null };
const mat = (family = 'basic') => ({ family, defs: {}, key: `${family}|000`, textures: [] });

describe('FxGL programs', () => {
  test('with KHR_parallel_shader_compile the first call starts the build and nothing waits for it', () => {
    const { gl, st } = fakeGl();
    const r = new FxGL(gl, lib);
    st.blocking = 0;
    assert.ok(r.parallel);
    assert.equal(r.program('quad', mat()), null, 'still building: the draw skips it');
    assert.equal(r.building('quad', mat()), true);
    assert.equal(r.program('quad', mat()), null);
    assert.equal(st.blocking, 0, 'no COMPILE_STATUS / LINK_STATUS query while it builds');
    assert.equal(st.completionAsks, 1);
    st.done = true;
    const rec = r.program('quad', mat());
    assert.ok(rec && rec.prog, 'done: the program record');
    assert.equal(r.building('quad', mat()), false);
    assert.equal(r.stats.programs, 1);
    assert.equal(r.program('quad', mat()), rec, 'kept');
    assert.equal(st.linked, 2, 'linked once (plus the depth pre-pass)');
  });

  test('without the extension the program is built at once (blocking, as before)', () => {
    const { gl, st } = fakeGl({ parallel: false });
    const r = new FxGL(gl, lib);
    st.blocking = 0;
    assert.equal(r.parallel, null);
    const rec = r.program('mesh', mat('mask'));
    assert.ok(rec && rec.prog);
    assert.equal(r.building('mesh', mat('mask')), false);
    assert.equal(st.blocking, 3, 'two compile statuses and the link status');
  });

  test('a build that fails to link ends as null (warned once) and is not built again', (t) => {
    const warn = t.mock.method(console, 'warn', () => {});
    const { gl, st } = fakeGl({ linkOk: false });
    const r = new FxGL(gl, lib);
    assert.equal(r.program('strip', mat('disturbCd')), null);
    st.done = true;
    assert.equal(r.program('strip', mat('disturbCd')), null);
    assert.equal(r.building('strip', mat('disturbCd')), false);
    assert.equal(r.program('strip', mat('disturbCd')), null);
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(st.linked, 2);
    assert.equal(r.stats.programs, 0);
  });

  test('destroy deletes a program still building and its shaders', () => {
    const { gl } = fakeGl();
    const del = { programs: 0, shaders: 0 };
    const real = gl;
    const counting = new Proxy({}, { get: (t, k) => (k === 'deleteProgram' ? () => { del.programs++; } : k === 'deleteShader' ? () => { del.shaders++; } : real[k]) });
    const r = new FxGL(counting, lib);
    r.program('quad', mat());
    del.programs = 0; del.shaders = 0;
    r.destroy();
    assert.equal(del.shaders, 2);
    assert.equal(del.programs, 2, 'the building one and the depth pre-pass');
  });
});

describe('warm-up', () => {
  /** _warmStep on a stand-in system: a glr that records its calls; textures take `texMs` each. */
  const sys = (parallel, texMs = 0) => {
    const calls = [];
    const busy = (ms) => { const t = performance.now(); while (performance.now() - t < ms) { /* spin */ } };
    const building = new Set(), started = new Set();
    const glr = {
      parallel: parallel ? {} : null,
      program: (kind, m) => { const k = `${kind}|${m.key}`; calls.push('p:' + k); if (parallel && !started.has(k)) { started.add(k); building.add(k); } return parallel && building.has(k) ? null : {}; },
      building: (kind, m) => building.has(`${kind}|${m.key}`),
      texture: (key) => { calls.push(`t:${key}`); busy(texMs); return {}; },
    };
    const s = { warmQueue: [], glr, lite: false, calls, building };
    s.step = () => OfficialFx.prototype._warmStep.call(s);
    return s;
  };
  const P = (f) => ({ id: `quad|${f}|000`, kind: 'quad', mat: mat(f) });
  const T = (k) => ({ id: 't|' + k, tex: k, tries: 0 });

  test('every queued program starts in the first frame even once the budget is spent; textures wait for theirs', () => {
    const s = sys(true, WARM_MS + 1);
    s.warmQueue.push(T('a'), P('basic'), T('b'), P('mask'));
    s.step();
    assert.deepEqual(s.calls, ['t:a', 'p:quad|basic|000', 'p:quad|mask|000'], 'texture b waits for the next frame');
    assert.deepEqual(s.warmQueue.map((w) => w.id), ['quad|basic|000', 't|b', 'quad|mask|000'], 'unfinished ones keep their order');
    // the builds finish: the next frame drops them and uploads texture b
    s.building.clear(); s.calls.length = 0;
    s.step();
    assert.deepEqual(s.calls, ['p:quad|basic|000', 't:b', 'p:quad|mask|000']);
    assert.equal(s.warmQueue.length, 0);
  });

  test('without parallel builds a program counts against the budget, as before', () => {
    const s = sys(false, WARM_MS + 1);
    s.warmQueue.push(T('a'), P('basic'), P('mask'));
    s.step();
    assert.deepEqual(s.calls, ['t:a']);
    assert.deepEqual(s.warmQueue.map((w) => w.id), ['quad|basic|000', 'quad|mask|000']);
    s.calls.length = 0;
    s.step();
    assert.deepEqual(s.calls, ['p:quad|basic|000', 'p:quad|mask|000']);
    assert.equal(s.warmQueue.length, 0);
  });

  test('a texture whose image still loads is asked once per frame, at most 120 times', () => {
    const s = sys(true);
    s.glr.texture = () => null;
    s.warmQueue.push(T('slow'));
    for (let i = 0; i < 119; i++) s.step();
    assert.equal(s.warmQueue.length, 1);
    s.step();
    assert.equal(s.warmQueue.length, 0);
  });
});
