# Deployment

OpenCanvas ships as a single, stateless web container. In Phase 1 designs live in each visitor's browser (IndexedDB), so the server keeps no data: there is nothing to back up and you can run as many replicas as you like.

## On a personal computer

For one person on their own Mac, Windows or Linux computer, use the one-line installer instead of Docker (see the [README](../README.md#install)):

```bash
curl -fsSL https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.sh | bash   # macOS, Linux
irm https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.ps1 | iex          # Windows PowerShell
```

How it works:

- **The bundle.** The [Release](../.github/workflows/release.yml) workflow builds `opencanvas.tar.gz` with `scripts/build-bundle.sh`: the Next.js standalone server, its static files and the `opencanvas` command. Dependencies are installed with pnpm's hoisted linker so the archive has no symbolic links, and sharp (native, unused: the app has no `next/image`) is left out, so one archive runs on every system.
- **The installer** downloads the official Node.js 22 build for the computer from nodejs.org (checking its SHA-256; on Alpine it uses the system's Node.js), then the bundle from the latest GitHub release (also checked), into `~/.opencanvas` (`%LOCALAPPDATA%\OpenCanvas` on Windows). It never needs administrator rights.
- **The port** is 4790, or the next free one; it is saved, and updates keep it, because the browser saves designs per address. The server listens on 127.0.0.1 only.
- **Starting with the computer:** a LaunchAgent on macOS (restarted if it stops), a systemd user service on Linux (with lingering, so it starts at boot), an entry in the user's Run key on Windows (a hidden window), or, without systemd, a background process restarted at login (XDG autostart) and boot (cron).
- **Where work is kept:** the installer asks once: this computer only, or also the person's own Cloudflare R2 / Amazon S3 bucket (see [cloud sync](cloud-sync.md)). The answer is kept on updates; `opencanvas cloud` changes it.
- **`opencanvas stop`** stops the server and removes the autostart; `opencanvas start` puts both back. `opencanvas uninstall` removes everything except the designs in the browser.

The [install test](../.github/workflows/install-test.yml) workflow runs the installer on fresh GitHub machines (macOS, Ubuntu, Windows) and bare Debian, Ubuntu, Fedora and Alpine images, then checks start, stop, status, restart, reinstalling and uninstalling.

## Docker

```bash
docker build -t opencanvas .
docker run -d --name opencanvas -p 3000:3000 \
  --read-only --tmpfs /tmp --tmpfs /app/apps/web/.next/cache \
  --security-opt no-new-privileges:true \
  opencanvas
```

The image (about 115 MB compressed):

- is built in three stages (dependencies → `next build` → runtime) on `node:22-bookworm-slim`;
- runs the Next.js standalone server as the unprivileged `node` user;
- works on a read-only root filesystem (only `/tmp` and the Next.js cache directory need to be writable);
- declares a `HEALTHCHECK` against `GET /api/health`, which returns `{"status":"ok","service":"opencanvas-web","version":"…"}`.

Build arguments and environment:

| Name | Default | Purpose |
| --- | --- | --- |
| `NODE_IMAGE` (build arg) | `node:22-bookworm-slim` | Base image, e.g. a registry mirror such as `mirror.gcr.io/library/node:22-bookworm-slim` |
| `PORT` | `3000` | Port the server listens on |
| `HOSTNAME` | `0.0.0.0` | Interface to bind |

## Docker Compose

```bash
docker compose up -d --build
```

`docker-compose.yml` builds the image and runs it with the same hardening (read-only filesystem, tmpfs mounts, `no-new-privileges`), a health check and `restart: unless-stopped`. Set `PORT` to publish on another host port.

## Coolify on Hetzner

1. Create a Hetzner Cloud server (2 vCPU / 4 GB is plenty for the web tier) and install Coolify on it.
2. In Coolify, add a resource from your Git repository and choose one of:
   - **Dockerfile** build pack — Coolify builds the root `Dockerfile`; set the exposed port to `3000`;
   - **Docker Compose** — Coolify uses `docker-compose.yml` as is;
   - **Docker image** — deploy `ghcr.io/<owner>/<repo>:<version>` published by the release workflow (push a `v*` tag).
3. Set the health check path to `/api/health`.
4. Attach your domain; Coolify's proxy issues TLS certificates.

## Security notes

- Every HTML response carries a Content Security Policy with a per-request nonce (`script-src 'self' 'nonce-…' 'strict-dynamic'`), `frame-ancestors 'none'`, plus `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`. If you add analytics or other third-party scripts, extend the policy in `apps/web/src/proxy.ts` deliberately.
- The app makes no third-party requests: fonts are self-hosted.
- Terminate TLS at the proxy (Coolify/Traefik, Caddy or nginx) and forward `X-Forwarded-*` headers.

## Later phases

When accounts, server sync and workers arrive (see the [roadmap](roadmap.md)), the deployment grows into:

```
Web server ─┬─ API
            ├─ PostgreSQL
            ├─ Redis / Valkey
            ├─ Object storage (S3-compatible) + CDN
            └─ Queue ─┬─ Export worker
                      ├─ Image worker
                      ├─ Video worker
                      └─ AI worker
```

The renderer and exporters already run in Node, so the export worker reuses them unchanged.
