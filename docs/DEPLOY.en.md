# Deployment guide

> English translation of [DEPLOY.md](DEPLOY.md). The Chinese original is the authoritative version.

Goal: run a long-lived server on a small Windows home PC so friends can play over the LAN or the internet. macOS / Linux / Docker come later.
All commands run in the project root. When something goes wrong, run `node tools/doctor.mjs` first (read-only diagnostics).

## 0. Resource requirements

| Item | Notes |
|---|---|
| Server CPU | Battles are simulated in each player's browser (DESIGN §14); the server only handles rounds, the economy and validation: **about 1 ms of CPU per room per battle round**. The battlefields of AI teammates / disconnected players are simulated by the server: at the start of a battle, 3 AI battlefields take about 0.2–0.5 s of CPU on a dev machine, and possibly several seconds on a mini PC (run in 8 ms slices, so other rooms don't stall). `SP_VERIFY=all` re-simulates every human battlefield and noticeably increases CPU; on a mini PC keep it at `off` or `sample`. |
| Server memory | About 100 MB idle, plus a few MB per running match. |
| Network | In a 4-player match the server sends about 0.25 MB per round (measured, DESIGN §14). On first entering the game the browser downloads the images / Spine models / audio it needs from the host (loaded on demand, browser-cached afterwards); over a low-bandwidth internet tunnel the first time will be slower. |
| Disk | About 550 MB of assets (`public/assets`, including two sets of Operator voices: about 65 MB Chinese and 85 MB Japanese) + about 125 MB of dependencies (`node_modules`; the bundles carry only the runtime dependencies, about 65 MB); the optional local extraction adds about 40 MB (`.venv-extract`) + 70 MB of textures (see section 6). The full bundle is about 710 MB unzipped. |
| Player devices | A modern browser with WebGL (latest Chrome / Edge / Firefox / Safari), on PC, phone or tablet (landscape). Older devices can lower the graphics quality in Settings or open `/?board=2d`. |

The server is **stateless**: rooms and matches exist only in memory; there is no database and no save files, so **no backups are needed**. Restarting the server ends running matches (including a Solo Simulation you could otherwise have returned to within 24 hours after a disconnect).

## 1. Windows mini PC: step by step

### 1.1 Install and first start

1. Install Node.js 22 LTS and Git (in PowerShell or "Terminal"; Git is not needed when using the bundles below):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   ```
   After installing, **close and reopen** the terminal; `node -v` should show v22 or later (winget's LTS is currently v24.x, which also works). Without winget, download the installers from <https://nodejs.org/en/download> and <https://git-scm.com/download/win>.
2. Download — pick one of three. Put it in a fixed, short directory that is **not synced by OneDrive**, e.g. `C:\Stronghold-Protocol`:
   - **Full bundle (recommended)**: download the latest version's `Stronghold-Protocol-v<version>.zip` from the repository's [Releases](https://github.com/sganggs/Stronghold-Protocol/releases) page (about 505 MB, about 710 MB unzipped; it already contains the runtime dependencies, front-end libraries and all assets, including both the Chinese and Japanese Operator voices and local-client assets such as the official 3D board), unzip it and put the `Stronghold-Protocol` folder inside at the location above. No Git needed, and the first start doesn't download assets again. The assets are copyright of Hypergryph / Yostar and for non-commercial use only; see [NOTICE.en.md](../NOTICE.en.md).
   - **Lite bundle**: `Stronghold-Protocol-v<version>-lite.zip` on the same page (about 22 MB). The code, runtime dependencies and front-end libraries are the same as in the full bundle, but without assets: the art, Spine models, audio (including both sets of Operator voices), fonts, emotes and "How to Play" tutorial images are downloaded by setup from public mirrors on first start (about 550 MB, with progress, resumable if interrupted; for the mirror settings see "Mirror downloads in mainland China" below). Local-client assets such as the official 3D board have to be extracted with a local client, or copied from the full bundle of the same version (section 6). Useful when downloading large files is inconvenient, or to start with a small download; place it the same way as the full bundle.
   - **Source**:
     ```powershell
     git clone https://github.com/sganggs/Stronghold-Protocol.git C:\Stronghold-Protocol
     ```
3. Double-click `C:\Stronghold-Protocol\scripts\start-windows.bat`. The first time it will: install dependencies (`npm ci`; included in the bundles, skipped) → copy the front-end libraries (included in the bundles, skipped) → download about 550 MB of assets (included in the full bundle, skipped; the lite bundle and the source download them at this step, with progress, resuming if interrupted and started again) → if it detects a local Arknights client, ask whether to extract the official textures (can be skipped) → start the server and open the browser.
4. The window prints addresses friends can use, e.g. `http://192.168.1.23:3000`. Open it on another device to confirm you can get in. Closing the window stops the server.

