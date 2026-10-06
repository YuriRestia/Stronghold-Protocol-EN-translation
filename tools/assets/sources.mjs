// Upstream asset sources (GitHub dumps of the official client), URL helpers and
// local-path helpers shared by the asset pipeline (tools/fetch-assets.mjs).
//
// GitHub URLs support a prefix proxy and a jsDelivr fallback. jsDelivr does
// not serve the voice branch, but the prefix proxy can still be tried there.
// See docs/ASSETS.md for the full source list and credits.

export const DEFAULT_GITHUB_PROXY = 'https://gh-proxy.com/';

export function normalizeProxyPrefix(prefix = DEFAULT_GITHUB_PROXY) {
  if (prefix.trim() === '') return '';
  const url = new URL(prefix);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('GitHub proxy prefix must be an HTTPS URL without credentials, query or fragment');
  }
  return url.href.endsWith('/') ? url.href : url.href + '/';
}

function isGithubDownloadUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password &&
      ['github.com', 'raw.githubusercontent.com', 'objects.githubusercontent.com'].includes(parsed.host);
  } catch { return false; }
}

/**
 * Legacy ledgers store the successful proxy URL. Spine page jobs derived from
 * those URLs must use today's policy, not implicitly opt in to the old proxy.
 * Recognize embedded public GitHub URLs even when the old custom prefix is no
 * longer configured. An ordinary GitHub URL (including its path) stays intact.
 */
export function githubSourceUrl(url) {
  let candidate = String(url);
  while (candidate.startsWith('https://')) {
    if (isGithubDownloadUrl(candidate)) return candidate;
    const marker = candidate.indexOf('/https://', 8);
    if (marker < 0) break;
    candidate = candidate.slice(marker + 1);
  }
  return url;
}

/** Only public GitHub download URLs are sent to the proxy; never prefix twice. */
export function githubProxyUrl(url, prefix = DEFAULT_GITHUB_PROXY) {
  const normalized = normalizeProxyPrefix(prefix);
  if (!normalized || !isGithubDownloadUrl(url)) return null;
  return normalized + url;
}

/** Ordered transport alternatives; direct mode retains the existing jsDelivr order. */
export function downloadUrls(url, { source = 'direct', proxyPrefix = DEFAULT_GITHUB_PROXY } = {}) {
  url = githubSourceUrl(url);
  const proxy = source === 'mirror' ? githubProxyUrl(url, proxyPrefix) : null;
  return [...new Set([proxy, url, mirrorUrl(url)].filter(Boolean))];
}

/** Raw base URLs (always end with '/'). */
export const RAW = Object.freeze({
  yuanyan: 'https://raw.githubusercontent.com/yuanyan3060/ArknightsGameResource/main/',
  fexli: 'https://raw.githubusercontent.com/fexli/ArknightsResource/main/',
  arkModels: 'https://raw.githubusercontent.com/isHarryh/Ark-Models/main/',
  aa2: 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/cn/assets/dyn/',
  aa2voice: 'https://raw.githubusercontent.com/ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2/',
  fonts: 'https://raw.githubusercontent.com/TimWangZi/The-font-of-Arknights/master/font/',
  gamedata: 'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/',
});

const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;

/**
 * Map a raw.githubusercontent.com URL to its jsDelivr mirror.
 * @param {string} url
 * @returns {string|null} mirror URL, or null when no usable mirror exists
 */
export function mirrorUrl(url) {
  const m = RAW_RE.exec(String(url));
  if (!m) return null;
  const [, owner, repo, branch, path] = m;
  // jsDelivr does not serve the (huge) voice branch of ArknightsAssets2.
  if (owner === 'ArknightsAssets' && branch === 'voice') return null;
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

/**
 * Percent-encode each segment of a repo-relative path ('[uc]x/a b.png' → '%5Buc%5Dx/a%20b.png').
 * @param {string} relPath
 * @returns {string}
 */
export function encodePath(relPath) {
  return String(relPath).split('/').map((s) => encodeURIComponent(s)).join('/');
}

/**
 * Join a base URL and a *decoded* repo-relative path, encoding the path.
 * @param {string} base  base URL ending with '/'
 * @param {string} relPath decoded path
 * @returns {string}
 */
export function joinUrl(base, relPath) {
  return base + encodePath(relPath);
}

/**
 * Sanitize a single file-name component for local storage / URLs:
 * keeps [A-Za-z0-9._-], turns everything else (spaces, brackets, '#') into '_'.
 * @param {string} name
 * @returns {string}
 */
export function safeName(name) {
  const s = String(name).replace(/[^A-Za-z0-9._-]/g, '_');
  return s.length ? s : '_';
}

/**
 * Site-root URL path for a file under public/assets.
 * @param {string} rel path relative to public/assets (forward slashes)
 * @returns {string} e.g. '/assets/char/avatar/char_002_amiya.png'
 */
export function assetUrl(rel) {
  return '/assets/' + rel;
}

/**
 * Directory part of a URL (everything up to and including the last '/').
 * @param {string} url
 * @returns {string}
 */
export function urlDir(url) {
  const i = String(url).lastIndexOf('/');
  return i >= 0 ? url.slice(0, i + 1) : '';
}

/**
 * Last path component of a URL, percent-decoded.
 * @param {string} url
 * @returns {string}
 */
export function urlBase(url) {
  const s = String(url).split('?')[0];
  const last = s.slice(s.lastIndexOf('/') + 1);
  try { return decodeURIComponent(last); } catch { return last; }
}
