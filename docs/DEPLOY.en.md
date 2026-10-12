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
| Disk | About 270 MB of assets (`public/assets`) + about 125 MB of dependencies (`node_modules`); the optional local extraction adds about 40 MB (`.venv-extract`) + 70 MB of textures (see section 6). |
| Player devices | A modern browser with WebGL (latest Chrome / Edge / Firefox / Safari), on PC, phone or tablet (landscape). Older devices can lower the graphics quality in Settings or open `/?board=2d`. |

The server is **stateless**: rooms and matches exist only in memory; there is no database and no save files, so **no backups are needed**. Restarting the server ends running matches (including a Solo Simulation you could otherwise have returned to within 24 hours after a disconnect).

## 1. Windows mini PC: step by step

### 1.1 Install and first start

1. Install Node.js 22 LTS and Git (in PowerShell or "Terminal"; Git is not needed when using the full bundle below):
   ```powershell
   winget install OpenJS.NodeJS.LTS
   winget install Git.Git
   ```
   After installing, **close and reopen** the terminal; `node -v` should show v22 or later (winget's LTS is currently v24.x, which also works). Without winget, download the installers from <https://nodejs.org/en/download> and <https://git-scm.com/download/win>.
2. Download — pick one. Put it in a fixed, short directory that is **not synced by OneDrive**, e.g. `C:\Stronghold-Protocol`:
   - **Full bundle (recommended)**: download the latest full-bundle zip (currently v0.1.2) from the repository's [Releases](https://github.com/sganggs/Stronghold-Protocol/releases) page (it already contains dependencies, front-end libraries and all assets, including the official 3D board), unzip it and put the `Stronghold-Protocol` folder inside at the location above. No Git needed, and the first start doesn't download assets again. The assets are copyright of Hypergryph / Yostar and for non-commercial use only; see [NOTICE.en.md](../NOTICE.en.md).
   - **Source**:
     ```powershell
     git clone https://github.com/sganggs/Stronghold-Protocol.git C:\Stronghold-Protocol
     ```
3. Double-click `C:\Stronghold-Protocol\scripts\start-windows.bat`. The first time it will: install dependencies (`npm ci`; skipped for the full bundle) → copy the front-end libraries → download about 270 MB of assets (skipped for the full bundle; shows progress, and resumes if interrupted and started again) → if it detects a local Arknights client, ask whether to extract the official textures (can be skipped) → start the server and open the browser.
4. The window prints addresses friends can use, e.g. `http://192.168.1.23:3000`. Open it on another device to confirm you can get in. Closing the window stops the server.

Equivalent manual commands: `npm ci`, `node tools/setup.mjs`, `npm start`.

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
nssm set StrongholdProtocol AppEnvironmentExtra PORT=3000 HOST=0.0.0.0
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

Without start-on-boot, replace the last step with double-clicking `start-windows.bat` again. If you use the Releases full bundle: stop the server, unzip the new version's full bundle into a new directory and start from there (assets are included; if start-on-boot is installed, run `install-service-windows.ps1` once more from the new directory). If you use GitHub's "Download ZIP" source archive: after unzipping the new version, copy `public\assets`, `public\fonts`, `.cache` and `data\local-assets.json` (if present) over from the old directory to avoid re-downloading.

### 1.6 Planned maintenance (before an update)

Updating needs a restart, and a restart ends the matches in progress. `scripts/maintenance.mjs` (also `npm run maintenance -- …`) warns the players, stops new matches and stops the server once the matches are over. It never updates or starts anything itself.

**Started by hand from source:** the one line in the README (section "Updating a running server") does everything:
`npm run maintenance -- --close --stop-when-idle --back-in 20 --wait && git checkout -- data/assets.json && git pull && npm ci && scripts/start.sh`.

**The options** (they combine, and each run adds to what is already set):

```powershell
node scripts/maintenance.mjs --status            # live matches, rooms and players, and the maintenance in force (--json for scripts)
node scripts/maintenance.mjs --in 15             # every player sees a countdown at the top: "Server maintenance in 14:59"
node scripts/maintenance.mjs --at 21:30          # or a clock time (this machine's time; tomorrow if it has passed)
node scripts/maintenance.mjs --close             # no new simulations from now on; matches in progress play on (--open undoes)
node scripts/maintenance.mjs --stop-when-idle    # stop the server as soon as no match is live, once (--keep-running undoes)
node scripts/maintenance.mjs --back-in 20        # the downtime players are told to expect (or --back-at 21:45)
node scripts/maintenance.mjs --message "Update 0.2.3"   # a line of text in the players' bar (--message "" removes it)
node scripts/maintenance.mjs --wait              # wait until the server has stopped (needs --stop-when-idle)
node scripts/maintenance.mjs --cancel            # remove all of it; the bar disappears
```

- **Players** see a bar at the top of every screen: the countdown, "restarting once the current matches end", "no new simulations", the expected downtime and your message. Starting a simulation (including matchmaking and Find Teammates) is refused with an explanation. Matches in progress are never interrupted, and the countdown reaching 0 does nothing by itself. When the server stops, players see "Server restarting, back around 21:45" while their page waits to reconnect; it reconnects by itself once the server is back.
- **Ctrl+C** in the server's window is a normal, clean stop. While matches are running it asks first (press it again within 10 s to stop anyway); a stop from a service manager (SIGTERM) is never delayed.
- **Use `--close --stop-when-idle`** rather than watching `--status` and stopping the server by hand: a match can start between your check and your Ctrl+C, while the server checks and stops in one step. Without `--close`, new matches keep the server running.
- **Starting again** is up to whatever runs the server: started by hand, start it again (or use the README line, which does); the start-on-boot task and NSSM restart it; systemd with `Restart=always` restarts it, but **`Restart=on-failure` does not**, because the idle stop exits with code 0. A service restarts the **old** version unless you update it first: with a service, update its files and then restart it (section 1.5, `install-service-windows.ps1 -Restart`), and don't use the README line, which starts a second server.
- **Announcements:** `scripts/announce.mjs` stays for a one-off message; for a planned restart use this script.
- The setting is one-shot: the server removes `logs/maintenance.json` when it stops, and ignores (and removes) a file written while it was not running. On a VPS run the script as the service user (`sudo -u stronghold node scripts/maintenance.mjs …`).

**For scripts and your own tooling.** These are stable (changed only with care, and noted in the CHANGELOG):
- `logs/maintenance.json`: `{ "createdAt": ms, "at": ms|null, "closed": bool, "stopWhenIdle": bool, "backIn": minutes|null, "backAt": ms|null, "message": string|null }`. Writing it yourself works the same as running the script; the server reads it within about 2 seconds and only if `createdAt` is after its own start.
- `GET /healthz`: `matches`, `rooms`, `humans`, `uptimeSec`, and `maintenance` (the fields above without `createdAt`, or `null`).
- `node scripts/maintenance.mjs --status --json`: `{ "file": …, "server": <the /healthz body> | null }`.
- `--wait` exit codes: `0` stopped, `1` no server answering (nothing changed), `3` the server was started again meanwhile (a service manager; don't continue), `130` interrupted (the maintenance stays set).
- The server exits with code 0 after an idle stop.

The script's normal text output and the wording of the players' bar are for people and may change. Our tools never run `git pull` or touch your service setup; to build on them, start from `server/maintenance.js` (the server side), `public/js/ui/maintenance.js` (the bar) and `docs/design/network.md` (the `sys.maintenance` message).

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
    listen 443 ssl;
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

About https / wss: when the page is opened over https the client connects to `wss://same-domain/ws` automatically; over http it uses `ws://`. The server itself only speaks http; certificates are the proxy's / tunnel's job. When the proxy is on the same machine or private network as the server, `TRUST_PROXY=auto` trusts its `X-Forwarded-For` / `X-Real-IP`; when the proxy is on another machine on the public internet, set `TRUST_PROXY=1` (and make sure the game port is open only to the proxy).

## 3. Docker

```bash
# A) download the assets at build time (needs internet, about 250 MB)
docker build -t stronghold-protocol --build-arg FETCH_ASSETS=1 .
docker run -d --name stronghold -p 3000:3000 --restart unless-stopped stronghold-protocol

# B) keep the assets out of the image: run node tools/setup.mjs on the host first, then mount them
docker build -t stronghold-protocol .
docker run -d --name stronghold -p 3000:3000 --restart unless-stopped \
  -v "$PWD/public/assets:/app/public/assets:ro" stronghold-protocol
```

The image is based on `node:22-alpine`, multi-stage, with production dependencies only; `public/vendor` is generated at build time. `.dockerignore` excludes `public/assets` (host assets are not sent into the build context); `public/fonts`, `data/assets.json` and `data/local-assets.json` are copied in if present. Environment variables are the same as in the README (`-e SP_VERIFY=sample`, etc.). Health check: `GET /healthz`.

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
  Environment=PORT=3000 HOST=0.0.0.0
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
| Placeholder graphics, no sound | The assets didn't finish downloading: run `node tools/setup.mjs` again (it resumes); details of what's missing are in `.cache/assets-report.json`. If the raw GitHub URLs fail, it falls back to the jsDelivr mirror automatically |
| Asset download slow / failing | You can interrupt at any time on network problems; re-running skips completed files; `node tools/fetch-assets.mjs --concurrency=4` lowers concurrency. If some files fail to download, the asset manifest `data/assets.json` stays unchanged (the script lists the missing entries and exits non-zero; in game, missing images use placeholders and missing sounds don't play); just re-run to fill them in |
| Emotes show as default icons, "How to Play" shows only bullet-point text | The assets aren't fully downloaded: run `node tools/setup.mjs` again (emotes and tutorial images are downloaded from public mirrors with the other assets; no client needed); details of what's missing are in `.cache/assets-report.json` |
| Local extraction fails | The game runs normally; only the few items in the section 6 table use substitutes. Make sure the client has downloaded all resources; if a too-new Python makes the dependency install fail, install Python 3.12, delete `.venv-extract` and run `node tools/setup.mjs --local` again |
| No 3D board | Needs the locally extracted board textures (`node tools/doctor.mjs` shows "3D board available") and a browser with WebGL2. A server without a client can copy the local assets from the bundle of the same version (section 6) |
| Disconnects | Reopen the page in the same browser within 10 minutes (Team Simulation) or 24 hours (Solo Simulation; `config.constants.singleReconnectTime`) to return to your seat automatically. While disconnected from a Team Simulation your formation fights automatically and readies up when time runs out (it won't buy anything for you; to have the AI play for you use "Leave Simulation → Step Away (AI Autopilot)"); a Solo Simulation isn't timed and waits for you |

## 6. Local-client assets (optional)

`public/assets/local/` and `data/local-assets.json` are official assets extracted from an *Arknights* client installed on the local machine (`tools/local-extract`, DESIGN §13): `node tools/setup.mjs` asks whether to extract when it detects a client; afterwards you can re-extract with `node tools/setup.mjs --local`, or point at the client directory with `--game "<…/StreamingAssets/AB/Windows>"`. The assets setup downloads from public mirrors don't include these, so a source deployment on a machine without a client (e.g. a Linux server) won't have them; the full bundles in Releases already include them.

Without the local assets the game runs normally; only the following items use substitutes:

| Content | Without local assets |
|---|---|
| Official 3D board (textures, models, map effects) | 2D board with procedurally drawn tiles |
| Some official UI icons and backplates: the frames of the Chat button and emote panel, the pause panel, the Equipment replace dialog, the Operator loadout screen, teammate status and leak markers, Module type icons, etc. | Similar-looking substitute graphics, icons or text |
| Official models of the Blazing / Pyric Originium Slugs | Regular Originium Slugs tinted orange / red-orange |

The emotes (6 sets × 6) and the 19 tutorial pages of "How to Play" are also on the public mirrors: `node tools/setup.mjs` downloads them with the other assets (about 21 MB), no client needed; when local assets exist, the local ones are shown first.

**For a server without a client** that wants the official assets in the table above: from the full bundle of **the same version** ([Releases](https://github.com/sganggs/Stronghold-Protocol/releases)), copy the `public/assets/local/` folder and `data/local-assets.json` to the same locations under the server's project directory. The server re-reads both on every request, so no restart is needed; players just refresh the page. Always use a full bundle of the same version as the server code: each version's extracted content and manifest may differ (for example the Blazing / Pyric Originium Slug models were only added after 0.1.0), and mixing in files from another version leads to missing or wrong images. After copying, `node tools/doctor.mjs` shows the number of local asset entries and "3D board available".