Equivalent manual commands: `npm ci`, `node tools/setup.mjs`, `npm start`.

#### Mirror downloads in mainland China

By default setup uses "raw GitHub source → jsDelivr"; it does not look up your public IP and does not contact gh-proxy.com. When a GitHub download fails it tells you how to turn on the mirror by hand; it only adds the hint and never switches to a third-party proxy by itself.

The mirror works by putting `https://gh-proxy.com/` in front of the full GitHub URL, for example:

```text
https://gh-proxy.com/https://raw.githubusercontent.com/OWNER/REPO/BRANCH/file.png
```

Once turned on by hand, the order is "prefix mirror → raw source → jsDelivr". Indexes, images, Spine, audio and fonts all follow this rule (the audio voice branch skips jsDelivr). The mirror is a third-party proxy; for now only the format and size are checked, with no content hash check, so decide for yourself whether to trust and enable it. npm / pip dependencies don't use the GitHub prefix.

```powershell
node tools/setup.mjs --asset-source=mirror  # prefer the mirror, set by hand
node tools/setup.mjs --asset-source=direct  # default: raw source and jsDelivr only, no prefix proxy
$env:SP_ASSET_SOURCE = 'mirror'             # or turn it on explicitly with the environment variable
```

`node tools/fetch-assets.mjs` supports `--asset-source=direct|mirror` too. The command line takes precedence over `SP_ASSET_SOURCE`. The default mirror prefix is `https://gh-proxy.com/`; `SP_GITHUB_PROXY` sets another HTTPS prefix, and setting only the prefix does not turn the mirror on. Setting `SP_GITHUB_PROXY` to an empty string (or only spaces) disables the prefix proxy completely, even in `mirror` mode; leaving the variable unset is different from setting it empty, since unset uses the default prefix. Some versions of Windows PowerShell treat an empty value as deleting the variable: set `$env:SP_GITHUB_PROXY = ' '` or use `--asset-source=direct` to disable it explicitly. The prefix is only applied to GitHub download URLs, and never added twice.

Each URL is tried only once through the mirror, with an 8-second timeout for the response headers and a separate idle timeout for the body; on failure the raw source is tried. 3 network errors, HTTP errors or invalid contents in a row turn the mirror off for the rest of the run, a state the following indexes, assets and fonts share; mirror requests in flight are aborted and fall back too. A success resets the failure count; 404 / 410 means the resource doesn't exist and does not trip the breaker. Running the script again retries a mirror turned on by hand. The raw source's retries, skipping of existing files and 0.1.1's manifest-shrink protection are unchanged.

Supplementary Spine textures derived from the earlier download records also choose their source by the current setting, so after disabling the mirror they don't keep the old proxy URL.

### 1.2 Firewall

- On first start Windows shows a "Windows Security Alert": tick **Private networks** and click "Allow access".
- If there was no prompt or you clicked the wrong thing, add the rule from an **administrator** PowerShell (the start-on-boot script below also adds it automatically):
  ```powershell
  netsh advfirewall firewall add rule name="Stronghold Protocol" dir=in action=allow protocol=TCP localport=3000 profile=private,domain
  ```
- If your home network is a "Public network", Windows blocks incoming connections. Change it to private (administrator PowerShell; find the adapter name with `Get-NetConnectionProfile`):
  ```powershell
  Set-NetConnectionProfile -InterfaceAlias "Ethernet" -NetworkCategory Private
  ```
- `node tools/doctor.mjs` shows whether the rule exists, the type of each network, and the addresses friends can use.

### 1.3 Fixed LAN IP (recommended)

If the host's IP changes, the address your friends bookmarked stops working. The recommended fix is to bind the mini PC's MAC address to a fixed IP (e.g. `192.168.1.50`) under "DHCP static allocation / address reservation" in the **router** admin page. You can also set it by hand in Windows under "Settings → Network & Internet → Properties → IP assignment → Edit" (IP, subnet mask, gateway and DNS must match the router, and must not clash with other devices).

