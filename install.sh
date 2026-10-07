#!/usr/bin/env bash
#
# OpenCanvas installer for macOS and Linux
#
#   curl -fsSL https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.sh | bash
#
# Nothing needs to be installed first: the script downloads its own copy of
# Node.js and the ready-built app, starts it in the background on port 4790,
# and makes it start with the computer. Manage it with the `opencanvas`
# command (opencanvas stop, opencanvas start, opencanvas uninstall…).
#
# Environment variables:
#   OPENCANVAS_PORT      port to use the first time (default 4790, or the next free one)
#   OPENCANVAS_HOME      install folder (default ~/.opencanvas)
#   OPENCANVAS_VERSION   release tag to install, e.g. v0.1.0 (default: latest)
#   OPENCANVAS_NO_OPEN   set to 1 to not open the browser at the end
#   OPENCANVAS_BUNDLE    path or URL of an opencanvas.tar.gz to install instead of a release
#   OPENCANVAS_STORAGE   local | r2 | s3 | custom: answer the storage question without asking
#                        (with OPENCANVAS_S3_ACCOUNT_ID, _REGION, _ENDPOINT, _BUCKET,
#                        _ACCESS_KEY_ID, _SECRET_ACCESS_KEY)

set -euo pipefail

REPO="${OPENCANVAS_REPO:-Devehab/OpenCanvas}"
VERSION="${OPENCANVAS_VERSION:-latest}"
OC_HOME="${OPENCANVAS_HOME:-$HOME/.opencanvas}"
DEFAULT_PORT=4790
NODE_MAJOR=22

if [ -t 1 ]; then
  green() { printf '\033[32m%s\033[0m\n' "$*"; }
  red() { printf '\033[31m%s\033[0m\n' "$*"; }
  bold() { printf '\033[1m%s\033[0m\n' "$*"; }
else
  green() { printf '%s\n' "$*"; }
  red() { printf '%s\n' "$*"; }
  bold() { printf '%s\n' "$*"; }
fi
step() { printf '\n'; bold "==> $*"; }
die() { red "error: $*" >&2; exit 1; }

# Global so the EXIT trap still sees it after main() returns.
TMP=""
cleanup() { [ -n "${TMP:-}" ] && rm -rf "$TMP"; return 0; }
trap cleanup EXIT

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

check_sha256() { # check_sha256 file expected
  local actual
  actual="$(sha256_of "$1")"
  if [ -z "$actual" ]; then
    echo "  (no sha256 tool found; skipping the checksum)"
  elif [ "$actual" != "$2" ]; then
    die "the download of $(basename "$1") is damaged (checksum mismatch). Please try again."
  fi
}

port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

node_ok() { # node_ok /path/to/node → new enough?
  [ -x "$1" ] || return 1
  "$1" -e "process.exit(Number(process.versions.node.split('.')[0]) >= $NODE_MAJOR ? 0 : 1)" 2>/dev/null
}

is_musl() {
  [ -f /etc/alpine-release ] && return 0
  ldd --version 2>&1 | grep -qi musl
}

install_node() {
  local os="$1" arch="$2" sys
  if [ "$os" = linux ] && is_musl; then
    # nodejs.org has no builds for musl systems (Alpine); use the system's.
    sys="$(command -v node || true)"
    if ! node_ok "${sys:-/nonexistent}" && [ "$(id -u)" = 0 ] && command -v apk >/dev/null 2>&1; then
      echo "  Installing Node.js with apk"
      apk add --no-cache nodejs >/dev/null
      sys="$(command -v node || true)"
    fi
    node_ok "${sys:-/nonexistent}" || die "this system needs Node.js $NODE_MAJOR or newer: apk add nodejs"
    NODE_BIN="$sys"
    echo "  Using $("$NODE_BIN" --version) from $NODE_BIN"
    return
  fi

  local base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x" sums name version
  if ! sums="$(curl -fsSL "$base/SHASUMS256.txt")"; then
    sys="$(command -v node || true)"
    node_ok "${sys:-/nonexistent}" || die "could not reach nodejs.org to download Node.js"
    NODE_BIN="$sys"
    echo "  nodejs.org is unreachable; using $("$NODE_BIN" --version) from $NODE_BIN"
    return
  fi
  name="$(printf '%s\n' "$sums" | awk '{print $2}' | grep -E "^node-v[0-9.]+-$os-$arch\.tar\.gz$" | head -n 1)"
  [ -n "$name" ] || die "Node.js is not available for $os-$arch"
  version="${name#node-}"
  version="${version%%-*}"

  NODE_BIN="$OC_HOME/node/bin/node"
  if [ -x "$NODE_BIN" ] && [ "$("$NODE_BIN" --version 2>/dev/null)" = "$version" ]; then
    echo "  Node.js $version is already installed"
    return
  fi
  echo "  Downloading Node.js $version"
  curl -fL --progress-bar -o "$TMP/$name" "$base/$name" || die "could not download Node.js"
  check_sha256 "$TMP/$name" "$(printf '%s\n' "$sums" | awk -v n="$name" '$2 == n {print $1}')"
  mkdir -p "$TMP/node"
  tar -xzf "$TMP/$name" -C "$TMP/node"
  rm -rf "$OC_HOME/node"
  mv "$TMP/node/${name%.tar.gz}" "$OC_HOME/node"
  node_ok "$NODE_BIN" || die "the downloaded Node.js does not run on this computer"
}

