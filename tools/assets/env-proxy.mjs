// HTTP(S)_PROXY for the asset downloader, without a new dependency.
//
// Node's built-in fetch reads HTTP_PROXY / HTTPS_PROXY / NO_PROXY only at process
// startup, and only when that startup had NODE_USE_ENV_PROXY=1 or --use-env-proxy.
// fetch() honours this on Node >=22.21.0 and >=24.0.0. The CLI flag on the 24
// line is >=24.5.0, so the restart sets the variable, which 24.0.0 already honours.
// Assigning the variable later does nothing. Node 22.0–22.20 and 23 have no such
// switch; engines stay ">=22": there the downloader warns and downloads directly,
// as every version did before 0.2.2 (a proxy variable left over from another tool
// must not stop a player's setup).
//
// Nothing else reaches the built-in fetch: `node:undici` is not a public builtin,
// and setGlobalDispatcher on the npm `undici` package does not affect it. The
// fetch-assets script therefore restarts itself once. On a Node that can proxy,
// any other caller of the default fetch is rejected while a proxy is configured
// and the process was not started with the switch.

import { spawn } from 'node:child_process';

/** Names Node's env proxy actually reads (both cases). NO_PROXY alone is not a proxy. */
export const PROXY_ENV_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy'];

/** Set on the one restart, so a failed hand-off cannot spawn forever. */
export const REEXEC_MARKER = 'SP_ASSETS_ENV_PROXY_REEXEC';

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {boolean}
 */
export function proxyConfigured(env) {
  return PROXY_ENV_KEYS.some((key) => typeof env[key] === 'string' && env[key].trim() !== '');
}

/**
 * fetch() routes through HTTP(S)_PROXY when NODE_USE_ENV_PROXY is on at startup.
 * @param {string} version process.versions.node
 * @returns {boolean}
 */
export function nodeHonoursEnvProxy(version) {
  const match = /^v?(\d+)\.(\d+)/.exec(String(version ?? ''));
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major === 22) return minor >= 21;
  return major >= 24;
}

/**
 * True only for a process that was started with the switch. A value written onto
 * `process.env` afterwards does not count: Node has already decided.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {string[]} [execArgv]
 * @returns {boolean}
 */
export function startedWithEnvProxy(env, execArgv = []) {
  if (env.NODE_USE_ENV_PROXY === '1') return true;
  if (execArgv.some((arg) => arg === '--use-env-proxy' || arg === '--use_env_proxy')) return true;
  const options = env.NODE_OPTIONS;
  return typeof options === 'string' && /(?:^|\s)--use[-_]env[-_]proxy(?=\s|$)/.test(options);
}

// Captured at load. Reading process.env.NODE_USE_ENV_PROXY at fetch time would
// treat a late assignment as if Node had seen it.
const STARTED_WITH_ENV_PROXY = startedWithEnvProxy(process.env, process.execArgv);

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {string} [version]
 * @param {boolean} [startedWithFlag] defaults to this process's startup snapshot, not to `env`
 * @returns {{ action: 'off' | 'already' | 'reexec' | 'unsupported', reason: string }}
 */
export function envProxyPlan(env = process.env, version = process.versions.node, startedWithFlag = STARTED_WITH_ENV_PROXY) {
  if (!proxyConfigured(env)) return { action: 'off', reason: '' };
  if (!nodeHonoursEnvProxy(version)) {
    return {
      action: 'unsupported',
      reason: `HTTP(S)_PROXY is set, but Node ${version} does not route fetch() through it `
        + '(that needs Node >=22.21.0 or >=24.0.0, started with NODE_USE_ENV_PROXY=1); downloading directly instead.',
    };
  }
  if (startedWithFlag) return { action: 'already', reason: '' };
  return {
    action: 'reexec',
    reason: 'HTTP(S)_PROXY is set, but this process was not started with NODE_USE_ENV_PROXY=1. '
      + 'Node reads that proxy only at startup (Node >=22.21.0 or >=24.0.0). Refusing to fetch directly.',
  };
}

/**
 * The built-in fetch, or the caller's own implementation unchanged.
 * When a proxy is configured and this Node could use it but was not started with
 * the switch, the default fetch rejects instead of connecting to the origin; on a
 * Node that cannot proxy at all it warns once and connects directly.
 * @param {typeof fetch} [fetchImpl]
 * @returns {typeof fetch}
 */
export function guardDefaultFetch(fetchImpl = globalThis.fetch) {
  if (fetchImpl !== globalThis.fetch) return fetchImpl;
  let warned = false;
  return (input, init) => {
    const plan = envProxyPlan();
    if (plan.action === 'reexec') return Promise.reject(new Error(plan.reason));
    if (plan.action === 'unsupported' && !warned) { warned = true; console.warn(`[assets] ${plan.reason}`); }
    return fetchImpl(input, init);
  };
}

/**
 * Restart the current script once so Node enables env proxy before any fetch.
 * @param {object} [io]
 * @param {typeof import('node:child_process').spawn} [io.spawnImpl]
 * @param {string} [io.execPath]
 * @param {string[]} [io.execArgv]
 * @param {string[]} [io.argv]
 * @param {NodeJS.ProcessEnv} [io.env]
 * @param {(line: string) => void} [io.error]
 * @param {string} [io.version] process.versions.node
 * @returns {boolean} true when the caller must not continue (restarted, or refused); false to go on in this process
 */
export function restartForEnvProxy({
  spawnImpl = spawn,
  execPath = process.execPath,
  execArgv = process.execArgv,
  argv = process.argv,
  env = process.env,
  error = (line) => console.error(line),
  version = process.versions.node,
} = {}) {
  const plan = envProxyPlan(env, version);
  if (plan.action === 'off' || plan.action === 'already') return false;
  if (plan.action === 'unsupported') {
    error(`[assets] ${plan.reason}`);
    return false;
  }
  if (env[REEXEC_MARKER] === '1') {
    error('[assets] refused to restart again for HTTP(S)_PROXY');
    process.exitCode = 1;
    return true;
  }
  error('[assets] HTTP(S)_PROXY is set; restarting once with NODE_USE_ENV_PROXY=1 so fetch() uses it.');
  const child = spawnImpl(execPath, [...execArgv, ...argv.slice(1)], {
    env: { ...env, NODE_USE_ENV_PROXY: '1', [REEXEC_MARKER]: '1' },
    stdio: 'inherit',
  });
  child.on('error', (e) => {
    error(`[assets] could not restart with NODE_USE_ENV_PROXY: ${e.message}`);
    process.exitCode = 1;
  });
  child.on('close', (code) => { process.exitCode = code ?? 1; });
  return true;
}