### 1.4 Run automatically in the background on boot

First close the `start-windows.bat` window (otherwise the port clashes), then run in the project directory (it requests administrator rights automatically):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-service-windows.ps1
```

It will: run `tools/setup.mjs` once → write the settings to `scripts\service.env.cmd` (node.exe path, port, etc.) → register the scheduled task **StrongholdProtocol** (runs `scripts\run-server.cmd` as SYSTEM 20 seconds after boot, no login needed; restarts automatically 5 seconds after the server exits) → add the firewall rule → start immediately and show the status. Logs are in `logs\server.log` (rotated automatically above 10 MB).

| Need | Command (all appended after `powershell -ExecutionPolicy Bypass -File scripts\install-service-windows.ps1`) |
|---|---|
| Change port / other settings | `-Port 8080`, `-Verify sample`, `-Combat server`, `-BindHost 127.0.0.1` (for use behind a reverse proxy only) |
| Also allow public networks | `-AllowPublicNetwork` (usually not needed; may be needed when the Tailscale adapter is detected as a public network) |
| Show status and recent logs | `-Status` |
| Restart (after updating the code) | `-Restart` |
| Stop | `-Stop` (still starts automatically on next boot) |
| Uninstall | `-Uninstall` (removes the scheduled task, the firewall rule and `service.env.cmd`) |

Also disable sleep, or the mini PC will sleep when idle: `powercfg /change standby-timeout-ac 0`.

<details>
<summary>Alternative: register a real Windows service with NSSM</summary>

```powershell
winget install NSSM.NSSM            # or download from https://nssm.cc
nssm install StrongholdProtocol "C:\Program Files\nodejs\node.exe" server\index.js
nssm set StrongholdProtocol AppDirectory C:\Stronghold-Protocol
nssm set StrongholdProtocol AppEnvironmentExtra PORT=3000 HOST=::
nssm set StrongholdProtocol AppStdout C:\Stronghold-Protocol\logs\server.log
nssm set StrongholdProtocol AppStderr C:\Stronghold-Protocol\logs\server.log
nssm start StrongholdProtocol
```

The firewall rule still has to be added by hand as in 1.2. Use only one of the two approaches.
</details>

### 1.5 Updating

```powershell
cd C:\Stronghold-Protocol
powershell -ExecutionPolicy Bypass -File scripts\install-service-windows.ps1 -Stop   # if start-on-boot is installed
git checkout -- data/assets.json    # the asset manifest is regenerated by setup; restore it first to avoid git pull conflicts
git pull
npm ci
node tools/setup.mjs                # download any newly added assets (existing files are skipped)
powershell -ExecutionPolicy Bypass -File scripts\install-service-windows.ps1 -Restart
```

Without start-on-boot, replace the last step with double-clicking `start-windows.bat` again.

#### Installed from a bundle: the update bundle

From 0.2.1 on, besides the full and lite bundles, every version in Releases has an update bundle `Stronghold-Protocol-v<version>-update.zip`: it contains only the files changed since the earlier 0.2.x versions (program, data, runtime dependencies, and changed assets), usually only a few MB. It upgrades a folder installed from a 0.2.0-or-later full or lite bundle (the versions it applies to are listed in the Releases notes); for a fresh install, 0.1.x or GitHub's "Download ZIP" source archive use the full or lite bundle, and a `git clone` uses the `git pull` above.

```powershell
cd C:\Stronghold-Protocol
powershell -ExecutionPolicy Bypass -File scripts\install-service-windows.ps1 -Stop   # with start-on-boot; otherwise close the server window
Expand-Archive -Force <download folder>\Stronghold-Protocol-v<version>-update.zip C:\       # extract into the install folder's parent, merging into C:\Stronghold-Protocol and overwriting files with the same name
powershell -ExecutionPolicy Bypass -File scripts\install-service-windows.ps1 -Restart
```

Without start-on-boot, replace the last step with double-clicking `start-windows.bat`. You can also open the zip in Explorer, copy the entire contents of its `Stronghold-Protocol` folder into the install folder, and choose "Replace the files in the destination". macOS / Linux: after stopping the server run `unzip -o Stronghold-Protocol-v<version>-update.zip -d <the install folder's parent>` (the install folder is named `Stronghold-Protocol`); don't drag and drop in Finder, which replaces the whole folder of the same name.

