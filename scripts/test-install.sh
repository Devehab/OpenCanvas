#!/usr/bin/env bash
#
# Installs OpenCanvas the way a person would, then checks every command.
# Used by .github/workflows/install-test.yml on fresh machines.
#
#   scripts/test-install.sh path/to/opencanvas.tar.gz   test this bundle with ./install.sh
#   scripts/test-install.sh published                   the real one-liner, from GitHub

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."

export OPENCANVAS_NO_OPEN=1
FAILED=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
check() { # check "description" command...
  local what="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}

install() {
  if [ "${1:-}" = published ]; then
    echo "\$ curl -fsSL https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.sh | bash"
    curl -fsSL https://raw.githubusercontent.com/Devehab/OpenCanvas/HEAD/install.sh | bash
  else
    echo "\$ cat install.sh | OPENCANVAS_BUNDLE=$1 bash"
    OPENCANVAS_BUNDLE="$1" bash < install.sh
  fi
}

echo "──────── $(uname -sm) ────────"
for tool in bash curl tar gzip node; do
  printf '  %-5s %s\n' "$tool" "$(command -v "$tool" 2>/dev/null || echo '(absent)')"
done

install "${1:?bundle path or "published"}"
check "the installer succeeds" test $? -eq 0
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"

# shellcheck disable=SC1091
. "$HOME/.opencanvas/config.env" 2>/dev/null
PORT="${PORT:-4790}"
up() { curl -fsS --max-time 3 "http://127.0.0.1:$PORT/api/health" | grep -q opencanvas-web; }
down() { ! up; }
autostart() {
  [ -f "$HOME/Library/LaunchAgents/org.opencanvas.server.plist" ] ||
    [ -f "$HOME/.config/systemd/user/opencanvas.service" ] ||
    [ -f "$HOME/.config/autostart/opencanvas.desktop" ] ||
    crontab -l 2>/dev/null | grep -q 'opencanvas autostart'
}

check "the opencanvas command is on the PATH" command -v opencanvas
check "the port is $PORT, not 3000" test "$PORT" != 3000
check "the server answers" up
check "the editor page loads" curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1:$PORT/"
check "opencanvas status says running" opencanvas status
echo "  runs as: ${SERVICE:-?} ($(grep '^SERVICE=' "$HOME/.opencanvas/config.env" | cut -d= -f2))"
if autostart; then pass "it is set to start with the computer"; else echo "INFO  no autostart on this system"; fi

opencanvas stop
check "opencanvas stop stops it" down
check "opencanvas status says stopped" sh -c '! opencanvas status'
if autostart; then fail "stop also turns off starting with the computer"; else pass "stop also turns off starting with the computer"; fi

opencanvas start
check "opencanvas start starts it again" up
opencanvas restart
check "opencanvas restart" up

# Installing again (what `opencanvas update` does) keeps the port and the server.
install "$1" >/dev/null 2>&1
check "installing again keeps the port" grep -q "^PORT=$PORT\$" "$HOME/.opencanvas/config.env"
check "the server is back after installing again" up

opencanvas uninstall -y
check "opencanvas uninstall stops it" down
check "opencanvas uninstall removes the folder" test ! -e "$HOME/.opencanvas"
check "opencanvas uninstall removes the command" sh -c '! command -v opencanvas'

echo
if [ "$FAILED" = 0 ]; then echo "ALL PASSED"; else echo "SOME CHECKS FAILED"; fi
exit "$FAILED"