download_app() {
  local source="${OPENCANVAS_BUNDLE:-}" file="$TMP/opencanvas.tar.gz" sums=""
  if [ -n "$source" ] && [ -f "$source" ]; then
    cp "$source" "$file"
    [ -f "$source.sha256" ] && sums="$(cut -d' ' -f1 < "$source.sha256")"
  else
    if [ -z "$source" ]; then
      if [ "$VERSION" = latest ]; then
        source="https://github.com/$REPO/releases/latest/download/opencanvas.tar.gz"
      else
        source="https://github.com/$REPO/releases/download/$VERSION/opencanvas.tar.gz"
      fi
    fi
    if ! curl -fL --progress-bar -o "$file" "$source"; then
      if [ -z "${OPENCANVAS_BUNDLE:-}" ] &&
        [ "$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=1" 2>/dev/null | tr -d ' \n\r\t')" = "[]" ]; then
        die "no version of OpenCanvas has been published yet, so there is nothing to download.
       The maintainer publishes one from GitHub: Actions → Release → Run workflow.
       Try again in a few minutes: https://github.com/$REPO/releases"
      fi
      die "could not download $source
       Check your internet connection and try again. Releases: https://github.com/$REPO/releases"
    fi
    sums="$(curl -fsSL "$source.sha256" 2>/dev/null | cut -d' ' -f1 || true)"
  fi
  if [ -n "$sums" ]; then check_sha256 "$file" "$sums"; fi
  mkdir -p "$TMP/app"
  tar -xzf "$file" -C "$TMP/app" || die "the downloaded app is damaged. Please try again."
  [ -f "$TMP/app/opencanvas/apps/web/server.js" ] || die "the downloaded app is incomplete"
}

choose_port() {
  if [ -n "${OPENCANVAS_PORT:-}" ]; then
    PORT="$OPENCANVAS_PORT"
  elif [ -n "${PORT:-}" ]; then
    return # keep the port of the existing install: designs are saved per address
  else
    PORT="$DEFAULT_PORT"
    while port_busy "$PORT"; do
      PORT=$((PORT + 1))
      [ "$PORT" -lt $((DEFAULT_PORT + 100)) ] || die "no free port between $DEFAULT_PORT and $PORT"
    done
  fi
  case "$PORT" in '' | *[!0-9]*) die "OPENCANVAS_PORT must be a number" ;; esac
}

install_command() {
  local dir
  if [ -d /usr/local/bin ] && [ -w /usr/local/bin ]; then
    dir=/usr/local/bin
  else
    dir="$HOME/.local/bin"
    mkdir -p "$dir"
  fi
  BIN_LINK="$dir/opencanvas"
  cat > "$BIN_LINK" <<EOF
#!/bin/sh
# The opencanvas command, installed by the OpenCanvas installer.
OPENCANVAS_HOME='$OC_HOME'
export OPENCANVAS_HOME
exec "\$OPENCANVAS_HOME/app/bin/opencanvas" "\$@"
EOF
  chmod +x "$BIN_LINK"

  case ":$PATH:" in *":$dir:"*) return ;; esac
  local line="export PATH=\"$dir:\$PATH\" # Added by OpenCanvas"
  local rcs="$HOME/.profile"
  case "${SHELL:-}" in
    */zsh) rcs="$rcs $HOME/.zshrc" ;;
    */bash) rcs="$rcs $HOME/.bashrc" ;;
  esac
  for rc in $rcs; do
    grep -q '# Added by OpenCanvas' "$rc" 2>/dev/null || printf '\n%s\n' "$line" >> "$rc"
  done
  PATH_CHANGED=1
}