On start (double-click, `npm start`, the start-on-boot scheduled task, NSSM / systemd alike) the server first finishes the update: it checks every program file against `MANIFEST.json` (code, data, runtime dependencies, front-end libraries and documentation; assets belong to setup and are not included), deletes the old files listed in `UPDATE.json` that the new version no longer uses (only files whose content is exactly as the old version shipped them: files you changed, content packs you installed, `logs` and `.cache` are never touched), renames `UPDATE.json` to `.update-applied.json`, and then starts as usual, with a line "updated to v<version>" in the log.

- **The folder is not the version the update bundle is for** (e.g. 0.1.x, only partly extracted, program files modified): the server **does not start**, says "this update bundle can only be applied over a bundle install of v0.2.0 … (N files differ from v<version> or are missing)" and names a few of the files (with start-on-boot, they are in the log `-Status` shows). Running old and new files mixed together easily causes errors that look like game bugs, so it would rather not start. Download the full bundle and reinstall, or extract the whole update bundle again and start (`UPDATE.json` is still there and is checked again; nothing is deleted before that).
- Only files in the documentation, `scripts\` or `tools\` differ: it starts as usual and lists those files in the log. A damaged `UPDATE.json`: skipped with a notice, and it starts with the existing files.
- **Lite-bundle installs work too**: the program part is exactly the same as the full bundle's; the update bundle carries the assets that changed in the full bundle, and setup fills in the rest. If the update bundle brings a new local-client asset manifest (`data/local-assets.json`) and this machine doesn't have the matching assets, the start tells you: copy `public/assets/local/` from the full bundle of the same version (section 6), or run `node tools/setup.mjs --local` to extract them, or just delete `data/local-assets.json` if you don't need them.
- The update bundle does not go online and does not update itself; like the full bundle you download it from Releases by hand. The "File check MANIFEST.json" line of `npm run doctor` shows at any time whether every program file matches this version (a source checkout has no such file and is not checked).

You can also do without the update bundle: stop the server, unzip the new version's bundle into a new directory and start from there (the full bundle includes the assets; if start-on-boot is installed, run `install-service-windows.ps1` once more from the new directory). With the lite bundle or GitHub's "Download ZIP" source archive: after unzipping the new version, copy `public\assets`, `public\fonts`, `.cache` and `data\local-assets.json` (if present) over from the old directory to avoid re-downloading (setup only downloads the newly added assets).

## 2. Letting friends on other networks join

### 2.1 Tailscale / ZeroTier (recommended for a home mini PC)

Build a virtual LAN: no public IP, no router changes, nothing exposed to the internet.

- **Tailscale**: the host and friends all install <https://tailscale.com/download> (Windows: `winget install Tailscale.Tailscale`) and log in. When friends use their own accounts, "Share" this host with them in the Tailscale admin console, or invite them to your tailnet. Friends open `http://<host's 100.x.y.z address>:3000` (check it with `tailscale ip -4`; with MagicDNS on you can also use `http://<hostname>:3000`).
- **ZeroTier**: create a network at <https://my.zerotier.com>, the host and friends install the client and join the same Network ID, and you tick to authorize members in the console; open `http://<host's ZeroTier IP>:3000`.
- If it won't connect, run `node tools/doctor.mjs`: check whether Windows detects the VPN adapter as a "Public network"; if so, change it to private as in 1.2, or add `-AllowPublicNetwork` when installing start-on-boot.

### 2.2 cloudflared quick tunnel (friends install nothing)

```powershell
winget install --id Cloudflare.cloudflared      # macOS: brew install cloudflared
cloudflared tunnel --url http://localhost:3000
```

Send friends the `https://xxxx.trycloudflare.com` it prints. When the page is https the client switches to `wss://` automatically, no configuration needed; the server identifies the real source through the `CF-Connecting-IP` forwarded by the tunnel (`TRUST_PROXY=auto`). A quick tunnel's address changes every start and has no availability guarantee; for a fixed address use a "named tunnel" with a Cloudflare account + your own domain.

### 2.3 Router port forwarding

