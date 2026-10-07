#!/usr/bin/env bash
#
# The installer's storage question against a real S3 server (moto):
# wrong keys fall back to "this computer only", right keys connect, and a
# reinstall finds the library left in the bucket.
#
#   scripts/test-install-cloud.sh path/to/opencanvas.tar.gz
#
# Needs: pip install "moto[server]" (and python3 on the PATH).

set -u
cd "$(dirname "${BASH_SOURCE[0]}")/.."
BUNDLE="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
export OPENCANVAS_NO_OPEN=1 OPENCANVAS_BUNDLE="$BUNDLE"
export PATH="$HOME/.local/bin:/usr/local/bin:$PATH"
FAILED=0
pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILED=1; }
check() {
  local what="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}

WORK="$(mktemp -d)"
export S3_TEST_OUT="$WORK/s3.json"
"${PYTHON:-python3}" scripts/s3-test-server.py 5077 >"$WORK/s3.log" 2>&1 &
S3_PID=$!
trap 'kill $S3_PID 2>/dev/null; rm -rf "$WORK"' EXIT
for _ in $(seq 1 60); do [ -s "$S3_TEST_OUT" ] && break; sleep 0.5; done
read -r ENDPOINT BUCKET KEY SECRET < <("${PYTHON:-python3}" -c "import json,sys;d=json.load(open(sys.argv[1]));print(d['endpoint'],d['bucket'],d['accessKeyId'],d['secretAccessKey'])" "$S3_TEST_OUT")
export OPENCANVAS_STORAGE=custom OPENCANVAS_S3_ENDPOINT="$ENDPOINT" OPENCANVAS_S3_BUCKET="$BUCKET" OPENCANVAS_S3_ACCESS_KEY_ID="$KEY"

echo "──────── wrong secret key ────────"
OPENCANVAS_S3_SECRET_ACCESS_KEY="wrong-wrong-wrong-wrong-wrong" bash install.sh >"$WORK/1.log" 2>&1
check "the install still succeeds" test $? -eq 0
grep -E 'Checking|✗|keeps everything' "$WORK/1.log"
check "it explains the key is wrong" grep -q 'secret access key does not match' "$WORK/1.log"
check "it keeps everything on this computer" grep -q '"enabled": false' "$HOME/.opencanvas/cloud.json"
check "opencanvas cloud status says so" sh -c 'opencanvas cloud status | grep -q "this computer only"'

echo "──────── right keys with opencanvas cloud ────────"
OPENCANVAS_S3_SECRET_ACCESS_KEY="$SECRET" opencanvas cloud >"$WORK/2.log" 2>&1
check "it connects" grep -q 'connected' "$WORK/2.log"
check "a new library is created" grep -q 'no OpenCanvas library yet' "$WORK/2.log"
check "the keys file is private" sh -c "ls -l '$HOME/.opencanvas/cloud.json' | grep -q '^-rw-------'"
check "the setup token is gone" test ! -e "$HOME/.opencanvas/.setup-token"
check "opencanvas cloud status shows the bucket" sh -c "opencanvas cloud status | grep -q '$BUCKET'"
# shellcheck disable=SC1091
. "$HOME/.opencanvas/config.env"
status="$(curl -fsS -H 'x-opencanvas-sync: 1' "http://127.0.0.1:$PORT/api/cloud/status")"
echo "  $status"
check "the app sees the cloud, online" sh -c "echo '$status' | grep -q '\"online\":true'"
check "the app never shows the secret" sh -c "! echo '$status' | grep -q '$SECRET'"

echo "──────── reinstall finds the library ────────"
# A design left in the bucket by the previous install.
"${PYTHON:-python3}" - "$S3_TEST_OUT" <<'EOF'
import json, sys, boto3
d = json.load(open(sys.argv[1]))
s3 = boto3.client("s3", endpoint_url=d["endpoint"], region_name="us-east-1",
                  aws_access_key_id=d["accessKeyId"], aws_secret_access_key=d["secretAccessKey"])
doc = {"v": 1, "store": "designs", "key": "d1", "deleted": False, "updatedAt": 1, "device": "x", "fp": "f",
       "value": {"id": "d1", "title": "Before", "pad": "x" * 1000}}
s3.put_object(Bucket=d["bucket"], Key="opencanvas/records/designs/d1.json", Body=json.dumps(doc).encode())
EOF
opencanvas uninstall -y >"$WORK/3.log" 2>&1
check "uninstall reminds the work is in the bucket" grep -q 'also in your cloud bucket' "$WORK/3.log"
OPENCANVAS_S3_SECRET_ACCESS_KEY="$SECRET" bash install.sh >"$WORK/4.log" 2>&1
grep -E 'Found|library' "$WORK/4.log"
check "the installer finds the library from before" grep -q 'Found your OpenCanvas library from before' "$WORK/4.log"
check "and counts its designs" grep -q '1 designs' "$WORK/4.log"
opencanvas uninstall -y >/dev/null 2>&1

echo
if [ "$FAILED" = 0 ]; then echo "ALL PASSED"; else echo "SOME CHECKS FAILED"; fi
exit "$FAILED"
