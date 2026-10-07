#!/usr/bin/env bash
#
# Builds the ready-to-run OpenCanvas bundle that install.sh and install.ps1
# download from GitHub Releases:
#
#   scripts/build-bundle.sh [out-dir] [version]
#   → <out-dir>/opencanvas.tar.gz and opencanvas.tar.gz.sha256
#
# The bundle is the Next.js standalone server, its static files and the
# `opencanvas` command. It is plain JavaScript, so one file serves macOS,
# Linux and Windows: dependencies are installed with the hoisted linker (no
# symlinks, which Windows cannot extract) and sharp, the only native module,
# is left out (the app does not use next/image).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$(mkdir -p "${1:-$ROOT/dist}" && cd "${1:-$ROOT/dist}" && pwd)"
VERSION="${2:-$(node -p "require('$ROOT/package.json').version")}"
VERSION="${VERSION#v}"

cd "$ROOT"
echo "==> Installing dependencies (hoisted)"
pnpm install --frozen-lockfile --config.node-linker=hoisted
echo "==> Building the web app"
pnpm --filter @opencanvas/web build

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
APP="$STAGE/opencanvas"
WEB="$ROOT/apps/web"

echo "==> Assembling the bundle"
mkdir -p "$APP"
cp -R "$WEB/.next/standalone/." "$APP/"
mkdir -p "$APP/apps/web/.next"
cp -R "$WEB/.next/static" "$APP/apps/web/.next/static"
cp -R "$WEB/public" "$APP/apps/web/public"
rm -rf "$APP/node_modules/sharp" "$APP/node_modules/@img"
mkdir -p "$APP/bin"
cp "$ROOT/packaging/opencanvas" "$APP/bin/opencanvas"
cp "$ROOT/packaging/opencanvas.ps1" "$APP/bin/opencanvas.ps1"
chmod +x "$APP/bin/opencanvas"
printf '%s\n' "$VERSION" > "$APP/VERSION"

if [ -n "$(find "$APP" -type l -print -quit)" ]; then
  echo "error: the bundle contains symbolic links; install with --config.node-linker=hoisted" >&2
  find "$APP" -type l | head >&2
  exit 1
fi
if [ ! -f "$APP/apps/web/server.js" ]; then
  echo "error: apps/web/server.js is missing from the standalone build" >&2
  exit 1
fi

tar -czf "$OUT/opencanvas.tar.gz" -C "$STAGE" opencanvas
(cd "$OUT" && { sha256sum opencanvas.tar.gz 2>/dev/null || shasum -a 256 opencanvas.tar.gz; } > opencanvas.tar.gz.sha256)
echo "==> $OUT/opencanvas.tar.gz ($(du -h "$OUT/opencanvas.tar.gz" | cut -f1), version $VERSION)"
