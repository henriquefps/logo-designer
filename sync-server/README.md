# Designer sync server

`designer-sync` keeps your [Designer](https://designer.hfps.dev) projects (and, if you want, the fonts you uploaded) in sync between devices. You run it yourself, on a computer at home, a Raspberry Pi, a NAS or a small VPS. It is one small program with no dependencies, and everything lives in one folder that you own: one JSON file per project.

- One static binary for Linux, macOS and Windows (amd64 and arm64), or a Docker image.
- Last-write-wins per project, with deletions synced as tombstones. When a device loses a conflict, its version is kept as a "conflicted copy".
- Secure by default: without an API key it only answers your local network.
- Works through Cloudflare Tunnel or Tailscale when you want sync away from home.

How the app uses it, why it is built this way and how to run it on a home server with Docker and a Cloudflare Tunnel: [`docs/sync.md`](../docs/sync.md).

## Install

Download the archive for your system from the [latest release](https://github.com/henriquefps/logo-designer/releases/latest), or from the [setup page](https://designer.hfps.dev/sync) in the app, which picks the right one. The names carry no version, so `https://github.com/henriquefps/logo-designer/releases/latest/download/<archive>` always points at the newest build:

| System | Archive |
| --- | --- |
| Linux, Intel/AMD | `designer-sync_linux_amd64.tar.gz` |
| Linux, ARM (Raspberry Pi 4/5 with a 64-bit OS) | `designer-sync_linux_arm64.tar.gz` |
| macOS, Apple silicon | `designer-sync_darwin_arm64.tar.gz` |
| macOS, Intel | `designer-sync_darwin_amd64.tar.gz` |
| Windows, Intel/AMD | `designer-sync_windows_amd64.zip` |
| Windows, ARM | `designer-sync_windows_arm64.zip` |

`checksums.txt` in the same release lists the SHA-256 of every archive.

```sh
curl -LO https://github.com/henriquefps/logo-designer/releases/latest/download/designer-sync_linux_amd64.tar.gz
tar xzf designer-sync_linux_amd64.tar.gz
./designer-sync
```

It listens on port 3051 and stores data in `./data`. Stop it with Ctrl+C. On macOS, remove the quarantine flag once (`xattr -d com.apple.quarantine ./designer-sync`); on Windows, allow it on private networks when the firewall asks.

### As a service on Linux (systemd)

```sh
sudo install -m 755 designer-sync /usr/local/bin/
```

`/etc/systemd/system/designer-sync.service`:

```ini
[Unit]
Description=Designer sync server
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/designer-sync
DynamicUser=yes
StateDirectory=designer-sync
Environment=DATA_DIR=/var/lib/designer-sync
Environment=PORT=3051
# Optional: SYNC_API_KEY=... and ALLOWED_ORIGINS=... in this file, mode 600.
EnvironmentFile=-/etc/designer-sync.env
Restart=on-failure
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload && sudo systemctl enable --now designer-sync
```

### Docker

The image is `ghcr.io/henriquefps/designer-sync` (linux/amd64 and linux/arm64): distroless, non-root (uid 65532), data in `/app/data`.

```sh
mkdir -p data && sudo chown 65532:65532 data
docker run -d --name designer-sync --restart unless-stopped \
  -p 3051:3051 -v "$(pwd)/data:/app/data" \
  ghcr.io/henriquefps/designer-sync:latest
```

Or use [`docker-compose.yml`](docker-compose.yml), which also holds an optional Cloudflare Tunnel connector. Its secrets are passed at run time, never written to a file: see [Secrets](../docs/sync.md#secrets-with-skv).

## Configuration

Every setting is a flag or an environment variable. Flags win.

| Flag | Environment variable | Default | Meaning |
| --- | --- | --- | --- |
| `--port` | `PORT` | `3051` | TCP port to listen on (all interfaces). |
| `--data-dir` | `DATA_DIR` | `./data` (`/app/data` in Docker) | Folder holding `projects/`, `fonts/` and `conflicts/`. Created if missing. |
| `--api-key` | `SYNC_API_KEY` | empty | When set, `/api/projects` and `/api/fonts` require `Authorization: Bearer <key>`. Required through a tunnel or proxy. |
| `--allowed-origins` | `ALLOWED_ORIGINS` | empty (any origin) | Comma-separated web origins allowed by CORS, e.g. `https://designer.hfps.dev`. |
| `--max-body-mb` | `MAX_BODY_MB` | `64` | Largest single project or font the server accepts. |

Prefer the environment variable for the key: flags are visible in the process list.

```sh
designer-sync            # run the server (same as "serve")
designer-sync genkey     # print a new random API key (32 bytes, hex)
designer-sync version
```

## API

All bodies are JSON. `kind` is `projects` or `fonts`.

- `GET /api/health` → `{ "ok": true, "projectCount": n, "fontCount": n, "serverTime": ms }`. No key needed.
- `GET /api/<kind>` → `{ "items": [Meta], "serverTime": ms }`: id, name, createdAt, updatedAt, deleted, size of every item, tombstones included. No payloads.
- `GET /api/<kind>/<id>` → the stored record: the Meta fields plus `data` (a project document, or a font).
- `PUT /api/<kind>/<id>` with `{ name, createdAt, updatedAt, deleted, base, data }` → `{ "applied": bool, "item": Meta }`. The revision is taken when the id is new or `updatedAt` is strictly greater than the stored one; otherwise `applied` is false and `item` is what the server has. `deleted: true` stores a tombstone and drops `data`. `base` is the `updatedAt` the client last synced for this id. `updatedAt` more than a day in the future is refused (a wrong clock would win every merge).

## Data on disk

```
data/
  projects/<id>.json        one file per project (a tombstone keeps only the metadata)
  fonts/<id>.json           one file per uploaded font face (base64 inside)
  conflicts/projects/<id>/<updatedAt>.json   overwritten versions, newest 10 per project
```

Files are written atomically (temp file, fsync, rename) with mode 0600, so a copy taken at any moment is complete and nothing else on the machine can read them. A file that cannot be parsed at startup is moved to `<name>.corrupt-<unix>` instead of being overwritten.

## Security model

Your projects are only as private as this server, so it refuses to be exposed without a key.

- **Without an API key** (default) it answers only requests that come straight from your network: loopback, private ranges, link-local and `100.64.0.0/10` (Tailscale) peers, and without `Cf-Connecting-IP`, `X-Forwarded-For`, `X-Real-IP` or `Forwarded` headers. Anything through a tunnel or proxy gets `401` with an explanation, and the server prints a warning at startup.
- **With an API key**, anyone who has it may read and overwrite every project and font, from anywhere. The comparison is constant time. Treat it like a password; if it leaks, make a new one and update the server and every device.
- CORS allows any origin by default (the key is what protects the data). Set `ALLOWED_ORIGINS` to accept your copy of the app only.
- Don't put Cloudflare Access (a login page) in front of the hostname: the app makes background requests and cannot log in.

Exposing it: [`docs/sync.md`](../docs/sync.md) covers Cloudflare Tunnel (including Docker Compose with a tunnel token) and Tailscale step by step. HTTPS pages (`https://designer.hfps.dev`) cannot call a plain `http://` server (mixed content), so give the server an HTTPS address.

## Backups

Copy the data folder (`cp -a data ~/backups/designer-sync-$(date +%F)`). Each device also keeps its own copy of every project, so a lost server can be rebuilt by syncing a device to an empty one.

## Building from source

Go 1.27 or newer, no third-party dependencies.

```sh
cd sync-server
go test -race ./...
go build -o designer-sync .
```

Releases are built by [GoReleaser](https://goreleaser.com/) from [`.goreleaser.yaml`](.goreleaser.yaml) by `.github/workflows/sync-server-release.yml` when a `v*` tag is pushed (the releases of this repository are the sync server's; the app itself is deployed to Cloudflare). A local dry run: `goreleaser release --snapshot --clean --skip=docker,publish`.

## License

[AGPL-3.0-or-later](../LICENSE)
