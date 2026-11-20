# Sync: your projects on all your devices

Designer keeps projects in the browser (IndexedDB). **Sync** is optional: you run a small server of your own, point the app at it (File → Sync…), and projects (and, if you want, the fonts you uploaded) follow you between devices. Nothing is sent anywhere until you turn it on, and there is no Designer cloud: the only server is yours.

It is modelled on the Markdown Previewer's sync (`markdown-preview-sync`) and works the same way for you: one small Go program with no dependencies or a Docker image, data in one folder you own, last-write-wins with tombstones for deletions, an optional API key (LAN-only without it), `ALLOWED_ORIGINS`, Cloudflare Tunnel or Tailscale to reach it away from home, release binaries named without a version.

- **Server:** [`sync-server/`](../sync-server/README.md) (`designer-sync`, port **3051**; the Markdown Previewer's is 3041).
- **App:** `src/sync/`, the Sync dialog in `src/dialogs/sync/`, the setup guide at [designer.hfps.dev/sync](https://designer.hfps.dev/sync).
- **Screenshots:** [`docs/screenshots/sync/`](screenshots/sync/).

## Quick start

```sh
docker run -d --name designer-sync --restart unless-stopped \
  -p 3051:3051 -v "$(pwd)/data:/app/data" ghcr.io/henriquefps/designer-sync:latest
```

In Designer: File → Sync… → turn on *Sync this device* → server address `http://<server-ip>:3051` → *Sync now*. Repeat on every device. Through a tunnel you need an API key and an `https://` address: see [Running it on a home server](#running-it-on-a-home-server-docker--cloudflare-tunnel).

## Decisions

### What is synced, and how it is stored

- **One file per project**, `data/projects/<id>.json`, not one JSON for everything. Projects can be big (reference images are embedded as data URLs, up to 2048 px each): rewriting a single file holding every project on each autosave would not scale, and one damaged file must not take the rest with it. A file holds `{id, name, createdAt, updatedAt, deleted, size, data}` where `data` is the project document exactly as the app has it; **the server never looks inside it** (no schema coupling: a newer app version does not need a newer server).
- **Limits.** One project, or one font, per request, at most **64 MB** (`MAX_BODY_MB`). The app answers a refusal with a message naming the project; the rest keeps syncing. There is no total quota: the disk is yours. Requests are served from files on demand and only the small list (below) is held in memory.
- **Uploaded fonts sync, as private.** They are in IndexedDB too (`designer-fonts`), and a project is not the same on another device without the fonts it uses. They go to `data/fonts/<id>.json` (base64 inside, with the font's metadata), are marked `private: true`, are only readable with the API key or from your LAN, and the files are mode 0600. A font file is licensed content: syncing it to *your own* server is fine, publishing it is not, so the server has no public endpoint and the Sync dialog says so. A switch (*Sync uploaded fonts*, on by default) keeps them on the device. Fonts are synced before projects so a pulled project finds its fonts. A font changes only when it is added, replaced, renamed (family) or deleted, and the newest of those wins.
- **The list.** `GET /api/projects` returns only metadata per project, tombstones included: `id, name, createdAt, updatedAt, deleted, size`. That is everything a device needs to decide what to transfer, so a sync with nothing to do is one small request. **No thumbnails in v1**: the app's project list does not show them, and generating one per save would cost more than it gives; the format has room to add them later (`data` is opaque, the list is additive).

### Protocol: a list plus per-project transfers

Markdown Previewer posts every note on every sync and gets all of them back. That does not work for projects of several MB. Here a device lists, compares with its own state and transfers only the differences: `GET /api/<kind>` (the list), `GET /api/<kind>/<id>`, `PUT /api/<kind>/<id>`. The server decides nothing beyond **last-write-wins on `PUT`** (a revision is applied only if its `updatedAt` is strictly greater than the stored one) and answers `{applied, item}`. All merge decisions are the client's, in one pure function (`src/sync/plan.ts`) that is unit-tested.

### Conflicts: last-write-wins, and the loser is kept

Per project, the greater `updatedAt` wins. That is the whole rule. What is cheap on top, and done:

- Each device remembers the `updatedAt` both sides had at its last sync of a project (`base`). With it, "only I changed it" (push), "only they changed it" (pull) and "both changed it" (a conflict) are told apart without comparing contents.
- **Conflict, the remote edit is newer:** the device pulls it and keeps its own unsynced version as a separate project, **"Name (conflicted copy YYYY-MM-DD)"**, visible in the Projects list; the Sync dialog says how many were made.
- **Conflict, the local edit is newer:** it is pushed, and the **server copies the version it overwrites** to `data/conflicts/projects/<id>/<updatedAt>.json` (the newest 10 per project). The server does this whenever a project is overwritten by a device that had not seen the stored version (`base` differs).
- **Edit vs delete** is last-write-wins as well. If a deletion wins over an unsynced edit, that edit is kept as a conflicted copy. If an edit is newer than the deletion, the project comes back.
- Not done: merging two edits of one project (a vector document has no safe three-way merge; the copy lets you do it by eye) and a history browser for `conflicts/` (it is plain JSON, restore by importing the file).
- **Clocks.** `updatedAt` comes from the device that edited. A clock a day or more in the future is refused by the server (otherwise it would win every later merge); smaller skews can make an older edit win, which is why the loser is always kept rather than dropped.
- A pulled project is saved with the server's `updatedAt`, so pulling never looks like a local edit and is never pushed back.
- The project open in the editor is replaced in place when another device changed it, unless it has unsaved edits (the pull then waits for the next cycle, and the usual conflict rules apply).

### When it syncs

- **Push:** about 2 s after the last autosave (the autosave itself is 600 ms after the edit): the sync dialog and indicator show "N to sync" until it lands.
- **Pull:** on start, when the tab regains focus or becomes visible, when the browser comes back online, every 30 s, and **as soon as the server's event stream says a project or font changed** (below).
- **Offline queue:** there is no separate queue to lose. An edit is pending while a project's `updatedAt` differs from its `base`; a deletion is a tombstone in IndexedDB (`designer-sync`) until the server acknowledges it. Offline, the app shows "Offline · N waiting", keeps working, and retries on its own: every 30 s with exponential backoff up to 5 min after failures, immediately on focus or when back online.
- **Event stream.** With Sync on, the app keeps `GET /api/events` open (Server-Sent Events over `fetch`, since `EventSource` cannot send the API key). Each change on the server arrives as `{kind, id, updatedAt}` and starts a normal sync cycle (one list request plus the transfer), so another device's edit shows up in about a second instead of up to 30 s. The app ignores the echo of its own pushes. On every (re)connect it syncs once to catch up with what it missed; it reconnects with backoff (1 s → 30 s), and a stream silent for 60 s (the server sends a heartbeat every 25 s) is treated as dead. An older server without the stream answers 404: the app keeps polling every 30 s and the Sync dialog says so ("Live updates: …").
- A project nobody touched (the empty "Untitled" a new device starts with) is not synced, so a new device does not add empty projects to the others.
- Deletions are tombstones and are kept forever on the server (about 200 bytes each), so a device that was off for a year cannot resurrect a deleted project.

### Live editing (agent ↔ you)

An agent working on a project file can run **`designer live <project.designer.json>`** ([agents.md](agents.md#live-editing)): you see its changes appear in the app while it works, adjust them, and it sees your adjustments. Nothing changes for people who don't use it.

- **The live mark.** The copy on the server carries `live: { editedBy }` (`"cli"` or `"app:<device id>"`, see [project-format.md](project-format.md#top-level)). For a live project the app saves an edit after 200 ms and pushes 300 ms later (≈ 500 ms from the edit to the server, instead of 600 ms + 2 s), and the top bar shows **Live · the CLI / this device / another device**: who saved the current version. Its popover says how changes arrive and has *Stop live*. Opening a live project (or the app filling in its icons) is not an edit and is never pushed back.
- **The CLI side.** `designer live` pushes the file, then mirrors both ways until Ctrl+C: it polls the file (150 ms) and pushes each valid save (a broken one is reported and skipped); it listens to the event stream (polling the list every 2 s without one) and writes your edits back to the file, atomically. Its only state is the `updatedAt` both sides last agreed on, in memory. On Ctrl+C it pushes once more without the live mark. If you delete the project in the app, it stops and leaves the file alone.
- **Conflicts** are today's rules: when the file and the app both changed before either was synced, the newer one wins (the file's modification time against the server's `updatedAt`); the other is kept: as a "conflicted copy" project in the app, or as `<name> (conflicted copy YYYY-MM-DD).designer.json` next to the file, and the server archives whatever it overwrote in `conflicts/`.
- `designer sync push|pull|list` move one project at a time without the live mark. The CLI reads the server from `--server` or `DESIGNER_SYNC_URL` and the key from `DESIGNER_SYNC_KEY` or `SYNC_API_KEY`, e.g. `skv run designer-sync -- designer live …`.
- A `?open-project=<id>` link (printed by the CLI) opens that project once this device has it, waiting up to two minutes for the sync to bring it.

### Jobs (agent requests)

Phase 4 of the wireframe mode ([wireframe-mode.md](wireframe-mode.md#phase-4-ai-through-your-own-agent-detailed)): the app asks *your own* agent to do something with a project (turn a screenshot into a wireframe, fill the next screen of a flow, adapt a screen to another platform, a free request) and follows it. The server only keeps a small queue; the work is done by `designer agent` on a machine of yours with your Claude Code login. No AI key is ever in the app or the server.

- **Queue.** `POST /api/jobs` stores `data/jobs/<id>.json` (screenshots in `data/jobs/<id>/`, mode 0600) with status `queued`. The agent `claim`s one (atomic: two agents never run the same job), reports `progress` lines, and `finish`es it as `done`, `failed` or `cancelled`. The app's `cancel` turns a queued job into `cancelled` at once; for a running job it sets `cancelRequested`, which the agent sees in the answer to its next `progress` call and obeys.
- **Presence.** An agent posts a heartbeat every 15 s; `GET /api/agents` lists the ones seen in the last 45 s, which is how the app knows to enable its AI entry points ("Agent online on cachyos-fps").
- **Events.** The existing stream carries `{kind: "jobs", id, status, updatedAt}` on every job change and `{kind: "agents", id, status: "online" | "busy" | "offline", updatedAt}` when presence changes (not on every heartbeat). The app and the agent fetch details with the usual `GET`. Older clients ignore kinds they do not know.
- **Time rules.** A running job whose agent sent nothing for 2 minutes becomes `failed` ("agent went away"); the server sweeps every 15 s and on every request. Only the newest 200 jobs are kept; attachments go 24 h after a job finishes.
- **Private.** Same rules as fonts: the key (or the local network when there is none) on every route, files 0600, never in `/api/health` (which only says `jobs: true`).
- **Client.** `src/sync/jobs.ts` is the typed client used by the app and by `designer agent` (browser and Bun): one function per route (`createJob`, `listJobs`, `claimJob`, `reportProgress`, `finishJob`, `cancelJob`, `sendHeartbeat`, `listAgents`, `getAttachment`…) and `onJob` / `onAgents` callbacks on `subscribeEvents`. Route and field details: [sync-server/README.md](../sync-server/README.md#jobs-agent-requests).

### Security

Same model as `markdown-preview-sync`. Without an API key the server answers only direct requests from loopback, private, link-local and `100.64.0.0/10` (Tailscale) addresses and refuses anything carrying proxy headers (`Cf-Connecting-IP`, `X-Forwarded-For`…), so forgetting the key behind a tunnel exposes nothing. With a key, `Authorization: Bearer <key>` (compared in constant time) is required on `/api/projects`, `/api/fonts`, `/api/jobs`, `/api/agents` and `/api/events`; `/api/health` only returns counts. The event stream follows the same rules (key, LAN-only without one, CORS) and carries only ids and timestamps, never names or content. `ALLOWED_ORIGINS` restricts CORS. No end-to-end encryption: the server owner (you) can read the files, as with the Markdown Previewer's.

The API key lives in the browser's localStorage on each device, like the Markdown Previewer's.

### Not built

- Delta sync inside a big project: a changed project is sent whole (also in a live session: fine for wireframes of a few hundred KB).
- A sync state file for the CLI: `designer live` keeps its state in memory and `designer sync` has none, so a one-off `push` cannot tell "only I changed it" from a conflict; it relies on the server archiving what it overwrites.
- Live cursors or presence (who is looking at the project): the stream says what changed, not who is there.

## Running it on a home server (Docker + Cloudflare Tunnel)

This is how the Markdown Previewer's sync server runs on the home server: the repo checked out under `~/Apps/<name>`, `docker compose` with the server and a `cloudflared` connector side by side, port bound to the Tailscale address, **no secrets in files**. Replace `sync.example.com` with your hostname.

### Secrets with skv

The API key and the tunnel token live in `skv`, a local encrypted vault, and are injected as environment variables for the one command that needs them, so no `.env` file exists. (Any secret manager that can run a command with env vars works the same way, e.g. `op run`, `doppler run`, `sops exec-env`.) On the machine that runs compose:

```sh
# a new API key straight into the vault: it never appears on screen or in a file
docker run --rm ghcr.io/henriquefps/designer-sync genkey | tr -d '\n' | skv set designer-sync SYNC_API_KEY --note "Designer sync API key"
# the tunnel token: paste it at the hidden prompt (step 2 below)
skv set designer-sync CLOUDFLARE_TUNNEL_TOKEN --note "cloudflared token for sync.example.com"
```

Never write either value into the repo, into `docker-compose.yml`, or into a chat. If one leaks, make a new key (`genkey`) or roll the token in the dashboard and `skv set` it again.

### 1. Get the files

```sh
git clone https://github.com/henriquefps/logo-designer.git ~/Apps/designer-sync
cd ~/Apps/designer-sync/sync-server
mkdir -p data && sudo chown 65532:65532 data     # the container runs as uid 65532
```

### 2. Create the tunnel

In the [Cloudflare dashboard](https://one.dash.cloudflare.com/): **Networks → Tunnels → Create a tunnel → Cloudflared**, copy the token from the install command into `skv` (above), and add a **public hostname** `sync.example.com` whose service is `http://designer-sync:3051`. `designer-sync` is the compose service name, which `cloudflared` reaches on the compose network. Do not put Cloudflare Access in front of it: the app syncs in the background and cannot log in.

### 3. Start it

```sh
BIND_IP=<tailscale-ip-of-this-machine> skv run designer-sync -- docker compose up -d
docker compose logs designer-sync     # "loaded kind=projects count=0", "API key auth: enabled"
```

`BIND_IP` limits the published port to the Tailscale address, so devices on your tailnet reach it directly and everyone else only through the tunnel (which uses the compose network and does not need the published port). Leave it unset to publish on every interface (your LAN too). For LAN only, no tunnel: `docker compose up -d designer-sync`. Check it from anywhere:

```sh
curl https://sync.example.com/api/health          # {"ok":true,"projectCount":0,...}
```

### 4. Connect the app

On each device: File → Sync… → *Server address* `https://sync.example.com`, paste the API key (on the machine where it is stored: `skv get designer-sync SYNC_API_KEY`, run by you), *Sync now*.

### Updating and backing up

```sh
cd ~/Apps/designer-sync/sync-server
BIND_IP=<tailscale-ip> skv run designer-sync -- docker compose pull
BIND_IP=<tailscale-ip> skv run designer-sync -- docker compose up -d
cp -a data ~/backups/designer-sync-$(date +%F)       # the whole database is this folder
```

Files are written atomically, so a copy taken at any moment is complete. Every device also keeps its own copy of everything, so a lost server can be rebuilt by syncing a device to an empty one.

### Tailscale instead of a tunnel

On a tailnet nothing is exposed. From an app opened over plain HTTP use `http://<tailscale-ip>:3051` (Tailscale addresses count as local, so no key is needed). The app at `https://designer.hfps.dev` needs an HTTPS address: run `tailscale serve --bg 3051` on the server and use the `https://<machine>.<tailnet>.ts.net` address it prints. Serve adds proxy headers, so **set an API key** for that setup.

## Troubleshooting

| Message in the Sync dialog | Cause |
| --- | --- |
| "Blocked: this page is HTTPS but the sync server address is plain HTTP" | Browsers refuse HTTP calls from an HTTPS page (mixed content). Give the server an HTTPS address (tunnel or Tailscale Serve). |
| "missing or wrong API key" | The key in the app differs from `SYNC_API_KEY`, or the server has none and the request came through a tunnel or proxy. |
| "Could not reach the sync server" | Not running, wrong address or port, firewall, or the device is offline. Pending changes wait and are sent later. |
| "“Name”: This item is larger than the server accepts" | One project is over `MAX_BODY_MB`. Raise it, or remove very large reference images. |
| "updatedAt is more than a day in the future" | That device's clock is wrong. |

## Developing and testing

```sh
cd sync-server && go test -race ./...        # server: LWW, tombstones, auth, LAN-only, CORS, limits, archive, event stream, jobs (claim race, retention, dead agents)
bun run test                                  # includes src/sync/*.test.ts (merge plan, event client, engine, jobs client; `jobs.server.test.ts` runs it against the real Go server when Go is installed) and src/cli/sync.test.ts (designer live)
bun run e2e:live                              # the real thing: designer-sync (Go) + the app in Chromium + designer live
```

`bun run e2e:live` (`scripts/live-e2e.ts`) builds and starts `designer-sync`, opens the app in Playwright with Sync on, runs `designer live` on a file and checks: a file edit shows up in the app within ~1 s, an edit in the app is written to the file, both conflict directions keep the losing version, and Ctrl+C clears the Live mark. `bun run demo 07` records the same story as a video.

End to end, with two real browser contexts (Playwright) against a local server: start `designer-sync` on 3051 and `bun run dev`, open the app in two separate contexts, turn Sync on in both and create, edit and delete a project on each side, edit offline on both, and sync a font. `window.__designer.sync` (dev builds only) exposes the engine for such scripts.
