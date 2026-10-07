"""
A local S3 server for the cloud sync tests (moto), with real authentication.

    python3 scripts/s3-test-server.py [port]

Starts moto on 127.0.0.1:<port> (default 5005) with IAM checks on: requests
must be signed with the keys printed below, as with Cloudflare R2 or Amazon
S3. Creates the bucket "opencanvas-test" and prints one JSON line:

    {"endpoint": "...", "bucket": "...", "accessKeyId": "...", "secretAccessKey": "..."}

Needs: pip install "moto[server]"
"""

import json
import os
import sys
import threading
import time

# Bootstrapping (user, key, policy, bucket) runs before authentication starts.
os.environ.setdefault("INITIAL_NO_AUTH_ACTION_COUNT", "4")

from urllib.parse import parse_qsl, quote  # noqa: E402

import boto3  # noqa: E402
from moto.iam import access_control  # noqa: E402
from moto.server import ThreadedMotoServer  # noqa: E402

# moto checks signatures against a decoded query string ("prefix=a/b/"), so
# any listing with "/" in the prefix fails, even from boto3. Re-encode it as
# SigV4 requires ("prefix=a%2Fb%2F") before checking.
_create = access_control.IAMRequestBase._create_aws_request


def _create_encoded(self):
    if "?" in self._path:
        base, query = self._path.split("?", 1)
        pairs = parse_qsl(query, keep_blank_values=True)
        self._path = base + "?" + "&".join(f"{quote(k, safe='-_.~')}={quote(v, safe='-_.~')}" for k, v in pairs)
    return _create(self)


access_control.IAMRequestBase._create_aws_request = _create_encoded

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5005
endpoint = f"http://127.0.0.1:{port}"
server = ThreadedMotoServer(ip_address="127.0.0.1", port=port)
server.start()
time.sleep(0.5)

boot = dict(endpoint_url=endpoint, region_name="us-east-1", aws_access_key_id="boot", aws_secret_access_key="boot")
iam = boto3.client("iam", **boot)
iam.create_user(UserName="opencanvas")
key = iam.create_access_key(UserName="opencanvas")["AccessKey"]
iam.put_user_policy(
    UserName="opencanvas",
    PolicyName="all",
    PolicyDocument=json.dumps(
        {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": "*", "Resource": "*"}]}
    ),
)
boto3.client("s3", **boot).create_bucket(Bucket="opencanvas-test")

info = {
    "endpoint": endpoint,
    "bucket": "opencanvas-test",
    "accessKeyId": key["AccessKeyId"],
    "secretAccessKey": key["SecretAccessKey"],
}
# Also written to a file when S3_TEST_OUT is set (for test runners).
if os.environ.get("S3_TEST_OUT"):
    with open(os.environ["S3_TEST_OUT"], "w") as f:
        json.dump(info, f)
print(json.dumps(info), flush=True)
threading.Event().wait()
