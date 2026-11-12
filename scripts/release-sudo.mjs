// scripts/release-sudo.mjs — (fork) the remembered sudo password of a server that asks for one (the US server), for
// scripts/release.mjs. Windows only.
//
// Where: %LOCALAPPDATA%\Stronghold-Protocol\release\sudo-<host>.dpapi, encrypted with Windows DPAPI for the current
// Windows user (PowerShell ConvertFrom-SecureString). Only this Windows account on this PC can decrypt it: another
// account, another PC, or a copy of the file (a backup, a synced folder, the repo) cannot. It does not protect against
// programs running as you on this PC: those can decrypt it the way this script does.
//
// The password is typed into PowerShell's own hidden prompt (Read-Host -AsSecureString), never echoed, never on a
// command line, never in the repo or a log. To use it, it is decrypted into memory and written to `sudo -S` on the
// server through ssh's stdin. `node scripts/release.mjs --forget-sudo` deletes the file. The server's sudoers stay as
// they are.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const HOST_RE = /^[A-Za-z0-9._@-]+$/;
const MAX_BLOB = 64 * 1024;

export function storeDir(env = process.env) {
  const base = env.LOCALAPPDATA || (env.USERPROFILE && join(env.USERPROFILE, 'AppData', 'Local'));
  if (!base) throw new Error('no %LOCALAPPDATA%: the remembered sudo password needs Windows');
  return join(base, 'Stronghold-Protocol', 'release');
}

/** @param {string} host */
export function storeFile(host, env = process.env) {
  if (!HOST_RE.test(host)) throw new Error(`not an ssh host name: ${host}`);
  return join(storeDir(env), `sudo-${host}.dpapi`);
}

const ps = (script, opts = {}) => spawnSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', windowsHide: false, maxBuffer: MAX_BLOB, ...opts });

/**
 * Ask for the password in PowerShell's hidden prompt and store it encrypted. Returns the plain text (memory only).
 * @param {string} host
 */
export function askAndRemember(host) {
  if (process.platform !== 'win32') throw new Error('the remembered sudo password needs Windows (DPAPI)');
  const file = storeFile(host);
  // the prompt goes to the console, the encrypted text to stdout; the plain password never leaves PowerShell here
  const r = ps(`$s = Read-Host -AsSecureString -Prompt 'sudo password for ${host} (typed once, stored encrypted for your Windows user)'; if ($s.Length -eq 0) { exit 3 }; ConvertFrom-SecureString $s`,
    { stdio: ['inherit', 'pipe', 'inherit'] });
  if (r.status === 3) throw new Error('no password typed');
  const blob = String(r.stdout || '').trim();
  if (r.status !== 0 || !/^[0-9a-f]+$/i.test(blob)) throw new Error(`PowerShell could not encrypt the password (exit ${r.status})`);
  if (blob.length > MAX_BLOB) throw new Error(`the encrypted password is over ${MAX_BLOB} bytes; nothing was stored`);
  mkdirSync(storeDir(), { recursive: true });
  writeFileSync(file, blob, { mode: 0o600 });
  console.log(`[sudo] the password for ${host} is stored encrypted for your Windows user: ${file}`);
  return load(host);
}

/** The stored password in plain text (memory only), or null when none is stored. @param {string} host */
export function load(host) {
  const file = storeFile(host);
  if (!existsSync(file)) return null;
  const blob = readFileSync(file, 'utf8').trim();
  if (blob.length > MAX_BLOB || !/^[0-9a-f]+$/i.test(blob)) throw new Error(`${file} is not a stored password; delete it with --forget-sudo`);
  // the encrypted text goes in through stdin, the plain text comes back through stdout: neither is on a command line
  const r = ps('$b = [Console]::In.ReadToEnd().Trim(); $s = ConvertTo-SecureString $b; '
    + '$p = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); '
    + 'try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }',
  { input: blob, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  if (r.status !== 0) throw new Error(`the stored password for ${host} cannot be decrypted (another Windows user or PC?); delete it with --forget-sudo`);
  return r.stdout;
}

/** Delete the stored password of `host`, or of every host. Returns the files deleted. @param {string} [host] */
export function forget(host) {
  if (host) { const f = storeFile(host); if (!existsSync(f)) return []; unlinkSync(f); return [f]; }
  let dir;
  try { dir = storeDir(); } catch { return []; }
  if (!existsSync(dir)) return [];
  const gone = [];
  for (const n of readdirSync(dir)) if (/^sudo-[A-Za-z0-9._@-]+\.dpapi$/.test(n)) { unlinkSync(join(dir, n)); gone.push(join(dir, n)); }
  return gone;
}