Only if you have a **public IPv4 address** (many broadband connections are behind carrier-grade NAT with no public IP; in that case use 2.1 / 2.2):

1. First fix the host's LAN IP as in 1.3.
2. In the router's "virtual server / port forwarding": external port 3000 (or any port) → internal `hostIP:3000`, TCP.
3. Friends open `http://<your public IP>:external port`.

Note: the game has no account system — anyone who knows the address can get in. The server limits internet connections per network (at most 64 connections per network, and room / match counts are capped too), but it's still best to turn the forwarding off when not playing, or prefer Tailscale.

### 2.4 Reverse proxy and HTTPS (when you have a domain)

It must be deployed at the **root path of the domain** (the client uses absolute paths such as `/data/`, `/vendor/` and `/ws`; mounting under a sub-path is not supported). The proxy must forward WebSocket upgrades (path `/ws`). Have the server listen on the local machine only: `HOST=127.0.0.1` (Windows start-on-boot: `-BindHost 127.0.0.1`).

**Caddy** (obtains HTTPS certificates automatically; WebSocket needs no extra configuration):

```caddy
game.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

**Nginx**:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
server {
    listen 443 ssl http2;   # newer Nginx (from 1.25.1): write listen 443 ssl; and add a line http2 on;
    server_name game.example.com;
    ssl_certificate     /etc/letsencrypt/live/game.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/game.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 1h;      # long-lived WebSocket connections
    }
}
```

**HTTP/2**: the client is made of hundreds of small script modules (about 340 when entering a match, from 0.2.0 on). Across the internet, have the proxy serve the page over HTTP/2: all modules share one connection, and distant players enter their first match noticeably faster. Caddy uses HTTP/2 by default; for Nginx see `http2` above. The server itself only speaks HTTP/1.1; LAN or local play is not affected.

About https / wss: when the page is opened over https the client connects to `wss://same-domain/ws` automatically; over http it uses `ws://`. The server itself only speaks http; certificates are the proxy's / tunnel's job. When the proxy is on the same machine or private network as the server, `TRUST_PROXY=auto` trusts its `X-Forwarded-For` / `X-Real-IP`; when the proxy is on another machine on the public internet, set `TRUST_PROXY=1` (and make sure the game port is open only to the proxy).

## 3. Docker

```bash
# A) download the assets at build time (needs internet, about 550 MB)
docker build -t stronghold-protocol --build-arg FETCH_ASSETS=1 .
docker run -d --name stronghold -p 3000:3000 --restart unless-stopped stronghold-protocol

# B) keep the assets out of the image: run node tools/setup.mjs on the host first, then mount them
docker build -t stronghold-protocol .
docker run -d --name stronghold -p 3000:3000 --restart unless-stopped \
  -v "$PWD/public/assets:/app/public/assets:ro" stronghold-protocol
```

The image is built from source (`git clone`); the Releases bundles don't contain the `Dockerfile`. The image is based on `node:22-alpine`, multi-stage, with production dependencies only; `public/vendor` is generated at build time. `.dockerignore` excludes `public/assets` (host assets are not sent into the build context); `public/fonts`, `data/assets.json` and `data/local-assets.json` are copied in if present. Environment variables are the same as in the README (`-e SP_VERIFY=sample`, etc.). Health check: `GET /healthz`.

docker compose example:

```yaml
services:
  stronghold:
    build:
      context: .
      args: { FETCH_ASSETS: "1" }
    ports: ["3000:3000"]
    restart: unless-stopped
    environment:
      SP_VERIFY: "off"
```

## 4. Long-running on macOS / Linux

- Temporary hosting: `scripts/start.sh` (or `npm start`), keeping the terminal window open. On first run macOS asks whether to allow node to accept incoming connections; choose "Allow".
- Linux systemd (`/etc/systemd/system/stronghold.service`; adjust the paths and user to your setup):

  ```ini
  [Unit]
  Description=Stronghold Protocol game server
  After=network-online.target
  Wants=network-online.target

  [Service]
  WorkingDirectory=/opt/Stronghold-Protocol
  ExecStart=/usr/bin/node server/index.js
  Environment=PORT=3000 HOST=::
  Restart=always
  RestartSec=5
  User=stronghold

  [Install]
  WantedBy=multi-user.target
  ```

  `sudo systemctl daemon-reload && sudo systemctl enable --now stronghold`; logs with `journalctl -u stronghold -f`; firewall `sudo ufw allow 3000/tcp`.