main() {
  local os arch
  case "$(uname -s)" in
    Darwin) os=darwin ;;
    Linux) os=linux ;;
    MINGW* | MSYS* | CYGWIN*)
      die "on Windows, open PowerShell and run:
  irm https://raw.githubusercontent.com/$REPO/HEAD/install.ps1 | iex" ;;
    *) die "OpenCanvas does not support $(uname -s) yet" ;;
  esac
  case "$(uname -m)" in
    x86_64 | amd64) arch=x64 ;;
    arm64 | aarch64) arch=arm64 ;;
    armv7l) arch=armv7l ;;
    *) die "OpenCanvas does not support $(uname -m) processors yet" ;;
  esac
  for tool in curl tar gzip; do
    command -v "$tool" >/dev/null 2>&1 || die "$tool is needed to install OpenCanvas"
  done

  bold "Installing OpenCanvas into $OC_HOME"
  mkdir -p "$OC_HOME/logs"
  TMP="$(mktemp -d)"

  PORT="" NODE_BIN="" SERVICE="" BIN_LINK="" PATH_CHANGED=0
  # shellcheck disable=SC1091
  [ -f "$OC_HOME/config.env" ] && . "$OC_HOME/config.env"
  choose_port

  step "Node.js"
  install_node "$os" "$arch"

  step "OpenCanvas"
  download_app
  echo "  Version $(cat "$TMP/app/opencanvas/VERSION" 2>/dev/null || echo unknown)"

  # Replace the previous version, if any (stopping it first).
  if [ -x "$OC_HOME/app/bin/opencanvas" ]; then
    OPENCANVAS_HOME="$OC_HOME" "$OC_HOME/app/bin/opencanvas" stop --quiet >/dev/null 2>&1 || true
  fi
  rm -rf "$OC_HOME/app.old"
  [ -d "$OC_HOME/app" ] && mv "$OC_HOME/app" "$OC_HOME/app.old"
  mv "$TMP/app/opencanvas" "$OC_HOME/app"
  rm -rf "$OC_HOME/app.old"

  install_command
  {
    printf 'PORT=%q\n' "$PORT"
    printf 'NODE_BIN=%q\n' "$NODE_BIN"
    printf 'SERVICE=%q\n' ""
    printf 'BIN_LINK=%q\n' "$BIN_LINK"
    printf 'REPO=%q\n' "$REPO"
  } > "$OC_HOME/config.env"

  step "Starting OpenCanvas on port $PORT"
  OPENCANVAS_HOME="$OC_HOME" "$OC_HOME/app/bin/opencanvas" start

  # Where to keep the work: asked once (the answer is kept on updates).
  if [ -n "${OPENCANVAS_STORAGE:-}" ] || [ ! -f "$OC_HOME/cloud.json" ]; then
    step "Where to keep your work"
    OPENCANVAS_HOME="$OC_HOME" "$OC_HOME/app/bin/opencanvas" cloud setup ||
      printf '  Cloud storage was not set up. You can do it later with: opencanvas cloud\n'
  else
    OPENCANVAS_HOME="$OC_HOME" "$OC_HOME/app/bin/opencanvas" cloud status || true
  fi

  local url="http://localhost:$PORT"
  if [ "${OPENCANVAS_NO_OPEN:-0}" != 1 ]; then
    if [ "$os" = darwin ]; then
      open "$url" >/dev/null 2>&1 || true
    elif command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
      xdg-open "$url" >/dev/null 2>&1 &
    fi
  fi

  printf '\n'
  green "OpenCanvas is installed: $url"
  cat <<EOF

  opencanvas stop        stop it (it won't start with the computer)
  opencanvas start       start it again
  opencanvas status      is it running?
  opencanvas update      install the latest version
  opencanvas cloud       keep your work in your cloud too (R2 / S3)
  opencanvas uninstall   remove it
EOF
  if [ "$PATH_CHANGED" = 1 ]; then
    printf '\n  Open a new terminal window to use the opencanvas command.\n'
  fi
}

main "$@"