## 5. Troubleshooting

| Symptom | Fix |
|---|---|
| Any problem | `node tools/doctor.mjs`: Node version, dependencies, asset completeness, port, LAN addresses, firewall, network type |
| `Port already in use / EADDRINUSE` | A server is already running (the start-on-boot task?) or another program is using 3000: change the port with `scripts\start-windows.bat --port 3001` |
| Friends can't open the page | Firewall rule / network type (1.2); make sure they use the `LAN` address, not `localhost`; guest Wi-Fi often has "AP isolation" enabled; if not on the same network, see section 2 |
| Placeholder graphics, no sound | The assets didn't finish downloading: run `node tools/setup.mjs` again (it resumes); details of what's missing are in `.cache/assets-report.json`. By default only the raw source and jsDelivr are used; `--asset-source=mirror` turns on the prefix mirror by hand (see above) |
| Asset download slow / failing | You can interrupt at any time on network problems; re-running skips completed files; `node tools/fetch-assets.mjs --concurrency=4` lowers concurrency. If some files fail to download, the asset manifest `data/assets.json` stays unchanged (the script lists the missing entries and exits non-zero; in game, missing images use placeholders and missing sounds don't play); just re-run to fill them in |
| Emotes show as default icons, "How to Play" shows only bullet-point text | The assets aren't fully downloaded: run `node tools/setup.mjs` again (emotes and tutorial images are downloaded from public mirrors with the other assets; no client needed); details of what's missing are in `.cache/assets-report.json` |
| Local extraction fails | The game runs normally; only the few items in the section 6 table use substitutes. Make sure the client has downloaded all resources; if a too-new Python makes the dependency install fail, install Python 3.12, delete `.venv-extract` and run `node tools/setup.mjs --local` again |
| No 3D board | Needs the locally extracted board textures (`node tools/doctor.mjs` shows "3D board available") and a browser with WebGL2. A server without a client can copy the local assets from the bundle of the same version (section 6) |
| Disconnects | Reopen the page in the same browser within 10 minutes (Team Simulation) or 24 hours (Solo Simulation; `config.constants.singleReconnectTime`) to return to your seat automatically. While disconnected from a Team Simulation your formation fights automatically and readies up when time runs out (it won't buy anything for you; to have the AI play for you use "Leave Simulation → Step Away (AI Autopilot)"); a Solo Simulation isn't timed and waits for you |

## 6. Local-client assets (optional)

`public/assets/local/` and `data/local-assets.json` are official assets extracted from an *Arknights* client installed on the local machine (`tools/local-extract`, DESIGN §13): `node tools/setup.mjs` asks whether to extract when it detects a client; afterwards you can re-extract with `node tools/setup.mjs --local`, or point at the client directory with `--game "<…/StreamingAssets/AB/Windows>"`. The assets setup downloads from public mirrors don't include these, so a deployment from source or the lite bundle on a machine without a client (e.g. a Linux server) won't have them; the full bundles in Releases already include them.

Without the local assets the game runs normally; only the following items use substitutes:

| Content | Without local assets |
|---|---|
| Official 3D board (textures, models, map effects) | 2D board with procedurally drawn tiles |
| Some official UI icons and backplates: the frames of the Chat button and emote panel, the pause panel, the Equipment replace dialog, the Operator loadout screen, teammate status and leak markers, Module type icons, etc. | Similar-looking substitute graphics, icons or text |
| Official models of the Blazing / Pyric Originium Slugs | Regular Originium Slugs tinted orange / red-orange |
| Official models of 39 summons (most Custom Squad summons, plus Catherine's Crawler Protection Unit and SilverAsh the Reignfrost's Eye of the Blizzard; not on the public mirrors) | Summon avatars (on a diamond backplate) |

The emotes (6 sets × 6) and the 19 tutorial pages of "How to Play" are also on the public mirrors: `node tools/setup.mjs` downloads them with the other assets (about 21 MB), no client needed; when local assets exist, the local ones are shown first.

**For a server without a client** that wants the official assets in the table above: from the full bundle of **the same version** ([Releases](https://github.com/sganggs/Stronghold-Protocol/releases)), copy the `public/assets/local/` folder and `data/local-assets.json` to the same locations under the server's project directory. The server re-reads both on every request, so no restart is needed; players just refresh the page. Always use a full bundle of the same version as the server code: each version's extracted content and manifest may differ (for example the Blazing / Pyric Originium Slug models were only added after 0.1.0, and the summon models in 0.2.0), and mixing in files from another version leads to missing or wrong images. After copying, `node tools/doctor.mjs` shows the number of local asset entries and "3D board available".

**Extracted before 0.2.0**: the summon models are a new extraction item in 0.2.0 and are missing from older extractions (`node tools/setup.mjs` warns "missing the new Custom Squad summon models"). On a machine with a client, run `node tools/setup.mjs --local` to extract again; to add only this item, run `tools/local-extract/extract.py --only spine/token` in the Python environment used for extraction (the new files go into `public/assets/local/spine/token/`; the other manifest entries stay as they are).

**Download size of the 3D board textures**: every player downloads the 12 textures of the 3D board from the host when entering a match. Extraction writes a WebP of each of the 12 (color textures lossy at quality 95, normal and data textures lossless); the manifest lists the WebPs, and the PNGs of the same name stay alongside for the cropping tool and setup. This cuts the download from about 6.7 MB to about 2 MB, most noticeable for remote play on slow connections. Local assets with only PNGs (e.g. extracted before this change) can get the WebPs in place by running `tools/local-extract/extract.py --webp` in the extraction Python environment; it only needs Pillow, no client.

## 7. Packaging a release (maintainers)

The Releases zips (full and lite bundles, plus the update bundle from 0.2.1 on) are generated by `tools/package.mjs`, run in the **source repository** (the bundles don't include this tool):

```bash
npm run package -- --dry-run --list   # check only: list every file and its size, write nothing (add --lite for the lite bundle)
npm run package -- --out <dir>        # full bundle Stronghold-Protocol-v<version>.zip
npm run package:lite -- --out <dir>   # lite bundle Stronghold-Protocol-v<version>-lite.zip
npm run package -- --update --from <earlier full bundle>[,<…>] --out <dir>   # update bundle Stronghold-Protocol-v<version>-update.zip
```

- **What goes in**: from `git ls-files`, `server/`, `shared/`, `data/`, `public/` (without `public/dev/`), `packs/` (the content packs committed with the repository; ones only installed locally and not committed are left out), the start scripts, the tools players run (setup, vendor, fetch-assets and `tools/assets/`, doctor, plus the `tools/local-extract/` and `crop-board-atlas.mjs` setup calls), the 4 research data tables the server and fetch-assets read (the `03-operators`, `05-enemies`, `05-maps` and `07-assets` JSONs in `docs/research/`), `package.json` / `package-lock.json`, the licenses and notices (`LICENSE`, `NOTICE.md`, `THIRD-PARTY-NOTICES.md`, `README.md`, `CHANGELOG.md`), `docs/PLAYING.md` and this document; then `packs/index.json` is generated in the staging directory (the list of the language and content packs included, for purely static hosting; the server lists them live itself, see [PACKS.md](PACKS.md)), and `npm ci --omit=dev` installs the runtime dependencies and `public/vendor`. The full bundle adds the assets `data/assets.json` lists, `public/fonts`, and the locally extracted `public/assets/local/` and `data/local-assets.json`. Files on disk that the manifest doesn't list are left out (e.g. the old assets of 焰狐龙梓兰, removed from Custom Squad in 0.2.0). The Japanese Operator voices (`audio.voiceJp`, 2674 files in `public/assets/audio/voice/jp/`, about 85 MB, about 76 MB zipped) go into the full bundle by default too; when the switch `FULL_ZIP_JP_VOICE` in `tools/package.mjs` is set to `false`, the full bundle (and the update bundle compared against it) leaves these files out: setup downloads them on the player's first start as for the lite bundle, choosing "日本語" plays the Chinese voices until the download finishes, and the update bundle does not delete Japanese voices a player already has. This branch also has the English, Korean and native-language dubs used for choosing an Operator's voice individually (`audio.voiceEn` / `audio.voiceKr` / `audio.voiceNative`, about 5700 files and about 180 MB under `public/assets/audio/voice/en/`, `kr/` and `native/`), which also go into the full bundle by default; their switch is `FULL_ZIP_OPTIONAL_VOICE`, handled like the Japanese voices' switch when set to `false`.
- **What stays out**: `test/`, the maintenance tools (data build, golden, botbench, i18n, import checks, this tool, etc.), `scripts/make-windows-bundle.mjs` (the Windows portable bundle, see [WINDOWS.en.md](WINDOWS.en.md)), the other docs, research notes and `docs/img/`, `handoff/`, `.github/`, `types/`, and lint / editor / Docker configuration. Compared with 0.1.x's whole-tree packaging (every tracked file plus the whole of `public/assets`), the 0.2.0 full bundle has about 640 fewer files, is about 26 MB smaller unzipped and about 8 MB smaller zipped.
- **Checks before packaging** (all done for `--dry-run` too): a deny list (`pv`, `review`, `.cache`, `.claude`, `.git`, `logs`, `.env`, `scripts/service.env.cmd`, `handoff`, `test`, etc.); every included module's relative imports and the npm scripts players use (start / setup / doctor / launch / postinstall / vendor / assets) point at files in the bundle; in the full bundle, the files `data/assets.json` and `data/local-assets.json` list are all there (if any are missing, run `node tools/fetch-assets.mjs` first); no two paths differ only in case; the files in the bundle (binary assets checked too) contain no personal directory paths (`/Users/…`, `C:\Users\…`, `/home/…`) or the local account name (read from the system at run time; `SP_PACKAGE_SCAN_NAMES=a,b` adds more names); the included tracked files have no uncommitted changes (a regenerated `data/assets.json` has to be committed first). Any problem is listed with its reason, the tool exits non-zero and writes no zip; a real packaging run also checks that the files in the staging directory match the plan exactly.
- **MANIFEST.json**: at the root of all three bundles (written after `npm ci`): the size and sha256 of every file except the assets (`public/assets/`, `public/fonts/`, `data/assets.json`, `data/local-assets.json`, which belong to setup); identical across the three bundles of one version. `npm run doctor` and the update bundle's start check (`server/update.js`) use it to verify the install.
- **Update bundle** (from 0.2.1 on, released with every version): after `--from`, list **the full bundles of every earlier 0.2.x version** (the zips in Releases, or the untouched folders they extract to; comma-separated or several `--from`), e.g. for releasing 0.2.2 `--from Stronghold-Protocol-v0.2.0.zip,Stronghold-Protocol-v0.2.1.zip`. The tool builds the full bundle's staging directory as usual (`npm ci`, etc.) and compares it file by file (size + sha256) with each earlier version: every file that differs from any earlier version, or that an earlier version lacks, goes in, so one update bundle can be applied over every listed version; files an earlier version has and the new version doesn't are recorded under `removed` in `UPDATE.json` (with their sha256 in each earlier version, so players only delete files with matching content; same-name files differing only in case and local file names such as `.env` are not deleted, and the summary lists them). The earlier versions must be older than the current version, contain assets (not a lite or update bundle), and each be given only once; `--dry-run` only reads and checks the earlier versions. The update bundle also contains the new version's `MANIFEST.json` and `UPDATE.json` (the earlier versions it applies to, file count, byte count, file list and `removed`), which go through the same deny-list and personal-information checks; the summary lists the changed / added / deleted file counts against each earlier version and the counts of each kind of file in the update bundle. When releasing, state in the Releases notes which versions the update bundle applies to (the versions listed after `--from`). `--keep-stage` keeps the update bundle directory and the full bundle's staging directory (`Stronghold-Protocol/` and `.full/` in `<dir>/Stronghold-Protocol-v<version>-update/`).
- **Requirements**: a repository with the assets downloaded (for the full bundle) — run `node tools/fetch-assets.mjs` once online before packaging to fill in the assets the manifest plans but this machine doesn't have yet (the manifest only lists files present on disk, so the packaging tool can't tell what is missing; commit `data/assets.json` first if it changed); network access to npm (`npm ci`); `zip` (or bsdtar's `tar`, built into Windows 10 and later); and for the update bundle, the full bundles of the earlier versions (the tool reads the zips itself, no `unzip` needed; they can be downloaded again from Releases). `--out` defaults to `stronghold-protocol-release` under the system temp directory and cannot be inside the repository; `--force` overwrites an existing zip, and `--keep-stage` keeps the packaging directory for inspection.
